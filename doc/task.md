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

- [~] **[ISSUE-001](Issue/ISSUE-001.md)** M1a — Tauri scaffold + DB(Linux end done,等 owner Windows 驗 `tauri dev`)
- [ ] **[ISSUE-002](Issue/ISSUE-002.md)** M1b — Host CRUD + Test Connection

> M1c..M1h 已落 [ISSUE-003..008](Issue/) 並掛在 [EPIC-001](Epic/EPIC-001.md),但本 sprint 不承諾。下個 sprint 滾入更多。

---

## Tooling tasks(agent 自取,順手做)

### T-2 Cross-dev OS conventions guide
產出:`doc/Wiki/guides/cross-dev-conventions.md`,規則含:
- npm script cross-platform(`cross-env` / `rimraf` 取代 bash-isms)
- Rust 路徑用 `Path` / `PathBuf`,不用 raw `\`
- 何時必須 Windows 跑(`tauri dev` / `tauri build` / WebView 行為驗證)
- 何時 Linux dev env 夠用(`cargo check`、type-only 改動)
- Android NDK / toolchain 何時裝(M2 才需要,先寫上)

### T-3 GitHub Actions CI bootstrap
`.github/workflows/ci.yml`:
- `cargo check` / `cargo clippy -- -D warnings` / `cargo fmt --check`
- `npm run build`(含 `tsc --noEmit`)/ `eslint`
- Matrix:`ubuntu-latest`(快 feedback)+ `windows-latest`(真 target)

ISSUE-001 scaffold 完 → 接著做。

### T-spike-line-buffer Spike: line buffer × xterm.js(SPEC §9.1)
Throwaway branch,5 行 minimal example 驗 xterm.js 攔 `term.onData` + 不送 server + 獨立 React input 顯示 buffer 跑通。結果寫 `NOTES.md` Spike log。
**ISSUE-007 開工前必做**(CLAUDE.md「Vibe coding 第 3 條」)。

### T-spike-android-russh Spike: russh PTY Android cross-compile(SPEC §9.3)
`cargo check --target aarch64-linux-android` 過。NOTES 記 NDK 版本 / toolchain 設定。
M2 才迫切。M1 末尾若有閒可先做(免得 M2 第一天炸鍋)。

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
- [x] DB schema — SPEC §5 已定;模糊處(host id、sessions cache、password storage、Android key)agent 已自行拍板,寫進 [`NOTES.md` D-1..D-4](../NOTES.md) · 2026-04-28
- [x] 三層 refresh 模型 — SPEC §3.3 + §6.3 + §9.2 已寫,落成 ISSUE-004 · 2026-04-28
- [x] §10 不做的事 — SPEC §10 已列 · 2026-04-28
- [x] **T-1** 建 `NOTES.md` milestone tracker + decisions log · 2026-04-28
