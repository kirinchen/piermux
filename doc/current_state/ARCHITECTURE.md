---
title: Architecture (current state)
owner: kirin
---

# Architecture — Current State

> *How the system **actually** looks right now. Pair with [`../SPEC.md`](../SPEC.md) which describes intent.*
>
> **Maintenance rule**: when your code change goes beyond what this file describes
> (new component, removed component, interaction change, tech stack swap),
> update this file in the same change set. Trivial refactors and renames don't count.

## 1. Components

### Frontend (`src/`)

- `App.tsx` — root,routes to `desktop/HostsView` (Android in `src/android/` 還沒寫,M2)
- `desktop/HostsView.tsx` — top-level layout(header + collapsible sidebar + main panel + dialog)。`Selection` 4-variant discriminated union 路由 main panel
- `desktop/HostTree.tsx` — 左側 host/session tree。每 host row 含 `[checkbox]` (multi-select) + chevron + status icon + name + hover [🔄 / ✏ / 🗑]。展開後第一個 child 是 ⚡ shell synthetic row,然後是 tmux sessions
- `desktop/HostCaptureGrid.tsx` — 單 host capture grid view(host name click 進)
- `desktop/MultiHostCaptureGrid.tsx` — 多 host 並列(checkbox 勾 ≥1 進);內部 `HostSection` per host
- `desktop/CaptureCell.tsx` — 一個 session 的 mini xterm capture cell,grid 用
- `desktop/SessionPanel.tsx` — 單一 target panel,target = `{kind:'tmux',session}` 或 `{kind:'shell'}`。內部 `mode: 'capture'|'attach'` + `inputMode: 'line'|'stream'`,attach 時 xterm 啟用 stdin。Attach mode 下對 `attach-output-<id>` payload strip 掉 `\x1b[?(1049|47|1047|1048)[hl]` → xterm 永遠留在 normal buffer → scrollback(20000 行)生效 → 滾輪 / scrollbar 直接捲這次 attach 的輸出。Detach / mode 切換時 `term.clear()` 清掉
- `desktop/LineBufferInput.tsx` — line mode 的 textarea,IME-aware Enter
- `desktop/SendBar.tsx` — capture mode 下方一次性 send_message + quick presets
- `desktop/HostFormDialog.tsx` — 新增 / 編輯 host
- `components/ui/*` — 手寫 shadcn-style:Button / Dialog / Input / Label / Select
- `hooks/useHosts.ts` / `useSessions.ts` / `useCapture.ts` — TanStack Query mutations + queries
- `lib/tauri.ts` — Tauri invoke wrapper(所有 backend command 集中在這個 `api` object)
- `lib/types.ts` — TS mirror 的 backend types(Host / Session / CaptureResult / HostConnectionStatus / HostForm)

### Backend (`src-tauri/src/`)

- `lib.rs` — Tauri builder 註冊,setup hook 開 sqlx pool + AttachRegistry,invoke_handler 列所有 commands
- `commands.rs` — host CRUD + test_connection + import_private_key(M1b)
- `hosts.rs` — `Host` / `HostForm` struct + `Session` + `HostConnectionStatus` + sqlx pool 開啟 + apply_schema + CRUD
- `sessions.rs` — `list_sessions` / `host_status` Tauri commands + 共用 helpers `read_password_for` / `build_auth` / `port_u16` / `parse_sessions` / `list_sessions_for` (pub(crate),capture/attach/messaging 共用)
- `capture.rs` — `capture_session` / `capture_host` / `capture_all`(M1d 三層 refresh)。`capture_host_inner` 一個 host 一條 SSH 跑多 channel(`Semaphore(3)`,SPEC §9.2),emit `capture-updated:<host_id>:<session_name>` event,UPSERT `capture_cache`
- `attach.rs` — `attach_session` / `attach_shell` / `write_to_session` / `resize_session` / `detach_session`(M1f + D-14)。`AttachRegistry: Mutex<HashMap<String, AttachHandle>>` 存 attach 狀態,reader task 把 PTY 輸出 emit `attach-output-<id>`,結束 emit `attach-closed-<id>`
- `messaging.rs` — `send_message(host, session, payload, send_enter, literal)`(M1e + D-12),走 `tmux send-keys` literal 或 named-key
- `secret.rs` — keyring 薄 wrapper(macOS Keychain / Windows Credential Manager / Linux Secret Service via `keyring 3.6` 加 platform features,D-9)
- `ssh.rs` — makiko 0.2.5 wrapper:`connect()` 回 `SshSession`(共用 connection)+ `SshSession::exec()` + `run_command()`(one-shot)+ `test_connection()`。Server pubkey 接受 any(M1b 起);auth 支援 password + key(Ed25519/RSA);`SshSession::client()` 暴露給 attach.rs 開 PTY channel
- `migrations/0001_initial.sql` — 4 張表:hosts / ui_preferences / quick_presets / capture_cache(SPEC §5)

## 2. Interactions

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + xterm.js)                                │
│  HostsView ─┬─ HostTree (left, collapsible)                 │
│             ├─ HostCaptureGrid       (kind='host')          │
│             ├─ MultiHostCaptureGrid  (kind='multi-host')    │
│             └─ SessionPanel          (kind='session'|'shell')│
└────────────────────────────┬────────────────────────────────┘
                 Tauri invoke / event
                             │
