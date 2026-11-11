// 終端內容 → 純文字(D-52 Android 複製文字)。
//
// 兩個來源:
//   - xterm buffer(capture view / shell attach):`bufferToText`
//   - tmux capture-pane 原文(attach tmux:xterm alt buffer 只有一屏,歷史在 tmux):
//     `ansiToText` 去掉 escape codes
import type { Terminal as XTerm } from "@xterm/xterm";

/** 去掉每行行尾空白與結尾空行。 */
function tidy(lines: string[]): string {
  const out = lines.map((l) => l.replace(/\s+$/, ""));
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

/** 讀 xterm 目前 active buffer(含 scrollback)成純文字;軟換行接回同一行。 */
export function bufferToText(term: XTerm): string {
  const buf = term.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i);
    if (!line) continue;
    const s = line.translateToString(true);
    if (line.isWrapped && lines.length > 0) {
      lines[lines.length - 1] += s;
    } else {
      lines.push(s);
    }
  }
  return tidy(lines);
}

// CSI(含 SGR)、OSC(BEL 或 ST 結尾)、字集指定(ESC ( B 等)、其餘單字元 ESC 序列
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()*+][0-9A-Za-z]|\x1b[@-Z\\-_]/g;

/** tmux `capture-pane -e` 輸出 → 純文字。 */
export function ansiToText(s: string): string {
  return tidy(s.replace(ANSI_RE, "").replace(/\r/g, "").split("\n"));
}
