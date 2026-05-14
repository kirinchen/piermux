import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isAndroid } from "@/lib/platform";

// Android 系統 back 鍵 / window close-requested 統一導向 onBack。
// 只在 Android 啟動,desktop 沒掛(desktop close-requested = 關 app,
// 不應該被攔)。當 canGoBack=false(已在 root screen)讓系統正常關 app。
export function useAndroidBack(canGoBack: boolean, onBack: () => void) {
  useEffect(() => {
    if (!isAndroid()) return;
    let unlistenFn: (() => void) | null = null;
    let cancelled = false;

    getCurrentWindow()
      .onCloseRequested((event) => {
        if (canGoBack) {
          event.preventDefault();
          onBack();
        }
      })
      .then((u) => {
        if (cancelled) u();
        else unlistenFn = u;
      });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [canGoBack, onBack]);
}
