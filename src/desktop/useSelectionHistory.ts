// desktop 主畫面的「上一頁」(D-48)。HostsView 的 selection 改由這個 hook 管:
// 每次換頁把舊的推進堆疊,goBack 彈出來;堆疊空了才往上一層(session → host
// grid → 首頁)。跟瀏覽器上一頁同語意,例如從 multi-host 並列點進 session,
// 上一頁回到 multi-host 而不是那台 host 的 grid。
//
// - 跟目前一樣的頁面不重複推(點同一個 tree 節點不會堆一堆)
// - multi-host → multi-host(勾選框加減 host)只換不推,上一頁不會一格一格退勾選
// - host 被刪掉後,堆疊裡指到它的頁面由 prune 清掉,goBack 不會回到不存在的 host
// - 堆疊上限 50,只是防呆

import * as React from "react";
import type { Selection } from "./HostTree";

const MAX_HISTORY = 50;

type State = { current: Selection; stack: Selection[] };

type Action =
  | { type: "navigate"; next: Selection | ((prev: Selection) => Selection) }
  | { type: "back" }
  | { type: "prune"; hostIds: Set<string> };

function sameSelection(a: Selection, b: Selection): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "host":
    case "shell":
      return a.host.id === (b as typeof a).host.id;
    case "session": {
      const bs = b as typeof a;
      return (
        a.host.id === bs.host.id &&
        a.session.socket === bs.session.socket &&
        a.session.name === bs.session.name
      );
    }
    case "multi-host": {
      const bh = (b as typeof a).hosts;
      return (
        a.hosts.length === bh.length &&
        a.hosts.every((h, i) => h.id === bh[i].id)
      );
    }
  }
}

// 堆疊空時的退路:往上一層
function parentOf(sel: Selection): Selection {
  if (sel?.kind === "session" || sel?.kind === "shell") {
    return { kind: "host", host: sel.host };
  }
  return null;
}

// 這一頁指到的 host 是否都還在
function hostsAlive(sel: Selection, hostIds: Set<string>): boolean {
  if (sel === null) return true;
  if (sel.kind === "multi-host") return sel.hosts.every((h) => hostIds.has(h.id));
  return hostIds.has(sel.host.id);
}

export function selectionHistoryReducer(state: State, action: Action): State {
  switch (action.type) {
    case "navigate": {
      const next =
        typeof action.next === "function"
          ? action.next(state.current)
          : action.next;
      if (sameSelection(state.current, next)) return state;
      const replace =
        state.current?.kind === "multi-host" && next?.kind === "multi-host";
      if (replace) return { ...state, current: next };
      const stack = [...state.stack, state.current].slice(-MAX_HISTORY);
      return { current: next, stack };
    }
    case "back": {
      if (state.stack.length === 0) {
        const up = parentOf(state.current);
        return sameSelection(up, state.current) ? state : { ...state, current: up };
      }
      const stack = state.stack.slice(0, -1);
      return { current: state.stack[state.stack.length - 1], stack };
    }
    case "prune": {
      const stack = state.stack.filter((s) => hostsAlive(s, action.hostIds));
      // 去掉相鄰重複(中間那頁被刪後兩邊可能變一樣)
      const dedup = stack.filter((s, i) => i === 0 || !sameSelection(s, stack[i - 1]));
      const current = hostsAlive(state.current, action.hostIds) ? state.current : null;
      if (dedup.length === state.stack.length && current === state.current) return state;
      return { current, stack: dedup };
    }
  }
}

export function useSelectionHistory() {
  const [state, dispatch] = React.useReducer(selectionHistoryReducer, {
    current: null,
    stack: [],
  });

  const navigate = React.useCallback(
    (next: Selection | ((prev: Selection) => Selection)) =>
      dispatch({ type: "navigate", next }),
    [],
  );
  const goBack = React.useCallback(() => dispatch({ type: "back" }), []);
  const pruneHosts = React.useCallback(
    (hostIds: Set<string>) => dispatch({ type: "prune", hostIds }),
    [],
  );

  const canGoBack = state.stack.length > 0 || state.current !== null;

  return {
    selection: state.current,
    navigate,
    goBack,
    canGoBack,
    pruneHosts,
  };
}

/** Ctrl+Q(不含 Shift / Alt / Meta)。用 code 判斷,注音 / 非拉丁鍵盤配置下也認得。 */
export function isBackShortcut(e: KeyboardEvent): boolean {
  return (
    e.ctrlKey &&
    !e.shiftKey &&
    !e.altKey &&
    !e.metaKey &&
    !e.isComposing &&
    (e.code === "KeyQ" || e.key === "q" || e.key === "Q")
  );
}
