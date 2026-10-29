# piermux v0.1.27 — 貼上 dialog 快捷鍵 + 複製 session 名

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
三個桌面版 UI 小改,都是 Windows 本機實測後提的。

> ⚠️ **Pre-release**:沿 v0.1.26 的 psmux 驗收線,owner 實測過再轉正式版。

## What's Changed

- **多行貼上 dialog:Alt+Enter = 貼上**(D-51)。textarea 裡 Enter 是換行,之前只能滑鼠點「貼上」。
- **多行貼上 dialog:游標真的在文末**。Windows 上 dialog 一開游標會跑回開頭、也不捲到底,改掉。
- **主機樹選著 session 時 Ctrl+V = 複製 session 名稱**到剪貼簿(選 Ctrl+V 是因為 Ctrl+C 在終端機是中斷)。焦點在輸入框或終端機裡時 Ctrl+V 還是正常貼上。

## Assets

- **Windows 桌面(x64)**
  - `piermux_0.1.27_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.27_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Android** — 本版只動桌面版 UI,APK 不重出(沿用 v0.1.26)。
- **Linux** — 待 owner 在 Linux 補上(`.deb` / `.AppImage`)。

## Full Changelog

https://github.com/kirinchen/piermux/compare/v0.1.26...v0.1.27
