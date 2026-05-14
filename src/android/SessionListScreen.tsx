import { toast } from "sonner";
import { useSessions } from "@/hooks/useSessions";
import { useHostsList } from "@/hooks/useHosts";
import { useRefreshHost } from "@/hooks/useCapture";
import type { Session } from "@/lib/types";
import type { AndroidTarget } from "./AndroidApp";

type Props = {
  hostId: string;
  onBack: () => void;
  onSelectTarget: (target: AndroidTarget) => void;
};

export function SessionListScreen({ hostId, onBack, onSelectTarget }: Props) {
  const { data: hosts } = useHostsList();
  const host = hosts?.find((h) => h.id === hostId);
  const { data: sessions, isLoading, error, refetch, isFetching } =
    useSessions(hostId);
  const refreshHost = useRefreshHost();

  const handleRefresh = async () => {
    try {
      await Promise.all([refetch(), refreshHost.mutateAsync(hostId)]);
    } catch (err) {
      toast.error(`refresh 失敗:${String(err)}`);
    }
  };

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
        <div className="flex-1 min-w-0">
          <div className="truncate text-base font-semibold">
            {host?.display_name ?? hostId}
          </div>
          {host && (
            <div className="truncate text-xs text-zinc-400">
              {host.ssh_user}@{host.ssh_host}:{host.ssh_port}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isFetching || refreshHost.isPending}
          className="rounded-md bg-zinc-800 px-3 py-2 text-sm active:bg-zinc-700 disabled:opacity-50"
        >
          {isFetching || refreshHost.isPending ? "…" : "⟳"}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-3">
        <ShellRow onSelect={() => onSelectTarget({ kind: "shell" })} />
        {isLoading && (
          <p className="px-2 py-4 text-sm text-zinc-400">Loading sessions…</p>
        )}
        {error && (
          <p className="px-2 py-4 text-sm text-red-400">
            {(error as Error).message}
          </p>
        )}
        {sessions && sessions.length === 0 && !isLoading && (
          <p className="px-2 py-4 text-sm text-zinc-400">
            這台 host 還沒有 tmux session
          </p>
        )}
        <ul className="space-y-2">
          {sessions?.map((s) => (
            <SessionRow
              key={s.name}
              session={s}
              onSelect={() =>
                onSelectTarget({ kind: "tmux", session: s.name })
              }
            />
          ))}
        </ul>
      </main>
    </div>
  );
}

function ShellRow({ onSelect }: { onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="mb-2 flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4 text-left active:bg-zinc-800"
    >
      <span className="text-xl">⚡</span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-medium">shell</span>
        <span className="block truncate text-xs text-zinc-400">
          直連 login shell(不過 tmux)
        </span>
      </span>
      <span className="text-zinc-500">›</span>
    </button>
  );
}

function SessionRow({
  session,
  onSelect,
}: {
  session: Session;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4 text-left active:bg-zinc-800"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-base font-medium">{session.name}</span>
          <span className="block truncate text-xs text-zinc-400">
            {session.windows} window{session.windows === 1 ? "" : "s"}
            {session.attached && " · attached"}
          </span>
        </span>
        <span className="text-zinc-500">›</span>
      </button>
    </li>
  );
}
