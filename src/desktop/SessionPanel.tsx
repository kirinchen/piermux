import * as React from "react";
import { Terminal as XTerm, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import {
  Terminal as TerminalIcon,
  RefreshCw,
  Loader2,
  ArrowLeft,
  Plug,
  Power,
} from "lucide-react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";

import type { CaptureResult, Host, Session } from "@/lib/types";
import { api } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/time";
import { LineBufferInput } from "./LineBufferInput";

type Props = {
  host: Host;
  session: Session;
  // 從 grid 點進來時提供 — 按返回 = 回到 host grid view
  onBack?: () => void;
};

type Mode = "capture" | "attach";
type InputMode = "line" | "stream";

export function SessionPanel({ host, session, onBack }: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const xtermRef = React.useRef<XTerm | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);

  // 預設 attach(NOTES.md D-10):進單一 session 視圖 = 我選定要操作。
  // 瀏覽用 grid view(host click)。要回唯讀 capture 按 [Detach]。
  const [mode, setMode] = React.useState<Mode>("attach");
  // 預設 stream(NOTES.md D-11,SPEC §3.5.1 偏離):大多數 attach 場景是
  // 一般 shell(vim / ls / git / Ctrl+C 等),stream 即時送字元才符合
  // terminal 直覺。Line buffer 在 attach 模式內 [Line | Stream] toggle 切過去,
  // 給 AI agent 對話 / 中文長訊息場景用 — 這是 piermux 的差異化功能,
  // 但不該是 default。
  const [inputMode, setInputMode] = React.useState<InputMode>("stream");
  const [attachId, setAttachId] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [capturedAt, setCapturedAt] = React.useState<string | null>(null);

  // M1f attach data dispatch — onData IDisposable,attach 退出時 dispose
  const onDataRef = React.useRef<IDisposable | null>(null);
  // M1g inputMode 給 stable onData callback 用 — onData 只在 attach 開始時 wire
  // 一次,inputMode 切換不重 wire,直接從 ref 看當下值
  const inputModeRef = React.useRef<InputMode>(inputMode);
  React.useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);

  // session 切換 / unmount 時把 mode reset 回 default(D-10 attach + D-11 stream)。
  // attach effect 的 cleanup 會處理 detachSession 收尾。
  React.useEffect(() => {
    return () => {
      setMode("attach");
      setInputMode("stream");
    };
  }, [host.id, session.name]);

  // xterm 初始化(每次 SessionPanel mount 一次)
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

  // M1f xterm.onResize → 通知 backend(attach mode 才有意義)
  React.useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;
    const disp = term.onResize(({ cols, rows }) => {
      if (mode === "attach" && attachId) {
        api.resizeSession(attachId, cols, rows).catch((err) => {
          console.warn("[SessionPanel] resizeSession failed", err);
        });
      }
    });
    return () => disp.dispose();
  }, [mode, attachId]);

  // M1g xterm.disableStdin 跟 mode + inputMode 走:
  // - capture:disable(唯讀)
  // - attach + line:disable(xterm 是 server output 顯示器,user 在下方
  //   textarea 打字,xterm 不該攔截鍵盤)
  // - attach + stream:enable(字元即時送)
  React.useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;
    const enabled = mode === "attach" && inputMode === "stream";
    term.options.disableStdin = !enabled;
  }, [mode, inputMode]);

  // Capture 模式:拉一次 capture + 訂閱該 (host, session) event
  React.useEffect(() => {
    if (mode !== "capture") return;

    const writeResult = (r: CaptureResult) => {
      const t = xtermRef.current;
      if (!t) return;
      t.clear();
      t.write(r.content);
      setCapturedAt(r.captured_at);
    };

    setRefreshing(true);
    api
      .captureSession(host.id, session.name)
      .then(writeResult)
      .catch((err) => {
        toast.error(`抓 capture 失敗:${String(err)}`);
        const t = xtermRef.current;
        if (t) {
          t.clear();
          t.write(
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
      .catch((err) => console.warn("[SessionPanel] listen failed:", err));

    return () => {
      unlisten?.();
    };
  }, [mode, host.id, session.name]);

  // Attach 模式(M1f + M1g):attachSession + listen output + wire onData(stream-only)
  React.useEffect(() => {
    if (mode !== "attach") return;
    const term = xtermRef.current;
    if (!term) return;

    let aid: string | null = null;
    let unlistenOutput: UnlistenFn | undefined;
    let unlistenClosed: UnlistenFn | undefined;
    let cancelled = false;

    const start = async () => {
      try {
        term.clear();
        const cols = term.cols || 80;
        const rows = term.rows || 24;
        aid = await api.attachSession(host.id, session.name, cols, rows);
        if (cancelled) {
          // 在 attach 完成前 user 已經切走了,清掉 backend session
          api.detachSession(aid).catch(() => {});
          return;
        }
        setAttachId(aid);

        unlistenOutput = await listen<string>(
          `attach-output-${aid}`,
          (e) => {
            const t = xtermRef.current;
            if (t) t.write(e.payload);
          },
        );

        unlistenClosed = await listen(`attach-closed-${aid}`, () => {
          toast.message("Attach 已關閉(server 端 EOF / exit)");
          setMode("capture");
        });

        // wire keyboard:
        // - stream mode:每筆 onData 直送 backend(像 colony / vim)
        // - line mode:onData 不應該 fire(disableStdin=true),但 xterm
        //   有時還是會丟某些 key event。為了保險,從 inputModeRef 看當下
        //   值,line mode 直接 noop
        const disp = term.onData((data) => {
          if (inputModeRef.current !== "stream") return;
          if (aid) {
            api.writeToSession(aid, data).catch((err) => {
              console.warn("[SessionPanel] writeToSession failed", err);
            });
          }
        });
        onDataRef.current = disp;
      } catch (err) {
        if (cancelled) return;
        toast.error(`Attach 失敗:${String(err)}`);
        setMode("capture");
      }
    };
    start();

    return () => {
      cancelled = true;
      onDataRef.current?.dispose();
      onDataRef.current = null;
      unlistenOutput?.();
      unlistenClosed?.();
      const idToClose = aid;
      if (idToClose) {
        api.detachSession(idToClose).catch(() => {});
      }
      setAttachId(null);
    };
  }, [mode, host.id, session.name]);

  const handleRefresh = async () => {
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

  const toggleMode = () => {
    setMode((m) => (m === "capture" ? "attach" : "capture"));
  };

  // M1g line buffer Send callback:把 buffer + \r 送出。\r 是 PTY 的 Enter
  // (line discipline 翻 \n;符合 SPEC §7.3 範例 + 標準 PTY 行為)
  const handleLineSend = (text: string) => {
    if (!attachId) return;
    api.writeToSession(attachId, text + "\r").catch((err) => {
      toast.error(`Send 失敗:${String(err)}`);
    });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mt-0.5 rounded p-1 text-muted-foreground hover:bg-muted"
              title="回 host capture grid"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <TerminalIcon className="h-4 w-4 text-muted-foreground" />
              <h2 className="truncate text-base font-semibold">
                {session.name}
              </h2>
              <span className="shrink-0 text-xs text-muted-foreground">
                @ {host.display_name}
              </span>
              <ModeBadge mode={mode} />
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {host.ssh_user}@{host.ssh_host}:{host.ssh_port} ·{" "}
              {session.attached ? "attached" : "idle"} · {session.windows} window
              {session.windows > 1 ? "s" : ""} · 最後活動{" "}
              {relativeTime(session.activity)}
              {mode === "capture" && capturedAt && (
                <>
                  {" · "}capture {relativeTime(capturedAt)}
                </>
              )}
              {mode === "attach" && attachId && (
                <>
                  {" · "}attach id{" "}
                  <code className="font-mono">{attachId.slice(0, 8)}</code>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {mode === "attach" && (
            <InputModeToggle inputMode={inputMode} onChange={setInputMode} />
          )}
          {mode === "capture" && (
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
          )}
          <Button
            size="sm"
            variant={mode === "attach" ? "default" : "outline"}
            onClick={toggleMode}
            title={
              mode === "capture"
                ? "進 attach 模式(雙向 PTY)"
                : "退出 attach,回 capture 唯讀模式"
            }
          >
            {mode === "capture" ? (
              <>
                <Plug className="h-4 w-4" />
                Attach
              </>
            ) : (
              <>
                <Power className="h-4 w-4" />
                Detach
              </>
            )}
          </Button>
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden bg-[#0a0a0a]">
        <div ref={containerRef} className="absolute inset-0" />
      </main>

      {mode === "attach" && inputMode === "line" && (
        // key 用 attachId 讓「切 attach session」時 component remount → 清 buffer
        <LineBufferInput
          key={attachId ?? "pending"}
          onSend={handleLineSend}
          disabled={!attachId}
        />
      )}
      {mode === "attach" && inputMode === "stream" && (
        <footer className="border-t border-border bg-amber-500/10 px-4 py-1.5 text-xs text-amber-700 dark:text-amber-300">
          ⚠ Stream mode — 字元即時送(像 vim / less / 互動 prompt)。AI agent
          對話建議切回 Line mode 避免「打到一半送出去」。
        </footer>
      )}
    </div>
  );
}

function ModeBadge({ mode }: { mode: Mode }) {
  if (mode === "capture") {
    return (
      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        capture
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
      attach
    </span>
  );
}

function InputModeToggle({
  inputMode,
  onChange,
}: {
  inputMode: InputMode;
  onChange: (m: InputMode) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange("line")}
        className={`rounded px-2 py-0.5 font-medium transition-colors ${
          inputMode === "line"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title="Line buffer:打字 → Enter 整段送出(預設,避免 colony 那種誤送)"
      >
        Line
      </button>
      <button
        type="button"
        onClick={() => onChange("stream")}
        className={`rounded px-2 py-0.5 font-medium transition-colors ${
          inputMode === "stream"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title="Stream:字元即時送(vim / less / 互動 prompt 用)"
      >
        Stream
      </button>
    </div>
  );
}
