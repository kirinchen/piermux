# piermux v0.1.26 — psmux 主機可以建 session 了

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版一件事:v0.1.25 把 **Windows(psmux)主機的「新增 session」擋掉**,這版放行。

> ⚠️ **Pre-release**:psmux 主機的 GUI 實測(新增 / 列 session / capture / 送字 / attach)由 owner 在 laptop 本機進行中,驗過再轉正式版。

## What's Changed

- **psmux 主機可以從 piermux 新增 session**(D-50)。
  v0.1.25 的錯誤訊息「從 ssh 建出來的 session 在 session 0,桌面看不到」前提不成立:
  psmux 用 `~/.psmux/<name>.port` 找 session,不分 Windows session,桌面的 `psmux ls` / attach 一樣看得到 ssh 建的 session。
  唯一真正的限制:那個 session 裡起的 **GUI 程式不會顯示在桌面**(ssh 的 session 0 沒有桌面),跑 shell / Claude Code 不受影響。

## 內部

- `new_session` 對 psmux 主機走原本的 `tmux_cmd` + `run_on_host`(不帶 `-L`,腳本經 Git Bash)。

## Assets

- **Windows 桌面(x64)**
  - `piermux_0.1.26_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.26_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Android** — `piermux-android-v0.1.26.apk`(universal,離線可跑)
- **Linux** — 待 owner 在 Linux 補上(`.deb` / `.AppImage`)。

## Full Changelog

https://github.com/kirinchen/piermux/compare/v0.1.25...v0.1.26
