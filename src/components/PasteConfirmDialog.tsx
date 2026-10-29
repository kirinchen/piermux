// D-20 multi-line paste guard dialog(XShell 風格)。
//
// 觸發:attach 中,clipboard paste 進 xterm 的內容含 ≥2 個 \n(= ≥3 行)。
// usePasteGuard 攔下 xterm helper textarea 的 paste event,把字串塞進
// `pending`;dialog 顯示 textarea 讓 user 編輯/檢視 → 按「貼上」才寫進 PTY。
//
// 取消 / Esc / backdrop click → 整段丟棄。對齊 XShell 的「貼上 / 取消」雙鈕。
// 單行 / 雙行 paste 直接走 xterm 原生 paste(usePasteGuard 不攔),保持流暢。

import * as React from "react";

type Props = {
  initialText: string;
  onConfirm: (text: string) => void;
  onCancel: () => void;
};

export function PasteConfirmDialog({
  initialText,
  onConfirm,
  onCancel,
}: Props) {
  const [text, setText] = React.useState(initialText);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // initialText 變了(連續貼上不同內容)重置 buffer。
  React.useEffect(() => {
    setText(initialText);
  }, [initialText]);

  // 游標置尾 + 捲到底,user 預期是「檢視/微調」不是「全選取代」。
  // 等一個 frame 再做:dialog 剛 mount 時 WebView 可能還沒 layout,
  // focus() 會把游標丟在開頭、setSelectionRange 也不會捲動到可見處。
  // initialText 變了(連續貼上不同內容)一樣重做。
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      const end = ta.value.length;
      ta.setSelectionRange(end, end);
      ta.scrollTop = ta.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [initialText]);

  // Alt+Enter = 按「貼上」(textarea 裡 Enter 是換行,得靠修飾鍵)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (text.length > 0) onConfirm(text);
    }
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const lineCount = text === "" ? 0 : text.split("\n").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3 py-6 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
          <h3 className="text-sm font-semibold">偵測到多行貼上</h3>
          <span className="font-mono text-xs text-zinc-400">
            {lineCount} 行 · {text.length} 字
          </span>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={10}
          className="m-3 flex-1 resize-none rounded border border-zinc-700 bg-zinc-950 p-3 font-mono text-sm text-zinc-100 outline-none focus:border-blue-500"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <p className="border-t border-zinc-800 bg-zinc-950/60 px-4 py-2 text-xs text-zinc-500">
          確認後內容會原樣送到終端機(每個換行 = Enter)。Alt+Enter 貼上,Esc
          取消。
        </p>
        <div className="flex justify-end gap-2 border-t border-zinc-700 bg-zinc-900 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-800 active:bg-zinc-700"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(text)}
            disabled={text.length === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50"
            title="Alt+Enter"
          >
            貼上
          </button>
        </div>
      </div>
    </div>
  );
}
