use std::collections::HashSet;
use std::fs;
use tauri::{AppHandle, Manager, State};

use crate::logger;
use crate::ssh::{self, SessionManager};
use crate::store::{ConnectionConfig, Store};

/// 统一记录命令失败到全局错误日志（日志不包含密码/密钥内容）。
fn log_err<T>(cmd: &str, r: Result<T, String>) -> Result<T, String> {
    if let Err(e) = &r {
        logger::error(&format!("[cmd:{cmd}] {e}"));
    }
    r
}

/// 在阻塞线程池执行可能耗时的操作（网络/锁等待），避免卡住主线程与其它窗口。
async fn run_blocking<T, F>(cmd: &str, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let r = tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("任务执行失败: {e}"))?;
    log_err(cmd, r)
}

// ---- 连接配置（快速文件操作，保持同步） ----

#[tauri::command]
pub fn list_connections(store: State<'_, Store>) -> Result<Vec<ConnectionConfig>, String> {
    log_err("list_connections", Ok(store.load_connections()))
}

#[tauri::command]
pub fn save_connection(
    store: State<'_, Store>,
    conn: ConnectionConfig,
) -> Result<ConnectionConfig, String> {
    log_err("save_connection", store.upsert_connection(conn))
}

#[tauri::command]
pub fn delete_connection(store: State<'_, Store>, id: String) -> Result<(), String> {
    store.delete_secret(&id);
    log_err("delete_connection", store.delete_connection(&id))
}

/// 保存/更新凭据到 OS keyring；secret 为空或 None 时删除。
#[tauri::command]
pub fn set_secret(
    store: State<'_, Store>,
    id: String,
    secret: Option<String>,
) -> Result<(), String> {
    // 注意：此处不记录 secret 内容，仅记录失败信息
    match secret {
        Some(s) if !s.is_empty() => log_err("set_secret", store.set_secret(&id, &s)),
        _ => {
            store.delete_secret(&id);
            Ok(())
        }
    }
}

/// 导出全部连接配置为 JSON（不含凭据，凭据在 OS keyring）。
#[tauri::command]
pub fn export_connections(store: State<'_, Store>, path: String) -> Result<(), String> {
    let r = (|| -> Result<(), String> {
        let json = serde_json::to_string_pretty(&store.load_connections())
            .map_err(|e| format!("序列化失败: {e}"))?;
        fs::write(&path, json).map_err(|e| format!("写入文件失败: {e}"))
    })();
    log_err("export_connections", r)
}

/// 从 JSON 导入连接配置，与现有配置合并；id 冲突或为空时重新生成。
#[tauri::command]
pub fn import_connections(store: State<'_, Store>, path: String) -> Result<usize, String> {
    let r = (|| -> Result<usize, String> {
        let s = fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {e}"))?;
        let imported: Vec<ConnectionConfig> =
            serde_json::from_str(&s).map_err(|e| format!("JSON 解析失败: {e}"))?;
        let mut all = store.load_connections();
        let existing: HashSet<String> = all.iter().map(|c| c.id.clone()).collect();
        let mut count = 0;
        for mut c in imported {
            if c.id.is_empty() || existing.contains(&c.id) {
                c.id = uuid::Uuid::new_v4().to_string();
            }
            all.push(c);
            count += 1;
        }
        store.save_connections(&all)?;
        Ok(count)
    })();
    log_err("import_connections", r)
}

// ---- 会话（网络/锁操作，异步执行避免阻塞 UI） ----

#[tauri::command]
pub async fn test_connection(app: AppHandle, id: String) -> Result<(), String> {
    let conn = app.state::<Store>().get_connection(&id).ok_or("连接不存在")?;
    let handle = app.clone();
    run_blocking("test_connection", move || {
        let store = handle.state::<Store>();
        ssh::test(&conn, &store)
    })
    .await
}

