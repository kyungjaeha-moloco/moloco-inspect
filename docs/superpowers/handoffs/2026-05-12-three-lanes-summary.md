# Handoff — 2026-05-12 three-lanes summary (Type-1 + DS Ecosystem + Ontology)

**Date:** 2026-05-12
**Author:** kyungjae.ha (consolidating output from three parallel Claude sessions)
**Branch:** main (clean)

---

## Why this doc exists

2026-05-12 had three Claude sessions running in parallel on different parts of the orchestrator. Each session wrote its own handoff. This doc is a thin cross-link so the next session can pick up any lane without hunting through three separate handoffs.

---

## The three lanes

### Lane A — Type-1 research-parallelism (orchestrator/task-runner)
**Handoffs:**
- `docs/superpowers/handoffs/2026-05-12-research-parallelism-shipped.md` — implementation summary
- `docs/superpowers/handoffs/2026-05-12-slice-f-lite-results.md` — Slice F-lite measurement (P=1..5 sweep)

**Plans:**
- `docs/superpowers/plans/2026-05-12-research-parallelism.md` (Type-1, implementable, fully implemented)
- `docs/superpowers/plans/2026-05-12-concurrent-code-writing-research.md` (Type-2, research-only, Q0 open)

**What it does:** before each task's coder adapter fires, the runner dispatches up to 5 read-only Claude Code subprocesses in parallel to gather codebase / DS / API context. The synthesised bundle is prepended to the coder's prompt.

**Status:** shipped, off-by-default, runtime-toggleable from dashboard `Settings → Research enabled`. Defaults grounded in real measurement (P=5, 180s/600s).

**Outstanding:** Slice F-full (coder-side A/B against review-pass-rate) — needs real-job dispatch + $10-20 LLM spend.

### Lane B — DS Ecosystem (orchestrator/plan-emitter + design-system catalog)
**Handoff:**
- `docs/superpowers/handoffs/2026-05-12-ds-ecosystem-planning.md`

**Plans (5 added):**
- `docs/superpowers/plans/2026-05-07-molly-ds-loop-v2-research-informed.md`
- `docs/superpowers/plans/2026-05-11-local-share-cloudflare-tunnel.md`
- `docs/superpowers/plans/2026-05-11-gcp-deploy-phased.md`
- `docs/superpowers/plans/2026-05-12-ds-escalation-workflow.md`
- `docs/superpowers/plans/2026-05-12-ontology-evolution.md`

**What it does:** DS loop v2 S0 (cache 1h + Sonnet planner) + S2 (ts-morph component-props extraction) + S3-A (referenced/unresolved schema in plan output). Plus the 좀비 fix on 3 dev scripts.

**Status:** S0/S2/S3-A shipped; S3 Phase B-G are next. 5 plans (배포 + DS escalation + Ontology) drafted and Momus-reviewed.

**Outstanding:** 2-person trial via Cloudflare Tunnel (next-week priority). DS escalation Slices A-E. Ontology Phase 0+.

### Lane C — Ontology Phase 0+ + DS Escalation Slice A
**Handoff:**
- `docs/superpowers/handoffs/2026-05-12-ontology-phase0-and-escalation-slice-a.md`

**What it does:**
- Ontology Phase 0: `design-system/scripts/extract-cross-refs.mjs` auto-extracts `usedInPatterns` / `relatedComponents` / `requiredProviders` / `usage_stats` for all 112 DS components. msm-portal-web codebase scan (3,615 .tsx files) refreshes `usage_stats.file_count`.
- DS Escalation Slice A: 3-surface (Slack / Playground / Chrome ext) 4-option UX for `unresolved_components` — single jsonl sink at `state/molly-missing-choices.jsonl`.
- GovernancePage Usage Insights: Slice C bootstrap with anomaly callout. Surfaced: `MCStatusBadge` is stable but 0-usage.

**Status:** all three shipped. Slice B (Auto-PR via GitHub App) and Slice C-E are next.

---

## What's shared across lanes

| Concern | Lane A | Lane B | Lane C |
|---------|--------|--------|--------|
| Touches `orchestrator/lib/molly-plan-emitter.js`? | No | Yes (S0/S2/S3-A) | Yes (closest_match schema) |
| Touches `orchestrator/lib/molly.js`? | No | Yes (Slack designSystemRoot) | Yes (postMissingComponentCards) |
| Touches `orchestrator/server.js`? | Yes (adapter integration) | Yes (startMolly designSystemRoot) | Yes (/api/missing-choice) |
| Touches `dashboard/`? | Yes (SettingsPage) | No | No |
| Touches `design-system/`? | No | No (only S2 created `extract-props.mjs`, modified `components.json`) | Yes (extract-cross-refs.mjs, components.json) |
| Touches `design-system-site/`? | No | No | Yes (GovernancePage) |

The lanes are mostly disjoint. Minor co-edits on `molly-plan-emitter.js`, `molly.js`, `server.js` did not conflict (sessions ran sequentially through the day, not concurrently on the same files).

---

## Next-session priority (consolidated across lanes)

| 우선 | 항목 | 출처 | 추정 |
|------|------|------|------|
| 🥇 1 | **2-person Cloudflare Tunnel trial** | Lane B handoff §다음 슬라이스 | 5-6h |
| 🥈 2 | DS escalation Slice B (Auto-PR GitHub App) | Lane C handoff §다음 슬라이스 | 1-1.5d |
| 🥉 3 | Slice F-full (coder-side A/B for Type-1 research) | Lane A handoff §next | 0.5-1d + $10-20 |
| 4 | Ontology Phase 1 (plan emit post-processing) | Lane B + Lane C | 1d |
| 5 | DS escalation Slice C (jsonl batch + watch_list) | Lane C handoff §다음 슬라이스 | 1-1.5d |
| 6 | n>1 PRD measurement for Slice F-lite | Lane A handoff §next | 30-40m + $1-2 |
| 7 | Ontology Phase 2 (tool_use enum) | Lane B + Lane C | 1d |
| 8 | Reviewer-side research (Type-1 Phase 4) | Lane A handoff §next | 2-3h |

The 2-person trial is the natural next move — it unblocks measurement of all three lanes under real workload, and validates the production readiness assumptions each lane made independently.

---

## Service ports (unchanged)

- orchestrator `:3847`
- playground-app `:4180`
- dashboard `:4174`

Restart with `pnpm dev` in each directory — the 좀비 fix (commit 59d6dec) auto-cleans previous processes via `trap 'kill 0' EXIT INT TERM` + `lsof -ti :PORT | xargs kill -9`.

---

## Memory entries to read at next session start

- `MEMORY.md` index
- `project_parallelism_direction.md` — Lane A state (updated 2026-05-12)
- `project_molly_ds_loop.md` — Lane B state (needs update: mark S3-A done)
- `project_ds_direction.md` — Lane B/C overlap (DS direction roadmap)

---

*Last updated: 2026-05-12 session end. Next session: pick from the priority list above, or pivot based on whatever the user found while looking at the dashboard's new Research panel.*
