// 一個 session 的 mini capture view,給 HostCaptureGrid 的 grid cell 用。
// xterm 字體調小、固定高度,讓多個 cell 同時排列看到全 host overview。

import * as React from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { installOsc52Handler } from "../lib/osc52";
import { installUnicodeWidths } from "../lib/xterm-unicode";
import { installWebLinks } from "../lib/xterm-links";
import { fontSizeFor, getTermPrefs } from "../lib/term-prefs";
import { useTermFontSync } from "../lib/useTermPrefs";
import {
  Terminal as TerminalIcon,
  RefreshCw,
  Loader2,
  Maximize2,
} from "lucide-react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";

import type { CaptureResult, Host, Session } from "@/lib/types";
import { api } from "@/lib/tauri";
import { relativeTime } from "@/lib/time";

// grid 的 mini cell 一律比使用者設定的主字級小 2px(要塞多個 cell 看 overview)
const MINI_FONT_DELTA = -2;

type Props = {
  host: Host;
  session: Session;
  // 點 [⇱] 進單一視圖(SessionPanel)
  onExpand?: () => void;
};

export function CaptureCell({ host, session, onExpand }: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const xtermRef = React.useRef<XTerm | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [capturedAt, setCapturedAt] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!containerRef.current || xtermRef.current) return;
    // grid mini cell 比主終端小 2px(D-35 之前寫死 11 = 主 13 - 2,維持相對關係)
    const prefs = getTermPrefs();
    const term = new XTerm({
      fontFamily: prefs.fontFamily,
      fontSize: fontSizeFor(prefs, MINI_FONT_DELTA),
      lineHeight: 1.15,
      theme: { background: "#0a0a0a", foreground: "#e5e5e5" },
      convertEol: true,
      disableStdin: true,
      scrollback: 2000,
      // unicode API(寬度對齊 tmux)是 proposed,需開這旗標
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // 對齊新版 tmux 的 emoji/CJK 寬度,避免行頭殘留字(D-28)。要在 open/write 前。
    installUnicodeWidths(term);
    // Forward remote OSC 52 (tmux set-clipboard) to host OS clipboard.
    installOsc52Handler(term);
    // 網址點一下開系統瀏覽器(D-36)
    installWebLinks(term);
    term.open(containerRef.current);
    xtermRef.current = term;
    fitRef.current = fit;
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        // 容器尺寸還沒穩
      }
    });

    return () => {
      term.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // 設定面板改字型 / 字級 → 即時套用 + refit(D-35)
  useTermFontSync(xtermRef, fitRef, MINI_FONT_DELTA);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      try {
        fitRef.current?.fit();
      } catch {
        // ignore
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const writeResult = (r: CaptureResult) => {
      const term = xtermRef.current;
      if (!term) return;
      term.clear();
      term.write(r.content);
      setCapturedAt(r.captured_at);
    };

    setRefreshing(true);
    api
      .captureSession(host.id, session.name)
      .then(writeResult)
      .catch((err) => {
        const term = xtermRef.current;
        if (term) {
          term.clear();
          term.write(
            `\r\n\x1b[31m[piermux] capture failed: ${String(err)}\x1b[0m\r\n`,
          );
        }
      })
      .finally(() => setRefreshing(false));

    let unlisten: UnlistenFn | undefined;
    const eventName = `capture-updated:${host.id}:${session.name}`;
    listen<CaptureResult>(eventName, (e) => writeResult(e.payload))
      .then((un) => {
        unlisten = un;
      })
      .catch((err) => console.warn("[CaptureCell] listen failed:", err));

    return () => {
      unlisten?.();
    };
  }, [host.id, session.name]);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshing(true);
    try {
      await api.captureSession(host.id, session.name);
      // 不用手動寫 — listen handler 會接到 event 自動更新
    } catch (err) {
      toast.error(`${session.name} refresh 失敗:${String(err)}`);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border">
      <header className="flex items-center gap-1 border-b border-border bg-muted/40 px-2 py-1 text-xs">
        <TerminalIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono font-medium">{session.name}</span>
        <span className="shrink-0 text-muted-foreground">
          · {session.attached ? "attached" : "idle"} ·{" "}
          {relativeTime(session.activity)}
          {capturedAt && <> · cap {relativeTime(capturedAt)}</>}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
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
              onClick={onExpand}
              className="rounded p-1 text-muted-foreground hover:bg-background"
              title="放大看(進單一 session 視圖)"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </header>
      <div className="relative h-56 bg-[#0a0a0a]">
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