#[tauri::command]
pub async fn open_session(app: AppHandle, conn_id: String) -> Result<String, String> {
    let conn = app.state::<Store>().get_connection(&conn_id).ok_or("连接不存在")?;
    let handle = app.clone();
    run_blocking("open_session", move || {
        let store = handle.state::<Store>();
        let mgr = handle.state::<SessionManager>();
        ssh::open(handle.clone(), &mgr, &store, &conn)
    })
    .await
}

#[tauri::command]
pub async fn open_echo_session(app: AppHandle) -> Result<String, String> {
    let handle = app.clone();
    run_blocking("open_echo_session", move || {
        let mgr = handle.state::<SessionManager>();
        ssh::open_echo(handle.clone(), &mgr)
    })
    .await
}

#[tauri::command]
pub async fn open_local_shell(app: AppHandle) -> Result<String, String> {
    let handle = app.clone();
    run_blocking("open_local_shell", move || {
        let mgr = handle.state::<SessionManager>();
        ssh::open_local_shell(handle.clone(), &mgr)
    })
    .await
}

#[tauri::command]
pub async fn write_input(app: AppHandle, session_id: String, data: String) -> Result<(), String> {
    let handle = app.clone();
    run_blocking("write_input", move || {
        let mgr = handle.state::<SessionManager>();
        ssh::write_input(&mgr, &session_id, &data)
    })
    .await
}

#[tauri::command]
pub async fn resize(app: AppHandle, session_id: String, cols: u32, rows: u32) -> Result<(), String> {
    let handle = app.clone();
    run_blocking("resize", move || {
        let mgr = handle.state::<SessionManager>();
        ssh::resize(&mgr, &session_id, cols, rows)
    })
    .await
}

#[tauri::command]
pub async fn close_session(app: AppHandle, session_id: String) -> Result<(), String> {
    let handle = app.clone();
    run_blocking("close_session", move || {
        let mgr = handle.state::<SessionManager>();
        ssh::close_session(&mgr, &session_id)
    })
    .await
}

// ---- SFTP（网络操作，异步执行） ----

#[tauri::command]
pub async fn sftp_list(
    app: AppHandle,
    session_id: String,
    path: String,
) -> Result<Vec<ssh::SftpEntry>, String> {
    let handle = app.clone();
    run_blocking("sftp_list", move || {
        let mgr = handle.state::<SessionManager>();
        ssh::sftp_list(&mgr, &session_id, &path)
    })
    .await
}

#[tauri::command]
pub async fn sftp_download(
    app: AppHandle,
    session_id: String,
    remote_path: String,
    local_path: String,
) -> Result<(), String> {
    let handle = app.clone();
    run_blocking("sftp_download", move || {
        let mgr = handle.state::<SessionManager>();
        ssh::sftp_download(&mgr, &session_id, &remote_path, &local_path)
    })
    .await
}

#[tauri::command]
pub async fn sftp_upload(
    app: AppHandle,
    session_id: String,
    local_path: String,
    remote_path: String,
) -> Result<(), String> {
    let handle = app.clone();
    run_blocking("sftp_upload", move || {
        let mgr = handle.state::<SessionManager>();
        ssh::sftp_upload(&mgr, &session_id, &local_path, &remote_path)
    })
    .await
}

#[tauri::command]
pub async fn sftp_mkdir(app: AppHandle, session_id: String, path: String) -> Result<(), String> {
    let handle = app.clone();
    run_blocking("sftp_mkdir", move || {
        let mgr = handle.state::<SessionManager>();
        ssh::sftp_mkdir(&mgr, &session_id, &path)
    })
    .await
}

#[tauri::command]
pub async fn sftp_delete(
    app: AppHandle,
    session_id: String,
    path: String,
    is_dir: bool,
) -> Result<(), String> {
    let handle = app.clone();
    run_blocking("sftp_delete", move || {
        let mgr = handle.state::<SessionManager>();
        ssh::sftp_delete(&mgr, &session_id, &path, is_dir)
    })
    .await
}

#[tauri::command]
pub async fn sftp_realpath(
    app: AppHandle,
    session_id: String,
    path: String,
) -> Result<String, String> {
    let handle = app.clone();
    run_blocking("sftp_realpath", move || {
        let mgr = handle.state::<SessionManager>();
        ssh::sftp_realpath(&mgr, &session_id, &path)
    })
    .await
}

