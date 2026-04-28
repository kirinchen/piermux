---
id: ISSUE-006
title: M1f — Attach mode 基礎 + xterm.js
epic: EPIC-001
sprint: null
status: open
priority: P0
tasks: []
created: 2026-04-28
---

## Problem

實作雙向 attach:russh PTY + xterm.js render + key forwarding。M1g(line buffer)的前置。配 [SPEC §6.5](../SPEC.md) + [SPEC §7.2](../SPEC.md) `AttachView.tsx`。

## Acceptance Criteria

- [ ] `attach_session(host_id, session_name, cols, rows, mode)` 建 SSH PTY 跑 `tmux attach -t <session>`,回 attach `session_id`
- [ ] `write_to_session(session_id, data)` 寫入 PTY
- [ ] `resize_session(session_id, cols, rows)` 調整 PTY 大小
- [ ] `detach_session(session_id)` 收尾(送 `Ctrl-B d` + 關 channel)
- [ ] PTY 輸出 emit `attach-output-<session_id>` event,frontend xterm.js 寫入 buffer
- [ ] xterm.js + xterm-addon-fit + xterm-addon-web-links 接好
- [ ] [Detach] 按鈕送 `Ctrl+B d` + 切回 capture view
- [ ] **這個 issue 預設 stream mode**(line buffer 邏輯是 M1g)
- [ ] commit `M1f: attach + xterm.js`
