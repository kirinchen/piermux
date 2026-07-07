# piermux v0.1.10 — 修好 attach 輸入(移除搞壞輸入的 nudge)+ 非全寬花屏

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版**修好 v0.1.8 / v0.1.9 弄壞的 attach 輸入**,並用不干擾輸入的方式重修非全寬花屏。desktop + Android 同步。

## What's Changed

- **D-31 修好 attach 輸入(回歸修復)**:v0.1.8/v0.1.9 的「attach 後 nudge 尺寸」(D-30 會送 `rows-1` 再送回 `rows` 逼 tmux 全重畫)正好撞上使用者 attach 完馬上打字/貼上 → tmux 重繪與輸入交錯 → **多空白、貼上不完全**。移除這個 nudge,attach 輸入回到 v0.1.7 的乾淨手感。desktop + Android 都中、都修。
- **D-32 非全寬 attach 花屏 / 字寬跑掉(換不碰輸入的解法)**:根因是 attach 送給 tmux 的尺寸在非全寬(sidebar 佔位)時量錯 → tmux 用錯寬度畫第一屏 → 換行錯位 + 行頭殘字。改成**在 attach「之前」等佈局定案(雙 `requestAnimationFrame`)再量尺寸**,tmux 第一屏就畫對,不必事後補畫、完全不碰 attach 後的輸入路徑。

**Full Changelog**: https://github.com/kirinchen/piermux/compare/v0.1.9...v0.1.10

## Downloads

- **Windows 桌面(x64)**
  - `piermux_0.1.10_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.10_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Android** — `piermux-android-v0.1.10.apk`(universal,離線可跑)

## Known limitations

- 若非全寬 fresh attach 仍偶有殘留,**手動拖一下視窗邊緣**即乾淨(尺寸重量);請回報,下一步會改等容器尺寸穩定再 attach。
- Linux 桌面未隨此版重出;含 D-31/D-32 的 Linux build 待 owner 補。
- ISSUE-010 M2 sticky acceptance(Android 真機 attach → line buffer 打中文按 Enter)仍待實機驗證。
