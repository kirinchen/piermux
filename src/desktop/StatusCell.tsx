// 一個 session 的「狀態」列,給 overview 的狀態模式用(對照 CaptureCell 的截圖模式)。
// 吃同一份 capture(captureSession + capture-updated event),把畫面文字丟給
// detectSessionStatus 判態,排成 seamount TmuxRow 風格的一行。

import * as React from "react";
import { RefreshCw, Loader2, Maximize2 } from "lucide-react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";

import type { CaptureResult, Host, Session } from "@/lib/types";
import { api } from "@/lib/tauri";
import { relativeTime } from "@/lib/time";
import {
  detectSessionStatus,
  stripAnsi,
  type SessionStatus,
} from "@/lib/session-status";

const STALE_MS = 12 * 60 * 60 * 1000; // >12h 標紅(對齊 seamount)

type Props = {
  host: Host;
  session: Session;
  onExpand?: () => void;
};

export function StatusCell({ host, session, onExpand }: Props) {
  const [status, setStatus] = React.useState<SessionStatus | null>(null);
  const [capturedAt, setCapturedAt] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    const apply = (r: CaptureResult) => {
      setStatus(detectSessionStatus(stripAnsi(r.content)));
      setCapturedAt(r.captured_at);
    };

    setRefreshing(true);
    api
      .captureSession(host.id, session.socket, session.name)
      .then(apply)
      .catch(() => setStatus(null))
      .finally(() => setRefreshing(false));

    let unlisten: UnlistenFn | undefined;
    const eventName = `capture-updated:${host.id}:${session.socket}:${session.name}`;
    listen<CaptureResult>(eventName, (e) => apply(e.payload))
      .then((un) => {
        unlisten = un;
      })
      .catch((err) => console.warn("[StatusCell] listen failed:", err));

    return () => unlisten?.();
  }, [host.id, session.socket, session.name]);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshing(true);
    try {
      await api.captureSession(host.id, session.socket, session.name);
    } catch (err) {
      toast.error(`${session.name} refresh 失敗:${String(err)}`);
    } finally {
      setRefreshing(false);
    }
  };

  const busy =
    status?.state === "busy_fg" || status?.state === "busy_agents";
  const wait = status?.state === "wait_input";
  const stale =
    !!session.activity &&
    Date.now() - new Date(session.activity).getTime() > STALE_MS;
  // busy 只顯 label,不顯畫面 body 尾巴(那多半是 chrome 雜訊,且拿不到 OSC 任務名)
  const tail = busy
    ? null
    : wait && status?.draft
      ? `⌨️ ${status.draft}`
      : status?.summary;

  return (
    <div
      className="group flex items-start gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 hover:bg-muted/40"
      onClick={onExpand}
      role={onExpand ? "button" : undefined}
    >
      <span className="shrink-0 text-base leading-6" title={status?.label}>
        {status ? status.emoji : "·"}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="truncate font-mono font-medium">{session.name}</span>
          {session.attached && (
            <span className="shrink-0 text-emerald-500" title="attached">
              ●
            </span>
          )}
          {wait && (
            <span className="shrink-0 rounded bg-rose-500/15 px-1 text-xs font-medium text-rose-400">
              等你回覆
            </span>
          )}
          {busy && (
            <span className="shrink-0 text-xs text-amber-400">
              {status?.label}
            </span>
          )}
          {!busy && (
            <span
              className={
                "shrink-0 text-xs " +
                (stale ? "text-rose-400" : "text-muted-foreground")
              }
              title={capturedAt ? `cap ${relativeTime(capturedAt)}` : undefined}
            >
              {relativeTime(session.activity)}
            </span>
          )}
        </div>
        {tail && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {tail}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded p-1 text-muted-foreground hover:bg-background disabled:opacity-50"
          title="重抓此 session"
        >
          {refreshing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </button>
        {onExpand && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
            className="rounded p-1 text-muted-foreground hover:bg-background"
            title="放大看(進單一 session 視圖)"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
