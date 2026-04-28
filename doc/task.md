# Tasks — piermux

> **Active sprint:** [SPRINT-2026-W18](Sprint/SPRINT-2026-W18.md) (2026-04-27 → 2026-05-03)
> **Assignee:** `@Kirin` = 需要 owner 拍板/輸入。沒寫 = agent 可直接動手。
> **Status:** `[ ]` open · `[~]` in progress · `[x]` done(完成移到底部 Done 區)。

---

## P0 — Blockers(清掉之前不要動 code)

### T-001 Rename root `SPEC.md` → `CLAUDE.md`,起草真正的 `SPEC.md`  — @Kirin
- 根目錄 `SPEC.md` 內容實為 CLAUDE.md(agent 工作守則),且整份在引用一份不存在的 SPEC(§3.5 / §4 / §4.2 / §7.3 / §9.1 / §10)。
- **Step 1 (agent 可立刻做):** `git mv SPEC.md CLAUDE.md`,並把 `.claude/mentor.yaml` 的 `paths.spec` 改指 `SPEC.md`(等待新檔)。
- **Step 2 (@Kirin):** 起草新 `SPEC.md` 骨架,至少含 §1 產品定位、§2 架構總覽、§3 輸入模型(line buffer 細節)、§4 資料模型、§7 refresh 模型、§9 已知風險、§10 明確不做的事。
- **為何 P0:** 後面所有 P1/P2 的 acceptance criteria 都引用 SPEC 章節。沒有真 SPEC,動手就是猜。

### T-002 定義 M1a / M1b / M1c / M1d 完成標準  — @Kirin
- CLAUDE.md 寫「開始時是 M1a」「完成標準寫在 NOTES.md 開頭」,但 NOTES.md 不存在,milestone 切分也沒在 repo 任何地方。
- **要 @Kirin 提供:** 每個 milestone 交付什麼。建議切分(可改):M1a = scaffold + DB / M1b = SSH + 第一個 attach / M1c = line buffer mode / M1d = capture + 三層 refresh。
- 切完之後,agent 會把每個 milestone 落成 `doc/Issue/` 下的 Issue 檔。

### T-003 Cross-dev OS 規範文件  — agent 草稿 + @Kirin review
- Agent 在 Linux Mint 跑,真正的 Tauri build / dev run 在 Windows。
- 風險:agent 在 Linux 寫的 script / 路徑慣例 build 時才在 Windows 爆。
- **產出:** `doc/Wiki/guides/cross-dev-conventions.md`,規則含:npm script 一律 cross-platform(用 `cross-env` / `rimraf`)、Rust 路徑用 `Path`、什麼時候在 Linux 跑 `cargo check` 不夠、Android NDK 怎麼處理。

---

## P1 — SPEC 內容缺口(blocked by T-001)

### T-101 Line buffer mode 設計  — @Kirin
- 要釘:buffer 大小、支援的 edit ops(←/→/Backspace/word delete?)、partial buffer 怎麼在 xterm.js 顯示、Enter 送出的 byte sequence(`\n` vs `\r\n`)、buffer 非空時 Ctrl+C 行為、跳出進 char-stream mode 的 key combo(if any)。
- 這是專案核心賣點,UX shape 必須 owner 自己決定。

### T-102 DB schema  — @Kirin 拍板 + agent 寫 SQL
- 表:hosts、sessions、host_groups?、key_refs?
- @Kirin 要決定:host id = UUID 還是 user-provided string?sessions 是 cache 表還是 live query?tree view 排序 key?

### T-103 Android keystore 整合  — @Kirin
- CLAUDE.md 提的衝突:`private_key_path` 寫在 hosts table,但 Android 上 key 要存 app 內部。
- 需要政策:keyring-rs 存 blob + 用 alias 引用?desktop 走 path、mobile 走 alias 的雙路徑?

### T-104 三層 refresh 模型  — @Kirin
- session refresh / host refresh / 全域 refresh 三層各自做什麼?並行上限(CLAUDE.md 暗示「host 內 3 並行」)?能否中斷?refresh 中 stale 資料怎麼顯示?

### T-105 明確不做的事(SPEC §10)  — @Kirin
- CLAUDE.md 紅線「不要做 SPEC §10 列為不做的事」但 §10 不存在。要列出來(已知例子:task management、web UI、SSH config 自動讀取 — 確認並補齊)。

---

## P2 — Scaffold(blocked by T-001 + T-002)

### T-201 Tauri 2.x 專案 scaffold
- `npm create tauri-app@latest`,React + TS + Vite。
- `src-tauri/Cargo.toml` 設 Rust 2021,MSRV 1.80。
- Commit 訊息照 CLAUDE.md 格式 `M1a: tauri scaffold + ...`。

### T-202 SQLite migration via tauri-plugin-sql
- 接 plugin,用 T-102 的 schema 寫第一份 migration。
- 路徑用 T-003 的 cross-dev 規則。

### T-203 Frontend skeleton
- Tailwind + shadcn/ui (desktop preset)。Routes:hosts list、session tree、attach view。
- TanStack Query provider,query key 用 `[域, 動作, ...]` 慣例。

### T-204 建立 `NOTES.md` milestone tracker
- 依 CLAUDE.md 慣例。Header 是當前 milestone。每個 session 結束 append 決策 / spike log。

### T-205 CI bootstrap
- GitHub Actions:`cargo check` / `cargo clippy -- -D warnings` / `cargo fmt --check` / `tsc --noEmit` / `eslint`。
- Matrix:`ubuntu-latest`(快速 feedback)+ `windows-latest`(真正 target)。

---

## P2 — Spikes(寫真功能前先 de-risk)

### T-211 Line buffer × xterm.js 整合 spike(SPEC §9.1)
- CLAUDE.md 點名的已知風險。「Vibe coding 第 3 條」:先寫 5 行 minimal example 跑通。
- 產出:throwaway branch + NOTES 記「能 / 不能,踩到的坑」。
- **Blocked by:** T-101(沒 spec 不知道要證明什麼)。

### T-212 russh PTY channel Android target spike
- 驗 russh + PTY 真的能 cross-compile 到 `aarch64-linux-android`。
- 不用實機跑,先 `cargo check --target aarch64-linux-android` 過。
- 產出:NOTES 記 Android NDK 版本 / toolchain 設定需求。

---

## Backlog(Sprint 2+,還沒承諾)

- M2 Android packaging(M1d done 之後)
- Tailscale 整合 UX
- 多 host group 管理 UI
- Secrets rotation UX
- (隨 Issue 落地補)

---

## Done

- [x] **T-000** Adopt mentor framework (development mode) — commit `a786cca` · 2026-04-28
