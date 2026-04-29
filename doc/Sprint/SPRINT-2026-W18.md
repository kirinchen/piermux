---
id: SPRINT-2026-W18
start: 2026-04-27
end: 2026-05-03
goal: "Land M1a (Tauri scaffold + DB) and M1b (Host CRUD + Test Connection); backfill remaining M1c-M1h to backlog"
issues: [ISSUE-001, ISSUE-002]
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
- **M1b/2 frontend(本 commit)**:Tailwind 4 + TanStack Query + 手寫 shadcn-style 5 個 components + HostsView + HostFormDialog + 5 個 hooks。`npm run build` 過。
- **ISSUE-002 status**:`in_progress`(test_connection acceptance 還沒 met,等 M1b/1.5)。

## Retrospective

_(drafted when status transitions to `review`; filled when `done`)_

### What went well

### What could be improved

### Action items

- [ ] ...
