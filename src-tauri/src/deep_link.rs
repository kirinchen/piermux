//! `piermux://attach?host=<host>&session=<session>` —— 契約在 `doc/DEEP_LINK.md`。
//!
//! 這裡只做三件事,**一件都不多**:
//!   1. 把一條外部 URL 解析成 [`AttachRequest`](純字串,沒有 id、沒有指令、沒有路徑)
//!   2. 把它存成 pending(冷啟動時前端還沒 listen,事件會落空)
//!   3. 發事件給前端(熱啟動時前端已經在聽)
//!
//! **解析層不碰 DB、不連線、不決定要 attach 誰。** host 比對與 attach 全在前端既有流程上走
//! —— deep link 不開任何後端旁路,也就沒有「URL 能做到前端做不到的事」這種洞。
//!
//! 紅線(契約 §6):不吃內部 uuid、不吃指令 / 憑證、不新增 host、不 SSH 未登錄主機、不 new-session。

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// 前端監聽的事件名。熱啟動(app 已開)走這條。
pub const ATTACH_EVENT: &str = "deep-link://attach";

/// 一條 deep link 解析後的全部內容。就這兩個字串,不會再多。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AttachRequest {
    /// `hosts` 表的 `display_name` 或 `ssh_host`(不分大小寫比對,前端做)
    pub host: String,
    /// tmux session 名(區分大小寫)
    pub session: String,
}

/// 冷啟動的暫存:URL 在視窗長出來之前就到了,事件發了沒人接。
/// 前端 mount 時呼叫 [`take_pending_deep_link`] 把它取走(取走即清空,不會重播)。
#[derive(Default)]
pub struct PendingLink(Mutex<Option<AttachRequest>>);

/// 解析一條 URL。認不得就回 `None` —— 呼叫端一律當作「沒事發生」,不 panic、不猜。
///
/// 寬鬆的地方只有一處:未知 query 參數直接忽略(契約 §1,讓呼叫端能加參數而不打爛舊版)。
pub fn parse(raw: &str) -> Option<AttachRequest> {
    let url = tauri::Url::parse(raw).ok()?;
    if !url.scheme().eq_ignore_ascii_case("piermux") {
        return None;
    }
    // `piermux://attach?…` → host 段是動作名。少數平台會遞來 `piermux:attach?…`
    // (無 authority),那時動作落在 path 上,兩種都接。
    let action = match url.host_str() {
        Some(h) => h.to_string(),
        None => url.path().trim_start_matches('/').to_string(),
    };
    if !action.eq_ignore_ascii_case("attach") {
        return None; // 目前只有 attach 一個動作;其餘整條丟掉
    }
    let mut host = None;
    let mut session = None;
    for (k, v) in url.query_pairs() {
        match k.as_ref() {
            "host" => host = Some(v.into_owned()),
            "session" => session = Some(v.into_owned()),
            _ => {} // 未知參數:忽略,不報錯
        }
    }
    let host = host?;
    let session = session?;
    if host.trim().is_empty() || session.trim().is_empty() {
        return None;
    }
    Some(AttachRequest { host, session })
}

/// 收到一條 URL:解析 → 存 pending → 發事件 → 把視窗叫到前面。
///
/// 認不得的 URL 就地丟掉(只留一行 log)。**不通知前端、不彈錯誤** ——
/// 畸形 URL 是外部輸入的常態,不該變成使用者眼前的噪音。
pub fn handle_url(app: &AppHandle, raw: &str) {
    let Some(req) = parse(raw) else {
        eprintln!("[deep-link] ignored unparseable url: {raw}");
        return;
    };
    if let Some(state) = app.try_state::<PendingLink>() {
        if let Ok(mut slot) = state.0.lock() {
            *slot = Some(req.clone());
        }
    }
    let _ = app.emit(ATTACH_EVENT, &req);
    focus_main_window(app);
}

/// 熱啟動要聚焦既有視窗,不開第二個(契約 §5)。
pub fn focus_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// 前端 mount 時取走冷啟動暫存的那一條。取走即清空。
#[tauri::command]
pub fn take_pending_deep_link(state: State<'_, PendingLink>) -> Option<AttachRequest> {
    state.0.lock().ok()?.take()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(host: &str, session: &str) -> Option<AttachRequest> {
        Some(AttachRequest {
            host: host.into(),
            session: session.into(),
        })
    }

    #[test]
    fn parses_the_canonical_form() {
        assert_eq!(
            parse("piermux://attach?host=100.114.93.81&session=kelp"),
            req("100.114.93.81", "kelp")
        );
    }

    #[test]
    fn decodes_percent_escapes() {
        // 契約 §8:空白與中文都靠 encodeURIComponent 過來
        assert_eq!(
            parse("piermux://attach?host=dev-linux&session=my%20session"),
            req("dev-linux", "my session")
        );
        assert_eq!(
            parse("piermux://attach?host=dev-linux&session=%E9%87%8F%E5%8C%96"),
            req("dev-linux", "量化")
        );
    }

    #[test]
    fn ignores_unknown_params() {
        assert_eq!(
            parse("piermux://attach?host=h&session=s&foo=bar&cmd=rm%20-rf"),
            req("h", "s")
        );
    }

    #[test]
    fn accepts_the_authority_less_form() {
        assert_eq!(parse("piermux:attach?host=h&session=s"), req("h", "s"));
    }

    #[test]
    fn scheme_and_action_are_case_insensitive() {
        assert_eq!(parse("PIERMUX://ATTACH?host=h&session=s"), req("h", "s"));
    }

    #[test]
    fn rejects_everything_else() {
        for bad in [
            "https://example.com/attach?host=h&session=s", // 別的 scheme
            "piermux://detach?host=h&session=s",           // 未知動作
            "piermux://attach?host=h",                     // 缺 session
            "piermux://attach?session=s",                  // 缺 host
            "piermux://attach?host=&session=s",            // 空 host
            "piermux://attach?host=h&session=%20",         // 只有空白的 session
            "not a url at all",
            "",
        ] {
            assert_eq!(parse(bad), None, "should have rejected: {bad}");
        }
    }
}
