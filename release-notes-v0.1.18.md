# piermux v0.1.18 — 行頭殘字家族根治(候選版):四個根因全修 + 自動重繪輕量化

跨多機 tmux session GUI · desktop (Windows / Linux) + Android。
本版是 D-28→D-37 殘字 bug 家族兩個月追兇的收網:抓到並修掉四個獨立根因,自動重繪改成零成本的純重畫。

## What's Changed

- **D-41 殘字四根因修正**(flight recorder 實錄 + 離線重放逐一定罪):
  - **listener race**:attach 回來才掛事件 listener,tmux 的初繪(1049h + 整屏)搶先漏掉 → 改前端先產 attach_id、先掛 listener 再 attach(desktop + Android)
  - **re-attach 漏繪**:父層 re-render 造成默默 detach+re-attach,每次都擲一次 race 骰子 → attach effect 依賴改穩定字串
  - **漏網 listener**:attach/capture 快速切換時舊 listener 沒拆乾淨、舊 bytes 污染新畫面 → cancelled 守門
  - **per-host 字寬表(b+)**:host 的 tmux 字寬表(emoji / VS16)與 xterm 不合 → 新增字寬探針(attach 時對 host 實測一次、快取),自訂 xterm provider 逐 host 對齊;`term.reset()` 清舊 attach 殘留
- **D-42 自動重繪輕量化**:輸出停 400ms 後改純 `term.refresh`(不 resize、不碰 tmux、零 SSH、畫面不抖、零輸入風險),Android 也補上自動重繪
- **除錯工具**(平常無感,殘字再現時用):F5 = 蒐證(xterm↔tmux grid diff + flight recorder dump)+ 強制重繪;Shift+F5 = 純 refresh;Ctrl+F5 = 合成層探針;Alt+F5 = 暫停自動重繪

## Full Changelog

https://github.com/kirinchen/piermux/compare/v0.1.17...v0.1.18

## Downloads

- **Windows 桌面(x64)**
  - `piermux_0.1.18_x64-setup.exe` — NSIS 安裝檔(建議)
  - `piermux_0.1.18_x64_en-US.msi` — MSI(批次部署用)
  - ⚠️ 首次啟動會跳 SmartScreen(未買 code-signing 憑證):點「其他資訊」→「仍要執行」。
- **Android** — `piermux-android-v0.1.18.apk`(universal,離線可跑)
- **Linux** — 待 owner 在 Linux 補上(`.deb` / `.AppImage`)。

## Known limitations

- 殘字修正為「候選版」:refreshOnly × D-41 四根因修正的合併組合尚未長時間實機驗證,請實測幾天;殘字再現時 F5 會自動蒐證存 dump。
- 字寬探針第一次 attach 某 host 時在背景量表(~10s),當次沿用預設寬度、下次 attach 生效。
- 非 default socket 只能 attach 既有 session,無法從 app 內新建。
- ISSUE-010 M2 sticky acceptance(Android 真機 attach → line buffer 打中文按 Enter)仍待實機驗證。
