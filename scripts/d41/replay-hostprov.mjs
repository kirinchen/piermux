// D-41 b+ 驗證:用 host-width-provider 同款演算法 + 證據推出的 host 表重放 dump
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { Terminal } = require("@xterm/headless");
const { UnicodeGraphemesAddon } = require(
  "@xterm/addon-unicode-graphemes/lib/addon-unicode-graphemes.js"
);

const HOST_WIDTHS = {
  A: 1, "中": 2,
  "⚠": 1, "⚠️": 1, "✔": 1, "✔️": 1,
  "🎨": 1, "🔁": 1, "💰": 1, "💩": 1, "😀": 1,
  "✅": 2,
};

function captureGraphemesProvider() {
  const addon = new UnicodeGraphemesAddon();
  let captured = null;
  addon.activate({ unicode: { register(p) { captured = p; } } });
  return captured;
}

// == buildHostProvider 的演算法(與 src/lib/host-width-provider.ts 同步)==
function buildProvider(widths) {
  const base = captureGraphemesProvider();
  const table = new Map();
  let vs16Widen = 0, vs16Keep = 0;
  for (const [ch, w] of Object.entries(widths)) {
    const cps = [...ch].map((c) => c.codePointAt(0));
    if (cps.length === 1 && w >= 0 && w <= 2) table.set(cps[0], w);
    else if (cps.length === 2 && cps[1] === 0xfe0f) {
      const bare = widths[String.fromCodePoint(cps[0])];
      if (bare !== undefined) (w > bare ? vs16Widen++ : vs16Keep++);
    }
  }
  const vs16Widens = vs16Widen > vs16Keep;
  return {
    version: "host-test",
    wcwidth(cp) { const o = table.get(cp); return o !== undefined ? o : base.wcwidth(cp); },
    charProperties(cp, preceding) {
      const v = base.charProperties(cp, preceding);
      const join = (v & 1) !== 0;
      let width = (v >> 1) & 3;
      const kind = v >>> 3;
      if (!join) {
        const o = table.get(cp);
        if (o !== undefined) width = o;
      } else if (cp === 0xfe0f && !vs16Widens) {
        width = (preceding >> 1) & 3;
      }
      return ((kind & 0xffffff) << 3) | ((width & 3) << 1) | (join ? 1 : 0);
    },
  };
}

const dump = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const first = dump.chunks[0];
const [c0, r0] = "r" in first ? first.r : [dump.cols, dump.rows];
const term = new Terminal({ cols: c0, rows: r0, allowProposedApi: true, scrollback: 5000 });
term.loadAddon(new UnicodeGraphemesAddon());
term.unicode.register(buildProvider(HOST_WIDTHS));
term.unicode.activeVersion = "host-test";

const w = (s) => new Promise((r) => term.write(s, r));
for (const c of dump.chunks) {
  if ("r" in c) term.resize(c.r[0], c.r[1]);
  else await w(c.d);
}
const rows = [];
const buf = term.buffer.active;
for (let i = 0; i < term.rows; i++) {
  const line = buf.getLine(buf.baseY + i);
  rows.push(line ? line.translateToString(true).trimEnd() : "");
}
const tmuxRows = dump.tmuxScreen.replace(/\n$/, "").split("\n");
let diverge = 0;
for (let i = 0; i < Math.min(rows.length, tmuxRows.length); i++) {
  if ((tmuxRows[i] ?? "").trimEnd() !== (rows[i] ?? "")) {
    diverge++;
    console.log(`row ${i}`);
    console.log(`  tmux : ${JSON.stringify(tmuxRows[i].trimEnd())}`);
    console.log(`  host+: ${JSON.stringify(rows[i])}`);
  }
}
console.log(`host-provider replay vs tmux:${diverge} 行不一致`);
