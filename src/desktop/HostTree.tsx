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
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useHostsList, useDeleteHost } from "@/hooks/useHosts";
import { useSessions, useHostStatus } from "@/hooks/useSessions";
import { relativeTime } from "@/lib/time";
import type { Host, HostConnectionStatus, Session } from "@/lib/types";

export type Selection = { host: Host; session: Session } | null;

type Props = {
  selection: Selection;
  onSelect: (s: Selection) => void;
  onAdd: () => void;
  onEdit: (h: Host) => void;
};

export function HostTree({ selection, onSelect, onAdd, onEdit }: Props) {
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
      if (selection?.host.id === h.id) onSelect(null);
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
}: {
  host: Host;
  expanded: boolean;
  selection: Selection;
  onToggle: () => void;
  onSelect: (s: Selection) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = useHostStatus(host.id);
  const sessions = useSessions(host.id, expanded);

  return (
    <div className="px-1">
      <div className="group flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted">
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
          onClick={onToggle}
          className="flex-1 truncate text-left text-sm font-medium"
          title={`${host.ssh_user}@${host.ssh_host}:${host.ssh_port}`}
        >
          {host.display_name}
        </button>

        <div className="hidden gap-0.5 group-hover:flex">
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
              selection?.host.id === host.id &&
              selection?.session.name === s.name;
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => onSelect({ host, session: s })}
                className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted ${
                  selected ? "bg-muted" : ""
                }`}
              >
                <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{s.name}</span>
                <span className="text-xs text-muted-foreground">
                  {s.attached ? "attached" : "idle"} · {relativeTime(s.activity)}
                </span>
              </button>
            );
          })}
        </div>
      )}
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
