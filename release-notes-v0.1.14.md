# piermux v0.1.14 — 終端字型 / 字級可設定 + 網址點一下開瀏覽器

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版加入兩個設定/體驗功能,desktop 與 Android 四個終端畫面全面套用。

## What's Changed

- **D-35 終端字型 + 字級可設定**(SPEC §11 設定面板第一刀):
  - desktop:header ⚙ 開設定 dialog;Android:host list ⚙ 進設定全屏
  - 字型 10 個 preset + 自訂 CSS font-family;字級 A−/滑桿/A+(8~28px)+ 即時預覽 + 還原預設
  - 改動**即時生效不用重開**,attach 中的 session 不會被踢掉
  - 存單一主字級,grid mini cell 自動 −2、Android attach 自動 −1,預設值跟舊版完全一樣
  - 限制:字型只能用該機器已安裝的(不載外部字型檔);theme / 預設 input mode 之後再做
- **D-36 終端裡的網址點一下用系統瀏覽器開**:
  - 先前在 Tauri WebView 裡點網址不是被擋就是開一個沒界面的內嵌視窗;現在走 `tauri-plugin-opener`(Android 是 Intent → 系統瀏覽器),四個終端畫面都能點
  - 安全:只放行 `http/https`,前端 + capability scope 雙保險
  - 注意:attach 到有開 mouse tracking 的 app(claude code / vim)時,點擊會先被轉給 app,能不能點到連結待實測

## Full Changelog

https://github.com/kirinchen/piermux/compare/v0.1.13...v0.1.14

## Downloads

- **Windows 桌面(x64)**
  - `piermux_0.1.14_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.14_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Android** — `piermux-android-v0.1.14.apk`(universal,離線可跑)
- **Linux** — 待 owner 在 Linux 補上(`.deb` / `.AppImage`)。

## Known limitations

- attach 行頭殘字(字寬根因)未根治,按 F5 / 重繪鈕清除(v0.1.13 的 D-34)。
- ISSUE-010 M2 sticky acceptance(Android 真機 attach → line buffer 打中文按 Enter)仍待實機驗證。
