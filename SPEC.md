# piermux — Final SPEC

> 跨多機 tmux session 的 GUI 快速 attach 工具,Desktop + Android,專注於 **「找 session 快」 + 「輸入體驗好」**。
>
> 獨立工具,可開源,不依賴任何 AI agent platform。

---

## 0. TL;DR(讀這節就夠決定要不要看下去)

**一句話定位:** 跟 Xshell / JuiceSSH 一樣優秀的輸入體驗,但加上 tree view 一目瞭然所有 host × session,以及一鍵 attach 不用打 `tmux attach -t <長名字>`。

**為什麼要做:**
- 我每天要 attach 多台機器上的多個 tmux session,每次都要 ssh + `tmux ls` + `tmux attach -t ...` 太煩。
- 現有工具沒一個同時做到這三件事:
  1. **跨多 host 的 tree view 一覽**(colony 沒有 — 它一次一個 host)
  2. **真正好用的輸入**(不像 colony 的字元 stream 直接送,會搞壞 Claude Code 對話)
  3. **跨平台 desktop + Android 都能用**

**不解決的事:**
- 不做 AI agent 協作平台(那是 amux 的事)
- 不做 task 管理 / kanban
- 不做 web 版

**做完的成功標準:** 取代我目前在 desktop 上開 Xshell + 在 Android 上開 JuiceSSH 的混合流程,變成單一一個 app 跨平台用。

---

## 1. 設計原則

按優先序,後者不能犧牲前者。

1. **輸入體驗第一,絕對不能輸給 Xshell / JuiceSSH** — 這是這個工具存在的理由,如果輸入難用,所有功能都白費
2. **快速 attach 第二** — tree view 一目瞭然 + 一鍵 attach,不用 `tmux attach -t <名字>`
3. **跨平台一致** — desktop 跟 Android 體驗對齊(不是完全相同,但操作邏輯一致)
4. **Daily-use 工具,不是 platform** — 每個 feature 必須馬上有用,不留「為了未來擴充」的空缺

---

## 2. Core concepts

| 概念 | 說明 |
|---|---|
| **Host** | 一個 SSH 連線目標(`kirin-mint-1`、`kirin-vps`) |
| **Session** | 該 host 上的一個 tmux session |
| **Capture** | tmux pane 當前內容快照(`tmux capture-pane -p` 輸出) |
| **Attach** | 真正進去 tmux session 雙向互動 |
| **Modifier bar** | 鍵盤上方的浮動鍵列(ESC / TAB / CTRL / 方向鍵 / HOME / END / PgUp / PgDn) |
| **Line buffer** | 在輸入區累積完整字串 + 按 Enter 整段送出(預設模式) |
| **Stream input** | 逐字元即時送(Vim / less 用,可切換) |

**重要區別:Capture vs Attach**

| Capture | Attach |
|---|---|
| 唯讀,看一眼當前狀態 | 雙向互動,真的進去操作 |
| 不佔 tmux client slot | 佔一個 tmux client |
| 跑一個 SSH 命令拿純文字 | 持續 PTY 連線 |
| 適合「session 還在跑嗎?」 | 適合「我要操作它」 |

預設點 session → capture(輕量)。按 [Attach] → 切到 attach 模式。

---

## 3. 核心 features(只有 5 個)

### 3.1 跨多機 tree view

```
▼ ✓ kirin-mint-1
    ├─ claude-agent-foo        attached  · 5 min ago
    ├─ claude-agent-bar        idle      · 12 min ago
    └─ training                attached  · just now
▼ ✓ kirin-vps
    └─ ibkr-bot                idle      · 2 hours ago
▶ ⚠ kirin-mint-2  (連不上)
```

- 多 host 並列,折疊展開
- 連線狀態 icon: ✓ 正常 / ⚠ 連不上 / ○ 試連中
- 每個 session 顯示 attached 狀態跟最後活動時間
- Click session → 預設顯示 capture
- Long click(Android)/ 右鍵(desktop)→ context menu([Attach] / [Capture] / [Send Message] / [Refresh] / [Kill])

