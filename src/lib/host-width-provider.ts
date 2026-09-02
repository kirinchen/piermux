// D-41 b+:自訂 xterm IUnicodeVersionProvider —— cluster / joining 行為沿用
// @xterm/addon-unicode-graphemes 的 provider,「寬度」用探針量到的該 host tmux
// 實際字寬覆蓋(見 width-profile.ts)。tmux 版本 / glibc wcwidth 不同,同一個
// emoji 兩邊寬度就不同,tmux 增量重繪的絕對定位會錯位 → 行頭殘字(NOTES D-41)。
//
// charProperties 位元格式抄自 @xterm/xterm src/common/services/UnicodeService.ts
// (MIT License, Copyright (c) 2017-2022 The xterm.js authors):
//   bit0 = shouldJoin、bit1-2 = width、bit3+ = charKind
// 版本鎖 @xterm/xterm 6.0.0 —— 升版要重驗這個格式。
//
// 已知縫隙(NOTES 記帳):ZWJ / 膚色 cluster 的整體寬用 graphemes 預設(host 舊
// tmux 可能算 1),CLI 輸出裡罕見,先不蓋。VS16 加寬與否用探針多數決。

import type { Terminal } from "@xterm/xterm";
import { UnicodeGraphemesAddon } from "@xterm/addon-unicode-graphemes";

interface ProviderLike {
  version: string;
  wcwidth(codepoint: number): 0 | 1 | 2;
  charProperties(codepoint: number, preceding: number): number;
}

/// 借 graphemes addon 的 activate 拿它的 provider 實例(addon 沒 export class,
/// 用假 terminal 收 unicode.register —— D-41 Phase 0 已驗證此路可行)。
function captureGraphemesProvider(): ProviderLike {
  const addon = new UnicodeGraphemesAddon();
  let captured: ProviderLike | null = null;
  const fake = {
    unicode: {
      register(p: ProviderLike) {
        captured = p;
      },
    },
  };
  addon.activate(fake as unknown as Terminal);
  if (!captured) throw new Error("graphemes provider 捕捉失敗");
  return captured;
}

/// widths:探針結果(char → tmux 認定寬度)。單 codepoint 進覆蓋表;
/// `X️` 對照其 bare 寬度投票決定「host 的 VS16 會不會加寬」。
/// 回傳註冊好的 provider version 字串(呼叫端自行設 activeVersion)。
export function buildHostProvider(
  term: Terminal,
  hostId: string,
  widths: Record<string, number>,
): string {
  const base = captureGraphemesProvider();
  const table = new Map<number, number>();
  let vs16Widen = 0;
  let vs16Keep = 0;
  for (const [ch, w] of Object.entries(widths)) {
    const cps = [...ch].map((c) => c.codePointAt(0) ?? 0);
    if (cps.length === 1 && w >= 0 && w <= 2) {
      table.set(cps[0], w);
    } else if (cps.length === 2 && cps[1] === 0xfe0f) {
      const bare = widths[String.fromCodePoint(cps[0])];
      if (bare !== undefined) {
        if (w > bare) vs16Widen++;
        else vs16Keep++;
      }
    }
  }
  const vs16Widens = vs16Widen > vs16Keep;

  const version = `host-${hostId.slice(0, 8)}`;
  const provider: ProviderLike = {
    version,
    wcwidth(cp: number): 0 | 1 | 2 {
      const o = table.get(cp);
      return (o !== undefined ? o : base.wcwidth(cp)) as 0 | 1 | 2;
    },
    charProperties(cp: number, preceding: number): number {
      const v = base.charProperties(cp, preceding);
      const join = (v & 1) !== 0;
      let width = (v >> 1) & 3;
      const kind = v >>> 3;
      if (!join) {
        const o = table.get(cp);
        if (o !== undefined) width = o;
      } else if (cp === 0xfe0f && !vs16Widens) {
        // host 的 VS16 不加寬:cluster 寬維持前字寬(join 時 xterm 會以
        // 「current 寬 - preceding 寬」計增量,相等 → 增量 0)
        width = (preceding >> 1) & 3;
      }
      return ((kind & 0xffffff) << 3) | ((width & 3) << 1) | (join ? 1 : 0);
    },
  };
  term.unicode.register(provider as Parameters<Terminal["unicode"]["register"]>[0]);
  return version;
}
