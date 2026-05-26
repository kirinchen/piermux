import type { MouseEvent } from "react";
import { toast } from "sonner";
import {
  useSessions,
  useKillSession,
  useRenameSession,
  useNewSession,
} from "@/hooks/useSessions";
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
  const newSession = useNewSession();

  const handleRefresh = async () => {
    try {
      await Promise.all([refetch(), refreshHost.mutateAsync(hostId)]);
    } catch (err) {
      toast.error(`refresh 失敗:${String(err)}`);
    }
  };

  const handleNew = async () => {
    const input = window.prompt("新 tmux session 名稱:", "");
    if (input == null) return;
    const name = input.trim();
    if (name === "") return;
    try {
      await newSession.mutateAsync({ hostId, sessionName: name });
      toast.success(`已建立 session:${name}`);
    } catch (err) {
      toast.error(`新增 session 失敗:${String(err)}`);
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-zinc-950 text-zinc-100 pt-safe pb-safe">
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
          onClick={handleNew}
          disabled={newSession.isPending}
          className="rounded-md bg-zinc-800 px-3 py-2 text-base font-semibold active:bg-zinc-700 disabled:opacity-50"
          aria-label="new tmux session"
          title="新增 tmux session"
        >
          {newSession.isPending ? "…" : "+"}
        </button>
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
              hostId={hostId}
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
  hostId,
  session,
  onSelect,
}: {
  hostId: string;
  session: Session;
  onSelect: () => void;
}) {
  const kill = useKillSession();
  const rename = useRenameSession();

  const handleRename = async (e: MouseEvent) => {
    e.stopPropagation();
    const input = window.prompt(`重新命名 '${session.name}' 為:`, session.name);
    if (input == null) return;
    const next = input.trim();
    if (next === "" || next === session.name) return;
    try {
      await rename.mutateAsync({ hostId, sessionName: session.name, newName: next });
      toast.success(`已重新命名:${session.name} → ${next}`);
    } catch (err) {
      toast.error(`rename 失敗:${String(err)}`);
    }
  };

  const handleKill = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`確定要 kill session '${session.name}'?`)) return;
    try {
      await kill.mutateAsync({ hostId, sessionName: session.name });
      toast.success(`已 kill:${session.name}`);
    } catch (err) {
      toast.error(`kill 失敗:${String(err)}`);
    }
  };

  return (
    <li className="flex items-stretch gap-2 rounded-lg border border-zinc-800 bg-zinc-900 active:bg-zinc-800">
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 items-center gap-3 px-4 py-4 text-left"
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
      <button
        type="button"
        onClick={handleRename}
        disabled={rename.isPending}
        className="px-3 text-base text-zinc-300 active:bg-zinc-700 disabled:opacity-50"
        title="重新命名"
        aria-label="rename"
      >
        ✏
      </button>
      <button
        type="button"
        onClick={handleKill}
        disabled={kill.isPending}
        className="px-3 text-base text-red-400 active:bg-zinc-700 disabled:opacity-50"
        title="Kill session"
        aria-label="kill"
      >
        🗑
      </button>
    </li>
  );
}
