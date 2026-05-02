import * as React from "react";
import { Terminal as XTerm, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import {
  Terminal as TerminalIcon,
  Zap,
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
import { SendBar } from "./SendBar";

// Target = SessionPanel 顯示「什麼」:tmux session 或直連 shell(NOTES D-14)
export type SessionPanelTarget =
  | { kind: "tmux"; session: Session }
  | { kind: "shell" };

type Props = {
  host: Host;
  target: SessionPanelTarget;
  // 從 grid / shell 入口進來時提供 — 按返回回上一層
  onBack?: () => void;
};

type Mode = "capture" | "attach";
type InputMode = "line" | "stream";

export function SessionPanel({ host, target, onBack }: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const xtermRef = React.useRef<XTerm | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);

  // shell 永遠 attach mode(沒有 tmux capture-pane 概念)。tmux 預設 attach(D-10)
  const [mode, setMode] = React.useState<Mode>("attach");
  // 預設 stream(D-11);Line 是 toggle 過去的選項
  const [inputMode, setInputMode] = React.useState<InputMode>("stream");
  const [attachId, setAttachId] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [capturedAt, setCapturedAt] = React.useState<string | null>(null);

  const onDataRef = React.useRef<IDisposable | null>(null);
  const inputModeRef = React.useRef<InputMode>(inputMode);
  React.useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);

  // target.kind 變動時 mode 鎖回 attach(shell 永遠 attach)+ inputMode 回 stream
  // targetId 給 effects 用 dep,穩定字串而非 union object
  const targetId =
    target.kind === "tmux" ? `tmux:${target.session.name}` : "shell";
  React.useEffect(() => {
    return () => {
      setMode("attach");
      setInputMode("stream");
    };
  }, [host.id, targetId]);

  // shell target 不允許 capture mode(server 端沒 tmux,不能 capture-pane)
  React.useEffect(() => {
    if (target.kind === "shell" && mode === "capture") {
      setMode("attach");
    }
  }, [target.kind, mode]);

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

  // xterm.onResize → 通知 backend(attach mode 才有意義)
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

  // xterm.disableStdin 跟 mode + inputMode 走
  React.useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;
    const enabled = mode === "attach" && inputMode === "stream";
    term.options.disableStdin = !enabled;
  }, [mode, inputMode]);

  // Capture 模式 — 只 tmux target 適用,shell 不該進這
  React.useEffect(() => {
    if (mode !== "capture") return;
    if (target.kind !== "tmux") return;
    const sessionName = target.session.name;

    const writeResult = (r: CaptureResult) => {
      const t = xtermRef.current;
      if (!t) return;
      t.clear();
      t.write(r.content);
      setCapturedAt(r.captured_at);
    };

    setRefreshing(true);
    api
      .captureSession(host.id, sessionName)
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
    const eventName = `capture-updated:${host.id}:${sessionName}`;
    listen<CaptureResult>(eventName, (e) => writeResult(e.payload))
      .then((un) => {
        unlisten = un;
      })
      .catch((err) => console.warn("[SessionPanel] listen failed:", err));

    return () => {
      unlisten?.();
    };
  }, [mode, host.id, targetId, target]);

  // Attach 模式 — tmux target 走 attachSession;shell target 走 attachShell
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
        if (target.kind === "tmux") {
          aid = await api.attachSession(
            host.id,
            target.session.name,
            cols,
            rows,
          );
        } else {
          aid = await api.attachShell(host.id, cols, rows);
        }
        if (cancelled) {
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
          // Shell 沒 capture 可退,EOF 就直接離開 panel
          if (target.kind === "shell") {
            onBack?.();
          } else {
            setMode("capture");
          }
        });

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
        if (target.kind === "shell") {
          onBack?.();
        } else {
          setMode("capture");
        }
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
  }, [mode, host.id, targetId, target, onBack]);

  const handleRefresh = async () => {
    if (target.kind !== "tmux") return;
    const sessionName = target.session.name;
    setRefreshing(true);
    try {
      const r = await api.captureSession(host.id, sessionName);
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
    // Shell 沒 capture 可退,Detach 就是離開 panel
    if (target.kind === "shell") {
      onBack?.();
      return;
    }
    setMode((m) => (m === "capture" ? "attach" : "capture"));
  };

  const handleLineSend = (text: string) => {
    if (!attachId) return;
    api.writeToSession(attachId, text + "\r").catch((err) => {
      toast.error(`Send 失敗:${String(err)}`);
    });
  };

  const isShell = target.kind === "shell";
  const titleIcon = isShell ? (
    <Zap className="h-4 w-4 text-amber-500" />
  ) : (
    <TerminalIcon className="h-4 w-4 text-muted-foreground" />
  );
  const titleText = isShell ? "shell" : target.session.name;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mt-0.5 rounded p-1 text-muted-foreground hover:bg-muted"
              title="返回上一層"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              {titleIcon}
              <h2 className="truncate text-base font-semibold">{titleText}</h2>
              <span className="shrink-0 text-xs text-muted-foreground">
                @ {host.display_name}
              </span>
              <ModeBadge mode={mode} target={target} />
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {host.ssh_user}@{host.ssh_host}:{host.ssh_port}
              {target.kind === "tmux" && (
                <>
                  {" · "}
                  {target.session.attached ? "attached" : "idle"} ·{" "}
                  {target.session.windows} window
                  {target.session.windows > 1 ? "s" : ""} · 最後活動{" "}
                  {relativeTime(target.session.activity)}
                </>
              )}
              {target.kind === "shell" && " · 直連 login shell(無 tmux)"}
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
          {mode === "capture" && target.kind === "tmux" && (
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
              isShell
                ? "斷開 shell 連線回上一層"
                : mode === "capture"
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
      {mode === "capture" && target.kind === "tmux" && (
        <SendBar host={host} session={target.session} />
      )}
    </div>
  );
}

function ModeBadge({
  mode,
  target,
}: {
  mode: Mode;
  target: SessionPanelTarget;
}) {
  if (target.kind === "shell") {
    return (
      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
        shell
      </span>
    );
  }
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