┌────────────────────────────▼────────────────────────────────┐
│  Backend (Rust, Tokio async)                                │
│  commands.rs / sessions.rs / capture.rs / attach.rs /       │
│  messaging.rs                                               │
│       │                          │                          │
│       │ sqlx (host CRUD)         │ ssh.rs (makiko)          │
│       ▼                          ▼                          │
│  SQLite (%APPDATA%)          remote SSH server              │
│       + keyring (OS)              ↓                         │
│                              tmux server (ssh exec / PTY)   │
└─────────────────────────────────────────────────────────────┘
```

**Tauri events:**
- `capture-updated:<host_id>:<session_name>` — capture refresh complete(payload `CaptureResult`),`SessionPanel` / `CaptureCell` 訂閱對應 event
- `attach-output-<attach_id>` — PTY stdout/stderr chunk(payload `String` UTF-8 lossy)
- `attach-closed-<attach_id>` — server EOF / exit / connection error,frontend 自動切回 capture(tmux)或 onBack(shell)

## 3. Data flow

### Capture flow(M1d 三層 refresh)

1. User 點 [⟳ Refresh All] → `HostsView` `useRefreshAll` mutation → `api.captureAll()`
2. Backend `capture_all` `tokio::spawn` 對每 host 跑 `capture_host_inner`(host 之間 fully parallel)
3. Per host:`ssh::connect` 開 1 條 SSH connection → `ssh_session.exec(TMUX_LIST_FMT)` 拉 sessions → `Semaphore(3)` 限速並行 `tmux capture-pane -t <s>:0 -p -e -S -200`(同一條 connection,SPEC §9.2)
4. 每個成功 capture:UPSERT `capture_cache` 表 + `app.emit("capture-updated:<host>:<session>", &result)`
5. Frontend 對應 `CaptureCell` / `SessionPanel` 的 `listen` handler 接到 event,`term.write(content)` 重畫

### Attach flow(M1f / shell D-14)

1. User 點 tree session / ⚡ shell → `Selection.kind` = `'session'` / `'shell'` → `SessionPanel` mount
2. xterm init effect → `term.open(container)` + 排 `fit()` 在 next frame
3. Attach effect:**強制 `fit()` 一次**(避免 2026-05-02 bug:第一次 attach 讀到預設 80x24)→ `api.attachSession` / `api.attachShell` with cols/rows
4. Backend `attach_session` / `attach_shell`:`ssh::connect` → `open_pty_channel` (request_pty)→ `session.exec("tmux attach -t ...")` 或 `session.shell()` → spawn reader task → 塞 `AttachRegistry`,回 `attach_id` (UUID)
5. Reader task 持續 `sess_rx.recv()`,每筆 stdout/stderr `app.emit("attach-output-<id>", chunk)`
6. Frontend listen `attach-output-<id>` → `term.write(payload)`
7. xterm `onData` → `api.writeToSession(id, data)`(stream mode)/ `LineBufferInput` Enter → `api.writeToSession(id, buffer + '\r')`(line mode)
8. `onResize` → `api.resizeSession(id, cols, rows)` → `session.window_change(...)`
9. Detach:User 點 [Detach] / `attach-closed` event → `api.detachSession(id)` → `AttachRegistry` 移除 → `Drop` close session + abort reader task

## 4. Tech stack snapshot

- **Language:** Rust 1.85 (MSRV) + TypeScript 5.8 (strict)
- **Desktop framework:** Tauri 2.x (`tauri` 2 / `tauri-plugin-sql` 2)
- **Frontend:** React 19 + Vite 7 + Tailwind 4(`@tailwindcss/vite`)+ TanStack Query 5 + radix-ui (dialog/label/select/slot) + sonner + lucide
- **Terminal renderer:** `@xterm/xterm` 5 + `addon-fit` + `addon-web-links`
- **SSH:** `makiko` 0.2.5 (D-7,SPEC §13 deviation 從 russh 換,純 Rust crypto)
- **Datastore:** SQLite via `sqlx` 0.8(backend 自開 pool,D-5)+ `tauri-plugin-sql`(load 但不註冊 migration,留給 frontend 之後 incremental 用)
- **Secrets:** `keyring` 3.6 with `apple-native` / `windows-native` / `sync-secret-service` features(D-9)
- **Async runtime:** Tokio 1
- **Crypto:** transitive via makiko(`ed25519-dalek` 2.2 / `x25519-dalek` 2.0 / `chacha20` / `aes-gcm` / `rsa` 0.9)
- **Build:** Tauri builds `.msi`(WiX 3)+ `.exe`(NSIS 3.11),不簽 cert(M3 polish 才考慮)。Standalone `.exe` 在 `target/release/piermux.exe`,綠色版可直接跑

## 5. External dependencies

- **Remote SSH servers** — piermux 連的 host(使用者自己提供)。要求:OpenSSH server + 標準 PTY support
- **Remote tmux** — host 上要有 tmux 才能 list / capture / attach session(shell mode 不需要,直連 login shell)
- **OS credential store** — macOS Keychain / Windows Credential Manager / Linux Secret Service(經 keyring crate)
- **WebView2 runtime**(Windows)— Tauri 2 必需,Win 10/11 預裝
- _沒有 SaaS / API 依賴_

## 6. Pointers to deeper docs

- **Decision log:** [`../../NOTES.md`](../../NOTES.md) D-1..D-14(SPEC 模糊處 / SPEC deviation / spike 結果)
- **SPEC:** [`../SPEC.md`](../SPEC.md) — 產品意圖
- **Sprint / Issues:** [`../Sprint/SPRINT-2026-W18.md`](../Sprint/SPRINT-2026-W18.md) + [`../Issue/`](../Issue/) ISSUE-001..008
- **Tasks:** [`../task.md`](../task.md)

---

*Anything in this file should be **verifiable from the running code right now**. If a claim here contradicts the code, the claim is wrong — fix it.*

*Last updated: 2026-05-02(M1 desktop preview shipped + v0.1.0 release)*
