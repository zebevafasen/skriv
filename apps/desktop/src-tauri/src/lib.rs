mod ai;
mod backups;
mod credentials;
mod database;
mod error;
mod files;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(ai::AiState::default())
        .setup(|app| {
            let state = tauri::async_runtime::block_on(database::initialize(app.handle()))?;
            app.manage(state);
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(6 * 60 * 60)).await;
                    let state = handle.state::<database::DatabaseState>();
                    if let Err(error) = backups::ensure_daily_database_snapshot(&state).await {
                        eprintln!("Skriv daily backup failed: {error}");
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            database::db_query,
            database::db_execute,
            database::db_atomic,
            database::database_status,
            credentials::credential_status,
            credentials::save_openrouter_credential,
            credentials::delete_openrouter_credential,
            credentials::list_models,
            ai::openrouter_stream,
            ai::cancel_ai_operation,
            backups::create_database_snapshot,
            backups::list_database_snapshots,
            backups::open_backup_folder,
            backups::restore_database_snapshot,
            files::save_bytes,
            files::save_project_archive,
            files::write_project_backup,
            files::open_project_archive,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Skriv");
}
