// Multi-host 並列 capture view —— tree 上勾 N 個 host checkbox 後右側顯示。
// 每個 host 一個 section,內部 grid 排該 host 所有 session 的 mini xterm。
//
// 設計取捨:
// - 不 reuse `HostCaptureGrid`(它 main 是 flex-1,堆疊 N 個會打架)
// - 直接在這檔內 inline `HostSection`,sessions 走 `useSessions` 各自拉、
//   xterm cell 走 `CaptureCell` 共用
// - "Refresh All Selected" 對選的 N 個 host 並行 captureHost(每 host 內部
//   還是 backend 的 Semaphore(3) 限速 + 一條 SSH per host)

import { Loader2, RefreshCw, Server, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CaptureCell } from "./CaptureCell";
import { useSessions, useHostStatus } from "@/hooks/useSessions";
import { useRefreshHost } from "@/hooks/useCapture";
import { api } from "@/lib/tauri";
import type { Host, Session } from "@/lib/types";

type Props = {
  hosts: Host[];
  // grid cell 點 [⇱] 進單一視圖
  onSelectSession: (host: Host, session: Session) => void;
  // 點右上 "清除選取" 退出 multi 模式
  onClearAll: () => void;
};

export function MultiHostCaptureGrid({
  hosts,
  onSelectSession,
  onClearAll,
}: Props) {
  const handleRefreshAllSelected = async () => {
    try {
      const results = await Promise.all(
        hosts.map((h) =>
          api.captureHost(h.id).catch((err) => {
            // 個別 host 失敗 toast,不阻其他
            toast.error(`${h.display_name} refresh 失敗:${String(err)}`);
            return [] as never[];
          }),
        ),
      );
      const total = results.reduce((sum, arr) => sum + arr.length, 0);
      toast.success(
        `已 refresh ${hosts.length} 個 host(共 ${total} 個 session)`,
      );
    } catch (err) {
      toast.error(`Refresh selected 失敗:${String(err)}`);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b-2 border-border bg-muted/70 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <h2 className="truncate text-base font-semibold">
              Multi-host view
            </h2>
            <span className="shrink-0 text-xs text-muted-foreground">
              {hosts.length} host{hosts.length === 1 ? "" : "s"} 並列
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {hosts.map((h) => h.display_name).join(" · ")}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefreshAllSelected}
            title="重抓選定 host 全部 session(host 之間並行,host 內限速 3)"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh selected
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClearAll}
            title="清除選取,退出 multi-host 模式"
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto bg-[#050505]">
        {hosts.map((h) => (
          <HostSection
            key={h.id}
            host={h}
            onSelectSession={(s) => onSelectSession(h, s)}
          />
        ))}
      </main>
    </div>
  );
}

function HostSection({
  host,
  onSelectSession,
}: {
  host: Host;
  onSelectSession: (s: Session) => void;
}) {
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
    <section className="border-b-2 border-border last:border-b-0">
      <div className="flex items-center justify-between border-b-2 border-border border-l-4 border-l-amber-500/70 bg-zinc-800 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <Server className="h-4 w-4 shrink-0 text-amber-400/90" />
          <h3 className="truncate text-base font-bold text-foreground">
            {host.display_name}
          </h3>
          <span className="shrink-0 text-xs text-muted-foreground">
            {host.ssh_user}@{host.ssh_host}:{host.ssh_port}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            ·{" "}
            {status.data === "connected"
              ? "✓ connected"
              : status.data === "disconnected"
                ? "⚠ disconnected"
                : "● 探測中"}
            {sessions.data && (
              <>
                {" · "}
                {sessions.data.length} session
                {sessions.data.length === 1 ? "" : "s"}
              </>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshHost.isPending}
          className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50"
          title="重抓此 host 所有 session"
        >
          {refreshHost.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="p-2">
        {sessions.isLoading && (
          <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            載入 sessions
          </div>
        )}
        {sessions.error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
            <span className="break-all">{String(sessions.error)}</span>
          </div>
        )}
        {sessions.data && sessions.data.length === 0 && (
          <div className="px-2 py-1 text-xs italic text-muted-foreground">
            這個 host 上沒 tmux session。
          </div>
        )}
        {sessions.data && sessions.data.length > 0 && (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
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
      </div>
    </section>
  );
}
