import * as React from "react";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Terminal,
  RefreshCw,
  Square,
  CheckSquare,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useHostsList, useDeleteHost } from "@/hooks/useHosts";
import { useSessions, useHostStatus } from "@/hooks/useSessions";
import { useRefreshHost } from "@/hooks/useCapture";
import { api } from "@/lib/tauri";
import { relativeTime } from "@/lib/time";
import type { Host, HostConnectionStatus, Session } from "@/lib/types";

// Selection 的三種模式 + null:
// - kind:'host'      → 右側顯示 HostCaptureGrid(該 host 所有 session 的 capture grid)
// - kind:'session'   → 右側顯示 SessionPanel(單一 session 的大 capture / attach)
// - kind:'multi-host'→ 右側顯示 MultiHostCaptureGrid(多 host 並列比較)
// `null` = 沒選
export type Selection =
  | null
  | { kind: "host"; host: Host }
  | { kind: "session"; host: Host; session: Session }
  | { kind: "multi-host"; hosts: Host[] };

type Props = {
  selection: Selection;
  onSelect: (s: Selection) => void;
  onAdd: () => void;
  onEdit: (h: Host) => void;
  // 切 / 加 multi-host 比較模式 — 點 host 旁的 checkbox 進
  onToggleMulti: (host: Host) => void;
};

export function HostTree({
  selection,
  onSelect,
  onAdd,
  onEdit,
  onToggleMulti,
}: Props) {
  const { data: hosts, isLoading, error } = useHostsList();
  const del = useDeleteHost();
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (h: Host) => {
    if (!window.confirm(`確定要刪除 ${h.display_name}?`)) return;
    try {
      await del.mutateAsync(h.id);
      toast.success(`已刪除 ${h.display_name}`);
      // 刪除後若有 selection 牽涉到這個 host,清掉
      if (
        selection?.kind === "host" &&
        selection.host.id === h.id
      ) {
        onSelect(null);
      } else if (
        selection?.kind === "session" &&
        selection.host.id === h.id
      ) {
        onSelect(null);
      } else if (selection?.kind === "multi-host") {
        const next = selection.hosts.filter((x) => x.id !== h.id);
        onSelect(next.length === 0 ? null : { kind: "multi-host", hosts: next });
      }
    } catch (err) {
      toast.error(`刪除失敗:${String(err)}`);
    }
  };

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-border">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-medium">Hosts & Sessions</span>
        <Button size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          新增
        </Button>
      </div>

      <div className="flex-1 overflow-auto py-1">
        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            載入 hosts
          </div>
        )}

        {error && (
          <div className="m-2 rounded-md border border-destructive bg-destructive/10 p-2 text-xs">
            載入失敗:{String(error)}
          </div>
        )}

        {hosts && hosts.length === 0 && (
          <div className="m-3 rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            還沒有 host。按上方「新增」開始。
          </div>
        )}

        {hosts?.map((h) => (
          <HostRow
            key={h.id}
            host={h}
            expanded={expanded.has(h.id)}
            selection={selection}
            onToggle={() => toggle(h.id)}
            onSelect={onSelect}
            onEdit={() => onEdit(h)}
            onDelete={() => handleDelete(h)}
            onToggleMulti={() => onToggleMulti(h)}
          />
        ))}
      </div>
    </aside>
  );
}

