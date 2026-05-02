---
id: ISSUE-005
title: M1e — Send message + quick presets
epic: EPIC-001
sprint: SPRINT-2026-W18
status: in_progress
priority: P1
tasks: []
created: 2026-04-28
started: 2026-05-02
---

## Problem

不需 attach,直接從 tree view / capture view 對 session 送一段文字 + Enter。配 [SPEC §3.4](../SPEC.md) + [SPEC §6.4](../SPEC.md)。

## Acceptance Criteria

### Backend(完成,本 commit)

- [x] `send_message(host_id, session_name, payload, send_enter, literal)` Tauri command(`messaging.rs` 新模組)
- [x] **加 `literal: bool` 參數** — SPEC §6.4 寫死 `-l`,但 SPEC §3.4 預設 presets 含 ESC / Ctrl+L 需要 named-key 路徑,SPEC 內部模糊。NOTES D-12 記。`literal=true` → `tmux send-keys -l ...`;`literal=false` → `tmux send-keys ...`(payload 視作 tmux key spec)
- [x] `send_enter=true` 時額外跑 `tmux send-keys -t <session> Enter`
- [x] 一條 SSH connection 跑 1-2 個 channel(`SshSession::exec` reuse)

### Frontend(完成,本 commit)

- [x] `SendBar.tsx` 新元件:文字輸入 + [Send] / [Send + ↩] + 三個 Quick presets
- [x] **顯示位置:SessionPanel 的 capture mode 下方**(attach mode 已有 LineBufferInput / Stream input,SendBar 重複所以不顯示)
- [x] Quick presets 預設 hardcode 3 個(對齊 SPEC §3.4):
  - `/syncdesk` — literal + Enter(打給 Claude Code 同步桌面狀態的 prompt)
  - `Stop (ESC)` — named key `Escape`,不送 Enter
  - `Clear (Ctrl+L)` — named key `C-l`,不送 Enter
- [x] IME aware(`isComposing` 護欄)— 文字輸入 Enter 不會在中文組字時誤觸
- [x] 預設 input Enter 行為 = Send + ↩(直覺,聊天介面感)。`[Send]`(不加 Enter)留給「想填內容但不 commit」場景

### M1e 範圍外(交給其他 issue / milestone)

- [ ] Quick presets 從 `quick_presets` DB table 載入 + 編輯 UI — **本 issue acceptance 原寫「M1e hard-code seed」對齊**;DB 編輯交給 M3 polish(task.md backlog)。M1e 連 DB 讀都沒做,frontend 直接 hardcode 3 個 default
- [ ] commit `M1e: send_message + quick presets` — 本 commit

### 等 owner Windows 真實環境驗

- [ ] 點 capture 模式下方 `[/syncdesk]` 按鈕 → server 端 tmux session 看到 `/syncdesk` + Enter,Claude Code 收到指令
- [ ] 點 `[Stop (ESC)]` → server 端收到 ESC,Claude 任務中斷
- [ ] 點 `[Clear (Ctrl+L)]` → server 端 shell 清屏(若 attach 中也看得到)
- [ ] 自訂文字 + Enter → 送對應 prompt + commit

## Investigation / Notes

### 2026-05-02 — Backend + Frontend ship

NOTES.md D-12 詳細記 SPEC §6.4 模糊處 + 為什麼加 `literal` 參數。

**設計:**
- `messaging.rs` 共用 `ssh::connect` + `SshSession::exec`(M1d 抽出來的一條 SSH 跑多 channel pattern)
- `shell_quote` helper 跟 `capture.rs` / `attach.rs` 重複 — 三處都是 ~5 行 POSIX 單引號逃脫,對齊 CLAUDE.md「Three similar lines 比 premature abstraction 好」,先不抽
- SendBar 在 capture mode 顯示,attach mode 不顯示。Attach 模式 owner 用 LineBufferInput / Stream 直接送即可,SendBar 重複沒必要
