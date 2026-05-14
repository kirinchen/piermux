import { useCallback, useState } from "react";
import { HostListScreen } from "./HostListScreen";
import { SessionListScreen } from "./SessionListScreen";
import { SessionScreen } from "./SessionScreen";
import { AndroidHostFormScreen } from "./AndroidHostFormScreen";
import { useAndroidBack } from "./useAndroidBack";
import type { Host } from "@/lib/types";

export type AndroidTarget =
  | { kind: "tmux"; session: string }
  | { kind: "shell" };

type Screen =
  | { kind: "host-list" }
  | { kind: "host-form"; editing: Host | null }
  | { kind: "session-list"; hostId: string }
  | { kind: "session"; hostId: string; target: AndroidTarget };

export function AndroidApp() {
  const [stack, setStack] = useState<Screen[]>([{ kind: "host-list" }]);
  const current = stack[stack.length - 1];
  const canGoBack = stack.length > 1;

  const push = (s: Screen) => setStack((prev) => [...prev, s]);
  const pop = useCallback(
    () =>
      setStack((prev) =>
        prev.length > 1 ? prev.slice(0, -1) : prev,
      ),
    [],
  );

  useAndroidBack(canGoBack, pop);

  switch (current.kind) {
    case "host-list":
      return (
        <HostListScreen
          onSelectHost={(hostId) => push({ kind: "session-list", hostId })}
          onAddHost={() => push({ kind: "host-form", editing: null })}
          onEditHost={(host) => push({ kind: "host-form", editing: host })}
        />
      );
    case "host-form":
      return (
        <AndroidHostFormScreen editing={current.editing} onClose={pop} />
      );
    case "session-list": {
      const hostId = current.hostId;
      return (
        <SessionListScreen
          hostId={hostId}
          onBack={pop}
          onSelectTarget={(target) =>
            push({ kind: "session", hostId, target })
          }
        />
      );
    }
    case "session":
      return (
        <SessionScreen
          hostId={current.hostId}
          target={current.target}
          onBack={pop}
        />
      );
  }
}
