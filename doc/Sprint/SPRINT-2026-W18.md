---
id: SPRINT-2026-W18
start: 2026-04-27
end: 2026-05-03
goal: "Land M1a (Tauri scaffold + DB) and M1b (Host CRUD + Test Connection); backfill remaining M1c-M1h to backlog"
issues: [ISSUE-001, ISSUE-002, ISSUE-003]
status: active
---

## Sprint Goal

對齊 [EPIC-001](../Epic/EPIC-001.md) 的前兩個 milestone:把空白 repo 推到「desktop 上能加 host、能 test connection」的狀態。M1c..M1h 已落成 ISSUE-003..008 但本 sprint 不承諾 — W18 剩 5 天,SPEC §8 估 M1 整體 5-7 天,先穩兩個。

## Committed Issues

- [ISSUE-001](../Issue/ISSUE-001.md) M1a — Tauri scaffold + DB · P0
- [ISSUE-002](../Issue/ISSUE-002.md) M1b — Host CRUD + Test Connection · P0

## Daily Notes

_(agents and humans append dated notes as they work)_

### 2026-04-28
- Adopted mentor framework (development mode). Scaffolded `doc/` tree.
- Owner 把舊 SPEC.md 改名 CLAUDE.md,寫了真正的 SPEC.md(commit `ea108af`)。Agent 把 SPEC.md 移到 `doc/SPEC.md`,修 mentor.yaml + ARCHITECTURE.md link。
- 建 EPIC-001 + ISSUE-001..008(對齊 SPEC §8 M1a..M1h)。
- Owner update CLAUDE.md(commit `fb17cc4`)成 vibe coding autonomy 風格 — 「小事自己決定,大事再問」。
- Agent 把先前 4 條 schema open questions 自行拍板(`NOTES.md` D-1..D-4),Issues unblock。
- 建 `NOTES.md`(closes task.md `T-1`)。
- **M1a (ISSUE-001) `resolved`** — agent 在 Linux 把 scaffold + plugin-sql + migration 寫好(commit `9b09716`),VS Code launch 配套(`81067e2`),owner 在 Windows `npm run tauri dev` 跑通(2 分鐘 cargo build)。DB 路徑驗證 lazy init 留給 ISSUE-002 第一個 `list_hosts` invoke 時驗。

