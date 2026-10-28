# piermux v0.1.25 — 支援 Windows(psmux)主機

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版一件事:主機樹可以接 **Windows 上的 psmux**(tmux 相容的 Windows 版),列 session、看畫面、送字、attach 都能用。

> ⚠️ **Pre-release**:psmux 路徑的後端已對 Windows 真機(psmux 3.4.0)跑過 list / capture / send-keys / attach,
> **piermux GUI 還沒在 psmux 主機上實際點過**(送一行字、attach 打中文待驗)。驗過再轉正式版。

## What's Changed

- **Windows / psmux 主機**(D-49):主機設定多兩個欄位,**都留空 = 跟以前一樣**,既有 Linux 主機不用改。
  - **遠端 shell**:Windows 主機填 Git Bash,例如 `"C:\Program Files\Git\bin\bash.exe" -ls`。
    Windows 的 OpenSSH 預設 shell 是 cmd,piermux 會改把指令交給這個 shell 跑。
  - **tmux 執行檔**:填 psmux **真正的 exe 路徑**(用 `C:/…/psmux.exe` 正斜線寫法)。
    winget 裝的 `tmux` / `psmux` 是捷徑,從 ssh 執行會 Permission denied。
  - 填了遠端 shell 就視為 psmux 主機:
    - attach 直接在 Windows 的終端上開 psmux,實測畫面、縮放視窗、關掉後 session 照常存在都正常。
    - psmux 主機**不能從 piermux 建新 session**:從 ssh 建的 session 在 Windows 背景桌面,螢幕上看不到。請在 Windows 桌面上自己建。
    - 字寬探測、拖放上傳檔案在 psmux 主機上暫不支援(會顯示錯誤訊息)。
    - psmux 沒有 tmux 的 synchronized output / 指定 client 重畫,清殘字會用原本縮放視窗的方式。

## 內部

- 非 attach 的 SSH 指令統一走同一個連線 helper(才能套上遠端 shell)。
- 新增 `cargo test sessions::psmux_live -- --ignored`(要設 `PIERMUX_PSMUX_TEST_*`)對真機回歸。

## Assets

- **Windows 桌面(x64)**
  - `piermux_0.1.25_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.25_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Android** — `piermux-android-v0.1.25.apk`(universal,離線可跑)
- **Linux 桌面(Ubuntu / Linux Mint,x86_64)**
  - `piermux_0.1.25_amd64.deb` — `sudo apt install ./piermux_0.1.25_amd64.deb`
  - `piermux_0.1.25_amd64.AppImage` — `chmod +x` 後直接執行,免安裝
