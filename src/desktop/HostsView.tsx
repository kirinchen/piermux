import * as React from "react";
import { HostTree, type Selection } from "./HostTree";
import { SessionPanel } from "./SessionPanel";
import { HostFormDialog } from "./HostFormDialog";
import type { Host } from "@/lib/types";

export function HostsView() {
  const [selection, setSelection] = React.useState<Selection>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Host | null>(null);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (h: Host) => {
    setEditing(h);
    setDialogOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div>
          <h1 className="text-lg font-semibold">piermux</h1>
          <p className="text-xs text-muted-foreground">
            跨多機 tmux session GUI · M1c tree view(sessions = mock data)
          </p>
        </div>
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