### 3.2 一鍵 attach

點 session → [Attach] → 後端自動跑 `tmux attach -t <session>` + 開 xterm.js 渲染。**不用打任何指令**。

退出 attach → [Detach] 按鈕送 `Ctrl-B d` → 切回 capture 模式。

### 3.3 多層 refresh capture(這是你要的)

三個層級的 refresh,涵蓋你的所有場景:

| 層級 | 做的事 | UI 位置 |
|---|---|---|
| **Session 層** | 重抓這個 session 當前 capture | session 詳細頁面的 [🔄 Refresh] 按鈕 |
| **Host 層** | 重抓這個 host **所有 session** 的 capture | host 節點的 [🔄] 按鈕 / 長按 host context menu |
| **全域層** | 重抓**所有 host 所有 session** 的 capture | 主畫面右上 [⟳ Refresh All] 按鈕 |

**實作邏輯:**
- 全域 refresh 並行對所有 host 開 SSH session,每個 host 內並行抓所有 session
- 並發度限制(預設每個 host 最多 3 個並行 capture,避免占滿頻寬)
- Refresh 中 UI 顯示 spinner,完成後同步更新 tree
- 失敗的 host 標記 ⚠,不影響其他 host

**為什麼這個重要:** 你要快速看「現在所有機器上所有 agent 在做什麼」一目瞭然 — 這是 tree view 的核心價值。沒有 refresh-all,tree view 顯示的是過時資料,等於白做。

### 3.4 Send message(快速送一行字)

不需要 attach,直接從 tree view / capture view 對 session 送一段文字。

- 文字輸入框 + [Send] / [Send + Enter]
- Quick presets(預設 `/syncdesk`, `Stop (ESC)`, `Clear (Ctrl+L)`,可自訂)
- 用 `tmux send-keys -l` 確保 literal 送(不會被解讀成特殊鍵)

### 3.5 真正好用的輸入(這是核心賣點)

**這節最重要**,colony 在這層失敗,piermux 必須做對。

#### 3.5.1 兩種輸入模式可切換

**Line buffer mode(預設)** ⭐
- 你打字時字元先進**本地 input box**,不立刻送到 SSH
- 按 Enter 才把整段送出 + 自動加 `\n`
- 適合**所有 AI agent 對話**(Claude Code, Codex, Aider...)
- 適合大部分 shell 操作(打 `git status` 一次完整送出比較好)

**Stream mode(可切換)**
- 字元即時送(像 colony / JuiceSSH 那樣)
- Vim / less / interactive prompt(那種按鍵立刻反應的)需要這個
- 在 attach view 上方 toolbar 一個 toggle 切換,當前模式有明顯標示

**怎麼切:** Attach view 上方有個明顯 toggle,標示 `[ Line | Stream ]`。預設 Line。Vim 等場景按一下切到 Stream。

#### 3.5.2 Modifier bar(直接抄 JuiceSSH layout,但加 AI-aware 強化)

**第一排(永遠顯示):**
```
ESC  /  |  -  HOME  ↑  END  PGUP  FN
TAB  CTRL  ALT  ←  ↓  →  PGDN  ⌨
```

