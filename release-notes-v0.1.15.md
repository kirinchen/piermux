# piermux v0.1.15 — 行頭殘字自動清除 + Android 觸控拖曳修好

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版修掉兩個纏很久的 bug:desktop attach 的行頭殘字不用再手動 F5,Android 拖曳畫面不再卡 `[0/0]`。

## What's Changed

- **D-37 行頭殘字自動清除(自動版 F5)**:殘字根因(tmux 與 xterm 字寬計算在部分字元不合,且寬度表綁各 host 的 tmux 版本)前端無法根治,但已證實 F5 的 resize 重繪必治 → 自動化:attach 輸出停 400ms 就自動跑一次重繪,殘字約 0.5 秒內自動消失。輸入保護:距最後一次鍵盤輸入 2 秒內不發動、重繪不自我觸發、最少間隔 3 秒 —— 打字/貼上完全不受影響。F5 / 重繪鈕保留(想立刻清可手動按)。
- **D-38 Android 觸控拖曳修好(不再卡 `[0/0]`)**:先前拖曳畫面一律進 tmux copy-mode,但 claude code / vim 這類自己開 mouse tracking 的全螢幕 app 在 tmux 層沒有 scrollback → copy-mode `[0/0]` 卡死(跟 v0.1.12 修的桌面滾輪同源,當時只修到滾輪沒修到觸控)。改成偵測 app 有開 mouse tracking 就把拖曳轉成滾輪事件交給 app 自己捲(等同桌面滾輪行為);純 shell 拖曳維持 copy-mode 看 tmux 歷史。之前卡在 `[0/0]` 的 session,手指往上滑一下會自動退出。

## Full Changelog

https://github.com/kirinchen/piermux/compare/v0.1.14...v0.1.15

## Downloads

- **Windows 桌面(x64)**
  - `piermux_0.1.15_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.15_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Android** — `piermux-android-v0.1.15.apk`(universal,離線可跑)
- **Linux** — 待 owner 在 Linux 補上(`.deb` / `.AppImage`)。

## Known limitations

- 殘字的字寬根因仍在(僅自動清除);根治方向是偵測 host tmux 版本動態調寬度表。
- ISSUE-010 M2 sticky acceptance(Android 真機 attach → line buffer 打中文按 Enter)仍待實機驗證。
