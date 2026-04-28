# Tasks — piermux

> **Active sprint:** [SPRINT-2026-W18](Sprint/SPRINT-2026-W18.md) (2026-04-27 → 2026-05-03)
>
> Issues 在 [doc/Issue/](Issue/) 追。本檔放:
> - sprint 承諾 pointer
> - 阻塞 Issues 的 open questions(需要 @Kirin 拍板)
> - 不夠大開 Issue 的 tooling / spike 任務
>
> **Status:** `[ ]` open · `[~]` in progress · `[x]` done。完成移到底部 Done。

---

## Sprint commitments(SPRINT-2026-W18)

- [ ] **[ISSUE-001](Issue/ISSUE-001.md)** M1a — Tauri scaffold + DB
- [ ] **[ISSUE-002](Issue/ISSUE-002.md)** M1b — Host CRUD + Test Connection

> M1c..M1h 已落 [ISSUE-003..008](Issue/) 並掛在 [EPIC-001](Epic/EPIC-001.md),但本 sprint 不承諾(W18 剩 5 天,SPEC §8 估 M1 整體 5-7 天 — 先穩兩個)。下個 sprint 滾入更多。

---

## Open questions(@Kirin 拍板,部分阻塞 Issues)

### Q-1 Host id 生成方式  — @Kirin
SPEC §5 寫 `id TEXT PRIMARY KEY`,沒指定 UUID 還是 user-provided string。CLAUDE.md「Vibe coding 第 1 條」要求問清楚。
**阻塞 ISSUE-001 migration / ISSUE-002 create_host**。

### Q-2 Sessions 是 cache 表還是 live query?  — @Kirin
SPEC §5 沒有 `sessions` table,只有 `capture_cache`。隱含每次按 host node 就跑 `tmux list-sessions`。確認:每次都 live query(可能多開 SSH round-trip)還是 cache + 顯式 refresh?
**影響 ISSUE-003 tree view 設計**。

### Q-3 `auth_type='password'` 的 password 怎麼存?  — @Kirin
SPEC §5 結尾說「密碼存 OS keystore」用 keyring-rs。但 hosts table schema 沒 `secret_alias` 欄位 — 要加嗎?是否乾脆把 `private_key_path` 也統一改成 `secret_ref`(指向 keyring alias)?
**阻塞 ISSUE-002 host CRUD;影響後續 Android 統合(Q-4)**。

### Q-4 Android `private_key_path` 在 M1 階段要先決定嗎?  — @Kirin
SPEC §6.1 有 `import_private_key`,desktop 是 path、Android 要 import bytes 進 keystore。M1 desktop only,可不擋路;但 schema 不改的話 M2 要 schema migration。
**不阻塞 M1,但決定愈早愈省事**。

---

## Tooling tasks(unattached,Issue 之間填縫用)

### T-1 NOTES.md milestone tracker
依 [CLAUDE.md](../CLAUDE.md) 慣例建 `NOTES.md`(repo root)。Header `## Current milestone: M1a`。每 session 結束 append 決策 / spike log。
**ISSUE-001 開工前先建好**(讓 commit 有地方寫)。

### T-2 Cross-dev OS conventions guide
產出:`doc/Wiki/guides/cross-dev-conventions.md`,規則含:
- npm script cross-platform(用 `cross-env` / `rimraf` 取代 bash-isms)
- Rust 路徑用 `Path` / `PathBuf`,不用 raw `\`
- 何時必須 Windows 跑(`tauri dev`、`tauri build`、WebView 行為驗證)
- 何時 Linux dev env 夠用(`cargo check`、type-only 改動)
- Android NDK / NDK toolchain 何時裝(M2 才需要,先寫上去免得忘)

Agent 草稿,@Kirin review。

### T-3 GitHub Actions CI bootstrap
`.github/workflows/ci.yml`:
- `cargo check` / `cargo clippy -- -D warnings` / `cargo fmt --check`
- `npm run build`(含 `tsc --noEmit`)/ `eslint`
- Matrix:`ubuntu-latest`(快 feedback)+ `windows-latest`(真 target)

等 ISSUE-001 scaffold 完 → 接著做。

### T-spike-line-buffer Spike: line buffer × xterm.js(SPEC §9.1)
Throwaway branch,5 行 minimal example 驗 xterm.js 攔 `onData` + 不送 server + 獨立 React input 顯示 buffer 跑通。NOTES 記能 / 不能 / 踩到的坑。
**ISSUE-007 開工前必做**(CLAUDE.md「Vibe coding 第 3 條」)。

### T-spike-android-russh Spike: russh PTY Android cross-compile(SPEC §9.3)
`cargo check --target aarch64-linux-android` 過。NOTES 記 Android NDK 版本 / toolchain 設定。
M2 才迫切,但若 M1 末尾有閒可以先做(免得 M2 第一天炸鍋)。

---

## Backlog(未進 sprint / 未開 epic)

- M2 Android port → 之後開 EPIC-002 對齊 SPEC §8 M2a..M2e
- M3 polish + 開源 → 之後開 EPIC-003 對齊 SPEC §8 M3
- AI-aware modifier bar 第三排(SPEC §3.5.2)
- Custom `quick_presets` DB 編輯 UI(M1e 先 hard-code seed,DB 編輯放這)

---

## Done

- [x] Adopt mentor framework (development mode) — commit `a786cca` · 2026-04-28
- [x] Owner 寫真 SPEC.md(舊 SPEC.md 改名 CLAUDE.md)— commit `ea108af` · 2026-04-28
- [x] SPEC.md → `doc/SPEC.md` + 修 mentor.yaml + 修 ARCHITECTURE.md link · 2026-04-28
- [x] CLAUDE.md 內 SPEC.md path 引用 → `doc/SPEC.md` · 2026-04-28
- [x] 定義 milestone(M1a..M1h / M2a..M2e / M3)— SPEC §8 已含,落成 ISSUE-001..008 + EPIC-001 · 2026-04-28
- [x] Line buffer 設計 — SPEC §3.5 / §7.3 已細節化,落成 ISSUE-007 · 2026-04-28
- [x] DB schema — SPEC §5 已定,open questions 移上 Q-1..Q-3 · 2026-04-28
- [x] 三層 refresh 模型 — SPEC §3.3 + §6.3 + §9.2 已寫,落成 ISSUE-004 · 2026-04-28
- [x] §10 不做的事 — SPEC §10 已列 · 2026-04-28
