# NOTES — piermux working log

> 每 session append 決策 / spike / 踩坑。Owner review 時讀這份。
> SPEC: [`doc/SPEC.md`](doc/SPEC.md)。工作守則: [`CLAUDE.md`](CLAUDE.md)。

## Current milestone

**M1b 收尾 + 預備 M1c → M1d**(實作中,2026-04-30)— M1c real backend 已 ship,差 keyring bug owner workaround 收尾就把 M1b/M1c 都 resolved。M1d capture 未開工。可能換 Windows-local agent 接手(D-8)。

---

## Decisions log

### 2026-04-28 — Schema decisions(SPEC §5 / §6.1 模糊處)

掃 SPEC §5 + §6 後遇到 4 個模糊點。依 CLAUDE.md「小事自己決定 + 寫進 NOTES + commit message」,先選一個合理解釋,owner review 時可調。

#### D-1 `hosts.id` 用 UUID v4(synthetic)

- **SPEC §5 schema:** `id TEXT PRIMARY KEY` + `display_name TEXT NOT NULL UNIQUE`
- **推論:** display_name 已是 user-facing 的唯一名,id 還獨立存在 → 表示是 internal synthetic
- **選 UUID v4**(`uuid` crate),local 生成,user 改 display_name 不影響 FK / capture_cache 對應
- **Affects:** ISSUE-001 migration、ISSUE-002 create_host

#### D-2 Sessions = live query,不開 cache 表

- **SPEC §5** 沒有 `sessions` table,只有 `capture_cache`
- **SPEC §6.2** `list_sessions(host_id)` 名字隱含每次都拉
- **方案:** 每次按 host node 都 invoke `list_sessions` 跑 SSH。Frontend 用 TanStack Query in-memory cache(query key `['sessions', hostId]`),refresh button → `queryClient.invalidateQueries`
- **Affects:** ISSUE-003 tree view

#### D-3 密鑰 alias 從 `host_id` 推導,schema 不加 `secret_alias` 欄位

- **SPEC §5** 刻意沒有 password 欄,結尾寫「密碼存 OS keystore」(keyring-rs)
- **推論:** `host_id` 已唯一,keyring entry name 直接 derive 即可,不必塞 schema
- **規則:**
  - `piermux/host/{host_id}/password`(`auth_type='password'` 用)
  - `piermux/host/{host_id}/private_key`(future Android 用,M2 才需要)
- **Affects:** ISSUE-002 host CRUD

#### D-4 `private_key_path` 對 Android 的處理 → 推到 M2

- **SPEC §6.1** `import_private_key`:desktop 是 path、Android 要 import bytes 進 keystore
- **M1 是 desktop only**,M1 schema 不動
- **M2 開工時的選擇(留給未來 me):** Android 端把 bytes 寫進 keystore,alias 寫回 `private_key_path` 欄(復用),或加 schema migration 補新欄
- **Affects:** ISSUE-002 範圍縮回 desktop path,Android 邏輯留給 EPIC-002

### 2026-04-29 — Backend DB access 設計(M1b)

#### D-5 Backend 開自己的 sqlx pool 直連 DB,跟 `tauri-plugin-sql` 共存

- **問題:** SPEC §6.1 把 hosts CRUD 列為 backend Tauri commands(`create_host` 等),但 `tauri-plugin-sql` 的設計理念是 frontend 寫 SQL,backend 不一定能拿到 plugin 的 sqlx pool
- **選的:** Backend 自開 sqlx `SqlitePool`,DB 路徑用 `app_handle.path().app_data_dir()` 推導(跟 plugin-sql 落同一檔)。SQLite 開 WAL mode 讓 plugin-sql + backend 兩條 connection 共存
- **為什麼不走方案 2(frontend 直接寫 SQL):** business logic(UUID 生成、keyring 存密碼、SSH test 連線結果決定要不要寫 last_used_at)集中 backend 比較乾淨,frontend 只 invoke。SPEC §6.1 也是這個意圖
- **plugin-sql 保留給:** M1d `capture_cache` 寫入時 frontend incremental UI update 用(`onUpdated` event 等)
- **Affects:** ISSUE-002 + 後續 ISSUE-003/004 backend 邏輯

#### Dependencies 加進 Cargo.toml(本次)

