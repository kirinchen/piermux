// 依 tmux socket 把 session 分組(D-39)。
// 多 socket 時 tree / list 在每組上方顯示 `-L <socket>` 標題(B 方案);
// 只有一個 socket(通常 default)則扁平不顯示。default server 排最前,其餘字母序。

import type { Session } from "./types";

export type SocketGroup = { socket: string; sessions: Session[] };

export function groupBySocket(list: Session[]): SocketGroup[] {
  const map = new Map<string, Session[]>();
  for (const s of list) {
    const arr = map.get(s.socket);
    if (arr) arr.push(s);
    else map.set(s.socket, [s]);
  }
  return [...map.entries()]
    .sort(([a], [b]) =>
      a === "default" ? -1 : b === "default" ? 1 : a.localeCompare(b),
    )
    .map(([socket, sessions]) => ({ socket, sessions }));
}
