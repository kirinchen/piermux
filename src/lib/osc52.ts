// OSC 52 — forward remote-emitted clipboard sequences to the host OS clipboard.
//
// Remote tmux (with `set -g set-clipboard on`) emits OSC 52 escape sequences
// when content is yanked. xterm.js sees these but, by default, drops them.
// Register this handler on every Terminal instance to bridge them to Tauri's
// clipboard plugin → OS clipboard.
//
// OSC 52 payload format: `<selection>;<base64-or-?>`
//   selection: `c` (clipboard) | `p` (primary) | `s` / `0`–`7` (alt buffers)
//   base64-or-?: base64-encoded data, or literal `?` to QUERY the host
//                clipboard. We refuse queries (security: never leak host
//                clipboard back to the remote).

import type { Terminal, IDisposable } from "@xterm/xterm";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

const OSC_52_IDENT = 52;

export function installOsc52Handler(term: Terminal): IDisposable {
  return term.parser.registerOscHandler(OSC_52_IDENT, (data: string) => {
    const match = data.match(/^([cps0-7]*);(.+)$/);
    if (!match) return false;
    const payload = match[2];

    // Refuse clipboard READ requests — never expose host clipboard to remote.
    if (payload === "?") return true;

    let text: string;
    try {
      text = atob(payload);
    } catch (e) {
      console.warn("[osc52] base64 decode failed", e);
      return false;
    }

    // Fire-and-forget; clipboard failure must not break terminal rendering.
    void writeText(text).catch((e) => {
      console.warn("[osc52] clipboard writeText failed", e);
    });

    return true;
  });
}
