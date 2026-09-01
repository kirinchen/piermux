---
title: 字寬殘字 bug 家族根治研究 —— tmux control mode spike × herdr 拜師
owner: kirin
date: 2026-09-01
tide: "#137(第一階段:拜師學藝 → Phase 0 實測)"
status: Phase 0 已實測(2026-09-01)—— 結論推翻 §3 主線建議 b+,見文末「Phase 0 實測結果」
---

# 字寬殘字 bug 家族根治研究

> **本階段只產研究筆記 + refactor 提案,沒有動任何 `src/` / `src-tauri/` 檔案。**
> 對象:NOTES `D-28 → D-37` 的殘字 bug 家族(tmux × xterm 字寬不一致 → 行頭殘字 / 花屏)。
> spike 腳本全在 `/tmp/pmux-cc-spike/`(不進 repo),實驗環境 tmux 3.4 / 本機拋棄式 socket `-L pmspike`,**沒有碰任何既有 session**。
> herdr 讀的版本:`github.com/herdrdev/herdr` @ `dbc398f`(Apache-2.0),行號皆為此 commit。
> 姊妹筆記:seamount `doc/note/herdr-study.md`(#136,狀態偵測面向)—— 那份不重複。

---

## TL;DR

1. **control mode 是 pass-through,不是換個通道拿同樣的 ANSI 流 —— 這題答案是正面的。** 實測證明:normal attach 時 tmux **用自己的 grid + 自己的字寬表重新渲染**再送給 client(這就是 D-34 說的那個「無法根治」的中間人);control mode 的 `%output` 是 **app 原封不動的 PTY bytes**,byte-for-byte 一致(含 OSC 52 / `1049h` / 絕對定位 / SGR)。tmux 的寬度表徹底退出渲染鏈。
2. **但代價很大,而且直接踩 D-31 紅線。** control mode 沒有 PTY:輸入只能走 `send-keys -H`;attach 當下**收不到任何既有畫面**(要自己 `capture-pane` bootstrap);copy-mode 完全不畫給 control client(只吐 `%pane-mode-changed`)→ D-24 / D-33 / D-38 三次滾動修正全部作廢。
3. **herdr 學不到我們想要的那條路,因為它根本不是 client。** herdr 自己就是 multiplexer:`vendor/libghostty-vt` 全套 VT 解析器 + grid,cell 帶 `CellWide{Narrow,Wide,SpacerTail,SpacerHead}`,寬度**只算一次**(`ghostty_unicode_grapheme_width`);遠端 client 收的是 **cell 陣列**(`PaneSurfacePatch` → `Vec<CellData>`)不是 ANSI 流。要照抄 = 連 xterm.js 一起換掉。
4. **我的建議不是上面任何一個,是先做一個半天的決斷實驗。** 實測發現 tmux 的字寬表**可以直接量**(`printf <char>` 後讀 `#{cursor_x}`),所以「對每台 host 量一次它的 tmux 寬度表 → 餵給 xterm.js 自訂 unicode provider」是可行的,**對輸入路徑零風險**,而且正好補上 D-34 說缺的那塊(「寬度表跟 server 端 tmux 版本綁定」)。先量一次,量出來有差就修這裡;量出來沒差,D-34 的診斷就是錯的,再談 control mode。

---

## 題 1:tmux control mode(-CC)spike

### 1.1 實驗設定

```bash
# 全程在拋棄式 socket,做完 kill-server;沒有 send-keys 到任何既有 session
tmux -L pmspike new-session -d -s cc -x 40 -y 10
tmux -L pmspike -CC attach -t cc      # 需要 tty(python pty 起)
```

### 1.2 `%output` 給的是什麼

**是 app 原封不動的位元組流,八進位跳脫。** 讓 pane 裡 `cat` 一個含各種毒物的 binary blob:

```
blob = \x1b[?1049h  \x1b]52;;5Lit4pyF\x07  \x1b[5;9HZ  \x1b[?1049l  \x1b[38;5;196mR\x1b[0m
       alt-screen    OSC 52(中✅)        絕對定位    退出        SGR 256 色
```

把 `%output` 的 `\NNN` 還原後 —— **blob 原封出現,`in` 測試 True**:

```
b'...\x1b[?2004l\r\x1b[?1049h\x1b]52;;5Lit4pyF\x07\x1b[5;9HZ\x1b[?1049l\x1b[38;5;196mR\x1b[0m\x1b[?2004h...'
```

跳脫規則:非可印字元 → `\NNN` 八進位(`\033` = ESC、`\015` = CR、`\134` = `\`);UTF-8 可印字元原樣通過(`%output %0 中文✅`)。

### 1.3 決定性對照 —— 這題的核心證據

同一個 session 同時掛 normal attach client(40×10 pty)與 control client,讓 pane 跑同一段輸出:

```sh
printf '\033[H\033[2J'; printf 'AB✅CD中EF\n'; sleep 0.4; printf '\033[1;5HZZ\n'
```

**normal attach client 收到(tmux 自己重繪):**

```
\x1b[1;9r \x1b[9S \x1b[1;1H AB✅CD中EF \x1b[1;10r \x1b[2;1H \x1b[1;5H ZZ ...
... \x1b[H AB✅ZZ中EF \x1b[K ...          ← tmux 算完的 row 內容
... \x1b[30m\x1b[42m [cmp] <a>"kirin-desktop" 23:18 01-Sep-26   ← 連 status line 都是 tmux 畫的
```

**control client 的 `%output`(還原後):**

```
\x1b[?2004l\r \x1b[H\x1b[2J AB✅CD中EF \r\n \x1b[1;5H ZZ \r\n \x1b[?2004h ...
```

看 `\x1b[H AB✅ZZ中EF` 這一行:**`ZZ` 是 app 寫在第 5 欄的,但 tmux 把它算成蓋掉 `CD`** —— 因為 tmux 認定 `✅` 佔 2 欄(第 3-4 欄)。tmux 接著把「整列算完的結果」當文字送給 client。如果 xterm.js 認為 `✅` 佔 1 欄,同一串 bytes 在 xterm 排出來就整列偏 1 格 —— **這就是 D-28/D-34/D-37 殘字的機制,現在有具體證據了**。

control mode 這條路上,tmux 沒有算任何東西,`\x1b[1;5H` 是 **app 自己**寫的。

### 1.4 所以能不能繞過錯位?—— 誠實版答案

**能繞過「tmux 依自己的表定位」這一層,但不是把字寬問題消滅。**

渲染鏈上的字寬表從 3 個變 2 個:

```
現況(normal attach):  app 的表  →  tmux 的表  →  xterm 的表     兩個接縫
control mode:          app 的表  →              →  xterm 的表     一個接縫
```

被拿掉的正好是 **piermux 控制不了、且綁 host tmux 版本**的那個(D-34 判定「無法一勞永逸根治」的原因)。剩下的 app↔xterm 接縫是**任何終端機都有**的,等同 ssh 直連不開 tmux —— Tabby / iTerm2 每天在跑的常態。

⚠️ **但我不能斷言「換了就一定不殘字」。** owner 觀察到「F5 必治」對「tmux 增量重繪累積誤差」和「app 自己算錯」**兩種假說都成立**(SIGWINCH 同時逼 tmux 和 app 全重繪)。要分辨得靠題 3 的 Phase 0 實驗。

### 1.5 對 piermux 架構的影響(這才是真正的成本)

| 面向 | 實測結果 | 對 piermux 的衝擊 |
|---|---|---|
| **輸入路徑** | control mode **沒有 PTY**,stdin 是命令通道。輸入只能 `send-keys -H <hex...>` / `send-keys -l -- '<text>'` | 🔴 **直踩 D-31 紅線**。`attach.rs` 的 `write_to_session` 走 PTY stdin 要整條換掉。實測本機往返中位數 **0.3 ms**(10 次:0.8/0.3/0.3/0.2/0.3/0.3/0.2/0.2/0.2/0.2),每個按鍵多一組 `%begin/%end`。**Bonus**:貼上變成一發 `send-keys -l` 原子操作,理論上比現在分塊寫 PTY 更不會「貼上不完全」 |
| **attach 初始畫面** | ⚠️ **完全沒有**。掛上去只收到 `%begin/%end` + `%session-changed`,跑全螢幕 app 的 pane 一個 byte 都不給 | 要自己 `capture-pane -p -e` bootstrap(text + SGR,無絕對定位,xterm 自己排版 → 不會殘字但寬字換行點可能不同);或 `refresh-client -C <改過的尺寸>` 逼 SIGWINCH → app 全重繪(實測有效,乾淨吐 `\033[H\033[2J` + 內容)。**注意這是 D-30 那招,但這裡是 attach 前的 bootstrap、不是打字中的自動 resize,不撞 D-31** |
| **copy-mode / 捲動** | 🔴 進 copy-mode 只吐 `%pane-mode-changed %0` + `%window-renamed @0 [tmux]`,**畫面一個 byte 都不送** | **D-24 / D-33 / D-38 三次修正全部作廢**。捲動要改成 client 自己 `capture-pane -S -<n>` 拉歷史自己渲染 |
| **layout / 尺寸** | `%layout-change @0 f472,60x14,0,0{30x14,0,0,0,29x14,31,0,1}` 給完整 layout 字串;`refresh-client -C 100x30` 設 client 尺寸 | 要自己 parse layout、自己畫 split。piermux 目前一個 session 只看 `:0` 一個 pane,**若維持單 pane 假設,這塊成本可以先不付** |
| **pane 生命週期** | `%window-add` / `%window-pane-changed` / `%window-renamed` / `%session-window-changed` / `%exit` 一整套 | 對 tree / session list 反而是**免費的即時更新**(現在靠輪詢 capture) |
| **tmux status line** | control client 收不到 | 無所謂,piermux 本來也不顯示 |
| **SSH 通道形態** | `-CC` 需要 tty;**`-C`(單 C)不需要 tty,純 pipe 就能跑**(實測 `tmux -L pmspike -C attach -t cc < /dev/null` 正常吐 `%begin`) | 🟢 好消息:可以用 makiko 的 **exec channel,不必 request_pty**,跟現有 `attach.rs` 的 PTY 通道天然分離 |
| **並存可能性** | 兩個 client(normal + control)可同時掛同一 session,實測都正常收到內容 | 有「PTY 只當輸入、control 只當輸出」的混合解 —— 見題 3 選項 a2 |

### 1.6 附帶發現

- `refresh-client -B` 格式訂閱(`%subscription-changed`)可以推 `#{pane_title}` / `#{pane_current_command}` 之類 —— 這正是 seamount `herdr-study.md` A1/A3 用的訊號。**piermux 的 tree / capture 層若哪天要即時狀態,這條比輪詢便宜。**(本次語法沒試對,標為待驗)
- `capture-pane -p -e` 可以直接在 control channel 上跑,結果包在 `%begin/%end` 區塊裡回來 —— 一條連線同時做「串流」和「查詢」。

---

## 題 2:herdr 怎麼處理終端內容表示

**一句話:herdr 不是 tmux client,它自己就是 multiplexer,自己養 grid。所以它根本沒有我們這個問題。**

### 2.1 自帶 VT 解析器 + grid(不是轉發位元組流)

- `build.rs:53` 把 **`vendor/libghostty-vt`**(ghostty 的 VT 引擎,Zig)用 `zig build` 編成靜態庫連進來(`build.rs:89-94`)。
- `src/ghostty/mod.rs` 是那層 FFI 包裝:`Terminal::new(cols, rows, scrollback)`、`terminal.write(bytes)` 餵 PTY bytes、`terminal.resize(...)`。**PTY 位元組流進去,grid 出來。**
- pane 的內容取用一律走 grid,不是重播 bytes:
  - `screen_cell(x, y)` @ `src/ghostty/mod.rs:1103`
  - `read_text_viewport(...)` / `read_ansi_viewport(...)`(`src/pane/terminal.rs:2603-2613` 的 `ghostty_visible_ansi`)
  - 偵測用的畫面文字 `ghostty_detection_text` @ `src/pane/terminal.rs:2616-2624` —— 取**活 buffer 底部 rows 行**,不是使用者捲到的 viewport

### 2.2 字寬在哪層算、用什麼表

**在 VT 引擎裡算,只算一次,而且結果變成 cell 的欄位。**

```rust
// src/ghostty/mod.rs:434-447
pub enum CellWide { Narrow, Wide, SpacerTail, SpacerHead }

pub(crate) struct ScreenTextCell { pub wide: CellWide, pub graphemes: Vec<u32> }
pub(crate) struct ScreenTextRow  { pub cells: Vec<ScreenTextCell>,
                                   pub soft_wrapped: bool, pub wrap_continuation: bool }
```

- 寬度函式:`unicode_codepoint_width(u32) -> u8` @ `src/ghostty/mod.rs:743`、`unicode_grapheme_width(&[u32]) -> (usize, u8)` @ `:747`,兩者都直接呼叫 libghostty-vt 的 `ghostty_unicode_grapheme_width`。**表在 Zig 那側,Rust 這側不重算。**
- 測試 `unicode_width_helpers_match_terminal_layout_rules` @ `src/ghostty/mod.rs:3556-3586` 把契約寫死:`界`=2、組合符=0、`⚠+FE0F`=2、`⚠+FE0E`=1、國旗 pair=2、`👍+膚色`=2、`👨‍👩‍👧` ZWJ(5 codepoints)=2。
- **`SpacerTail` / `SpacerHead` 是關鍵**:寬字的第二格是 grid 裡實體存在的 cell,不是「算出來的」。所以任何下游都不需要再猜寬度 —— 這正是 piermux 現在缺的東西(xterm.js 和 tmux 各自猜)。
- 額外的 `unicode-width` crate(`Cargo.toml:47`)只用在**畫自己的 TUI chrome**(`src/ui/text.rs`、`src/client/shell/render.rs`),不參與 pane 內容。

### 2.3 Socket API 吐的內容格式

兩套通道,語意完全分開:

**(A) 給外部工具的 JSON socket API**(seamount 那份筆記講的那套)—— 吐**文字**:

```rust
// src/api/schema/panes.rs:355-367
pub struct PaneReadParams {
    pub pane_id: String,
    pub source: ReadSource,        // Visible | Recent | RecentUnwrapped | Detection
    pub lines: Option<u32>,
    pub format: ReadFormat,        // Text | Ansi   (src/api/schema/common.rs:91-95)
    pub strip_ansi: bool,          // 預設 true
    ...
}
```

`format: Ansi` 是**從 grid 重新序列化出來的** ANSI(`read_ansi_viewport`),不是原始位元組流的重播。

**(B) 給自家 client 的 wire protocol** —— 吐 **cell 陣列,不是 ANSI**:

```rust
// src/protocol/wire.rs:670-683
pub struct CellData {
    pub symbol: String,          // 一個 grapheme cluster
    pub fg: u32, pub bg: u32,
    pub modifier: u16,
    pub skip: bool,
    pub hyperlink: Option<u32>,  // OSC 8 索引
}

// src/protocol/wire.rs:1173-1193
pub struct PaneSurfacePatchRow { pub x: u16, pub y: u16, pub cells: Vec<CellData> }
pub struct PaneSurfacePatch {
    pub surface_revision: u64,
    pub rows: Vec<PaneSurfacePatchRow>,   // 增量:只送變動的 cell span
    pub cursor: Option<CursorState>,
    ...
}
```

`RenderEncoding`(`src/protocol/wire.rs:39-44`)兩種:`SemanticFrame`(送 cell,本機/預設)或 `TerminalAnsi`(送已經 diff 過的 ANSI bytes)。

**最後那哩路仍要面對 host 終端機的表**:`render_ansi.rs` 把 cell 貼回宿主終端時,還是得用 `unicode-width` 猜宿主的排版(`cell_width` @ `src/protocol/render_ansi.rs:728-732`,連半形片假名濁音這種角落都手工補了 `is_halfwidth_katakana_voiced_grapheme`)。**也就是說:連 herdr 都躲不掉「最外層那個終端機的表」—— 它只是把接縫從 N 個壓到 1 個。** 這點對我們的結論很重要。

### 2.4 對 piermux 的意義

herdr 的架構要移植到 piermux,等於:後端養 grid → 前端不能再用 xterm.js 的 `term.write(bytes)`,得改收 cell 陣列自己畫。**這不是 refactor,是換掉整個終端層。**

---

## 題 3:refactor 提案 —— 選項矩陣

### 先講 Phase 0:半天的決斷實驗(建議先做這個,不要先選路)

本次實測發現一件事:**tmux 的字寬表可以直接量。**

```bash
# 拋棄式 session,印一個字元後讀 tmux 自己的 cursor_x = 它認定的寬度
tmux -L probe new-session -d -s p -x 80 -y 24
tmux -L probe respawn-pane -k -t p:0 "sh -c 'printf \"\\033[H\\033[2J\"; printf \"中\"; sleep 5'"
tmux -L probe display-message -p -t p:0 '#{cursor_x}'
```

實測(本機 tmux 3.4):`A`=1、`中`=2、`✅`=2、`⚠️`=2、`±`=1、`①`=1、`○`=1。

**Phase 0 = 對 owner 真實的 host 跑這個探針,把結果跟 xterm.js 現行(D-28 的 graphemes addon / Unicode 15)的表 diff。**

| 結果 | 結論 | 走哪條 |
|---|---|---|
| **diff 非空** | D-34 的診斷是對的,而且找到了可修的點 | 走 **選項 b+**,便宜且對輸入零風險 |
| **diff 為空** | tmux 跟 xterm 其實已經同表 → **D-34 的診斷是錯的**,殘字來自別處(tmux 增量重繪 × xterm reflow,或 app 自己) | 再做第二個實驗:同一個跑 claude code 的 session,control 流 vs normal 流各餵一份到 headless xterm.js,比對最終 grid。有差才輪到 **選項 a** |

**先量再選路。現在直接挑 a 或 c 都是在賭 D-34 的診斷。**

### 選項矩陣

| # | 選項 | 能否根治殘字 | 對輸入路徑風險(D-31) | 工程量級 | 建議 |
|---|---|---|---|---|---|
| **b+** | **字寬探針**:attach 前對該 host 的 tmux 量一次寬度表 → 存 DB(per host + tmux 版本)→ 前端註冊自訂 `IUnicodeVersionProvider` 餵給 xterm.js | 🟢 **根治 tmux↔xterm 接縫**,而且是**逐 host 精確**,正好補上 D-34 說「表綁 server tmux 版本、無法一勞永逸」那塊 | 🟢 **零** —— 完全不碰 attach / 輸入,只換 xterm 建構時的 unicode provider | **S(1-2 天)** 探針 shell script + provider + DB 欄位 + 快取 | ⭐ **主線建議** |
| **a1** | **control mode 全換**:`-C attach` 走 exec channel,輸入改 `send-keys -H`,bootstrap 走 `capture-pane`,捲動自己實作 | 🟢 拿掉 tmux 渲染中間人(接縫 3→2),架構上最乾淨 | 🔴 **高** —— 輸入整條換掉,D-31 明列的紅線 | **L(3-5 天+)** 還要賠上 D-24/D-33/D-38 重寫、Android 對等 | 長線選項,Phase 0 指向它才做 |
| **a2** | **混合**:PTY attach 只當輸入(一行不改),另開 `-C` control channel 只當輸出,前端只吃 `%output` | 🟢 同 a1 | 🟢 **零** —— 輸入路徑一個 byte 不動 | **M(2-3 天)** 但兩個 client 同 session:`window-size` 協商、頻寬 ×2(行動端要在意)、PTY 那條的輸出整包丟棄 | a1 的降風險版;若 Phase 0 指向 control mode,**先做 a2 驗證假說**再談 a1 |
| **c** | **後端養 grid(學 herdr)**:Rust 端接 VT parser(`wezterm-term` / `vte` / libghostty-vt)→ 前端改收 cell 陣列自己畫 | 🟢 理論最徹底(接縫壓到 1),但 §2.3 已證**連 herdr 都要在最外層猜一次表** | 🟡 中(輸入還是走 PTY,但整層重寫難免波及) | **XL(2-4 週)** = 換掉 xterm.js + 自寫 renderer + Android 對等 | ❌ 不建議。這是 side project,收益/成本不成比例 |
| **d** | **維持現狀 + workaround**(D-34 F5 + D-37 自動重繪) | 🔴 不根治,殘字照出、靠事後蓋掉 | 🟢 零(已上線,D-37 已實機驗) | **0** | 保底。b+ 上線且實機驗過之前,F5 / 自動重繪**不要拔** |

### 選項細節補充

**b+ 的實作草圖(不是實作,是給拍板看的形狀)**

1. 後端新 command `probe_tmux_widths(host_id, socket)`:一條 SSH exec,server 端跑一支迴圈腳本(每字元 `printf` 後 `tmux display -p '#{cursor_x}' >> /tmp/w`,最後 `cat`)—— **一次 round trip 拿全表**。候選字元集 = East Asian Ambiguous + Emoji + VS16 序列,約 10³ 量級。
2. 存 `host_widths` 表,key = `(host_id, socket, tmux_version)`,永久快取(tmux 版本沒變就不重量)。
3. 前端 `lib/xterm-unicode.ts` 多一條路:有探針表 → `term.unicode.register(customProvider)`(`allowProposedApi` 已經開著,D-28 就開了);沒有 → 退回現行 graphemes addon。
4. **已知縫隙(要誠實記帳)**:`IUnicodeVersionProvider.wcwidth` 是 per-codepoint 的,grapheme cluster(ZWJ / 國旗 / VS16)得靠 graphemes addon 的分群 + 探針的寬度混著用,這塊會有接不齊的角落。但現況是**整組 emoji 都可能錯**,不是退步。

**a2 的並存風險(實測沒踩到但要標)**:兩個 client 同 session 時 `window-size` 預設 `latest` → 尺寸由最後動作的 client 決定。piermux 要嘛把兩條都設同尺寸,要嘛顯式設 `window-size manual` + `resize-window`。

---

## 建議路線(一句話)

**先跑 Phase 0 字寬探針對 owner 真實 host 量一次表、跟 xterm 現況 diff —— 有差就走 b+(逐 host 精確寬度表,對輸入零風險,1-2 天);沒差就代表 D-34 診斷錯了,再用 a2(control mode 只當輸出通道)去驗第二個假說,control mode 全面換(a1)與 herdr 式後端 grid(c)都先不做。**

期間 D-34 的 F5 與 D-37 的自動重繪**保留不動**,直到替代方案實機驗過。

---

## 附錄:spike 復現

```bash
# 全程拋棄式 socket,做完 kill-server
mkdir -p /tmp/pmux-cc-spike && cd /tmp/pmux-cc-spike
tmux -L pmspike new-session -d -s cc -x 40 -y 10
# control client 要 tty(-CC);-C 不用,純 pipe 可跑:
tmux -L pmspike -C attach -t cc < /dev/null
tmux -L pmspike kill-server
```

本次跑過的實驗(腳本留在 `/tmp/pmux-cc-spike/`,**不進 repo**):

| 檔 | 驗什麼 | 結果 |
|---|---|---|
| `t1.py` | `%output` 的形狀與跳脫 | 八進位 `\NNN`,UTF-8 原樣 |
| `t2.py` | layout / pane 生命週期事件 | `%layout-change` 給完整 layout 字串;resize 只吐 app 自己的重繪 |
| `t3.py` | `send-keys -H` / `-l` 輸入 | 逐鍵、原子貼上、UTF-8 皆正常 |
| `t4.py` | 逐鍵往返延遲 / copy-mode | 中位數 0.3 ms;copy-mode **不畫**給 control client |
| `t5.py` | byte-for-byte 保真度 | blob 原封出現 ✓ |
| `t6.py` | `refresh-client -C` 尺寸 / `capture-pane` 走 control channel | 皆可 |
| `t7.py` | **normal attach vs control 對照** | 決定性證據,見 §1.3 |
| `t8.py` | 全螢幕 app × control attach 的初始畫面 | **完全沒有**;改尺寸 → SIGWINCH → app 全重繪 |

## 授權

herdr 是 Apache-2.0。本筆記只引用行號與結構描述,沒有抄任何程式碼。若日後採納選項 c 移植其設計,需標明出處與授權。

---

## Phase 0 實測結果(2026-09-01)

> Kirin 已拍板跑 Phase 0。本節是**實測報告**,結論**推翻了本筆記 §3 的主線建議**(選項 b+)。
> 一樣**沒有動任何 `src/` / `src-tauri/`**;腳本全在 `/tmp/pmux-w0/`,拋棄式 socket `-L pmwidth`、session 名 `spike-width-probe`,跑完 `kill-server` + 刪 socket 檔,**7 個既有 session 全程沒碰**。

### 一句話結論

**本機 tmux 3.4 與 piermux 現行 xterm.js 組態的字寬表,369 個代表性字元中只有 2 個不一致,而且 D-34 實際殘字案例的字元(`U` `R` `L` `驗` `證` `去` `看`)全部一致 → D-34 的根因判斷(「tmux 與 xterm 字寬不一致」)在本機不成立,選項 b+ 不是主線。**

### 方法

**tmux 側 —— 兩支互相獨立的探針,結果必須一致才採信。**

| 探針 | 做法 | 同步方式 | 369 字耗時 |
|---|---|---|---|
| **A**(§3 原設計) | pane 內 `printf '\033[H\033[2J'` + 字元,pane 外 `tmux display-message -p '#{cursor_x}'` | `sleep 0.03`(client / server 非同步,只能靠等) | **13.5 s** |
| **B**(本次新設計) | pane 內印完字元後送 DSR `\033[6n`,由 tmux 自己回報游標欄位,pane 內把回覆讀回來 | **天然同步**(pane 內 PTY 往返,沒有 client 呼叫) | **59–64 ms**(3 次:60 / 59 / 59) |

**A 與 B 對 369 個字元逐筆比對,369/369 完全一致** —— 兩種完全不同的讀法給出同一張表,量測本身可信。
探針 B 順便就是 b+ 遠端探針的成本原型:**一條 SSH exec、遠端 CPU ~60 ms 就能量完全表**(見下方成本估計)。

**xterm 側 —— 照 `src/lib/xterm-unicode.ts` 的實際組態,但不改 src。**

- `/tmp/pmux-w0/xterm-widths-multi.mjs` 直接 import repo `node_modules` 的 `@xterm/addon-unicode-graphemes@0.4.0` 打包產物,用假 terminal 收 `unicode.register()`,再照 `xterm-unicode.ts:22-23` 取 `versions[versions.length-1]` → 實際解出 `versions=["6","15","15-graphemes"] → active=15-graphemes`(**順帶確認那行「取最後一個」在真的 `UnicodeService` 下也選對**)。
- 字串寬度用 `UnicodeService.getStringCellWidth()` **逐字照抄** `@xterm/xterm@6.0.0` 的 `src/common/services/UnicodeService.ts`(從 `lib/xterm.js.map` 的 `sourcesContent` 取出原始 TS,不是憑記憶重寫)。
- 同時量三個 provider:`6`(xterm 預設,D-28 之前的狀態)/ `15` / `15-graphemes`(piermux 現況)。

### 字元批次(369 個,`/tmp/pmux-w0/gen.py` 產生)

| 分類 | 字元數 | tmux vs xterm 現況 diff | 樣本(值 = tmux 寬) |
|---|---|---|---|
| D-34 殘字案例 | 7 | 0 | `U`=1 `R`=1 `L`=1 `驗`=2 `證`=2 `去`=2 |
| ASCII / URL 標點 | 20 | 0 | `A`=1 `0`=1 ` `=1 `h`=1 `t`=1 `p`=1 |
| CJK 漢字 / 標點 / 全形 | 60 | **1** | `中`=2 `文`=2 `字`=2 `寬`=2 `終`=2 `端`=2 |
| Ambiguous width | 101 | **1** | `±`=1 `×`=1 `÷`=1 `→`=1 `←`=1 `↑`=1 |
| Emoji 單 codepoint | 44 | 0 | `😀`=2 `🚀`=2 `🔥`=2 `✨`=2 `🎉`=2 `👍`=2 |
| Emoji VS16 / VS15 | 12 | 0 | `⚠️`=2 `✔️`=2 `✖️`=2 `ℹ️`=2 `⏱️`=2 `❤️`=2 |
| Emoji ZWJ / 膚色 / 國旗 / keycap | 7 | 0 | `👨‍👩‍👧`=2 `🏃‍♂️`=2 `🧑‍💻`=2 `🏳️‍🌈`=2 `👍🏽`=2 `🇹🇼`=2 |
| Braille(claude spinner) | 19 | 0 | `⠀`=1 `⠋`=1 `⠙`=1 `⠹`=1 `⠸`=1 `⠼`=1 |
| 半圓 / spinner 幾何 | 20 | 0 | `◐`=1 `◑`=1 `◒`=1 `◓`=1 `◜`=1 `◝`=1 |
| 框線 / block | 48 | 0 | `─`=1 `│`=1 `┌`=1 `┐`=1 `└`=1 `┘`=1 |
| Powerline PUA | 9 | 0 | `` `` `` `` = 1(U+E0B0-E0B3 等) |
| TUI 雜項 / 勾叉 / 箭頭 | 22 | 0 | `⌘`=1 `⌥`=1 `⇧`=1 `⌃`=1 `⏎`=1 `␣`=1 |

D-34 案例字元取自 NOTES D-34 的原始回報(「URURL」「驗驗證」「去去看」)。

### diff 表

**tmux 3.4 對三個 xterm provider 的差異數(n=369):**

| xterm provider | diff | 說明 |
|---|---|---|
| `6`(xterm 預設,**D-28 之前**) | **48** | 全是 emoji:單 codepoint 18、VS16 11、色圓 8、`✅❌⭐…` 7 等。**這就是 D-28 修掉的那 48 個。** |
| `15` | **21** | graphemes 關掉時,ZWJ / VS16 cluster 仍對不上 |
| `15-graphemes`(**piermux 現況**) | **2** | 見下表 |

**現況僅存的 2 筆差異:**

| # | 字元 | codepoints | tmux | xterm | 分類 | 在 D-34 殘字案例裡? |
|---|---|---|---|---|---|---|
| 1 | `ｶ゙` | U+FF76 U+3099 | 1 | 2 | 半形片假名 + 濁音組合 | ❌ 否 |
| 2 | (不可見) | U+200B | 0 | 1 | ZWSP 零寬空格 | ❌ 否 |

兩筆都是 exotic 字元,**沒有一個出現在 D-34 的殘字案例裡**,也不在 claude code / shell / URL 的日常輸出裡。
(附帶一提:herdr 的 `render_ansi.rs` 手工補的 `is_halfwidth_katakana_voiced_grapheme` 正好就是第 1 筆 —— 這個角落**所有終端機都在各自補**,不是 piermux 特有。)

**靈敏度對照(重要):** 同一套量測管線在 provider `6` 下能穩定抓出 48 筆差異、在 `15` 下抓出 21 筆。所以「現況只有 2 筆」**不是量測不出來,是真的沒有**。

### 結論:D-34 的診斷存疑

D-34(2026-07-14)寫的根因是「tmux 與 xterm 對部分字元的字寬計算不一致 …… D-28 已對齊過一版寬度表,但寬度表跟 server 端 tmux 版本綁定,無法一勞永逸根治」。

實測顯示:**D-28 的 graphemes addon 已經把這個接縫關到剩 0.5%(2/369),而且關掉的正好涵蓋 D-34 案例的所有字元。** D-34 的根因是在 D-28 修完之後寫的**推論**,從來沒有重新量過 —— 這次量了,不成立。

**因此:**

- **選項 b+(字寬探針 + 自訂 `IUnicodeVersionProvider`)降級為「不是主線」。** 它會很漂亮地修掉 `ｶ゙` 和 ZWSP,然後殘字照樣出現。**不建議現在做。**
- 本筆記 §3「建議路線」那句「有差 → 走 b+」的前提**沒有成立**,以本節為準。
- **D-34 的 F5 與 D-37 的自動重繪繼續保留不動**(這點跟原筆記一致,而且現在更該保留 —— 我們連根因都還沒抓到)。

**誠實記帳(這份結論的邊界):**

1. **只量了本機 tmux 3.4 × 一份 xterm 組態。** 其他 host 若跑 tmux 3.0/3.2(Unicode 表較舊、emoji 多半算 1)diff 會非空 —— 但那是**另一台機器的問題**,不是 owner 回報 D-34 時那台。要否定「per-host 版本差異」需要對 owner 真實 host 各量一次(探針成本見下,很便宜)。
2. **單字元寬度一致 ≠ 整行排版一致。** 沒有涵蓋:行尾寬字換行點、`\033[K` 的清除範圍、scroll region、xterm.js 的 **reflow**(tmux 沒有 reflow)。第二假說正是押在這裡。
3. 探針量的是 **tmux 自己 grid 的寬度**,與 client 端 `TERM` / locale 無關 —— 這是好事(量到的就是 tmux 排版用的那張表),但也代表本實驗**完全沒有覆蓋 client 端變因**。

### 第二假說(H2)與 a2 驗證計畫

**H2:client grid 與 tmux grid 分岔的來源不是字寬表,是「xterm.js 會 reflow、tmux 不會」+ 尺寸/捲動路徑。**

理由:

- tmux 對 client 做增量重繪時,**假設 client 的 grid 跟自己逐格相同**,然後用絕對定位補畫。只要兩邊 grid 分岔過一次,之後每次補畫都會落錯位置 → 行頭舊字蓋不到 → 殘字。
- xterm.js 在 `resize` 時會 **reflow**(把 wrapped line 重新斷行),tmux **不會**。一次 fit / 字級變更(D-35)/ D-37 自動重繪都會觸發 xterm reflow → 兩邊 grid 從此不同。
- 這同時解釋三個既有觀察,而字寬假說只解釋得了第一個:
  - 「F5(resize ×2)必治」→ 逼 tmux **整屏**重畫,把 client grid 整個覆蓋,分岔歸零(D-34 / D-37)。
  - 「拖視窗邊緣就好」→ 同上(D-29)。
  - 「滾輪後才出現」→ D-33 / D-38 的滾輪路徑會改動 viewport / alt-screen / copy-mode 狀態(D-34 原始回報就是「update 或滾輪後」)。

**驗證計畫 —— Phase 0.5「位元組流重放比對」(建議先做這個,比 a2 便宜且不碰 control mode):**

1. 拋棄式 socket 開 session,跑一個會做增量重繪的全螢幕 app(claude code 或錄好的重放腳本)。
2. python pty 起一個 **normal attach client**(固定 cols/rows),把 tmux 送出的 bytes **全部存檔**。
3. 把同一份 bytes 餵給 **headless xterm.js**(`@xterm/headless`,同 addon 組態、同 cols/rows),dump 最終 grid。
4. 同時 `capture-pane -p` 取 **tmux 自己的 grid**。
5. **比對 3 與 4:**
   - **一致** → 位元組流本身沒問題,殘字產生在 live client 端(尺寸同步 / reflow / renderer / 滾輪路徑)→ **修 piermux 前端就好,control mode 整條路都不用走**。
   - **不一致** → 找出第一個分岔的 op(哪一段 ANSI 讓兩邊 grid 開始不同),才輪到 a2。
6. **加碼(直接驗 H2)**:在步驟 3 的中途插一次 `term.resize()`(模擬 fit / 字級變更 / F5),看 grid 是否**從那一刻才開始**跟 tmux 分岔。

成本:半天。新依賴只有 `@xterm/headless`(裝在 /tmp,不進 repo)。**不需要 control mode、不動 `src/`、不碰輸入路徑。**

**a2(control mode 只當輸出通道)維持原定位:Phase 0.5 若指向「位元組流本身就分岔」才做。** a1 / c 依舊不做。

### 附帶產出:b+ 探針成本估計(留帳,萬一日後 per-host 版本差異真的浮上來)

用探針 B 的形狀(遠端跑一支腳本、DSR 自同步、一次吐完整張表):

| 項目 | 實測 / 估計 |
|---|---|
| 369 字元,遠端 CPU 時間 | **59–64 ms**(3 次量測,標準差 < 1 ms) |
| 每字元攤提 | **~0.16 ms** |
| 推到 10³ 量級(East Asian Ambiguous + Emoji + VS16 全集) | **~170 ms** 遠端 CPU |
| SSH round trip | **1 次**(一條 exec,結果一次回傳) |
| 快取 key | `(host_id, socket, tmux_version)`,tmux 版本沒變就不重量 |

**結論:成本上「host 連線時量一次」綽綽有餘**(一次 exec + 0.2 s 遠端 CPU,可以完全藏在連線握手裡,使用者無感)。**但這次實測顯示量了也修不到殘字,所以現在不做。**

### Phase 0 復現

```bash
mkdir -p /tmp/pmux-w0
python3 gen.py                      # -> chars.json + in.oct(八進位跳脫,POSIX printf 相容)
tmux -L pmwidth new-session -d -s spike-width-probe -x 80 -y 24 '/bin/bash /tmp/pmux-w0/probeB.sh'
#   probeB.sh:輸入檔走 FD 3,stdin 留給 tty 收 DSR 回覆(踩過的坑:兩者共用 stdin 會互吃)
tmux -L pmwidth kill-server && rm -f /tmp/tmux-$UID/pmwidth
node xterm-widths-multi.mjs > xterm3.tsv
python3 diff2.py
```

| 檔 | 用途 |
|---|---|
| `gen.py` | 369 字元批次 → `chars.json` / `in.oct` |
| `probeA.sh` | 探針 A(`#{cursor_x}`) |
| `probeB.sh` | 探針 B(DSR `\033[6n`),**主力** |
| `xterm-widths-multi.mjs` | xterm 三 provider 寬度 |
| `UnicodeV6.shim.ts` / `.mjs` | 從 `xterm.js.map` 取出的 V6 provider(靈敏度對照用),esbuild 轉譯 |
| `diff2.py` | 三向 diff + 分類報表 |
