// JuiceSSH 風格的單列快捷鍵 bar(M2c)。
// payload 走 tmux send-keys:
//   literal=false → named key(Tab / Escape / C-c / Up …)
//   literal=true  → 字面字元(/ - | < > ~ `)
// 暫不做 Ctrl sticky modifier(M2d 真 attach 才需要)。

type QuickKey = {
  label: string;
  payload: string;
  literal: boolean;
};

const KEYS: QuickKey[] = [
  { label: "TAB", payload: "Tab", literal: false },
  { label: "ESC", payload: "Escape", literal: false },
  { label: "^C", payload: "C-c", literal: false },
  { label: "^D", payload: "C-d", literal: false },
  { label: "^L", payload: "C-l", literal: false },
  { label: "^Z", payload: "C-z", literal: false },
  { label: "↑", payload: "Up", literal: false },
  { label: "↓", payload: "Down", literal: false },
  { label: "←", payload: "Left", literal: false },
  { label: "→", payload: "Right", literal: false },
  // Claude 選單「選好按 Enter 確認」常用 — tmux send-keys Enter
  { label: "⏎", payload: "Enter", literal: false },
  { label: "/", payload: "/", literal: true },
  { label: "-", payload: "-", literal: true },
  { label: "|", payload: "|", literal: true },
  { label: "~", payload: "~", literal: true },
  { label: "`", payload: "`", literal: true },
  { label: "<", payload: "<", literal: true },
  { label: ">", payload: ">", literal: true },
  { label: "[", payload: "[", literal: true },
  { label: "]", payload: "]", literal: true },
];

type Props = {
  disabled?: boolean;
  onSendKey: (payload: string, literal: boolean) => void;
};

export function QuickKeyBar({ disabled, onSendKey }: Props) {
  return (
    <div className="border-t border-zinc-800 bg-zinc-900">
      {/* D-25:容器層攔 mousedown.preventDefault → 按快速鍵不搶走 input 焦點,
          軟鍵盤不會被收起來。click 照常觸發、:active 樣式 / 橫滾不受影響。 */}
      <div
        className="flex gap-1 overflow-x-auto px-2 py-2"
        onMouseDown={(e) => e.preventDefault()}
      >
        {KEYS.map((k) => (
          <button
            key={k.label}
            type="button"
            disabled={disabled}
            onClick={() => onSendKey(k.payload, k.literal)}
            className="min-w-[44px] shrink-0 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-mono text-zinc-100 active:bg-zinc-700 disabled:opacity-50"
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
