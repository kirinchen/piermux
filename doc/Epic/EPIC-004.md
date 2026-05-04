---
id: EPIC-004
title: Background-alive attach sessions for fast switching
status: planning
owner: kirin
created: 2026-05-04
target_sprint: null
issues: [ISSUE-009]
---

## Why

目前切 attach session(session A → session B)會走 attach effect cleanup
→ `api.detachSession(aid_A)` 殺 PTY + `term.clear()` 清 xterm 的 scrollback。
切回 A 要重新 attach,**A 累積的歷史輸出全部沒了**。

Owner 反映:實際工作流會撞到「兩邊 session 資料比對 + 互相 copy」,例如
從 A 抓某個值複製到 B。當前模型下原本的資料一切走就不見,owner 為了這個
場景現在還是回去開 Xshell — 違反 piermux 「跨多 host 多 session attach
快」的核心定位。

## Success Criteria

最小可驗收(B-Snapshot,ISSUE-009 範圍):

- [ ] Attach session A → 累積 scrollback X
- [ ] 切到 session B(或 host C 的 session,或 ⚡ shell)→ A 的 PTY 斷,但 A 的
      xterm DOM + scrollback 內容**留著**
- [ ] 切回 A → 看到當初的 scrollback X(可往上滾)+ tmux 重新 attach 重畫的
      當前狀態(疊在底部)
- [ ] HostTree 上對「有保留歷史的 session」row 加視覺 indicator(綠點 / icon)
- [ ] 達到 LRU max=5 時自動 evict 最舊的 alive session(detach + dispose xterm)
- [ ] Detach 按鈕語義拆清楚:「Detach(留歷史)」vs 「Close(徹底丟)」
- [ ] 切走 host / 收 sidebar / close window 時所有 alive session 一起收乾淨

進階(後續可能再開 ISSUE-010,屬於同 Epic):

- [ ] B-Live 升級:alive session 的 PTY **不斷**,reader task 持續寫進隱藏
      xterm,切回完全沒延遲、漏不了「離開期間的更新」

## Out of Scope

- **Split-pane / 並排 attach view** — 那是另一個 UX 訴求(同時看兩個 session),
  跟「切換時保留歷史」不同問題。可能之後另開 Epic
- **跨 app restart 持久化** — alive session 限 in-memory,piermux 重開就清空
- **Shell 直連(⚡)的 alive** — 直連 shell 沒 server-side persist,「背景 alive」=
  保持一條登入 shell 在跑,語義跟 tmux 不同。本 epic 不處理,維持現況「離開即斷」

## Risks & Open Questions

- **Risk: state ownership 大改** — `xtermRef` / attach lifecycle 從 SessionPanel
  內部上提到 HostsView level(或 Zustand store / custom hook)。SessionPanel 從
  「擁有 xterm」變成「顯示某個 xterm」。動到不少現有結構(line buffer / capture
  toggle / shell 模式),要小心不要砸壞 M1 已驗收的功能
- **Risk: SessionPanel mode toggle 語義要重定義** — 現在 [Detach] 按下去是
  「切到 capture mode」。新模型下要區分「切到 capture(保留 alive)」 vs
  「真的 close」。可能要拆兩個按鈕或改 menu
- **Risk: resize 在隱藏狀態下** — 隱藏的 xterm 不收 ResizeObserver。顯示時要強制
  `fit()` + send resize 給 server。M1f attach 的 force-fit 模式可借
- **Risk: 錯誤狀態擴散** — 某條 alive PTY 因 server SSH timeout 死掉時,要把那條
  evict 掉、tree row 標離線,不影響其他 alive 的
- **Open Q: LRU max 應該預設多少?** — 估 5 個 tmux session × 5000 行 scrollback
  ≈ 8 MB,memory 沒壓力;但 UI 上 5 個綠點是不是太雜亂?需要驗收
- **Open Q: B-Live 跟 server `MaxSessions` 撞** — OpenSSH 預設 `MaxSessions 10`,
  alive 5 個 + capture-all 偶爾再開 → 接近上限。B-Live 要不要 per-host SSH
  連線共用(已有 `SshSession::client()` 暴露的基礎)避免每個 attach 各開 socket

## Related

- SPEC: §3.4 attach mode、§9.2 SSH 連線管理
- Architecture: 影響 `desktop/SessionPanel.tsx`、`desktop/HostsView.tsx`、
  `desktop/HostTree.tsx`、`src-tauri/src/attach.rs`(B-Live 才需)
- Decision log:[`NOTES.md`](../../NOTES.md) 開工時加 D-15 記 state ownership
  上提的取捨
- ADRs: 暫無
