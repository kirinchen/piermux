# piermux v0.1.17 — 拖放上傳檔案到 remote pane

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版:把本地檔案直接拖進 attach 畫面,上傳到該 tmux session 當下所在目錄。

## What's Changed

- **D-40 拖放上傳檔案到 remote pane current pwd**(desktop):
  - attach / session 畫面拖入本地檔 → 上傳到該 pane 的 `pane_current_path`(活的 cwd),toast 回完整遠端路徑
  - 傳輸走既有 SSH 連線 `cat > <path>` 串流(32KB 分塊,makiko 無 SFTP 的經典解),覆蓋同名檔
  - 防呆:512MB 上限、basename 擋 `../` 注入、路徑全 shell_quote;shell target(無活 cwd)不啟用
  - 第一刀 desktop + tmux target only;Android(content:// 無真路徑)之後另做

## Full Changelog

https://github.com/kirinchen/piermux/compare/v0.1.16...v0.1.17

## Downloads

- **Windows 桌面(x64)**
  - `piermux_0.1.17_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.17_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Android** — `piermux-android-v0.1.17.apk`(universal,離線可跑)
- **Linux 桌面(Ubuntu / Linux Mint,x86_64)**
  - `piermux_0.1.17_amd64.deb` — `sudo apt install ./piermux_0.1.17_amd64.deb`(相依 `libwebkit2gtk-4.1-0`、`libgtk-3-0`,Ubuntu 22.04+ / Mint 21+ 內建)
  - `piermux_0.1.17_amd64.AppImage` — `chmod +x` 後直接執行,免安裝

## Known limitations

- 拖放上傳僅 desktop;Android 第二刀
- 上傳無進度條(大檔請等 toast)
