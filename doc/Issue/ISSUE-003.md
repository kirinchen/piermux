---
id: ISSUE-003
title: M1c — Tree view + tmux ls + 連線狀態
epic: EPIC-001
sprint: null
status: open
priority: P0
tasks: []
created: 2026-04-28
---

## Problem

Desktop 主畫面左邊 tree 顯示「所有 host × 所有 session」,連線狀態 icon (✓ / ⚠ / ○),折疊展開。配 [SPEC §3.1](../SPEC.md) + [SPEC §6.2](../SPEC.md)。

## Acceptance Criteria

- [ ] `list_sessions(host_id)` Tauri command:ssh + `tmux list-sessions -F '#{session_name}|#{session_attached}|#{session_activity}|#{session_windows}'`,parse 成 `Vec<Session>`
- [ ] 連線狀態 enum:`Connected | Disconnected | Connecting`,UI 對應 ✓ / ⚠ / ○
- [ ] Desktop tree component(shadcn/ui collapsible)兩層顯示(host → sessions)
- [ ] 每個 session 顯示 attached 狀態 + 最後活動時間(relative,例如 "5 min ago")
- [ ] Click session → 右邊 panel 顯示該 session placeholder(M1d 才接 capture)
- [ ] commit `M1c: tree view + tmux ls + connection status`

## Investigation / Notes

### 2026-04-28
- **Blocked on owner Q:** Sessions 是 cache 表還是 live query?SPEC §5 沒 `sessions` table,只有 `capture_cache`,隱含 live query。需確認。(task.md open questions)
- 相對時間("5 min ago")用 dayjs 還是手寫?加 dep 要先問 owner(CLAUDE.md 紅線)。
- SPEC §9.2 寫「每個 host 一條 persistent SSH 連線」,M1c 開始就鋪這個 pattern,不要 M1d 才補。
