import * as React from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { Terminal as TerminalIcon, RefreshCw, Loader2 } from "lucide-react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";

import type { Selection } from "./HostTree";
import type { CaptureResult } from "@/lib/types";
import { api } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/time";

type Props = { selection: Selection };

export function SessionPanel({ selection }: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const xtermRef = React.useRef<XTerm | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [capturedAt, setCapturedAt] = React.useState<string | null>(null);

  // xterm 初始化 — 元件 mount 即建立 instance,跨 selection 切換 reuse,unmount 才 dispose
  React.useEffect(() => {
    if (!containerRef.current || xtermRef.current) return;
    const term = new XTerm({
      fontFamily:
        '"JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: { background: "#0a0a0a", foreground: "#e5e5e5" },
      convertEol: true,
      disableStdin: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    xtermRef.current = term;
    fitRef.current = fit;
    requestAnimationFrame(() => fit.fit());

    return () => {
      term.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Container resize → fit
  React.useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      try {
        fitRef.current?.fit();
      } catch {
        // ignore — element 還沒 layout 完
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // selection 變動 → 拉一次 capture + 訂閱該 (host, session) event
  React.useEffect(() => {
    if (!selection) {
      xtermRef.current?.clear();
      setCapturedAt(null);
      return;
    }
    const { host, session } = selection;
    const writeResult = (r: CaptureResult) => {
      const term = xtermRef.current;
      if (!term) return;
      term.clear();
      term.write(r.content);
      setCapturedAt(r.captured_at);
    };

    // initial fetch — 強制重抓不吃 capture_cache,確保剛切過去看到的是新的
    setRefreshing(true);
    api
      .captureSession(host.id, session.name)
      .then(writeResult)
      .catch((err) => {
        toast.error(`抓 capture 失敗:${String(err)}`);
        const term = xtermRef.current;
        if (term) {
          term.clear();
          term.write(
            `\r\n\x1b[31m[piermux] capture failed: ${String(err)}\x1b[0m\r\n`,
          );
        }
      })
      .finally(() => setRefreshing(false));

    // 訂閱 host-level / global refresh 觸發的 event(SPEC §6.3 incremental update)
    let unlisten: UnlistenFn | undefined;
    const eventName = `capture-updated:${host.id}:${session.name}`;
    listen<CaptureResult>(eventName, (e) => writeResult(e.payload))
      .then((un) => {
        unlisten = un;
      })
      .catch((err) => console.warn("[SessionPanel] listen failed:", err));

    return () => {
      unlisten?.();
    };
  }, [selection?.host.id, selection?.session.name]);

  const handleRefresh = async () => {
    if (!selection) return;
    const { host, session } = selection;
    setRefreshing(true);
    try {
      const r = await api.captureSession(host.id, session.name);
      const term = xtermRef.current;
      if (term) {
        term.clear();
        term.write(r.content);
      }
      setCapturedAt(r.captured_at);
    } catch (err) {
      toast.error(`Refresh 失敗:${String(err)}`);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        {selection ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <TerminalIcon className="h-4 w-4 text-muted-foreground" />
                <h2 className="truncate text-base font-semibold">
                  {selection.session.name}
                </h2>
                <span className="shrink-0 text-xs text-muted-foreground">
                  @ {selection.host.display_name}
                </span>
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {selection.host.ssh_user}@{selection.host.ssh_host}:
                {selection.host.ssh_port} ·{" "}
                {selection.session.attached ? "attached" : "idle"} ·{" "}
                {selection.session.windows} window
                {selection.session.windows > 1 ? "s" : ""} · 最後活動{" "}
                {relativeTime(selection.session.activity)}
                {capturedAt && (
                  <>
                    {" · "}capture {relativeTime(capturedAt)}
                  </>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshing}
              title="重抓 capture"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">
            沒選 session — 點左側 tree 上的 session 開始
          </div>
        )}
      </header>

      <main className="relative flex-1 overflow-hidden bg-[#0a0a0a]">
        <div ref={containerRef} className="absolute inset-0" />
        {!selection && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <TerminalIcon className="h-8 w-8 opacity-30" />
              <p className="text-sm">點左側 session 看 capture</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