- `russh` ^0.50 — SSH client,SPEC §13 指定
- `uuid` 1 with `v4` — D-1 host id 用
- `keyring` 3 — D-3 password 存 OS keystore
- `sqlx` 0.8 with `runtime-tokio,sqlite` — backend pool
- `tokio` 1 with `full` — async runtime(tauri 已 transitive 帶,加 direct dep 顯式)
- `anyhow` 1 — error 短期用,M1 後期再升 thiserror per CLAUDE.md
- `chrono` 0.4 with `serde` — `last_used_at` 等 timestamp

CLAUDE.md「加 dep 小事直接動」,沒先問 owner。Plugin/SSH/keyring 都是主流維護中的 crate。

#### D-6 russh 暫拔,test_connection stub(2026-04-29)

**踩到的坑:**
- `cargo add russh` → 0.60.1
- `cargo check` 在 `ed25519-dalek 3.0.0-pre.6` 編譯時掉:`pkcs8::Error::KeyMalformed` 在新版 pkcs8 從 unit variant 改成 tuple variant,但 ed25519-dalek pre.6 source 還用舊寫法(2 行)。
- 試降版本:russh 0.55-0.59 都拉 `base16ct 0.2.0`(crates.io 抓不到,可能 yanked);russh 0.54.6 拉 `libcrux-ml-kem 0.0.3`(yanked)。
- 試 `cargo update -p ed25519-dalek` — 沒有更新版本,pre.6 已是 latest pre-release。

**選擇(owner 拍板 A+E hybrid):**
- **拔 russh 出 Cargo.toml**,`ssh.rs` 變 stub:`test_connection` 回 `Err("暫時下線")`,signature + `AuthMaterial` enum 保留以便接回。
- 5/6 commands(list/create/update/delete/import_private_key)完整,test_connection 顯示明確錯誤訊息。
- **平行 spike(M1b/1.5):** agent 找 ed25519-dalek 修好的 fork(或自己 fork 改 2 行),用 `[patch.crates-io]` 接回 russh。Spike 結果寫進此區。
- 為什麼不換 SSH lib(makiko / ssh2):SPEC §13 + CLAUDE.md 紅線都明寫 russh。換等於動 SPEC,M2 / M3 都受影響,只為短期 dep bug 不值得。

**M1b/1 acceptance 影響:**
- 5/6 Tauri commands 完整實作 → 勾上
- test_connection stub → 留空,Resolution 註明等 patch
- 不擋 M1b/2 frontend(Add Host 流程不靠 test_connection 也能 save)
- 不擋 M1c..M1g(那幾個沒用 SSH connect,只用 list_sessions / capture-pane / send-keys 等 — 但 SPEC §6.2-6.6 都靠 SSH,所以實際上 M1c 起步前 patch 必須到位。M1b/1.5 是必經)

#### M1b/1.5 Spike 結果(2026-04-29,先 timeout)

**找到的事實:**
- ed25519-dalek 已搬進 monorepo `dalek-cryptography/curve25519-dalek`(舊 repo archived)
- Master `ed25519-dalek/src/signing.rs` line 733 / 739 **仍用 unit variant** `pkcs8::Error::KeyMalformed`(2026-01-25 之後沒人動)
- Upstream 還沒同步 pkcs8 0.11+ 的 tuple variant 改動 — open bug
- crates.io 上 ed25519-dalek 沒有比 3.0.0-pre.6 更新的 release

**結論:**
- 沒辦法直接 `[patch.crates-io] = { git = "...", branch = "main" }` — master 也壞
- 自己 fork + 修 2 行不只是「加括號」,要構造正確的 `KeyError` 值(pkcs8 文件不熟,風險高)
- CLAUDE.md「卡超過 1 小時換方向」已觸發,**spike timeout**

**怎麼接續(下次 session 或 owner):**
1. 定期(例如每週)check upstream `dalek-cryptography/curve25519-dalek` master 跟 crates.io ed25519-dalek 有沒有 ≥3.0.0-pre.7 的 release
2. 一旦看到 pre.7+ 上線,`cargo add russh` 重試一次,通了就接回 ssh.rs
3. 真的等不到 → 需要 owner 拍板:fork patch、或重新評估 makiko 等替代

**M1c 之前必須到位** — M1c 開始用 `list_sessions(host_id)`(SPEC §6.2),要 SSH connect。所以這個阻塞 SPEC §8 M1 整體進度,不只是 M1b。

**先做 M1b/2 frontend(無 SSH 依賴,Add Host 流程不靠 test_connection)** 把 host CRUD 端到端跑通。

#### D-7 SSH lib swap russh → makiko(2026-04-29,SPEC §13 deviation)