**互動規則:**
- **CTRL / ALT 是 sticky modifier** — 點一下亮起來,下個按鍵變 Ctrl+X / Alt+X 後自動關
- **長按 CTRL** — 鎖定為 always on,直到再按一次才關
- **FN 切換** — 第二排顯示 F1-F12、Insert、Delete、`、~ 等

**AI-aware 第三排(M2 才做,先設計留位):**
- 自訂 preset 按鈕,例如:
  - `Ctrl+B d`(detach)一鍵
  - `Ctrl+C`(中斷 Claude 當前任務)一鍵
  - `1` / `2` / `3`(快速回答 Claude 的選項提示)
  - `/syncdesk` 等常用 slash command

#### 3.5.3 Send queue preview(line buffer 的視覺化)

Line buffer 模式下,輸入框上方顯示**「下一個 Enter 會送出什麼」**:

```
┌─────────────────────────────────────────────┐
│ Next send (按 Enter 觸發):                  │
│ ┌─────────────────────────────────────────┐ │
│ │ 請改用方案 2,但加上 Y/n 確認步驟         │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
[輸入區: 請改用方案 2,但加上 Y/n 確認步驟______]
```

**為什麼這個重要:** colony 害你搞壞 Claude session 的根本原因是「字元一個個送出去你看不見」。預覽區直接顯示「下一個 Enter 之前的累積輸入」,送出前你看到全貌,不會誤觸。

#### 3.5.4 Desktop 也要這套

Desktop 上鍵盤可以直接打 ESC / TAB / Ctrl+C 沒問題,但 line buffer 模式仍然必要 — 因為**輸入到 Claude Code 的長訊息**在 desktop 上一樣會踩到「打到一半 Claude 已經往前走」的坑。

Desktop modifier bar **預設隱藏**(因為實體鍵盤),但保留 toolbar 上的 [Line / Stream] toggle。

---

## 4. 平台對應 UI

### 4.1 Desktop layout

```
┌─────────────────────────────────────────────────────────────┐
│ piermux                            [⟳ Refresh All]  [⚙]    │
├──────────────────┬──────────────────────────────────────────┤
│ Hosts & Sessions │ Selected: claude-agent-foo @ kirin-mint-1│
│ ┌──────────────┐ │ Mode: ● Capture  ○ Attach   [🔄 Refresh] │
│ │ ▼ ✓ mint-1   │ │ ───────────────────────────────────────  │
│ │   ├─ foo     │◀│  $ npm test                              │
│ │   ├─ bar     │ │  PASS test/foo.test.ts                   │
│ │   └─ training│ │  $ █                                     │
│ │ ▼ ✓ vps      │ │ ───────────────────────────────────────  │
│ │   └─ ibkr    │ │ Mode: [ Line | Stream ]                  │
│ │ ▶ ⚠ mint-2   │ │ ───────────────────────────────────────  │
│ └──────────────┘ │ Next send:                               │
│                  │ ┌────────────────────────────────────┐   │
│ [+ Add Host]     │ │ /syncdesk                          │   │
│                  │ └────────────────────────────────────┘   │
│                  │ Input: [/syncdesk_____________________]  │
│                  │ [Send] [Send + Enter ↩]                  │
│                  │                                          │
│                  │ Quick: [/syncdesk] [Stop] [Clear]        │
└──────────────────┴──────────────────────────────────────────┘
```

- 左 tree,右 capture/attach panel
- 主畫面右上 [⟳ Refresh All] — 全域 refresh
- Host 節點旁有小 [🔄] 按鈕(hover 時出現)— host 層 refresh
- Capture/attach view 內 [🔄 Refresh] — session 層 refresh

### 4.2 Android layout(stack navigation)

**Screen 1 — Host & Session list(主畫面)**

```
┌────────────────────────────────────┐
│ ☰  piermux           ⟳   ⚙        │
├────────────────────────────────────┤
│  ▼  ✓  kirin-mint-1          🔄   │
│       ├─ claude-agent-foo          │
│          attached · 5 min          │
│       ├─ claude-agent-bar          │
│          idle · 12 min             │
│       └─ training                   │
│          attached · just now       │
│                                    │
│  ▼  ✓  kirin-vps             🔄   │
│       └─ ibkr-bot                  │
│          idle · 2 hours            │
│                                    │
│  ▶  ⚠  kirin-mint-2 (連不上)      │
│                                    │
│                            ┌────┐  │
│                            │ +  │  │
│                            └────┘  │
└────────────────────────────────────┘
```

- 上方 ⟳ = 全域 refresh
- 每個 host 旁的 🔄 = host 層 refresh
- 點 session → 進 Screen 2
- Long press session → bottom sheet([Attach] / [Capture] / [Send] / [Refresh] / [Kill])
- Pull-to-refresh 整體 = 全域 refresh

**Screen 2 — Session view**

```
┌────────────────────────────────────┐
│ ←  claude-agent-foo            ⋮   │
├────────────────────────────────────┤
│ Mode: [ Capture ●  Attach ○ ]      │
│                  [ Line | Stream ] │
├────────────────────────────────────┤
│  $ npm test                        │
│  PASS test/foo.test.ts             │
│  PASS test/bar.test.ts             │
│  $ █                               │
│  ...                               │
│                                    │
├────────────────────────────────────┤
│ Next send:                         │
│ ┌────────────────────────────────┐ │
│ │ /syncdesk                      │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ ESC TAB CTRL ALT  ← ↑ ↓ →  / | ~ │ ← Modifier bar
├────────────────────────────────────┤
│ [System keyboard]                  │
└────────────────────────────────────┘
```

**右上 ⋮ menu:** Detach / Kill session / Send message / Quick presets / Refresh capture

---

## 5. 資料模型

Tauri SQLite 跨平台。

```sql
CREATE TABLE hosts (
    id              TEXT PRIMARY KEY,
    display_name    TEXT NOT NULL UNIQUE,
    ssh_host        TEXT NOT NULL,
    ssh_port        INTEGER NOT NULL DEFAULT 22,
    ssh_user        TEXT NOT NULL,
    auth_type       TEXT NOT NULL,            -- 'key' | 'password'
    private_key_path TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at    TEXT
);

