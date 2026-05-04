# piermux

> **跨多機 tmux session 的 GUI 快速 attach 工具,Desktop + Android(規劃中)。**
> 專注於「找 session 快」+「輸入體驗好」。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-M1%20desktop%20preview-orange.svg)](#目前狀態)

---

## 為什麼做這個?

每天要 attach 多台機器上的多個 tmux session,每次都要 `ssh` → `tmux ls` → `tmux attach -t <長名字>` 太煩。現有工具沒一個同時做到這三件事:

| 工具 | 它好的地方 | 缺的 |
|---|---|---|
| **Xshell** | desktop SSH 龍頭,輸入體驗好 | 沒有跨多 host tree view、沒有 Android、不知道 tmux session list |
| **JuiceSSH** | Android SSH 龍頭,modifier bar 完整 | 沒有 line buffer、不知道 tmux session list、沒有跨 host 統合 view |
| **colony** | Android 上有 tmux session 觀念 | tmux 快捷導向(無通用鍵)、字元 stream(會搞壞 AI 對話)、單 host |

**piermux 的賣點:** 跨 host tree view + line buffer 的好輸入體驗 + Desktop / Android 同一套。

---

## 核心 features(SPEC §3)

1. **跨多機 tree view** — 多 host 並列,折疊展開,一眼看所有 host × session
2. **一鍵 attach** — 點 session 直接進去,不用打 `tmux attach -t ...`
3. **三層 refresh capture** — session / host / 全域,並行刷新看「現在所有機器在跑什麼」
4. **Send message** — 不需要 attach 直接送一段文字到 session(規劃中,M1e)
5. **Line buffer 輸入** ⭐ 核心 — 字元先進本地 buffer,Enter 才整段送出,**IME 組字 Enter 不會誤送**;真正解決 colony 那種「打字打到一半 Claude 已經往前走」的坑

---

## 目前狀態

**M1(Desktop)**:**preview shipped**,可日常使用
- ✅ Host CRUD(密碼存 OS keystore,SSH key 支援)
- ✅ Tree view + tmux session list + 連線狀態
- ✅ Capture mode + 三層 refresh + host capture grid view
- ✅ Attach mode(雙向 PTY)
- ✅ Line buffer mode + Stream toggle(IME aware)
- ⏳ Send message + quick presets(M1e,還沒做)
- ⏳ Tray icon + window 隱藏(M1h,還沒做)

**M2(Android)**:**還沒開工**
- 規劃 Android port + makiko cross-compile + JuiceSSH 風 modifier bar

**M3(Polish + 開源)**:這裡

詳細 milestone 拆解見 [`doc/SPEC.md` §8](doc/SPEC.md)。開發過程的 decision log / sprint notes 在 [`NOTES.md`](NOTES.md) + [`doc/`](doc/),vibe coding side project 完整公開。

---

## 安裝 / 試用

### Pre-built(Windows)

下載 [Releases](../../releases) 最新版本的 `.msi` 或 `.exe`。

### 從 source 跑

需要 [Rust](https://rustup.rs/)(MSRV 1.85)+ [Node.js](https://nodejs.org/) 18+ + [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/)。

```bash
git clone https://github.com/kirinchen/piermux
cd piermux
npm install
npm run tauri dev      # 開發模式
npm run tauri build    # 出 release artifact 到 src-tauri/target/release/bundle/
```

### Build Android

**還沒開工 — M2 的事。** 等 Android scaffold + makiko cross-compile spike 跑通。

---

## Tips

### Attach mode 想用滾輪捲 tmux 歷史

Attach mode 下 piermux 會把滾輪事件吞掉(避免被 bash 當成 ↑↓ 觸發 history navigation)。要在 attach mode 滾 tmux 自己的 history 有兩條路:

1. **tmux copy mode**(server 不用改):`prefix + [` 進 copy mode → PgUp / 方向鍵滾 → `q` 離開
2. **server 端 tmux mouse on**(一勞永逸):在你常 attach 的 server 加進 `~/.tmux.conf`:
   ```
   set -g mouse on
   ```
   然後 `tmux source-file ~/.tmux.conf` 重載。之後 attach mode 滾輪就會直接捲 tmux history

要看更多歷史的另一條路是切到 **capture mode**(右上 [Detach] 旁的 mode 切換)— 直接抓 tmux 最後 2000 行 scrollback,不用攔截鍵盤。

### Shell 直連模式滾輪可正常用

shell 直連(host tree 上的 ⚡ row)走 normal screen,xterm 自己有 5000 行 scrollback,滾輪直接捲。

---

## 技術選型

- **[Tauri 2](https://tauri.app/)**(Rust + WebView)— 跨平台原生 app shell
- **[makiko](https://crates.io/crates/makiko)** 0.2 — pure Rust SSH client(`russh` 待 ed25519-dalek upstream 修好,見 [`NOTES.md`](NOTES.md) D-6/D-7)
- **[xterm.js](https://xtermjs.org/)** — terminal 渲染(capture + attach 共用)
- **React 19** + **TanStack Query** + **Tailwind 4** + 手寫 shadcn-style 元件
- **SQLite**(`tauri-plugin-sql` + 自開 sqlx pool)— host config storage
- **[keyring](https://crates.io/crates/keyring)** 3 — macOS Keychain / Windows Credential Manager / Linux Secret Service / Android Keystore(M2)

---

## 開發過程

這是 **vibe coding** side project — 「小事自己決定,大事再問」。協作工具是 [Claude Code](https://claude.com/claude-code),工作守則寫在 [`CLAUDE.md`](CLAUDE.md),開發決策歷史在 [`NOTES.md`](NOTES.md),sprint / issue 紀錄在 [`doc/`](doc/)。整個過程公開,**留作 vibe coding 的工程實況參考**。

---

## License

[MIT](LICENSE)。Copyright (c) 2026 kirinchen。
