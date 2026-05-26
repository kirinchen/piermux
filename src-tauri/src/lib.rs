mod attach;
mod capture;
mod commands;
mod host_keys;
mod hosts;
mod messaging;
mod secret;
mod sessions;
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
            let app_data_dir = app.path().app_data_dir().expect("resolve app_data_dir");
            // Android secret 後端要知道 app 私有資料夾(desktop 走 keyring,無害)
            secret::init_dir(&app_data_dir);
            let db_path = app_data_dir.join("piermux.db");
            let pool =
                tauri::async_runtime::block_on(async move { hosts::open_pool(&db_path).await })
                    .expect("open sqlite pool");
            app.manage(pool);
            // M1f attach registry(空 HashMap,attach_session 進來才塞)
            app.manage(attach::AttachRegistry::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_hosts,
            commands::create_host,
            commands::update_host,
            commands::delete_host,
            commands::test_connection,
            commands::import_private_key,
            // M1c real(makiko exec):取代之前的 sessions_mock
            sessions::list_sessions,
            sessions::host_status,
            // SPEC §6.6 kill_session + rename + new(tree view session-level)
            sessions::kill_session,
            sessions::rename_session,
            sessions::new_session,
            // M1d capture(三層 refresh,SPEC §3.3 / §6.3)
            capture::capture_session,
            capture::capture_host,
            capture::capture_all,
            // M1f attach(雙向 PTY,SPEC §3.2 / §6.5)+ shell direct(NOTES D-14)
            attach::attach_session,
            attach::attach_shell,
            attach::write_to_session,
            attach::resize_session,
            attach::detach_session,
            // M1e send_message(不需 attach 直接對 session 送字 / 按鍵,SPEC §3.4 / §6.4)
            messaging::send_message,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
