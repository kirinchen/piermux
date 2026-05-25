// D-20 multi-line paste guard hook。
//
// 攔 xterm 的 helper textarea(`.xterm-helper-textarea`,term.open() 之後
// 由 xterm.js 注入)的 `paste` event,在 capture phase 跑 → 比 xterm 內建
// paste handler 早。多行(\n ≥ threshold)時 preventDefault +
// stopImmediatePropagation 攔下,塞給 React state；少於 threshold 行
// 不攔,xterm 直接 paste 進 PTY,保持流暢。
//
// 為什麼用 capture phase + stopImmediatePropagation:
//   xterm.js 也在同一個 helper textarea 上掛 paste listener,bubble phase
//   按註冊順序跑。我們的 listener 一定晚於 xterm 註冊,bubble 收尾時 xterm
//   已經把 text 送進 PTY 了。capture phase 一定先跑;
//   stopImmediatePropagation 阻止 xterm 同階段也跑到。

import * as React from "react";

type Options = {
  /** xterm 容器 element ref。term.open(container) 之後 helper textarea 會在這底下。 */
  containerRef: React.RefObject<HTMLElement | null>;
  /** false 時不裝 listener。通常綁 attach 完成(attachId !== null)。 */
  enabled: boolean;
  /** 通過 dialog 確認後把整段送到 PTY 的 callback。 */
  onPaste: (text: string) => void;
  /** \n 數 ≥ threshold 才攔。預設 2 = ≥3 行。 */
  threshold?: number;
};

export function usePasteGuard({
  containerRef,
  enabled,
  onPaste,
  threshold = 2,
}: Options) {
  const [pending, setPending] = React.useState<string | null>(null);

  // onPaste 用 ref 接,免得 listener 每次重綁(deps 又得列 onPaste)
  const onPasteRef = React.useRef(onPaste);
  React.useEffect(() => {
    onPasteRef.current = onPaste;
  });

  React.useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;
    const helper = container.querySelector<HTMLTextAreaElement>(
      ".xterm-helper-textarea",
    );
    if (!helper) return;

    const handler = (e: Event) => {
      const ce = e as ClipboardEvent;
      const text = ce.clipboardData?.getData("text") ?? "";
      if (!text) return;
      const newlines = (text.match(/\n/g) || []).length;
      if (newlines < threshold) return;
      ce.preventDefault();
      ce.stopImmediatePropagation();
      setPending(text);
    };
    helper.addEventListener("paste", handler, true);
    return () => helper.removeEventListener("paste", handler, true);
  }, [containerRef, enabled, threshold]);

  const confirm = React.useCallback((text: string) => {
    onPasteRef.current(text);
    setPending(null);
  }, []);
  const cancel = React.useCallback(() => setPending(null), []);

  return { pending, confirm, cancel };
}
