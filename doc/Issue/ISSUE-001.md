---
id: ISSUE-001
title: M1a — Tauri scaffold + DB
epic: EPIC-001
sprint: SPRINT-2026-W18
status: open
priority: P0
tasks: []
created: 2026-04-28
---

## Problem

需要一個能 build / run 的 Tauri 2.x 專案,含 SQLite migration 跑得起來。這是後續所有 M1b..M1h 的前置。

## Acceptance Criteria

- [ ] `npm create tauri-app@latest` 起 React + TS + Vite template
- [ ] `src-tauri/Cargo.toml` 設 Rust edition 2021,MSRV 1.80
- [ ] `tauri-plugin-sql` 接好,跑 [SPEC §5](../SPEC.md) schema 為第一份 migration:`hosts` / `ui_preferences` / `quick_presets` / `capture_cache` 四張表
- [ ] `npm run tauri dev` 在 Windows 起得來([CLAUDE.md](../../CLAUDE.md) 環境前提:Windows native + npm,**不是 pnpm**)
- [ ] DB 預設位置:`%APPDATA%\dev.kirinchen.piermux\piermux.db`(CLAUDE.md 路徑章節)
- [ ] commit 訊息 `M1a: tauri scaffold + sqlite migration`

## Investigation / Notes

### 2026-04-28
- **Blocked on owner Q:** host id 是 UUID 還是 user-provided string?(task.md open questions)沒拍板前 migration 的 hosts.id 不能拍。
- Linux dev env 上 `cargo check` OK,但 `tauri dev` 必須 Windows。Linux 端最多驗 Rust 編譯,UI 起不來不是 bug。

## Resolution

_(填於 status → resolved 時)_
