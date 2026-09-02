// D-41 蒐證:xterm buffer vs tmux capture-pane 可見畫面逐行 diff。
//
// 用途:殘字出現、owner 按 F5 的瞬間,分辨殘字到底在哪一層 ——
// - diff 非空 → 殘字真的在 xterm 的 grid 裡(tmux↔xterm grid 分岔),
//   而且直接看到分岔的行 / 欄(給 D-41 H2 驗證用的實彈證據)
// - diff 為空但畫面看得到殘字 → 殘字不在 buffer,是 renderer 層殘像,
//   修法走 term.refresh / renderer,跟 tmux 完全無關
//
// 比對範圍:live screen(xterm baseY 起的 rows 行)vs capture-pane 可見畫面。
// 兩邊都 trimEnd(capture-pane 預設吃掉行尾空白;tmux 也可能吃掉畫面底部的
// 空白行,所以 tmux 行數不足的部分視為空行)。

import type { Terminal } from "@xterm/xterm";

export interface GridDiffRow {
  row: number; // 0-based screen row
  tmux: string;
  xterm: string;
  firstDiffCol: number;
}

export interface GridDiffReport {
  rows: GridDiffRow[];
  comparedRows: number;
}

/// live screen 逐行快照(不受使用者 viewport 捲動影響;alt buffer 時 baseY=0)。
export function snapshotScreenRows(term: Terminal): string[] {
  const buf = term.buffer.active;
  const out: string[] = [];
  for (let i = 0; i < term.rows; i++) {
    const line = buf.getLine(buf.baseY + i);
    out.push(line ? line.translateToString(true).trimEnd() : "");
  }
  return out;
}

export function diffGrids(
  xtermRows: string[],
  tmuxContent: string,
): GridDiffReport {
  // capture-pane 輸出行數 ≤ 螢幕行數(tmux 有 status line 時 pane 高 = rows-1;
  // 底部空白行也可能被截掉)→ 只比 xterm 行數內的範圍,tmux 缺的行補空字串。
  const tmuxRows = tmuxContent.replace(/\n$/, "").split("\n");
  const n = Math.min(xtermRows.length, Math.max(tmuxRows.length, 0));
  const rows: GridDiffRow[] = [];
  for (let i = 0; i < n; i++) {
    const t = (tmuxRows[i] ?? "").trimEnd();
    const x = (xtermRows[i] ?? "").trimEnd();
    if (t === x) continue;
    let col = 0;
    const max = Math.max(t.length, x.length);
    while (col < max && t[col] === x[col]) col++;
    rows.push({ row: i, tmux: t, xterm: x, firstDiffCol: col });
  }
  return { rows, comparedRows: n };
}

export function formatGridDiff(report: GridDiffReport): string {
  const lines = [
    `[D-41] grid diff:${report.rows.length} / ${report.comparedRows} 行不一致`,
  ];
  for (const r of report.rows) {
    lines.push(`row ${r.row}(第 ${r.firstDiffCol} 欄起分岔)`);
    lines.push(`  tmux : ${JSON.stringify(r.tmux)}`);
    lines.push(`  xterm: ${JSON.stringify(r.xterm)}`);
  }
  return lines.join("\n");
}
