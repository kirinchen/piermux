import * as React from "react";
import { Plus, Pencil, Trash2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useHostsList, useDeleteHost } from "@/hooks/useHosts";
import type { Host } from "@/lib/types";
import { HostFormDialog } from "./HostFormDialog";

export function HostsView() {
  const { data: hosts, isLoading, error } = useHostsList();
  const del = useDeleteHost();
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

  const handleDelete = async (h: Host) => {
    if (!window.confirm(`確定要刪除 ${h.display_name}?`)) return;
    try {
      await del.mutateAsync(h.id);
      toast.success(`已刪除 ${h.display_name}`);
    } catch (err) {
      toast.error(`刪除失敗:${String(err)}`);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">piermux</h1>
          <p className="text-xs text-muted-foreground">
            跨多機 tmux session GUI · M1b host CRUD
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4" />
          新增 Host
        </Button>
      </header>

      <main className="flex-1 overflow-auto p-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            載入中
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
            <div>
              <div className="font-medium text-destructive">載入 hosts 失敗</div>
              <div className="text-muted-foreground">{String(error)}</div>
            </div>
          </div>
        )}

        {hosts && hosts.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            還沒有 host。按右上「新增 Host」開始。
          </div>
        )}

        {hosts && hosts.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {hosts.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium truncate">
                      {h.display_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {h.auth_type === "key" ? "🔑 key" : "🔒 password"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {h.ssh_user}@{h.ssh_host}:{h.ssh_port}
                    {h.auth_type === "key" && h.private_key_path && (
                      <> · {h.private_key_path}</>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(h)}
                    title="編輯"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(h)}
                    title="刪除"
                    disabled={del.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <HostFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </div>
  );
}
