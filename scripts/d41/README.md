# D-41 殘字 debug 工具(flight recorder dump 離線分析)

app 裡按 F5,grid 分岔時會自動存 dump 到系統 temp(`piermux-d41-*.json`,
toast / console 有完整路徑)。這裡的工具拿 dump 在本機重放,不需要 tmux。

前置(一次):

```sh
npm i --no-save @xterm/headless@6.0.0   # 版本對齊 @xterm/xterm
```

| 工具 | 用途 |
|---|---|
| `node scripts/d41/replay.mjs <dump.json>` | 重放 bytes 進乾淨 headless xterm(repo 同款 graphemes 組態),比對「重放 vs live grid」(≠ 表示 live 被錄音外 bytes 污染)與「重放 vs tmux grid」(≠ 表示 bytes 在 xterm 排出來就跟 tmux 不同)。`--trace <row>` 每 chunk 印該 row,找它長歪的瞬間 |
| `node scripts/d41/inspect.mjs <dump.json> <文字> [前後文字元數]` | 找 dump 裡含指定文字的 chunk,印跳脫後原始 bytes(ESC=`\e`,FE0F 等標記) |
| `node scripts/d41/replay-hostprov.mjs <dump.json>` | 用 host-width-provider 同款演算法 + 檔內 `HOST_WIDTHS` 表重放,驗證 per-host 字寬表能否把「重放 vs tmux」壓到 0 |

判讀速查(NOTES D-41 有完整記錄):

- 重放 ≠ live → live 被錄音外 bytes 污染(漏網 listener / 多寫入者)
- 重放 = live 但 ≠ tmux → bytes 層分岔,用 `inspect.mjs` 解剖分岔行的序列(通常是字寬)
- 兩者皆 = → grid 無病;殘字若可見即 renderer / 合成層問題(Shift+F5 / Ctrl+F5 探針)
