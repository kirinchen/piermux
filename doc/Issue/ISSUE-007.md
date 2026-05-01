---
id: ISSUE-007
title: M1g — Line buffer mode + Stream toggle + send queue preview ⭐
epic: EPIC-001
sprint: SPRINT-2026-W18
status: in_progress
priority: P0
tasks: []
created: 2026-04-28
started: 2026-05-01
---

## Problem

**piermux 核心賣點**。完整實作 [SPEC §3.5](../SPEC.md) line buffer mode + stream toggle + send queue preview。Frontend 邏輯詳見 [SPEC §7.3](../SPEC.md)。

## Acceptance Criteria

### Frontend(完成,本 commit)

- [x] `LineBufferInput.tsx` 元件 — 走 SPEC §9.1 的「server output 唯讀區 + 下方獨立輸入框」fallback 路徑(實際上是更乾淨的設計):xterm 是 server output 顯示器(`disableStdin=true`),輸入用原生 `<textarea>`,buffer 是 component-local state。
- [x] Backspace 在 line mode:textarea 原生行為(只刪 textarea 內容,不送到 server)✓ 自動達成,無需特殊處理。
- [x] 切換 mode 時 buffer 自動清空 — `<LineBufferInput key={attachId ?? "pending"} />`,attach session 切換 → component remount → buffer state 重置;切到 Stream → component unmount → buffer 釋放。
- [x] `[ Line | Stream ]` toggle button group(`InputModeToggle` 元件),當前模式有 `bg-background shadow-sm` 視覺標示。**預設 Line**(SPEC §3.5.1)。
- [x] Send queue preview = textarea 本身(textarea 顯示的就是「下一個 Enter 會送什麼」,加 char count 顯示)。SPEC §3.5.3 mockup 的「Next send 預覽框 + Input 輸入框」兩格合一個 — 同一份內容沒必要兩處顯示。
- [x] **IME(中文輸入法)** 護欄 — `e.nativeEvent.isComposing` 防 IME 組字過程的 Enter(Chinese / Japanese / Korean 注音 / 拼音 commit 不會誤送)。SPEC 沒明寫但 owner 用中文是核心場景,Day 1 就要做對。
- [x] Send 內容是 buffer + `\r`(SPEC §7.3 範例 + 標準 PTY 行為:`\r` 是 PTY Enter,line discipline 翻 `\n`)。

### M1g 範圍外(交給其他 issue / milestone)

- [ ] Modifier bar(ESC / 方向鍵 / Tab / Ctrl+X 等特殊鍵)直接送 — **SPEC §3.5.4 desktop modifier bar 預設隱藏**,M2 Android 才必要。Desktop 暫時的 workaround:切 Stream mode 用實體鍵盤。
- [ ] Quick presets / Send / Send+Enter 多按鈕 — M1e(send_message + quick presets)的範圍。
- [ ] commit `M1g: line buffer mode + send queue preview` — 本 commit。

### 等 owner Windows 真實環境驗

- [ ] **完成標準(取代 colony 失敗的場景):** attach 一個 Claude Code session,line mode 打一段中文 + Enter,Claude 收到完整訊息,xterm 看到 server echo 全段 + Claude 回覆。

## Investigation / Notes

### 2026-04-28
- **Risk (SPEC §9.1):** xterm.js `onData` + 我們 hold 字元 + 視覺要看到打字 — SPEC 設計是「xterm 顯示 server echo,輸入區獨立 React input 顯示 buffer」。Fallback:attach view 改成「server output 唯讀區 + 下方獨立輸入框」(SPEC §9.1 寫了)。
- **Spike 先做:** 5 行 minimal xterm.js + onData hold 字元範例,跑通再寫 `LineBufferInput.tsx`(CLAUDE.md「Vibe coding 第 3 條」)。Spike 結果寫進 NOTES。task.md 有對應 tooling task。

### 2026-05-01 — 直接走 SPEC §9.1「fallback」路徑(實際是更乾淨的設計)

跳過 SPEC §7.3 範例的「攔截 xterm.onData 累積 buffer」approach,直接走 SPEC §9.1 結尾段提到的「server output 唯讀區 + 下方獨立輸入框」設計。理由:

1. **避免 race / focus 同步問題:** xterm 拿 keydown + 我們從 onData callback 內部 hold 是兩條 path 同步(IME composition 在 xterm 內部 vs textarea 內部行為不同)。textarea 是 web 原生,IME 等所有 input edge case 瀏覽器幫你解。
2. **xterm 純粹當 server output viewer:** `disableStdin=true`(`ssh.rs` SshSession 還是寫 stream,但 frontend 不收 keypress)。Code path 簡單。
3. **聊天介面感:** 對 Claude Code / AI agent 對話場景,「上面看 output、下面打字」直觀,跟 colony / JuiceSSH 的「打字進 PTY 立刻送」差異 explicit。

SPEC §9.1 原文認可這條路:「**這個 fallback 反而更接近聊天介面,可能對 Claude Code 場景更直觀**」。M1g 直接 ship 這個。

**Spike 沒做** — 直接走 fallback 設計繞開 onData/buffer 整合的潛在坑,沒有需要 spike 的部分。task.md 的 `T-spike-line-buffer` 可以直接 close。

### 設計細節

- **輸入框是 `<textarea rows={3}>` resize-y** — 多行輸入(Shift+Enter 換行)很重要,Claude Code 對話常常多段
- **char count 顯示** 在 textarea 上方 — owner 觀察「我打了多少字」,小 nudge 提醒檢查再送
- **`\r` not `\n`** — buffer + `\r` 走 PTY line discipline,行為等同實體鍵盤按 Enter。SPEC §3.5.1 寫的「自動加 `\n`」是 loose terminology,實作用 `\r` 才對
- **Buffer 內含的 Shift+Enter 換行 char(`\n`)直接傳出** — PTY / shell / Claude Code 自己處理。多行輸入到 Claude Code 的場景:embedded `\n` 是訊息內容的一部分,不該被改成 `\r` 害每行都觸發 Enter
- **`onData` 仍 wire,但 line mode 從 `inputModeRef` 看當下值決定 noop**(避免 attach effect 為了 inputMode 變動 re-run)
