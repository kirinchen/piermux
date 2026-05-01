---
id: ISSUE-003
title: M1c — Tree view + tmux ls + 連線狀態
epic: EPIC-001
sprint: SPRINT-2026-W18
status: resolved
priority: P0
tasks: []
created: 2026-04-28
resolved: 2026-05-01
---

## Problem

Desktop 主畫面左邊 tree 顯示「所有 host × 所有 session」,連線狀態 icon (✓ / ⚠ / ○),折疊展開。配 [SPEC §3.1](../SPEC.md) + [SPEC §6.2](../SPEC.md)。

## Acceptance Criteria

- [x] `list_sessions(host_id)` Tauri command — **M1c real shipped 2026-04-30 commit `bf6bf44`**(`sessions.rs` 取代 `sessions_mock.rs`)。`ssh::run_command` 跑 `tmux list-sessions -F '#{session_name}|#{session_attached}|#{session_activity}|#{session_windows}'` + parse_sessions 切 `|` + epoch → RFC3339。Owner 2026-05-01 keyring fix 後驗到真 sessions 列表 ✓
- [x] 連線狀態 `HostConnectionStatus` enum + `host_status(host_id)` 命令 — **M1c real shipped**:host_status 內部跑 `ssh::test_connection`,Ok→Connected / Err→Disconnected。Owner 2026-05-01 驗證 host icon 變綠 ✓
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

### 2026-04-30 — M1c real shipped(commit `bf6bf44`,backend 換成 makiko)

`sessions.rs` 取代 `sessions_mock.rs`。`ssh::run_command` 共用 helper(連 + auth + open_session + exec + 收 SessionEvent stdout/stderr/exit + 收尾)。`build_auth` 從 hosts table 跟 keyring 拉憑證。`useHostStatus` 加 `staleTime: 30_000` 避免每次 mount 重 probe。

**Blocked by keyring bug** — list_sessions/host_status 對 password-auth 的 host 都會撞「password not in keyring」。詳見 ISSUE-002 收尾段 + `task.md` 進行中區。Owner workaround / 真 fix 之後就能驗。

### 2026-05-01 — keyring fix(Cargo.toml platform features)+ resolved

NOTES.md D-9 抓到根因:keyring 3.x 沒指定 platform feature → fallback mock backend,寫完 drop。`Cargo.toml` 加 `features = ["apple-native", "windows-native", "sync-secret-service"]` 修(commit `616279a`)。Owner 重編 + 重打密碼後,real list_sessions / host_status 都驗 ✓ → resolved。

## Resolution

**Resolved 2026-05-01.** Tree view + 連線狀態 + 真實 sessions 列表全 ship。

**收尾 timeline:**
- 2026-04-29:M1c mock backend ship(commit `5cd63f5`)— UI 結構先定,SSH unblock 後只換 backend。
- 2026-04-30:M1c real swap mock → makiko ship(commit `bf6bf44`),`ssh::run_command` 共用 helper 加進 `ssh.rs`。
- 2026-05-01:keyring fix(commit `616279a`,ISSUE-002 收尾連帶)解 password-auth host 的 list_sessions 黑箱,owner 驗到真 server tmux session 列表 ✓。

**Surprises:**
- 「先 mock 後 swap」策略很 work。Frontend / backend contract 從一開始就跟最終一樣(`Session` / `HostConnectionStatus` 結構不動),swap 當天只動 backend,沒回頭修任何 frontend code。值得在 M1d capture 也用同一招(等 SSH 慢就先回 mock 看 UI)。
- `useHostStatus` `staleTime: 30_000` 加得對 — 沒這層,每次 mount tree 就重打 SSH probe 一輪,點開折開 host 會抖。

**留尾:**
- SPEC §9.2「每 host 一條 persistent SSH 連線」目前還沒做(每次 list_sessions / host_status 都開新 connection),M1d capture 對效能要求高(< 3 秒 / 15 captures),那邊評估再決定要不要做。
