---
id: ISSUE-004
title: M1d — Capture mode + 三層 refresh
epic: EPIC-001
sprint: SPRINT-2026-W18
status: in_progress
priority: P0
tasks: []
created: 2026-04-28
started: 2026-05-01
---

## Problem

實作 [SPEC §3.3](../SPEC.md) 三層 refresh:session / host / 全域。配 [SPEC §6.3](../SPEC.md) 的 3 個 Tauri command。

## Acceptance Criteria

### Backend(完成,commit `59a7916`)

- [x] `capture_session` / `capture_host` / `capture_all` 3 個 Tauri command(`src-tauri/src/capture.rs`)
- [x] `capture_session` 跑 ssh + `tmux capture-pane -t <session>:0 -p -e -S -200`,回 `CaptureResult` 含 ANSI escape codes
- [x] `capture_host` 並行 capture 該 host 所有 session,`tokio::sync::Semaphore(3)` per host(SPEC §9.2)
- [x] `capture_all` 對所有 host `tokio::spawn` 並行跑 `capture_host_inner`(host 之間不互相阻塞);個別 host 失敗 swallow 不影響其他
- [x] Emit Tauri event `capture-updated:<host_id>:<session_name>`,payload = `CaptureResult`
- [x] `capture_cache` 表寫入 — `INSERT ... ON CONFLICT(host_id, session_name) DO UPDATE`

### Frontend(完成,本 commit)

- [x] UI:tree view host 旁 [🔄] 按鈕(hover 出現)、session 旁 [🔄](hover 出現)、主畫面右上 [⟳ Refresh All]
- [x] Refresh 中 UI spinner — 三個按鈕分別有 `Loader2` 動畫
- [x] xterm.js readonly 在 `SessionPanel` 顯示 ANSI capture(`@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-web-links`)
- [x] SessionPanel mount → `api.captureSession` 拉一次 + `listen('capture-updated:<host>:<session>')` 接 host/all refresh 觸發的 incremental update
- [x] 失敗 host 標 ⚠ 不影響其他 — host_status 既有 disconnected ⚠ icon(M1c)持續表現,refresh-all/host 失敗只 toast.error,不污染 tree icon

### 等 owner Windows 真實環境驗

- [ ] **完成標準(SPEC §M1 之一):** 3 host × 5 session 全部 refresh-all < 3 秒
  - **agent 端不能驗** — 需要 owner 真實 Tailscale + 多 host 環境量。可能要做 SPEC §9.2「每 host 一條 persistent SSH」優化才達標(M1d 暫每次 capture 新開 SSH,handshake 成本高)
- [ ] commit `M1d: capture + 三層 refresh` — backend `59a7916` + frontend(本 commit)

## Investigation / Notes

### 2026-04-28
- < 3 秒依賴 SSH RTT,測試環境用 Tailscale 連 backtest mint + VPS,實作前先測 RTT 基準。
- 並發控制建議用 `tokio::sync::Semaphore(3)` per host。

### 2026-05-01 — Backend ship(commit `59a7916`)+ Frontend ship(本 commit)

**Backend 設計選擇:**
- M1d 還是每次 capture 開新 SSH(走現成 `ssh::run_command`)。SPEC §9.2「每 host 一條 persistent SSH」是後續優化,等 owner 量到 3×5 capture > 3 秒再做。
- session_name 用 POSIX 單引號 quote(`shell_quote`)— 防使用者 tmux session 名加奇怪字元;tmux session name 規則禁 `:`,所以 event name `capture-updated:<host_id>:<session_name>` 可 exact match,不會撞到 host UUID 內部本來就沒 `:` 也好辦。
- 失敗策略:`capture_host_inner` 個別 session 失敗 `eprintln!` 跳過(讓 host 內其他 session 繼續);`capture_all` 對個別 host 失敗 swallow,符合 SPEC §3.3「失敗 host 標 ⚠ 不影響其他」。
- DRY:`sessions::list_sessions_for(host: &Host)` 抽出無 Tauri State 的 helper,`list_sessions` Tauri command + `capture_host_inner` 共用。

**Frontend 設計選擇:**
- xterm.js instance 跨 selection 切換 reuse(`useEffect([])` mount 一次),session 切換時 `term.clear()` + `term.write(new content)`。Dispose 在元件 unmount 時。
- container `<div>` 永遠 render(空 selection 時用絕對定位 overlay 顯示「點左側 session 看 capture」placeholder)— 因為若 conditional render container,xterm init `useEffect` 跑時 `containerRef.current = null`,xterm 永遠 init 不起來。
- `ResizeObserver` 接到 container resize → `fit.fit()`(content scale 給 panel 寬度)。
- `useCapture.ts` 只放 `useRefreshHost` / `useRefreshAll` 兩個 mutation;session-level refresh 直接在 SessionPanel imperative 呼叫 `api.captureSession`,搭配 listener。沒有 TanStack cache(直接寫 xterm)。
- 不從 `capture_cache` table 讀回顯示 stale content(SPEC §5 schema 註解的「show stale + spinner」UX 推到 M2 — 目前每次切過去都 fresh fetch,owner 體感不卡再決定)。
- Refresh All / Refresh Host 按 → mutation invoke,backend emit N 個 event,SessionPanel listener 抓到當前 selection 的那個就重畫。其他 session 的更新只進 capture_cache(目前不用)。

**已知限制 / 待 owner 驗:**
- xterm 字型用 `JetBrains Mono` fallback chain;Windows 端若沒裝這字型會 fallback 到 Consolas(預期可接受)。
- xterm 顏色 theme hardcoded(`#0a0a0a` 背景 / `#e5e5e5` 前景),沒接 Tailwind theme tokens,M3 polish 再說。
- tmux capture 時 `-S -200` 拉 200 行 history,xterm `scrollback: 5000` 留充足空間給未來 trace 多輸出場景。
