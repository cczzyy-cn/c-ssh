use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::Serialize;
use ssh2::{Channel, Session, Sftp};
use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::sync::mpsc::{channel as mpsc_channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use crate::logger;
use crate::store::{ConnectionConfig, PortForward, ProxyConfig, Store};

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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForwardStatus {
    pub session_id: String,
    pub name: String,
    pub listening: bool,
    pub message: String,
}

// ---- 会话 ----

pub enum SessionKind {
    /// 真实 SSH 会话。
    Ssh(SshSession),
    /// 本地演示（echo）会话：无需网络，用于无服务器时验证终端链路。
    Echo { tx: Sender<String> },
}

pub struct SshSession {
    /// 保留 Session 供端口转发 / SFTP 动态创建 channel。
    pub session: Arc<Mutex<Session>>,
    /// 终端 channel（读线程与 write/resize 并发访问）。
    pub channel: Arc<Mutex<Channel>>,
    /// SFTP 句柄（懒创建：首次使用时初始化）。
    pub sftp: Arc<Mutex<Option<Sftp>>>,
}

pub struct LiveSession {
    pub kind: SessionKind,
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
    std::thread::spawn(move || {
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
        })),
    );
    Ok(sid)
}

/// 建立真实 SSH 会话：TCP/代理连接 → 握手 → 认证 → PTY + shell → 后台读线程推送输出。
pub fn open(
    app: AppHandle,
    mgr: &SessionManager,
    store: &Store,
    conn: &ConnectionConfig,
) -> Result<String, String> {
    let tcp = connect_tcp(conn)?;
    tcp.set_nodelay(true).ok();

    let mut session = Session::new().map_err(|e| format!("创建 SSH 会话失败: {e}"))?;
    session.set_tcp_stream(tcp);
    session.handshake().map_err(|e| format!("SSH 握手失败: {e}"))?;
    // 应用层 keep-alive（libssh2），间隔来自连接配置
    session.set_keepalive(false, conn.options.keep_alive_interval.max(10) as u32);
    authenticate(&mut session, conn, store)?;
    if !session.authenticated() {
        return Err("认证未完成".into());
    }

    let mut channel = session
        .channel_session()
        .map_err(|e| format!("打开 channel 失败: {e}"))?;
    channel
        .request_pty("xterm-256color", None, Some((120, 30, 0, 0)))
        .map_err(|e| format!("请求 PTY 失败: {e}"))?;
    channel
        .shell()
        .map_err(|e| format!("启动远程 shell 失败: {e}"))?;
    // 切换为非阻塞模式：读线程轮询（WouldBlock 时释放锁），写方向可随时插入，避免读写互斥卡死
    session.set_blocking(false);

    let sid = uuid::Uuid::new_v4().to_string();
    let app2 = app.clone();
    let sid2 = sid.clone();
    let session_shared = Arc::new(Mutex::new(session));
    let channel_shared = Arc::new(Mutex::new(channel));
    let channel_reader = channel_shared.clone();
    let session_keepalive = session_shared.clone();
    let keepalive_interval = conn.options.keep_alive_interval.max(10);

    // 后台读线程：非阻塞轮询推送终端输出；空闲时定期发送 keepalive
    std::thread::spawn(move || {
        let mut buf = [0u8; READ_BUF];
        let mut last_keepalive = Instant::now();
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
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                    // 无数据可读：释放锁，让写方向可以插入
                    drop(ch);
                }
                Err(e) => {
                    drop(ch);
                    let msg = format!("{e}");
                    logger::error(&format!("[session:{sid2}] {msg}"));
                    emit(
                        &app2,
                        "term:error",
                        TermError {
                            session_id: sid2.clone(),
                            message: msg,
                        },
                    );
                    break;
                }
            }
            // 空闲时发送 keepalive（libssh2 需要主动调用才会发包）
            if last_keepalive.elapsed().as_secs() >= keepalive_interval {
                if let Ok(sess) = session_keepalive.try_lock() {
                    let _ = sess.keepalive_send();
                }
                last_keepalive = Instant::now();
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        emit(&app2, "term:exit", TermExit { session_id: sid2, code: 0 });
    });

    // 本地端口转发
    start_port_forwards(&app, &sid, &session_shared, &conn.options.port_forwards);

    mgr.sessions.lock().unwrap().insert(
        sid.clone(),
        Arc::new(Mutex::new(LiveSession {
            kind: SessionKind::Ssh(SshSession {
                session: session_shared,
                channel: channel_shared,
                sftp: Arc::new(Mutex::new(None)),
            }),
        })),
    );
    Ok(sid)
}

