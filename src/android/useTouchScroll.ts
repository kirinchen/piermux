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
// 一次 touchmove 最多合成幾顆 wheel 事件(快甩防爆量)
const MAX_WHEEL_PER_MOVE = 60;

// D-38:inner app 自己開 mouse tracking(claude code / vim / less、tmux `mouse on`)
// 時,拖曳改合成 wheel 事件丟回 xterm —— xterm 會用「app 協商好的編碼」(SGR 等)
// 轉成 mouse report 走 onData → PTY → app 自己捲,等同 desktop D-33 放行滾輪。
// 一行一顆 event(對齊實體滾輪一格),方向:手指往下 = 看歷史 = wheel up = deltaY 負。
function dispatchSyntheticWheel(el: HTMLElement, lines: number): void {
  const target = el.querySelector<HTMLElement>(".xterm-screen") ?? el;
  const rect = target.getBoundingClientRect();
  const opts: WheelEventInit = {
    bubbles: true,
    cancelable: true,
    deltaMode: 0, // pixel
    deltaY: lines > 0 ? -40 : 40,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
  const n = Math.min(Math.abs(lines), MAX_WHEEL_PER_MOVE);
  for (let i = 0; i < n; i++) {
    target.dispatchEvent(new WheelEvent("wheel", opts));
  }
}

/**
 * 手指拖曳捲動終端(D-26)。
 *
 * 為什麼需要:xterm 的 `.xterm-screen`(canvas)疊在 `.xterm-viewport` 之上,
 * 觸控落在 screen 不會觸發 viewport 的原生捲動,而 xterm 本身只把「滾輪」轉成
 * 捲動、不處理 touch-drag → 行動端拖不動畫面。這個 hook 把垂直拖曳換算成行數:
 *   - normal buffer:`term.scrollLines()` 捲自己的 scrollback(1:1 跟手)
 *   - alt-screen + app 開 mouse tracking(claude/vim):合成 wheel → app 自己捲(D-38)
 *   - alt-screen 其餘(純 shell):走 `onAltScreenScroll` → tmux copy-mode(對齊 desktop)
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
    let disposed = false; // cleanup 後阻止 in-flight 的 .finally 再 flush(對齊 desktop)
    const flushAlt = () => {
      if (disposed) return;
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
      const alt = term.buffer.active.type === "alternate";
      // D-38:app 有開 mouse tracking → 拖曳交給 app 自己捲(copy-mode 進不去:
      // app 內容在 tmux 層沒 scrollback,只會 [0/0] 卡死 —— owner 回報 phone.png)
      const mouseApp = alt && term.modes.mouseTrackingMode !== "none";
      // alt-screen 但沒有捲動目標(尚未 attach)→ 不攔,讓給瀏覽器 / xterm,
      // 對齊 desktop SessionPanel 的 `return true`。alt buffer 本來也沒 scrollback。
      if (alt && !mouseApp && !altCbRef.current) return;
      engaged = true;
      // 吞掉預設(原生捲動 / 選字 / 後續 click)— 需 passive:false 才能 preventDefault
      e.preventDefault();
      accumPx += dy;
      const lines = Math.trunc(accumPx / cellH);
      if (lines === 0) return;
      accumPx -= lines * cellH;
      if (mouseApp) {
        dispatchSyntheticWheel(el, lines);
      } else if (alt) {
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

    // touch-action:none → 瀏覽器不在 TAP_SLOP 視窗(前 6px、還沒 preventDefault)
    // 內把垂直手勢 latch 成原生 viewport 捲動。否則一旦 latch,後續 touchmove 變
    // cancelable=false、preventDefault 變 no-op,原生捲動會跟 term.scrollLines
    // 雙重作用 → 加倍 / 跳動(審查 D-26 high finding)。tap-to-focus 不受影響。
    const prevTouchAction = el.style.touchAction;
    el.style.touchAction = "none";

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      disposed = true;
      pendingLines = 0;
      el.style.touchAction = prevTouchAction;
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [containerRef, xtermRef]);
}
