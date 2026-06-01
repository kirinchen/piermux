import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { installOsc52Handler } from "@/lib/osc52";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";

import type { AndroidTarget } from "./AndroidApp";
import { useHostsList } from "@/hooks/useHosts";
import { api } from "@/lib/tauri";
import type { CaptureResult } from "@/lib/types";
import { QuickKeyBar } from "./QuickKeyBar";
import { ModifierBar } from "./ModifierBar";
import { useViewportHeight } from "./useViewportHeight";
import { PasteConfirmDialog } from "@/components/PasteConfirmDialog";
import { usePasteGuard } from "@/components/usePasteGuard";

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
      </header>

      {effectiveMode === "capture" && target.kind === "tmux" ? (
        <CaptureView hostId={hostId} sessionName={target.session} />
      ) : (
        <AttachView hostId={hostId} target={target} onBack={onBack} />
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
    // Forward remote OSC 52 (tmux set-clipboard) to host OS clipboard.
    installOsc52Handler(term);
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
  onBack,
}: {
  hostId: string;
  target: AndroidTarget;
  onBack: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const onDataRef = useRef<IDisposable | null>(null);
  const [attachId, setAttachId] = useState<string | null>(null);
  const [ctrlSticky, setCtrlSticky] = useState(false);

  // CTRL sticky 攔 xterm keydown(D-20:line textarea 拿掉後改攔 xterm),
  // 用 ref 接 state 讓 handler 不必重綁
  const ctrlStickyRef = useRef(ctrlSticky);
  useEffect(() => {
    ctrlStickyRef.current = ctrlSticky;
  }, [ctrlSticky]);

  const writeRawRef = useRef<(data: string) => void>(() => {});

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
      // D-20:Line/Stream toggle 拿掉後 attach 永遠雙向 → stdin 預設開
      disableStdin: false,
      scrollback: 20000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // Forward remote OSC 52 (tmux set-clipboard) to host OS clipboard.
    installOsc52Handler(term);
    term.open(containerRef.current);
    xtermRef.current = term;
    fitRef.current = fit;

    // CTRL sticky:亮燈時下一個 a-zA-Z keydown 被 wrap 成 Ctrl+letter raw byte
    // 後 return false 不交給 xterm,避免裸字母也被送進去
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      if (!ctrlStickyRef.current) return true;
      if (e.key.length !== 1 || !/^[a-zA-Z]$/.test(e.key)) return true;
      e.preventDefault();
      const letter = e.key.toLowerCase();
      const code = letter.charCodeAt(0) - 0x60; // a=1, b=2, ..., z=26
      writeRawRef.current(String.fromCharCode(code));
      setCtrlSticky(false);
      return false;
    });

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

        // xterm 鍵盤輸入 → 直送 PTY(D-20:Line/Stream toggle 拿掉後恆 stream)
        const disp = term.onData((data) => {
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
  // Effect 內 / CTRL sticky handler 經由 ref 拿最新 writeRaw
  useEffect(() => {
    writeRawRef.current = writeRaw;
  });

  // D-20 multi-line paste guard:≥3 行 paste 彈 dialog,user 編輯後才送
  const paste = usePasteGuard({
    containerRef,
    enabled: attachId !== null,
    onPaste: writeRaw,
  });

  return (
    <>
      <div
        className="relative flex-1 bg-[#0a0a0a]"
        onClick={() => {
          // 點 terminal 區域 → focus xterm helper textarea → 軟鍵盤跳出來
          containerRef.current
            ?.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea")
            ?.focus();
        }}
      >
        <div ref={containerRef} className="absolute inset-0" />
      </div>

      <ModifierBar
        disabled={!attachId}
        ctrlActive={ctrlSticky}
        onToggleCtrl={() => setCtrlSticky((v) => !v)}
        onSendBytes={writeRaw}
      />

      {paste.pending !== null && (
        <PasteConfirmDialog
          initialText={paste.pending}
          onConfirm={paste.confirm}
          onCancel={paste.cancel}
        />
      )}
    </>
  );
}