function HostRow({
  host,
  expanded,
  selection,
  onToggle,
  onSelect,
  onEdit,
  onDelete,
  onToggleMulti,
}: {
  host: Host;
  expanded: boolean;
  selection: Selection;
  onToggle: () => void;
  onSelect: (s: Selection) => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleMulti: () => void;
}) {
  const status = useHostStatus(host.id);
  const sessions = useSessions(host.id, expanded);
  const refreshHost = useRefreshHost();

  const isHostSelected =
    selection?.kind === "host" && selection.host.id === host.id;
  const isInMulti =
    selection?.kind === "multi-host" &&
    selection.hosts.some((h) => h.id === host.id);

  const handleRefreshHost = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const results = await refreshHost.mutateAsync(host.id);
      toast.success(
        `${host.display_name}:已 refresh ${results.length} 個 session`,
      );
    } catch (err) {
      toast.error(`${host.display_name} refresh 失敗:${String(err)}`);
    }
  };

  // 點 host 名 = 選 host(右側顯示 capture grid),沒展開的話順便展開
  const handleSelectHost = () => {
    onSelect({ kind: "host", host });
    if (!expanded) onToggle();
  };

  return (
    <div className="px-1">
      <div
        className={`group flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted ${
          isHostSelected || isInMulti ? "bg-muted" : ""
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMulti();
          }}
          className="flex h-5 w-5 items-center justify-center rounded hover:bg-background"
          title={
            isInMulti
              ? "從 multi-host 比較中移除"
              : "加入 multi-host 比較(右側並列顯示)"
          }
          aria-label="toggle multi-host"
        >
          {isInMulti ? (
            <CheckSquare className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Square className="h-3.5 w-3.5 text-muted-foreground/40" />
          )}
        </button>

        <button
          type="button"
          onClick={onToggle}
          className="flex h-5 w-5 items-center justify-center text-muted-foreground"
          aria-label={expanded ? "collapse" : "expand"}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        <StatusIcon status={status.data ?? "connecting"} />

        <button
          type="button"
          onClick={handleSelectHost}
          className="flex-1 truncate text-left text-sm font-medium"
          title={`${host.ssh_user}@${host.ssh_host}:${host.ssh_port} — 點開看 capture grid`}
        >
          {host.display_name}
        </button>

        <div className="hidden gap-0.5 group-hover:flex">
          <button
            type="button"
            onClick={handleRefreshHost}
            disabled={refreshHost.isPending}
            className="rounded p-1 text-muted-foreground hover:bg-background disabled:opacity-50"
            title="重抓此 host 所有 session"
          >
            {refreshHost.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded p-1 text-muted-foreground hover:bg-background"
            title="編輯"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded p-1 text-muted-foreground hover:bg-background"
            title="刪除"
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="ml-6 border-l border-border pl-2">
          {sessions.isLoading && (
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              讀取 sessions
            </div>
          )}
          {sessions.error && (
            <div className="px-2 py-1 text-xs text-destructive">
              {String(sessions.error)}
            </div>
          )}
          {sessions.data?.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted-foreground italic">
              沒 session
            </div>
          )}
          {sessions.data?.map((s) => {
            const selected =
              selection?.kind === "session" &&
              selection.host.id === host.id &&
              selection.session.name === s.name;
            return (
              <SessionRow
                key={s.name}
                host={host}
                session={s}
                selected={selected}
                onSelect={() =>
                  onSelect({ kind: "session", host, session: s })
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function SessionRow({
  host,
  session,
  selected,
  onSelect,
}: {
  host: Host;
  session: Session;
  selected: boolean;
  onSelect: () => void;
}) {
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefreshSession = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshing(true);
    try {
      await api.captureSession(host.id, session.name);
    } catch (err) {
      toast.error(`${session.name} refresh 失敗:${String(err)}`);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div
      className={`group flex items-baseline gap-2 rounded-md pr-1 hover:bg-muted ${
        selected ? "bg-muted" : ""
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 items-baseline gap-2 truncate px-2 py-1 text-left text-sm"
      >
        <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{session.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {session.attached ? "attached" : "idle"} · {relativeTime(session.activity)}
        </span>
      </button>
      <button
        type="button"
        onClick={handleRefreshSession}
        disabled={refreshing}
        className="hidden rounded p-1 text-muted-foreground hover:bg-background disabled:opacity-50 group-hover:block"
        title="重抓此 session capture"
      >
        {refreshing ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

function StatusIcon({ status }: { status: HostConnectionStatus }) {
  if (status === "connected") {
    return (
      <CheckCircle2
        className="h-3.5 w-3.5 text-green-600 dark:text-green-400"
        aria-label="connected"
      />
    );
  }
  if (status === "disconnected") {
    return (
      <AlertTriangle
        className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
        aria-label="disconnected"
      />
    );
  }
  return (
    <Loader2
      className="h-3.5 w-3.5 animate-spin text-muted-foreground"
      aria-label="connecting"
    />
  );
}
