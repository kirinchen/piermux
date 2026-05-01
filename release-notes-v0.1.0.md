# piermux v0.1.0 — M1 Desktop Preview

> 跨多機 tmux session 的 GUI 快速 attach 工具。第一個對外 release。

## ⭐ Highlights

- **跨多機 tree view** — 多 host 並列,連線狀態 ✓ / ⚠ icon,折疊展開
- **Capture mode + 三層 refresh** — session / host / 全域,並行刷新所有機器當前狀態。Host click 進 grid view 一眼看該 host 全部 sessions
- **Attach mode** — 點 session 直接進 PTY 雙向互動,不用打 `tmux attach -t ...`
- **Line buffer mode** ⭐ — Attach 時可切 `[Line | Stream]`,**Line 模式整段打完 Enter 才送 + IME 組字 Enter 不會誤送**,真正解決 colony 那種「字元一個個漏到對方 / 打到一半 Claude 已經往前走」的坑

## 安裝(Windows)

從本 release 下載:
- **`piermux_0.1.0_x64-setup.exe`** — 一般使用者裝這個(NSIS installer)
- `piermux_0.1.0_x64_en-US.msi` — 想批次部署 / 內部 Windows 環境用 MSI 的人

> ⚠ **第一次跑會跳 Windows SmartScreen 警告**(「未識別的發行者」)— 沒做 code signing,點「仍要執行」即可。M3 polish 才會考慮買 cert。

裝完後從開始選單啟動 piermux,或執行 `%LOCALAPPDATA%\piermux\piermux.exe`。Host 設定 + 密碼存在 `%APPDATA%\dev.kirinchen.piermux\`(密碼進 Windows Credential Manager,DB 在 `piermux.db`)。

## 從 source build

```bash
git clone https://github.com/kirinchen/piermux
cd piermux
npm install
npm run tauri build    # 出包到 src-tauri/target/release/bundle/
```

需要 Rust 1.85+ / Node 18+ / [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/)。

## 已知限制 / 還沒做

- **沒 Android** — M2 才開工(Tauri Android scaffold + makiko cross-compile spike)
- **沒 send_message + quick presets**(M1e)— 不 attach 直接送一段字到 session 還沒做
- **沒 tray icon + window 隱藏**(M1h)
- **沒 modifier bar**(SPEC §3.5.2)— Desktop 預設用實體鍵盤,M2 Android port 才必要
- **沒 auto-reconnect / multi-window attach** — M3 polish

## 使用上的小提醒

- **Attach 預設 Stream mode**(字元即時送,符合 terminal 直覺)。對 Claude Code 等 AI agent 長訊息對話建議切 **Line** mode 避免「打到一半送出去」
- **detach ≠ kill** — 按 [Detach] 只是退出 piermux 的視窗,server 端 tmux session 仍在跑(下次 attach 進去看到原狀態)。要真的關 session 走 tmux 自己的 `kill-session`
- **第一次 attach 一個 session 會慢 ~1 秒**(SSH connect + PTY allocation + tmux 重畫),之後即時

## 完整 milestone 拆解

見 [`doc/SPEC.md` §8](https://github.com/kirinchen/piermux/blob/main/doc/SPEC.md)。

開發過程的 decision log / sprint notes 在 [`NOTES.md`](https://github.com/kirinchen/piermux/blob/main/NOTES.md) + [`doc/`](https://github.com/kirinchen/piermux/tree/main/doc),vibe coding side project 完整公開。

---

## Stack

Tauri 2 · Rust 1.85 · React 19 · TanStack Query · Tailwind 4 · xterm.js · makiko 0.2 · keyring 3 · sqlx 0.8

## License

[MIT](https://github.com/kirinchen/piermux/blob/main/LICENSE)
