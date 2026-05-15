# piermux

> **English(this file)· [繁體中文](README.zh-TW.md)**

> **GUI for managing tmux sessions across multiple SSH hosts. Desktop + Android.**
> Focused on **fast session discovery** + **good typing experience** (especially for AI-agent prompts).

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-M2%20code%20complete%2C%20pre--release-orange.svg)](#status)

---

## Why this exists

Every day I attach to multiple tmux sessions across multiple machines. `ssh` → `tmux ls` → `tmux attach -t <long-name>` is a tax that adds up. No existing tool covers all three of these at once:

| Tool | What it's good at | What's missing |
|---|---|---|
| **Xshell** | Desktop SSH leader, great typing | No cross-host tree view, no Android, doesn't know about tmux sessions |
| **JuiceSSH** | Android SSH leader, complete modifier bar | No line buffer, doesn't know about tmux sessions, no cross-host unified view |
| **colony** | Android-side tmux awareness | Tmux-shortcut driven (no general-purpose keys), char-streaming (breaks AI conversations), single host |

**piermux's selling point:** cross-host tree view + good line-buffer typing + same app on Desktop and Android.

---

## Core features (SPEC §3)

1. **Cross-host tree view** — Multiple hosts side by side, expand/collapse, all `host × session` at a glance
2. **One-click attach** — Click a session to jump in, no `tmux attach -t ...` typing
3. **Three-level refresh capture** — Per-session / per-host / global, parallel refresh to see "what's running everywhere right now"
4. **Send message** — Push a string or named key (Escape / Ctrl+L / Up...) to a session without attaching
5. **Line buffer input** ⭐ core — Characters land in a local buffer; Enter sends the whole line at once. **IME composition Enter never accidentally sends.** Solves the colony "Claude already moved on while I was typing" pain.
6. **SSH server key TOFU** — Fingerprint recorded on first connect; mismatches rejected on later connects (same protection model as OpenSSH `known_hosts`).

---

## Status

**M1 (Desktop)**: **v0.1.1 shipped** (daily-use ready) — [latest release](https://github.com/kirinchen/piermux/releases/tag/v0.1.1)
- ✅ Host CRUD (passwords in OS keystore, SSH key auth)
- ✅ Tree view + tmux session list + connection status
- ✅ Capture mode + three-level refresh + per-host capture grid + multi-host side-by-side compare
- ✅ Attach mode (bidirectional PTY, scrollable capture, direct-shell)
- ✅ Line buffer mode + Stream toggle (IME-aware, Shift+Enter for newline)
- ✅ Send message + quick presets (`/syncdesk`, ESC, Ctrl+L)
- ✅ Collapsible sidebar + direct-shell mode
- ⏳ Tray icon + window minimize (deferred to M3 polish)

**M2 (Android)**: **code complete, awaiting real-device verification**
- ✅ NDK r27d cross-compile + Tauri 2 Android scaffold + first device boot (2026-05-13)
- ✅ Android system back-key handling + AndroidHostFormScreen (mobile-friendly form)
- ✅ SessionScreen (capture / attach toggle) + QuickKeyBar (JuiceSSH-style 19 keys)
- ✅ AttachView bidirectional PTY + line buffer + CTRL sticky modifier bar (22 keys)
- ✅ Release signing config (`gen/android/app/key.properties` gitignored)
- ⏳ **Full end-to-end on device (Claude Code attach + Chinese IME line buffer + three-level refresh)** — pending owner verification
- ⏳ Native file picker for SSH private key on Android (current workaround: `window.prompt` for path)

**M3 (Polish + open source)**: in progress
- ✅ Security: server key TOFU, restrictive Tauri CSP, sanitized `key.properties.example`
- ⏳ Tray icon, auto-reconnect, multi-window attach, AI-aware modifier bar third row

Full milestone breakdown is in [`doc/SPEC.md` §8](doc/SPEC.md). Decision log, sprint notes, and dev history live in [`NOTES.md`](NOTES.md) and [`doc/`](doc/) — fully public as a vibe-coded side project.

---

## Install

### Pre-built (Windows)

Download `.msi` or `.exe` from the [latest release](https://github.com/kirinchen/piermux/releases/latest).

> ⚠️ **Windows SmartScreen warning** on first launch — the binary is not code-signed. Click "More info" → "Run anyway". A code-signing cert may be considered for M3.

### From source (Desktop)

Requires [Rust](https://rustup.rs/) (MSRV 1.85) + [Node.js](https://nodejs.org/) 18+ + [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/).

```bash
git clone https://github.com/kirinchen/piermux
cd piermux
npm install
npm run tauri dev      # dev mode
npm run tauri build    # release artifact → src-tauri/target/release/bundle/
```

### From source (Android)

Additionally requires Android Studio + NDK r27d (27.3.13750724) + JDK 21.

```bash
# 1. Copy NDK linker config template and edit to your NDK path
cp .cargo/config.toml.example .cargo/config.toml
# Edit .cargo/config.toml — point the 4 linker paths at your NDK install

# 2. Install Rust Android targets
rustup target add aarch64-linux-android armv7-linux-androideabi

# 3. Connect a device (USB debugging on, same WiFi subnet as PC)
npm run tauri android dev

# 4. Release build (needs key.properties — see src-tauri/gen/android/app/key.properties.example)
npm run tauri android build --release
```

---

## Security model

- **Passwords** are stored in the OS keystore (Windows Credential Manager / macOS Keychain / Linux Secret Service / Android Keystore planned). **Never written to disk in plaintext.**
- **SSH private keys** — only the path is stored in the DB; the key file itself stays on disk wherever you put it.
- **Server host key TOFU** — On first connect, the SHA-256 fingerprint is recorded (OpenSSH-compatible format). On reconnect, mismatches are rejected with both fingerprints shown so you can decide if it's a MITM or a server reinstall. To accept a new key: delete and re-add the host.
- **CSP** — WebView runs with `default-src 'self'`, no external content, no inline scripts.
- **Tauri capabilities** — Only `core:default` + `sql:default` are granted. No shell-exec or fs-read plugins that would widen the attack surface.

---

## Tips

### Scrolling tmux history in attach mode

In attach mode piermux swallows the wheel event (otherwise bash treats it as ↑↓ and triggers history navigation). Two ways to scroll tmux history while attached:

1. **tmux copy mode** (no server config needed): `prefix + [` enters copy mode → PgUp / arrow keys → `q` to exit.
2. **Server-side tmux mouse on** (one-time fix): add to `~/.tmux.conf`:
   ```
   set -g mouse on
   ```
   Then `tmux source-file ~/.tmux.conf`. Wheel will scroll tmux history directly after.

Another path: switch to **capture mode** (mode toggle next to `[Detach]` at top right) — grabs the last 2000 lines of tmux scrollback without keyboard interception.

### Direct-shell mode: wheel works normally

Direct-shell (the `⚡` row under each host) uses xterm's normal screen with 5000-line scrollback, so the wheel scrolls as expected.

---

## Stack

- **[Tauri 2](https://tauri.app/)** (Rust + WebView) — cross-platform native app shell
- **[makiko](https://crates.io/crates/makiko)** 0.2 — pure Rust SSH client (waiting on ed25519-dalek upstream before switching to `russh`, see [`NOTES.md`](NOTES.md) D-6 / D-7)
- **[xterm.js](https://xtermjs.org/)** — terminal rendering (shared by capture + attach)
- **React 19** + **TanStack Query** + **Tailwind 4** + hand-rolled shadcn-style components
- **SQLite** (`tauri-plugin-sql` + own sqlx pool) — host config + capture cache + host_keys TOFU storage
- **[keyring](https://crates.io/crates/keyring)** 3 — macOS Keychain / Windows Credential Manager / Linux Secret Service / Android Keystore (M2 pending)

---

## Development process

This is a **vibe-coded** side project — "small things decide yourself, big things ask first". Built with [Claude Code](https://claude.com/claude-code) as collaborator. Working agreement in [`CLAUDE.md`](CLAUDE.md), decision history in [`NOTES.md`](NOTES.md), sprint / issue records in [`doc/`](doc/). The entire process is public — **kept as a reference for what vibe-coded engineering actually looks like.**

---

## License

[MIT](LICENSE). Copyright © 2026 kirinchen.
