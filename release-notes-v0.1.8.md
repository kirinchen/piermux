# piermux v0.1.8 — 修「非全寬 attach 行頭殘留/散字」

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版為 **Linux 桌面**發版,修掉「視窗非全寬時 attach 進去,畫面行頭出現殘留/散落字元」的問題。此修正同樣涵蓋 desktop 與 Android;Android APK 待下一次 Android build 隨附。

## What's Changed

- **D-29 attach 後自動同步終端尺寸**:非全寬(desktop sidebar 開 / Android 軟鍵盤)時,attach 當下的 `fit()` 可能在佈局定案前跑、量到過寬的寬度 → 送太寬的 cols 給 tmux → **tmux 畫得比 xterm 實際可見寬度寬 → 換行 desync、行頭殘留/散字**。因為容器實際尺寸沒變,不會自動修正,得手動拖一下視窗才好。
  - 修法:attach 成功後自動補做「拖視窗那一下」—— 用 `requestAnimationFrame` + `setTimeout(200ms)` 各再 `fit()` + `resizeSession` 一次,讓 tmux 依 xterm 實際可見尺寸重畫。desktop 與 Android 的 attach 流程都套用。
  - 註:v0.1.7 的 D-28(emoji/CJK 字寬對齊)是另一個真的 bug、已保留,但不是這次「非全寬行頭殘留」的主因。

**Full Changelog**: https://github.com/kirinchen/piermux/compare/v0.1.7...v0.1.8

## Downloads

- **Linux 桌面(Ubuntu / Linux Mint,x86_64)**
  - `piermux_0.1.8_amd64.deb` — `sudo apt install ./piermux_0.1.8_amd64.deb`(相依 `libwebkit2gtk-4.1-0`、`libgtk-3-0`,Ubuntu 22.04+ / Mint 21+ 內建)
  - `piermux_0.1.8_amd64.AppImage` — `chmod +x` 後直接執行,免安裝

## Known limitations

- Android APK 未隨此版重出;含 D-29 的 Android build 待下一次發版。Windows 桌面亦未隨此版重出,續用 v0.1.7。