**情境:** 這禮拜要能用,等 ed25519-dalek upstream 修不可預期(D-6 spike 已驗 master 還沒修)。Owner 拍板「現在動手 spike makiko」。

**驗證:**
- `cargo add makiko` 加 v0.2.5,dep tree resolved 乾淨(沒踩 pre-release,`x25519-dalek 2.0.1` / `pkcs8 0.7.x` 都是 stable mature)
- `cargo check` Linux 上**Rust source 全 type 過**(只剩 system lib `atk/gtk/glib` 等 Linux 環境缺,owner Windows 沒這問題)
- `ssh.rs` 用 makiko `Client::open` + `auth_password` + `auth_pubkey` + `open_session` + exec("whoami") 鏈路寫完。`AuthMaterial` enum API 對外不變,`commands.rs` / frontend 都不用動

**SPEC §13 deviation:**
- SPEC 寫「`russh` 0.45+ — 純 Rust 好 cross-compile 到 Android」
- makiko 同性質(純 Rust,理論 Android 可 cross-compile,M2 NDK spike 才能真驗 — 跟 russh 同)
- **不改 SPEC**,留在 NOTES 記:russh upstream 修好 + 真的測過比 makiko 完整(尤其 M1f attach + M1g line buffer 的 PTY 行為),**就切回 russh**;否則 makiko 留下

**切回 russh 的觸發條件(留給未來 me):**
1. ed25519-dalek crates.io 上 ≥ 3.0.0-pre.7 release
2. 或 ed25519-dalek 3.0.0 stable release
3. 試 `cargo add russh@0.60` + `cargo check`,過了就 swap `ssh.rs` 回 russh API + `cargo remove makiko`
4. 如果 makiko PTY 行為在 M1g 出問題,提早觸發

**makiko maintainer / API 風險:** D-6 結尾段已寫,單一 maintainer (honzasp),bus factor 高;PTY 行為 M1g 才會踩到。M1b-M1c 範圍 makiko 完全夠用。

---

## Spike log

_(待 ISSUE-007 開工前 append:line buffer × xterm.js)_
_(待 M2 接近時 append:russh PTY Android cross-compile)_

---

## Implementation log

### 2026-04-28 — M1a 實作

**Scaffold approach:**
- 用 `npm create tauri-app@latest piermux-scaffold --template react-ts --manager npm --identifier dev.kirinchen.piermux --tauri-version 2 --force --yes` 在 /tmp 起 scaffold
- 把 scaffold 內容(`src/`、`src-tauri/`、`package.json`、`vite.config.ts`、`tsconfig*.json`、`index.html`、`public/`、`.vscode/`、`.gitignore`)複製進 repo,跳過 README.md(repo 已有)
- 全 repo 把 `piermux-scaffold` rename 成 `piermux`(`package.json` name、`Cargo.toml` package.name、`Cargo.toml` lib.name → `piermux_lib`、`tauri.conf.json` productName + window.title、`main.rs` lib 引用)

**Cargo.toml 調整(超出預設 scaffold):**
- 加 `rust-version = "1.80"`(CLAUDE.md MSRV)
- 加 `description` + `authors = ["kirin"]`
- **拿掉 `tauri-plugin-opener`**:scaffold 預設帶,但 SPEC 沒用到,YAGNI 先拔(同時清掉 `package.json` 裡的 `@tauri-apps/plugin-opener`、`capabilities/default.json` 裡的 `opener:default`、`lib.rs` 裡的 `.plugin(tauri_plugin_opener::init())`)
- **加 `tauri-plugin-sql = { version = "2", features = ["sqlite"] }`** + `package.json` 加 `@tauri-apps/plugin-sql ^2` + `capabilities/default.json` 加 `sql:default`

**Migration (`src-tauri/migrations/0001_initial.sql`):**
- 4 張表 verbatim 對 SPEC §5:`hosts` / `ui_preferences` / `quick_presets` / `capture_cache`
- 沒加額外的 CHECK 限制(SPEC 沒寫,先不過度約束)
- `hosts.id` 是 `TEXT PRIMARY KEY`,backend `create_host` 內生 UUID v4(D-1)
- 沒加 `secret_alias` 欄位(D-3,密鑰 alias 從 host_id 推導)

**lib.rs:** 拿掉 demo `greet` command,只註冊 SQL plugin + migration:
```rust
.plugin(
    tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:piermux.db", migrations)
        .build(),
)
```
DB URL `sqlite:piermux.db` + tauri identifier `dev.kirinchen.piermux` → tauri-plugin-sql 預設落在 `%APPDATA%\dev.kirinchen.piermux\piermux.db`(Windows 端,符合 ISSUE-001 acceptance)。

