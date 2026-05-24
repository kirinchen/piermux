# Tasks — piermux

> **Active sprint:** [SPRINT-2026-W18](Sprint/SPRINT-2026-W18.md) (2026-04-27 → 2026-05-03)
>
> Issues 在 [doc/Issue/](Issue/) 追。本檔放:sprint 承諾 pointer、不夠大開 Issue 的 tooling / spike。
>
> **沒有「open questions」section 是刻意的** — CLAUDE.md autonomy 原則:小事自己決定,寫進 [`NOTES.md`](../NOTES.md) 繼續做。Owner review 時看 NOTES.md decisions log 一起調。
>
> **Status:** `[ ]` open · `[~]` in progress · `[x]` done。完成移到底部 Done。

---

## Sprint commitments(SPRINT-2026-W18)

- [x] **[ISSUE-001](Issue/ISSUE-001.md)** M1a — Tauri scaffold + DB(`resolved` · 2026-04-28)
- [x] **[ISSUE-002](Issue/ISSUE-002.md)** M1b — Host CRUD + Test Connection(`resolved` · 2026-05-01,keyring fix `616279a`)
- [x] **[ISSUE-003](Issue/ISSUE-003.md)** M1c — Tree view + sessions(`resolved` · 2026-05-01,連帶 keyring fix 解開 list_sessions)

> M1d..M1h 已落 [ISSUE-004..008](Issue/) 並掛在 [EPIC-001](Epic/EPIC-001.md),但本 sprint 不承諾。下個 sprint(W19)滾入 M1d 起。

---

## 進行中 / open(短期 actionable)

### Session-level kill + rename(本 commit,NOTES D-19)
- Backend `sessions.rs` 加 `kill_session`(SPEC §6.6 補做)/ `rename_session`(SPEC 沒列、§10 沒禁,同類 UX)
- Desktop `HostTree.tsx` `SessionRow` hover 加 ✏ / 🗑;Android `SessionListScreen.tsx` 行尾 always-visible
- `useKillSession` / `useRenameSession` mutation 自動 invalidate sessions list
- **等 owner Windows 真實環境驗:** tree hover ✏ rename / 🗑 kill 流程 + Android 兩個按鈕

### M1d 完成 ✓(ISSUE-004,1 host scale 驗 ✓,3 host scale 等 owner 環境)
- Backend `59a7916` + Frontend `03a9196` + Perf `1f3ad4a` + Grid UX `7419866`
- 1 host × 3 session ship + grid view owner 已 ship 驗證 ✓
- 3 host × 5 session refresh-all < 3 秒等之後加 host 才量得到

### M1f 完成 ✓(ISSUE-006,attach mode 基礎,owner 驗收 ✓)
- Backend `attach.rs` + 4 commands `8338091` + 點 session = 預設 attach `4e9ff5b`(D-10)

### M1g 完成 ✓(ISSUE-007,line buffer 核心賣點)
- LineBufferInput + Line/Stream toggle ship,IME aware,owner 驗收 ✓
- v0.1.0 commit `3e9f7ab` + D-11 改預設 stream(commit `90609f6`)

### M1e 開工中(ISSUE-005,send_message + quick presets)
- **本 commit:** `messaging.rs` backend + `SendBar.tsx` frontend + 加 `literal: bool` 參數(NOTES D-12,SPEC §6.4 模糊處)
- Quick presets 三個 hardcode default(`/syncdesk` / `Stop (ESC)` / `Clear (Ctrl+L)`)
- `quick_presets` DB 載入 + 編輯 UI 推到 M3 polish(對齊原 ISSUE acceptance 寫法)
- **等 owner Windows 真實環境驗:** capture 模式下方 SendBar 出現 + 三個 preset 按鈕送對 / 自訂文字送對

