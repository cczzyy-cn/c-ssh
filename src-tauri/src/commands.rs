use std::collections::HashSet;
use std::fs;
use tauri::{AppHandle, State};

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

// ---- 连接配置 ----

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

// ---- 会话 ----

#[tauri::command]
pub fn test_connection(store: State<'_, Store>, id: String) -> Result<(), String> {
    let conn = store.get_connection(&id).ok_or("连接不存在")?;
    log_err("test_connection", ssh::test(&conn, &store))
}

#[tauri::command]
pub fn open_session(
    app: AppHandle,
    store: State<'_, Store>,
    mgr: State<'_, SessionManager>,
    conn_id: String,
) -> Result<String, String> {
    let conn = store.get_connection(&conn_id).ok_or("连接不存在")?;
    log_err("open_session", ssh::open(app, &mgr, &store, &conn))
}

#[tauri::command]
pub fn open_echo_session(app: AppHandle, mgr: State<'_, SessionManager>) -> Result<String, String> {
    log_err("open_echo_session", ssh::open_echo(app, &mgr))
}

#[tauri::command]
pub fn write_input(
    mgr: State<'_, SessionManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    log_err("write_input", ssh::write_input(&mgr, &session_id, &data))
}

#[tauri::command]
pub fn resize(
    mgr: State<'_, SessionManager>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    log_err("resize", ssh::resize(&mgr, &session_id, cols, rows))
}

#[tauri::command]
pub fn close_session(
    mgr: State<'_, SessionManager>,
    session_id: String,
) -> Result<(), String> {
    log_err("close_session", ssh::close_session(&mgr, &session_id))
}

// ---- SFTP ----

#[tauri::command]
pub fn sftp_list(
    mgr: State<'_, SessionManager>,
    session_id: String,
    path: String,
) -> Result<Vec<ssh::SftpEntry>, String> {
    log_err("sftp_list", ssh::sftp_list(&mgr, &session_id, &path))
}

#[tauri::command]
pub fn sftp_download(
    mgr: State<'_, SessionManager>,
    session_id: String,
    remote_path: String,
    local_path: String,
) -> Result<(), String> {
    log_err(
        "sftp_download",
        ssh::sftp_download(&mgr, &session_id, &remote_path, &local_path),
    )
}

#[tauri::command]
pub fn sftp_upload(
    mgr: State<'_, SessionManager>,
    session_id: String,
    local_path: String,
    remote_path: String,
) -> Result<(), String> {
    log_err(
        "sftp_upload",
        ssh::sftp_upload(&mgr, &session_id, &local_path, &remote_path),
    )
}

#[tauri::command]
pub fn sftp_mkdir(
    mgr: State<'_, SessionManager>,
    session_id: String,
    path: String,
) -> Result<(), String> {
    log_err("sftp_mkdir", ssh::sftp_mkdir(&mgr, &session_id, &path))
}

#[tauri::command]
pub fn sftp_delete(
    mgr: State<'_, SessionManager>,
    session_id: String,
    path: String,
    is_dir: bool,
) -> Result<(), String> {
    log_err(
        "sftp_delete",
        ssh::sftp_delete(&mgr, &session_id, &path, is_dir),
    )
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