// ---- 用户自定义主题 ----

#[tauri::command]
pub fn list_user_themes(store: State<'_, Store>) -> Result<Vec<serde_json::Value>, String> {
    log_err("list_user_themes", Ok(store.list_user_themes()))
}

#[tauri::command]
pub fn save_user_theme(store: State<'_, Store>, content: String) -> Result<String, String> {
    log_err("save_user_theme", store.save_user_theme(&content))
}

#[tauri::command]
pub fn delete_user_theme(store: State<'_, Store>, name: String) -> Result<(), String> {
    log_err("delete_user_theme", store.delete_user_theme(&name))
}

/// 从外部 JSON 文件导入主题（dialog 选择路径）。
#[tauri::command]
pub fn import_user_theme(store: State<'_, Store>, path: String) -> Result<String, String> {
    let r = (|| -> Result<String, String> {
        let s = fs::read_to_string(&path).map_err(|e| format!("读取主题文件失败: {e}"))?;
        store.save_user_theme(&s)
    })();
    log_err("import_user_theme", r)
}

/// 读取文本文件内容（导入主题前预览，供前端改名）。
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {e}"))
}

/// 导出主题内容到指定路径（dialog save 选择路径）。
#[tauri::command]
pub fn export_theme(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("写入主题文件失败: {e}"))
}

// ---- 全局错误日志 ----

/// 前端 JS 错误转发到日志文件（window.onerror / unhandledrejection）。
#[tauri::command]
pub fn log_frontend_error(source: String, message: String, stack: Option<String>) {
    let mut msg = format!("[frontend:{source}] {message}");
    if let Some(s) = stack {
        msg.push_str(&format!("\n{s}"));
    }
    logger::error(&msg);
}

/// 返回日志文件完整路径（供 UI 展示）。
#[tauri::command]
pub fn get_log_path() -> String {
    logger::log_file().to_string_lossy().to_string()
}

/// 读取日志内容（默认返回末尾 64KB，避免大文件卡 UI）。
#[tauri::command]
pub fn read_log(limit: Option<usize>) -> String {
    let path = logger::log_file();
    let limit = limit.unwrap_or(64 * 1024);
    match fs::read(&path) {
        Ok(bytes) => {
            if bytes.len() > limit {
                let start = bytes.len() - limit;
                format!(
                    "…（已截断，仅显示末尾 {} 字节，完整日志见文件）\n{}",
                    limit,
                    String::from_utf8_lossy(&bytes[start..])
                )
            } else {
                String::from_utf8_lossy(&bytes).to_string()
            }
        }
        Err(_) => "（暂无日志）\n".to_string(),
    }
}

/// 清空日志文件内容。
#[tauri::command]
pub fn clear_log() -> Result<(), String> {
    fs::write(logger::log_file(), "").map_err(|e| format!("清空日志失败: {e}"))
}

/// 打开本地命令行窗口（独立窗口，平台相关：Windows cmd / macOS Terminal / Linux 终端）。
#[tauri::command]
pub fn open_local_terminal() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "cmd.exe"])
            .spawn()
            .map_err(|e| format!("启动命令行失败: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-a", "Terminal"])
            .spawn()
            .map_err(|e| format!("启动终端失败: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        for term in ["x-terminal-emulator", "gnome-terminal", "konsole", "xterm"] {
            if std::process::Command::new(term).spawn().is_ok() {
                return Ok(());
            }
        }
        return Err("未找到可用的终端程序".into());
    }
    Ok(())
}

/// 用系统文件管理器打开日志目录。
#[tauri::command]
pub fn open_log_dir() -> Result<(), String> {
    let dir = logger::log_dir();
    let r = open_path(&dir);
    log_err("open_log_dir", r)
}

fn open_path(path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| format!("打开目录失败: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("打开目录失败: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("打开目录失败: {e}"))?;
    }
    Ok(())
}
