// 真實 list_sessions / host_status —— 取代 sessions_mock.rs。
// 用 makiko exec `tmux list-sessions -F '...'` 拿格式化輸出再 parse。

use anyhow::{anyhow, bail, Context, Result};
use chrono::DateTime;
use sqlx::sqlite::SqlitePool;
use std::path::Path;
use tauri::State;

use crate::hosts::{self, Host, HostConnectionStatus, Session};
use crate::secret;
use crate::ssh::{self, AuthMaterial};

pub(crate) const TMUX_LIST_FMT: &str =
    "tmux list-sessions -F '#{session_name}|#{session_attached}|#{session_activity}|#{session_windows}'";

#[tauri::command]
pub async fn list_sessions(
    pool: State<'_, SqlitePool>,
    host_id: String,
) -> Result<Vec<Session>, String> {
    let host = hosts::fetch_one(pool.inner(), &host_id)
        .await
        .map_err(|e| format!("fetch host: {e}"))?;
    list_sessions_for(&host).await.map_err(|e| e.to_string())
}

/// Backend helper:給已知的 Host 跑 `tmux list-sessions`,parse 回 Vec<Session>。
/// `list_sessions` Tauri command 跟 capture.rs 共用。
pub(crate) async fn list_sessions_for(host: &Host) -> Result<Vec<Session>> {
    let password = read_password_for(host)?;
    let auth = build_auth(host, password.as_deref())?;
    let port = port_u16(host)?;
    let stdout =
        ssh::run_command(&host.ssh_host, port, &host.ssh_user, auth, TMUX_LIST_FMT).await?;
    parse_sessions(&stdout)
}

#[tauri::command]
pub async fn host_status(
    pool: State<'_, SqlitePool>,
    host_id: String,
) -> Result<HostConnectionStatus, String> {
    let host = hosts::fetch_one(pool.inner(), &host_id)
        .await
        .map_err(|e| format!("fetch host: {e}"))?;

    let password = match read_password_for(&host) {
        Ok(p) => p,
        Err(_) => return Ok(HostConnectionStatus::Disconnected),
    };
    let auth = match build_auth(&host, password.as_deref()) {
        Ok(a) => a,
        Err(_) => return Ok(HostConnectionStatus::Disconnected),
    };
    let Ok(port) = port_u16(&host) else {
        return Ok(HostConnectionStatus::Disconnected);
    };

    match ssh::test_connection(&host.ssh_host, port, &host.ssh_user, auth).await {
        Ok(()) => Ok(HostConnectionStatus::Connected),
        Err(_) => Ok(HostConnectionStatus::Disconnected),
    }
}

// ---- helpers(pub(crate) 給 capture.rs 共用)----

pub(crate) fn read_password_for(host: &Host) -> Result<Option<String>> {
    if host.auth_type == "password" {
        secret::read_password(&host.id).context("read keyring password")
    } else {
        Ok(None)
    }
}

pub(crate) fn build_auth<'a>(
    host: &'a Host,
    password: Option<&'a str>,
) -> Result<AuthMaterial<'a>> {
    match host.auth_type.as_str() {
        "password" => {
            let pw = password.ok_or_else(|| {
                anyhow!(
                    "password not in keyring for host {} — re-edit to set",
                    host.display_name
                )
            })?;
            Ok(AuthMaterial::Password(pw))
        }
        "key" => {
            let path = host
                .private_key_path
                .as_deref()
                .ok_or_else(|| anyhow!("private_key_path missing for key-auth host"))?;
            Ok(AuthMaterial::Key {
                path: Path::new(path),
                passphrase: None,
            })
        }
        other => bail!("unknown auth_type: {other}"),
    }
}

pub(crate) fn port_u16(host: &Host) -> Result<u16> {
    host.ssh_port
        .try_into()
        .map_err(|_| anyhow!("ssh_port out of range: {}", host.ssh_port))
}

pub(crate) fn parse_sessions(stdout: &str) -> Result<Vec<Session>> {
    stdout
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.splitn(4, '|').collect();
            if parts.len() != 4 {
                bail!("unexpected tmux list-sessions line (expected 4 fields): {line}");
            }
            let attached = parts[1] != "0";
            let epoch: i64 = parts[2]
                .parse()
                .with_context(|| format!("parse activity epoch: {}", parts[2]))?;
            let activity = DateTime::from_timestamp(epoch, 0)
                .ok_or_else(|| anyhow!("invalid activity epoch: {epoch}"))?
                .to_rfc3339();
            let windows: i64 = parts[3]
                .parse()
                .with_context(|| format!("parse windows count: {}", parts[3]))?;
            Ok(Session {
                name: parts[0].to_string(),
                attached,
                activity,
                windows,
            })
        })
        .collect()
}
