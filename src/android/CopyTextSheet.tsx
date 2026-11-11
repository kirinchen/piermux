// D-52:Android 複製終端文字。
//
// xterm 在觸控上沒有可用的選字(單指拖曳已被 useTouchScroll 拿去捲動,D-26),
// 所以另開全螢幕面板:把終端內容轉純文字放進唯讀 textarea,用 Android 原生
// 長按選字(拖把手、系統複製選單都能用),另附「複製選取 / 全部複製」兩鈕。
// 唯讀 textarea 不會叫出軟鍵盤。

import * as React from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";

type Props = {
  /** 打開時呼叫一次,拿要顯示的純文字。 */
  load: () => Promise<string> | string;
  onClose: () => void;
};

export function CopyTextSheet({ load, onClose }: Props) {
  const [text, setText] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [hasSelection, setHasSelection] = React.useState(false);
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  const loadRef = React.useRef(load);

  React.useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => loadRef.current())
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 內容到了捲到底(最新輸出在最下面)
  React.useEffect(() => {
    if (text === null) return;
    const raf = requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) ta.scrollTop = ta.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [text]);

  const updateSelection = () => {
    const ta = taRef.current;
    setHasSelection(!!ta && ta.selectionEnd > ta.selectionStart);
  };

  // Android 拖選取把手不一定觸發 textarea 的 select 事件,改聽 document 的
  React.useEffect(() => {
    document.addEventListener("selectionchange", updateSelection);
    return () => document.removeEventListener("selectionchange", updateSelection);
  }, []);

  const copy = async (s: string, what: string) => {
    if (!s) return;
    try {
      await writeText(s);
      toast.success(`已複製${what}(${s.length} 字)`);
      onClose();
    } catch (e) {
      toast.error(`複製失敗:${String(e)}`);
    }
  };

  const copySelection = () => {
    const ta = taRef.current;
    if (!ta || text === null) return;
    void copy(text.slice(ta.selectionStart, ta.selectionEnd), "選取");
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 pt-safe pb-safe">
      <header className="flex items-center gap-2 border-b border-zinc-800 px-2 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-2 text-sm text-zinc-200 active:bg-zinc-800"
        >
          ✕
        </button>
        <div className="flex-1 truncate text-sm font-semibold text-zinc-100">
          複製文字
        </div>
        <button
          type="button"
          onClick={copySelection}
          disabled={!hasSelection}
          className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200 active:bg-zinc-800 disabled:opacity-40"
        >
          複製選取
        </button>
        <button
          type="button"
          onClick={() => void copy(text ?? "", "全部")}
          disabled={!text}
          className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white active:bg-blue-700 disabled:opacity-40"
        >
          全部複製
        </button>
      </header>
      {error !== null ? (
        <div className="p-4 text-sm text-red-400">讀取失敗:{error}</div>
      ) : text === null ? (
        <div className="p-4 text-sm text-zinc-500">讀取中…</div>
      ) : (
        <>
          <div className="px-3 py-1 text-xs text-zinc-500">
            長按文字可選取,拖把手調整範圍
          </div>
          <textarea
            ref={taRef}
            readOnly
            value={text}
            onSelect={updateSelection}
            spellCheck={false}
            className="flex-1 resize-none bg-[#0a0a0a] px-3 py-2 font-mono text-xs leading-relaxed text-zinc-100 focus:outline-none"
          />
        </>
      )}
    </div>
  );
}
