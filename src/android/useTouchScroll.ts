import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { Terminal as XTerm } from "@xterm/xterm";

type Opts = {
  containerRef: RefObject<HTMLDivElement | null>;
  xtermRef: RefObject<XTerm | null>;
  /**
   * attach alt-screen(tmux 全螢幕)時改走 tmux copy-mode,對齊 desktop 滾輪
   * (NOTES D-24)。capture / normal buffer 不需要,不傳即可。回傳 Promise 讓
   * hook 做「最多一個在途 + 一個排隊」節流(對齊 desktop SessionPanel)。
   */
  onAltScreenScroll?: (up: boolean, lines: number) => Promise<void> | void;
};

// px:單指位移小於此值視為 tap(保留點擊聚焦/按鈕),不攔成捲動
const TAP_SLOP = 6;
// 一次 scroll_session 最多捲幾行(對齊 desktop)
const MAX_LINES_PER_FLUSH = 500;

/**
 * 手指拖曳捲動終端(D-26)。
 *
 * 為什麼需要:xterm 的 `.xterm-screen`(canvas)疊在 `.xterm-viewport` 之上,
 * 觸控落在 screen 不會觸發 viewport 的原生捲動,而 xterm 本身只把「滾輪」轉成
 * 捲動、不處理 touch-drag → 行動端拖不動畫面。這個 hook 把垂直拖曳換算成行數:
 *   - normal buffer:`term.scrollLines()` 捲自己的 scrollback(1:1 跟手)
 *   - alt-screen(tmux 全螢幕):走 `onAltScreenScroll` → tmux copy-mode(對齊 desktop)
 *
 * 方向:手指往下拖 = 內容跟著往下 = 看更早的歷史
 *   - normal:往 scrollback 頂端捲(`scrollLines` 負向)
 *   - alt:copy-mode scroll-up(`up=true`)
 */
export function useTouchScroll({
  containerRef,
  xtermRef,
  onAltScreenScroll,
}: Opts) {
  // 最新 callback 收進 ref,listener 只綁一次、不必進 deps
  const altCbRef = useRef(onAltScreenScroll);
  useEffect(() => {
    altCbRef.current = onAltScreenScroll;
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let active = false; // 單指觸控進行中
    let engaged = false; // 已越過 tap 容差、開始當捲動處理
    let startY = 0;
    let lastY = 0;
    let cellH = 18; // 每行像素(touchstart 時量)
    let accumPx = 0; // 未滿一行的像素累積

    // alt-screen 節流(對齊 desktop SessionPanel 的 inflight/pending)
    let inflight = false;
    let pendingLines = 0; // signed,+ = 看歷史(up)
    const flushAlt = () => {
      const cb = altCbRef.current;
      if (!cb || pendingLines === 0) {
        pendingLines = 0;
        return;
      }
      const p = pendingLines;
      pendingLines = 0;
      inflight = true;
      Promise.resolve(cb(p > 0, Math.min(Math.abs(p), MAX_LINES_PER_FLUSH)))
        .catch(() => {})
        .finally(() => {
          inflight = false;
          if (pendingLines !== 0) flushAlt();
        });
    };

    const rowPx = (term: XTerm) => {
      const vp = el.querySelector<HTMLElement>(".xterm-viewport");
      const h = vp?.clientHeight || el.clientHeight || 0;
      const rows = term.rows || 0;
      return h > 0 && rows > 0 ? h / rows : 18;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        active = false;
        return;
      }
      const term = xtermRef.current;
      if (!term) return;
      active = true;
      engaged = false;
      startY = lastY = e.touches[0].clientY;
      cellH = rowPx(term);
      accumPx = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!active || e.touches.length !== 1) return;
      const term = xtermRef.current;
      if (!term) return;
      const y = e.touches[0].clientY;
      const dy = y - lastY;
      lastY = y;
      if (!engaged && Math.abs(y - startY) < TAP_SLOP) return;
      engaged = true;
      // 吞掉預設(原生捲動 / 選字 / 後續 click)— 需 passive:false 才能 preventDefault
      e.preventDefault();
      accumPx += dy;
      const lines = Math.trunc(accumPx / cellH);
      if (lines === 0) return;
      accumPx -= lines * cellH;
      if (term.buffer.active.type === "alternate") {
        // 手指往下(lines>0)= 看歷史 = up
        pendingLines += lines;
        if (!inflight) flushAlt();
      } else {
        // 手指往下 → 看更早 → 往 scrollback 頂端(負向)
        term.scrollLines(-lines);
      }
    };

    const onEnd = () => {
      active = false;
      engaged = false;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [containerRef, xtermRef]);
}