**App.tsx:** 把 Vite/Tauri/React logo demo 拿掉,留最小 placeholder:`piermux` 標題 + 一行 SPEC tagline + 「M1b 起接 host CRUD」提示。M1c 進 Tailwind + shadcn/ui 時整個 UI 重做。

**Linux dev env 限制(預期):**
- 系統缺 `webkit2gtk-4.1` + `gtk+-3.0` + `rsvg2`(`pkg-config` 找不到),Tauri CLI scaffold 也警告了
- **依 CLAUDE.md「不自己 winget install / apt install」原則,不在 Linux 補 system 套件**
- 結果:`npm install` + `tsc --noEmit` 在 Linux 上能跑;`cargo check` 在 src-tauri 會在 link 時掉(沒 webkit2gtk)
- 真正的 `cargo check` / `tauri dev` 必須在 Windows owner 端驗(ISSUE-001 acceptance「`npm run tauri dev` 在 Windows 起得來」)
- 不影響 commit:Rust source-level 是寫得通的,只差 system 連結

**還沒做(留給 owner 在 Windows 端 / 後續 Issue):**
- `npm run tauri dev` 實跑(Windows only)
- 真實確認 DB 落 `%APPDATA%\dev.kirinchen.piermux\piermux.db`
- `cargo clippy -- -D warnings`(Linux 沒 system 套件跑不到)
- ESLint 設定(M1a 沒寫真 React code,延到 M1b/M1c)

---

## Owner 痛點 / SPEC 衍生提醒

- ❗ **colony 害 owner 搞壞 Claude session** — line buffer mode 是這個工具存在的理由(SPEC §0 / §3.5)。任何 attach / send_message 改動都先想:會不會打字打到一半被 server 看到 → 即觸發 Claude?
- 🪟 dev env 是 Linux 跑 agent + 真 Tauri build 在 Windows。跨平台路徑 / shell 細節注意(`task.md` T-2 cross-dev guide 在做)

---

### 2026-05-02 — D-14 加「shell」概念(SPEC §11 vocabulary 擴充)

**動機:** Owner 想要對每個 host 直連 SSH 開 login shell(無 tmux)。場景:
- Host 沒裝 tmux,但仍想連
- Quick admin 跑一兩個 command(`uptime` / `df -h` 等)
- Debug 連線層問題(SSH auth 通不通)

**SPEC §11 詞彙原本:**
- Session — 該 host 上的一個 tmux session

「shell」是新概念,跟 Session(tmux)平起平坐但意義不同。

**設計:**
- **Backend:** `attach.rs` 加 `attach_shell(host, cols, rows)` Tauri command。跟 `attach_session` 同流程(SSH connect + PTY allocation + reader task + registry),差別**唯一一行**:
  - `attach_session`:`session.exec("tmux attach -t SESSION")`
  - `attach_shell`:`session.shell()`(server 端開 user 預設 login shell)
- write_to_session / resize_session / detach_session **不分 attach 種類**,共用 4 commands(都認 attach_id),frontend 行為對 shell 跟 tmux session 完全一樣
- Refactor `attach.rs` 把共用流程抽 `open_pty_channel` + `finalize_attach`,attach_session / attach_shell 各自 5 行專屬

**Frontend UX:**
- `Selection` 加 `{ kind: 'shell', host: Host }` discriminated 變體
- HostTree:host 展開後**第一個 child 是 synthetic「⚡ shell」row**,然後才是 tmux sessions。Click 進 SessionPanel attach 模式
- SessionPanel target prop polymorphic — `{kind:'tmux', session}` | `{kind:'shell'}`,內部依 target 決定:
  - 標題顯示(session name 還是 "shell")
  - 走 attach_session 還是 attach_shell
  - shell 模式不顯 capture mode 切換 / Refresh capture(shell 沒 capture 概念,server 端不存歷史)
- Detach shell → 回 host capture grid view(跟 detach session 一樣)

**為什麼是 D-level decision:** SPEC §11 定義「Session」是 tmux session,加 shell 是擴詞彙不是改既有概念,但 SPEC 沒明列。CLAUDE.md「動 SPEC 描述的核心 UX 要先問」owner 已透過訊息確認(2026-05-02「Session 都要準備一個沒有 tmux,直接的 ssh,名稱你推薦」)。

