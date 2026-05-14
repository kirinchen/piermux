---
id: ISSUE-010
title: M2b..M2e — Android frontend + IPC validation + signed release
epic: EPIC-002
sprint: null
status: open
priority: P1
tasks: []
created: 2026-05-14
---

## Problem

M2a 完成(2026-05-13,NOTES D-15):APK 在實機跑得起來,但裡面跑的是
desktop UI(`src/desktop/HostsView`)直接被搬上 WebView,touch 體驗不行、
sidebar + main 雙欄塞不進手機螢幕、軟鍵盤彈起來把 attach view 蓋一半。

這張 issue 蓋 M2b..M2e 全部範圍(owner 拍板「不要開太細」,先一張卡推進,
撞到重大轉折再 spawn sub-issue)。

對齊 [SPEC §8 M2](../SPEC.md):

- **M2b** Android UI scaffold + stack navigation
- **M2c** Tree view + 三層 refresh + send message
- **M2d** Attach + Modifier bar(JuiceSSH 風)+ **line buffer**(核心驗收點)
- **M2e** Background lifecycle + reconnect + signed release APK

## Acceptance Criteria

### M2b — Android UI scaffold

- [ ] `src/android/` 目錄建好,跟 `src/desktop/` 平行
- [ ] `App.tsx` 加 platform routing:Tauri 偵測 platform = Android → 走
      `<AndroidApp />`,desktop 維持 `<HostsView />`(偵測手法待 spike,
      可選 `@tauri-apps/api/os` 或 `navigator.userAgent`)
- [ ] Stack navigation(HostList → SessionList → Attach 三個 screen),
      back button 退一層,Android 系統 back 鍵也 wire 上
- [ ] HostList screen:卡片式 row(host 名 + status 點),tap 進 SessionList
- [ ] 排版適配 portrait(主要)/ landscape(基本可用),不擠不切

### M2c — Tree view × 三層 refresh × send message

- [ ] SessionList screen 顯示該 host 的 tmux sessions,row tap 進 Attach
- [ ] 每個 row 右側 [🔄] capture-single、screen header [⟳ Refresh] capture-host、
      HostList header [⟳ Refresh All] 全 capture
- [ ] Send message bar(SPEC §3.4 / desktop SendBar 對應)出現在 capture
      view 下方,三個 hardcode preset 跟 desktop 一致
- [ ] 3 host × 5 session refresh-all 時間量測(只是觀察,SPEC 沒對 mobile
      時限,desktop < 3 秒)

### M2d — Attach + Modifier bar + line buffer ⭐

- [ ] Attach screen:上方 xterm.js readonly capture / live output,下方
      independent input(line buffer 模式預設,SPEC §9.1 fallback 設計)
- [ ] Line buffer input:**中文 IME(Gboard 注音 / 拼音 / 倉頡)按 Enter
      整段送**(SPEC §1.2 colony 失敗場景),`isComposing` guard 在
      Android WebView 行為驗證 OK
- [ ] Stream toggle 切到 stream mode 跑 `vim`(SPEC §3.5 fallback)
- [ ] Modifier bar(JuiceSSH 風)固定在軟鍵盤上方:ESC / Tab / Ctrl /
      ↑↓←→,tap 即送(Ctrl 為 sticky,下一個按鍵 + Ctrl)
- [ ] 軟鍵盤彈出/收起時 xterm `fit()` 重算正確,內容不被鍵盤蓋住

### M2e — Background lifecycle + signed release

- [ ] App 切後台:attach 的 SSH PTY 保留 ≥ 30 秒,tmux session 不掉
- [ ] 回前景:重新拉 capture / re-attach,UI 顯示「reconnecting...」短暫狀態
- [ ] App 完全 kill 重開:host 列表 + DB 都還在(SQLite 持久化 ✓)
- [ ] 簽名 APK:用 D-4 規劃的 Android keystore(本 issue 順手解 D-4)
- [ ] `npm run tauri android build --release` 跑得出 signed APK,實機 install
      跑得起來

### 整體驗收(SPEC §8 M2 完成標準)

- [ ] Android 真機加 host → 看到 tree → attach 一個 Claude Code session →
      line buffer 打**中文**訊息 → Enter 整段送 → **Claude 端收到完整訊息**
- [ ] Owner 在實際工作流(不是 demo,是真的拿來跑)用 ≥ 1 小時沒撞致命
      bug

## Investigation / Notes

### 2026-05-14
- M2a 收尾(NOTES D-15)裡 Tauri 2 Android dev 預設 `TAURI_DEV_HOST=LAN_IP`
  模式,手機跟 PC 同 WiFi 子網段就 work,USB-only / 跨網段需要 `adb reverse`
  fallback,目前先用同 WiFi 路徑撐住
- 預估工程量範圍寬:M2b ~1 天(routing + 三個 screen 殼),M2c ~1 天(複用
  hooks/lib + 排版適配),M2d ~2 天(IME spike + modifier bar + fit()
  細節撞牆),M2e ~1 天(lifecycle 不確定,可能多)。SPEC §8 估 4-6 天合理
- M2b 開工先做最小可跑路徑:platform detection + 三個空 screen + back 鍵 wire,
  邊跑 `tauri android dev` 邊驗,別堆太多再驗

## Resolution

_(填於 status → resolved)_

### What was done

### What's different now

### Follow-ups

- 若 M2d IME × line buffer 撞到 Android WebView 限制 → 可能要走 SPEC §9.3
  fallback A(launch JuiceSSH 處理 PTY,piermux 只處理 line buffer pre-send),
  屆時開新 issue
- 若 src/android/ 跟 src/desktop/ 重複嚴重 → M3 開 refactor issue 把共用
  UI 抽 `src/shared/`
