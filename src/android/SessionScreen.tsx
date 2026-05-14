import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";

import type { AndroidTarget } from "./AndroidApp";
import { useHostsList } from "@/hooks/useHosts";
import { api } from "@/lib/tauri";
import type { CaptureResult } from "@/lib/types";
import { QuickKeyBar } from "./QuickKeyBar";

type Mode = "capture" | "attach";

type Props = {
  hostId: string;
  target: AndroidTarget;
  onBack: () => void;
};

export function SessionScreen({ hostId, target, onBack }: Props) {
  const { data: hosts } = useHostsList();
  const host = hosts?.find((h) => h.id === hostId);
  const [mode, setMode] = useState<Mode>("capture");

  // shell 直連沒 capture 概念,強制 attach。M2d 才真填 attach。
  const effectiveMode: Mode = target.kind === "shell" ? "attach" : mode;
  const title =
    target.kind === "shell" ? "⚡ shell" : `tmux: ${target.session}`;

  return (
    <div className="flex h-dvh flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center gap-2 border-b border-zinc-800 px-2 py-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-3 py-2 text-sm active:bg-zinc-800"
        >
          ‹
        </button>
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          {host && (
            <div className="truncate text-xs text-zinc-500">
              {host.display_name}
            </div>
          )}
        </div>
        {target.kind === "tmux" && (
          <div className="flex overflow-hidden rounded-md border border-zinc-700">
            <ModeTab
              active={effectiveMode === "capture"}
              onClick={() => setMode("capture")}
              label="Capture"
            />
            <ModeTab
              active={effectiveMode === "attach"}
              onClick={() => setMode("attach")}
              label="Attach"
            />
          </div>
        )}
      </header>

      {effectiveMode === "capture" && target.kind === "tmux" ? (
        <CaptureView hostId={hostId} sessionName={target.session} />
      ) : (
        <AttachPlaceholder />
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-3 py-2 text-xs font-medium " +
        (active
          ? "bg-blue-600 text-white"
          : "bg-zinc-900 text-zinc-300 active:bg-zinc-800")
      }
    >
      {label}
    </button>
  );
}

function CaptureView({
  hostId,
  sessionName,
}: {
  hostId: string;
  sessionName: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
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
    term.open(containerRef.current);
    xtermRef.current = term;
    fitRef.current = fit;
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        // size 還沒穩
      }
    });
    return () => {
      term.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
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

  useEffect(() => {
    const writeResult = (r: CaptureResult) => {
      const term = xtermRef.current;
      if (!term) return;
      term.clear();
      term.write(r.content);
    };

    setRefreshing(true);
    api
      .captureSession(hostId, sessionName)
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
    const eventName = `capture-updated:${hostId}:${sessionName}`;
    listen<CaptureResult>(eventName, (e) => writeResult(e.payload))
      .then((un) => {
        unlisten = un;
      })
      .catch((err) => console.warn("[SessionScreen] listen failed:", err));

    return () => {
      unlisten?.();
    };
  }, [hostId, sessionName]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.captureSession(hostId, sessionName);
    } catch (err) {
      toast.error(`refresh 失敗:${String(err)}`);
    } finally {
      setRefreshing(false);
    }
  };

  const sendKey = async (payload: string, literal: boolean) => {
    setSending(true);
    try {
      await api.sendMessage(hostId, sessionName, payload, false, literal);
    } catch (err) {
      toast.error(`送失敗:${String(err)}`);
    } finally {
      setSending(false);
    }
  };

  const sendDraft = async () => {
    if (!draft || sending) return;
    setSending(true);
    try {
      await api.sendMessage(hostId, sessionName, draft, true, true);
      setDraft("");
    } catch (err) {
      toast.error(`送失敗:${String(err)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="relative flex-1 bg-[#0a0a0a]">
        <div ref={containerRef} className="absolute inset-0" />
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="absolute right-2 top-2 rounded-md bg-zinc-900/80 px-3 py-2 text-xs backdrop-blur active:bg-zinc-800 disabled:opacity-50"
        >
          {refreshing ? "…" : "🔄"}
        </button>
      </div>

      <QuickKeyBar disabled={sending} onSendKey={sendKey} />

      <div className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-950 px-2 py-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              sendDraft();
            }
          }}
          placeholder="送一段訊息到 tmux pane(Enter 送)"
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-base text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
          autoCapitalize="none"
          autoCorrect="off"
        />
        <button
          type="button"
          onClick={sendDraft}
          disabled={!draft || sending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white active:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </>
  );
}

function AttachPlaceholder() {
  return (
    <main className="flex-1 overflow-y-auto p-4 text-sm text-zinc-400">
      <p className="mb-2">Attach mode 是 M2d。</p>
      <p>會接 xterm.js 雙向 PTY + line buffer + modifier bar。</p>
    </main>
  );
}
