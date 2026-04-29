// MOCK M1c —— list_sessions 等 SSH unblock 才換成真的
// `tmux list-sessions -F '...'`(SPEC §6.2)。
//
// Mock 邏輯:用 host_id 的字元 hash 決定 session 數量(0..3),固定的
// 名字 / 狀態 / 活動時間,讓不同 host 看起來不一樣。
//
// 換成真的 SSH 時把 #[tauri::command] 從 lib.rs invoke_handler 對應的
// 名字改指實作即可,frontend 跟 Session 型別都不用動。

use crate::hosts::{HostConnectionStatus, Session};
use chrono::{Duration, Utc};

// host_id stable hash 0..u32 — 不是 cryptographic,只要 deterministic
fn host_seed(host_id: &str) -> u32 {
    host_id.bytes().fold(0u32, |acc, b| acc.wrapping_mul(31).wrapping_add(u32::from(b)))
}

#[tauri::command]
pub async fn list_sessions(host_id: String) -> Result<Vec<Session>, String> {
    let seed = host_seed(&host_id);
    let count = (seed % 4) as usize; // 0..3 個 mock session
    let now = Utc::now();
    let templates = [
        ("claude-agent-foo", true, 5),
        ("claude-agent-bar", false, 12),
        ("training", true, 1),
        ("ibkr-bot", false, 120),
    ];
    let sessions = (0..count)
        .map(|i| {
            let (name_base, attached, mins_ago) = templates[i % templates.len()];
            let name = if i < templates.len() {
                name_base.to_string()
            } else {
                format!("{name_base}-{i}")
            };
            Session {
                name,
                attached,
                activity: (now - Duration::minutes(mins_ago)).to_rfc3339(),
                windows: 1 + (i as i64 % 3),
            }
        })
        .collect();
    Ok(sessions)
}

#[tauri::command]
pub async fn host_status(host_id: String) -> Result<HostConnectionStatus, String> {
    // M1c 階段:hash 末位 == 0 假裝連不上(讓 UI 能看到 ⚠ 圖案)
    // 不然全綠太單調。換成真 SSH 後,實作改成 ping 一次。
    let seed = host_seed(&host_id);
    Ok(if seed % 7 == 0 {
        HostConnectionStatus::Disconnected
    } else {
        HostConnectionStatus::Connected
    })
}
