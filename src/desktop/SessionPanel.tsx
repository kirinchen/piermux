import * as React from "react";
import { Terminal as XTerm, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { installOsc52Handler } from "../lib/osc52";
import { installUnicodeWidths } from "../lib/xterm-unicode";
import { installWebLinks } from "../lib/xterm-links";
import { fontSizeFor, getTermPrefs } from "../lib/term-prefs";
import { diffGrids, formatGridDiff, snapshotScreenRows } from "../lib/grid-diff";
import { applyHostWidths, resetDefaultProvider } from "../lib/width-profile";
import { useTermFontSync } from "../lib/useTermPrefs";
import {
  Terminal as TerminalIcon,
  Zap,
  RefreshCw,
  Loader2,
  ArrowLeft,
  Plug,
  Power,
  Upload,
} from "lucide-react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
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

// D-37 自動重繪參數:attach 輸出停 SETTLE 後檢查一次;距最後一次「鍵盤」輸入
// 需 ≥ IDLE 才發動(不撞輸入 —— D-31 紅線);重繪自己引發的整屏 echo 在
// SUPPRESS 內不再排程(防自迴圈);兩次自動重繪至少隔 COOLDOWN(限流)。
const REDRAW_OUTPUT_SETTLE_MS = 400;
const REDRAW_INPUT_IDLE_MS = 2000;
const REDRAW_SUPPRESS_MS = 1500;
const REDRAW_COOLDOWN_MS = 3000;
// D-41 蒐證:F5 前的 grid diff capture 逾時 —— 超過就跳過蒐證直接重繪
const D41_CAPTURE_TIMEOUT_MS = 1500;
// D-41 flight recorder 上限(chars)。超過就整段放棄 —— ring buffer 沒辦法
// 從乾淨狀態重放,留一半沒意義
const D41_RECORD_CAP_CHARS = 16 * 1024 * 1024;

// D-41 flight recorder 的一筆記錄:d = 收到的 PTY 輸出 chunk(保留切割邊界),
// r = xterm resize 當下的 [cols, rows]
type RecChunk = { d: string } | { r: [number, number] };

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
  // D-40 拖放上傳:只 tmux target 開放(shell 沒活的 pwd)。dragOver 顯示 overlay。
  const [dragOver, setDragOver] = React.useState(false);

  const onDataRef = React.useRef<IDisposable | null>(null);
  // 滾輪 → tmux copy-mode 用(NOTES D-24)。attachId 是 state 會過時,wheel
  // handler 在 init effect 註冊一次,所以走 ref 讀即時值。
  const attachIdRef = React.useRef<string | null>(null);
  // 節流:scrollSession in-flight 時把後續 delta 累進 pending(帶正負號,
  // 正 = 往回捲),完成後若還有 pending 再送一次 → 最多一個在途 + 一個排隊。
  const scrollInflightRef = React.useRef(false);
  const scrollPendingRef = React.useRef(0);
  // D-37 自動重繪的狀態(全走 ref,不觸發 render)
  const lastInputAtRef = React.useRef(0);
  const autoRedrawTimerRef = React.useRef<number | null>(null);
  const lastAutoRedrawAtRef = React.useRef(0);
  const autoRedrawSuppressUntilRef = React.useRef(0);
  // D-41 flight recorder:attach 起全程錄 PTY 輸出 chunk(保留切割邊界)+
  // xterm resize 時點,F5 蒐證發現 grid 分岔時整包 dump → 離線重放鎖分岔 op
  const recordChunksRef = React.useRef<RecChunk[]>([]);
  const recordCharsRef = React.useRef(0);
  const recordOverflowRef = React.useRef(false);
  // D-41 探針用:Alt+F5 暫停 D-37 自動重繪,讓殘字留在畫面上慢慢驗
  const autoRedrawPausedRef = React.useRef(false);
  // D-41:target / onBack 走 ref —— HostsView 傳 inline object / callback,
  // identity 每次父層 render 都變;若放進 attach effect deps,父層一 re-render
  // 就默默 detach + re-attach(dump1 的殘字就是這樣種下的)。語意變更由
  // targetId(穩定字串)把關。
  const targetRef = React.useRef(target);
  targetRef.current = target;
  const onBackRef = React.useRef(onBack);
  onBackRef.current = onBack;

  // target.kind 變動時 mode 鎖回 attach(shell 永遠 attach)
  // targetId 給 effects 用 dep,穩定字串而非 union object
  const targetId =
    target.kind === "tmux"
      ? `tmux:${target.session.socket}:${target.session.name}`
      : "shell";
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
    // 字型 / 字級走使用者偏好(D-35)。建構當下同步讀,避免先用預設畫一次再重畫。
    const prefs = getTermPrefs();
    const term = new XTerm({
      fontFamily: prefs.fontFamily,
      fontSize: fontSizeFor(prefs),
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
    // 網址點一下開系統瀏覽器(D-36),不是 xterm 預設的 window.open
    installWebLinks(term);
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

  // 設定面板改字型 / 字級 → 即時套用 + refit(D-35)。要放在 xterm 初始化 effect
  // 之後,這樣第一次 render 時 term 已存在。
  useTermFontSync(xtermRef, fitRef);

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
    // D-41:target 走 ref 快照,deps 用 targetId 把關語意變更 —— HostsView 傳
    // inline object,identity 每次父層 render 都變,放 deps 會讓 effect 空轉
    const target = targetRef.current;
    if (target.kind !== "tmux") return;
    const sessionName = target.session.name;
    const socket = target.session.socket;

    const writeResult = (r: CaptureResult) => {
      const t = xtermRef.current;
      if (!t) return;
      t.clear();
      t.write(r.content);
      setCapturedAt(r.captured_at);
    };

    setRefreshing(true);
    api
      .captureSession(host.id, socket, sessionName)
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
    const eventName = `capture-updated:${host.id}:${socket}:${sessionName}`;
    listen<CaptureResult>(eventName, (e) => writeResult(e.payload))
      .then((un) => {
        unlisten = un;
      })
      .catch((err) => console.warn("[SessionPanel] listen failed:", err));

    return () => {
      unlisten?.();
    };
  }, [mode, host.id, targetId]);

  // D-34:F5 / 重繪鈕 = 手動強制重繪。行頭殘字(tmux 與 xterm 字寬算法在部分
  // 字元上不一致,tmux 絕對定位補畫時蓋不到舊字)目前無法根治 —— 寬度表跟各
  // host 的 tmux 版本綁定。owner 觀察「resize 一下就好」,所以模擬 resize:
  // 對 tmux 送 rows-1 → rows 兩次 SIGWINCH 逼整屏重畫。
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

  // D-41 蒐證:按 F5 的瞬間(殘字還在畫面上)先把 xterm grid 跟 tmux 可見畫面
  // diff 一次再重繪 —— diff 非空 = 殘字真的在 xterm grid 裡(tmux↔xterm 分岔,
  // 行 / 欄都印在 console);diff 空但畫面看得到殘字 = renderer 層殘像,修法
  // 完全不同(term.refresh 就該能治)。capture 前後各快照一次,期間畫面有更新
  // 就丟棄避免 race 假陽性;逾時直接放行重繪,F5 手感不變。
  const diagnoseThenRedraw = React.useCallback(async () => {
    const term = xtermRef.current;
    const target = targetRef.current;
    if (term && target.kind === "tmux") {
      try {
        const before = snapshotScreenRows(term);
        const content = await Promise.race([
          api.captureScreen(
            host.id,
            target.session.socket,
            target.session.name,
          ),
          new Promise<null>((resolve) =>
            window.setTimeout(() => resolve(null), D41_CAPTURE_TIMEOUT_MS),
          ),
        ]);
        if (content !== null) {
          const after = snapshotScreenRows(term);
          if (before.join("\n") !== after.join("\n")) {
            console.info("[D-41] grid diff 略過:capture 期間畫面有更新");
          } else {
            const report = diffGrids(after, content);
            if (report.rows.length > 0) {
              console.warn(formatGridDiff(report));
              toast.info(
                `D-41:xterm↔tmux grid 差 ${report.rows.length} 行(詳見 console)`,
              );
              // 連同 flight recorder 一起 dump —— 離線重放鎖第一個分岔 op
              const dump = JSON.stringify({
                version: 1,
                at: new Date().toISOString(),
                hostId: host.id,
                socket: target.session.socket,
                session: target.session.name,
                cols: term.cols,
                rows: term.rows,
                overflow: recordOverflowRef.current,
                tmuxScreen: content,
                xtermRows: after,
                chunks: recordChunksRef.current,
              });
              void api
                .saveDebugDump("d41", dump)
                .then((p) => {
                  console.warn(`[D-41] flight recorder dump → ${p}`);
                  toast.info(`D-41 dump 已存:${p}`);
                })
                .catch((err) =>
                  console.warn("[SessionPanel] D-41 dump save failed", err),
                );
            } else {
              console.info(
                `[D-41] grid diff:0 / ${report.comparedRows} 行一致 —— 殘字若可見即為 renderer 殘像`,
              );
            }
          }
        }
      } catch (err) {
        console.warn("[SessionPanel] D-41 grid diff failed", err);
      }
    }
    await forceRedraw();
  }, [host.id, forceRedraw]);

  // F5 → 蒐證 + forceRedraw。capture phase 攔:preventDefault 防 webview 整頁
  // reload,stopPropagation 防 xterm 把 F5(\x1b[15~)送進 PTY。
  //
  // D-41 renderer 探針(殘字可見但 grid diff = 0 時用,分辨殘字在顯示層的哪一層):
  // - Shift+F5:純 term.refresh(全行重畫)。消 → xterm DOM renderer 漏標 dirty。
  // - Ctrl+F5:compositing 踢一腳(容器 transform 閃一下逼 WebView2 重合成,
  //   不動 buffer 不動 tmux)。refresh 無效但這個消 → WebView2 合成層殘影。
  React.useEffect(() => {
    if (mode !== "attach" || !attachId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F5") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.altKey) {
        autoRedrawPausedRef.current = !autoRedrawPausedRef.current;
        const paused = autoRedrawPausedRef.current;
        console.info(`[D-41] Alt+F5:自動重繪${paused ? "暫停" : "恢復"}`);
        toast.message(
          `D-37 自動重繪:${paused ? "已暫停(殘字會留在畫面上)" : "已恢復"}`,
        );
        return;
      }
      if (e.shiftKey) {
        const t = xtermRef.current;
        t?.refresh(0, t.rows - 1);
        console.info("[D-41] Shift+F5:refresh-only(DOM renderer dirty 探針)");
        return;
      }
      if (e.ctrlKey) {
        const el = containerRef.current;
        if (el) {
          el.style.transform = "translateZ(0) scale(0.999)";
          void el.offsetHeight; // 強制 reflow,確保 transform 真的上到合成層
          window.requestAnimationFrame(() => {
            el.style.transform = "";
          });
        }
        console.info("[D-41] Ctrl+F5:compositing nudge(WebView2 合成層探針)");
        return;
      }
      void diagnoseThenRedraw();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [mode, attachId, diagnoseThenRedraw]);

  // Attach 模式 — tmux target 走 attachSession;shell target 走 attachShell
  React.useEffect(() => {
    if (mode !== "attach") return;
    const term = xtermRef.current;
    if (!term) return;
    // D-41:target 走 ref 快照(語意變更由 targetId dep 把關,見 targetRef 註解)
    const target = targetRef.current;

    let aid: string | null = null;
    let unlistenOutput: UnlistenFn | undefined;
    let unlistenClosed: UnlistenFn | undefined;
    let resizeDisp: IDisposable | undefined; // D-41 flight recorder 的 resize 記錄
    let cancelled = false;

    // D-37:自動重繪(自動版 F5)。行頭殘字(D-34 根因:tmux×xterm 字寬不合)
    // 每次畫面更新 / 滾動後都可能再出現,手動 F5 只是治標 —— owner 已證實
    // 「resize 必治」。改成輸出停 REDRAW_OUTPUT_SETTLE_MS 後自動跑一次 F5 的
    // resize 重繪。輸入保護(D-31 教訓:自動 resize 撞輸入會壞輸入賣點):
    // 距最後一次鍵盤輸入 < IDLE 或距上次重繪 < COOLDOWN → 400ms 後再試;
    // 重繪自己引發的整屏 echo 在 SUPPRESS 內直接放掉(防自迴圈,不重排 ——
    // 真有新內容時輸出會再進來重新排程)。
    const scheduleAutoRedraw = () => {
      if (autoRedrawTimerRef.current !== null) {
        window.clearTimeout(autoRedrawTimerRef.current);
      }
      autoRedrawTimerRef.current = window.setTimeout(() => {
        autoRedrawTimerRef.current = null;
        if (autoRedrawPausedRef.current) return; // D-41 探針:Alt+F5 暫停中
        const now = Date.now();
        if (now < autoRedrawSuppressUntilRef.current) return;
        if (
          now - lastInputAtRef.current < REDRAW_INPUT_IDLE_MS ||
          now - lastAutoRedrawAtRef.current < REDRAW_COOLDOWN_MS
        ) {
          scheduleAutoRedraw();
          return;
        }
        const t = xtermRef.current;
        if (!attachIdRef.current || !t) return;
        if (t.buffer.active.type !== "alternate") return;
        lastAutoRedrawAtRef.current = now;
        autoRedrawSuppressUntilRef.current = now + REDRAW_SUPPRESS_MS;
        void forceRedraw();
      }, REDRAW_OUTPUT_SETTLE_MS);
    };

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
        // D-41 b+:tmux target 套用該 host 實測字寬表(有快取才切,沒快取
        // 背景 probe 下次生效);shell 直連沒有 tmux 中間人,切回預設表
        if (target.kind === "tmux") {
          applyHostWidths(term, host.id);
        } else {
          resetDefaultProvider(term);
        }
        // D-41:reset 而非 clear —— 把上一段 attach 殘留的 alt buffer 內容、
        // mouse tracking 等 modes 全清掉。舊 frame 一旦留著,tmux 又以為
        // client 是乾淨的,增量 diff 就永遠蓋不掉舊字(dump1 實錄)。
        term.reset();
        const cols = term.cols || 80;
        const rows = term.rows || 24;

        // D-41 根因修正:attach_id 前端先產 → listener 先掛 → 最後才 attach。
        // backend 的 reader 一 spawn 就開始 emit,舊版「attach 回來才 listen」
        // 會把 tmux attach 前導(1049h + 整屏初繪)搶在 listener 註冊前整段
        // 漏掉 → xterm 拿舊畫面當底、之後只收增量 diff → 行頭殘字
        // (dump1:錄到的流無 1049h 無 2J,重放乾淨 terminal 卻與 tmux 全同)。
        const aid0 = crypto.randomUUID();

        // D-41 flight recorder:從乾淨畫面(上面 term.reset())起錄。
        // 起點含當下尺寸,之後 xterm resize 也記進去,重放才能還原時序
        recordChunksRef.current = [{ r: [cols, rows] }];
        recordCharsRef.current = 0;
        recordOverflowRef.current = false;
        resizeDisp = term.onResize(({ cols: c, rows: r }) => {
          if (!recordOverflowRef.current) {
            recordChunksRef.current.push({ r: [c, r] });
          }
        });

        // D-31:移除 D-29/D-30 的「attach 後 nudge 尺寸」。那招(D-30 送 rows-1 再
        // 送回 rows 逼 tmux 全重畫)在 attach 後 250~420ms 內跑,正好撞上使用者
        // attach 完馬上打字/貼上 → tmux 重繪輸出 + reflow 與輸入交錯 → 多空白、
        // 貼上不全(核心輸入賣點壞掉,owner 回報 v0.1.8/v0.1.9 兩者都中)。
        // 回到 v0.1.7 行為:attach 前 fit 一次、之後靠 ResizeObserver;非全寬花屏
        // 用手動拖視窗 workaround,待日後找不干擾輸入的解法。輸入正確優先。

        unlistenOutput = await listen<string>(
          `attach-output-${aid0}`,
          (e) => {
            // D-41:cleanup 可能跑在 listen() resolve 之前,unlisten 拿不到
            // handle → listener 漏網。cancelled 一設就讓它變啞巴,不然舊
            // attach 的整屏重繪會寫進新 session 的 grid(錄音外 bytes,
            // dump4 的 live≠replay 就是這樣來的)
            if (cancelled) return;
            const t = xtermRef.current;
            if (!t) return;
            // 直接寫進 xterm,不動 alt-screen 切換。先前 strip 掉 alt-screen
            // (\x1b[?1049h/l 等)是想把 tmux 輸出留在 normal buffer scrollback,
            // 但 tmux 用「絕對游標定位」重畫,xterm 在 normal buffer 時座標會
            // desync → 重複片段 / 輸入錯亂(舊 Bug 2/3)。讓 xterm 正常用
            // alternate buffer,座標才對得上。看歷史改用 tmux copy-mode 或 capture。
            // D-41 flight recorder:寫進 xterm 的同一份 chunk 原樣入錄
            if (!recordOverflowRef.current) {
              recordChunksRef.current.push({ d: e.payload });
              recordCharsRef.current += e.payload.length;
              if (recordCharsRef.current > D41_RECORD_CAP_CHARS) {
                recordOverflowRef.current = true;
                recordChunksRef.current = [];
              }
            }
            t.write(e.payload);
            scheduleAutoRedraw(); // D-37:輸出停一拍後自動清殘字
          },
        );

        unlistenClosed = await listen(`attach-closed-${aid0}`, () => {
          if (cancelled) return;
          toast.message("Attach 已關閉(server 端 EOF / exit)");
          // Shell 沒 capture 可退,EOF 就直接離開 panel
          if (target.kind === "shell") {
            onBackRef.current?.();
          } else {
            setMode("capture");
          }
        });

        if (cancelled) {
          // cleanup 已跑過(在 listen await 期間),它拿不到剛 resolve 的
          // handle —— 這裡自己收
          unlistenOutput?.();
          unlistenClosed?.();
          return;
        }

        if (target.kind === "tmux") {
          aid = await api.attachSession(
            aid0,
            host.id,
            target.session.socket,
            target.session.name,
            cols,
            rows,
          );
        } else {
          aid = await api.attachShell(aid0, host.id, cols, rows);
        }
        if (cancelled) {
          api.detachSession(aid).catch(() => {});
          return;
        }
        setAttachId(aid);
        attachIdRef.current = aid;

        const disp = term.onData((data) => {
          // D-37:滑鼠 report(D-33 滾輪轉發)跟 focus report 不算「使用者在
          // 打字」,不然捲一下滾輪就把自動重繪擋掉 IDLE 這麼久
          const isPointerReport =
            data.startsWith("\x1b[<") ||
            data.startsWith("\x1b[M") ||
            data === "\x1b[I" ||
            data === "\x1b[O";
          if (!isPointerReport) lastInputAtRef.current = Date.now();
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
          onBackRef.current?.();
        } else {
          setMode("capture");
        }
      }
    };
    start();

    return () => {
      cancelled = true;
      if (autoRedrawTimerRef.current !== null) {
        window.clearTimeout(autoRedrawTimerRef.current);
        autoRedrawTimerRef.current = null;
      }
      onDataRef.current?.dispose();
      onDataRef.current = null;
      resizeDisp?.dispose();
      recordChunksRef.current = [];
      recordCharsRef.current = 0;
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
  }, [mode, host.id, targetId, forceRedraw]);

  const handleRefresh = async () => {
    if (target.kind !== "tmux") return;
    const sessionName = target.session.name;
    setRefreshing(true);
    try {
      const r = await api.captureSession(
        host.id,
        target.session.socket,
        sessionName,
      );
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

  // D-40 拖放檔案 → 上傳到這個 tmux session 的 pane current pwd。
  // Tauri webview 攔 OS 級拖放(dragDropEnabled 預設 true),走 onDragDropEvent
  // 拿本地路徑,後端自己讀檔上傳。shell target 沒活的 pwd → 不註冊(拖了沒反應)。
  React.useEffect(() => {
    if (target.kind !== "tmux") return;
    const { socket, name } = target.session;
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === "enter" || p.type === "over") {
          setDragOver(true);
        } else if (p.type === "leave") {
          setDragOver(false);
        } else if (p.type === "drop") {
          setDragOver(false);
          for (const path of p.paths) {
            const label = path.split(/[/\\]/).pop() || path;
            const id = toast.loading(`上傳 ${label}…`);
            api
              .uploadToSession(host.id, socket, name, path)
              .then((remote) =>
                toast.success(
                  `已上傳 → ${host.ssh_user}@${host.ssh_host}:${remote}`,
                  { id },
                ),
              )
              .catch((err) =>
                toast.error(`${label} 上傳失敗:${String(err)}`, { id }),
              );
          }
        }
      })
      .then((un) => {
        if (disposed) un();
        else unlisten = un;
      })
      .catch((err) =>
        console.warn("[SessionPanel] onDragDropEvent failed:", err),
      );
    return () => {
      disposed = true;
      unlisten?.();
      setDragOver(false);
    };
  }, [targetId, target, host.id, host.ssh_user, host.ssh_host]);

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
              onClick={() => void diagnoseThenRedraw()}
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
        {dragOver && target.kind === "tmux" && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-primary/70 bg-background/80 backdrop-blur-sm">
            <Upload className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium">放開上傳到這個 session 的目前目錄</p>
            <p className="text-xs text-muted-foreground">
              {host.ssh_user}@{host.ssh_host} · {target.session.name}
            </p>
          </div>
        )}
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

