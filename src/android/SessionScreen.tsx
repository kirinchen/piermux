import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";

import type { AndroidTarget } from "./AndroidApp";
import { useHostsList } from "@/hooks/useHosts";
import { api } from "@/lib/tauri";
import type { CaptureResult } from "@/lib/types";
import { QuickKeyBar } from "./QuickKeyBar";
import { ModifierBar } from "./ModifierBar";
import { useViewportHeight } from "./useViewportHeight";

type Mode = "capture" | "attach";
// Line:打字 → Enter 整段送(預設,IME 友善,避免 colony 那種誤送)
// Stream:字元即時送(vim / less / 互動 prompt 用),對齊 desktop SessionPanel
type InputMode = "line" | "stream";

type Props = {
  hostId: string;
  target: AndroidTarget;
  onBack: () => void;
};

export function SessionScreen({ hostId, target, onBack }: Props) {
  const { data: hosts } = useHostsList();
  const host = hosts?.find((h) => h.id === hostId);
  const [mode, setMode] = useState<Mode>("capture");
  // 預設 line(Android line buffer 是核心賣點);Stream 是 toggle 過去的選項
  const [inputMode, setInputMode] = useState<InputMode>("line");
  // 軟鍵盤友善:用 visualViewport 高度當 root 高度,輸入框永遠浮在鍵盤上方
  const viewportHeight = useViewportHeight();

  // shell 直連沒 capture 概念,強制 attach。M2d 才真填 attach。
  const effectiveMode: Mode = target.kind === "shell" ? "attach" : mode;
  const title =
    target.kind === "shell" ? "⚡ shell" : `tmux: ${target.session}`;

  return (
    <div
      className="flex flex-col overflow-hidden bg-zinc-950 text-zinc-100 pt-safe pb-safe"
      style={{ height: viewportHeight }}
    >
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
        {effectiveMode === "attach" && (
          <InputModeToggle inputMode={inputMode} onChange={setInputMode} />
        )}
      </header>

      {effectiveMode === "capture" && target.kind === "tmux" ? (
        <CaptureView hostId={hostId} sessionName={target.session} />
      ) : (
        <AttachView
          hostId={hostId}
          target={target}
          inputMode={inputMode}
          onBack={onBack}
        />
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

// Line / Stream 切換 —— 對齊 desktop SessionPanel 的 InputModeToggle。
// Stream 用琥珀色提示「字元即時送」要小心(會「打到一半送出去」)。
function InputModeToggle({
  inputMode,
  onChange,
}: {
  inputMode: InputMode;
  onChange: (m: InputMode) => void;
}) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-md border border-zinc-700">
      <button
        type="button"
        onClick={() => onChange("line")}
        title="Line buffer:打字 → Enter 整段送(IME 友善)"
        className={
          "px-3 py-2 text-xs font-medium " +
          (inputMode === "line"
            ? "bg-blue-600 text-white"
            : "bg-zinc-900 text-zinc-300 active:bg-zinc-800")
        }
      >
        Line
      </button>
      <button
        type="button"
        onClick={() => onChange("stream")}
        title="Stream:字元即時送(vim / less / 互動 prompt 用)"
        className={
          "px-3 py-2 text-xs font-medium " +
          (inputMode === "stream"
            ? "bg-amber-600 text-white"
            : "bg-zinc-900 text-zinc-300 active:bg-zinc-800")
        }
      >
        Stream
      </button>
    </div>
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

    const triggerCapture = () => {
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
    };

    triggerCapture();

    let unlisten: UnlistenFn | undefined;
    const eventName = `capture-updated:${hostId}:${sessionName}`;
    listen<CaptureResult>(eventName, (e) => writeResult(e.payload))
      .then((un) => {
        unlisten = un;
      })
      .catch((err) => console.warn("[SessionScreen] listen failed:", err));

    // M2e — 回前景時自動重抓,避免看到 stale capture
    const onVisible = () => {
      if (document.visibilityState === "visible") triggerCapture();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      unlisten?.();
      document.removeEventListener("visibilitychange", onVisible);
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

// 對齊 desktop SessionPanel.tsx attach effect:用 strip-alt-screen 法把
// tmux 所有輸出推進 xterm 的 normal-buffer scrollback,不在 alt-screen 重畫,
// scrollback 滾得到歷史。Re: 換 Ctrl+letter 為 raw byte 1-26(0x01..0x1a)。
const STRIP_ALT_SCREEN_RE = /\x1b\[\?(?:1049|47|1047|1048)[hl]/g;

function AttachView({
  hostId,
  target,
  inputMode,
  onBack,
}: {
  hostId: string;
  target: AndroidTarget;
  inputMode: InputMode;
  onBack: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const onDataRef = useRef<IDisposable | null>(null);
  const [attachId, setAttachId] = useState<string | null>(null);
  const [buffer, setBuffer] = useState("");
  const [ctrlSticky, setCtrlSticky] = useState(false);

  // inputMode 給 attach effect 內的 onData handler 當 dep 用,避免重 attach
  const inputModeRef = useRef<InputMode>(inputMode);
  useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);

  // xterm 初始化(只一次)
  useEffect(() => {
    if (!containerRef.current || xtermRef.current) return;
    const term = new XTerm({
      fontFamily:
        '"JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 12,
      lineHeight: 1.2,
      theme: { background: "#0a0a0a", foreground: "#e5e5e5" },
      convertEol: true,
      disableStdin: true,
      scrollback: 20000,
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

  // Stream → xterm 直接收鍵盤;Line → 關 stdin,輸入交給下方 textarea。
  // 放在 init effect 之後,確保 term 已建立(重進 attach 時 inputMode 可能已是 stream)。
  // 切到 stream 時順手清掉 Ctrl sticky(stream 沒 textarea 可攔)。
  useEffect(() => {
    const term = xtermRef.current;
    if (term) term.options.disableStdin = inputMode !== "stream";
    if (inputMode === "stream") setCtrlSticky(false);
  }, [inputMode]);

  // 容器 resize + soft keyboard 收放 → visualViewport 觸發
  useEffect(() => {
    if (!containerRef.current) return;
    const refit = () => {
      try {
        fitRef.current?.fit();
      } catch {
        // ignore
      }
    };
    const ro = new ResizeObserver(refit);
    ro.observe(containerRef.current);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", refit);
    return () => {
      ro.disconnect();
      vv?.removeEventListener("resize", refit);
    };
  }, []);

  // xterm.onResize → 通知 backend
  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;
    const disp = term.onResize(({ cols, rows }) => {
      if (attachId) {
        api.resizeSession(attachId, cols, rows).catch((err) => {
          console.warn("[AttachView] resizeSession failed", err);
        });
      }
    });
    return () => disp.dispose();
  }, [attachId]);

  // Attach 主流程 — 對齊 desktop SessionPanel
  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;

    let aid: string | null = null;
    let unlistenOutput: UnlistenFn | undefined;
    let unlistenClosed: UnlistenFn | undefined;
    let cancelled = false;

    const start = async () => {
      try {
        try {
          fitRef.current?.fit();
        } catch {
          // 退預設 80x24
        }
        term.clear();
        const cols = term.cols || 80;
        const rows = term.rows || 24;
        aid =
          target.kind === "tmux"
            ? await api.attachSession(hostId, target.session, cols, rows)
            : await api.attachShell(hostId, cols, rows);
        if (cancelled) {
          api.detachSession(aid).catch(() => {});
          return;
        }
        setAttachId(aid);

        unlistenOutput = await listen<string>(`attach-output-${aid}`, (e) => {
          const t = xtermRef.current;
          if (!t) return;
          t.write(e.payload.replace(STRIP_ALT_SCREEN_RE, ""));
        });
        unlistenClosed = await listen(`attach-closed-${aid}`, () => {
          toast.message("Attach 已關閉(server 端 EOF / exit)");
          onBack();
        });

        // Stream mode:xterm 收到的鍵盤輸入直接打進 PTY(對齊 desktop)
        const disp = term.onData((data) => {
          if (inputModeRef.current !== "stream") return;
          if (aid) {
            api.writeToSession(aid, data).catch((err) => {
              console.warn("[AttachView] writeToSession failed", err);
            });
          }
        });
        onDataRef.current = disp;
      } catch (err) {
        if (cancelled) return;
        toast.error(`Attach 失敗:${String(err)}`);
        onBack();
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
      xtermRef.current?.clear();
      setAttachId(null);
    };
  }, [hostId, target, onBack]);

  const writeRaw = (data: string) => {
    if (!attachId) return;
    api.writeToSession(attachId, data).catch((err) => {
      toast.error(`送失敗:${String(err)}`);
    });
  };

  const sendBuffer = () => {
    if (!attachId || buffer.length === 0) return;
    writeRaw(buffer + "\r");
    setBuffer("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    // Ctrl sticky:下一個 a-zA-Z 直接 wrap 成 Ctrl+letter raw byte
    if (ctrlSticky && e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
      e.preventDefault();
      const letter = e.key.toLowerCase();
      const code = letter.charCodeAt(0) - 0x60; // a=1, b=2, ..., z=26
      writeRaw(String.fromCharCode(code));
      setCtrlSticky(false);
      return;
    }
    if (e.key !== "Enter") return;
    // Shift+Enter = textarea 原生換行;純 Enter 才送(對齊 chat app 慣例 + desktop)
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    sendBuffer();
  };

  return (
    <>
      <div className="relative flex-1 bg-[#0a0a0a]">
        <div ref={containerRef} className="absolute inset-0" />
      </div>

      <ModifierBar
        disabled={!attachId}
        ctrlActive={ctrlSticky}
        onToggleCtrl={() => setCtrlSticky((v) => !v)}
        onSendBytes={writeRaw}
      />

      {inputMode === "stream" ? (
        <footer className="border-t border-zinc-800 bg-amber-500/10 px-3 py-2 text-xs leading-snug text-amber-300">
          ⚠ Stream mode — 點終端機打字會即時送出(vim / less / 互動 prompt
          用)。打 AI agent 對話建議切回 Line,避免「打到一半送出去」。
        </footer>
      ) : (
        <div className="flex items-end gap-2 border-t border-zinc-800 bg-zinc-950 px-2 py-2">
          <textarea
            ref={inputRef}
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!attachId}
            rows={2}
            placeholder={
              ctrlSticky
                ? "下個字母會送 Ctrl+letter"
                : "打字 → Enter 整段送(IME 友善)"
            }
            className="flex-1 resize-none rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-base text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button
            type="button"
            onClick={sendBuffer}
            disabled={!attachId || buffer.length === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white active:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
    </>
  );
}
