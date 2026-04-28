---
id: SPRINT-2026-W18
start: 2026-04-27
end: 2026-05-03
goal: "Land M1a (Tauri scaffold + DB) and M1b (Host CRUD + Test Connection); backfill remaining M1c-M1h to backlog"
issues: [ISSUE-001, ISSUE-002]
status: active
---

## Sprint Goal

對齊 [EPIC-001](../Epic/EPIC-001.md) 的前兩個 milestone:把空白 repo 推到「desktop 上能加 host、能 test connection」的狀態。M1c..M1h 已落成 ISSUE-003..008 但本 sprint 不承諾 — W18 只剩 5 天,SPEC §8 估 M1 整體 5-7 天,先穩 2 個 milestone。

> **Blocker:** ISSUE-001 / ISSUE-002 都阻塞在 owner 的 schema open questions(host id 來源、password keystore 欄位)— 見 `../task.md` open questions。沒拍板前 migration 與 host CRUD 不能寫死。

## Committed Issues

- [ISSUE-001](../Issue/ISSUE-001.md) M1a — Tauri scaffold + DB · P0
- [ISSUE-002](../Issue/ISSUE-002.md) M1b — Host CRUD + Test Connection · P0

## Daily Notes

_(agents and humans append dated notes as they work)_

### 2026-04-28
- Adopted mentor framework (development mode). Scaffolded `doc/` tree.
- Owner 把舊 SPEC.md 改名 CLAUDE.md,寫了真正的 SPEC.md(commit `ea108af`)。Agent 把 SPEC.md 移到 `doc/SPEC.md`,修 mentor.yaml + ARCHITECTURE.md link。
- 建 EPIC-001(Desktop M1) + ISSUE-001..008(對齊 SPEC §8 M1a..M1h)。Sprint 承諾 ISSUE-001 + 002。

## Retrospective

_(drafted when status transitions to `review`; filled when `done`)_

### What went well

### What could be improved

### Action items

- [ ] ...
