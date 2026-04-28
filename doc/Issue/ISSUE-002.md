---
id: ISSUE-002
title: M1b — Host CRUD + Test Connection
epic: EPIC-001
sprint: SPRINT-2026-W18
status: open
priority: P0
tasks: []
created: 2026-04-28
---

## Problem

讓使用者能加 host、編 host、刪 host、按按鈕測連線。配 [SPEC §6.1](../SPEC.md) 列的 6 個 Tauri command。

## Acceptance Criteria

- [ ] 6 個 Tauri command 實作:`list_hosts` / `create_host` / `update_host` / `delete_host` / `test_connection` / `import_private_key`
- [ ] (繼承自 ISSUE-001) 第一次 `list_hosts` invoke 後,DB 確實落在 `%APPDATA%\dev.kirinchen.piermux\piermux.db`,4 張表都建
- [ ] `test_connection` 用 russh 連一次 + 跑 `whoami`,成功回 `Ok(())`,失敗回 `Err(String)` 含原因(timeout / auth fail / DNS)
- [ ] Desktop UI:host 列表 + [+ Add Host] dialog(shadcn/ui form),欄位對齊 hosts table
- [ ] Add 完 row 出現在列表;Delete 後消失;Edit 後欄位更新
- [ ] Test connection 成功 / 失敗 toast 正確顯示
- [ ] commit `M1b: host crud + test_connection`

## Investigation / Notes

### 2026-04-28 — Decisions(see [`NOTES.md` D-3, D-4](../../NOTES.md))
- 密碼:`auth_type='password'` 時,密碼用 keyring-rs 寫到 entry `piermux/host/{host_id}/password`,hosts table 不存(D-3)。
- `import_private_key`:M1b 只做 desktop path-based(直接寫 hosts.private_key_path 為檔案絕對路徑)。Android 邏輯推到 M2 / EPIC-002(D-4)。
- `test_connection` 用 russh 連 + 跑 `whoami`,失敗訊息 mapping 到 `Err(String)`(M1 階段不升 `thiserror`,依 CLAUDE.md)。

## Resolution

_(填於 status → resolved 時)_
