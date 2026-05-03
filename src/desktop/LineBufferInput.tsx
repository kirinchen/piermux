// M1g line buffer 輸入框(SPEC §3.5.1 / §7.3 / §9.1)。
//
// 這是 piermux 的核心賣點:colony 害 owner 搞壞 Claude session 的反例。
// 字元先進本地 buffer,Enter 才整段送出,IME 組字 Enter 不會誤送。
//
// 設計:
// - 用原生 `<textarea>`,buffer 是 component-local state(切 inputMode →
//   component unmount → buffer 自然清空)
// - Enter:`!shiftKey && !isComposing` 才 send + 清 buffer + 重 focus
// - Shift+Enter:textarea 原生行為(插入換行 char)
// - IME:`e.nativeEvent.isComposing` 護欄。中文打 → IME 組字 Enter 確認 →
//   composing=true → 不觸發 send。送出時的 buffer 已經是 commit 後的字串
// - Send 內容是 raw buffer + `\r`(PTY 的 Enter,line discipline 翻 \n)。
//   buffer 內含 Shift+Enter 帶入的 \n 不動,讓 PTY/shell 自己處理

import * as React from "react";
import { CornerDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  // 把 buffer + '\r' 送進 backend 的 callback。SessionPanel 提供。
  onSend: (text: string) => void;
  disabled?: boolean;
};

export function LineBufferInput({ onSend, disabled }: Props) {
  const [buffer, setBuffer] = React.useState("");
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  const handleSend = () => {
    if (!buffer) return;
    onSend(buffer);
    setBuffer("");
    requestAnimationFrame(() => ref.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME 組字進行中:Enter 是確認組字,不要送出
    if (e.nativeEvent.isComposing) return;
    if (e.key !== "Enter") return;

    // Shift+Enter:textarea native 直接插 \n,我們不擋
    if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) return;

    // Ctrl / Alt / Cmd + Enter:native 行為不穩(部分 browser 沒事、Tauri WebView2
    // 在 Windows 對 Alt+Enter 也有可能被 OS menu modifier 截),統一手動在 cursor
    // 位置插 \n,確保「任何 modifier+Enter 都是換行」一致體驗
    if (e.ctrlKey || e.altKey || e.metaKey) {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart ?? buffer.length;
      const end = target.selectionEnd ?? buffer.length;
      const next = buffer.slice(0, start) + "\n" + buffer.slice(end);
      setBuffer(next);
      // cursor 移到新 \n 之後
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 1;
      });
      return;
    }

    // 純 Enter:send
    e.preventDefault();
    handleSend();
  };

  return (
    <div className="flex flex-col gap-1.5 border-t border-border bg-muted/30 px-3 py-2">
      <div className="flex items-baseline gap-2 text-[11px]">
        <span className="font-medium uppercase tracking-wide text-foreground">
          Next send
        </span>
        <span className="text-muted-foreground/80">
          Enter 整段送出 + ↩ · Shift/Ctrl/Alt+Enter 換行 · IME 組字 Enter 不會誤送
        </span>
        <span className="ml-auto font-mono text-muted-foreground">
          {buffer.length} char{buffer.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={buffer}
          onChange={(e) => setBuffer(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={3}
          placeholder="在這裡打字 — Enter 整段送出(像聊天輸入框)"
          className="flex-1 resize-y rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          autoFocus
        />
        <Button
          size="sm"
          variant="default"
          onClick={handleSend}
          disabled={disabled || buffer.length === 0}
          title="送出整段 + Enter"
        >
          <CornerDownLeft className="h-4 w-4" />
          Send
        </Button>
      </div>
    </div>
  );
}