/// 只做连接 + 认证，立即断开，用于连接测试。
pub fn test(conn: &ConnectionConfig, store: &Store) -> Result<(), String> {
    let tcp = connect_tcp(conn)?;
    let mut session = Session::new().map_err(|e| format!("创建 SSH 会话失败: {e}"))?;
    session.set_tcp_stream(tcp);
    session.handshake().map_err(|e| format!("SSH 握手失败: {e}"))?;
    authenticate(&mut session, conn, store)?;
    if !session.authenticated() {
        return Err("认证未完成".into());
    }
    Ok(())
}

/// 建立 TCP 连接；若配置了代理则先走代理握手（SOCKS5 / HTTP CONNECT）。
fn connect_tcp(conn: &ConnectionConfig) -> Result<TcpStream, String> {
    match &conn.options.proxy {
        None => TcpStream::connect((conn.host.as_str(), conn.port))
            .map_err(|e| format!("连接 {}:{} 失败: {}", conn.host, conn.port, e)),
        Some(proxy) => {
            let stream = TcpStream::connect((proxy.host.as_str(), proxy.port))
                .map_err(|e| format!("连接代理 {}:{} 失败: {}", proxy.host, proxy.port, e))?;
            match proxy.proxy_type.as_str() {
                "socks5" => socks5_handshake(stream, proxy, &conn.host, conn.port),
                "http" => http_connect(stream, proxy, &conn.host, conn.port),
                other => Err(format!("未知代理类型: {other}")),
            }
        }
    }
}

/// SOCKS5 握手：无认证或用户名/密码认证，然后 CONNECT 目标。
fn socks5_handshake(
    mut stream: TcpStream,
    proxy: &ProxyConfig,
    host: &str,
    port: u16,
) -> Result<TcpStream, String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .ok();
    // greeting：支持 0x00（无认证）与 0x02（用户名/密码）
    let has_auth = proxy.username.is_some();
    let methods: &[u8] = if has_auth { &[0x02] } else { &[0x00] };
    stream
        .write_all(&[0x05, methods.len() as u8])
        .and_then(|_| stream.write_all(methods))
        .map_err(|e| format!("SOCKS5 握手失败: {e}"))?;
    let mut resp = [0u8; 2];
    stream
        .read_exact(&mut resp)
        .map_err(|e| format!("SOCKS5 握手失败: {e}"))?;
    if resp[0] != 0x05 {
        return Err("SOCKS5 版本不匹配".into());
    }
    match resp[1] {
        0x00 => {}
        0x02 => {
            let user = proxy.username.as_deref().unwrap_or("");
            let pass = proxy.password.as_deref().unwrap_or("");
            if user.len() > 255 || pass.len() > 255 {
                return Err("代理用户名/密码过长".into());
            }
            let mut buf = Vec::with_capacity(3 + user.len() + pass.len());
            buf.push(0x01);
            buf.push(user.len() as u8);
            buf.extend_from_slice(user.as_bytes());
            buf.push(pass.len() as u8);
            buf.extend_from_slice(pass.as_bytes());
            stream
                .write_all(&buf)
                .map_err(|e| format!("SOCKS5 认证失败: {e}"))?;
            let mut auth_resp = [0u8; 2];
            stream
                .read_exact(&mut auth_resp)
                .map_err(|e| format!("SOCKS5 认证失败: {e}"))?;
            if auth_resp[1] != 0x00 {
                return Err("SOCKS5 认证被拒绝".into());
            }
        }
        m => return Err(format!("SOCKS5 不支持的认证方式: {m}")),
    }
    // CONNECT 请求：域名解析走远端（ATYP=0x03）
    let host_bytes = host.as_bytes();
    let mut req = Vec::with_capacity(7 + host_bytes.len());
    req.push(0x05);
    req.push(0x01); // CONNECT
    req.push(0x00); // RSV
    req.push(0x03); // ATYP: domain
    req.push(host_bytes.len() as u8);
    req.extend_from_slice(host_bytes);
    req.extend_from_slice(&port.to_be_bytes());
    stream
        .write_all(&req)
        .map_err(|e| format!("SOCKS5 CONNECT 失败: {e}"))?;
    let mut head = [0u8; 4];
    stream
        .read_exact(&mut head)
        .map_err(|e| format!("SOCKS5 CONNECT 失败: {e}"))?;
    if head[1] != 0x00 {
        return Err(format!("SOCKS5 CONNECT 被拒绝 (code {})", head[1]));
    }
    let addr_len = match head[3] {
        0x01 => 4,
        0x04 => 16,
        0x03 => {
            let mut len = [0u8; 1];
            stream
                .read_exact(&mut len)
                .map_err(|e| format!("SOCKS5 响应读取失败: {e}"))?;
            len[0] as usize
        }
        _ => return Err("SOCKS5 未知地址类型".into()),
    };
    let mut rest = vec![0u8; addr_len + 2];
    stream
        .read_exact(&mut rest)
        .map_err(|e| format!("SOCKS5 响应读取失败: {e}"))?;
    stream.set_read_timeout(None).ok();
    Ok(stream)
}

