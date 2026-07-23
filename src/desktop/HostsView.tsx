import * as React from "react";
import {
  RefreshCw,
  Loader2,
  Terminal as TerminalIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { HostTree, type Selection } from "./HostTree";
import { SessionPanel } from "./SessionPanel";
import { HostCaptureGrid } from "./HostCaptureGrid";
import { MultiHostCaptureGrid } from "./MultiHostCaptureGrid";
import { HostFormDialog } from "./HostFormDialog";
import { SettingsDialog } from "./SettingsDialog";
import { Button } from "@/components/ui/button";
import { useRefreshAll } from "@/hooks/useCapture";
import { getVersion } from "@tauri-apps/api/app";
import type { Host, Session } from "@/lib/types";

const SIDEBAR_KEY = "piermux:sidebarCollapsed";

export function HostsView() {
  const [selection, setSelection] = React.useState<Selection>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Host | null>(null);
  // Sidebar 收合狀態,localStorage 持久化
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState<boolean>(
    () => {
      try {
        return window.localStorage.getItem(SIDEBAR_KEY) === "true";
      } catch {
        return false;
      }
    },
  );
  React.useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed));
    } catch {
      // ignore — quota / SecurityError
    }
  }, [sidebarCollapsed]);

  const refreshAll = useRefreshAll();

  // app 版本(讀 tauri.conf,跟 installer 一致),顯示在 header
  const [appVersion, setAppVersion] = React.useState<string>("");
  React.useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

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

  // grid → 點 cell 放大進單一 session 視圖(也清掉 multi-host 比較)
  const expandSession = (host: Host, session: Session) => {
    setSelection({ kind: "session", host, session });
  };

  // session 單一視圖 → 按返回回 host grid
  const backToHostGrid = () => {
    if (selection?.kind === "session" || selection?.kind === "shell") {
      setSelection({ kind: "host", host: selection.host });
    }
  };

  // 點 host 旁 checkbox → toggle 進 / 出 multi-host 比較模式
  const toggleMulti = (host: Host) => {
    setSelection((prev) => {
      const current =
        prev?.kind === "multi-host" ? prev.hosts : ([] as Host[]);
      const exists = current.some((h) => h.id === host.id);
      const next = exists
        ? current.filter((h) => h.id !== host.id)
        : [...current, host];
      if (next.length === 0) return null;
      return { kind: "multi-host", hosts: next };
    });
  };

  const clearMulti = () => setSelection(null);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={sidebarCollapsed ? "展開 Hosts 側欄" : "收合 Hosts 側欄(主畫面滿版)"}
            aria-label="toggle sidebar"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
          <div>
            <h1 className="text-lg font-semibold leading-tight">
              piermux{appVersion ? ` v${appVersion}` : ""}
            </h1>
            <p className="text-xs text-muted-foreground">
              跨多機 tmux session GUI · M1 desktop
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="終端設定(字型 / 字級)"
            aria-label="settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {!sidebarCollapsed && (
          <HostTree
            selection={selection}
            onSelect={setSelection}
            onAdd={openAdd}
            onEdit={openEdit}
            onToggleMulti={toggleMulti}
          />
        )}
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
              target={{ kind: "tmux", session: selection.session }}
              onBack={backToHostGrid}
            />
          )}
          {selection?.kind === "shell" && (
            <SessionPanel
              host={selection.host}
              target={{ kind: "shell" }}
              onBack={backToHostGrid}
            />
          )}
          {selection?.kind === "multi-host" && (
            <MultiHostCaptureGrid
              hosts={selection.hosts}
              onSelectSession={expandSession}
              onClearAll={clearMulti}
            />
          )}
        </div>
      </div>

      <HostFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <TerminalIcon className="h-8 w-8 opacity-30" />
      <p className="text-sm">
        點 host 看 grid · 點 session / shell 看單一視圖 · checkbox 多選
        host 並列
      </p>
    </div>
  );
}
