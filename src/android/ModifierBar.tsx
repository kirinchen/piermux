// Attach-mode 的 modifier bar(M2d)。
// 跟 capture-mode 的 QuickKeyBar 視覺類似,但 payload 是 raw bytes 走
// writeToSession(走 PTY 不走 tmux send-keys)。
//
// Ctrl sticky 設計:tap CTRL → 高亮,下一個 line input 上 keydown 的
// printable letter 會被 wrap 成 Ctrl+letter raw byte(0x01..0x1a),由
// parent (SessionScreen / AttachView) 在 line input 上攔。CTRL 自動 deactivate。

type Key = {
  label: string;
  bytes: string;
};

const KEYS: Key[] = [
  { label: "TAB", bytes: "\t" },
  { label: "ESC", bytes: "\x1b" },
  { label: "^C", bytes: "\x03" },
  { label: "^D", bytes: "\x04" },
  { label: "^L", bytes: "\x0c" },
  { label: "^Z", bytes: "\x1a" },
  { label: "^R", bytes: "\x12" },
  { label: "^U", bytes: "\x15" },
  { label: "↑", bytes: "\x1b[A" },
  { label: "↓", bytes: "\x1b[B" },
  { label: "←", bytes: "\x1b[D" },
  { label: "→", bytes: "\x1b[C" },
  { label: "/", bytes: "/" },
  { label: "-", bytes: "-" },
  { label: "|", bytes: "|" },
  { label: "~", bytes: "~" },
  { label: "`", bytes: "`" },
  { label: "<", bytes: "<" },
  { label: ">", bytes: ">" },
  { label: "[", bytes: "[" },
  { label: "]", bytes: "]" },
];

type Props = {
  disabled?: boolean;
  ctrlActive: boolean;
  onToggleCtrl: () => void;
  onSendBytes: (bytes: string) => void;
};

export function ModifierBar({
  disabled,
  ctrlActive,
  onToggleCtrl,
  onSendBytes,
}: Props) {
  return (
    <div className="border-t border-zinc-800 bg-zinc-900">
      <div className="flex gap-1 overflow-x-auto px-2 py-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onToggleCtrl}
          aria-pressed={ctrlActive}
          className={
            "min-w-[52px] shrink-0 rounded-md border px-3 py-2 text-sm font-mono font-semibold disabled:opacity-50 " +
            (ctrlActive
              ? "border-blue-500 bg-blue-600 text-white"
              : "border-zinc-700 bg-zinc-800 text-zinc-100 active:bg-zinc-700")
          }
          title="按下後下一個輸入字元送 Ctrl+letter,再按一次取消"
        >
          CTRL
        </button>
        {KEYS.map((k) => (
          <button
            key={k.label}
            type="button"
            disabled={disabled}
            onClick={() => onSendBytes(k.bytes)}
            className="min-w-[44px] shrink-0 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-mono text-zinc-100 active:bg-zinc-700 disabled:opacity-50"
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
