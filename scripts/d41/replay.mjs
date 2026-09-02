// D-41 flight recorder 離線重放:node replay.mjs <dump.json> [--trace <row>]
// 1) 驗證重放 grid == dump 當下的 xterm grid(確定 bug 可離線重現)
// 2) --trace <row>:每個 chunk 後印該 row 內容,找它第一次「長歪」的 chunk index
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { Terminal } = require("@xterm/headless");
const { UnicodeGraphemesAddon } = require(
  "@xterm/addon-unicode-graphemes/lib/addon-unicode-graphemes.js"
);

const dumpPath = process.argv[2];
const traceIdx = process.argv.indexOf("--trace");
const traceRow = traceIdx > 0 ? Number(process.argv[traceIdx + 1]) : null;
const dump = JSON.parse(fs.readFileSync(dumpPath, "utf8"));

const first = dump.chunks[0];
const [cols0, rows0] = "r" in first ? first.r : [dump.cols, dump.rows];
const term = new Terminal({
  cols: cols0,
  rows: rows0,
  allowProposedApi: true,
  scrollback: 5000,
});
term.loadAddon(new UnicodeGraphemesAddon());
term.unicode.activeVersion =
  term.unicode.versions[term.unicode.versions.length - 1];

const w = (s) => new Promise((r) => term.write(s, r));

function screenRows(t) {
  const buf = t.buffer.active;
  const out = [];
  for (let i = 0; i < t.rows; i++) {
    const line = buf.getLine(buf.baseY + i);
    out.push(line ? line.translateToString(true).trimEnd() : "");
  }
  return out;
}

let lastTraced = null;
for (let i = 0; i < dump.chunks.length; i++) {
  const c = dump.chunks[i];
  if ("r" in c) {
    term.resize(c.r[0], c.r[1]);
  } else {
    await w(c.d);
  }
  if (traceRow !== null) {
    const row = screenRows(term)[traceRow] ?? "";
    if (row !== lastTraced) {
      console.log(`chunk ${i}: row${traceRow} = ${JSON.stringify(row)}`);
      lastTraced = row;
    }
  }
}

const replayed = screenRows(term);
const want = dump.xtermRows;
let mismatch = 0;
for (let i = 0; i < Math.max(replayed.length, want.length); i++) {
  if ((replayed[i] ?? "") !== (want[i] ?? "")) {
    mismatch++;
    console.log(`REPLAY≠LIVE row ${i}`);
    console.log(`  live  : ${JSON.stringify(want[i] ?? "")}`);
    console.log(`  replay: ${JSON.stringify(replayed[i] ?? "")}`);
  }
}
console.log(
  mismatch === 0
    ? `✔ 重放與 live xterm grid 完全一致(${replayed.length} 行)—— bug 可離線重現`
    : `✘ 重放與 live 有 ${mismatch} 行差異(重放不完全決定性,查 resize 時序)`,
);

// 對照 tmux
const tmuxRows = dump.tmuxScreen.replace(/\n$/, "").split("\n");
let diverge = 0;
for (let i = 0; i < Math.min(replayed.length, tmuxRows.length); i++) {
  if ((tmuxRows[i] ?? "").trimEnd() !== (replayed[i] ?? "")) diverge++;
}
console.log(`replay vs tmux:${diverge} 行不一致(live 當時 ${dump.xtermRows.length} 行制)`);