CREATE TABLE ui_preferences (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL
);
-- 例如:input_mode_default = 'line', modifier_bar_visible = 'true' 等

CREATE TABLE quick_presets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    label           TEXT NOT NULL,
    payload         TEXT NOT NULL,
    send_enter      INTEGER NOT NULL DEFAULT 1,
    sort_order      INTEGER NOT NULL DEFAULT 0
);

-- Capture cache(避免每次 refresh 等 SSH,UI 先顯示舊的 + spinner)
CREATE TABLE capture_cache (
    host_id         TEXT NOT NULL,
    session_name    TEXT NOT NULL,
    content         TEXT NOT NULL,             -- 含 ANSI escape codes
    captured_at     TEXT NOT NULL,
    PRIMARY KEY (host_id, session_name)
);
```

**密碼存 OS keystore**(`keyring-rs`):
- macOS Keychain / Windows Credential Manager / Linux Secret Service / **Android Keystore**

---

## 6. Backend(Rust)Commands

### 6.1 Host 管理
```rust
list_hosts() -> Vec<Host>
create_host(form: HostForm) -> Result<Host, String>
update_host(id, form) -> Result<Host, String>
delete_host(id) -> Result<(), String>
test_connection(form) -> Result<(), String>
import_private_key(file_path) -> Result<String, String>  // Android 用
```

### 6.2 Session 列表
```rust
list_sessions(host_id) -> Result<Vec<Session>, String>
//   ssh + `tmux list-sessions -F '#{session_name}|#{session_attached}|#{session_activity}|#{session_windows}'`
```

### 6.3 Capture(三層 refresh)
```rust
capture_session(host_id, session_name) -> Result<CaptureResult, String>
//   ssh + `tmux capture-pane -t <session>:0 -p -e -S -200`

capture_host(host_id) -> Result<Vec<CaptureResult>, String>
//   並行 capture 該 host 所有 session(內部限制最多 3 個並行)

