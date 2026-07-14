import * as React from "react";
import { Terminal as XTerm, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { installOsc52Handler } from "../lib/osc52";
import { installUnicodeWidths } from "../lib/xterm-unicode";
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
  // 終端目前尺寸(cols×rows)— header 顯示,兼作 desync 診斷用(D-30)
  const [termDims, setTermDims] = React.useState<{ cols: number; rows: number } | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [capturedAt, setCapturedAt] = React.useState<string | null>(null);

  const onDataRef = React.useRef<IDisposable | null>(null);
  // 滾輪 → tmux copy-mode 用(NOTES D-24)。attachId 是 state 會過時,wheel
  // handler 在 init effect 註冊一次,所以走 ref 讀即時值。
  const attachIdRef = React.useRef<string | null>(null);
  // 節流:scrollSession in-flight 時把後續 delta 累進 pending(帶正負號,
  // 正 = 往回捲),完成後若還有 pending 再送一次 → 最多一個在途 + 一個排隊。
  const scrollInflightRef = React.useRef(false);
  const scrollPendingRef = React.useRef(0);

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
      // unicode API(寬度對齊 tmux)是 proposed,需開這旗標
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    // 對齊新版 tmux 的 emoji/CJK 寬度,避免行頭殘留字(D-28)。要在 open/write 前。
    installUnicodeWidths(term);
    // Forward remote OSC 52 (tmux set-clipboard) to host OS clipboard.
    installOsc52Handler(term);
    term.open(containerRef.current);
    xtermRef.current = term;
    fitRef.current = fit;
    requestAnimationFrame(() => fit.fit());

    // 滾輪在 alt-screen(tmux attach 的全螢幕重畫)時,xterm 預設把滾輪翻成
    // 方向鍵 ↑/↓ 送給 inner app → 誤觸歷史選擇,且 alt buffer 沒 scrollback
    // 根本看不到先前內容。改成吞掉預設、走 tmux copy-mode 看歷史(NOTES D-24)。
    // normal buffer(capture mode / shell 在 normal buffer 時)維持預設滾 scrollback。
    const flushScroll = () => {
      const aid = attachIdRef.current;
      const pending = scrollPendingRef.current;
      if (!aid || pending === 0) {
        scrollPendingRef.current = 0;
        return;
      }
      scrollPendingRef.current = 0;
      scrollInflightRef.current = true;
      api
        .scrollSession(aid, pending > 0, Math.min(Math.abs(pending), 500))
        .catch((err) => console.warn("[SessionPanel] scrollSession failed", err))
        .finally(() => {
          scrollInflightRef.current = false;
          if (scrollPendingRef.current !== 0) flushScroll();
        });
    };
    term.attachCustomWheelEventHandler((e) => {
      // 只在 alt-screen 接管;normal buffer 走 xterm 預設(滾自己的 scrollback)
      if (term.buffer.active.type !== "alternate") return true;
      if (!attachIdRef.current) return true; // 還沒 attach,別吞滾輪
      // D-33:inner app(claude code / vim / less、或 tmux `mouse on`)自己開了
      // mouse tracking → 這顆滾輪該交給它,放行讓 xterm 轉成 mouse event 走
      // onData → PTY → tmux → app 自己捲(等同 Tabby / 一般終端機行為)。
      // D-24 的 tmux copy-mode 只在「app 沒開 mouse」時當看 tmux 歷史的路 —
      // 否則 alt-screen app 在 tmux 裡沒有 tmux 層 scrollback,copy-mode 會 0/0
      // 滾了沒反應(owner 回報 sc.png)。不碰輸入路徑,輸入賣點不受影響。
      if (term.modes.mouseTrackingMode !== "none") return true;
      // deltaMode 1=行、2=頁,其餘當 pixel(一格 ~100px);每 tick 捲 3 行
      const ticks =
        e.deltaMode === 1
          ? e.deltaY
          : e.deltaMode === 2
            ? e.deltaY * 10
            : e.deltaY / 100;
      const lines = Math.max(1, Math.round(Math.abs(ticks))) * 3;
      // deltaY < 0 = 滾輪往上 = 往回看歷史(pending 正向)
      scrollPendingRef.current += e.deltaY < 0 ? lines : -lines;
      if (!scrollInflightRef.current) flushScroll();
      return false; // 吞掉,別讓 xterm 翻成方向鍵
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
      setTermDims({ cols, rows });
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
        // D-32:attach「之前」先等佈局定案再 fit,確保量到的是最終可見尺寸
        // (非全寬 / sidebar 佔位時尤其重要)。舊版「attach effect 一觸發就同步 fit」
        // 常在容器 layout 定案前跑、讀到過寬 cols(D-29 診斷)→ 送太寬給 tmux →
        // tmux 第一屏畫太寬、之後 reflow → 花屏 / 行頭殘字 / 換行錯位(字寬像跑掉)。
        // 用雙 rAF 等一次 layout flush 後再量,送對 cols/rows,tmux 第一屏就畫對,
        // 不必事後補畫。完全在 attach 前做,不碰 attach 後輸入路徑(D-31 移除的
        // nudge 不加回,輸入保持乾淨)。
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        if (cancelled) return;
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
        attachIdRef.current = aid;

        // D-31:移除 D-29/D-30 的「attach 後 nudge 尺寸」。那招(D-30 送 rows-1 再
        // 送回 rows 逼 tmux 全重畫)在 attach 後 250~420ms 內跑,正好撞上使用者
        // attach 完馬上打字/貼上 → tmux 重繪輸出 + reflow 與輸入交錯 → 多空白、
        // 貼上不全(核心輸入賣點壞掉,owner 回報 v0.1.8/v0.1.9 兩者都中)。
        // 回到 v0.1.7 行為:attach 前 fit 一次、之後靠 ResizeObserver;非全寬花屏
        // 用手動拖視窗 workaround,待日後找不干擾輸入的解法。輸入正確優先。

        unlistenOutput = await listen<string>(
          `attach-output-${aid}`,
          (e) => {
            const t = xtermRef.current;
            if (!t) return;
            // 直接寫進 xterm,不動 alt-screen 切換。先前 strip 掉 alt-screen
            // (\x1b[?1049h/l 等)是想把 tmux 輸出留在 normal buffer scrollback,
            // 但 tmux 用「絕對游標定位」重畫,xterm 在 normal buffer 時座標會
            // desync → 重複片段 / 輸入錯亂(舊 Bug 2/3)。讓 xterm 正常用
            // alternate buffer,座標才對得上。看歷史改用 tmux copy-mode 或 capture。
            t.write(e.payload);
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
      attachIdRef.current = null;
      scrollPendingRef.current = 0;
    };
  }, [mode, host.id, targetId, target, onBack]);

  // D-34:F5 / 重繪鈕 = 手動強制重繪。行頭殘字(tmux 與 xterm 字寬算法在部分
  // 字元上不一致,tmux 絕對定位補畫時蓋不到舊字)目前無法根治 —— 寬度表跟各
  // host 的 tmux 版本綁定。owner 觀察「resize 一下就好」,所以模擬 resize:
  // 對 tmux 送 rows-1 → rows 兩次 SIGWINCH 逼整屏重畫。與 D-30 自動 nudge 不同,
  // 這是使用者主動觸發,不會撞輸入。
  const redrawInflightRef = React.useRef(false);
  const forceRedraw = React.useCallback(async () => {
    const aid = attachIdRef.current;
    const term = xtermRef.current;
    if (!aid || !term || redrawInflightRef.current) return;
    redrawInflightRef.current = true;
    try {
      const { cols, rows } = term;
      await api.resizeSession(aid, cols, rows > 1 ? rows - 1 : rows + 1);
      await api.resizeSession(aid, cols, rows);
      // 順手叫 renderer 把現有 buffer 全行重畫(防純 render 層殘影)
      term.refresh(0, term.rows - 1);
    } catch (err) {
      console.warn("[SessionPanel] forceRedraw failed", err);
    } finally {
      redrawInflightRef.current = false;
    }
  }, []);

  // F5 → forceRedraw。capture phase 攔:preventDefault 防 webview 整頁 reload,
  // stopPropagation 防 xterm 把 F5(\x1b[15~)送進 PTY。
  React.useEffect(() => {
    if (mode !== "attach" || !attachId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F5") return;
      e.preventDefault();
      e.stopPropagation();
      void forceRedraw();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [mode, attachId, forceRedraw]);

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
              {termDims && (
                <>
                  {" · "}
                  <code className="font-mono">
                    {termDims.cols}×{termDims.rows}
                  </code>
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
          {mode === "attach" && attachId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void forceRedraw()}
              title="強制重繪(F5)— 畫面出現行頭殘字時按這個"
            >
              <RefreshCw className="h-4 w-4" />
              重繪
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

