# piermux v0.1.7 — 對齊新版 tmux 字元寬度(修行頭多餘字)

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版為 **Linux 桌面**發版,修掉新版 tmux(3.4+)畫面「行頭多餘/重複字」。此修正同樣涵蓋 desktop 與 Android 的所有終端;Android APK 待下一次 Android build 隨附。

## What's Changed

- **D-28 對齊新版 tmux 的字元寬度**:新版 tmux(3.4+)把 emoji(`✅ ❌ ⚠️`)當寬度 2,但 xterm.js 預設(Unicode 6)當寬度 1。tmux 全螢幕重繪時每個 emoji 差 1 欄的誤差累積,把行尾字擠到下一行 → **行頭出現多餘/重複字**(copy 時觸發重繪,故容易誤判為 OSC 52 問題;OSC 52 解析經真實 tmux 3.4 bytes 驗證是乾淨的)。
  - 修法:加入官方 `@xterm/addon-unicode-graphemes`(Unicode 15 + grapheme cluster),把 xterm 寬度**完全對齊 tmux 3.4**(含 `⚠️` 的 VS16 組合)。套用到全部 4 個終端(desktop capture / attach、Android capture / attach)。

**Full Changelog**: https://github.com/kirinchen/piermux/compare/v0.1.6...v0.1.7

## Downloads

- **Windows 桌面(x64)**
  - `piermux_0.1.7_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.7_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Linux 桌面(Ubuntu / Linux Mint,x86_64)**
  - `piermux_0.1.7_amd64.deb` — `sudo apt install ./piermux_0.1.7_amd64.deb`(相依 `libwebkit2gtk-4.1-0`、`libgtk-3-0`,Ubuntu 22.04+ / Mint 21+ 內建)
  - `piermux_0.1.7_amd64.AppImage` — `chmod +x` 後直接執行,免安裝

## Known limitations

- graphemes addon 標記為 experimental:罕見的 ZWJ / 國旗 emoji 序列 cluster 可能與 tmux 認定不同(這類 exotic 字元才有殘留風險,一般 CJK + 常見 emoji 內容已對齊)。
- Android APK 未隨此版重出;含 D-28 的 Android build 待下一次發版。
