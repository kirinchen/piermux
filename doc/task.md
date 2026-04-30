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
- [~] **[ISSUE-002](Issue/ISSUE-002.md)** M1b — Host CRUD + Test Connection(test_connection 真實 makiko ✓ 2026-04-30,差最後 keyring write bug 收尾就 resolved)
- [~] **[ISSUE-003](Issue/ISSUE-003.md)** M1c — Tree view + sessions(M1c real swap 完 2026-04-30,等 keyring bug 解 + owner 驗 list_sessions 真連)

> M1d..M1h 已落 [ISSUE-004..008](Issue/) 並掛在 [EPIC-001](Epic/EPIC-001.md),但本 sprint 不承諾。下個 sprint(W19)滾入 M1d 起。

---

## 進行中 / open(短期 actionable)

### keyring bug(workaround + agent prevention 已 fix,owner verify pending)
- **症狀:** create_host 後從 keyring read_password 回 `NoEntry`,list_sessions / host_status 報「password not in keyring for host X — re-edit to set」
- **agent 已動的(commit `b3f5395`):** `create_host` 加 validation,auth=password 但 password 空 → bail
- **owner workaround:** App 內點 ✏️ 編輯 → 密碼欄重打 → 儲存 → 重新展開 host
- **若 workaround 沒解 →** 是 keyring 3.6.3 對 Windows Credential Manager 的某個邊角(bus factor 注意)。下一步 debug:在 `secret::store_password` / `read_password` 加 `eprintln!` 看 entry name 有沒有 mismatch

### M1d 預備(等 keyring 解 → owner OK 接手)
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

### T-spike-line-buffer Spike: line buffer × xterm.js(SPEC §9.1)
Throwaway branch,5 行 minimal example 驗 xterm.js 攔 `term.onData` + 不送 server + 獨立 React input 顯示 buffer 跑通。結果寫 `NOTES.md` Spike log。
**ISSUE-007 開工前必做**(CLAUDE.md「Vibe coding 第 3 條」)。

### T-spike-android-makiko Spike: makiko Android cross-compile(SPEC §9.3)
原本是 russh,D-7 swap 成 makiko 後重點不變:
`cargo check --target aarch64-linux-android` 過。NOTES 記 NDK 版本 / toolchain 設定。
M2 才迫切。M1 末尾若有閒可先做(免得 M2 第一天炸鍋)。

---

## Backlog(未進 sprint / 未開 epic)

- M2 Android port → 之後開 EPIC-002 對齊 SPEC §8 M2a..M2e
- M3 polish + 開源 → 之後開 EPIC-003 對齊 SPEC §8 M3
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
