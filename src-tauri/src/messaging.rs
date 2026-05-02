// M1e send_message(SPEC §3.4 + §6.4)。
//
// 不需 attach,從 capture view 直接對 session 送一段字 / 一個按鍵組合。
// Tmux 的 `send-keys` 兩種模式:
// - `-l` literal:payload 視作 raw bytes 送 PTY,不解讀(送 `;` 不會被當 tmux
//   command separator,送中文也 OK)
// - 不加 `-l`:payload 視作 tmux key spec(`Escape`、`C-l`、`Up` 等)
//
// 為了同時支援「打字 prompt 給 Claude Code」+「Stop (ESC) / Clear (Ctrl+L) 等
// 快捷鍵」場景,backend 加 `literal` 參數(SPEC §6.4 文字只寫 `-l`,但 SPEC §3.4
// 預設 quick presets 含 ESC/Ctrl+L,需要 named-key 路徑)。NOTES.md D-12 記。
//
// `send_enter=true` 時額外送一個 Enter(named key,不是 `\n` 字元)。一條 SSH
// 連線跑 1-2 個 channel,SshSession 共用。

use anyhow::{Context, Result};
use sqlx::sqlite::SqlitePool;
use tauri::State;

use crate::hosts;
use crate::sessions;
use crate::ssh;

#[tauri::command]
pub async fn send_message(
    pool: State<'_, SqlitePool>,
    host_id: String,
    session_name: String,
    payload: String,
    send_enter: bool,
    literal: bool,
) -> Result<(), String> {
    let host = hosts::fetch_one(pool.inner(), &host_id)
        .await
        .map_err(|e| format!("fetch host: {e}"))?;
    let password = sessions::read_password_for(&host).map_err(|e| e.to_string())?;
    let auth = sessions::build_auth(&host, password.as_deref()).map_err(|e| e.to_string())?;
    let port = sessions::port_u16(&host).map_err(|e| e.to_string())?;

    let ssh_session = ssh::connect(&host.ssh_host, port, &host.ssh_user, auth)
        .await
        .map_err(|e| format!("ssh connect: {e}"))?;

    let target = shell_quote(&session_name);
    let payload_q = shell_quote(&payload);
    let cmd = if literal {
        format!("tmux send-keys -l -t {target} -- {payload_q}")
    } else {
        // named keys:tmux 解讀 payload(如 Escape / C-l / Up)
        format!("tmux send-keys -t {target} {payload_q}")
    };

    ssh_session
        .exec(&cmd)
        .await
        .with_context(|| format!("send-keys to '{}' on {}", session_name, host.display_name))
        .map_err(|e| e.to_string())?;

    if send_enter {
        let enter_cmd = format!("tmux send-keys -t {target} Enter");
        ssh_session
            .exec(&enter_cmd)
            .await
            .with_context(|| {
                format!(
                    "send-keys Enter to '{}' on {}",
                    session_name, host.display_name
                )
            })
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// POSIX shell 單引號逃脫(同 capture.rs / attach.rs 的 `shell_quote`)。
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}
