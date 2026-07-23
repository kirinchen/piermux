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

- `App.tsx` — root,platform routing:`isAndroid()`(UA 偵測)→ `<AndroidApp />`,否則 `<HostsView />`(desktop)
- `lib/platform.ts` — `detectPlatform()` / `isAndroid()` 用 `navigator.userAgent` 判 Android WebView。M2b 起步用,需要更細粒度(iOS / version detection)再升 `@tauri-apps/plugin-os`
- `desktop/HostsView.tsx` — top-level layout(header + collapsible sidebar + main panel + dialog)。`Selection` 4-variant discriminated union 路由 main panel
- `desktop/HostTree.tsx` — 左側 host/session tree。每 host row 含 `[checkbox]` (multi-select) + chevron + status icon + name + hover [🔄 / ✏ / 🗑]。展開後第一個 child 是 ⚡ shell synthetic row,然後是 tmux sessions。每個 tmux session row hover 出 [🔄 / ✏ rename / 🗑 kill](走 `useKillSession` / `useRenameSession`,SPEC §6.6)
- `desktop/HostCaptureGrid.tsx` — 單 host capture grid view(host name click 進)
- `desktop/MultiHostCaptureGrid.tsx` — 多 host 並列(checkbox 勾 ≥1 進);內部 `HostSection` per host
- `desktop/CaptureCell.tsx` — 一個 session 的 mini xterm capture cell,grid 用
- `desktop/SessionPanel.tsx` — 單一 target panel,target = `{kind:'tmux',session}` 或 `{kind:'shell'}`。內部 `mode: 'capture'|'attach'`,attach 時 xterm 啟用 stdin。Attach mode 下 `attach-output-<id>` payload **直接寫進 xterm,不動 alt-screen 切換**(2026-06-04 D-23 / Bug 2/3:先前 strip alt-screen 讓 tmux 在 normal buffer 重畫造成游標座標 desync → 重複片段 / 輸入錯亂;改成讓 xterm 正常用 alternate buffer,看歷史走 tmux copy-mode 或 capture mode)。**滾輪在 alt-screen 走 `attachCustomWheelEventHandler` 接管(2026-06-07 D-24)**:吞掉預設 wheel→arrow,改呼叫 `scrollSession(id, up, lines)` IPC,後端在 attach 既有 SSH 連線加開 channel 跑 `tmux copy-mode` + `send-keys -X scroll-up/down`(per-pane state → 反映到 attach client),不碰 PTY stdin / 不靠 prefix;normal buffer 維持預設滾自己 scrollback。Detach / mode 切換時 `term.clear()` 清掉。**D-30(2026-07-06)attach 後強制乾淨重畫**:實測 `window-size=latest` 單 client → tmux 尺寸忠實 = piermux 送的尺寸(如 104×94),兩邊一致,不是「送太寬」(D-29 機制猜錯、無效)。真正問題:attach 首次繪製發生在 xterm 還在 init/reflow(80×24 → 實際尺寸)時 → reflow 弄花 buffer / col 0 殘留碎字;送「相同尺寸」的 resize tmux 不重畫。修:attach 後等 250ms `fit()`,再送 `rows-1`、間隔 ~170ms 送回 `rows`(兩個 `setTimeout`,製造真正尺寸變化)逼 tmux 全重畫 = 自動化 owner「手動拖一下」。header 另顯示 `cols×rows`(診斷用)。Android `SessionScreen` AttachView 同
- `desktop/LineBufferInput.tsx` — line mode 的 textarea,IME-aware Enter
- `desktop/SendBar.tsx` — capture mode 下方一次性 send_message + quick presets
- `desktop/HostFormDialog.tsx` — 新增 / 編輯 host
- `desktop/SettingsDialog.tsx` — 終端外觀設定(**D-35,2026-07-23**)。header ⚙ 開啟。字型下拉(10 個 preset + 「自訂…」→ 自由填 CSS font-family)+ 字級 A−/滑桿/A+(8..28)+ 即時預覽 + 還原預設。改動**即時生效不用按確定**(`saveTermPrefs` 廣播),attach 中的 session 不會被踢掉。SPEC §11 backlog「設定面板(theme / font size / 預設 input mode)」的第一刀,theme / input mode 未做
- `components/ui/*` — 手寫 shadcn-style:Button / Dialog / Input / Label / Select
- `hooks/useHosts.ts` / `useSessions.ts` / `useCapture.ts` — TanStack Query mutations + queries
- `lib/tauri.ts` — Tauri invoke wrapper(所有 backend command 集中在這個 `api` object)
- `lib/types.ts` — TS mirror 的 backend types(Host / Session / CaptureResult / HostConnectionStatus / HostForm)
- `lib/osc52.ts` — `installOsc52Handler(term)` 給每個 xterm 掛 OSC 52 OSC handler(PR #2,2026-06-01)。收到 remote 的 `ESC]52;c;<base64>BEL`(tmux `set -g set-clipboard on` 觸發)→ `atob` → `tauri-plugin-clipboard-manager.writeText` → host OS clipboard。**Read 請求(`?` payload)直接拒絕**,capability 也只給 `clipboard-manager:allow-write-text`(雙保險)。掛點:`SessionPanel` / `CaptureCell` / `SessionScreen`(CaptureView + AttachView)四處
- `lib/xterm-unicode.ts` — `installUnicodeWidths(term)` 把 xterm 字元寬度對齊新版 tmux(**D-28,2026-07-02**)。載入官方 `@xterm/addon-unicode-graphemes`(Unicode 15 + grapheme cluster)並設 `unicode.activeVersion` 為最新。**根因**:tmux 3.4 把 emoji(`✅ ❌ ⚠️`)當寬度 2,xterm 預設 Unicode 6 provider 當寬度 1 → tmux 重繪時每 emoji 差 1 欄累積 → 行尾字 wrap 到下一行行頭(owner 誤判為 OSC 52,實為寬度 desync;OSC 52 解析已用真實 tmux 3.4 bytes 證明乾淨)。掛在同上四處 xterm 初始化(建構需 `allowProposedApi:true`,unicode API 是 proposed),要在 `open()`/`write()` 前呼叫
- `lib/xterm-links.ts` — `installWebLinks(term)`:`WebLinksAddon` 配自訂 handler,終端裡的網址點一下走 `tauri-plugin-opener` 的 `openUrl` 用 **OS 預設瀏覽器**開(Android 是 Intent → 系統瀏覽器)(**D-36,2026-07-23**)。取代 addon 預設的 `window.open`(在 Tauri WebView 不是被擋就是開一個沒 chrome 的內嵌視窗)。**只放行 `^https?://`**,capability 也只給 `opener:allow-open-url` + scope `http://*` / `https://*`(不用 `opener:default`,那組還含 reveal-item-in-dir 跟 mailto/tel)。掛在同上四處
- `lib/term-prefs.ts` + `lib/useTermPrefs.ts` — 終端外觀偏好(字型 + 字級)(**D-35,2026-07-23**)。存 **localStorage** key `piermux:termPrefs`(**不是** SPEC §5 的 `ui_preferences` 表 —— xterm 建構當下就要同步拿到值,走 DB 得先 await 會先用預設畫一次再重畫)。單一 `fontSize` 主字級,各站用固定 delta 保住原本相對關係:desktop attach/capture `+0`(原 13)、grid mini cell `-2`(原 11)、Android attach `-1`(原 12)。`term-prefs.ts` = 純資料 + 極簡 store(`getTermPrefs` / `saveTermPrefs` / `subscribeTermPrefs` / `fontSizeFor`);`useTermPrefs.ts` = React 綁定(`useTermPrefs` 走 `useSyncExternalStore`、`useTermFontSync(xtermRef, fitRef, delta)` 把變動套到活著的 xterm 並 refit,**不 remount**)。各 xterm 在 `new XTerm({...})` 直接讀 `getTermPrefs()` 取初值

### Frontend — Android (`src/android/`)

M2b/M2c/M2d(2026-05-14,EPIC-002 / ISSUE-010)。Stack navigation + capture/send_message + attach 雙向 + line buffer + modifier bar。共用 hooks(useHostsList / useSessions / useCapture)+ lib。
- `AndroidApp.tsx` — `stack: Screen[]` 配 push/pop 做 navigation;`Screen` discriminated union(`host-list` | `host-form` | `session-list` | `session` | `settings`)。沒裝 React Router
- `SettingsScreen.tsx` — 終端外觀設定全屏(**D-35,2026-07-23**),host list header ⚙ push 進來。內容同 desktop `SettingsDialog`(字型 preset / 自訂、字級 A−滑桿A+、預覽、還原預設),但走原生 `<select>` / `<input type=range>` + 大點擊區,對齊 `AndroidHostFormScreen` 的 pattern
- `useAndroidBack.ts` — hook 接 `getCurrentWindow().onCloseRequested`,Android-only,canGoBack=true 時 preventDefault + pop,否則放系統關 app。Tauri 2 Android hardware back 對映行為待實機驗
- `HostListScreen.tsx` — 卡片式 host list,header 有 `⟳ All`(`useRefreshAll` = captureAll)+ `+ Host`;每 row 含 [✏] 進 edit form。tap row 進 SessionList
- `AndroidHostFormScreen.tsx` — 全屏 host form,取代 desktop dialog 的 modal pattern,用原生 `<input>`/`<select>` 配 inputMode/autoCapitalize/autoCorrect=off。共用 useCreate/Update/Delete/TestConnection。Edit mode 下方紅色「刪除這台 host」按鈕走 `window.confirm` + `useDeleteHost`
- `SessionListScreen.tsx` — host 的 tmux session list,首行固定 ⚡ shell synthetic row。header `⟳` 同時 refetch sessions + captureHost(三層 refresh 中層)。tap → SessionScreen。每 row 右側固定 ✏ rename + 🗑 kill 按鈕(走 `useKillSession` / `useRenameSession`,行動端不用 hover 改 always-visible)
- `SessionScreen.tsx` — `mode: 'capture' | 'attach'` 切。`target.kind === 'shell'` 強制 attach(shell 無 capture)
  - **Capture mode**(M2c)— xterm readonly(font 13、scrollback 5000)+ `captureSession` on mount + `capture-updated:<host>:<session>` listen + 右上 [🔄] per-session refresh + `QuickKeyBar` + 一行文字 input + Send(send_message literal=true, send_enter=true)
  - **Attach mode**(M2d)— `AttachView` 內嵌。`attachSession` / `attachShell`(shell target)on mount,xterm(font 12、scrollback 20000)接 `attach-output-<id>` event,**直接寫進 xterm 不 strip alt-screen**(對齊 desktop,2026-06-04 D-23)。`attach-closed-<id>` → onBack。`writeToSession` 在 ModifierBar 按鍵 / line input Send 時送 raw bytes。Cleanup detach + clear xterm
  - Line buffer:`<textarea>` + Send button,IME `isComposing` 護欄;Shift+Enter 換行,純 Enter 整段送(buffer + `\r`)。**核心賣點**(SPEC §1.2 / §9.1 fallback 設計)
  - **IME 逐鍵輸入(D-25 → D-27)**:attach 的 xterm helper textarea 在 `term.open()` 後設 `inputmode="url"`(+ `autocomplete="off"`)。D-25 原用 `autocomplete=off → NO_SUGGESTIONS`,但實機 Gboard 對 `<textarea>`(multiline)仍保留 composing region;D-27(2026-06-21)改 `inputmode="url"` 切 Gboard URL 鍵盤 → 逐鍵直送不組字(修「選字才輸入」)。代價:URL 版面 + CJK 不在此打,中文走 capture 的 Send 框(刻意保留 composition)
  - Ctrl/Alt toggle:tap CTRL/ALT 反藍 = 按住,xterm keydown 把後續 a-zA-Z wrap 成 Ctrl/Alt+letter raw byte(0x01..0x1a / ESC 前綴),**再 tap 一次才放開**(D-27,改自 D-25 的 one-shot)
  - 軟鍵盤收放:`window.visualViewport` resize event 也 refit(`ResizeObserver` 在 viewport 縮放有時不觸發)
- `QuickKeyBar.tsx` — JuiceSSH 風橫滾 19 鍵 capture bar。每鍵 `{label, payload, literal}`,走 `send_message`(literal=false 走 tmux send-keys named-key:Tab/Escape/C-c/Up;literal=true 走字面 / - | ~ \` < > [ ])。**D-25**:容器層 `onMouseDown.preventDefault` → 按快速鍵不搶 `<input>` 焦點、軟鍵盤不被收起(click / `:active` / 橫滾不受影響)
- `ModifierBar.tsx` — Attach mode 對應 bar,payload raw bytes 走 `writeToSession`(不過 tmux)。**D-22(2026-06-01)2-row 9-col grid layout** 取代原本單列橫滾。鍵集:R1 = ESC / `|` `-` HOME ↑ END PGUP FN;R2 = TAB CTRL ALT ← ↓ → PGDN _ 🎹。**Toggle modifiers(D-27,改自 sticky)**:CTRL + ALT 點亮(反藍)= key down 按住,xterm `attachCustomKeyEventHandler` 把亮燈期間每個 a-zA-Z keydown wrap 成 raw byte(CTRL: `0x01..0x1a`;ALT: `\x1b<letter>` ESC 前綴;兩者皆亮:`\x1b` + ctrl-byte),非 a-zA-Z 不攔;**再 tap 一次才 key up 放開**(不再 one-shot 自動熄滅),為 Ctrl+C 等組合鍵連續操作。FN 先佔位 onClick console.warn 不送 byte。🎹 收合整條 bar 成右下浮動小 icon。**D-25**:容器層 `onMouseDown.preventDefault` → 按 modifier 不搶 xterm helper textarea 焦點、軟鍵盤不收(CTRL/ALT sticky 也才接得到下一個實體按鍵)

- `useTouchScroll.ts` — **手指拖曳捲動終端(D-26,2026-06-18)**。xterm 的 `.xterm-screen`(canvas)疊在 `.xterm-viewport` 上、觸控落在 screen 不觸發原生捲動,xterm 又只把滾輪轉捲動 → 行動端拖不動畫面。此 hook 把單指垂直拖曳換算行數:**normal buffer** → `term.scrollLines()`(1:1 跟手);**alt-screen**(tmux 全螢幕)→ `onAltScreenScroll` 走 `scroll_session` tmux copy-mode(對齊 desktop 滾輪 D-24,含 inflight/pending 節流)。`touchmove` 用 `passive:false` + `preventDefault`,tap 容差(6px)內不攔以保留點擊聚焦。container 設 `touch-action:none`(否則前 6px 原生捲動被 compositor latch → preventDefault 失效 → 與 `scrollLines` 雙重捲動跳動)。掛在 SessionScreen 的 capture / attach 兩個 xterm container

### Backend (`src-tauri/src/`)

- `lib.rs` — Tauri builder 註冊(plugin:sql / clipboard-manager / **opener**),setup hook 開 sqlx pool + AttachRegistry,invoke_handler 列所有 commands
- `commands.rs` — host CRUD + test_connection + import_private_key(M1b)
- `hosts.rs` — `Host` / `HostForm` struct + `Session` + `HostConnectionStatus` + sqlx pool 開啟 + apply_schema + CRUD
- `sessions.rs` — `list_sessions` / `host_status` / `kill_session` / `rename_session`(SPEC §6.6 + session-level rename UX)Tauri commands + 共用 helpers `read_password_for` / `build_auth` / `port_u16` / `parse_sessions` / `list_sessions_for` (pub(crate),capture/attach/messaging 共用)+ 內部 `run_tmux_control` / `shell_quote`
- `capture.rs` — `capture_session` / `capture_host` / `capture_all`(M1d 三層 refresh)。`capture_host_inner` 一個 host 一條 SSH 跑多 channel(`Semaphore(3)`,SPEC §9.2),emit `capture-updated:<host_id>:<session_name>` event,UPSERT `capture_cache`
- `attach.rs` — `attach_session` / `attach_shell` / `write_to_session` / `resize_session` / `detach_session` / `scroll_session`(M1f + D-14 + D-24)。`AttachRegistry: Mutex<HashMap<String, AttachHandle>>` 存 attach 狀態(含 `target: Option<String>` 供 copy-mode 用),reader task 把 PTY 輸出 emit `attach-output-<id>`,結束 emit `attach-closed-<id>`。`scroll_session`(D-24)在同一條 SSH 連線加開 exec channel 跑 `tmux copy-mode` + `send-keys -X scroll-up/down`,讓 alt-screen 滾輪能看歷史而不碰 PTY stdin;shell target(無 tmux)no-op
- `messaging.rs` — `send_message(host, session, payload, send_enter, literal)`(M1e + D-12),走 `tmux send-keys` literal 或 named-key
- `secret.rs` — keyring 薄 wrapper(macOS Keychain / Windows Credential Manager / Linux Secret Service via `keyring 3.6` 加 platform features,D-9)
- `ssh.rs` — makiko 0.2.5 wrapper:`connect()` 回 `SshSession`(共用 connection)+ `SshSession::exec()` + `run_command()`(one-shot)+ `test_connection()`。Server pubkey 接受 any(M1b 起);auth 支援 password + key(Ed25519/RSA);`SshSession::client()` 暴露給 attach.rs 開 PTY channel
- `migrations/0001_initial.sql` — 4 張表:hosts / ui_preferences / quick_presets / capture_cache(SPEC §5)

### Android scaffold (`src-tauri/gen/android/`)

M2a(2026-05-13,D-15)用 `npm run tauri android init` 生的 Android Studio project,含 Gradle 配置(`build.gradle.kts` / `settings.gradle` / `gradle.properties` / `gradlew(.bat)`)+ `app/`(AndroidManifest / Kotlin entry / resources)+ `buildSrc/`。Tauri 自己 scaffold 一份 `.gitignore` 排掉 build artifacts + `key.properties`。

M2e(2026-05-14)`app/build.gradle.kts` 加 release signing:讀 `app/key.properties`(gitignored,owner 自己填 storeFile/storePassword/keyAlias/keyPassword)→ 建 `signingConfigs.release` → release buildType 用。`key.properties.example` 提供 template + 一次性 keytool 指令。缺檔不會擋 debug build,但 release build 會跑出 unsigned APK 裝不上實機。

### Build infrastructure (`.cargo/config.toml`)

D-15(2026-05-13)加。為 4 個 Android target(`aarch64-linux-android` / `armv7-linux-androideabi` / `i686-linux-android` / `x86_64-linux-android`)寫 linker → NDK r27d (`27.3.13750724`) 的 `<TARGET>24-clang.cmd`(API level 24)。**路徑 pin 死 owner 機器**,他人接手要自己改 / 用 `CARGO_TARGET_<TRIPLE>_LINKER` env override。

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
- **Desktop framework:** Tauri 2.x (`tauri` 2 / `tauri-plugin-sql` 2 / `tauri-plugin-clipboard-manager` 2.3)
- **Frontend:** React 19 + Vite 7 + Tailwind 4(`@tailwindcss/vite`)+ TanStack Query 5 + radix-ui (dialog/label/select/slot) + sonner + lucide
- **Terminal renderer:** `@xterm/xterm` 6 + `addon-fit` + `addon-web-links` + `addon-unicode-graphemes`(D-28:對齊新版 tmux emoji/CJK 寬度)
- **SSH:** `makiko` 0.2.5 (D-7,SPEC §13 deviation 從 russh 換,純 Rust crypto)
- **Datastore:** SQLite via `sqlx` 0.8(backend 自開 pool,D-5)+ `tauri-plugin-sql`(load 但不註冊 migration,留給 frontend 之後 incremental 用)
- **Secrets:** `keyring` 3.6 with `apple-native` / `windows-native` / `sync-secret-service` features(D-9)
- **Async runtime:** Tokio 1
- **Crypto:** transitive via makiko(`ed25519-dalek` 2.2 / `x25519-dalek` 2.0 / `chacha20` / `aes-gcm` / `rsa` 0.9)
- **Build (desktop):** Tauri builds `.msi`(WiX 3)+ `.exe`(NSIS 3.11),不簽 cert(M3 polish 才考慮)。Standalone `.exe` 在 `target/release/piermux.exe`,綠色版可直接跑
- **Build (Android, M2a setup ✓ 2026-05-13):** Android NDK **r27d (27.3.13750724)** + JDK 21 + Gradle(via Tauri `gen/android/`)。Cross-compile linker 寫在 `.cargo/config.toml`(D-15)。Min SDK API 24(Android 7.0)。實際 `tauri android dev` / `build` 還沒跑過實機,只驗到 `cargo check --target aarch64-linux-android` 通

## 5. External dependencies

- **Remote SSH servers** — piermux 連的 host(使用者自己提供)。要求:OpenSSH server + 標準 PTY support
- **Remote tmux** — host 上要有 tmux 才能 list / capture / attach session(shell mode 不需要,直連 login shell)
- **OS credential store** — macOS Keychain / Windows Credential Manager / Linux Secret Service(經 keyring crate)
- **WebView2 runtime**(Windows)— Tauri 2 必需,Win 10/11 預裝
- _沒有 SaaS / API 依賴_

## 6. Pointers to deeper docs

- **Decision log:** [`../../NOTES.md`](../../NOTES.md) D-1..D-15(SPEC 模糊處 / SPEC deviation / spike 結果)
- **SPEC:** [`../SPEC.md`](../SPEC.md) — 產品意圖
- **Sprint / Issues:** [`../Sprint/SPRINT-2026-W18.md`](../Sprint/SPRINT-2026-W18.md) + [`../Issue/`](../Issue/) ISSUE-001..010,Epics [EPIC-001](../Epic/EPIC-001.md) / [EPIC-002](../Epic/EPIC-002.md) / [EPIC-004](../Epic/EPIC-004.md)
- **Tasks:** [`../task.md`](../task.md)

---

*Anything in this file should be **verifiable from the running code right now**. If a claim here contradicts the code, the claim is wrong — fix it.*

*Last updated: 2026-07-23(D-35:終端字型 / 字級可設定 —— `lib/term-prefs.ts` + `lib/useTermPrefs.ts`(localStorage,非 `ui_preferences` 表)、desktop `SettingsDialog` + Android `SettingsScreen`,四個 xterm 都讀,改動即時生效不 remount。D-36:終端網址點一下開 OS 預設瀏覽器 —— `lib/xterm-links.ts` 走 `tauri-plugin-opener`,四個 xterm 都掛,只放行 http/https(capability scope 再擋一層)。以下為先前紀錄:D-30:attach 後主動 nudge 尺寸(rows-1→rows)逼 tmux 乾淨全重畫 — 修「非全寬/直式 attach 花屏殘留」,實測尺寸其實一致(window-size=latest 單 client),根因是首次繪製撞上 xterm reflow、送同尺寸 resize 不會重畫,故 nudge 一次真正尺寸變化;header 加 `cols×rows` 診斷顯示。D-29(前一版方向對機制錯、無效,已被 D-30 取代)。D-28:`lib/xterm-unicode.ts` — 加 `@xterm/addon-unicode-graphemes` 對齊 emoji/CJK 寬度(真字寬 bug,但非 D-29 那個行頭殘留主因);OSC 52 解析經真實 tmux bytes 證明乾淨。D-27:CTRL/ALT 改 toggle(hold);attach 逐鍵輸入改 `inputmode="url"`。D-26:`useTouchScroll` 手指拖曳捲動。D-25:bar 容器層 `onMouseDown.preventDefault` 保軟鍵盤焦點)*
