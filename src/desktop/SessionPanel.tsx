import { Terminal } from "lucide-react";
import type { Selection } from "./HostTree";
import { relativeTime } from "@/lib/time";

type Props = { selection: Selection };

export function SessionPanel({ selection }: Props) {
  if (!selection) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Terminal className="h-8 w-8 opacity-30" />
        <p className="text-sm">點左側 session 看詳情</p>
      </div>
    );
  }

  const { host, session } = selection;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-baseline gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">{session.name}</h2>
          <span className="text-xs text-muted-foreground">
            @ {host.display_name}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {host.ssh_user}@{host.ssh_host}:{host.ssh_port} ·{" "}
          {session.attached ? "attached" : "idle"} · {session.windows} window
          {session.windows > 1 ? "s" : ""} · 最後活動 {relativeTime(session.activity)}
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4">
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <p className="mb-2">M1d 才接 capture(`tmux capture-pane`)</p>
          <p className="text-xs">
            這邊之後會即時顯示 session 當前 pane 內容。
            目前 backend 用 mock data,實際 SSH 連線等 ed25519-dalek upstream 修
            或本機 patch 部署。
          </p>
        </div>
      </main>
    </div>
  );
}
