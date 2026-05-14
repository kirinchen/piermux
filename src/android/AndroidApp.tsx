import { useState } from "react";
import { HostListScreen } from "./HostListScreen";
import { SessionListScreen } from "./SessionListScreen";
import { AttachScreen } from "./AttachScreen";

export type AndroidTarget =
  | { kind: "tmux"; session: string }
  | { kind: "shell" };

type Screen =
  | { kind: "host-list" }
  | { kind: "session-list"; hostId: string }
  | { kind: "attach"; hostId: string; target: AndroidTarget };

export function AndroidApp() {
  const [screen, setScreen] = useState<Screen>({ kind: "host-list" });

  const goHostList = () => setScreen({ kind: "host-list" });
  const goSessionList = (hostId: string) =>
    setScreen({ kind: "session-list", hostId });
  const goAttach = (hostId: string, target: AndroidTarget) =>
    setScreen({ kind: "attach", hostId, target });

  switch (screen.kind) {
    case "host-list":
      return <HostListScreen onSelectHost={goSessionList} />;
    case "session-list":
      return (
        <SessionListScreen
          hostId={screen.hostId}
          onBack={goHostList}
          onSelectTarget={(target) => goAttach(screen.hostId, target)}
        />
      );
    case "attach":
      return (
        <AttachScreen
          hostId={screen.hostId}
          target={screen.target}
          onBack={() => goSessionList(screen.hostId)}
        />
      );
  }
}
