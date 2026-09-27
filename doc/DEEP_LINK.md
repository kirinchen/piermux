# piermux deep link —— `piermux://` 契約

**scheme 擁有者是 piermux。** 別的 repo(目前是 seamount)只照本檔組 URL,不讀 piermux 任何內部資料。
契約改了 → 改本檔並通知呼叫端;呼叫端不得自行擴充語法。

Tide:[#159](http://100.114.93.81:5173/browse/159)。

---

## 1. 語法

```
piermux://attach?host=<host>&session=<session>
```

| 部分 | 規則 |
|---|---|
| scheme | `piermux`(固定,小寫) |
| action | URL 的 host 段就是動作名。目前**只有** `attach`,其餘一律忽略整條 URL |
| `host` | 必填。要連的那台**機器的識別字串** —— piermux `hosts` 表的 `display_name` 或 `ssh_host` |
| `session` | 必填。tmux session 名 |

- query 值一律 **URL encode**(`encodeURIComponent`)。session 名含空白、`/`、中文都必須編碼。
- **未知參數忽略**,不報錯。這讓呼叫端日後加參數不會打爛舊版 piermux。
- 缺 `host` 或 `session`、action 不是 `attach`、URL 解析失敗 → 顯示錯誤提示,不做任何事。

## 2. host 怎麼解析

比對 **不分大小寫**,兩個欄位都比,`display_name` 優先:

1. `display_name` 精確命中(該欄 `UNIQUE`,最多一筆)→ 直接用。
2. 否則比 `ssh_host` —— **這欄不唯一**(同一台機器可以有不同 user / port 兩筆設定)。
   - 命中恰好一筆 → 直接用。
   - 命中多筆 → 進 host 選擇畫面,**帶著 session 名**,由人挑。
3. 零筆命中 → 同樣進 host 選擇畫面並帶著 session 名。**不得**自動新增 host。

> seamount 送來的是「**跑 tmux 的那台 Linux**」(預設 tailnet `100.114.93.81`,seamount 端可用
> `SEAMOUNT_TMUX_HOST` 換掉),**不是**使用者面前那台 Windows。Windows 只是點連結、開 piermux 的機器。

## 3. session 怎麼處理

- host 定了之後,在該 host 的 session 清單裡找**完全相同**的名字(區分大小寫,tmux 本來就區分)。
- 命中 → attach。
- 找不到 → 顯示錯誤,並停在該 host 的 session 清單讓人自己挑。
  **絕不 new-session** —— deep link 是外部輸入,不可以憑一條 URL 在遠端機器上長出東西。

## 4. socket

**不在 URL 裡。** 呼叫端不知道、也不該知道 piermux 用哪個 tmux socket。
piermux 自己 `list_sessions` 找到該 session 屬於哪個 socket。

## 5. 冷啟動 / 熱啟動

| 情境 | 行為 |
|---|---|
| piermux 沒開 | 啟動 → 讀啟動參數裡的 URL → 照上面解析 → attach |
| piermux 已開 | **聚焦既有視窗**並在同一個 process 內處理,**不開第二個** piermux |

熱啟動靠 single-instance:第二個 process 一起來就把參數交給第一個然後自己退出。

## 6. 安全約束(紅線)

deep link 是**外部輸入**,任何人都能叫瀏覽器打開一條 `piermux://`。所以:

- **不接受 piermux 內部 id / uuid。** 只吃人看得懂的 host 名與 session 名。
- **不接受指令、憑證、路徑、任意參數。** 沒有「跑這行 shell」這種參數,永遠不會有。
- **不得新增 host、不得 SSH 到未登錄的主機。** 沒在 `hosts` 表裡 = 沒有這台,交給人去建。
- **不得 new-session。**
- **終端機內的連結不放行 `piermux:`** —— `src/lib/xterm-links.ts` 的允許清單只有 `http` / `https`。
  放行等於讓遠端 session 印一行字就能誘導 piermux 自己 attach 到別處(自我觸發)。這條不准改。
- URL 解析失敗、參數畸形、超長 → 丟掉,顯示錯誤,**不 crash**。

## 7. 錯誤行為一覽

| 情況 | 行為 |
|---|---|
| action 不是 `attach` | 忽略整條 URL,錯誤提示 |
| 缺 `host` / `session` | 錯誤提示,不動畫面 |
| host 零筆命中 | host 選擇畫面 + 帶著 session 名 |
| host 多筆命中(`ssh_host` 撞名) | host 選擇畫面 + 帶著 session 名 |
| session 不存在 | 該 host 的 session 清單 + 錯誤提示;不建新的 |
| 未安裝 piermux(呼叫端視角) | 瀏覽器沒反應。可接受的降級,呼叫端不必偵測 |

## 8. 範例

```
piermux://attach?host=100.114.93.81&session=kelp
piermux://attach?host=100.114.93.81&session=otter-158
piermux://attach?host=dev-linux&session=quant
piermux://attach?host=100.114.93.81&session=my%20session          # 名字裡有空白
piermux://attach?host=100.114.93.81&session=%E9%87%8F%E5%8C%96     # 名字是中文「量化」
piermux://attach?host=100.114.93.81&session=kelp&foo=bar           # foo 被忽略
```

## 9. 平台

- **桌面(Windows / macOS / Linux)**:有效。Windows 由 installer(`.msi` / `-setup.exe`)寫 registry
  註冊 scheme;綠色解壓版不會註冊,見 README。
- **Android**:v0.1.22 **不支援**。`AndroidManifest.xml` 沒有 `VIEW` / `BROWSABLE` intent-filter,
  且那份檔在 `gen/` 由 Tauri 產生。要支援再另開卡。

## 10. 呼叫端怎麼組

```ts
const url = `piermux://attach?host=${encodeURIComponent(host)}&session=${encodeURIComponent(name)}`;
```

seamount 的實作在 `web/src/views/StatusBar.tsx` 的 `piermuxUrl()`;host 由後端
`aggregate.py` 的 `TMUX_HOST` 給,前端不寫死。
