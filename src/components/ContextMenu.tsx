// D-51 輕量右鍵選單(不拉 radix context-menu,專案只有這一處用)。
//
// 用法:onContextMenu 時 preventDefault 並記下 (clientX, clientY),
// 渲染 <ContextMenu x y items onClose />。點選單外 / Esc / 滾動 / resize 都關。
// 位置會夾進 viewport,靠右 / 靠下點不會被切掉。

import * as React from "react";

export type ContextMenuItem = {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** 紅字(破壞性操作,例如 kill) */
  danger?: boolean;
};

type Props = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState({ left: x, top: y });

  // 量到實際大小後夾進 viewport
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - width - 4);
    const top = Math.min(y, window.innerHeight - height - 4);
    setPos({ left: Math.max(4, left), top: Math.max(4, top) });
  }, [x, y]);

  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    // mousedown 用 capture:比列上的 onClick 早,避免「點別處關選單」同時觸發別的東西
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-50 min-w-40 rounded-md border border-border bg-background p-1 text-sm text-foreground shadow-md"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent ${
            item.danger ? "text-destructive" : ""
          }`}
        >
          {item.icon && <span className="shrink-0">{item.icon}</span>}
          <span className="flex-1 truncate">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
