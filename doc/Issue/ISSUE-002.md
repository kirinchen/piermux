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
- [ ] `test_connection` 用 russh 連一次 + 跑 `whoami`,成功回 `Ok(())`,失敗回 `Err(String)` 含原因(timeout / auth fail / DNS)
- [ ] Desktop UI:host 列表 + [+ Add Host] dialog(shadcn/ui form),欄位對齊 hosts table
- [ ] Add 完 row 出現在列表;Delete 後消失;Edit 後欄位更新
- [ ] Test connection 成功 / 失敗 toast 正確顯示
- [ ] commit `M1b: host crud + test_connection`

## Investigation / Notes

### 2026-04-28
- **Blocked on owner Q:** `auth_type='password'` 的 password 走 keyring-rs(SPEC §5 結尾「密碼存 OS keystore」),但 hosts table 沒 `secret_alias` 欄位 — schema 要不要改?(task.md open questions)
- `import_private_key` 對 desktop 是 path-based、Android 是 import bytes 進 keystore。M1b 階段只做 desktop path,M2 再統合(EPIC-002 範圍)。

## Resolution

_(填於 status → resolved 時)_
