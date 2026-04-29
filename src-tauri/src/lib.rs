mod commands;
mod hosts;
mod secret;
mod sessions_mock;
mod ssh;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // tauri-plugin-sql 仍 load,但**不**註冊 migration ——
        // backend 在 setup hook 自己開 sqlx pool + apply schema(NOTES.md D-5)。
        // plugin-sql 留給 M1d 之後 frontend incremental capture_cache update 用。
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("resolve app_data_dir");
            let db_path = app_data_dir.join("piermux.db");
            let pool = tauri::async_runtime::block_on(async move {
                hosts::open_pool(&db_path).await
            })
            .expect("open sqlite pool");
            app.manage(pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_hosts,
            commands::create_host,
            commands::update_host,
            commands::delete_host,
            commands::test_connection,
            commands::import_private_key,
            // M1c MOCK — 等 SSH unblock 後從 sessions_mock 改指真的實作
            sessions_mock::list_sessions,
            sessions_mock::host_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
