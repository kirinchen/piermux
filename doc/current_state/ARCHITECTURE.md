---
title: Architecture (current state)
owner: null
---

# Architecture — Current State

> *How the system **actually** looks right now. Pair with [`../SPEC.md`](../SPEC.md) which describes intent.*
>
> **Maintenance rule**: when your code change goes beyond what this file describes
> (new component, removed component, interaction change, tech stack swap),
> update this file in the same change set. Trivial refactors and renames don't count.

## 1. Components

_Real components currently deployed/running. Names match what you see in the codebase._

- _(none yet — piermux is pre-implementation. Fill in as components land.)_

## 2. Interactions

_How components actually talk. ASCII or mermaid is fine._

```
(empty — no components yet)
```

## 3. Data flow

_Walk through the 1–2 most important request flows end-to-end._

- _(empty)_

## 4. Tech stack snapshot

_Languages, frameworks, runtime versions currently in use. Source of truth is the lockfile; this section is for the human-readable summary._

- Language: _(not chosen in code yet — SPEC.md targets Rust 1.80+ / TS)_
- Framework: _(SPEC.md targets Tauri 2.x + React 18)_
- Datastore: _(SPEC.md targets SQLite via tauri-plugin-sql)_
- Runtime: _(desktop + Android via Tauri Mobile CLI)_

## 5. External dependencies

_Third-party services / SaaS / APIs the system actually calls in production._

- _(none yet)_

## 6. Pointers to deeper docs

_Other `current_state/` files that go deeper. Agent adds these as needed (UML, CODEMAP, DATA_MODEL, etc.)._

- ...

---

*Anything in this file should be **verifiable from the running code right now**. If a claim here contradicts the code, the claim is wrong — fix it.*