**SPEC 怎麼處理:** 不直接動 SPEC §11(待 M3 polish 整理時 owner 統一決),NOTES D-14 留 deviation 記錄。對齊 D-10 / D-11 / D-12 處理方式。

---

### 2026-05-02 — D-13 M2a spike:makiko + Tauri Android cross-compile ✓(只缺 NDK)

**動機:** D-7 swap russh → makiko 時,SPEC §13 deviation 最大不確定點是「makiko 對 Android cross-compile 是否真的可行」。`task.md` 留 `T-spike-android-makiko`,計畫 M2 開工前驗。Owner 拍板 M2 之前先 spike,降低 M2a 第一天炸鍋風險。

**Spike 內容:**
```bash
rustup target add aarch64-linux-android
cd src-tauri && cargo check --target aarch64-linux-android
```

**結果:**
- ✅ `rust-std` for `aarch64-linux-android` 安裝成功
- ✅ **純 Rust 全鏈路 cross-compile 過:**`makiko` 0.2.5 / `tauri` 2 / `tao` / `wry` / `curve25519-dalek` 4.1 / `ed25519-dalek` 2.2 / `x25519-dalek` 2.0 / `chacha20` / `aes-gcm` / `rsa` / `tokio` / `sqlx-macros` 全部都 `Checking ... ✓`
- ❌ **`libsqlite3-sys 0.30.1` 卡在 C compiler:** `tauri-plugin-sql` transitively 拉,sqlite 是 C 原始碼,cross-compile 需要 `aarch64-linux-android-clang`,環境裡沒 NDK 找不到。

**結論:**
- **D-6 / D-7 最大不確定點(makiko 對 Android)解除** — 純 Rust 部分在 Android target 全乾淨。makiko swap 決策**正確**,M2 走主線,不需 SPEC §9.3 fallback A(限縮 Android 只做 capture / send / launch JuiceSSH)。
- **唯一阻塞是 NDK**,裝了就過。這是**所有 Rust SQLite app for Android 都要做的事**(sqlx / rusqlite 都過 libsqlite3-sys),非 piermux 特殊問題。Tauri Android docs 也標準化處理。

**M2a 開工前置(寫進 ISSUE-006 / 之後的 EPIC-002 issue 時 reference):**
1. Owner Windows 裝 Android Studio(內含 NDK 27)or 純 NDK + JDK 17
2. 設環境變數:`ANDROID_HOME` / `NDK_HOME` / `JAVA_HOME`
3. `~/.cargo/config.toml` 加 cross-compile linker:
   ```toml
   [target.aarch64-linux-android]
   linker = "<NDK_PATH>/toolchains/llvm/prebuilt/windows-x86_64/bin/aarch64-linux-android33-clang.cmd"
   ```
4. 設 `CC_aarch64_linux_android=...clang.cmd` 給 `cc-rs` 找到
5. 重跑 `cargo check --target aarch64-linux-android` → 預期通(libsqlite3-sys 也能編)
6. `npm run tauri android init` 產 Gradle scaffold
7. `npm run tauri android dev` 真機 / 模擬器跑

**`task.md` `T-spike-android-makiko` 可標 done**(本 spike 滿足 acceptance:cargo check 過,NDK 版本 / toolchain 設定有 reference docs)。

---

### 2026-05-02 — D-12 send_message 加 `literal: bool` 參數(SPEC §6.4 模糊處)

**SPEC §6.4 文字:**
```rust
send_message(host_id, session_name, payload, send_enter) -> Result<(), String>
//   `tmux send-keys -l -t <session> "..."`
//   send_enter 為 true 時額外送一個 Enter
```

寫死 `-l`(literal mode)。

**SPEC §3.4 卻列預設 quick presets:**
- `/syncdesk` — literal text,`-l` 走得通
- `Stop (ESC)` — 想送 ESC 鍵,**literal mode 送不出來**(literal mode 送的是 byte 0x1b 字元，但有些程式可能不識別)
- `Clear (Ctrl+L)` — 想送 Ctrl+L,**literal mode 送 0x0c byte 行為視 program 而定**

**為什麼用 named-key 而不是 literal byte:**
- tmux 的 named-key(`Escape` / `C-l` / `Up` / `Down` 等)是 tmux 主動模擬鍵盤事件,行為 比直接餵 raw byte 可預期
- 例如 ESC 在 readline-aware 程式 (bash, vim, ...) 走 vi-mode 切換之類,literal 0x1b 跟 named `Escape` 在某些情境行為不同(rare,但存在)
- 跟使用者「我按了 ESC」的 mental model 對齊

