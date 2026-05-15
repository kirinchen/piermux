---
id: EPIC-002
title: Android port — touch UI + IPC validation + signed release
status: active
owner: kirin
created: 2026-05-14
target_sprint: null
issues: [ISSUE-010]
---

## Why

對齊 [SPEC §8 M2](../SPEC.md)。M2a 在 2026-05-13 已完整收尾(NDK + cargo
cross-compile + 首次實機 boot ✓,Android 實機跑得起來)。剩下的
M2b..M2e 是把 desktop M1 的核心體驗搬到手機:tree view、refresh、attach、
**line buffer**(SPEC 全文反覆強調的核心賣點 — 這才是 piermux 比 colony /
JuiceSSH 強的地方)。

**M2 完成才驗收得到 SPEC 真正的命題:** Android 真機跑 Claude Code attach,
用 line buffer 打中文按 Enter 整段送,Claude 收到完整訊息 — colony 失敗
場景在 piermux 上 work。沒到 M2,desktop ship 等於只有「Xshell 多 host
版」,不是 piermux。

## Success Criteria

對齊 SPEC §8 M2 完成標準:

- [ ] Android 真機(USB / WiFi)加 host(touch keyboard 鍵盤輸入順)
- [ ] Tree view 看到所有 session,綠/灰 icon 反映連線狀態
- [ ] [⟳ Refresh All] 一次抓完所有 capture(3 host × 5 session 走得通)
- [ ] Attach 一個 Claude Code session → 用 line buffer 模式打**中文**訊息 →
      按 Enter → Claude 端收到完整訊息(**核心驗收點**)
- [ ] Stream toggle 切到 stream mode 跑 `vim` 也 OK
- [ ] Modifier bar(JuiceSSH 風)有 ESC / Tab / Ctrl / 方向鍵,可一鍵送
- [ ] Background lifecycle:app 切後台 + tmux session 不掉、回前景 reconnect
- [ ] 簽名 release APK 跑得起來(D-4 keystore 解掉)

## Out of Scope

- **iOS** — SPEC §10 明列不做
- **平板 split panel** — M3 才做(SPEC §8 M3)
- **EPIC-004 B-Snapshot(切 session 留 scrollback)** — 同樣 attach 路徑但
  不同問題,獨立 Epic 推進
- **Cluster mode / SSH config 匯入 / Recording** — SPEC §10 全部不做
- **Desktop UI 重構** — M2 只新增 Android,不動 desktop 已驗收的東西

## Risks & Open Questions

- **Risk: line buffer × Android Gboard IME 行為未知** —
  desktop 上 IME `isComposing` guard 已驗收,但 Android 的 IME 模型不同
  (Gboard 注音 / 倉頡 / 拼音都會送 composition events,某些版本還有
  `onTextChanged` lag)。M2d 開工前要 spike 一個最小 input 元件量測,先
  確定 IME guard 在 Android WebView 上行為跟 desktop 一致再繼續往上堆功能
- **Risk: 軟鍵盤 + xterm.js viewport** — Android 軟鍵盤彈出會把 WebView
  resize,xterm 的 `fit()` 需要重算。Tauri 2 Android 提供的 keyboard event
  可能不夠,可能要自己用 `visualViewport` API
- **Risk: 螢幕小 + tree + attach 同框塞不下** — Desktop 是 sidebar + main
  雙欄,手機要走 stack navigation(HostList → SessionList → Attach 三個
  screen),整套 routing 要新建
- **Risk: Tauri 2 Android dev WiFi 強耦合** —
  M2a 撞到:`TAURI_DEV_HOST=LAN_IP` 預設模式,手機跟 PC 必須同 WiFi 子網段。
  USB-only / 跨網段場景需要 `adb reverse` fallback,目前先記著真撞到再做
- **Risk: D-7 makiko Android cross-compile** — M2a spike(D-13)驗證 pure
  Rust 全鏈路過,libsqlite3-sys 用 NDK clang 也過。**這條 risk 已關閉**
- **Open Q: src/android/ 跟 src/desktop/ 切分粒度** —
  全分(複製整套元件 + 各自 routing)還是部分共享(hooks / lib 共用,
  UI 層分)?直覺前者快、後者長期乾淨。先走全分(M2b),撞到重複才往
  共享拉
- **Open Q: 軟鍵盤上方 modifier bar 用 React 元件還是 Android native** —
  React fixed bar 簡單但鍵盤可能蓋住、Tauri 2 Android 不一定能掛 Android
  IME extension。先 React fixed bar 撐,撞到 UX 痛點再考慮 native
- **Open Q: stack navigation 用啥** — React Router 還是手刻 view state?
  專案目前沒裝 router。手刻 view state 兩個 screen 還行,三個就比較想要
  router。M2b 時拍板

## Related

- SPEC: §3 (核心 features)、§7.2 (frontend 分層)、§8 M2 (milestones)、§9.3
  (Tauri 2 Android 風險)
- M2a 收尾紀錄:[`NOTES.md`](../../NOTES.md) D-13(spike)、D-15(setup + 首次 boot)
- Sister epic:[EPIC-001](EPIC-001.md) Desktop M1 已 ship、[EPIC-004](EPIC-004.md)
  B-Snapshot 切 session 留 scrollback(獨立進行)
- ADRs: 暫無
