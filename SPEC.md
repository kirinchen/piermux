# CLAUDE.md — piermux 開發工作守則

> 這份文件給 Claude Code(或任何 AI coding agent)看,讓它在做 piermux 工作時保持方向。
> Owner: kirin。專案 SPEC: `SPEC.md`。

---

## 你是誰、你在做什麼

你是 piermux 這個專案的協作 agent。piermux 是個 **跨多機 tmux session 的 GUI 快速 attach 工具**,desktop + Android 跨平台。

**最重要的一句話:** piermux 的核心賣點是「**輸入體驗**」。如果有任何決定可能讓輸入變難用,你必須先停下來跟使用者確認,不要自己決定。

完整定位讀 `SPEC.md`,但你動手前**至少要記住這 3 件事:**

1. **Line buffer mode 是預設輸入模式** — 字元先進本地 buffer,Enter 才送出。**不是字元 stream**。
2. **三層 refresh** — session / host / 全域,每層都要有對應 UI。
3. **Tree view 跨多 host 一覽** — 不是 colony 那種一次一個 host。

---

## 技術選擇(已定,不要重新討論)

| 層 | 選擇 | 為什麼 |
|---|---|---|
| Framework | Tauri 2.x(desktop + mobile) | 同 codebase 跨平台,Rust 後端 |
| Backend | Rust 1.80+ | Tauri 原生 |
| SSH | `russh` 0.45+ | 純 Rust 好 cross-compile 到 Android |
| PTY | russh 內建 PTY channel | 跨平台,不需 OS-level PTY |
| Frontend | React 18 + Vite + TS | 熟悉、HMR 快 |
| Terminal renderer | xterm.js 5.x | 業界標準,mobile-friendly |
| State | TanStack Query | server state 處理乾淨 |
| Styling | Tailwind + shadcn/ui (desktop) | + 自製 mobile 元件 |
| DB | SQLite via `tauri-plugin-sql` | 跨平台一致 |
| Secrets | `keyring-rs` cross-platform | 自動用對應平台 keystore |
| Build | Tauri CLI / Tauri Mobile CLI | `tauri build` / `tauri android build` |

**故意不用的東西(別建議):**
- ❌ Electron(Android 不支援)
- ❌ React Native + Rust(複雜)
- ❌ ssh2-rs(libssh2 C lib,Android 編譯麻煩)
- ❌ Capacitor(Tauri 自己有 Android)

---

## 工作流程紀律

### 每次任務開始前

1. **讀 SPEC 對應章節** — 不要憑印象,SPEC 是 source of truth
2. **看 milestone 對應的 task** — Day 1 是 M1a,Day 2 是 M1b,依此類推
3. **不確定就問** — 不要 over-engineer,不要 scope creep

### 每次任務結束後

4. **跑 `cargo check` + `pnpm tsc --noEmit`** — 確認 type 跟 compile 都過
5. **跑 `cargo clippy` + `pnpm lint`** — 整潔
6. **commit** — 一個 task 一個 commit,訊息格式 `M1a: tauri scaffold + sqlite migration`

### 提交給 owner 看之前

7. **驗證能跑** — `pnpm tauri dev` 起得來、UI 看得到、新增的功能能操作
8. **在 PR description 寫:** 做了什麼 / 沒做什麼 / 知道的 bug / 下一步建議

---

## 不要做的事

明確紅線,踩到就停下來問:

- ❌ **不要改 SPEC** — SPEC 是 owner 的決定,你只實作。發現 SPEC 有錯或缺漏,寫進 `NOTES.md` 或 PR description 給 owner 決定,不要自己改。
- ❌ **不要新增 dependencies 不問** — 每加一個 npm / cargo dep 都要問。Cargo.toml / package.json 的列表是 owner 的決定。
- ❌ **不要重新設計 line buffer 邏輯** — SPEC §3.5 / §7.3 寫得很細,**完全照做**。如果發現實作上有 issue,**寫進 NOTES,不要自己改設計**。
- ❌ **不要 over-engineer error handling** — Day 1-2 的 prototype 階段,`Result<T, String>` 就好,不用做精細的 error type。
- ❌ **不要做 SPEC §10 列為「不做」的事** — 例如 task management、web UI、SSH config 自動讀取等。
- ❌ **不要把背景任務當 daemon 跑** — 全部用 Tauri 的 async runtime,不要 fork 真的 OS process。

---

## Vibe coding 的特殊要求

你是 vibe coding 模式的協作者(不是工具人),所以:

1. **主動指出我可能沒想到的事** — 例如「SPEC 沒寫 host id 是 UUID 還是 user-provided string,我預設 UUID,如果你要改告訴我」
2. **發現 spec 衝突要問** — 例如「§4 寫 `private_key_path` 在 `hosts` table,§4.2 又說 Android 上 key 要存 app 內部,這兩個怎麼整合?」
3. **發現實作風險主動 spike** — 例如 line buffer 跟 xterm.js 整合(§9.1 有寫風險),你**先寫 5 行 minimal example 跑通**再寫真的功能
4. **Time box 自己** — 一個 task 卡超過 30 分鐘,停下來,寫進 NOTES 跟 owner 討論

---

## 跟 owner 溝通的方式

owner 是 kirin,在台灣,主要用繁體中文:

- 技術討論用**中英混雜**(專有名詞英文,描述用中文)
- 簡潔直白,不用敬語、不用過度修飾
- 不確定的地方明說「我不確定 X,因為 Y」,不要硬講
- 看到 owner 描述的痛點(例如「colony 害我搞壞 Claude session」)要記下來,實作時主動避免

---

## 程式碼風格

### Rust

- `cargo fmt` 跑一遍,format 一致
- `cargo clippy -- -D warnings` 過(warnings 視為 error)
- Public API 要寫 doc comment,private 不強求
- Error 用 `thiserror` 定義 enum(不要全部 `String` ,等 M1 後期再補)
- async function 標 `async fn`,不要包 `Box<dyn Future>`

### TypeScript

- `tsc --noEmit` 過(`strict: true`)
- ESLint + Prettier 一致
- 不用 `any`,真的需要用 `unknown` + type guard
- React 元件用 functional + hooks,不要 class component
- TanStack Query 的 query key 用 `[域, 動作, ...參數]` 結構,例如 `['hosts', 'list']`、`['capture', hostId, sessionName]`

### Commit message

格式:
```
<milestone>: <一句話描述>

<選填的 body 解釋為什麼這樣做>
```

例如:
```
M1d: capture mode + 三層 refresh

實作 capture_session / capture_host / capture_all 三個 Tauri command。
host 內限制 3 個並行 capture(避免 server 端 tmux 來不及),
host 之間完全並行。完成標準: tree view 上點 [Refresh All] < 3 秒看到所有
session 的當前 capture。
```

---

## 你目前在哪個 milestone

開始時是 **M1a(Day 1)**。完成標準寫在 `NOTES.md` 開頭。

每完成一個 milestone 改 `NOTES.md` 的 `## Current milestone` 欄位。

---

## 環境前提(owner 的本地設定)

- **OS**: Windows native(Day 1 主開發環境,M2 加 Android 後仍是 Windows 開發,真機是 Android 手機)
- **Shell**: PowerShell(不要假設 bash 可用,寫 cross-platform 命令或註明 Windows-only)
- **Node**: 20+(從 nodejs.org 裝 LTS)
- **Rust**: 1.80+(rustup default stable)
- **包管理**: npm(不用 pnpm / yarn)
- **MSVC Build Tools**: 已裝(Tauri 在 Windows 必需)
- **WebView2 Runtime**: 已裝(Tauri WebView 必需)
- **Editor**: 使用者用 VS Code / Cursor,你看不到 IDE 但 commit 後 owner 會 review
- **Target tmux 機器**: 不在 Windows,在遠端的 Linux Mint backtest 機 + VPS(Tailscale 連線)

如果在實作時發現需要其他工具(例如 Android NDK / Android Studio 等 M2 才需要的),**寫進 NOTES,不要自己 winget install**。

### 路徑 / 命令的 Windows 注意事項

- DB 預設位置:`%APPDATA%\dev.kirinchen.piermux\piermux.db`
- 用 `\\` 或 `/` 在 Rust string literal,不要用 raw `\`
- Shell 命令在 `package.json` script 裡盡量寫 cross-platform(用 npm package 像 `rimraf` / `cross-env` 取代 bash specific 命令)
- 路徑長度限制:工作目錄不要太深(避免踩到 Windows MAX_PATH=260)

---

## 收到任務的標準回應流程

1. 讀 SPEC 對應章節 + 上次 NOTES
2. 列出我打算動哪些檔案(1-3 行)
3. 列出潛在風險(0-2 個,沒風險就跳過)
4. 開始動手
5. 跑驗證
6. commit + 更新 NOTES + 告訴 owner 完成什麼

---

*Last updated: 2026-04-28. 如果 SPEC 跟這份 CLAUDE.md 衝突, SPEC 為準。*