/// HTTP CONNECT 隧道。
fn http_connect(
    mut stream: TcpStream,
    proxy: &ProxyConfig,
    host: &str,
    port: u16,
) -> Result<TcpStream, String> {
    use base64::Engine as _;
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .ok();
    let mut req = format!("CONNECT {host}:{port} HTTP/1.1\r\nHost: {host}:{port}\r\n");
    if let (Some(u), Some(p)) = (&proxy.username, &proxy.password) {
        let cred = B64.encode(format!("{u}:{p}"));
        req.push_str(&format!("Proxy-Authorization: Basic {cred}\r\n"));
    }
    req.push_str("\r\n");
    stream
        .write_all(req.as_bytes())
        .map_err(|e| format!("HTTP CONNECT 失败: {e}"))?;
    let mut buf = [0u8; 4096];
    let mut n = 0;
    loop {
        let read = stream
            .read(&mut buf[n..])
            .map_err(|e| format!("HTTP CONNECT 失败: {e}"))?;
        if read == 0 {
            return Err("HTTP 代理提前关闭连接".into());
        }
        n += read;
        let text = String::from_utf8_lossy(&buf[..n]);
        if let Some(end) = text.find("\r\n\r\n") {
            let status_line = text.lines().next().unwrap_or("");
            if !status_line.contains(" 200") {
                return Err(format!("HTTP CONNECT 被拒绝: {status_line}"));
            }
            let _ = end; // 剩余字节是目标流量，此处忽略（代理握手后不应有额外数据）
            break;
        }
        if n >= buf.len() {
            return Err("HTTP 代理响应过大".into());
        }
    }
    stream.set_read_timeout(None).ok();
    Ok(stream)
}

