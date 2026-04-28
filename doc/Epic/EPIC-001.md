---
id: EPIC-001
title: Desktop M1 — Core attach + line buffer
status: active
owner: kirin
created: 2026-04-28
target_sprint: SPRINT-2026-W18
issues: [ISSUE-001, ISSUE-002, ISSUE-003, ISSUE-004, ISSUE-005, ISSUE-006, ISSUE-007, ISSUE-008]
---

## Why

對齊 [SPEC §8 M1](../SPEC.md)。Desktop 上完整跑通「加 host → 看 tree → refresh-all 一次抓完 → attach Claude session 用 line buffer 打字按 Enter 整段送出」全鏈路。完成這個 epic 才有東西可以 demo / 驗證 colony 失敗的場景在 piermux 上 work。

## Success Criteria

對齊 SPEC §8 M1 完成標準:

- [ ] Desktop 上加 host
- [ ] Tree view 看到所有 session
- [ ] 按 [⟳ Refresh All] 一次抓完所有 capture
- [ ] Attach 進 session 用 line buffer 模式打字 + 按 Enter 整段送出
- [ ] 按 toggle 切 stream 模式跑 vim 也 OK

## Out of Scope

- Android port(留給 EPIC-002 / SPEC §8 M2)
- AI-aware modifier bar 第三排(SPEC §3.5.2 / M3)
- Multi-window attach、auto-reconnect、設定面板(SPEC §8 M3)
- Cluster mode、recording、SSH config 自動讀(SPEC §10 不做)

## Risks & Open Questions

- **Risk:** SPEC §9.1 line buffer × xterm.js 整合 — ISSUE-007 開工前先 spike(task.md T-spike-line-buffer)
- **Risk:** SPEC §9.2 三層 refresh SSH 連線爆掉 — M1d 用 persistent SSH + russh channel pattern(ISSUE-004 acceptance criteria 已含)
- **Open:** Host id 來源(UUID / user-provided)— 阻塞 ISSUE-001 migration,等 @Kirin 拍板(task.md open questions)
- **Open:** Sessions 是 cache 表還是 live query — 影響 ISSUE-003 設計
- **Open:** auth password 怎麼存(keystore alias)— 影響 ISSUE-002 schema

## Related

- SPEC: §3 (核心 features)、§5 (schema)、§6 (commands)、§7 (frontend)、§8 (milestones)、§9 (風險)
- Wiki: `doc/Wiki/guides/cross-dev-conventions.md`(待寫,task.md tooling)
- ADRs: 暫無
