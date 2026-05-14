import { HostsView } from "./desktop/HostsView";
import { AndroidApp } from "./android/AndroidApp";
import { isAndroid } from "./lib/platform";

function App() {
  return isAndroid() ? <AndroidApp /> : <HostsView />;
}

export default App;