### M1 polish 持續(M1h 推到 M3,sidebar + shell 加進來)
- M1h tray icon(ISSUE-008)歸到 M3 polish epic — owner 拍板「不是 daily-use 必要」
- **Sidebar collapsible(本 commit):** HostsView header 加 toggle button(`PanelLeftOpen` / `PanelLeftClose` icons),localStorage 持久化。Sidebar 收合時主畫面 100% 寬。對齊 owner UX 訴求「main view 滿版」
- **Shell 直連(本 commit,NOTES D-14):** Selection 加 `kind:'shell'`,`attach.rs` 加 `attach_shell` Tauri command(refactor 抽 `open_pty_channel` + `finalize_attach` 共用,attach_session/attach_shell 各自 5 行專屬)。HostTree host 展開後第一個 child 是 ⚡ shell synthetic row,點進去 SessionPanel 走 `attachShell` 開 PTY + `session.shell()`。SPEC §11 vocabulary 擴充
- **M2a spike 結果(NOTES D-13):** makiko Android cross-compile **過**,只缺 NDK
ISSUE-004 acceptance 對齊 SPEC §3.3 + §6.3:
- backend `capture_session(host_id, session_name)` — `ssh::run_command` 跑 `tmux capture-pane -t <session>:0 -p -e -S -200`
- backend `capture_host(host_id)` — host 內並行,Semaphore(3) 限速
- backend `capture_all()` — host 之間並行
- emit `capture-updated:<host_id>:<session_name>` Tauri event
- write 進 `capture_cache` table(SPEC §5)
- frontend:xterm.js readonly 在 `SessionPanel` 顯示 ANSI capture
- UI:tree view 上 host 旁 [🔄] / session 旁 [🔄] / 右上 [⟳ Refresh All]
- 完成標準:3 host × 5 session 全部 refresh-all < 3 秒

---

## Tooling tasks(agent 自取,順手做)

