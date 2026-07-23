// 終端外觀偏好的 React 綁定(D-35)。純資料 / 事件在 `term-prefs.ts`,這裡只做
// React 側:訂閱 store + 把變動即時套到已經活著的 xterm(不 remount,attach 不斷線)。

import * as React from "react";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import {
  fontSizeFor,
  getTermPrefs,
  subscribeTermPrefs,
  type TermPrefs,
} from "./term-prefs";

/** 目前的終端偏好,設定面板改動時會 re-render。 */
export function useTermPrefs(): TermPrefs {
  return React.useSyncExternalStore(
    subscribeTermPrefs,
    getTermPrefs,
    getTermPrefs,
  );
}

/**
 * 把偏好變動套到既有的 xterm:改 `options` → refit。
 *
 * 建構當下的字型不走這裡(那時 term 還不存在),各 xterm 自己在 `new XTerm(...)`
 * 直接讀 `getTermPrefs()`;這個 hook 只負責「之後改設定」的即時生效。
 * refit 造成的 cols/rows 變動由各自的 `onResize` 傳給 backend(attach 才有意義)。
 *
 * @param delta 相對主字級的偏移(grid mini cell -2、Android attach -1)
 */
export function useTermFontSync(
  xtermRef: React.RefObject<Terminal | null>,
  fitRef: React.RefObject<FitAddon | null>,
  delta = 0,
): TermPrefs {
  const prefs = useTermPrefs();
  React.useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;
    const size = fontSizeFor(prefs, delta);
    if (
      term.options.fontFamily === prefs.fontFamily &&
      term.options.fontSize === size
    ) {
      return;
    }
    term.options.fontFamily = prefs.fontFamily;
    term.options.fontSize = size;
    // 字級變了 → cell 尺寸變了 → 要重算 cols/rows。等一幀讓 xterm 量完新字型。
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {
        // 容器還沒 layout 完,下一次 ResizeObserver 會補
      }
    });
  }, [prefs, delta, xtermRef, fitRef]);
  return prefs;
}
