// 6 個 Tauri commands(對齊 SPEC §6.1)。每個 command 把錯誤
// map 成 String,M1 階段先用 Result<T, String>(CLAUDE.md 規定)。

use crate::hosts::{self, Host, HostForm};
use crate::secret;
use crate::ssh;
use sqlx::sqlite::SqlitePool;
use std::path::Path;
use tauri::State;

#[tauri::command]
pub async fn list_hosts(pool: State<'_, SqlitePool>) -> Result<Vec<Host>, String> {
    hosts::list_hosts(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_host(
    pool: State<'_, SqlitePool>,
    form: HostForm,
) -> Result<Host, String> {
    let host = hosts::create_host(pool.inner(), &form)
        .await
        .map_err(|e| e.to_string())?;
    if form.auth_type == "password" {
        if let Some(pw) = form.password.as_deref() {
            secret::store_password(&host.id, pw).map_err(|e| e.to_string())?;
        }
    }
    Ok(host)
}

#[tauri::command]
pub async fn update_host(
    pool: State<'_, SqlitePool>,
    id: String,
    form: HostForm,
) -> Result<Host, String> {
    let host = hosts::update_host(pool.inner(), &id, &form)
        .await
        .map_err(|e| e.to_string())?;
    // password 更新:有 password 就覆寫 keyring;auth_type 換成 key 就清掉舊的
    if form.auth_type == "password" {
        if let Some(pw) = form.password.as_deref() {
            secret::store_password(&host.id, pw).map_err(|e| e.to_string())?;
        }
    } else {
        secret::delete_password(&host.id).map_err(|e| e.to_string())?;
    }
    Ok(host)
}

#[tauri::command]
pub async fn delete_host(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<(), String> {
    hosts::delete_host(pool.inner(), &id)
        .await
        .map_err(|e| e.to_string())?;
    secret::delete_password(&id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn test_connection(form: HostForm) -> Result<(), String> {
    let port: u16 = form
        .ssh_port
        .try_into()
        .map_err(|_| format!("ssh_port out of range: {}", form.ssh_port))?;

    let auth = match form.auth_type.as_str() {
        "password" => {
            let pw = form
                .password
                .as_deref()
                .ok_or_else(|| "password missing for auth_type=password".to_string())?;
            ssh::AuthMaterial::Password(pw)
        }
        "key" => {
            let path = form
                .private_key_path
                .as_deref()
                .ok_or_else(|| "private_key_path missing for auth_type=key".to_string())?;
            ssh::AuthMaterial::Key {
                path: Path::new(path),
                passphrase: None,
            }
        }
        other => return Err(format!("unknown auth_type: {other}")),
    };

    ssh::test_connection(&form.ssh_host, port, &form.ssh_user, auth)
        .await
        .map_err(|e| e.to_string())
}

// Desktop:驗證 file 存在 + 可讀 + 回 absolute path。
// Android(M2)會改成把 bytes import 進 keystore + 回 alias(D-4)。
#[tauri::command]
pub async fn import_private_key(file_path: String) -> Result<String, String> {
    let p = Path::new(&file_path);
    if !p.exists() {
        return Err(format!("file not found: {file_path}"));
    }
    std::fs::read(p).map_err(|e| format!("read key: {e}"))?;
    let abs = std::fs::canonicalize(p).map_err(|e| format!("canonicalize: {e}"))?;
    Ok(abs.to_string_lossy().to_string())
}
