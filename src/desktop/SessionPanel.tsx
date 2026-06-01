import * as React from "react";
import { Terminal as XTerm, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { installOsc52Handler } from "../lib/osc52";
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
import { SendBar } from "./SendBar";
import { PasteConfirmDialog } from "@/components/PasteConfirmDialog";
import { usePasteGuard } from "@/components/usePasteGuard";

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

export function SessionPanel({ host, target, onBack }: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const xtermRef = React.useRef<XTerm | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);

  // shell 永遠 attach mode(沒有 tmux capture-pane 概念)。tmux 預設 attach(D-10)
  const [mode, setMode] = React.useState<Mode>("attach");
  const [attachId, setAttachId] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [capturedAt, setCapturedAt] = React.useState<string | null>(null);

  const onDataRef = React.useRef<IDisposable | null>(null);

  // target.kind 變動時 mode 鎖回 attach(shell 永遠 attach)
  // targetId 給 effects 用 dep,穩定字串而非 union object
  const targetId =
    target.kind === "tmux" ? `tmux:${target.session.name}` : "shell";
  React.useEffect(() => {
    return () => {
      setMode("attach");
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
      // 20000 行 ≈ 1.6 MB。Attach mode 用 strip-alt-screen 法後,
      // tmux 的全部輸出都會走 normal buffer scrollback,需要大一點容量
      scrollback: 20000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    // Forward remote OSC 52 (tmux set-clipboard) to host OS clipboard.
    installOsc52Handler(term);
    term.open(containerRef.current);
    xtermRef.current = term;
    fitRef.current = fit;
    requestAnimationFrame(() => fit.fit());

    // Wheel handler 安全網:理論上 attach 已 strip alt-screen,xterm 永遠在 normal
    // buffer,wheel 預設行為(滾 scrollback)會生效不需要這層。但為了防禦性 — 萬一
    // 哪個 inner app 自己送了 alt-screen toggle 沒被 strip 漏掉,這邊吞掉避免 wheel
    // 被翻成 arrow up/down 誤觸 bash history
    term.attachCustomWheelEventHandler((event) => {
      if (term.buffer.active.type === "alternate") {
        event.preventDefault();
        return false;
      }
      return true;
    });

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

  // xterm.disableStdin 跟 mode 走(D-20:Line/Stream toggle 拿掉後永遠 stream)
  React.useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;
    term.options.disableStdin = mode !== "attach";
  }, [mode]);

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
        // 在送 attach 之前強制 fit() 一次 — init effect 用 requestAnimationFrame
        // 排 fit,可能在這個 attach effect 跑時還沒 fire,導致 term.cols/rows 還是
        // 預設 80x24。tmux attach 第一次重畫用我們送的 cols/rows,送錯就只畫那麼大,
        // 之後 resize 也補不回 history。Owner 反映「要先 detach 再 attach 才正常」
        // = 第二次重 attach 時 fit 已經做過,讀到對的尺寸
        try {
          fitRef.current?.fit();
        } catch {
          // container 還沒 layout 完;退回預設 80x24,resize 之後 tmux 會補
        }
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
            if (!t) return;
            // 把 alt-screen toggle 從進來的 bytes strip 掉 → xterm 一直留在 normal
            // buffer → scrollback(20000 行)生效 → 滾輪 / scrollbar 直接在主 xterm
            // 滾就能看到先前內容(像 Xshell 那樣)。代價是 tmux 的 in-place 重畫
            // 會把舊內容推進 scrollback,看起來會有重複片段,但能看到歷史比好看重要。
            // \x1b[?1049h/l = smcup/rmcup;47/1047/1048 是 legacy alt-screen 變體
            const cleaned = e.payload.replace(
              /\x1b\[\?(?:1049|47|1047|1048)[hl]/g,
              "",
            );
            t.write(cleaned);
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
      // Detach 或切到 capture mode 時清空 xterm 內容 + scrollback。
      // 對齊 user 預期:歷史紀錄是 attach 期間限定,detach 後不該還在
      xtermRef.current?.clear();
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

  // D-20 multi-line paste guard:attach 中 ≥3 行 paste 彈 dialog,
  // user 編輯/檢視後才寫進 PTY(對齊 XShell)。
  const paste = usePasteGuard({
    containerRef,
    enabled: mode === "attach" && attachId !== null,
    onPaste: (text) => {
      if (!attachId) return;
      api.writeToSession(attachId, text).catch((err) => {
        toast.error(`Paste 失敗:${String(err)}`);
      });
    },
  });

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

      {mode === "capture" && target.kind === "tmux" && (
        <SendBar host={host} session={target.session} />
      )}

      {paste.pending !== null && (
        <PasteConfirmDialog
          initialText={paste.pending}
          onConfirm={paste.confirm}
          onCancel={paste.cancel}
        />
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

