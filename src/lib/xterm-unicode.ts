// 把 xterm.js 的字元寬度對齊新版 tmux(3.4+)。
//
// tmux 3.4 依更新後的 Unicode 表把 emoji(✅ ❌ ⚠️ …)當寬度 2,但 xterm.js
// 預設的 Unicode 6 provider 把它們當寬度 1。tmux 全螢幕重繪時(例如 copy-mode
// yank / OSC 52 之後),每個 emoji 差 1 欄的誤差會累積,把行尾字元擠到下一行
// → 行頭出現重複 / 多餘字元(owner 2026-07-02 回報的「OSC 52 行頭多餘字」實為
// 此寬度 desync,非 OSC 52 解析問題)。
//
// graphemes addon(Unicode 15 + grapheme cluster)對齊 tmux 3.4 的寬度,涵蓋
// emoji、VS16 組合(⚠️ = U+26A0 U+FE0F)、CJK。已比對 tmux 3.4 cursor_x:
// ✅ ❌ ⚠️ 皆 2、◎ ① ± 皆 1、中 、 皆 2,全數一致。
//
// 注意:呼叫端的 Terminal 必須以 `allowProposedApi: true` 建構(unicode API 是
// proposed),且要在 term.open() / 第一次 write 前呼叫本函式讓寬度表先生效。

import type { Terminal } from "@xterm/xterm";
import { UnicodeGraphemesAddon } from "@xterm/addon-unicode-graphemes";

export function installUnicodeWidths(term: Terminal): void {
  term.loadAddon(new UnicodeGraphemesAddon());
  // addon 會註冊最新的 provider(目前 '15-graphemes');取最後一個避免寫死 id。
  const versions = term.unicode.versions;
  term.unicode.activeVersion = versions[versions.length - 1];
}
