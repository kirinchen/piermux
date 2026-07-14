# piermux v0.1.13 — attach 加 F5 強制重繪(行頭殘字 workaround)

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版針對 attach 畫面偶發的**行頭殘字 / 亂碼**(畫面更新或滾輪後,部分行行頭多出重複字元)加上手動解法。

## What's Changed

- **D-34 attach 加 F5 / 「重繪」鈕 = 強制重繪**:行頭殘字的根因是 tmux 與 xterm 對部分字元(CJK / emoji)的字寬計算不一致 —— 而寬度表跟各 host 的 tmux 版本綁定,前端無法一勞永逸根治。實測 resize 視窗會恢復,所以 F5(或 header 的「重繪」鈕)模擬 resize:對 tmux 送兩次 SIGWINCH 逼整屏重畫,殘字立刻清乾淨。使用者主動觸發,不碰輸入路徑。
  - 注意:attach 中 F5 被 piermux 接管,不再傳給 inner app(vim 等若有綁 F5 會收不到)。

**Full Changelog**: https://github.com/kirinchen/piermux/compare/v0.1.12...v0.1.13

## Downloads

- **Windows 桌面(x64)**
  - `piermux_0.1.13_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.13_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Android** — `piermux-android-v0.1.13.apk`(universal,離線可跑)
- **Linux** — 待 owner 在 Linux 補上(`.deb` / `.AppImage`)。

## Known limitations

- 行頭殘字仍會出現(字寬根因未根治),F5 / 重繪鈕是 workaround;根治方向是偵測 host tmux 版本動態調寬度表。
- ISSUE-010 M2 sticky acceptance(Android 真機 attach → line buffer 打中文按 Enter)仍待實機驗證。
