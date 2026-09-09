# piermux v0.1.20 — Android 補「🔄 重整」鈕(v0.1.19 + 一顆按鈕)

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
v0.1.19 剛出就補:Android attach 畫面沒有手動重繪入口,加回來。

## What's Changed

- **Android attach 畫面右上角「🔄 重整」鈕**:等同 desktop 的 F5 / 重繪鈕,手動整屏重畫清殘字(走 D-43 的 `tmux refresh-client` 主路,不驚動 app)
- 其餘同 v0.1.19(D-43):清殘字主路改 `tmux refresh-client`、自動重繪回整屏重畫、F5 立即、字寬探針量完當場套用

## Full Changelog

https://github.com/kirinchen/piermux/compare/v0.1.18...v0.1.20

## Downloads

- **Windows 桌面(x64)**
  - `piermux_0.1.20_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.20_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Android** — `piermux-android-v0.1.20.apk`(universal,離線可跑)
- **Linux** — 待 owner 在 Linux 補上(`.deb` / `.AppImage`)。

## Known limitations

- refresh-client 路線靠 attach 流開頭的 tty 標記;極少數 login shell 環境抓不到時自動退回 resize 舞步(行為同 v0.1.17)。
- 第一次 attach 某 host 前 ~10 秒沿用預設字寬表,探針量完自動切換並重畫一次。
- 非 default socket 只能 attach 既有 session,無法從 app 內新建。
- ISSUE-010 M2 sticky acceptance(Android 真機 attach → line buffer 打中文按 Enter)仍待實機驗證。
