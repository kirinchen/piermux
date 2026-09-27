# piermux v0.1.22 — `piermux://` deep link:從瀏覽器點一下就 attach

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版:別的工具(第一個是 seamount 面板)可以產一條連結,點下去直接叫起 piermux 並 attach 到那條 session。

## What's Changed

- **`piermux://attach?host=<host>&session=<session>` deep link**(desktop):
  - 冷啟動(piermux 沒開)與熱啟動(已開)兩條路都處理;已開時**聚焦既有視窗**,不會冒出第二個 process
  - host 比對 `hosts` 表的 `display_name`(優先,該欄唯一)再退 `ssh_host`(可能撞名),不分大小寫;
    命中恰好一台 → 直接 attach,零筆 / 多筆 → 停在 host 清單並把 session 名掛在上方橫幅,選一台就接著找
  - session 找不到 → 錯誤提示 + 停在該 host 的清單,**不會**幫你 new-session
  - 契約寫成 [`doc/DEEP_LINK.md`](doc/DEEP_LINK.md);URL 解析 6 個單元測試(含畸形 / 未知動作 / 中文與空白 encode)
- **首個呼叫端**:seamount 面板 `⚡ 即時 STATUS` 的每列 tmux session 多一個 `⧉`,點了就開這邊。

## 安全

deep link 是外部輸入,任何網頁都能叫瀏覽器打開一條。所以契約把能力壓到最小:

- 只吃 host 名與 session 名兩個字串 —— **不吃內部 uuid、不吃指令 / 憑證 / 路徑**,未知參數直接忽略
- **不新增 host、不 SSH 到未登錄主機、不 new-session**
- 終端機內的連結允許清單**維持只有 http / https**(`src/lib/xterm-links.ts` 沒動)。
  放行 `piermux:` 等於讓遠端 session 印一行字就誘導 piermux 自我觸發 —— 這條不准改
- 解析失敗一律安靜丟掉,不 crash、不彈噪音

- Windows 驗收(Tide #159)四案例全過;順手修 Android build:`focus_main_window` 的 desktop-only API 包 `cfg(desktop)`,APK 才編得過(Android 仍不支援 deep link)

## Full Changelog

https://github.com/kirinchen/piermux/compare/v0.1.21...v0.1.22

## Downloads

- **Windows 桌面(x64)**
  - `piermux_0.1.22_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.22_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
  - 🔗 **deep link 要用 installer 裝才有** —— registry 的 scheme 是 installer 寫的。綠色解壓版點連結不會有反應,手動註冊方式見 README。
- **Android** — `piermux-android-v0.1.22.apk`(universal,離線可跑)
- **Linux** — 待 owner 在 Linux 補上(`.deb` / `.AppImage`)。

## Known limitations

- **Android 不支援 deep link**:`AndroidManifest.xml` 缺 `VIEW` / `BROWSABLE` intent-filter,而那份檔在 `gen/` 由 Tauri 產生。要支援另開卡。
- deep link 靠前端既有流程解析 host / session,所以 host 清單還沒載完時會多等一下;這是刻意的(不開後端旁路)。
- 狀態視圖只靠畫面文字判斷,缺 pane metadata;Android 尚無狀態視圖。
- 非 default socket 只能 attach 既有 session,無法從 app 內新建。
- ISSUE-010 M2 sticky acceptance(Android 真機 attach → line buffer 打中文按 Enter)仍待實機驗證。
