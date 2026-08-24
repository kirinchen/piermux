// 真實 list_sessions / host_status —— 取代 sessions_mock.rs。
// 用 makiko exec `tmux list-sessions -F '...'` 拿格式化輸出再 parse。
//
// 也擺 SPEC §6.6 的 kill_session、加 rename_session(SPEC 沒列但 §10 也沒禁,
// tree view session-level UX 配套)— 兩個都走 one-shot run_command,跟
// list_sessions / host_status 同 module 對齊「對 tmux 控制面」的東西放這。

use anyhow::{anyhow, bail, Context, Result};
use chrono::DateTime;
use sqlx::sqlite::SqlitePool;
use std::path::Path;
use tauri::State;

use crate::hosts::{self, Host, HostConnectionStatus, Session};
use crate::secret;
use crate::ssh::{self, AuthMaterial, HostKeyPolicy};

/// 掃 host 上**所有** tmux socket(`tmux -L <name>`)再逐一 list-sessions。
/// socket 名 = `${TMUX_TMPDIR:-/tmp/tmux-<uid>}/` 下的檔名(預設 server 叫 `default`)。
/// 死掉 / 沒 server 的 socket → `list-sessions` 報錯被 `2>/dev/null` 吞,該 socket 無輸出行。
/// 每行 5 欄:socket|name|attached|activity|windows(socket 放行首,parse 時 splitn(5))。
/// 只多 parse,不多一趟 SSH round-trip(整段是一條 exec)。D-39。
pub(crate) const TMUX_LIST_FMT: &str = "d=\"${TMUX_TMPDIR:-/tmp/tmux-$(id -u)}\"; \
     for s in $(ls -1 \"$d\" 2>/dev/null); do \
       tmux -L \"$s\" list-sessions \
         -F \"$s|#{session_name}|#{session_attached}|#{session_activity}|#{session_windows}\" \
         2>/dev/null; \
     done";

#[tauri::command]
pub async fn list_sessions(
    pool: State<'_, SqlitePool>,
    host_id: String,
) -> Result<Vec<Session>, String> {
    let host = hosts::fetch_one(pool.inner(), &host_id)
        .await
        .map_err(|e| format!("fetch host: {e}"))?;
    list_sessions_for(pool.inner(), &host)
        .await
        .map_err(|e| e.to_string())
}

/// Backend helper:給已知的 Host 跑 `tmux list-sessions`,parse 回 Vec<Session>。
/// `list_sessions` Tauri command 跟 capture.rs 共用。
pub(crate) async fn list_sessions_for(pool: &SqlitePool, host: &Host) -> Result<Vec<Session>> {
    let password = read_password_for(host)?;
    let auth = build_auth(host, password.as_deref())?;
    let port = port_u16(host)?;
    let policy = HostKeyPolicy::Tofu {
        pool,
        host_id: &host.id,
    };
    let stdout = ssh::run_command(
        &host.ssh_host,
        port,
        &host.ssh_user,
        auth,
        policy,
        TMUX_LIST_FMT,
    )
    .await?;
    parse_sessions(&stdout)
}

