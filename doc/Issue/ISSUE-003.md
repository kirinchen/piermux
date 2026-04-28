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

### 2026-04-28 — Decisions(see [`NOTES.md` D-2](../../NOTES.md))
- Sessions 走 live query:每次 invoke `list_sessions(host_id)` 都跑 SSH(D-2)
- TanStack Query key:`['sessions', hostId]`,refresh button = invalidate
- 相對時間 ("5 min ago") 用 `date-fns`(輕量、tree-shakable、主流維護中)— 加 dep 不問,直接加(CLAUDE.md「小事直接動手」)
- SPEC §9.2「每個 host 一條 persistent SSH 連線」:M1c 開始就鋪 pattern,不要 M1d 才補
