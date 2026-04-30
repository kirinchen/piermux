---
id: SPRINT-2026-W18
start: 2026-04-27
end: 2026-05-03
goal: "Land M1a (Tauri scaffold + DB) and M1b (Host CRUD + Test Connection); backfill remaining M1c-M1h to backlog"
issues: [ISSUE-001, ISSUE-002, ISSUE-003]
status: active
---

## Sprint Goal

對齊 [EPIC-001](../Epic/EPIC-001.md) 的前兩個 milestone:把空白 repo 推到「desktop 上能加 host、能 test connection」的狀態。M1c..M1h 已落成 ISSUE-003..008 但本 sprint 不承諾 — W18 剩 5 天,SPEC §8 估 M1 整體 5-7 天,先穩兩個。

## Committed Issues

- [ISSUE-001](../Issue/ISSUE-001.md) M1a — Tauri scaffold + DB · P0
- [ISSUE-002](../Issue/ISSUE-002.md) M1b — Host CRUD + Test Connection · P0

## Daily Notes

_(agents and humans append dated notes as they work)_

### 2026-04-28
- Adopted mentor framework (development mode). Scaffolded `doc/` tree.
- Owner 把舊 SPEC.md 改名 CLAUDE.md,寫了真正的 SPEC.md(commit `ea108af`)。Agent 把 SPEC.md 移到 `doc/SPEC.md`,修 mentor.yaml + ARCHITECTURE.md link。
- 建 EPIC-001 + ISSUE-001..008(對齊 SPEC §8 M1a..M1h)。
- Owner update CLAUDE.md(commit `fb17cc4`)成 vibe coding autonomy 風格 — 「小事自己決定,大事再問」。
- Agent 把先前 4 條 schema open questions 自行拍板(`NOTES.md` D-1..D-4),Issues unblock。
- 建 `NOTES.md`(closes task.md `T-1`)。
- **M1a (ISSUE-001) `resolved`** — agent 在 Linux 把 scaffold + plugin-sql + migration 寫好(commit `9b09716`),VS Code launch 配套(`81067e2`),owner 在 Windows `npm run tauri dev` 跑通(2 分鐘 cargo build)。DB 路徑驗證 lazy init 留給 ISSUE-002 第一個 `list_hosts` invoke 時驗。

### 2026-04-29
- **M1b/1 backend(commit `e0c6994`)**:5 個 Tauri commands(list/create/update/delete/import_private_key)+ hosts repo(sqlx pool + apply_schema)+ keyring 接好。test_connection stub。Cargo.toml 加 7 deps(uuid/keyring/sqlx/tokio/anyhow/chrono),MSRV 1.80→1.85。
- **M1b/1.5 spike timeout(commit `957cdb0`)**:russh 0.60.1 拉的 ed25519-dalek 3.0.0-pre.6 跟新版 pkcs8 API 不容,upstream master 還沒修。NOTES.md D-6。
- **M1b/2 frontend(commit `40930b3`)**:Tailwind 4 + TanStack Query + 手寫 shadcn-style 5 個 components + HostsView + HostFormDialog + 5 個 hooks。`npm run build` 過。
- **ISSUE-002 status**:`in_progress`(test_connection acceptance 還沒 met,等 M1b/1.5)。
- Owner 在 Windows 端跑 M1b/2,新增 host work + DB 落到對的位置 ✓(closes ISSUE-001 acceptance #5)。test_connection stub 訊息照預期。
- **dead_code warnings 修(commit `7cd3f3d`)**:`touch_last_used` / `read_password` / `AuthMaterial` 欄位加 `#[allow(dead_code)]` + comment 解釋等 M1c+ 用。
- **M1c 起步(本 commit)**:owner 拍板「先 4 後 2/3 等 1」 — 路徑 4 = UI 用 mock SSH backend 推進視覺。加 `Session` / `HostConnectionStatus` types + `sessions_mock.rs` backend module + `HostTree` / `SessionPanel` 元件 + `HostsView` 改 split layout。Frontend 跟 backend contract 從一開始就跟最終一樣,SSH unblock 後只換 backend 實作。
- **ISSUE-003 status**:`in_progress`(real SSH 等 M1b/1.5)。

### 2026-04-30
- **M1b/1.5 D-7 makiko swap(commits `9fd5004` / `6170436` / `e22ebf5`)**:owner 拍板「換 SSH lib」,從 russh 切到 makiko 0.2.5(stable,不踩 pre-release dep)。SPEC §13 deviation 寫進 NOTES.md D-7。Owner Windows 端 cargo build + test_connection 真實連線通過 ✓。
- **apply_schema fix(commit `ba520cd`)**:fresh DB scenario 抓到 bug — split SQL by `;` 後第一個 chunk 含 leading `--` 註解 + `CREATE TABLE hosts (...)`,被 `starts_with("--")` filter 整段 skip → hosts table 不會建。改成先逐行 strip `--` 註解再 split。
- **M1c real(commit `bf6bf44`)**:sessions backend 從 mock 換成真 makiko 實作。加 `ssh::run_command(host, port, user, auth, cmd) -> Result<String>` 共用 helper。`sessions.rs` 取代 `sessions_mock.rs`,跑 `tmux list-sessions -F` 拿格式化輸出再 parse。`useHostStatus` 加 `staleTime: 30_000` 避免每次 mount 都重 SSH probe。
- **keyring bug surfaced(workaround + create_host validation `b3f5395`)**:owner 創 host 後 list_sessions 報「password not in keyring」。`create_host` 加 validation 防再發生,workaround 是 owner 編輯既有 host 重打密碼。**等 owner 驗收 workaround 是否有效**;若無效則是 keyring 3.6.3 對 Windows Credential Manager 邊角問題,要在 `secret.rs` 加 logging debug。
- **handoff prep(本 commit)**:NOTES.md D-8 寫 handoff briefing,ISSUE-002/003 acceptance 同步現況,task.md 加當前 actionable + M1d 預備。Owner 評估換 Windows-local agent 接手(更快 cargo build + tauri dev iterate)。
- **ISSUE-002 status**:`in_progress`(差最後 keyring 收尾就 resolved)。
- **ISSUE-003 status**:`in_progress`(等 keyring + 真 list_sessions 驗)。

## Retrospective

_(drafted when status transitions to `review`; filled when `done`)_

### What went well

### What could be improved

### Action items

- [ ] ...