/// 按连接配置的认证方式完成认证。
fn authenticate(session: &mut Session, conn: &ConnectionConfig, store: &Store) -> Result<(), String> {
    match conn.auth.auth_type.as_str() {
        "password" => {
            let pass = store.load_secret(&conn.id).map_err(|e| {
                format!(
                    "读取密码失败（请重新编辑连接并填写密码）: {e}"
                )
            })?;
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
        SessionKind::Ssh(ssh) => {
            let mut remaining = decoded.as_slice();
            while !remaining.is_empty() {
                let mut ch = match ssh.channel.lock() {
                    Ok(g) => g,
                    Err(_) => return Err("会话锁已损坏".into()),
                };
                match ch.write(remaining) {
                    Ok(0) => return Err("写入 0 字节".into()),
                    Ok(n) => {
                        remaining = &remaining[n..];
                    }
                    Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                        // 发送窗口满：释放锁稍等重试，避免饿死读线程
                        drop(ch);
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    Err(e) => return Err(format!("写入失败: {e}")),
                }
            }
            if let Ok(mut ch) = ssh.channel.try_lock() {
                ch.flush().ok();
            }
            Ok(())
        }
        SessionKind::Echo { tx } => {
            tx.send(data.to_string()).map_err(|e| format!("写入失败: {e}"))?;
            Ok(())
        }
    }
}

/// 前端 → 后端：终端窗口尺寸变化。
pub fn resize(mgr: &SessionManager, sid: &str, cols: u32, rows: u32) -> Result<(), String> {
    let map = mgr.sessions.lock().unwrap();
    let ls = map.get(sid).ok_or("会话不存在")?;
    let ls = ls.lock().unwrap();
    if let SessionKind::Ssh(ssh) = &ls.kind {
        let mut ch = ssh.channel.lock().unwrap();
        // 非阻塞下可能 WouldBlock，忽略；前端 fit 会再次触发尺寸同步
        let _ = ch.request_pty_size(cols, rows, None, None);
    }
    Ok(())
}

/// 关闭会话：尽力发送 EOF/close，读线程随即退出；不做 join 以避免与阻塞读互相等待。
pub fn close_session(mgr: &SessionManager, sid: &str) -> Result<(), String> {
    let mut map = mgr.sessions.lock().unwrap();
    if let Some(ls) = map.get(sid) {
        let ls = ls.lock().unwrap();
        if let SessionKind::Ssh(ssh) = &ls.kind {
            let mut ch = ssh.channel.lock().unwrap();
            ch.send_eof().ok();
            ch.close().ok();
        }
    }
    map.remove(sid);
    Ok(())
}

// ---- 本地端口转发 ----

fn start_port_forwards(
    app: &AppHandle,
    sid: &str,
    session: &Arc<Mutex<Session>>,
    forwards: &[PortForward],
) {
    for f in forwards {
        let sess = session.clone();
        let app = app.clone();
        let sid = sid.to_string();
        let f = f.clone();
        std::thread::spawn(move || {
            let listener = match TcpListener::bind(("127.0.0.1", f.local_port)) {
                Ok(l) => l,
                Err(e) => {
                    logger::error(&format!("[forward:{}] 监听失败: {e}", f.name));
                    emit(
                        &app,
                        "forward:status",
                        ForwardStatus {
                            session_id: sid,
                            name: f.name,
                            listening: false,
                            message: format!("监听 127.0.0.1:{} 失败: {e}", f.local_port),
                        },
                    );
                    return;
                }
            };
            emit(
                &app,
                "forward:status",
                ForwardStatus {
                    session_id: sid.clone(),
                    name: f.name.clone(),
                    listening: true,
                    message: format!("127.0.0.1:{} → {}:{}", f.local_port, f.remote_host, f.remote_port),
                },
            );
            for incoming in listener.incoming() {
                let Ok(local) = incoming else { continue };
                let sess2 = sess.clone();
                let app2 = app.clone();
                let sid2 = sid.clone();
                let name = f.name.clone();
                let rh = f.remote_host.clone();
                let rp = f.remote_port;
                std::thread::spawn(move || {
                    // 建立到远程目标的隧道 channel
                    let lock = sess2.lock().unwrap();
                    let chan = match lock.channel_direct_tcpip(&rh, rp, None) {
                        Ok(c) => c,
                        Err(e) => {
                            drop(lock);
                            logger::error(&format!("[forward:{}] 隧道 {}:{} 失败: {e}", name, rh, rp));
                            emit(
                                &app2,
                                "forward:status",
                                ForwardStatus {
                                    session_id: sid2,
                                    name,
                                    listening: false,
                                    message: format!("隧道 {}:{} 失败: {e}", rh, rp),
                                },
                            );
                            return;
                        }
                    };
                    drop(lock);
                    // 双向转发：写方向在锁内瞬时完成；读方向持锁等待（SSH 隧道典型请求/响应场景可接受）
                    let chan_w = Arc::new(Mutex::new(chan));
                    let chan_r = chan_w.clone();
                    let mut local_w = match local.try_clone() {
                        Ok(c) => c,
                        Err(_) => return,
                    };
                    let mut local_r = local;
                    let _w = std::thread::spawn(move || {
                        let mut buf = [0u8; 16 * 1024];
                        loop {
                            let n = match local_w.read(&mut buf) {
                                Ok(0) => break,
                                Ok(n) => n,
                                Err(_) => break,
                            };
                            let mut ch = chan_w.lock().unwrap();
                            if ch.write_all(&buf[..n]).is_err() || ch.flush().is_err() {
                                break;
                            }
                        }
                        let mut ch = chan_w.lock().unwrap();
                        ch.send_eof().ok();
                    });
                    let _r = std::thread::spawn(move || {
                        let mut buf = [0u8; 16 * 1024];
                        loop {
                            let mut ch = chan_r.lock().unwrap();
                            match ch.read(&mut buf) {
                                Ok(0) => break,
                                Ok(n) => {
                                    drop(ch);
                                    if local_r.write_all(&buf[..n]).is_err() {
                                        break;
                                    }
                                }
                                Err(_) => break,
                            }
                        }
                    });
                });
            }
        });
    }
}

// ---- SFTP ----

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub mtime: u64,
}

