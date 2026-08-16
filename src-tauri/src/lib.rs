mod commands;
mod logger;
mod ssh;
mod store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logger::init();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(store::Store::new())
        .manage(ssh::SessionManager::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_connections,
            commands::save_connection,
            commands::delete_connection,
            commands::set_secret,
            commands::test_connection,
            commands::export_connections,
            commands::import_connections,
            commands::open_session,
            commands::open_local_shell,
            commands::write_input,
            commands::resize,
            commands::close_session,
            commands::sftp_list,
            commands::sftp_download,
            commands::sftp_upload,
            commands::sftp_mkdir,
            commands::sftp_delete,
            commands::sftp_realpath,
            commands::log_frontend_error,
            commands::get_log_path,
            commands::read_log,
            commands::clear_log,
            commands::open_log_dir,
            commands::open_local_terminal,
            commands::list_user_themes,
            commands::save_user_theme,
            commands::delete_user_theme,
            commands::import_user_theme,
            commands::read_text_file,
            commands::export_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