### T-2 Cross-dev OS conventions guide
產出:`doc/Wiki/guides/cross-dev-conventions.md`,規則含:
- npm script cross-platform(`cross-env` / `rimraf` 取代 bash-isms)
- Rust 路徑用 `Path` / `PathBuf`,不用 raw `\`
- 何時必須 Windows 跑(`tauri dev` / `tauri build` / WebView 行為驗證)
- 何時 Linux dev env 夠用(`cargo check`、type-only 改動)
  — 重要更新:Linux env 缺 atk-sys 等 system lib,**`cargo check` 過 dep resolution 後就 short-circuit,沒辦法真驗 piermux crate type 安全。Windows 才是 source of truth**(D-6/D-8 反覆撞到)
- Android NDK / toolchain 何時裝(M2 才需要,先寫上)

### T-3 GitHub Actions CI bootstrap
`.github/workflows/ci.yml`:
- `cargo check` / `cargo clippy -- -D warnings` / `cargo fmt --check`
- `npm run build`(含 `tsc --noEmit`)/ `eslint`
- Matrix:`ubuntu-latest`(快 feedback)+ `windows-latest`(真 target)
- **windows-latest job 是必要的**(因為 Linux 過不到 piermux 編譯)

### T-spike-line-buffer ✓ 不做(M1g 直接走 fallback 設計繞開)
M1g 直接走 SPEC §9.1 結尾段提到的「server output 唯讀區 + 下方獨立輸入框」fallback 設計(SPEC 原文認可「對 Claude Code 場景更直觀」),不走 §7.3 範例的「攔截 xterm.onData 累積 buffer」approach,因此沒有 IME / focus 同步等 race 需要 spike。詳 ISSUE-007「2026-05-01 — 直接走 SPEC §9.1 fallback 路徑」段。

### ~~T-spike-android-makiko~~ ✓ done(2026-05-02,NOTES.md D-13)

`cargo check --target aarch64-linux-android` 跑過 — 純 Rust 全鏈路(makiko / Tauri 2 / 全部 crypto deps)cross-compile **過**。`libsqlite3-sys` 卡在需要 NDK 的 `aarch64-linux-android-clang`(C 代碼,sqlite 3 原始碼)— 標準 Tauri Android dev 流程,owner 之後裝 Android Studio + NDK + 設 cargo config 就過。
**M2a 不會在 D-7 swap 那種坑(makiko 完全炸)上卡關。主線 plan 走得通。**

---

## Backlog(未進 sprint / 未開 epic)

- **M2a 完整 ✓(2026-05-13,NOTES D-15)**:Android Studio + NDK r27d (27.3.13750724) + JDK 21 + `.cargo/config.toml` + `gen/android/` scaffold ✓,`cargo check --target aarch64-linux-android` 1m01s 全鏈路過 ✓,**首次實機 boot ✓**(Android 實機,`npm run tauri android dev` → APK install + WebView 渲染 React UI)。Gotcha:Tauri 2 預設 `TAURI_DEV_HOST=LAN_IP`,手機必須跟 PC 同 WiFi 子網段;USB-only / 跨網段場景之後需要 `adb reverse` fallback(暫不急,真遇到再做)
- **[EPIC-002](Epic/EPIC-002.md) Android port(M2b..M2e 主線寫完,待實機驗)** — `active` 2026-05-14。對齊 SPEC §8 / [ISSUE-010](Issue/ISSUE-010.md)。
  M2b 收尾 ✓ / M2c capture+send ✓ / M2d attach+line buffer+CTRL sticky ✓ / M2e signing config + 回前景 refresh ✓(NOTES D-16)。
  **SPEC §8 M2 完成標準(實機 + Claude Code + 中文 IME 整段送)未驗,M2 不算 done。**
  D-4 SSH 私鑰 import 拆 M2e 後 follow-up
- M3 polish + 開源 → 之後開 EPIC-003 對齊 SPEC §8 M3
- **[EPIC-004](Epic/EPIC-004.md) Background-alive attach sessions** —
  切 session 不殺 scrollback,user 比對 / copy 不用回去開 Xshell。
  ISSUE-009 = B-Snapshot 第一階段。Owner 拍板「之後再做」(2026-05-04)
- AI-aware modifier bar 第三排(SPEC §3.5.2)
- Custom `quick_presets` DB 編輯 UI(M1e 先 hard-code seed,DB 編輯放這)
- **routine: 每月查 ed25519-dalek crates.io 有沒有 ≥ 3.0.0-pre.7 release** — 有的話評估從 makiko 切回 russh(D-7 條件)

---

## Done

- [x] Adopt mentor framework (development mode) — commit `a786cca` · 2026-04-28
- [x] Owner 寫真 SPEC.md(舊 SPEC.md 改名 CLAUDE.md)— commit `ea108af` · 2026-04-28
- [x] SPEC.md → `doc/SPEC.md` + 修 mentor.yaml + 修 ARCHITECTURE.md link · 2026-04-28
- [x] CLAUDE.md 內 SPEC.md path 引用 → `doc/SPEC.md` · 2026-04-28
- [x] 定義 milestone(M1a..M1h / M2a..M2e / M3)— SPEC §8 已含,落成 ISSUE-001..008 + EPIC-001 · 2026-04-28
- [x] Line buffer 設計 — SPEC §3.5 / §7.3 已細節化,落成 ISSUE-007 · 2026-04-28
- [x] DB schema — SPEC §5 已定;模糊處(host id、sessions cache、password storage、Android key)agent 已自行拍板,寫進 [`NOTES.md` D-1..D-4](../NOTES.md) · 2026-04-28
- [x] 三層 refresh 模型 — SPEC §3.3 + §6.3 + §9.2 已寫,落成 ISSUE-004 · 2026-04-28
- [x] §10 不做的事 — SPEC §10 已列 · 2026-04-28
- [x] **T-1** 建 `NOTES.md` milestone tracker + decisions log · 2026-04-28
- [x] **M1b/1.5 (D-7) russh → makiko swap** — ed25519-dalek upstream 沒修,owner 拍板換 makiko stable lib(commit `9fd5004` + fix `6170436` + `e22ebf5`)。SPEC §13 deviation 寫進 NOTES.md D-7 · 2026-04-29
- [x] **apply_schema bug fix** — `--` 註解 chunk 把 hosts CREATE TABLE 一起 skip(commit `ba520cd`) · 2026-04-30
- [x] **M1c real (sessions backend swap mock → makiko)** — commit `bf6bf44`,`ssh::run_command` helper + `sessions.rs`(parse tmux output)替換 `sessions_mock.rs` · 2026-04-30
- [x] **keyring platform features fix** — `Cargo.toml` 加 `["apple-native", "windows-native", "sync-secret-service"]`,根因是 keyring 3.x 沒指定 feature → fallback mock backend(NOTES.md D-9)。Owner Windows 驗證通,連帶把 ISSUE-002 + ISSUE-003 都 resolve · commit `616279a` · 2026-05-01