**改:** backend 加 `literal: bool` 參數:
- `literal=true` → `tmux send-keys -l -t <session> -- <payload>`(原 SPEC 行為)
- `literal=false` → `tmux send-keys -t <session> -- <payload>`(payload 視作 tmux key spec)

`send_enter=true` 仍然走 `tmux send-keys -t <session> Enter`(named key,跟 literal `\r` 同等)。

**為什麼是 D-level decision:** SPEC §6.4 explicit 寫 `-l`,加參數本質是擴 API 不是改用法。但 SPEC §3.4 預設 presets 跟 §6.4 文字衝突,SPEC 內部自己模糊 —— CLAUDE.md「SPEC 模糊處先選一個合理解釋,寫進 NOTES + commit」。

**SPEC 怎麼處理:** 不直接動 SPEC §6.4(待 M3 polish 時 owner 統一決),NOTES D-12 留 deviation 記錄。對齊 D-10 / D-11 處理方式。

---

### 2026-05-01 — D-11 attach 預設 stream input mode(SPEC §3.5.1 偏離,owner usage feedback)

**SPEC §3.5.1:** 「Line buffer mode(預設)⭐」 — line buffer 是 piermux 的核心賣點(取代 colony 害 owner 搞壞 Claude session 的場景)。

**Owner M1g ship 後實際使用觀察(2026-05-01):**
- 大多數 attach 場景是一般 shell 操作(`ls` / `vim` / `git status` / `Ctrl+C`)— stream 即時送字元才符合 terminal 直覺
- Line buffer 是「特殊場景才開」的功能 — 對 Claude Code / AI agent 長訊息對話 + 中文 IME 輸入時開
- Default line 反而違反 terminal 直覺(「打字 → server 沒反應 → 要 Enter 才送」),新使用者第一次 attach 容易困惑

**改:**
- `SessionPanel` `useState<InputMode>('stream')`(原 `'line'`)
- session 切換 reset effect 也回 `'stream'`
- 進 attach 後 toggle `[Line | Stream]` 切過去用 line buffer

**Line buffer 還在,功能不縮水** — 只是「不是 default」。差異化功能(SPEC §0/§1 piermux 為什麼存在)還是 line buffer 的存在,不是 default 設定。

**為什麼是 D-level decision:** SPEC §3.5.1 explicit 寫 default ⭐,動到要 owner 確認。Owner 2026-05-01 訊息「預設改成 streaming, line buffer 變成第2選項」明示。

**SPEC 怎麼處理:** 不直接動 SPEC §3.5.1(待 M3 polish 整理時 owner 統一決),NOTES D-11 留 deviation 記錄。對齊 D-10 處理方式。

---

### 2026-05-01 — D-10 點 session 預設 attach(SPEC §2 偏離,owner 拍板)

**SPEC §2:** 「預設點 session → capture(輕量)。按 [Attach] → 切到 attach 模式。」

**現實 owner workflow + Avat.png mockup:**
- Grid view(host click)已經承擔「全 host 一眼看 capture」的瀏覽角色
- 進單一 session 視圖 = 「我選定這個要做事」(對 Claude Code 對話特別明顯)
- 預設 capture 多一次點擊摩擦感大

**改:** SessionPanel `mode` 預設 `'attach'` 而非 `'capture'`。`session-reset` useEffect 也改 reset 到 attach。要回唯讀 capture 按 [Detach] 即可,toggle 邏輯不動。

**Trade-off / 已知缺點:**
- 點到單一 session 立刻開 PTY(SSH connect + request_pty + tmux attach,~500ms-1s 第一次重畫)。誤點代價是一條短命 PTY,unmount 時 cleanup detach。實務 OK。
- 對偶爾「我只想看不操作」的場景變得繞:必須先 attach 再 [Detach] 切 capture。可接受,grid view 還是輕量瀏覽主場。

**為什麼是 D-level decision:** SPEC §2 是描述性的 UX 預設,不是 §3.5 line buffer 那種紅線。CLAUDE.md「動 SPEC 描述的核心 UX」要先問,owner 已透過 Avat.png mockup + 直接訊息確認過(2026-05-01)。

**SPEC 怎麼處理:** 不直接改 SPEC §2(待 M3 polish 整理時 owner 統一決),NOTES D-10 留 deviation 記錄。

---

### 2026-05-01 — D-9 keyring 沒寫入 = 沒接平台 backend(Windows agent 接手第一刀)

