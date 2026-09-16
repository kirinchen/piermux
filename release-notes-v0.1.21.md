# piermux v0.1.21 — overview 加「截圖 / 狀態」切換,一眼看哪個 session 在等你

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版:overview 多一個「狀態」視圖,不用逐格看截圖也知道每個 claude session 是忙、等你回覆、還是收工。

## What's Changed

- **D-44 overview「截圖 / 狀態」toggle**(desktop):
  - header 多一個 segmented toggle,截圖(現有 mini xterm)⇄ 狀態(狀態摘要列),吃同一份 capture,切換無縫、Refresh 通用、不加後端
  - 狀態判定移植自 seamount 的畫面 heuristic(純計算、零 LLM):🏃 生成中 / 🙋 等你回覆 / ☑️ 告一段落,附 attached ●、最後活動時間(>12h 標紅)、草稿(⌨️)或摘要尾巴
  - 選擇記在 localStorage
- README 加桌面截圖

## Full Changelog

https://github.com/kirinchen/piermux/compare/v0.1.20...v0.1.21

## Downloads

- **Windows 桌面(x64)**
  - `piermux_0.1.21_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.21_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Android** — `piermux-android-v0.1.21.apk`(universal,離線可跑)
- **Linux** — 待 owner 在 Linux 補上(`.deb` / `.AppImage`)。

## Known limitations

- 狀態視圖只靠畫面文字判斷,缺 pane metadata(agent 閘門 / OSC 任務名 / copy-mode 保護),第二刀再補;Android 尚無狀態視圖。
- refresh-client 路線靠 attach 流開頭的 tty 標記;抓不到時自動退回 resize 舞步。
- 非 default socket 只能 attach 既有 session,無法從 app 內新建。
- ISSUE-010 M2 sticky acceptance(Android 真機 attach → line buffer 打中文按 Enter)仍待實機驗證。
