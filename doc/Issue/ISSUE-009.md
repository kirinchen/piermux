---
id: ISSUE-009
title: B-Snapshot — preserve attach scrollback when switching session
epic: EPIC-004
sprint: null
status: open
priority: P2
tasks: []
created: 2026-05-04
---

## Problem

切 attach session(A → B → 切回 A)時,A 累積的 xterm scrollback 全部消失,
owner 撞到「兩邊資料比對 + 互相 copy」的場景就只能回去開 Xshell。

目前 SessionPanel 的 attach effect cleanup 在 `targetId` 變動時跑,做了:
1. `api.detachSession(aid)` — 殺 SSH PTY
2. `xtermRef.current?.clear()` — xterm buffer 全清(2026-05-04 commit
   `54bfbec` 加上的,對齊「detach 時清掉」的 user 預期)
3. `setAttachId(null)`

切回 A 等於從零 attach,scrollback 全沒。

## Acceptance Criteria

- [ ] 用「per-session xterm pool」設計:每個 `${hostId}:${targetId}` 對應**獨立**
      的 xterm 實例,首次 attach 時建立,放進 AttachStore(新增,Zustand 或
      lifted ref state)
- [ ] 切走時:`api.detachSession(aid)` **照舊**(B-Snapshot 不持有 PTY),但 xterm
      實例 + 內容 + scrollback 留在 AttachStore
- [ ] 切回時:從 AttachStore 拿既有 xterm DOM 顯示在 SessionPanel main → 重新
      開 PTY → tmux redraw 疊在現有內容底部(strip alt-screen 的設計確保 redraw
      會被推進 scrollback,user 還是滾得到先前的)
- [ ] LRU evict:max=5(預設),超過自動 detach + dispose 最久沒看的
- [ ] Tree row 視覺:在 AttachStore 裡的 session row 加 indicator(例如綠點)
- [ ] [Detach] 按鈕拆兩個或加 menu:`Detach(保留)` / `Close(丟掉)`
- [ ] 收尾:host 切走 / sidebar 收 / panel unmount / window close → 所有 alive
      一起 detach + dispose,沒 SSH socket leak、沒 memory leak
- [ ] Shell 直連(⚡)維持現況「離開即斷」(SPEC 對直連 shell 沒「背景活著」概念)
- [ ] 已有 line buffer / stream toggle / capture mode 行為不受影響

## Investigation / Notes

### 2026-05-04
- Owner 先前(commit `54bfbec`)用 strip-alt-screen 法把 attach 的所有輸出放進
  xterm normal-buffer scrollback,scrollback 設 20000 行;那個方案前提是「同一
  個 attach 期間的歷史,detach 就清光」。這個 issue 是把「detach 才清」放寬成
  「徹底 close 才清,單純切 session 不清」
- B-Snapshot vs B-Live 比較表詳見 [`EPIC-004`](../Epic/EPIC-004.md) Risks 段:
  Snapshot 切回有 ~0.5-1s 重連延遲、漏掉離開期間的更新,但 SSH socket 用量
  低、複雜度小一級。先 ship Snapshot 驗收 UX,再評估升 Live
- 預估工程量:~150 行(state 上提 + xterm pool + tree indicator + 兩個按鈕)
- GitHub issue:[#1](https://github.com/kirinchen/piermux/issues/1)
  (label: `enhancement`)

## Resolution

_(填於 status → resolved)_

### What was done

### What's different now

### Follow-ups

- 若 owner 驗收後覺得「漏掉離開期間更新」是痛點 → 開 ISSUE-010 升 B-Live
- 若需要同時看兩個 session(split-pane)→ 另開 Epic,本 issue 範圍不含
