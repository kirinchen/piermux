---
id: ISSUE-002
title: M1b — Host CRUD + Test Connection
epic: EPIC-001
sprint: SPRINT-2026-W18
status: in_progress
priority: P0
tasks: []
created: 2026-04-28
---

## Problem

讓使用者能加 host、編 host、刪 host、按按鈕測連線。配 [SPEC §6.1](../SPEC.md) 列的 6 個 Tauri command。

## Acceptance Criteria

### M1b/1 backend(本 sub-commit 範圍)

- [x] 5 個 Tauri command 實作:`list_hosts` / `create_host` / `update_host` / `delete_host` / `import_private_key`
- [→] `test_connection` **stub 中** — `Err("test_connection 暫時下線 ...")`,等 M1b/1.5 接回 russh(NOTES.md D-6)
- [ ] (繼承自 ISSUE-001) 第一次 `list_hosts` invoke 後,DB 確實落在 `%APPDATA%\dev.kirinchen.piermux\piermux.db`,4 張表都建 — owner Windows 驗

### M1b/1.5 spike(平行做)

- [ ] Spike `[patch.crates-io] ed25519-dalek = { git = "..." }` 找/做修好 pkcs8 API 的 fork,接回 russh,真實 `test_connection` 上線

### M1b/2 frontend(下個 sub-commit 範圍)

- [ ] Tailwind 4 + shadcn install
- [ ] Desktop UI:host 列表 + [+ Add Host] dialog(shadcn/ui form),欄位對齊 hosts table
- [ ] Add 完 row 出現在列表;Delete 後消失;Edit 後欄位更新
- [ ] Test connection 按鈕(M1b/1.5 接回 russh 後)成功 / 失敗 toast 正確顯示
- [ ] commit `M1b/2: host list UI + add dialog`

## Investigation / Notes

### 2026-04-28 — Decisions(see [`NOTES.md` D-3, D-4](../../NOTES.md))
- 密碼:`auth_type='password'` 時,密碼用 keyring-rs 寫到 entry `piermux/host/{host_id}/password`,hosts table 不存(D-3)。
- `import_private_key`:M1b 只做 desktop path-based(直接寫 hosts.private_key_path 為檔案絕對路徑)。Android 邏輯推到 M2 / EPIC-002(D-4)。
- `test_connection` 用 russh 連 + 跑 `whoami`,失敗訊息 mapping 到 `Err(String)`(M1 階段不升 `thiserror`,依 CLAUDE.md)。

### 2026-04-29 — M1b/1 backend 完成(stub SSH)

- 5 個 commands + DB CRUD 實作完(`hosts.rs` / `secret.rs` / `commands.rs` / `lib.rs`)
- `test_connection` stub 中(`ssh.rs` 留 signature + `AuthMaterial` enum,內部回 `Err`)— 卡在 russh dep 拉 broken `ed25519-dalek 3.0.0-pre.6`,owner 拍板 A+E hybrid(NOTES.md D-6)
- Linux dev 端 cargo check 因 `atk-sys` system lib 缺(CLAUDE.md「不自己 apt install」)沒辦法跑完,Rust source 對到 std + sqlx + keyring + uuid + chrono 都是常規寫法,owner Windows 端跑 `npm run tauri dev` 驗
- 接下來:平行 spike M1b/1.5(ed25519-dalek fork patch)+ M1b/2 frontend(shadcn install + Add Host dialog)

## Resolution

_(填於 status → resolved 時)_
