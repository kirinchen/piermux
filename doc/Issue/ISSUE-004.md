---
id: ISSUE-004
title: M1d — Capture mode + 三層 refresh
epic: EPIC-001
sprint: null
status: open
priority: P0
tasks: []
created: 2026-04-28
---

## Problem

實作 [SPEC §3.3](../SPEC.md) 三層 refresh:session / host / 全域。配 [SPEC §6.3](../SPEC.md) 的 3 個 Tauri command。

## Acceptance Criteria

- [ ] `capture_session` / `capture_host` / `capture_all` 3 個 Tauri command
- [ ] `capture_session` 跑 ssh + `tmux capture-pane -t <session>:0 -p -e -S -200`,回 `CaptureResult` 含 ANSI escape codes
- [ ] `capture_host` 並行 capture 該 host 所有 session,host 內並發上限 3(SPEC §9.2)
- [ ] `capture_all` 對所有 host 並行跑 `capture_host`(host 之間不互相阻塞)
- [ ] Emit Tauri event `capture-updated:<host_id>:<session_name>` for incremental UI update
- [ ] capture_cache 表寫入 `(host_id, session_name, content, captured_at)`
- [ ] UI:tree view host 旁 [🔄] 按鈕、session 旁 [🔄]、主畫面右上 [⟳ Refresh All]
- [ ] Refresh 中 UI spinner,失敗 host 標 ⚠ 不影響其他
- [ ] **完成標準(SPEC §M1 之一):** 3 host × 5 session 全部 refresh-all < 3 秒
- [ ] commit `M1d: capture + 三層 refresh`

## Investigation / Notes

### 2026-04-28
- < 3 秒依賴 SSH RTT,測試環境用 Tailscale 連 backtest mint + VPS,實作前先測 RTT 基準。
- 並發控制建議用 `tokio::sync::Semaphore(3)` per host。
