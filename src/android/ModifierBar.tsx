// Attach-mode 的 modifier bar(M2d + D-22 2-row grid)。
// 跟 capture-mode 的 QuickKeyBar 視覺類似,但 payload 是 raw bytes 走
// writeToSession(走 PTY 不走 tmux send-keys)。
//
// 2-row 9-col layout:
//   R1: ESC  /   |   -   HOME ↑   END  PGUP FN
//   R2: TAB CTRL ALT  ←  ↓   →   PGDN _   🎹
// (R2 col 8 留空保持 🎹 跟 FN 對齊)
//
// Sticky 設計:CTRL / ALT 點亮後,xterm keydown 上下一個 a-zA-Z 字元被
// wrap 成對應 raw byte(CTRL: 0x01..0x1a;ALT: \x1b<letter>;兩個都亮:
// \x1b 前綴 + ctrl-byte)送完自動 deactivate。FN 先佔位 onClick 不做事
// (only console.warn),button state 不參與 sticky。
//
// 🎹 鍵盤 icon 收合整條 bar(剩浮動小 icon 在角落)。

import { Keyboard } from "lucide-react";

type Key = {
  label: string;
  bytes: string;
};

// R1 (col 1-9)
const ROW1: Key[] = [
  { label: "ESC", bytes: "\x1b" },
  { label: "/", bytes: "/" },
  { label: "|", bytes: "|" },
  { label: "-", bytes: "-" },
  { label: "HOME", bytes: "\x1b[H" },
  { label: "↑", bytes: "\x1b[A" },
  { label: "END", bytes: "\x1b[F" },
  { label: "PGUP", bytes: "\x1b[5~" },
];
// R2 col 1, 4-7(CTRL/ALT 在 col 2-3 / FN 在 R1 col 9 / 🎹 在 R2 col 9
// 都是 sticky / toggle 自己 render,不走 KEYS map)
const ROW2: Key[] = [
  { label: "TAB", bytes: "\t" },
  { label: "←", bytes: "\x1b[D" },
  { label: "↓", bytes: "\x1b[B" },
  { label: "→", bytes: "\x1b[C" },
  { label: "PGDN", bytes: "\x1b[6~" },
];

type Props = {
  disabled?: boolean;
  ctrlActive: boolean;
  altActive: boolean;
  collapsed: boolean;
  onToggleCtrl: () => void;
  onToggleAlt: () => void;
  onToggleCollapsed: () => void;
  onSendBytes: (bytes: string) => void;
};

const PLAIN_BTN =
  "flex-1 min-w-0 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-2 text-sm font-mono text-zinc-100 active:bg-zinc-700 disabled:opacity-50";

function stickyClass(active: boolean) {
  return (
    "flex-1 min-w-0 rounded-md border px-2 py-2 text-sm font-mono font-semibold disabled:opacity-50 " +
    (active
      ? "border-blue-500 bg-blue-600 text-white"
      : "border-zinc-700 bg-zinc-800 text-zinc-100 active:bg-zinc-700")
  );
}

export function ModifierBar({
  disabled,
  ctrlActive,
  altActive,
  collapsed,
  onToggleCtrl,
  onToggleAlt,
  onToggleCollapsed,
  onSendBytes,
}: Props) {
  if (collapsed) {
    return (
      // D-25:onMouseDown.preventDefault → 點 bar 不搶 xterm helper textarea 焦點,
      // 軟鍵盤保持開著(CTRL/ALT sticky 也才接得到下一個實體按鍵)。
      <div
        className="flex justify-end border-t border-zinc-800 bg-zinc-900 px-2 py-1"
        onMouseDown={(e) => e.preventDefault()}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="展開 modifier bar"
          title="展開 modifier bar"
          className="rounded-md border border-zinc-700 bg-zinc-800 p-2 text-zinc-100 active:bg-zinc-700"
        >
          <Keyboard size={18} />
        </button>
      </div>
    );
  }

  return (
    // D-25:同上 — 整條 bar 攔 mousedown 保焦點,軟鍵盤不收。
    <div
      className="border-t border-zinc-800 bg-zinc-900 px-2 py-2"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Row 1 */}
      <div className="mb-1 flex gap-1">
        {ROW1.map((k) => (
          <button
            key={k.label}
            type="button"
            disabled={disabled}
            onClick={() => onSendBytes(k.bytes)}
            className={PLAIN_BTN}
          >
            {k.label}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => console.warn("[ModifierBar] FN 暫未實作")}
          className={PLAIN_BTN}
          title="FN — 暫未實作"
        >
          FN
        </button>
      </div>
      {/* Row 2 */}
      <div className="flex gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSendBytes(ROW2[0].bytes)}
          className={PLAIN_BTN}
        >
          {ROW2[0].label}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onToggleCtrl}
          aria-pressed={ctrlActive}
          className={stickyClass(ctrlActive)}
          title="按下後下一個輸入字元送 Ctrl+letter,再按一次取消"
        >
          CTRL
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onToggleAlt}
          aria-pressed={altActive}
          className={stickyClass(altActive)}
          title="按下後下一個輸入字元送 Alt(ESC 前綴)+letter,再按一次取消"
        >
          ALT
        </button>
        {ROW2.slice(1).map((k) => (
          <button
            key={k.label}
            type="button"
            disabled={disabled}
            onClick={() => onSendBytes(k.bytes)}
            className={PLAIN_BTN}
          >
            {k.label}
          </button>
        ))}
        {/* col 8 空白 — 跟 FN/🎹 對齊 */}
        <div className="flex-1 min-w-0" aria-hidden />
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="收合 modifier bar"
          title="收合 modifier bar"
          className="flex-1 min-w-0 flex items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 px-2 py-2 text-zinc-100 active:bg-zinc-700"
        >
          <Keyboard size={18} />
        </button>
      </div>
    </div>
  );
}
