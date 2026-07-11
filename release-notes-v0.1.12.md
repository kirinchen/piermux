# piermux v0.1.12 — 修好 attach 滑鼠滾輪(claude/vim 等全螢幕 app 能捲了)

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版修好 attach 到跑全螢幕 TUI(claude code / vim / less…)的 session 時**滑鼠滾輪滾不動**的問題。

## What's Changed

- **D-33 修好 attach 滑鼠滾輪(全螢幕 app 捲不動)**:先前只要進 attach(tmux 讓終端進 alt-screen),滾輪就一律被導去 `tmux copy-mode`。但 claude code / vim / less 這類**自己開 mouse tracking 的全螢幕 app**,在 tmux 裡沒有 tmux 層 scrollback → copy-mode 進去也是 `0/0`,滾了完全沒反應。改成**偵測 app 有沒有開 mouse tracking**:有(claude/vim/less、或 tmux `mouse on`)就把滾輪交給 app 自己捲(等同 Tabby / 一般終端機);沒有(純 bash shell)才維持看 tmux 歷史的 copy-mode 行為。完全不碰輸入路徑。

**Full Changelog**: https://github.com/kirinchen/piermux/compare/v0.1.11...v0.1.12

## Downloads

- **Windows 桌面(x64)**
  - `piermux_0.1.12_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.12_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Linux / Android** — 待 owner 在 Linux 補上(`.deb` / `.AppImage` / `.apk`)。

## Known limitations

- ISSUE-010 M2 sticky acceptance(Android 真機 attach → line buffer 打中文按 Enter)仍待實機驗證。