capture_all() -> Result<Vec<CaptureResult>, String>
//   並行對所有 host 跑 capture_host(host 之間並行,host 內限速 3)
```

兩個都會 emit Tauri event `capture-updated:<host_id>:<session_name>`,讓 frontend 增量更新 tree。

### 6.4 Send message
```rust
send_message(host_id, session_name, payload, send_enter) -> Result<(), String>
//   `tmux send-keys -l -t <session> "..."`
//   send_enter 為 true 時額外送一個 Enter
```

### 6.5 Attach(雙向 PTY)
```rust
attach_session(host_id, session_name, cols, rows, mode) -> Result<String, String>
//   建立 SSH PTY + 跑 tmux attach
//   mode: 'line' | 'stream'(影響 frontend 行為,backend 不變)
//   回傳 attach session_id

write_to_session(session_id, data) -> Result<(), String>
resize_session(session_id, cols, rows) -> Result<(), String>
detach_session(session_id) -> Result<(), String>
```

PTY 輸出 emit 為 Tauri event `attach-output-<session_id>`。

### 6.6 Kill session
```rust
kill_session(host_id, session_name) -> Result<(), String>
//   ssh + `tmux kill-session -t <session>`
```

---

## 7. Frontend

### 7.1 技術棧

- React 18 + TypeScript + Vite
- xterm.js + xterm-addon-fit + xterm-addon-web-links
- Tailwind CSS
- shadcn/ui(desktop)/ 自製 mobile 元件
- TanStack Query for state
- Tauri OS plugin 偵測 platform

### 7.2 結構

```
src/
├── App.tsx                    — platform routing
├── desktop/
│   ├── DesktopApp.tsx         — split panel
│   ├── HostTree.tsx
│   ├── SessionPanel.tsx
│   └── ...
├── android/
│   ├── AndroidApp.tsx         — stack navigation
│   ├── HostListScreen.tsx
│   ├── SessionViewScreen.tsx
│   └── ModifierBar.tsx
├── shared/
│   ├── CaptureView.tsx        — xterm.js readonly
│   ├── AttachView.tsx         — xterm.js full + line buffer logic
│   ├── LineBufferInput.tsx    — line buffer mode 的輸入框 + preview ⭐ 核心
│   ├── ModeToggle.tsx         — Line / Stream 切換
│   ├── SendMessageBar.tsx
│   └── AddHostDialog.tsx
├── hooks/
│   ├── useHosts.ts
│   ├── useSessions.ts
│   ├── useCapture.ts          — 含三層 refresh hook
│   └── useAttach.ts
└── lib/
    ├── tauri.ts
    └── platform.ts
```

### 7.3 Line buffer 邏輯(核心,寫詳細)

```typescript
// LineBufferInput.tsx
const [buffer, setBuffer] = useState('');
const term = useTerm();  // xterm.js instance

// Line mode: 攔截 onData,字元先進 buffer 不送出
useEffect(() => {
  if (mode === 'line') {
    const handler = (data: string) => {
      if (data === '\r' || data === '\n') {
        // Enter 觸發送出
        invoke('write_to_session', {
          sessionId,
          data: buffer + '\r'
        });
        setBuffer('');
        return;  // 阻止 xterm.js 自己處理 Enter
      }
      if (data === '\x7f') {
        // Backspace
        setBuffer(b => b.slice(0, -1));
        return;
      }
      // 一般字元累積到 buffer,不送 backend
      setBuffer(b => b + data);
    };
    term.onData(handler);
  } else {
    // Stream mode: 字元直接送 backend
    term.onData(data => invoke('write_to_session', { sessionId, data }));
  }
}, [mode, buffer, sessionId, term]);