fn get_sftp(mgr: &SessionManager, sid: &str) -> Result<Arc<Mutex<Option<Sftp>>>, String> {
    let map = mgr.sessions.lock().unwrap();
    let ls = map.get(sid).ok_or("会话不存在")?;
    let ls = ls.lock().unwrap();
    match &ls.kind {
        SessionKind::Ssh(ssh) => {
            let mut guard = ssh.sftp.lock().unwrap();
            if guard.is_none() {
                let sftp = ssh
                    .session
                    .lock()
                    .unwrap()
                    .sftp()
                    .map_err(|e| format!("初始化 SFTP 失败: {e}"))?;
                *guard = Some(sftp);
            }
            Ok(ssh.sftp.clone())
        }
        SessionKind::Echo { .. } => Err("演示会话不支持 SFTP".into()),
    }
}

fn with_sftp<T>(
    mgr: &SessionManager,
    sid: &str,
    f: impl FnOnce(&Sftp) -> Result<T, String>,
) -> Result<T, String> {
    let handle = get_sftp(mgr, sid)?;
    let guard = handle.lock().unwrap();
    let sftp = guard.as_ref().ok_or("SFTP 未初始化")?;
    f(sftp)
}

pub fn sftp_list(mgr: &SessionManager, sid: &str, path: &str) -> Result<Vec<SftpEntry>, String> {
    with_sftp(mgr, sid, |sftp| {
        let entries = sftp
            .readdir(Path::new(path))
            .map_err(|e| format!("读取目录失败: {e}"))?;
        let mut out = Vec::with_capacity(entries.len());
        for (p, stat) in entries {
            out.push(SftpEntry {
                name: p.to_string_lossy().to_string(),
                is_dir: stat.is_dir(),
                size: stat.size.unwrap_or(0),
                mtime: stat.mtime.unwrap_or(0),
            });
        }
        out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
        Ok(out)
    })
}

pub fn sftp_download(
    mgr: &SessionManager,
    sid: &str,
    remote_path: &str,
    local_path: &str,
) -> Result<(), String> {
    with_sftp(mgr, sid, |sftp| {
        let mut remote = sftp
            .open(Path::new(remote_path))
            .map_err(|e| format!("打开远程文件失败: {e}"))?;
        let mut buf = Vec::new();
        remote
            .read_to_end(&mut buf)
            .map_err(|e| format!("读取远程文件失败: {e}"))?;
        std::fs::write(local_path, buf).map_err(|e| format!("写入本地文件失败: {e}"))
    })
}

pub fn sftp_upload(
    mgr: &SessionManager,
    sid: &str,
    local_path: &str,
    remote_path: &str,
) -> Result<(), String> {
    let data = std::fs::read(local_path).map_err(|e| format!("读取本地文件失败: {e}"))?;
    with_sftp(mgr, sid, |sftp| {
        let mut remote = sftp
            .create(Path::new(remote_path))
            .map_err(|e| format!("创建远程文件失败: {e}"))?;
        remote
            .write_all(&data)
            .map_err(|e| format!("写入远程文件失败: {e}"))?;
        remote.close().map_err(|e| format!("关闭远程文件失败: {e}"))
    })
}

pub fn sftp_mkdir(mgr: &SessionManager, sid: &str, path: &str) -> Result<(), String> {
    with_sftp(mgr, sid, |sftp| {
        sftp.mkdir(Path::new(path), 0o755)
            .map_err(|e| format!("创建目录失败: {e}"))
    })
}

pub fn sftp_delete(mgr: &SessionManager, sid: &str, path: &str, is_dir: bool) -> Result<(), String> {
    with_sftp(mgr, sid, |sftp| {
        if is_dir {
            sftp.rmdir(Path::new(path)).map_err(|e| format!("删除目录失败: {e}"))
        } else {
            sftp.unlink(Path::new(path)).map_err(|e| format!("删除文件失败: {e}"))
        }
    })
}

fn expand_tilde(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest).to_string_lossy().to_string();
        }
    }
    path.to_string()
}
