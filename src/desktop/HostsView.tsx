import * as React from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { HostTree, type Selection } from "./HostTree";
import { SessionPanel } from "./SessionPanel";
import { HostFormDialog } from "./HostFormDialog";
import { Button } from "@/components/ui/button";
import { useRefreshAll } from "@/hooks/useCapture";
import type { Host } from "@/lib/types";

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
          <SessionPanel selection={selection} />
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
