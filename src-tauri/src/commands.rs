use tauri::{AppHandle, State};

use crate::ssh::{self, SessionManager};
use crate::store::{ConnectionConfig, Store};

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
