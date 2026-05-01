// M1f attach commands(SPEC §3.2 + §6.5)。
//
// - attach_session(host, session, cols, rows)  — 開 PTY + tmux attach,回 attach_id
// - write_to_session(id, data)                 — 把字串送進 PTY stdin
// - resize_session(id, cols, rows)             — 通知 server window 大小變
// - detach_session(id)                         — 收 close + 把 reader task abort
//
// 設計:
// - 一個 attach 一條 SSH connection(separate from capture 的 SSH pool;
//   capture 跟 attach 不共用,避免 PTY channel 跟 exec channel 混在同一條
//   connection 上的疊加複雜度)
// - PTY 輸出由 reader task 持續 recv,每筆 stdout/stderr 都 emit
//   `attach-output-<id>` event(payload = String,UTF-8 lossy)
// - 結束(server EOF / exit / channel error)emit `attach-closed-<id>`
// - registry 用 `Mutex<HashMap>` 存 AttachHandle;detach 時 remove → Drop
//   會 close session + abort reader task
//
// Line buffer mode 是 frontend 的責任(SPEC §3.5 / §7.3)。M1f backend
// 不知道使用者打字的字元是不是還累積在前端 buffer,只負責把進來的 bytes
// 直接 send_stdin。M1g 才動 buffer 邏輯(全在 frontend)。

use std::collections::HashMap;
use std::sync::Arc;

use makiko::bytes::Bytes;
use makiko::{ChannelConfig, PtyRequest, PtyTerminalModes, SessionEvent, WindowChange};
use sqlx::sqlite::SqlitePool;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use uuid::Uuid;

use crate::hosts;
use crate::sessions;
use crate::ssh::{self, SshSession};

#[derive(Default)]
pub struct AttachRegistry {
    inner: Mutex<HashMap<String, AttachHandle>>,
}

struct AttachHandle {
    // 留 Arc<SshSession> 在這手上,確保 attach 期間 SSH connection 不會
    // 被 drop(makiko::Session 是 Channel 的 thin Arc handle,本身不持
    // ownership 連線)。reader task 不需要持有 — channel close 後 recv
    // 自然回 None,task 會 break out。
    _ssh: Arc<SshSession>,
    session: makiko::Session,
    reader: Option<JoinHandle<()>>,
}

impl Drop for AttachHandle {
    fn drop(&mut self) {
        // close 是 idempotent;之後 reader 應該很快收到 None 自然結束,
        // 但保險起見直接 abort
        let _ = self.session.close();
        if let Some(t) = self.reader.take() {
            t.abort();
        }
    }
}

#[tauri::command]
pub async fn attach_session(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    registry: State<'_, AttachRegistry>,
    host_id: String,
    session_name: String,
    cols: u32,
    rows: u32,
) -> Result<String, String> {
    let host = hosts::fetch_one(pool.inner(), &host_id)
        .await
        .map_err(|e| format!("fetch host: {e}"))?;
    let password = sessions::read_password_for(&host).map_err(|e| e.to_string())?;
    let auth = sessions::build_auth(&host, password.as_deref()).map_err(|e| e.to_string())?;
    let port = sessions::port_u16(&host).map_err(|e| e.to_string())?;

    let ssh = ssh::connect(&host.ssh_host, port, &host.ssh_user, auth)
        .await
        .map_err(|e| format!("ssh connect: {e}"))?;
    let ssh = Arc::new(ssh);

    // 開 channel session
    let (session, mut sess_rx) = ssh
        .client()
        .open_session(ChannelConfig::default())
        .await
        .map_err(|e| format!("open session: {e}"))?;

    // request PTY
    let pty_req = PtyRequest {
        term: "xterm-256color".to_string(),
        width: cols,
        height: rows,
        width_px: 0,
        height_px: 0,
        modes: PtyTerminalModes::default(),
    };
    session
        .request_pty(&pty_req)
        .map_err(|e| format!("request_pty: {e}"))?
        .wait()
        .await
        .map_err(|e| format!("request_pty wait: {e}"))?;

    // exec tmux attach -t <session>
    let cmd = format!("tmux attach -t {}", shell_quote(&session_name));
    session
        .exec(cmd.as_bytes())
        .map_err(|e| format!("exec request: {e}"))?
        .wait()
        .await
        .map_err(|e| format!("exec wait: {e}"))?;

    let attach_id = Uuid::new_v4().to_string();
    let app_clone = app.clone();
    let attach_id_clone = attach_id.clone();

    // reader task:把 stdout/stderr 轉發給 frontend,EOF / Exit / 錯誤都 emit close
    let reader = tokio::spawn(async move {
        loop {
            match sess_rx.recv().await {
                Ok(Some(event)) => match event {
                    SessionEvent::StdoutData(bytes) | SessionEvent::StderrData(bytes) => {
                        let chunk = String::from_utf8_lossy(&bytes).into_owned();
                        let evt = format!("attach-output-{attach_id_clone}");
                        if let Err(e) = app_clone.emit(&evt, &chunk) {
                            eprintln!("[attach] emit {evt} failed: {e}");
                        }
                    }
                    SessionEvent::Eof | SessionEvent::ExitStatus(_) => break,
                    _ => continue,
                },
                Ok(None) => break,
                Err(e) => {
                    eprintln!("[attach {attach_id_clone}] reader recv error: {e}");
                    break;
                }
            }
        }
        let evt = format!("attach-closed-{attach_id_clone}");
        let _ = app_clone.emit(&evt, ());
    });

    let handle = AttachHandle {
        _ssh: ssh,
        session,
        reader: Some(reader),
    };

    let mut map = registry.inner.lock().await;
    map.insert(attach_id.clone(), handle);
    Ok(attach_id)
}

#[tauri::command]
pub async fn write_to_session(
    registry: State<'_, AttachRegistry>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    // makiko::Session 是 Clone 的(Channel handle thin clone),clone 出來
    // 後可以丟掉 Mutex lock 再 await send_stdin
    let session = {
        let map = registry.inner.lock().await;
        map.get(&session_id)
            .ok_or_else(|| format!("attach session not found: {session_id}"))?
            .session
            .clone()
    };
    session
        .send_stdin(Bytes::from(data.into_bytes()))
        .await
        .map_err(|e| format!("send_stdin: {e}"))
}

#[tauri::command]
pub async fn resize_session(
    registry: State<'_, AttachRegistry>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    let map = registry.inner.lock().await;
    let handle = map
        .get(&session_id)
        .ok_or_else(|| format!("attach session not found: {session_id}"))?;
    let change = WindowChange {
        width: cols,
        height: rows,
        width_px: 0,
        height_px: 0,
    };
    handle
        .session
        .window_change(&change)
        .map_err(|e| format!("window_change: {e}"))
}

#[tauri::command]
pub async fn detach_session(
    registry: State<'_, AttachRegistry>,
    session_id: String,
) -> Result<(), String> {
    let mut map = registry.inner.lock().await;
    map.remove(&session_id); // Drop 處理 close + abort
    Ok(())
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}
