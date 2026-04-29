import { HostsView } from "./desktop/HostsView";

// M1b 階段:desktop only,直接 render HostsView。
// SPEC §7.2 之後會在 App.tsx 加 platform routing(desktop / android),
// 現在 platform = desktop 就好(M2 才需要)。

function App() {
  return <HostsView />;
}

export default App;
