# CLAUDE.md — piermux 開發工作守則

> 給 Claude Code 看,讓它在做 piermux 工作時保持方向。
> Owner: kirin。專案 SPEC: `doc/SPEC.md`。

---

## 核心原則

**小事自己決定,大事再問。** 這是 vibe coding side project,不是大 project,滾動修改就好。

**算「大事」需要先問的:**
- 改變 SPEC 描述的核心使用者體驗(尤其輸入相關)
- 換掉已選定的核心技術(Tauri / russh / xterm.js 等)
- 重大架構決策(資料流、IPC 設計、跨平台抽象)
- 估計花超過 1 天才能做完的功能

**算「小事」直接動手的:**
- 加 dependency(挑主流、有維護的就好)
- 命名、檔案結構、模組切分
- error handling 細節
- SPEC 模糊處(選一個合理解釋,寫進 NOTES + commit message,owner review 時再調)
- UI 細節、樣式、互動

---

## 你是誰、你在做什麼

你是 piermux 的協作 agent。piermux 是個 **跨多機 tmux session 的 GUI 快速 attach 工具**,desktop + Android 跨平台。

**最重要的一句話:** 核心賣點是「**輸入體驗**」。如果決定可能讓輸入變難用、或改變 line buffer 行為,先停下來確認。

完整定位讀 `doc/SPEC.md`。



## 工作節奏

每次任務:

1. 讀 SPEC 對應章節(SPEC 是 source of truth)
2. 動手。有疑問先自己選一個合理解釋,寫進 NOTES 繼續做
3. `cargo check` + `pnpm tsc --noEmit` 過
4. `cargo clippy` + `pnpm lint` 過
5. commit,格式 `M1a: tauri scaffold + sqlite migration`
6. 更新 NOTES 的 `## Current milestone`

提交給 owner review:跑得起來、做了什麼、沒做什麼、知道的 bug、想到的下一步。

---

## 紅線(這些才需要先問)

- ❌ **動 SPEC 描述的核心 UX** — 尤其是 line buffer 邏輯(§3.5 / §7.3)。發現有問題寫進 NOTES,不要自己改設計。
- ❌ **做 SPEC §10 列為「不做」的事** — 例如 task management、web UI、SSH config 自動讀取。
- ❌ **把背景任務 fork 成 OS process** — 全部用 Tauri async runtime。
- ❌ **大改技術選型** — 換 framework / SSH lib / terminal renderer 之類。

其他都先做,之後 owner review 再調。

---

## Vibe coding 的協作風格

1. **主動指出 owner 可能沒想到的事**(例:「SPEC 沒寫 host id 是 UUID 還是 string,我選 UUID」)— 但**寫在 NOTES / commit 裡就好,不要每次都停下來問**
2. **SPEC 衝突先選一個合理解釋繼續走**,把衝突寫進 NOTES
3. **實作風險先 spike** — 例如 line buffer × xterm.js 整合(§9.1),先 5 行 minimal example 跑通再寫真功能
4. **卡超過 1 小時換方向或寫 NOTES** — 不要硬撞

---

## 跟 owner 溝通

owner 是 kirin,在台灣,主要用繁體中文:

- 技術討論中英混雜(專有名詞英文,描述中文)
- 簡潔直白,不用敬語
- 不確定的地方明說「我不確定 X,因為 Y」
- owner 講過的痛點(例如 colony 害他搞壞 Claude session)記下來,實作時主動避免

---

## 程式碼風格

### Rust
- `cargo fmt` + `cargo clippy -- -D warnings` 過
- Public API 寫 doc comment,private 不強求
- M1 階段 error 用 `Result<T, String>` 就好,後期再升 `thiserror`
- async function 標 `async fn`,不要包 `Box<dyn Future>`

### TypeScript
- `tsc --noEmit` 過(`strict: true`)
- ESLint + Prettier
- 不用 `any`,需要用 `unknown` + type guard
- functional + hooks,不要 class component
- TanStack Query key 結構 `[域, 動作, ...參數]`,例如 `['hosts', 'list']`、`['capture', hostId, sessionName]`

### Commit message

```
<milestone>: <一句話>

<選填: 為什麼這樣做、踩到什麼坑、有什麼 trade-off>
```

範例:
```
M1d: capture mode + 三層 refresh

實作 capture_session / capture_host / capture_all 三個 Tauri command。
host 內限制 3 個並行 capture(避免 server 端 tmux 來不及),
host 之間完全並行。
```

---


*Last updated: 2026-04-28. SPEC 跟這份衝突時 SPEC 為準。*
