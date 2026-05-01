---
id: ISSUE-006
title: M1f — Attach mode 基礎 + xterm.js
epic: EPIC-001
sprint: SPRINT-2026-W18
status: in_progress
priority: P0
tasks: []
created: 2026-04-28
started: 2026-05-01
---

## Problem

實作雙向 attach:russh PTY + xterm.js render + key forwarding。M1g(line buffer)的前置。配 [SPEC §6.5](../SPEC.md) + [SPEC §7.2](../SPEC.md) `AttachView.tsx`。

## Acceptance Criteria

### Backend(完成,本 commit)

- [x] `attach_session(host_id, session_name, cols, rows)` 建 SSH PTY 跑 `tmux attach -t <session>`,回 attach `session_id`(UUID v4)。**簽名拿掉 `mode` 參數** — 對齊 SPEC §6.5 註解「mode 影響 frontend 行為,backend 不變」,既然 backend 不變,參數就不放(line buffer 全在前端)
- [x] `write_to_session(session_id, data)` — `makiko::Session::send_stdin(Bytes)`
- [x] `resize_session(session_id, cols, rows)` — `makiko::Session::window_change(WindowChange)`
- [x] `detach_session(session_id)` — registry remove,Drop 觸發 `session.close()` + abort reader task。**沒實作「自動送 Ctrl-B d」**:detach 是「離開 piermux 的觀察視窗」,不該關 server 端 tmux session(預設 attach 行為)。owner 真的要 detach tmux 自己按 `Ctrl-B d`(stream mode 字元直送)
- [x] PTY 輸出 emit `attach-output-<session_id>` event(payload = `String`,UTF-8 lossy)
- [x] 額外 emit `attach-closed-<session_id>` event,server 端 EOF / exit 時 frontend 自動切回 capture
- [x] xterm.js / addon-fit / addon-web-links 接好(M1d 就裝了,M1f reuse)
- [x] [Detach] 按鈕 — SessionPanel header 加 [Attach] / [Detach] toggle button + 模式 badge

### Frontend(完成,本 commit)

- [x] SessionPanel `mode: 'capture' | 'attach'` state — capture 模式 = 既有的唯讀 + Tauri capture-updated listener;attach 模式 = `attachSession` 拿 id + `term.options.disableStdin = false` + `onData` → `writeToSession` + `attach-output-<id>` listener → `term.write` + `onResize` → `resizeSession`
- [x] **stream mode**(預設,本 issue 範圍)— 字元即時送(像 colony / vim 體驗)。Mode badge + footer warning 提醒 user「M1g 才有 line buffer」
- [x] Mode 切換時的 cleanup:`onData IDisposable.dispose()` + `unlistenOutput()` + `unlistenClosed()` + `detachSession(id)` + `term.options.disableStdin = true`(回 capture 唯讀)
- [x] xterm.js cols/rows 用 `term.cols` / `term.rows`(由 `FitAddon` 算過)當 `attachSession` 初值,`onResize` 接 `ResizeObserver` → `fit.fit()` → 觸發 → `resizeSession`,跟 SSH server 端同步 PTY 大小

### 等 owner Windows 真實環境驗

- [ ] 點 [Attach] → 進 attach 模式,看到 tmux 重畫 + 鍵盤打字 server 收到
- [ ] Ctrl+C / vim / less 等 stream-mode 場景 work
- [ ] 視窗 resize → tmux 重畫不亂(window_change 通)
- [ ] [Detach] → 切回 capture,server 端 tmux session 仍在 ✓
- [ ] commit `M1f: attach + xterm.js` — 本 commit

## Investigation / Notes

### 2026-05-01 — Backend + Frontend ship

**設計選擇:**

- **每個 attach 一條獨立 SSH connection** — 不跟 capture pool 共用。capture 跑短命 `exec` channel,attach 是長命 PTY channel,生命週期完全不同。混用會讓 attach 結束時 capture 還在跑的場景變棘手。
- **`AttachRegistry: Mutex<HashMap<String, AttachHandle>>`** — `tokio::sync::Mutex`,因為 `send_stdin` 是 async。`AttachHandle` 持有 `Arc<SshSession>`(連線 anchor)+ `makiko::Session`(channel handle,Clone-cheap)+ `Option<JoinHandle>`(reader task)。
- **Drop semantics:** detach_session 只做 `map.remove(&id)`,Drop impl 跑 `session.close()` + `task.abort()`。`Arc<SshSession>` 也跟著 drop → SshSession Drop 把 makiko Client drive task abort。整個鏈乾淨。
- **PTY 輸出 emit `String`(UTF-8 lossy)而非 `Vec<u8>` / base64** — 簡單。Terminal 內容絕大多數是 UTF-8 + ASCII ANSI escape;非 UTF-8 byte 變 `?` 在顯示上可接受。Owner 真的有 binary terminal stream 需求(罕見)再切 base64。
- **`mode` 參數 backend 不要** — SPEC §6.5 寫「mode 影響 frontend 行為,backend 不變」。既然 backend 邏輯不分支,簽名也不接,讓 contract 清楚。M1g 在 frontend 加 line buffer 的時候 backend 完全不動。
- **`detach_session` 不送 Ctrl-B d** — SPEC §3.2 講 [Detach] 按鈕「送 Ctrl-B d」,但仔細想:這把 server 端 tmux client(我們)斷掉的同時,我們已經 close channel 了 server 自然 detach。送 Ctrl-B d 反而多餘 + 有 race(send_stdin 還沒到 server 連線就斷)。Stream mode user 真的想退 tmux 自己打 Ctrl-B d 即可。

**已知限制 / 留尾:**
- Stream mode user 打中文 / 多 byte 字元應該 OK(JS string → UTF-8 over IPC → SSH PTY UTF-8),但沒驗證過 IME 組字過程體驗。M1g line buffer 接好後 IME 體驗會明顯好(不會打到一半送出去)。
- M1f 沒做「重連 / auto-reconnect」 — server 斷線就直接 emit `attach-closed`,user 要自己再點 [Attach]。M3 polish 才做 auto-reconnect。
- xterm `term.cols / term.rows` 在 `fit.fit()` 完之前是 default 80x24,`attach_session` 的初值有可能比真實 container 小 2-3 行/欄。`onResize` 立刻補上,實務上感覺不到(server 端 tmux 在 first window_change 後重畫)。
