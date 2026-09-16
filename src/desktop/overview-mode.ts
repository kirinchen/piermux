// overview(host / multi-host grid)的顯示模式:截圖 vs 狀態。
// 全域一份,localStorage 持久化(跟 sidebar 收合同款)。

export type OverviewMode = "screenshot" | "status";

export const OVERVIEW_MODE_KEY = "piermux:overviewMode";

export function loadOverviewMode(): OverviewMode {
  try {
    return window.localStorage.getItem(OVERVIEW_MODE_KEY) === "status"
      ? "status"
      : "screenshot";
  } catch {
    return "screenshot";
  }
}

export function saveOverviewMode(mode: OverviewMode): void {
  try {
    window.localStorage.setItem(OVERVIEW_MODE_KEY, mode);
  } catch {
    // ignore — quota / SecurityError
  }
}
