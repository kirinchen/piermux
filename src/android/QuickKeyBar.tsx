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
      <div className="flex gap-1 overflow-x-auto px-2 py-2">
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
