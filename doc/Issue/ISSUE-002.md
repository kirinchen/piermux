---
id: ISSUE-002
title: M1b — Host CRUD + Test Connection
epic: EPIC-001
sprint: SPRINT-2026-W18
status: resolved
priority: P0
tasks: []
created: 2026-04-28
resolved: 2026-05-01
---

## Problem

讓使用者能加 host、編 host、刪 host、按按鈕測連線。配 [SPEC §6.1](../SPEC.md) 列的 6 個 Tauri command。

## Acceptance Criteria

### M1b/1 backend(完成)

- [x] 5 個 Tauri command 實作:`list_hosts` / `create_host` / `update_host` / `delete_host` / `import_private_key`
- [x] `test_connection` 真實實作 — makiko 0.2.5(D-7 deviation 從 russh 換)。Owner 2026-04-30 Windows 端真實連線驗 ✓
- [x] (繼承自 ISSUE-001) 第一次 `list_hosts` invoke 後,DB 確實落在 `%APPDATA%\dev.kirinchen.piermux\piermux.db`,4 張表都建 ✓

### M1b/1.5 SSH unblock(完成,改走 D-7 而非原計畫 fork)

- [x] **改走 makiko swap** 而非 ed25519-dalek fork patch — D-6 spike timeout 後 owner 拍板換 lib,commits `9fd5004` / `6170436` / `e22ebf5`。Owner Windows 真實 SSH 連線 ✓

### M1b/2 frontend(完成)

- [x] Tailwind 4 + TanStack Query + radix-ui 手寫 shadcn-style components 安裝完
- [x] Desktop UI:host 列表 + [+ 新增 Host] dialog(自訂 shadcn-style form),欄位對齊 hosts table
- [x] Add 完 row 出現在列表;Delete 後消失(window.confirm);Edit 後欄位更新
- [x] Test connection 按鈕真實連線通過 ✓(2026-04-30 owner Windows 驗)
- [x] commit 訊息 `M1b/2: host list UI + add dialog` — commit `40930b3`

### 收尾(blocking resolved)

- [x] keyring bug — root cause: `Cargo.toml` 沒指定 keyring platform feature → 跑 mock backend(per-Entry in-memory,寫完即丟)。`Cargo.toml` 加 `features = ["apple-native", "windows-native", "sync-secret-service"]` 修(commit `616279a`,NOTES.md D-9)。`b3f5395` validation 保留作 defense-in-depth。**Owner 2026-05-01 Windows 端驗證:重編 + 編輯 host 重打密碼 → list_sessions 拉到真 server tmux session 列表 ✓**

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

### 2026-04-29 — M1b/1.5 spike timeout

詳見 [`NOTES.md` D-6 後段](../../NOTES.md)。先做 M1b/2,SSH patch 等上游或下次 session 接手。

### 2026-04-29 — M1b/2 frontend 完成

- Tailwind 4 接好(@tailwindcss/vite plugin + index.css `@import "tailwindcss"` + @theme tokens)
- TanStack Query + Sonner Toaster 包在 main.tsx
- Path alias `@/*` → `src/*`(vite + tsconfig)
- shadcn-style components 手寫 5 個:Button / Input / Label / Dialog / Select(放 `src/components/ui/`)— 不靠 shadcn CLI
- `src/lib/`:`utils.ts` (cn helper) / `types.ts` (Host / HostForm) / `tauri.ts` (6 個 invoke wrapper)
- `src/hooks/useHosts.ts`:5 個 TanStack hooks(`useHostsList` / `useCreateHost` / `useUpdateHost` / `useDeleteHost` / `useTestConnection`),query key `["hosts","list"]`(CLAUDE.md 規則)
- `src/desktop/HostsView.tsx` + `HostFormDialog.tsx`:host 列表 + Add/Edit dialog
- 把 backend `HostForm` 的 `#[serde(rename_all="camelCase")]` 拔掉,backend / frontend 統一 snake_case JSON
- `npm run build` 過(1880 modules,391 KB JS / 16 KB CSS gzip)
- 私鑰 import 暫時用 `window.prompt` 拿路徑(`tauri-plugin-dialog` 沒裝),M1c 升級成 file picker
- Owner Windows 驗:`git pull` → `npm install` → `npm run tauri dev` → 點「新增 Host」→ 填 → 儲存 → 列表出現 → 編輯/刪除應該 work;按「測試連線」會跳 stub 訊息(預期)

## Resolution

**Resolved 2026-05-01.** 完整 host CRUD + 真實 SSH test_connection 都 ship,Windows 端 owner 驗收通過。

**收尾 timeline:**
- 2026-04-29:M1b/1 backend 5 個 commands ship(test_connection stub),M1b/2 frontend ship。
- 2026-04-29:M1b/1.5 ed25519-dalek upstream pkcs8 不容 spike timeout(NOTES.md D-6)。
- 2026-04-29 → 2026-04-30:owner 拍板 SSH lib swap russh → makiko(NOTES.md D-7,SPEC §13 deviation),test_connection 真實連線 ✓。
- 2026-04-30:owner 撞 keyring「password not in keyring」,先加 `create_host` validation 防再發生(commit `b3f5395`)。
- 2026-05-01:Windows-local agent 接手,抓出根因 = keyring 3.x 沒指定 platform feature → mock backend(NOTES.md D-9)。`Cargo.toml` 加 features fix(commit `616279a`)。Owner 重編 + 編輯 host 重打密碼 → 通。

**Surprises:**
- D-6/D-7:russh 0.60.1 transitively 拉壞掉的 ed25519-dalek pre-release(upstream master 也沒修),所以 SPEC §13 寫 russh 但實際走 makiko(stable,純 Rust 同性質)。M1g attach PTY 行為若 makiko 出問題,觸發 D-7 「切回 russh」條件。
- D-9:keyring 3.x 是 feature-flag driven backend 設計,沒指定 feature 不是 compile error 也不是 runtime panic,**fallback mock backend** — 每個 `Entry::new` 一個獨立 in-memory instance,寫進去就丟。test_connection 通是 red herring(它直接吃 form.password 不走 keyring)。漏掉 platform feature 是 scaffold 階段的 silent footgun。

**M1b/1.5 acceptance 為什麼也勾掉:** 原計畫是 fork ed25519-dalek 修 2 行,改走 makiko swap(D-7)達成相同目的(unblock M1c+ 的 SSH connect),所以同 acceptance 等價滿足。

**留尾(non-blocking):**
- D-7 留下「ed25519-dalek 升 pre.7+ → 評估切回 russh」routine — 已掛 task.md backlog。
- M1f attach PTY 真用 makiko 跑起來才知道有沒有 PTY 行為差異,M1f 第一個 spike 點。
