# piermux v0.1.6 — Android CTRL/ALT toggle + attach inputmode=url

跨多機 tmux session GUI · desktop (Windows) + Android。
本次為 **Android-only** 發版,延續 D-25 的實機回饋修正;desktop 與 v0.1.4 相同,未隨此版重出。

## What's Changed

- **D-27 ① CTRL/ALT 改 toggle(hold)**:由 one-shot sticky(打一個字母自動熄滅)改為 **toggle** — 反藍 = 按住,亮燈期間每個字母 keydown 都帶 modifier,**再點一次才放開**。為 Ctrl+C 等連續/明確組合鍵操作。
- **D-27 ② attach 逐鍵直送改 `inputmode="url"`**:D-25 的 `NO_SUGGESTIONS` 實機 Gboard 仍會組字/選字(multiline textarea 壓不掉 composing)。改用 URL 鍵盤版面,逐鍵直送、打什麼就是什麼。中文需求仍走 capture Send 路(刻意保留 composition)。

**Full Changelog**: https://github.com/kirinchen/piermux/compare/v0.1.5...v0.1.6

## Downloads

- Android APK(`piermux-android-v0.1.6.apk`,universal,離線可跑)

## Known limitations

- 這兩處本質是 Gboard 實機手感,待 owner 實機驗:① CTRL 反藍後連按多鍵都帶 Ctrl、再點熄滅;Ctrl+C 能中斷。② attach 打字逐鍵即時進 PTY、不再跳選字。
- ISSUE-010 M2 sticky acceptance(Android 真機 attach → line buffer 打中文按 Enter)仍待實機驗證,未驗前 M2 不算 done。
- Desktop 未隨此版更新;Windows 使用者請續用 v0.1.4。
