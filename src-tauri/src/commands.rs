use std::collections::HashSet;
use std::fs;
use tauri::{AppHandle, State};

use crate::ssh::{self, SessionManager};
use crate::store::{ConnectionConfig, Store};

/// 导出全部连接配置为 JSON（不含凭据，凭据在 OS keyring）。
#[tauri::command]
pub fn export_connections(store: State<'_, Store>, path: String) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&store.load_connections())
        .map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("写入文件失败: {e}"))
}

/// 从 JSON 导入连接配置，与现有配置合并；id 冲突或为空时重新生成。
#[tauri::command]
pub fn import_connections(store: State<'_, Store>, path: String) -> Result<usize, String> {
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
}

#[tauri::command]
pub fn list_connections(store: State<'_, Store>) -> Result<Vec<ConnectionConfig>, String> {
    Ok(store.load_connections())
}

#[tauri::command]
pub fn save_connection(
    store: State<'_, Store>,
    conn: ConnectionConfig,
) -> Result<ConnectionConfig, String> {
    store.upsert_connection(conn)
}

#[tauri::command]
pub fn delete_connection(store: State<'_, Store>, id: String) -> Result<(), String> {
    store.delete_secret(&id);
    store.delete_connection(&id)
}

/// 保存/更新凭据到 OS keyring；secret 为空或 None 时删除。
#[tauri::command]
pub fn set_secret(
    store: State<'_, Store>,
    id: String,
    secret: Option<String>,
) -> Result<(), String> {
    match secret {
        Some(s) if !s.is_empty() => store.set_secret(&id, &s),
        _ => {
            store.delete_secret(&id);
            Ok(())
        }
    }
}

#[tauri::command]
pub fn test_connection(store: State<'_, Store>, id: String) -> Result<(), String> {
    let conn = store.get_connection(&id).ok_or("连接不存在")?;
    ssh::test(&conn, &store)
}

#[tauri::command]
pub fn open_session(
    app: AppHandle,
    store: State<'_, Store>,
    mgr: State<'_, SessionManager>,
    conn_id: String,
) -> Result<String, String> {
    let conn = store.get_connection(&conn_id).ok_or("连接不存在")?;
    ssh::open(app, &mgr, &store, &conn)
}

#[tauri::command]
pub fn open_echo_session(app: AppHandle, mgr: State<'_, SessionManager>) -> Result<String, String> {
    ssh::open_echo(app, &mgr)
}

#[tauri::command]
pub fn write_input(
    mgr: State<'_, SessionManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    ssh::write_input(&mgr, &session_id, &data)
}

#[tauri::command]
pub fn resize(
    mgr: State<'_, SessionManager>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    ssh::resize(&mgr, &session_id, cols, rows)
}

#[tauri::command]
pub fn close_session(
    mgr: State<'_, SessionManager>,
    session_id: String,
) -> Result<(), String> {
    ssh::close_session(&mgr, &session_id)
}

#[tauri::command]
pub fn sftp_list(
    mgr: State<'_, SessionManager>,
    session_id: String,
    path: String,
) -> Result<Vec<ssh::SftpEntry>, String> {
    ssh::sftp_list(&mgr, &session_id, &path)
}

#[tauri::command]
pub fn sftp_download(
    mgr: State<'_, SessionManager>,
    session_id: String,
    remote_path: String,
    local_path: String,
) -> Result<(), String> {
    ssh::sftp_download(&mgr, &session_id, &remote_path, &local_path)
}

#[tauri::command]
pub fn sftp_upload(
    mgr: State<'_, SessionManager>,
    session_id: String,
    local_path: String,
    remote_path: String,
) -> Result<(), String> {
    ssh::sftp_upload(&mgr, &session_id, &local_path, &remote_path)
}

#[tauri::command]
pub fn sftp_mkdir(
    mgr: State<'_, SessionManager>,
    session_id: String,
    path: String,
) -> Result<(), String> {
    ssh::sftp_mkdir(&mgr, &session_id, &path)
}

#[tauri::command]
pub fn sftp_delete(
    mgr: State<'_, SessionManager>,
    session_id: String,
    path: String,
    is_dir: bool,
) -> Result<(), String> {
    ssh::sftp_delete(&mgr, &session_id, &path, is_dir)
}