**症狀:** owner 在 Windows 創 host b → test_connection ✓ → save → tree view 報「password not in keyring for host b — re-edit to set」。Re-edit dialog 密碼欄空白(只剩 placeholder 8 個 dot)。

**根因:** `Cargo.toml` 寫 `keyring = "3.6.3"` 沒給任何 features。keyring 3.x 是 feature-flag 驅動的 backend 設計,沒指定平台 feature → fallback 到 mock backend。Mock 是 per-`Entry` instance in-memory:
- `secret::store_password`:`Entry::new` 開新 mock,`set_password` 寫進那個 instance,函式結束 instance drop → 資料丟
- 下一個 IPC `list_sessions` 進來,`secret::read_password` 又 `Entry::new` 一個全新 mock,讀回 `NoEntry`

`Cargo.lock` 驗證:keyring 的 transitive deps 只有 `log` + `zeroize`,沒 `windows-sys` / `security-framework` / `dbus-secret-service` → 確認沒接平台。

**為什麼 test_connection 卻通:** 它直接吃 form 裡的 `password` 餵 makiko,根本不走 keyring。所以單看 dialog 行為一切正常,bug 只在創完之後讀回的路徑才 surface。

**修法(commit pending):**
```toml
keyring = { version = "3.6.3", features = ["apple-native", "windows-native", "sync-secret-service"] }
```

`cargo check` 後 `Cargo.lock` 拉進三個平台 backend(`windows-sys` / `security-framework` 2 + 3 / `dbus-secret-service`),conditional compilation 各平台只用對應的。SPEC §13 / NOTES 紅線都不衝突,純補配置漏洞。

**為什麼 D-8 outstanding 段預測「Windows Credential Manager 邊角」沒猜中:** 直覺是「keyring 大致 work 但有 edge case」,實際是「根本沒接 OS,test_connection 因為不走 keyring 才一直通」。留 D-8 那段做警示。

**Owner 驗收步驟:**
1. 停掉當前 `tauri dev` → Cargo.toml 改了要重編
2. `npm run tauri dev` 重跑
3. 既有 host b 之前「儲存」的密碼是 mock 寫的,已丟 → **編輯 host b → 重打密碼 → 儲存**
4. 點開 host b 的 tree node → 應該真的拉到 server 上 tmux session 列表;host icon 應該變綠 connected ✓
5. 通了 → ISSUE-002 + ISSUE-003 一起 → resolved

---

## D-8 Handoff briefing — 換 Windows-local agent 接手(2026-04-30)

> Owner 評估換掉遠端 Linux agent(我),改用 Windows local Claude Code 直接在 dev 機跑。下面是接手必讀。

### 為什麼換?
- M1d-M1g 都是 UI + 互動 work,每次改要 cargo build + tauri dev 跑出來看
- Linux env 缺 atk/gtk/webkit 系統 lib(`task.md` T-2 提到),agent 端 `cargo check` 過 dep resolution 後就 short-circuit,**沒辦法真驗 piermux crate type 安全**
- 已經漏抓 2 個 bug 是因為這個:`apply_schema` 註解切割 bug、makiko `Privkey` private path bug
- M1g(line buffer × xterm)是 SPEC §9.1 點名的最大實作風險,**必須在 Windows 真跑**才能 spike

### 當下 repo 狀態(commit `b3f5395` 之後)
- **M1a** ISSUE-001 `resolved`(scaffold + DB + plugin-sql + migration + VS Code launch)
- **M1b** ISSUE-002 `in_progress`(差 keyring bug 收尾就 resolved)
  - 5 個 CRUD commands ✓ + UI ✓ + test_connection makiko 真實連線 ✓
  - **outstanding:** owner workaround 編輯既有 host 重打密碼;若無效則是 keyring 3.6.3 在 Windows Credential Manager 邊角(下一步加 `eprintln!` debug)
- **M1c** ISSUE-003 `in_progress`(M1c real backend swap 完,差 owner 驗 list_sessions 真連到 server)
  - `sessions.rs` 用 `ssh::run_command` 跑 `tmux list-sessions -F`,parse 完回 `Vec<Session>`
  - `host_status` 用 `ssh::test_connection`
  - frontend `useHostStatus` 加 staleTime 30s 避免抖
- **M1d-M1h** 還沒開工(ISSUE-004..008 mocked acceptance,等 M1d 開頭)

