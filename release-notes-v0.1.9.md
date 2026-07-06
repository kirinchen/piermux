# piermux v0.1.9 — 修「直式/非全寬 attach 花屏殘留」

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版為 **Linux 桌面**發版,續修「視窗非全寬 / 直式螢幕時 attach 進去,畫面花屏、零星字卡在行頭」的問題(v0.1.8 的 D-29 方向對但沒修中)。修正同樣涵蓋 Android;APK 待下一次 Android build 隨附。

## What's Changed

- **D-30 attach 後強制一次乾淨全重畫**:實測發現尺寸其實是對的(tmux `window-size=latest` 單 client → tmux 尺寸忠實跟隨 piermux)。真正問題是 **attach 首次繪製撞上 xterm 還在 init/reflow(80×24 → 實際尺寸)**,tmux 內容一邊串進來一邊 reflow → buffer 被弄花、col 0 殘留碎字;而送「相同尺寸」的 resize,tmux 判定沒變、不會重畫(所以 v0.1.8 沒效)。
  - 修法:attach 後主動製造一次**真正的尺寸變化**(送 `rows-1` 再送回 `rows`),逼 tmux 乾淨全重畫一次 —— 等於自動做「手動拖一下視窗」那個動作。desktop 與 Android 都套用。
  - 附帶:attach header 現在會顯示終端 `cols×rows`(順手,也方便日後診斷尺寸問題)。

**Full Changelog**: https://github.com/kirinchen/piermux/compare/v0.1.8...v0.1.9

## Downloads

- **Windows 桌面(x64)**
  - `piermux_0.1.9_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.9_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Linux 桌面(Ubuntu / Linux Mint,x86_64)**
  - `piermux_0.1.9_amd64.deb` — `sudo apt install ./piermux_0.1.9_amd64.deb`(相依 `libwebkit2gtk-4.1-0`、`libgtk-3-0`,Ubuntu 22.04+ / Mint 21+ 內建)
  - `piermux_0.1.9_amd64.AppImage` — `chmod +x` 後直接執行,免安裝

## Known limitations

- 若還有殘留,attach header 的 `cols×rows` 數字可協助判斷(截圖回報即可)。
- Android APK 未隨此版重出;含 D-30 的 Android build 待下一次發版。
