// M1f attach commands(SPEC §3.2 + §6.5)+ M1.5 shell direct(NOTES D-14)。
//
// - attach_session(host, session, cols, rows)  — 開 PTY + tmux attach,回 attach_id
// - attach_shell(host, cols, rows)             — 開 PTY + 用戶 login shell(無 tmux,
//                                                NOTES D-14 新概念)
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
use crate::ssh::{self, HostKeyPolicy, SshSession};

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

/// 在已連的 SshSession 上開 channel + request PTY,回 (Session, Receiver)。
/// `attach_session` / `attach_shell` 共用,差別在後面是 exec(tmux) 還是 shell()。
async fn open_pty_channel(
    ssh: &SshSession,
    cols: u32,
    rows: u32,
) -> Result<(makiko::Session, makiko::SessionReceiver), String> {
    let (session, sess_rx) = ssh
        .client()
        .open_session(ChannelConfig::default())
        .await
        .map_err(|e| format!("open session: {e}"))?;

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

    Ok((session, sess_rx))
}

/// 拿準備好的 (Session, Receiver) + 已生成的 attach_id,spawn reader task,
/// 把資源塞進 registry。共用給 attach_session / attach_shell。
async fn finalize_attach(
    app: &AppHandle,
    registry: &AttachRegistry,
    ssh: Arc<SshSession>,
    session: makiko::Session,
    mut sess_rx: makiko::SessionReceiver,
) -> String {
    let attach_id = Uuid::new_v4().to_string();
    let app_clone = app.clone();
    let attach_id_clone = attach_id.clone();

    let reader = tokio::spawn(async move {
        // PTY raw bytes 是 stream — 多 byte UTF-8 字元(如中文)會跨 packet
        // 邊界切開。直接 from_utf8_lossy 會把不完整的尾段轉成 �,中文
        // attach 輸出會壞掉。保留 tail buffer 把不完整序列留到下個 packet 合併。
        let mut utf8_tail: Vec<u8> = Vec::new();
        loop {
            match sess_rx.recv().await {
                Ok(Some(event)) => match event {
                    SessionEvent::StdoutData(bytes) | SessionEvent::StderrData(bytes) => {
                        let chunk = drain_utf8(&mut utf8_tail, &bytes);
                        if chunk.is_empty() {
                            continue; // 整段都是 incomplete tail,等下個 packet
                        }
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
        // session 結束時若 tail 還有殘餘 bytes(server 在多 byte 序列中斷),
        // 用 lossy 收尾,讓 user 看得到 � 而不是默默吞字
        if !utf8_tail.is_empty() {
            let leftover = String::from_utf8_lossy(&utf8_tail).into_owned();
            let evt = format!("attach-output-{attach_id_clone}");
            let _ = app_clone.emit(&evt, &leftover);
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
    attach_id
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
    let policy = HostKeyPolicy::Tofu {
        pool: pool.inner(),
        host_id: &host.id,
    };

    let ssh = ssh::connect(&host.ssh_host, port, &host.ssh_user, auth, policy)
        .await
        .map_err(|e| format!("ssh connect: {e}"))?;
    let ssh = Arc::new(ssh);

    let (session, sess_rx) = open_pty_channel(&ssh, cols, rows).await?;

    let cmd = format!("tmux attach -t {}", shell_quote(&session_name));
    session
        .exec(cmd.as_bytes())
        .map_err(|e| format!("exec request: {e}"))?
        .wait()
        .await
        .map_err(|e| format!("exec wait: {e}"))?;

    Ok(finalize_attach(&app, &registry, ssh, session, sess_rx).await)
}

/// M1.5 直連 shell(NOTES D-14):跟 attach_session 同流程,差別在 exec("tmux attach")
/// 換成 `session.shell()` — server 端開 user 預設 login shell,不走 tmux。
/// 場景:host 沒裝 tmux / 想 quick admin 一行命令 / debug 連線。
#[tauri::command]
pub async fn attach_shell(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    registry: State<'_, AttachRegistry>,
    host_id: String,
    cols: u32,
    rows: u32,
) -> Result<String, String> {
    let host = hosts::fetch_one(pool.inner(), &host_id)
        .await
        .map_err(|e| format!("fetch host: {e}"))?;
    let password = sessions::read_password_for(&host).map_err(|e| e.to_string())?;
    let auth = sessions::build_auth(&host, password.as_deref()).map_err(|e| e.to_string())?;
    let port = sessions::port_u16(&host).map_err(|e| e.to_string())?;
    let policy = HostKeyPolicy::Tofu {
        pool: pool.inner(),
        host_id: &host.id,
    };

    let ssh = ssh::connect(&host.ssh_host, port, &host.ssh_user, auth, policy)
        .await
        .map_err(|e| format!("ssh connect: {e}"))?;
    let ssh = Arc::new(ssh);

    let (session, sess_rx) = open_pty_channel(&ssh, cols, rows).await?;

    // 跟 attach_session 唯一差別:不 exec tmux attach,改 call shell()
    session
        .shell()
        .map_err(|e| format!("shell request: {e}"))?
        .wait()
        .await
        .map_err(|e| format!("shell wait: {e}"))?;

    Ok(finalize_attach(&app, &registry, ssh, session, sess_rx).await)
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

/// 把 tail buffer + 新 bytes 合併,取出 valid UTF-8 字串,把不完整的尾巴留回
/// tail buffer。中間遇到真的無效 byte 才插 U+FFFD(replacement char)。
///
/// 注意:tail buffer 上限不設限是刻意的 — UTF-8 最長 4 bytes,正常 PTY
/// 串流不會長期累積。萬一 server 一直送殘 byte,下一次 ExitStatus / Eof
/// 觸發的 leftover flush 會吞掉。
fn drain_utf8(tail: &mut Vec<u8>, new_bytes: &[u8]) -> String {
    let mut combined: Vec<u8> = Vec::with_capacity(tail.len() + new_bytes.len());
    combined.extend_from_slice(tail);
    combined.extend_from_slice(new_bytes);
    tail.clear();

    let mut out = String::new();
    let mut cursor = &combined[..];
    loop {
        match std::str::from_utf8(cursor) {
            Ok(s) => {
                out.push_str(s);
                return out;
            }
            Err(e) => {
                let valid_up_to = e.valid_up_to();
                // Safety: from_utf8 保證 [..valid_up_to] 是 valid UTF-8
                out.push_str(unsafe { std::str::from_utf8_unchecked(&cursor[..valid_up_to]) });
                match e.error_len() {
                    None => {
                        // 結尾不完整 — 把殘段留回 tail,等下個 packet 合
                        tail.extend_from_slice(&cursor[valid_up_to..]);
                        return out;
                    }
                    Some(skip) => {
                        // 中間有真錯誤 — 插 replacement char,繼續處理後面
                        out.push('\u{FFFD}');
                        cursor = &cursor[valid_up_to + skip..];
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::drain_utf8;

    #[test]
    fn ascii_passthrough() {
        let mut tail = Vec::new();
        assert_eq!(drain_utf8(&mut tail, b"hello"), "hello");
        assert!(tail.is_empty());
    }

    #[test]
    fn split_chinese_across_packets() {
        // 「中」= E4 B8 AD,切兩段 [E4 B8] [AD]
        let mut tail = Vec::new();
        let part1 = drain_utf8(&mut tail, &[0xE4, 0xB8]);
        assert_eq!(part1, "");
        assert_eq!(tail.len(), 2);
        let part2 = drain_utf8(&mut tail, &[0xAD]);
        assert_eq!(part2, "中");
        assert!(tail.is_empty());
    }

    #[test]
    fn three_packet_split() {
        // 「字」= E5 AD 97,切三段
        let mut tail = Vec::new();
        assert_eq!(drain_utf8(&mut tail, &[0xE5]), "");
        assert_eq!(drain_utf8(&mut tail, &[0xAD]), "");
        assert_eq!(drain_utf8(&mut tail, &[0x97]), "字");
        assert!(tail.is_empty());
    }

    #[test]
    fn ascii_then_split_multibyte() {
        let mut tail = Vec::new();
        // "hi中"切成 [h i E4 B8] [AD]
        assert_eq!(drain_utf8(&mut tail, &[b'h', b'i', 0xE4, 0xB8]), "hi");
        assert_eq!(drain_utf8(&mut tail, &[0xAD]), "中");
    }

    #[test]
    fn genuine_invalid_byte() {
        // 0xFF 是無論如何都不會出現的 UTF-8 byte
        let mut tail = Vec::new();
        let out = drain_utf8(&mut tail, &[b'a', 0xFF, b'b']);
        assert_eq!(out, "a\u{FFFD}b");
        assert!(tail.is_empty());
    }
}
