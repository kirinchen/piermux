import * as React from "react";
import {
  RefreshCw,
  Loader2,
  Terminal as TerminalIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { HostTree, type Selection } from "./HostTree";
import { SessionPanel } from "./SessionPanel";
import { HostCaptureGrid } from "./HostCaptureGrid";
import { MultiHostCaptureGrid } from "./MultiHostCaptureGrid";
import { HostFormDialog } from "./HostFormDialog";
import { SettingsDialog } from "./SettingsDialog";
import { Button } from "@/components/ui/button";
import { useRefreshAll } from "@/hooks/useCapture";
import { useHostsList } from "@/hooks/useHosts";
import { useSessions } from "@/hooks/useSessions";
import { useIncomingDeepLink } from "@/hooks/useDeepLink";
import { matchHosts } from "@/lib/deep-link";
import { getVersion } from "@tauri-apps/api/app";
import type { Host, Session } from "@/lib/types";
import {
  loadOverviewMode,
  saveOverviewMode,
  type OverviewMode,
} from "./overview-mode";

const SIDEBAR_KEY = "piermux:sidebarCollapsed";

export function HostsView() {
  const [selection, setSelection] = React.useState<Selection>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Host | null>(null);
  // Sidebar 收合狀態,localStorage 持久化
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState<boolean>(
    () => {
      try {
        return window.localStorage.getItem(SIDEBAR_KEY) === "true";
      } catch {
        return false;
      }
    },
  );
  React.useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed));
    } catch {
      // ignore — quota / SecurityError
    }
  }, [sidebarCollapsed]);

  // overview 顯示模式:截圖(mini xterm)vs 狀態(seamount 風格狀態列)
  const [overviewMode, setOverviewMode] =
    React.useState<OverviewMode>(loadOverviewMode);
  React.useEffect(() => {
    saveOverviewMode(overviewMode);
  }, [overviewMode]);

  const refreshAll = useRefreshAll();

  // app 版本(讀 tauri.conf,跟 installer 一致),顯示在 header
  const [appVersion, setAppVersion] = React.useState<string>("");
  React.useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (h: Host) => {
    setEditing(h);
    setDialogOpen(true);
  };

  const handleRefreshAll = async () => {
    try {
      const results = await refreshAll.mutateAsync();
      toast.success(`已 refresh ${results.length} 個 session`);
    } catch (err) {
      toast.error(`Refresh All 失敗:${String(err)}`);
    }
  };

  // grid → 點 cell 放大進單一 session 視圖(也清掉 multi-host 比較)
  const expandSession = (host: Host, session: Session) => {
    setSelection({ kind: "session", host, session });
  };

  // session 單一視圖 → 按返回回 host grid
  const backToHostGrid = () => {
    if (selection?.kind === "session" || selection?.kind === "shell") {
      setSelection({ kind: "host", host: selection.host });
    }
  };

  // 點 host 旁 checkbox → toggle 進 / 出 multi-host 比較模式
  const toggleMulti = (host: Host) => {
    setSelection((prev) => {
      const current =
        prev?.kind === "multi-host" ? prev.hosts : ([] as Host[]);
      const exists = current.some((h) => h.id === host.id);
      const next = exists
        ? current.filter((h) => h.id !== host.id)
        : [...current, host];
      if (next.length === 0) return null;
      return { kind: "multi-host", hosts: next };
    });
  };

  const clearMulti = () => setSelection(null);

  // ── deep link `piermux://attach`(契約 doc/DEEP_LINK.md)──────────────────
  // 刻意全部走既有前端流程:解析出來的 host / session 名先對到既有 Host + Session 物件,
  // 再餵給同一個 setSelection。URL 做不到任何「點畫面做不到的事」,也就沒有後端旁路。
  const { req: incomingLink, consume: consumeLink } = useIncomingDeepLink();
  const hostsQuery = useHostsList();
  // host 已定、還要在該 host 的 session 清單裡找名字
  const [linkTarget, setLinkTarget] = React.useState<{
    host: Host;
    session: string;
  } | null>(null);
  // host 對不到(零筆 / 多筆):記住 session 名,等人自己挑一台(契約 §2)
  const [orphanSession, setOrphanSession] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!incomingLink || !hostsQuery.data) return;
    const matched = matchHosts(hostsQuery.data, incomingLink.host);
    consumeLink();
    if (matched.length === 1) {
      setOrphanSession(null);
      setLinkTarget({ host: matched[0], session: incomingLink.session });
      return;
    }
    // 零筆 / 多筆一律交給人:不猜、更不自己建 host(契約 §6)
    setOrphanSession(incomingLink.session);
    setSelection(null);
    toast.error(
      matched.length === 0
        ? `deep link:沒有這台 host「${incomingLink.host}」—— 請自己選一台開「${incomingLink.session}」`
        : `deep link:「${incomingLink.host}」對到 ${matched.length} 台 —— 請自己選一台`,
    );
  }, [incomingLink, hostsQuery.data, consumeLink]);

  const linkSessions = useSessions(linkTarget?.host.id ?? "", !!linkTarget);
  React.useEffect(() => {
    if (!linkTarget) return;
    if (linkSessions.isError) {
      toast.error(
        `deep link:讀不到 ${linkTarget.host.display_name} 的 session 清單`,
      );
      setSelection({ kind: "host", host: linkTarget.host });
      setLinkTarget(null);
      return;
    }
    if (!linkSessions.data) return; // 還在載
    const hit = linkSessions.data.find((s) => s.name === linkTarget.session);
    if (hit) {
      setSelection({ kind: "session", host: linkTarget.host, session: hit });
    } else {
      // 找不到就停在該 host 的清單讓人挑。**絕不 new-session**(契約 §3)
      toast.error(
        `deep link:${linkTarget.host.display_name} 上沒有 session「${linkTarget.session}」`,
      );
      setSelection({ kind: "host", host: linkTarget.host });
    }
    setLinkTarget(null);
  }, [linkTarget, linkSessions.data, linkSessions.isError]);

  // 選 host 時如果還帶著一個 deep link 的 session 名,就順勢在那台上找它
  const handleSelect = (sel: Selection) => {
    if (orphanSession && sel?.kind === "host") {
      setLinkTarget({ host: sel.host, session: orphanSession });
      setOrphanSession(null);
    }
    setSelection(sel);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={sidebarCollapsed ? "展開 Hosts 側欄" : "收合 Hosts 側欄(主畫面滿版)"}
            aria-label="toggle sidebar"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
          <div>
            <h1 className="text-lg font-semibold leading-tight">
              piermux{appVersion ? ` v${appVersion}` : ""}
            </h1>
            <p className="text-xs text-muted-foreground">
              跨多機 tmux session GUI · M1 desktop
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-border text-xs">
            <button
              type="button"
              onClick={() => setOverviewMode("screenshot")}
              className={
                "px-2.5 py-1 " +
                (overviewMode === "screenshot"
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/50")
              }
              title="每個 session 顯示畫面截圖(mini 終端)"
            >
              截圖
            </button>
            <button
              type="button"
              onClick={() => setOverviewMode("status")}
              className={
                "border-l border-border px-2.5 py-1 " +
                (overviewMode === "status"
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/50")
              }
              title="每個 session 顯示狀態摘要(🙋等你回覆 / 🏃生成中 / ☑️告一段落)"
            >
              狀態
            </button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefreshAll}
            disabled={refreshAll.isPending}
            title="重抓所有 host 所有 session 的 capture"
          >
            {refreshAll.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh All
          </Button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="終端設定(字型 / 字級)"
            aria-label="settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      {orphanSession && (
        // deep link 帶著 session 名進來但 host 對不到 —— 契約 §2:帶著名字讓人挑一台
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-3 py-1.5 text-xs">
          <span>
            deep link 要開 session{" "}
            <span className="font-semibold">{orphanSession}</span> —— 選一台
            host,piermux 會在那台上找它
          </span>
          <button
            type="button"
            onClick={() => setOrphanSession(null)}
            className="rounded px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            取消
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {!sidebarCollapsed && (
          <HostTree
            selection={selection}
            onSelect={handleSelect}
            onAdd={openAdd}
            onEdit={openEdit}
            onToggleMulti={toggleMulti}
          />
        )}
        <div className="flex-1 overflow-hidden">
          {!selection && <EmptyState />}
          {selection?.kind === "host" && (
            <HostCaptureGrid
              host={selection.host}
              onSelectSession={(s) => expandSession(selection.host, s)}
              mode={overviewMode}
            />
          )}
          {selection?.kind === "session" && (
            <SessionPanel
              host={selection.host}
              target={{ kind: "tmux", session: selection.session }}
              onBack={backToHostGrid}
            />
          )}
          {selection?.kind === "shell" && (
            <SessionPanel
              host={selection.host}
              target={{ kind: "shell" }}
              onBack={backToHostGrid}
            />
          )}
          {selection?.kind === "multi-host" && (
            <MultiHostCaptureGrid
              hosts={selection.hosts}
              onSelectSession={expandSession}
              onClearAll={clearMulti}
              mode={overviewMode}
            />
          )}
        </div>
      </div>

      <HostFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <TerminalIcon className="h-8 w-8 opacity-30" />
      <p className="text-sm">
        點 host 看 grid · 點 session / shell 看單一視圖 · checkbox 多選
        host 並列
      </p>
    </div>
  );
}
