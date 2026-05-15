# piermux v0.1.1 — Windows desktop release

> Cross-platform GUI for managing tmux sessions across multiple SSH hosts.
> Focused on **fast session discovery** + **good typing experience** (especially for AI-agent prompts).

## What's new since v0.1.0

### 🔒 Security
- **SSH server host key TOFU** — On first connect, fingerprint (SHA-256, OpenSSH format) is stored. On reconnect, mismatches are **rejected** with both fingerprints shown. Replaces the previous "accept-any-key" behavior (MITM hole). To trust a re-installed server, delete and re-add the host.
- **Restrictive CSP** — Tauri WebView now runs with `default-src 'self'` + minimal allowances. No external content, no inline scripts.
- **Capabilities locked down** — Only `core:default` + `sql:default` are granted. No shell-exec, no fs read.

### ⭐ Features
- **Multi-host capture grid** — Check multiple hosts in the tree to view their captures side-by-side. One glance to see what's running across your fleet.
- **Send Message + Quick Presets** — Push a string or named key (Escape / Ctrl+L / Up etc.) to a tmux session without attaching. Three default presets: `/syncdesk`, `Stop (ESC)`, `Clear (Ctrl+L)`. Useful for nudging an AI-agent session from another window.
- **Shell direct attach** — `⚡ shell` row under each host opens a login shell with no tmux indirection. Useful for quick admin / debug.
- **Collapsible sidebar** — Toggle the host tree to give the main view 100% width. Persisted in localStorage.

### 🐛 Bug fixes
- **Attach mode: Chinese & multi-byte UTF-8** no longer renders as `�` when a character is split across SSH packets. Bytes are now buffered until a complete UTF-8 sequence is available (5 unit tests cover the boundary cases).
- **Refresh host button** now invalidates the session list query, so newly created / renamed / deleted tmux sessions show up immediately (previously you had to click "Refresh All").
- **Line buffer Enter semantics** — Shift+Enter inserts a newline, plain Enter sends. Aligns with ChatGPT / Claude.ai / Slack. IME composition state is respected (Enter while composing Chinese never triggers a send).
- **Attach mode wheel scroll** no longer leaks into bash history navigation. Use tmux copy mode (`prefix + [`) or `set -g mouse on` server-side to scroll tmux history.
- **First-attach sizing** — Forced `fit()` before reading `cols / rows` so the initial PTY is sized correctly.
- **In-place scrollback** — Alt-screen escape sequences are stripped so tmux output lands in xterm's main buffer (5000-line scrollback), not the cleared alt-screen.

## Install (Windows)

Download the **`piermux_0.1.1_x64-setup.exe`** (NSIS installer, recommended) or **`piermux_0.1.1_x64_en-US.msi`** (for batch deployment) from this release.

> ⚠️ **Windows SmartScreen warning** on first launch — the binary is not code-signed (no certificate purchased yet). Click "More info" → "Run anyway". A code-signing cert will be considered for M3.

After install, launch from Start Menu or `%LOCALAPPDATA%\piermux\piermux.exe`. Configuration lives in `%APPDATA%\dev.kirinchen.piermux\`:
- `piermux.db` — host config + TOFU fingerprints + capture cache
- Passwords are stored in **Windows Credential Manager** (never written to disk in plaintext).

## Build from source

Requires Rust 1.85+, Node 18+, and [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/).

```bash
git clone https://github.com/kirinchen/piermux
cd piermux
npm install
npm run tauri build
# → src-tauri/target/release/bundle/{nsis,msi}/
```

## Known limitations

- **Android APK not in this release** — M2 Android code is feature-complete on `main` but pending real-device verification (Chinese IME × line buffer × Claude Code attach is the SPEC §1.2 acceptance gate). A separate release will follow once verified.
- **No tray icon / window-minimize-to-tray** — punted to M3 polish.
- **No `known_hosts` import from OpenSSH** — TOFU is piermux-only; reusing existing OpenSSH trust on first connect is M3+.
- **SSH private key on Android** — workaround uses `window.prompt` for path; native file picker is a follow-up.

## Stack

Tauri 2 · Rust 1.85 · React 19 · TanStack Query · Tailwind 4 · xterm.js · [makiko](https://crates.io/crates/makiko) 0.2 · [keyring](https://crates.io/crates/keyring) 3 · sqlx 0.8

## License

[MIT](https://github.com/kirinchen/piermux/blob/main/LICENSE) — Copyright © 2026 kirinchen.

---

Development log, decision history, and per-sprint notes are public in [`NOTES.md`](https://github.com/kirinchen/piermux/blob/main/NOTES.md) and [`doc/`](https://github.com/kirinchen/piermux/tree/main/doc). This is a vibe-coded side project; the working surface is the documentation.