### 2026-04-29
- **M1b/1 backend(commit `e0c6994`)**:5 個 Tauri commands(list/create/update/delete/import_private_key)+ hosts repo(sqlx pool + apply_schema)+ keyring 接好。test_connection stub。Cargo.toml 加 7 deps(uuid/keyring/sqlx/tokio/anyhow/chrono),MSRV 1.80→1.85。
- **M1b/1.5 spike timeout(commit `957cdb0`)**:russh 0.60.1 拉的 ed25519-dalek 3.0.0-pre.6 跟新版 pkcs8 API 不容,upstream master 還沒修。NOTES.md D-6。
- **M1b/2 frontend(commit `40930b3`)**:Tailwind 4 + TanStack Query + 手寫 shadcn-style 5 個 components + HostsView + HostFormDialog + 5 個 hooks。`npm run build` 過。
- **ISSUE-002 status**:`in_progress`(test_connection acceptance 還沒 met,等 M1b/1.5)。
- Owner 在 Windows 端跑 M1b/2,新增 host work + DB 落到對的位置 ✓(closes ISSUE-001 acceptance #5)。test_connection stub 訊息照預期。
- **dead_code warnings 修(commit `7cd3f3d`)**:`touch_last_used` / `read_password` / `AuthMaterial` 欄位加 `#[allow(dead_code)]` + comment 解釋等 M1c+ 用。
- **M1c 起步(本 commit)**:owner 拍板「先 4 後 2/3 等 1」 — 路徑 4 = UI 用 mock SSH backend 推進視覺。加 `Session` / `HostConnectionStatus` types + `sessions_mock.rs` backend module + `HostTree` / `SessionPanel` 元件 + `HostsView` 改 split layout。Frontend 跟 backend contract 從一開始就跟最終一樣,SSH unblock 後只換 backend 實作。
- **ISSUE-003 status**:`in_progress`(real SSH 等 M1b/1.5)。

### 2026-04-30
- **M1b/1.5 D-7 makiko swap(commits `9fd5004` / `6170436` / `e22ebf5`)**:owner 拍板「換 SSH lib」,從 russh 切到 makiko 0.2.5(stable,不踩 pre-release dep)。SPEC §13 deviation 寫進 NOTES.md D-7。Owner Windows 端 cargo build + test_connection 真實連線通過 ✓。
- **apply_schema fix(commit `ba520cd`)**:fresh DB scenario 抓到 bug — split SQL by `;` 後第一個 chunk 含 leading `--` 註解 + `CREATE TABLE hosts (...)`,被 `starts_with("--")` filter 整段 skip → hosts table 不會建。改成先逐行 strip `--` 註解再 split。
- **M1c real(commit `bf6bf44`)**:sessions backend 從 mock 換成真 makiko 實作。加 `ssh::run_command(host, port, user, auth, cmd) -> Result<String>` 共用 helper。`sessions.rs` 取代 `sessions_mock.rs`,跑 `tmux list-sessions -F` 拿格式化輸出再 parse。`useHostStatus` 加 `staleTime: 30_000` 避免每次 mount 都重 SSH probe。
- **keyring bug surfaced(workaround + create_host validation `b3f5395`)**:owner 創 host 後 list_sessions 報「password not in keyring」。`create_host` 加 validation 防再發生,workaround 是 owner 編輯既有 host 重打密碼。**等 owner 驗收 workaround 是否有效**;若無效則是 keyring 3.6.3 對 Windows Credential Manager 邊角問題,要在 `secret.rs` 加 logging debug。
- **handoff prep(本 commit)**:NOTES.md D-8 寫 handoff briefing,ISSUE-002/003 acceptance 同步現況,task.md 加當前 actionable + M1d 預備。Owner 評估換 Windows-local agent 接手(更快 cargo build + tauri dev iterate)。
- **ISSUE-002 status**:`in_progress`(差最後 keyring 收尾就 resolved)。
- **ISSUE-003 status**:`in_progress`(等 keyring + 真 list_sessions 驗)。

### 2026-05-01
- **Windows-local agent 第一刀:keyring fix(Cargo.toml platform features)**:owner 在 Windows 跑 `npm run tauri dev` 撞「password not in keyring」。Agent 抓 `Cargo.lock` 看 keyring transitive deps 只有 `log` + `zeroize`,沒 `windows-sys` / `security-framework` / `dbus-secret-service` → 確認 keyring 跑 mock backend。`Cargo.toml` 加 `features = ["apple-native", "windows-native", "sync-secret-service"]`,`cargo check` 過。`Cargo.lock` 重新 resolve 後三平台 backend 都拉進來。詳見 NOTES.md D-9。
- **D-8 outstanding 段預測「Credential Manager 邊角」反推 → 沒猜中**:實際是「根本沒接 OS」,因為 test_connection 不走 keyring 所以先前測試蒙過去。留 D-8 段做警示。
- **ISSUE-002 / ISSUE-003 status**:仍 `in_progress`,等 owner Windows 重編 + 編輯 host b 重打密碼 → list_sessions 拉到真 sessions → 一起 resolved。
- **`npm run tauri dev` 起步小坑**:owner 第一次跑 launch.json 報 `'tauri' 不是內部或外部命令` — clean clone 沒跑過 `npm install`,`node_modules/.bin/tauri` 不存在。`npm install` 後解。M1a 接手 README 該補一行(M3 polish 順手)。
- **Owner 驗收 keyring fix → ISSUE-002 / ISSUE-003 一起 resolve**:重編後編輯 host b 重打密碼 → list_sessions 真的拉到 server tmux session 列表 ✓,host icon 變綠 ✓。兩個 issue status `in_progress` → `resolved`,task.md sprint commitment 三個都 ✓。
- **M1d 開工(本 commit)**:Windows-local agent 開 ISSUE-004 backend(`capture.rs` 三個 commands)。對齊 SPEC §3.3 + §6.3 + §9.2。
- **M1d frontend(本 commit)**:xterm.js readonly SessionPanel + 三層 [🔄] 按鈕 + Tauri event listener。`@xterm/xterm` / `@xterm/addon-fit` / `@xterm/addon-web-links` 加進 deps。`tsc --noEmit` + `npm run build` 都過(1890 modules / 210KB gzip,xterm 多 ~130KB gzip)。**ISSUE-004 perf acceptance(3×5 < 3 秒)等 owner 真實環境量。**
- **Sprint goal 超額**:本 sprint 原承諾 ISSUE-001 + ISSUE-002,實際 ship M1a + M1b + M1c + M1d backend + frontend。ISSUE-002 / ISSUE-003 resolved,ISSUE-004 in_progress 等 owner perf 驗收。M1e+ 滾入 W19。
- **M1d perf 優化(commit `1f3ad4a`)+ Grid UX(commit `7419866`)**:owner 看到 capture 通了之後拍板「C + UX 優化」一起做。`ssh::SshSession` 抽出來給 `capture_host_inner` 一個 host 一條 SSH 跑多 channel(SPEC §9.2,3×5 場景 SSH 連線從 18 條降到 3 條)。Selection type 改成 discriminated union(`kind:'host'` / `kind:'session'`),host name click 進 `HostCaptureGrid`(N×N mini xterm grid + per-cell refresh),session click 進 `SessionPanel`,cell 上 [⇱] 放大,SessionPanel ← back 回 grid。`tsc --noEmit` + `npm run build` 過(1892 modules / 212KB gzip)。
- **M1f attach 開工(commit `8338091`)**:owner 確認 grid view ship ✓ 後直接拍板「實作 attach」(跳過 M1e send_message,稍後再補)。Backend `attach.rs` + 4 commands(attach_session / write_to_session / resize_session / detach_session)+ `AttachRegistry: Mutex<HashMap<String, AttachHandle>>`,reader task 把 PTY 輸出 emit `attach-output-<id>` event,結束 emit `attach-closed-<id>`。Frontend SessionPanel 加 mode toggle + xterm `disableStdin` 切換 + `onData/onResize` wiring。**Stream mode** 預設,line buffer 是 M1g。owner 驗收 ✓。
- **M1f UX 微調(commit `4e9ff5b`,D-10)**:點 session 預設 attach 而非 capture(SPEC §2 偏離,Avat.png mockup 對齊)。NOTES D-10 記。
- **M1g line buffer ship(commit `3e9f7ab`,⭐ 核心賣點)**:`LineBufferInput.tsx` + Line/Stream toggle + IME `isComposing` 護欄。Owner 驗收 ✓。
- **v0.1.0 release(commit `769347a` audit + `90609f6` 改 stream default + tag v0.1.0)**:public-release 前 audit + 4 件小漏修補(.claude/settings.local.json untrack / placeholder username / Avat.png gitignore / 寫真 README)。`gh release create v0.1.0` ship(repo 暫保持 private,owner 之後 Win+Android 都用順再 public)。Build artifacts:MSI 5.2MB / NSIS .exe 3.6MB(3m38s release build)。
- **M1d UX 多選(commit `0c528a1`,本 sprint extra polish)**:tree 加 host checkbox + `MultiHostCaptureGrid.tsx` 並列多 host 比較 view。Selection 加 `'multi-host'` 變體。對齊 owner img.png mockup。

### 2026-05-02
- **M1e send_message + quick presets 開工(本 commit)**:`messaging.rs` backend + `SendBar.tsx` frontend(SessionPanel capture mode 下方)。三個 hardcode preset:`/syncdesk` literal+Enter / `Stop (ESC)` named-key / `Clear (Ctrl+L)` named-key。Backend 加 `literal: bool` 參數(NOTES D-12,SPEC §6.4 寫死 `-l` 但 §3.4 預設 presets 含 ESC/Ctrl+L 需 named-key,SPEC 內部模糊)。`quick_presets` DB 編輯 UI 推到 M3。`cargo clippy -- -D warnings` + `tsc --noEmit` + `npm run build` 過(1894 modules / 216KB gzip)。等 owner Windows 環境驗 send 是否真的到 server。
- **M2a Android cross-compile spike + M1 polish(本 commit)**:owner 拍板「M1h tray icon 推到 M3 epic,先做 sidebar collapsible + shell 直連」+ 順手做 M2a spike(`task.md T-spike-android-makiko` 早一週做完)。詳細 NOTES.md:
  - **D-13 M2a spike ✓:** `cargo check --target aarch64-linux-android` 純 Rust 部分(makiko / Tauri 2 / 全部 crypto deps)全過。`libsqlite3-sys` 需要 NDK clang(標準 Tauri Android 流程)。**D-7 makiko swap 決策驗證有效,M2a 不會在這坑卡死。**
  - **D-14 shell 直連:** Selection 加 `kind:'shell'`,backend `attach.rs` 加 `attach_shell` 共用既有 PTY/registry 流程。HostTree host 展開後 ⚡ shell synthetic row。SessionPanel target prop polymorphic(`{kind:'tmux',session}` | `{kind:'shell'}`),shell 模式自動鎖 attach。SPEC §11 詞彙擴充。
  - **Sidebar collapsible:** HostsView header `[PanelLeft]` toggle,localStorage 持久化,主畫面滿版。
  - `cargo clippy -- -D warnings` + `tsc --noEmit` + `npm run build` 過(1894 modules / 217KB gzip)。

## Retrospective

_(drafted when status transitions to `review`; filled when `done`)_

### What went well

### What could be improved

### Action items

- [ ] ...
