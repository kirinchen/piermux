// 一個 host 的 capture grid view —— host node 被選時 HostsView 顯示這個。
// 把該 host 所有 session 排成 grid,每個 cell 是一個 mini xterm capture。
//
// 「Refresh All Sessions」按鈕走 capture_host(backend 一條 SSH 跑多 channel,
// SPEC §9.2)。

import { Loader2, RefreshCw, Server, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CaptureCell } from "./CaptureCell";
import { useSessions, useHostStatus } from "@/hooks/useSessions";
import { useRefreshHost } from "@/hooks/useCapture";
import type { Host, Session } from "@/lib/types";

type Props = {
  host: Host;
  // 點 cell 上的 [⇱] 進單一視圖
  onSelectSession: (session: Session) => void;
};

export function HostCaptureGrid({ host, onSelectSession }: Props) {
  const sessions = useSessions(host.id, true);
  const status = useHostStatus(host.id);
  const refreshHost = useRefreshHost();

  const handleRefresh = async () => {
    try {
      const results = await refreshHost.mutateAsync(host.id);
      toast.success(
        `${host.display_name}:已 refresh ${results.length} 個 session`,
      );
    } catch (err) {
      toast.error(`${host.display_name} refresh 失敗:${String(err)}`);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b-2 border-border border-l-4 border-l-amber-500/70 bg-zinc-800 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <Server className="h-4 w-4 text-amber-400/90" />
            <h2 className="truncate text-base font-bold">
              {host.display_name}
            </h2>
            <span className="shrink-0 text-xs text-muted-foreground">
              {host.ssh_user}@{host.ssh_host}:{host.ssh_port}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {status.data === "connected" && "✓ connected"}
            {status.data === "disconnected" && "⚠ disconnected"}
            {(status.data === "connecting" || status.data === undefined) &&
              "● 探測中"}
            {sessions.data && (
              <>
                {" · "}
                {sessions.data.length} session
                {sessions.data.length === 1 ? "" : "s"}
              </>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshHost.isPending}
          title="重抓此 host 所有 session(同一條 SSH 並行 ≤3)"
        >
          {refreshHost.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh Host
        </Button>
      </header>

      <main className="flex-1 overflow-auto bg-[#050505] p-3">
        {sessions.isLoading && (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            載入 sessions
          </div>
        )}

        {sessions.error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <div className="font-medium">無法讀 sessions</div>
              <div className="mt-1 break-all text-xs text-muted-foreground">
                {String(sessions.error)}
              </div>
            </div>
          </div>
        )}

        {sessions.data && sessions.data.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            這個 host 上沒 tmux session。
          </div>
        )}

        {sessions.data && sessions.data.length > 0 && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {sessions.data.map((s) => (
              <CaptureCell
                key={s.name}
                host={host}
                session={s}
                onExpand={() => onSelectSession(s)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
