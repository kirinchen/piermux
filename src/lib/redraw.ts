// D-43:attach 畫面「整屏重畫」的共用入口(desktop F5 / 重繪鈕 / 自動重繪、
// Android 自動重繪都走這裡)。
//
// 主路 = `tmux refresh-client -t <我們的 tty>`:tmux 把它認定的整個 client 畫面
// 重送一次(等同 `prefix r`),xterm 每一格都被蓋過 → 任何 grid 分岔(字寬 /
// 漏畫 / 舊 frame)一律歸零。只重送 tmux 自己的畫面、不 SIGWINCH、不驚動 pane
// 裡的 app,所以不會撞輸入(D-31 教訓),也沒有 2 次 window_change 的成本。
//
// 退路 = D-34 的 resize 舞步(rows-1 → rows 兩次 SIGWINCH):shell target 沒有
// tmux、或 attach 流開頭的 tty 標記沒抓到(奇怪的 login shell)時用。

import type { Terminal } from "@xterm/xterm";
import { api } from "./tauri";

export async function redrawAttach(aid: string, term: Terminal): Promise<void> {
  try {
    await api.refreshAttach(aid);
  } catch {
    const { cols, rows } = term;
    await api.resizeSession(aid, cols, rows > 1 ? rows - 1 : rows + 1);
    await api.resizeSession(aid, cols, rows);
  }
  // 順手叫 renderer 把 buffer 全行重畫(防純 render 層殘影)
  term.refresh(0, term.rows - 1);
}
