# piermux v0.1.19 — 殘字自癒改走 tmux refresh-client,F5 恢復立即

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
修 v0.1.18 的兩個回歸:自動重繪清不掉殘影、F5 會卡。

## What's Changed

- **D-43 清殘字主路換成 `tmux refresh-client`**:attach 時先把自己的 tty 標記進流,之後整屏重畫直接叫 tmux 重送這個 client 的畫面(等同 `prefix r`)—— 不 SIGWINCH、不驚動 pane 裡的 app、不動 PTY,所以不撞輸入;找不到 tty 才退回舊的 resize 舞步
- **自動重繪回到整屏重畫**:v0.1.18 的純 refresh 治不了 buffer 層殘字,改回輸出停 400ms 後整屏重畫(走 refresh-client),含防自迴圈 / 限流 / 打字中不重畫;Android 同步
- **F5 / 重繪鈕恢復立即**:蒐證(grid diff + dump)搬到 Shift+F5,要採證才按
- **字寬表第一次 attach 就對齊**:探針量完當場套用 + 整屏重畫,不必等下次 attach

## Full Changelog

https://github.com/kirinchen/piermux/compare/v0.1.18...v0.1.19

## Downloads

- **Windows 桌面(x64)**
  - `piermux_0.1.19_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.19_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Android** — `piermux-android-v0.1.19.apk`(universal,離線可跑)
- **Linux** — 待 owner 在 Linux 補上(`.deb` / `.AppImage`)。

## Known limitations

- refresh-client 路線靠 attach 流開頭的 tty 標記;極少數 login shell 環境抓不到時自動退回 resize 舞步(行為同 v0.1.17)。
- 第一次 attach 某 host 前 ~10 秒沿用預設字寬表,探針量完自動切換並重畫一次。
- 非 default socket 只能 attach 既有 session,無法從 app 內新建。
- ISSUE-010 M2 sticky acceptance(Android 真機 attach → line buffer 打中文按 Enter)仍待實機驗證。
