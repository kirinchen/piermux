import { useHostsList } from "@/hooks/useHosts";
import type { Host } from "@/lib/types";

type Props = {
  onSelectHost: (hostId: string) => void;
};

export function HostListScreen({ onSelectHost }: Props) {
  const { data: hosts, isLoading, error } = useHostsList();

  return (
    <div className="flex h-dvh flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h1 className="text-lg font-semibold">piermux</h1>
        <button
          type="button"
          className="rounded-md bg-zinc-800 px-3 py-2 text-sm font-medium active:bg-zinc-700"
          disabled
        >
          + Host
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-3">
        {isLoading && (
          <p className="px-2 py-4 text-sm text-zinc-400">Loading hosts…</p>
        )}
        {error && (
          <p className="px-2 py-4 text-sm text-red-400">
            {(error as Error).message}
          </p>
        )}
        {hosts && hosts.length === 0 && (
          <p className="px-2 py-4 text-sm text-zinc-400">
            還沒加 host。Desktop 上加完會同步到這裡。
          </p>
        )}
        <ul className="space-y-2">
          {hosts?.map((h) => (
            <HostCard key={h.id} host={h} onSelect={() => onSelectHost(h.id)} />
          ))}
        </ul>
      </main>
    </div>
  );
}

function HostCard({ host, onSelect }: { host: Host; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4 text-left active:bg-zinc-800"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-base font-medium">
            {host.display_name}
          </span>
          <span className="block truncate text-xs text-zinc-400">
            {host.ssh_user}@{host.ssh_host}:{host.ssh_port}
          </span>
        </span>
        <span className="text-zinc-500">›</span>
      </button>
    </li>
  );
}