#[tauri::command]
pub async fn kill_session(
    pool: State<'_, SqlitePool>,
    host_id: String,
    socket: String,
    session_name: String,
) -> Result<(), String> {
    let host = hosts::fetch_one(pool.inner(), &host_id)
        .await
        .map_err(|e| format!("fetch host: {e}"))?;
    let cmd = format!(
        "{} kill-session -t {}",
        tmux_with_socket(&socket),
        shell_quote(&session_name)
    );
    run_tmux_control(pool.inner(), &host, &cmd)
        .await
        .with_context(|| format!("kill-session '{}' on {}", session_name, host.display_name))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn new_session(
    pool: State<'_, SqlitePool>,
    host_id: String,
    socket: String,
    session_name: String,
) -> Result<(), String> {
    let session_name = session_name.trim();
    if session_name.is_empty() {
        return Err("session name cannot be empty".into());
    }
    if session_name.contains([':', '.', ' ']) {
        return Err("session name cannot contain ':', '.' or whitespace".into());
    }
    let host = hosts::fetch_one(pool.inner(), &host_id)
        .await
        .map_err(|e| format!("fetch host: {e}"))?;
    // -d:detached(不要 attach,我們只是建出來);-s:session name
    let cmd = format!(
        "{} new-session -d -s {}",
        tmux_with_socket(&socket),
        shell_quote(session_name)
    );
    run_tmux_control(pool.inner(), &host, &cmd)
        .await
        .with_context(|| format!("new-session '{}' on {}", session_name, host.display_name))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn rename_session(
    pool: State<'_, SqlitePool>,
    host_id: String,
    socket: String,
    session_name: String,
    new_name: String,
) -> Result<(), String> {
    let new_name = new_name.trim();
    if new_name.is_empty() {
        return Err("new session name cannot be empty".into());
    }
    if new_name.contains([':', '.', ' ']) {
        return Err("session name cannot contain ':', '.' or whitespace".into());
    }
    let host = hosts::fetch_one(pool.inner(), &host_id)
        .await
        .map_err(|e| format!("fetch host: {e}"))?;
    let cmd = format!(
        "{} rename-session -t {} {}",
        tmux_with_socket(&socket),
        shell_quote(&session_name),
        shell_quote(new_name),
    );
    run_tmux_control(pool.inner(), &host, &cmd)
        .await
        .with_context(|| {
            format!(
                "rename-session '{}' → '{}' on {}",
                session_name, new_name, host.display_name
            )
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 共用 helper:跑一條沒輸出在乎的 tmux 控制指令(kill / rename / …)。
async fn run_tmux_control(pool: &SqlitePool, host: &Host, cmd: &str) -> Result<()> {
    let password = read_password_for(host)?;
    let auth = build_auth(host, password.as_deref())?;
    let port = port_u16(host)?;
    let policy = HostKeyPolicy::Tofu {
        pool,
        host_id: &host.id,
    };
    ssh::run_command(&host.ssh_host, port, &host.ssh_user, auth, policy, cmd).await?;
    Ok(())
}

/// POSIX shell 單引號逃脫(同 capture.rs / messaging.rs 各自的 shell_quote)。
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// 帶 socket 的 tmux 指令前綴:`tmux -L '<socket>'`(D-39)。
/// 所有單 socket 操作(kill / rename / new / attach / capture / send)都用這個
/// 取代裸 `tmux`,才會打到對的 tmux server。socket 通常是 "default"。
pub(crate) fn tmux_with_socket(socket: &str) -> String {
    format!("tmux -L {}", shell_quote(socket))
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

    // host_status 走 TOFU。第一次連線會綁 fingerprint;之後 fingerprint
    // mismatch 會出錯 → 顯示 disconnected(避免 silent fallback 到 MITM key)
    let policy = HostKeyPolicy::Tofu {
        pool: pool.inner(),
        host_id: &host.id,
    };
    let session = match ssh::connect(&host.ssh_host, port, &host.ssh_user, auth, policy).await {
        Ok(s) => s,
        Err(_) => return Ok(HostConnectionStatus::Disconnected),
    };
    match session.exec("whoami").await {
        Ok(_) => Ok(HostConnectionStatus::Connected),
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
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.len() != 5 {
                bail!("unexpected tmux list-sessions line (expected 5 fields): {line}");
            }
            let attached = parts[2] != "0";
            let epoch: i64 = parts[3]
                .parse()
                .with_context(|| format!("parse activity epoch: {}", parts[3]))?;
            let activity = DateTime::from_timestamp(epoch, 0)
                .ok_or_else(|| anyhow!("invalid activity epoch: {epoch}"))?
                .to_rfc3339();
            let windows: i64 = parts[4]
                .parse()
                .with_context(|| format!("parse windows count: {}", parts[4]))?;
            Ok(Session {
                socket: parts[0].to_string(),
                name: parts[1].to_string(),
                attached,
                activity,
                windows,
            })
        })
        .collect()
}
