# piermux v0.1.23 — 重畫不再閃 + SSH 換回 russh

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版兩件事:清殘字的自動重畫不再閃一下;SSH 函式庫換回 SPEC 指定的主流庫 `russh`。

> ⚠️ **Pre-release**:SSH 底層整個換掉,Linux 已用真 sshd 跑過端到端測試,
> **Windows / Android 還沒實機驗**。驗過再轉正式版。

## What's Changed

- **重畫不再閃**(D-46):attach 改用 `tmux -T sync`,tmux 每次整屏重畫(初次畫面、
  自動清殘字的 `refresh-client`、視窗縮放)都會包進 DEC 2026 synchronized output,
  xterm.js 收齊才一次貼上,不再看到逐行刷過去。
  - `-T` 要 tmux 3.2+;更舊的 tmux 會自動退回原本的方式,attach 不受影響。
  - 只改畫面輸出的包裝方式,**輸入路徑沒動**。
- **SSH 函式庫 makiko → russh 0.64**(D-47):
  - 當初暫用 makiko 是因為 russh 依賴的 `ed25519-dalek` pre-release 編不過;上游已出 3.0.0 正式版,換回主流庫,也避開 makiko 單一維護者的風險。
  - crypto 後端用 `ring`(Android 交叉編譯路線較穩)。
  - **既有 host 不用重加**:server host key 指紋格式跟舊版一模一樣,之前記錄的 TOFU 指紋照用,不會全部跳「host key 不符」。
  - 順手多的:**ECDSA 私鑰**可以用了;連線加 keepalive(60 秒一次,連 3 次沒回才判斷斷線),attach 掛幾小時比較不會被路由器默默切斷。
  - 修了 exec 的 exit code 判斷(OpenSSH 會先送 eof 再送 exit-status)。
- 最低 Rust 版本 1.85 → **1.89**(russh 要求;只影響自己從原始碼 build 的人)。

## 驗證

- 單元測試 11/11。
- **真 SSH 端到端 4/4**(本機拋棄式 sshd):exec 與 exit code / stderr / 同連線多 channel 並行、
  有 passphrase 的金鑰(含缺 passphrase 的錯誤訊息)、二進位檔上傳往返 sha256 一致、
  PTY 的 exec / shell / 視窗縮放 / 輸入 / 結束。
- tmux 3.4 實測 `-T sync` 有包上 2026;模擬舊 tmux 正常退回。
- **未驗**:Windows、Android 實機(本版 pre-release 的原因)。

## Full Changelog

https://github.com/kirinchen/piermux/compare/v0.1.22...v0.1.23

## Downloads

- **Linux(x64)**
  - `piermux_0.1.23_amd64.AppImage` — 免安裝:`chmod +x piermux_0.1.23_amd64.AppImage && ./piermux_0.1.23_amd64.AppImage`(建議)
  - `piermux_0.1.23_amd64.deb` — Debian / Ubuntu:`sudo dpkg -i piermux_0.1.23_amd64.deb`
  - 🔗 deep link:`.deb` 安裝會註冊 `piermux://`;AppImage 免安裝版需手動註冊,方式見 README。
- **Windows 桌面(x64)** — 待 owner 在 Windows 補上(`.exe` / `.msi`)。
- **Android** — 待 owner 補上(`.apk`)。

## Known limitations

- **Windows / Android 尚未驗 russh 版本**:Android 要跑一次 `tauri android build` 確認 `ring` 交叉編譯。
- **Android 不支援 deep link**(同 v0.1.22)。
- 狀態視圖只靠畫面文字判斷,缺 pane metadata;Android 尚無狀態視圖。
- 非 default socket 只能 attach 既有 session,無法從 app 內新建。
- ISSUE-010 M2 sticky acceptance(Android 真機 attach → line buffer 打中文按 Enter)仍待實機驗證。
