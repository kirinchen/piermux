---
id: ISSUE-005
title: M1e — Send message + quick presets
epic: EPIC-001
sprint: null
status: open
priority: P1
tasks: []
created: 2026-04-28
---

## Problem

不需 attach,直接從 tree view / capture view 對 session 送一段文字 + Enter。配 [SPEC §3.4](../SPEC.md) + [SPEC §6.4](../SPEC.md)。

## Acceptance Criteria

- [ ] `send_message(host_id, session_name, payload, send_enter)` Tauri command,用 `tmux send-keys -l`(literal,不解讀特殊鍵)
- [ ] `send_enter=true` 時額外送一個 Enter
- [ ] UI:capture view 下方有輸入框 + [Send] / [Send + Enter]
- [ ] Quick presets 按鈕(預設:`/syncdesk`、`Stop (ESC)`、`Clear (Ctrl+L)`)
- [ ] Quick presets 從 `quick_presets` 表載入(SPEC §5),M1e 階段預設 hard-code seed,DB 編輯放 M3
- [ ] commit `M1e: send_message + quick presets`
