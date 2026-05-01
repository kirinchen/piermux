import * as React from "react";
import { RefreshCw, Loader2, Terminal as TerminalIcon } from "lucide-react";
import { toast } from "sonner";
import { HostTree, type Selection } from "./HostTree";
import { SessionPanel } from "./SessionPanel";
import { HostCaptureGrid } from "./HostCaptureGrid";
import { HostFormDialog } from "./HostFormDialog";
import { Button } from "@/components/ui/button";
import { useRefreshAll } from "@/hooks/useCapture";
import type { Host, Session } from "@/lib/types";

export function HostsView() {
  const [selection, setSelection] = React.useState<Selection>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Host | null>(null);
  const refreshAll = useRefreshAll();

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (h: Host) => {
    setEditing(h);
    setDialogOpen(true);
  };

  const handleRefreshAll = async () => {
    try {
      const results = await refreshAll.mutateAsync();
      toast.success(`已 refresh ${results.length} 個 session`);
    } catch (err) {
      toast.error(`Refresh All 失敗:${String(err)}`);
    }
  };

  // grid → 點 cell 放大進單一 session 視圖
  const expandSession = (host: Host, session: Session) => {
    setSelection({ kind: "session", host, session });
  };

  // session 單一視圖 → 按返回回 host grid
  const backToHostGrid = () => {
    if (selection?.kind === "session") {
      setSelection({ kind: "host", host: selection.host });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div>
          <h1 className="text-lg font-semibold">piermux</h1>
          <p className="text-xs text-muted-foreground">
            跨多機 tmux session GUI · M1d capture mode
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefreshAll}
          disabled={refreshAll.isPending}
          title="重抓所有 host 所有 session 的 capture"
        >
          {refreshAll.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh All
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <HostTree
          selection={selection}
          onSelect={setSelection}
          onAdd={openAdd}
          onEdit={openEdit}
        />
        <div className="flex-1 overflow-hidden">
          {!selection && <EmptyState />}
          {selection?.kind === "host" && (
            <HostCaptureGrid
              host={selection.host}
              onSelectSession={(s) => expandSession(selection.host, s)}
            />
          )}
          {selection?.kind === "session" && (
            <SessionPanel
              host={selection.host}
              session={selection.session}
              onBack={backToHostGrid}
            />
          )}
        </div>
      </div>

      <HostFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <TerminalIcon className="h-8 w-8 opacity-30" />
      <p className="text-sm">點左側 host 看 capture grid,或點 session 看單一視圖</p>
    </div>
  );
}
