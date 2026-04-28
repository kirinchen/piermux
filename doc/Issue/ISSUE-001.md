---
id: ISSUE-001
title: M1a — Tauri scaffold + DB
epic: EPIC-001
sprint: SPRINT-2026-W18
status: in_progress
priority: P0
tasks: []
created: 2026-04-28
---

## Problem

需要一個能 build / run 的 Tauri 2.x 專案,含 SQLite migration 跑得起來。這是後續所有 M1b..M1h 的前置。

## Acceptance Criteria

- [x] `npm create tauri-app@latest` 起 React + TS + Vite template
- [x] `src-tauri/Cargo.toml` 設 Rust edition 2021,MSRV 1.80
- [x] `tauri-plugin-sql` 接好,跑 [SPEC §5](../SPEC.md) schema 為第一份 migration:`hosts` / `ui_preferences` / `quick_presets` / `capture_cache` 四張表
- [ ] `npm run tauri dev` 在 Windows 起得來([CLAUDE.md](../../CLAUDE.md) 環境前提:Windows native + npm,**不是 pnpm**) — **owner Windows 驗**
- [ ] DB 預設位置:`%APPDATA%\dev.kirinchen.piermux\piermux.db`(CLAUDE.md 路徑章節) — **owner Windows 驗**
- [x] commit 訊息 `M1a: tauri scaffold + sqlite migration`

## Investigation / Notes

### 2026-04-28 — Decisions(see [`NOTES.md` D-1, D-3](../../NOTES.md))
- `hosts.id` = UUID v4(synthetic)。Migration 用 `id TEXT PRIMARY KEY`,backend `create_host` 內生 `uuid::Uuid::new_v4().to_string()`(uuid 加 dep 留給 ISSUE-002)。
- 不加 `secret_alias` 欄位,keyring entry 從 `host_id` 推導(D-3)。

### 2026-04-28 — Implementation(Linux end done,等 owner Windows 驗)
- Scaffold + rename + MSRV + plugin-sql 接妥(細節見 [`NOTES.md` Implementation log](../../NOTES.md))
- Linux dev env 缺 webkit2gtk + gtk3,`cargo check` 在 link 階段會掉,**沒在這邊跑**(CLAUDE.md「不自己 apt install」)
- `npm install` + `npx tsc --noEmit` 在 Linux 都過
- Owner 在 Windows 跑 `npm run tauri dev`:
  - 起得來 → 勾上面兩條剩下的 acceptance,把 status 改 `resolved`
  - 起不來 → 把錯誤訊息貼回來,我修

## Resolution

_(填於 status → resolved 時)_
