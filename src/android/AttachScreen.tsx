import type { AndroidTarget } from "./AndroidApp";

type Props = {
  hostId: string;
  target: AndroidTarget;
  onBack: () => void;
};

// M2b 階段這裡只是 placeholder 殼。實際 attach + line buffer + modifier bar
// 是 M2d 的範圍(SPEC §8 / ISSUE-010 acceptance ⭐)。
export function AttachScreen({ target, onBack }: Props) {
  const title =
    target.kind === "shell" ? "⚡ shell" : `tmux: ${target.session}`;

  return (
    <div className="flex h-dvh flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center gap-3 border-b border-zinc-800 px-2 py-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-3 py-2 text-sm active:bg-zinc-800"
        >
          ‹ Back
        </button>
        <div className="flex-1 min-w-0 truncate text-base font-semibold">
          {title}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 text-sm text-zinc-400">
        <p className="mb-2">M2b 階段這裡只放殼。</p>
        <p>實際 attach + xterm + line buffer + modifier bar 是 M2d。</p>
      </main>
    </div>
  );
}
