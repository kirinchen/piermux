# piermux v0.1.11 — 純版號 bump(重新發版,無功能變更)

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版**程式碼與 v0.1.10 完全相同**,只是換一個乾淨的版號重新發版。

## What's Changed

- 無功能 / 修復變更。內容等同 v0.1.10(D-31 attach 輸入回歸修復 + D-32 非全寬 attach 花屏修復)。
- 版號 bump `0.1.10 → 0.1.11`。

**Full Changelog**: https://github.com/kirinchen/piermux/compare/v0.1.10...v0.1.11

## Downloads

- **Windows 桌面(x64)**
  - `piermux_0.1.11_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.11_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Linux / Android** — 待 owner 在 Linux 補上(`.deb` / `.AppImage` / `.apk`)。

## Known limitations

- 若非全寬 fresh attach 仍偶有殘留,**手動拖一下視窗邊緣**即乾淨(尺寸重量);請回報。
- ISSUE-010 M2 sticky acceptance(Android 真機 attach → line buffer 打中文按 Enter)仍待實機驗證。
