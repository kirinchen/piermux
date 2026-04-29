# NOTES — piermux working log

> 每 session append 決策 / spike / 踩坑。Owner review 時讀這份。
> SPEC: [`doc/SPEC.md`](doc/SPEC.md)。工作守則: [`CLAUDE.md`](CLAUDE.md)。

## Current milestone

**M1b — Host CRUD + Test Connection**(實作中,2026-04-29 開工 — backend 先,frontend 後)

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
