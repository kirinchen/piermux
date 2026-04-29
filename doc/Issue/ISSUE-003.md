---
id: ISSUE-003
title: M1c — Tree view + tmux ls + 連線狀態
epic: EPIC-001
sprint: SPRINT-2026-W18
status: in_progress
priority: P0
tasks: []
created: 2026-04-28
---

## Problem

Desktop 主畫面左邊 tree 顯示「所有 host × 所有 session」,連線狀態 icon (✓ / ⚠ / ○),折疊展開。配 [SPEC §3.1](../SPEC.md) + [SPEC §6.2](../SPEC.md)。

## Acceptance Criteria

- [~] `list_sessions(host_id)` Tauri command — **M1c MOCK**(`sessions_mock.rs`),回 hard-coded sessions 對應 host_id hash。SSH unblock 後從 `sessions_mock` 改指真實 `tmux list-sessions` 實作,frontend / `Session` type / hook / UI 都不變
- [~] 連線狀態 `HostConnectionStatus` enum (connected / disconnected / connecting) + `host_status(host_id)` 命令(MOCK)。UI ✓ (CheckCircle2) / ⚠ (AlertTriangle) / ○ (Loader2 spinning)
- [x] Desktop tree component — 自寫 collapsible(useState<Set<string>> + ChevronRight/Down,沒裝 radix collapsible),兩層顯示 host → sessions,展開才 lazy fetch
- [x] 每個 session 顯示 attached / idle 狀態 + 最後活動相對時間(`Intl.RelativeTimeFormat zh-TW`,沒加 dep)
- [x] Click session → 右側 `SessionPanel` 顯示 host info + session metadata + M1d capture placeholder
- [x] commit `M1c: tree view + sessions mock backend` — commit `5cd63f5`

## Investigation / Notes

### 2026-04-28 — Decisions(see [`NOTES.md` D-2](../../NOTES.md))
- Sessions 走 live query:每次 invoke `list_sessions(host_id)` 都跑 SSH(D-2)
- TanStack Query key:`['sessions', 'list', hostId]`,refresh button = invalidate(M1d 才補)
- SPEC §9.2「每個 host 一條 persistent SSH 連線」:等 SSH unblock 後在 backend module 實作,frontend 看不見

### 2026-04-29 — M1c shipped(commit `5cd63f5`,backend mock)

- Backend:`Session` + `HostConnectionStatus` 加在 `hosts.rs`,mock 邏輯獨立 `sessions_mock.rs`(SSH unblock 後在 lib.rs invoke_handler 改指真實 module 即可)
- Mock seed:`host_id` byte fold → 0..3 sessions per host(deterministic);`host_status` 7 取 1 顯示 disconnected 讓 UI 看得到 ⚠ 狀態
- Frontend:`useSessions(hostId, enabled)` + `useHostStatus(hostId)` hooks、`HostTree` 自寫 collapsible(展開才 fetch sessions)、`SessionPanel` 右側 placeholder、`HostsView` 改 split layout(左 320px / 右彈性)
- 相對時間用 `Intl.RelativeTimeFormat`(原生,沒加 `date-fns` dep — 比之前計畫更簡)

**剩下開放:** acceptance 兩條 `[~]`(real list_sessions / host_status)等 ed25519-dalek 之後 SSH 接回。整個 issue → resolved 條件 = SSH 接回後 + `sessions_mock` 換掉 + 跑得起來。
