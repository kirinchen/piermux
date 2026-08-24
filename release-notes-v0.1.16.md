# piermux v0.1.16 — tmux socket(-L)分層,tree/list 依 socket 分組

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版支援同一台 host 上多個 tmux socket(`tmux -L <name>`),session tree / list 依 socket 分組顯示。

## What's Changed

- **D-39 tmux socket(-L)分層**:
  - `list_sessions` 改成一條 shell 掃 `${TMUX_TMPDIR:-/tmp/tmux-<uid>}/` 下所有 socket,各跑 `list-sessions`(死 socket 自動略過),不多 SSH round-trip
  - kill / rename / new / attach / capture / send / scroll 全部走 `tmux -L <socket>`,跨 socket 操作都正確落到對的 server
  - desktop / Android 的 session tree / list 依 socket 分組;只有一個 socket 時維持原本扁平顯示(不多一層標題)
  - host 層 `[+]` 新 session 目前一律建在 default socket(要在別的 socket 開新 session 得從機器 CLI,第一刀先這樣)
  - capture 快取與事件名都帶上 socket,既有 DB 自動 idempotent 重建

## Full Changelog

https://github.com/kirinchen/piermux/compare/v0.1.15...v0.1.16

## Downloads

- **Windows 桌面(x64)**
  - `piermux_0.1.16_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.16_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Android** — `piermux-android-v0.1.16.apk`(universal,離線可跑)
- **Linux** — 待 owner 在 Linux 補上(`.deb` / `.AppImage`)。

## Known limitations

- 非 default socket 只能 attach 既有 session,無法從 app 內新建。
- 殘字的字寬根因仍在(v0.1.15 起自動清除);根治方向是偵測 host tmux 版本動態調寬度表。
- ISSUE-010 M2 sticky acceptance(Android 真機 attach → line buffer 打中文按 Enter)仍待實機驗證。
