use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::Serialize;
use ssh2::{Channel, Session};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::sync::mpsc::{channel as mpsc_channel, Sender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::store::{ConnectionConfig, Store};

// ---- 后端 → 前端事件 ----

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TermData {
    pub session_id: String,
    pub data: String, // base64 编码的终端字节流
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TermExit {
    pub session_id: String,
    pub code: i32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TermError {
    pub session_id: String,
    pub message: String,
}

// ---- 会话 ----

pub enum SessionKind {
    /// 真实 SSH 会话：channel 需加锁，读线程与 write/resize 并发访问。
    Ssh { channel: Mutex<Channel> },
    /// 本地演示（echo）会话：无需网络，用于无服务器时验证终端链路。
    Echo { tx: Sender<String> },
}

pub struct LiveSession {
    pub kind: SessionKind,
    pub thread: Option<JoinHandle<()>>,
}

#[derive(Default)]
pub struct SessionManager {
    pub sessions: Mutex<HashMap<String, Arc<Mutex<LiveSession>>>>,
}

const READ_BUF: usize = 32 * 1024;

fn emit(app: &AppHandle, event: &str, payload: impl Serialize + Clone) {
    let _ = app.emit(event, payload);
}

/// 打开本地 echo 演示会话：输入原样回显。
pub fn open_echo(app: AppHandle, mgr: &SessionManager) -> Result<String, String> {
    let sid = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = mpsc_channel::<String>();
    let app2 = app.clone();
    let sid2 = sid.clone();
    let handle = std::thread::spawn(move || {
        while let Ok(line) = rx.recv() {
            let _ = app2.emit(
                "term:data",
                TermData {
                    session_id: sid2.clone(),
                    data: line,
                },
            );
        }
        emit(&app2, "term:exit", TermExit { session_id: sid2, code: 0 });
    });
    mgr.sessions.lock().unwrap().insert(
        sid.clone(),
        Arc::new(Mutex::new(LiveSession {
            kind: SessionKind::Echo { tx },
            thread: Some(handle),
        })),
    );
    Ok(sid)
}

/// 建立真实 SSH 会话：TCP 连接 → 握手 → 认证 → PTY + shell → 后台读线程推送输出。
pub fn open(app: AppHandle, mgr: &SessionManager, store: &Store, conn: &ConnectionConfig) -> Result<String, String> {
    let tcp = TcpStream::connect((conn.host.as_str(), conn.port))
        .map_err(|e| format!("连接 {}:{} 失败: {}", conn.host, conn.port, e))?;
    tcp.set_nodelay(true).ok();
    // TCP keep-alive 驱动 keepAliveInterval 选项
    tcp.set_keepalive(Some(Duration::from_secs(conn.options.keep_alive_interval.max(10))))
        .map_err(|e| format!("设置 keep-alive 失败: {e}"))?;

    let mut session = Session::new().map_err(|e| format!("创建 SSH 会话失败: {e}"))?;
    session.set_tcp_stream(tcp);
    session.handshake().map_err(|e| format!("SSH 握手失败: {e}"))?;
    authenticate(&mut session, conn, store)?;
    if !session.authenticated() {
        return Err("认证未完成".into());
    }

    let mut channel = session
        .channel_session()
        .map_err(|e| format!("打开 channel 失败: {e}"))?;
    channel
        .request_pty(
            true,
            Some(&ssh2::Pty {
                term: Some("xterm-256color".into()),
                width: 120,
                height: 30,
                ..Default::default()
            }),
            None,
        )
        .map_err(|e| format!("请求 PTY 失败: {e}"))?;
    channel
        .shell()
        .map_err(|e| format!("启动远程 shell 失败: {e}"))?;

    let sid = uuid::Uuid::new_v4().to_string();
    let app2 = app.clone();
    let sid2 = sid.clone();
    let channel_shared = Arc::new(Mutex::new(channel));
    let channel_reader = channel_shared.clone();

    let handle = std::thread::spawn(move || {
        let mut buf = [0u8; READ_BUF];
        loop {
            let mut ch = match channel_reader.lock() {
                Ok(g) => g,
                Err(_) => break,
            };
            match ch.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    drop(ch);
                    emit(
                        &app2,
                        "term:data",
                        TermData {
                            session_id: sid2.clone(),
                            data: B64.encode(&buf[..n]),
                        },
                    );
                }
                Err(e) => {
                    drop(ch);
                    emit(
                        &app2,
                        "term:error",
                        TermError {
                            session_id: sid2.clone(),
                            message: format!("连接中断: {e}"),
                        },
                    );
                    break;
                }
            }
        }
        emit(&app2, "term:exit", TermExit { session_id: sid2, code: 0 });
    });

    mgr.sessions.lock().unwrap().insert(
        sid.clone(),
        Arc::new(Mutex::new(LiveSession {
            kind: SessionKind::Ssh {
                channel: channel_shared,
            },
            thread: Some(handle),
        })),
    );
    Ok(sid)
}

/// 只做连接 + 认证，立即断开，用于连接测试。
pub fn test(conn: &ConnectionConfig, store: &Store) -> Result<(), String> {
    let tcp = TcpStream::connect((conn.host.as_str(), conn.port))
        .map_err(|e| format!("连接 {}:{} 失败: {}", conn.host, conn.port, e))?;
    let mut session = Session::new().map_err(|e| format!("创建 SSH 会话失败: {e}"))?;
    session.set_tcp_stream(tcp);
    session.handshake().map_err(|e| format!("SSH 握手失败: {e}"))?;
    authenticate(&mut session, conn, store)?;
    if !session.authenticated() {
        return Err("认证未完成".into());
    }
    Ok(())
}

/// 按连接配置的认证方式完成认证。
fn authenticate(session: &mut Session, conn: &ConnectionConfig, store: &Store) -> Result<(), String> {
    match conn.auth.auth_type.as_str() {
        "password" => {
            let pass = store
                .load_secret(&conn.id)
                .map_err(|_| "未设置密码，请编辑连接并填写密码".to_string())?;
            session
                .userauth_password(&conn.username, &pass)
                .map_err(|e| format!("密码认证失败: {e}"))
        }
        "key" => {
            let raw = conn.auth.key_path.as_ref().ok_or("未指定私钥路径")?;
            let path = expand_tilde(raw);
            let passphrase = store.load_secret(&conn.id).ok();
            session
                .userauth_pubkey_file(&conn.username, None, Path::new(&path), passphrase.as_deref())
                .map_err(|e| format!("密钥认证失败: {e}"))
        }
        "agent" => {
            let mut agent = session.agent().map_err(|e| format!("初始化 ssh-agent 失败: {e}"))?;
            agent.connect().map_err(|e| format!("连接 ssh-agent 失败: {e}"))?;
            agent.list_identities().map_err(|e| format!("读取 agent 身份失败: {e}"))?;
            let identities = agent.identities().map_err(|e| format!("读取 agent 身份失败: {e}"))?;
            let identity = identities.first().ok_or("ssh-agent 中没有可用身份")?;
            agent
                .userauth(&conn.username, identity)
                .map_err(|e| format!("agent 认证失败: {e}"))
        }
        other => Err(format!("未知认证类型: {other}")),
    }
}

/// 前端 → 后端：写入终端输入（base64 字节）。
pub fn write_input(mgr: &SessionManager, sid: &str, data: &str) -> Result<(), String> {
    let decoded = B64.decode(data).map_err(|e| format!("解码输入失败: {e}"))?;
    let map = mgr.sessions.lock().unwrap();
    let ls = map.get(sid).ok_or("会话不存在")?;
    let ls = ls.lock().unwrap();
    match &ls.kind {
        SessionKind::Ssh { channel } => {
            let mut ch = channel.lock().unwrap();
            ch.write_all(&decoded).map_err(|e| format!("写入失败: {e}"))?;
            ch.flush().ok();
        }
        SessionKind::Echo { tx } => {
            tx.send(data.to_string()).map_err(|e| format!("写入失败: {e}"))?;
        }
    }
    Ok(())
}

/// 前端 → 后端：终端窗口尺寸变化。
pub fn resize(mgr: &SessionManager, sid: &str, cols: u32, rows: u32) -> Result<(), String> {
    let map = mgr.sessions.lock().unwrap();
    let ls = map.get(sid).ok_or("会话不存在")?;
    let ls = ls.lock().unwrap();
    if let SessionKind::Ssh { channel } = &ls.kind {
        let mut ch = channel.lock().unwrap();
        ch.window_change(rows, cols, 0, 0)
            .map_err(|e| format!("调整终端尺寸失败: {e}"))?;
    }
    Ok(())
}

/// 关闭会话：尽力发送 EOF/close，读线程随即退出；不做 join 以避免与阻塞读互相等待。
pub fn close_session(mgr: &SessionManager, sid: &str) -> Result<(), String> {
    let map = mgr.sessions.lock().unwrap();
    if let Some(ls) = map.get(sid) {
        let ls = ls.lock().unwrap();
        if let SessionKind::Ssh { channel } = &ls.kind {
            let mut ch = channel.lock().unwrap();
            ch.send_eof().ok();
            ch.close().ok();
        }
    }
    map.remove(sid);
    Ok(())
}

fn expand_tilde(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest).to_string_lossy().to_string();
        }
    }
    path.to_string()
}
