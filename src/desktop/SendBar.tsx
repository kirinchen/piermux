// M1e SendBar — capture mode 下方的「不 attach 直接送字 / 按鍵」工具。
// SPEC §3.4 quick presets 預設 hardcode 3 個(M3 才接 quick_presets DB 編輯)。
//
// 設計:
// - 文字輸入 + [Send] / [Send + ↩]:literal 模式,適合送 prompt 給 Claude Code
// - 三個 hardcoded preset:
//   - `/syncdesk` 文字 + Enter(literal mode)
//   - `Stop (ESC)` ESC 按鍵(named-key,不送 Enter)
//   - `Clear (Ctrl+L)` C-l 按鍵(named-key,不送 Enter)
// - 顯示位置:SessionPanel capture mode 下方 footer。Attach mode 已有
//   LineBufferInput / Stream input,SendBar 重複所以不顯示

import * as React from "react";
import { Send, CornerDownLeft, Square as StopIcon, Eraser } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/tauri";
import type { Host, Session } from "@/lib/types";

type Preset = {
  label: string;
  payload: string;
  literal: boolean;
  send_enter: boolean;
  icon?: React.ReactNode;
};

const DEFAULT_PRESETS: Preset[] = [
  {
    label: "/syncdesk",
    payload: "/syncdesk",
    literal: true,
    send_enter: true,
    icon: <CornerDownLeft className="h-3 w-3" />,
  },
  {
    label: "Stop (ESC)",
    payload: "Escape",
    literal: false,
    send_enter: false,
    icon: <StopIcon className="h-3 w-3" />,
  },
  {
    label: "Clear (Ctrl+L)",
    payload: "C-l",
    literal: false,
    send_enter: false,
    icon: <Eraser className="h-3 w-3" />,
  },
];

type Props = {
  host: Host;
  session: Session;
};

export function SendBar({ host, session }: Props) {
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const send = async (
    payload: string,
    sendEnter: boolean,
    literal: boolean,
    desc: string,
  ) => {
    if (!payload) return;
    setSending(true);
    try {
      await api.sendMessage(
        host.id,
        session.name,
        payload,
        sendEnter,
        literal,
      );
      toast.success(`已送 ${desc} → ${session.name}`);
    } catch (err) {
      toast.error(`送 ${desc} 失敗:${String(err)}`);
    } finally {
      setSending(false);
    }
  };

  const handleSendCustom = (sendEnter: boolean) => {
    if (!text) return;
    const desc = text.length > 20 ? `"${text.slice(0, 20)}…"` : `"${text}"`;
    void send(text, sendEnter, true, desc);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    // 純 Enter 才 send;任一 modifier + Enter 都當「不要 send」意圖
    if (e.key !== "Enter") return;
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    handleSendCustom(true); // Enter 預設送 + Enter
  };

  return (
    <div className="flex flex-col gap-1.5 border-t border-border bg-muted/30 px-3 py-2">
      <div className="flex items-baseline gap-2 text-[11px]">
        <span className="font-medium uppercase tracking-wide text-foreground">
          Send to session
        </span>
        <span className="text-muted-foreground/80">
          不需 attach,透過 tmux send-keys 直送 · IME aware
        </span>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
          placeholder="送一段字到 session(Enter = Send + ↩)"
          className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleSendCustom(false)}
          disabled={sending || text.length === 0}
          title="送 literal 字串(不加 Enter)"
        >
          <Send className="h-4 w-4" />
          Send
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={() => handleSendCustom(true)}
          disabled={sending || text.length === 0}
          title="送 literal 字串 + Enter(commit)"
        >
          <CornerDownLeft className="h-4 w-4" />
          Send + ↩
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Quick:</span>
        {DEFAULT_PRESETS.map((p) => (
          <Button
            key={p.label}
            size="sm"
            variant="ghost"
            onClick={() =>
              void send(p.payload, p.send_enter, p.literal, p.label)
            }
            disabled={sending}
            title={`送 "${p.payload}" (${p.literal ? "literal" : "key"}${p.send_enter ? " + Enter" : ""})`}
            className="h-7 px-2 text-xs"
          >
            {p.icon}
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
