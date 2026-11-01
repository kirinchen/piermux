# piermux v0.1.28 — session 右鍵選單 + Ctrl+C 複製 session 名

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
兩個桌面版主機樹的小改,接續 v0.1.27 的 D-51。

## What's Changed

- **session 列右鍵選單**(D-51):複製名稱 / 重抓畫面 / 重新命名 / Kill。之前右鍵跳的是瀏覽器預設選單。
  功能跟 hover 時出現的小按鈕是同一套。
- **主機樹 Ctrl+C 也能複製 session 名**(v0.1.27 只有 Ctrl+V,Ctrl+V 保留)。
  頁面上有選取文字時不攔(照常複製選取的字);焦點在終端機或輸入框時也不攔(終端機裡 Ctrl+C 照樣是中斷)。

## Assets

- **Linux(x64)** — `piermux_0.1.28_amd64.deb` / `piermux_0.1.28_amd64.AppImage`
- **Windows 桌面(x64)**
  - `piermux_0.1.28_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.28_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Android** — `piermux-android-v0.1.28.apk`(universal,簽章同 v0.1.26,可直接覆蓋更新)

## Full Changelog

https://github.com/kirinchen/piermux/compare/v0.1.27...v0.1.28