### Tech stack 已 land
- **Backend deps:** tauri 2 / tauri-plugin-sql 2 / sqlx 0.8 (sqlite,backend 自開 pool D-5)/ keyring 3.6 / makiko 0.2.5(D-7,SPEC §13 deviation)/ uuid 1 (v4) / chrono 0.4 / anyhow 1 / tokio
- **Frontend deps:** React 19 + Vite 7 + TS 5.8 + Tailwind 4 (`@tailwindcss/vite`) + TanStack Query 5 + radix-ui (dialog/label/select/slot) + sonner + lucide + 手寫 5 個 shadcn-style components
- **Path alias:** `@/*` → `src/*`(vite + tsconfig)
- **MSRV:** 1.85(D-7 makiko 加完後 bump 過)

### 重要決策(D-1..D-7)
- D-1 hosts.id = UUID v4
- D-2 sessions = live query(沒 cache table)
- D-3 密鑰 alias 從 host_id 推導(`piermux/host/{host_id}/password`)
- D-4 `private_key_path` Android 處理推到 M2
- D-5 backend 自開 sqlx pool + `apply_schema`(plugin-sql 不註冊 migration)
- D-6 ed25519-dalek upstream pkcs8 API 不容(spike timeout)
- D-7 SSH lib russh → makiko(SPEC §13 deviation,owner 拍板)

### 下一步具體做什麼
1. **驗 owner keyring workaround**(編輯 host → 重打密碼 → 儲存 → list_sessions 拉得到 server 上的 tmux session)
2. 若 (1) 通 → ISSUE-002 + ISSUE-003 都 → `resolved`,sprint daily note 補
3. **開 M1d**(ISSUE-004),acceptance 對齊 SPEC §3.3 + §6.3:
   - `capture_session(host_id, session_name)` — `tmux capture-pane -t <session>:0 -p -e -S -200` via `ssh::run_command`
   - `capture_host(host_id)` — host 內並行,`tokio::sync::Semaphore(3)` 限速(SPEC §9.2)
   - `capture_all()` — host 之間並行
   - `capture_cache` table writes
   - `app.emit("capture-updated:<host_id>:<session_name>", ...)` Tauri event
   - frontend 用 xterm.js readonly(`@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-web-links`)在 SessionPanel 顯示 ANSI capture
   - UI:tree view 上 host 旁 [🔄] / session 旁 [🔄] / header 右上 [⟳ Refresh All]
   - 完成標準:3 host × 5 session 全部 refresh-all < 3 秒(可能要 persistent SSH 連線 SPEC §9.2)

### Files 接手必讀(順序)
1. `CLAUDE.md`(repo root)— 工作守則 + commit 格式 + vibe autonomy 原則
2. `doc/SPEC.md` — 產品 spec,**不要改**
3. `NOTES.md` — D-1..D-8 + impl log + 痛點(這份)
4. `doc/Sprint/SPRINT-2026-W18.md` — 當前 sprint daily note(到今天為止)
5. `doc/task.md` — 進行中 / open / tooling / backlog
6. `doc/Issue/ISSUE-002.md` + `ISSUE-003.md` + `ISSUE-004.md` — 接下來要關 / 要開的 issue 細節
7. `doc/Epic/EPIC-001.md` — M1 整體 success criteria + risks
8. `src-tauri/src/{lib,hosts,commands,sessions,ssh,secret}.rs` — backend 模組(讀過大概懂後就能加 capture)
9. `src/{lib,hooks,desktop,components/ui}/*.tsx` — frontend(SPEC §7.2 結構未來會擴 desktop/android/shared)

### 環境前提(CLAUDE.md 章節)
- OS: Windows native + PowerShell + npm(**不是 pnpm**)
- DB 路徑:`%APPDATA%\dev.kirinchen.piermux\piermux.db`
- VS Code launch.json 已備好(F5 → `Tauri Dev (run)`)

### Linux agent 留下的限制
- 我這邊 cargo check 不到 piermux crate(缺 system lib,CLAUDE.md「不自己 apt install」)— 所以給你的 commit 都帶 type 風險
- 你 Windows local 跑 cargo check / cargo clippy 是真的能驗,**請當作 source of truth**
- 已經兩次因為這個漏 type bug,你接手後應該不會再有

### Memory(為了下次 session)
- `.claude/projects/-home-kirin-Desktop-project-piermux/memory/` 有一條 feedback memory(vibe autonomy on piermux)
- Windows agent 的 memory 路徑會不一樣(在 Windows AppData),不會自動共用 — 但 NOTES.md / CLAUDE.md 的內容才是真重點,memory 是奢侈品
