mod commands;
mod ssh;
mod store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(store::Store::new())
        .manage(ssh::SessionManager::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_connections,
            commands::save_connection,
            commands::delete_connection,
            commands::set_secret,
            commands::test_connection,
            commands::open_session,
            commands::open_echo_session,
            commands::write_input,
            commands::resize,
            commands::close_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