// Modifier bar 鍵(ESC, TAB, 方向鍵等):無論 mode 都直接送
const handleSpecialKey = (key: SpecialKey) => {
  invoke('write_to_session', {
    sessionId,
    data: specialKeyToBytes(key)
  });
};
```

**重要 edge cases:**
- Modifier bar 上的特殊鍵(ESC / 方向鍵)**不進 line buffer**,直接送 — 因為它們本來就是「想立刻送的單一動作」
- Backspace 在 line buffer 模式下只刪 buffer,不真的送 backspace 到 server
- 切換 mode 時 buffer 自動清空

### 7.4 Refresh 的 UI 行為

```typescript
// useCapture.ts
const useGlobalRefresh = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invoke('capture_all'),
    onMutate: () => {
      // 樂觀更新:tree 上每個 session 顯示 spinner
      queryClient.setQueryData(['captures'], (old) => ({
        ...old,
        refreshing: true
      }));
    },
    onSuccess: (results) => {
      // 收到結果增量更新 tree
      results.forEach(r => {
        queryClient.setQueryData(
          ['capture', r.hostId, r.sessionName],
          r.content
        );
      });
    },
  });
};
```

---

## 8. Milestones

### M1 — Desktop 核心(目標 5–7 工作日)

- [ ] **M1a** Tauri scaffold + DB(Day 1)
- [ ] **M1b** Host CRUD + Test Connection(Day 1-2)
- [ ] **M1c** Tree view + tmux ls + 連線狀態(Day 2-3)
- [ ] **M1d** Capture mode + 三層 refresh(Day 3-4)
- [ ] **M1e** Send message + quick presets(Day 4)
- [ ] **M1f** Attach mode 基礎 + xterm.js(Day 4-5)
- [ ] **M1g** ⭐ **Line buffer mode + Stream toggle + send queue preview**(Day 5-6,核心賣點 de-risk)
- [ ] **M1h** Tray icon + window 隱藏(Day 7)

**完成標準:** Desktop 上加 host、tree view 看到所有 session、按 [⟳ Refresh All] 一次抓完所有 capture、attach 進 session 用 line buffer 模式打字 + 按 Enter 整段送出、按 toggle 切 stream 模式跑 vim 也 OK。

### M2 — Android port(目標 4–6 工作日,M1 完成後)

- [ ] **M2a** Android scaffold + russh cross-compile spike(Day 1)
- [ ] **M2b** Android UI scaffold + stack navigation(Day 2)
- [ ] **M2c** Tree view + 三層 refresh + send message(Day 3)
- [ ] **M2d** Attach + Modifier bar(JuiceSSH 風)+ line buffer(Day 4-5)
- [ ] **M2e** Background lifecycle + reconnect(Day 6)

**完成標準:** Android 真機加 host、看到 tree、attach 一個 Claude Code session、用 line buffer 打一段中文訊息按 Enter 送出、Claude 正確收到完整訊息(**colony 失敗的場景在 piermux 上 work**)。

### M3 — Polish + 開源(以後)

- [ ] AI-aware modifier bar 第三排(自訂 preset)
- [ ] Multi-window attach(同時開多個 attach view)
- [ ] Auto-reconnect on connection loss
- [ ] 平板模式(Android 寬螢幕用 split panel)
- [ ] 設定面板(theme / font size / 預設 input mode)
- [ ] Auto-update(desktop)
- [ ] 公開 GitHub + README + screenshots

---

## 9. 技術風險與 mitigation

### 9.1 Line buffer 跟 xterm.js 整合會不會踩坑?

xterm.js 的 `onData` 拿到的是 「使用者輸入」,但同時 xterm.js 也會把這字元渲染到畫面上。在 line buffer 模式下我們**不希望 server 立刻收到字元**,但**還是希望本地畫面看得到字**。

**解法:** Line buffer 模式下,**xterm.js 顯示伺服器送來的內容**(server output),**輸入區另外用一個 React 控制的 input box 顯示 buffer 內容**。送出時把 buffer 寫進 SSH stream,server echo 後 xterm.js 才把字顯示在 attach view 上。

這個設計效果上等於「mosh 的 local echo」,但是反過來 — 我們不 local echo,我們是「local hold」。

**M1f / M1g 階段先 spike 確認 work**,如果 xterm.js 卡住,fallback 是把 attach view 變成「server output 顯示區(唯讀)+ 下方獨立輸入框(line buffer 從這裡送)」 — 這個 fallback 反而更接近聊天介面,可能對 Claude Code 場景更直觀。

### 9.2 三層 refresh 大量並行 SSH 會不會把連線搞爆?

如果你有 3 個 host × 5 個 session = 15 個 capture 請求並行,SSH 會撐不住嗎?

**解法:**
- 每個 host 一條 persistent SSH 連線(不開 15 條)
- 在這條連線上並行跑 channel(russh 支援)
- Host 內限制 3 個並行 channel(避免 server 端 tmux 來不及)
- Host 之間完全並行(不互相阻塞)

15 個 session 全部抓完預期 < 3 秒(每個 capture 約 200-500ms)。

### 9.3 Tauri 2 Android 仍是新技術

Spike 計畫:M2a 第一天驗證 `tauri android dev` 跑通 + russh cross-compile 通過。

**Fallback 計畫:**
- A:Android 只做 capture / send / tree view / 一鍵 launch JuiceSSH attach(讓 JuiceSSH 處理 PTY,我們處理 line buffer 在 JuiceSSH 啟動之前)
- B:寫 Kotlin native Android(完全不同 codebase,只復用 SQL schema 概念)

選項 A 是務實退路,**保留 piermux 90% 價值**(tree view + line buffer send + 快速 launch)。

---

## 10. 不做的事

明確劃線,避免 scope creep:

- ❌ AI agent 協作平台(amux 的事)
- ❌ Task / kanban 管理(amux 的事)
- ❌ Tmux session 自動 spawn / 管理 lifecycle(只是 view + attach,不負責建)
- ❌ Web UI(原生 app only,不做 web 版)
- ❌ Multi-user / collaboration
- ❌ SSH config 自動讀取(`~/.ssh/config`)— 手動加 host
- ❌ Cluster mode(同一指令送多 session)— M3 才考慮
- ❌ Recording(把 attach session 錄下來重播)
- ❌ iOS — Tauri 也支援但你優先 Android,iOS 先放
- ❌ 從 JuiceSSH / Termius / Xshell 匯入 host config

---

## 11. 詞彙表

- **Host** — SSH 連線目標
- **Session** — 該 host 上的 tmux session
- **Capture** — tmux pane 當前內容快照(唯讀)
- **Attach** — 真實雙向 attach 到 session
- **Line buffer mode** — 字元先在本地 input 累積,Enter 才整段送出(預設)
- **Stream mode** — 字元逐個即時送(像 colony / JuiceSSH)
- **Send queue preview** — Line buffer 模式下顯示「下一個 Enter 會送什麼」
- **Modifier bar** — Attach 時鍵盤上方的浮動特殊鍵列
- **Sticky modifier** — CTRL/ALT 點一下亮起,下一鍵套用後自動關閉

---

## 12. 跟既有工具的關係(寫進 README,給使用者看)

| 工具 | 它好的地方 | piermux 為什麼存在 |
|---|---|---|
| **Xshell** | desktop SSH 龍頭,輸入體驗好 | 沒有跨多 host tree view、沒有 Android、不知道 tmux session list |
| **JuiceSSH** | Android SSH 龍頭,modifier bar 完整 | 沒有 line buffer、不知道 tmux session list、沒有跨 host 統合 view |
| **colony** | Android 上有 tmux session 觀念、xterm 渲染 | tmux 快捷導向(無通用鍵)、字元 stream(搞壞 AI 對話)、單 host |
| **amux** | 完整的 AI agent 控制台 + Web Dashboard | 不是 SSH/tmux 客戶端,是 platform layer |
| **iTerm2 -CC** | Mac 上 tmux 整合最佳 | Mac only,單 host |
| **tmuxui** | 不錯的 tmux TUI | TUI 不是 GUI,不解 mobile,單 host |

**piermux 唯一賣點:** 跨 host tree view + line buffer 的好輸入體驗 + desktop / Android 同一套。

---

*Last updated: 2026-04-28. Owner: kirin. License: MIT(planned open source).*
