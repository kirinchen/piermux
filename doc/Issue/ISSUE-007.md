---
id: ISSUE-007
title: M1g — Line buffer mode + Stream toggle + send queue preview ⭐
epic: EPIC-001
sprint: null
status: open
priority: P0
tasks: []
created: 2026-04-28
---

## Problem

**piermux 核心賣點**。完整實作 [SPEC §3.5](../SPEC.md) line buffer mode + stream toggle + send queue preview。Frontend 邏輯詳見 [SPEC §7.3](../SPEC.md)。

## Acceptance Criteria

- [ ] `LineBufferInput.tsx` 元件依 SPEC §7.3 程式碼實作:line mode 攔截 `term.onData`,字元進 buffer,Enter 才 invoke `write_to_session`
- [ ] Backspace 在 line mode 只刪 buffer,不送 backspace 到 server
- [ ] 切換 mode 時 buffer 自動清空
- [ ] `ModeToggle.tsx` 顯示 `[ Line | Stream ]`,當前模式明顯標示。預設 Line。
- [ ] Modifier bar 上的特殊鍵(ESC / 方向鍵 / Tab / Ctrl+X)無論 mode 都直接送(不進 buffer)
- [ ] Send queue preview 顯示「下一個 Enter 會送什麼」(SPEC §3.5.3 框框)
- [ ] **完成標準(取代 colony 失敗的場景):** attach 一個 Claude Code session,line mode 打一段中文 + Enter,Claude 收到完整訊息,xterm.js attach view 看到 server echo 全段 + Claude 回覆
- [ ] commit `M1g: line buffer mode + send queue preview`

## Investigation / Notes

### 2026-04-28
- **Risk (SPEC §9.1):** xterm.js `onData` + 我們 hold 字元 + 視覺要看到打字 — SPEC 設計是「xterm 顯示 server echo,輸入區獨立 React input 顯示 buffer」。Fallback:attach view 改成「server output 唯讀區 + 下方獨立輸入框」(SPEC §9.1 寫了)。
- **Spike 先做:** 5 行 minimal xterm.js + onData hold 字元範例,跑通再寫 `LineBufferInput.tsx`(CLAUDE.md「Vibe coding 第 3 條」)。Spike 結果寫進 NOTES。task.md 有對應 tooling task。
