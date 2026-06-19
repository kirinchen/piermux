# piermux v0.1.5 — Android 觸控捲動 + 輸入手感

跨多機 tmux session GUI · desktop (Windows) + Android。
本次為 **Android-only** 發版,新內容全是行動端觸控與輸入修正;desktop 與 v0.1.4 相同,未隨此版重出。

## What's Changed

- **D-26**:Android 手指拖曳捲動終端 — capture / attach 兩個 view 都能用手指上下拖曳捲動;alt-screen(tmux 全螢幕)拖曳走 copy-mode 看歷史。修補 D-24 留下的「行動端拖不動」破口(`useTouchScroll`)。
- **D-26 review fixes**:`touch-action:none` 避免瀏覽器搶手勢、unmount race 修正、alt-screen 未 attach 時不吞手勢。
- **D-25**:Android 輸入手感修正 — 快速鍵列點擊後保住軟鍵盤、attach 模式逐鍵即時輸入。
- **chore**:關掉 mentor session-end summary(Stop-hook)。

**Full Changelog**: https://github.com/kirinchen/piermux/compare/v0.1.4...v0.1.5

## Downloads

- Android APK(`piermux-android-v0.1.5.apk`,universal,離線可跑)

## Known limitations

- ISSUE-010 M2 sticky acceptance(Android 真機 attach → line buffer 打中文按 Enter)仍待實機驗證,未驗前 M2 不算 done。
- Desktop 未隨此版更新;Windows 使用者請續用 v0.1.4。
