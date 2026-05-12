# Handoff — 2026-05-12 Research parallelism (Type-1) shipped, plus a busy day's worth of cleanup

**Date:** 2026-05-12
**Author:** kyungjae.ha (with Claude Opus 4.7)
**Branch:** main
**Prior handoff:** `docs/superpowers/handoffs/2026-05-12-english-migration-complete.md`

---

## TL;DR

Single session, **14 commits**, big themes:

1. **Two production fixes triggered by live observations.**
   - C8 — finished the English migration on `job-qa-strategist.js` (the 8th LLM-prompt lib was missed by the original Phase C). The "Verification" banner was still rendering Korean rationales.
   - Runner — `pickNextTask` now iterates input order, not Kahn topo. Triggered by the user observing "task 1 done, why is task 9 running before task 2?" — the planner had emitted t9 as an independent chain root and Kahn's BFS interleaved it with the t2 chain.
2. **DS English migration completed in three slices** (DS-1, DS-2, DS-3). Every Markdown doc + JSON source field of the design system is now English; Tving-locale UI copy samples are preserved per the existing exception.
3. **Plans drafted, reviewed by momus, revised, re-reviewed, committed** for the two parallelism directions:
   - Type-1 (read-only research sub-agents) — implementable.
   - Type-2 (concurrent code writing) — research only.
   Both plans went through one full revise → re-review cycle. Type-2 came back APPROVED; Type-1 needed a light tightening round on subprocess hygiene + cost math which was applied.
4. **Type-1 implementation shipped end-to-end** across slices A → C → E → G (D folded into A; F deferred for real runtime measurement). 171/171 orchestrator tests pass. Off by default; flip `RESEARCH_ENABLED=1` to try it.

---

## 1) Commit list (14, chronological)

```
caf808d  feat(i18n): finish QA strategist English migration (C8)
17ec8f6  fix(runner): pick next task in input order, not Kahn topo
c3e6869  chore(i18n): translate DS docs and one prose note to English (DS-1)
99b95fb  chore(i18n): translate GUIDE.md to English (DS-2)
3dda8b6  chore(i18n): translate ROADMAP and STRATEGY to English (DS-3)
f742e26  docs(plan): research-parallelism plan for the task runner
a53f23f  docs(plan): research plan for concurrent code writing (Type-2)
783d9bc  feat(research): job-research lib + tests (Slice A)
5644373  fix(research): address Slice A code-review feedback
f208706  feat(research): wire research bundle into the task runner (Slice B)
f8d3d4c  feat(research): adapter integration + prompt-prepend formatter (Slice C)
f7821d1  feat(research): re-run research after review-fail retry (Slice E)
a8b4979  docs(research): document the RESEARCH_* env vars (Slice G)
```

(Slice D folded into A; Slice F deferred.)

---

## 2) Two production fixes (in detail)

### C8 — QA strategist English migration

- `orchestrator/lib/job-qa-strategist.js` was the 8th LLM-prompt lib missed by Phase C's 7-lib English migration. Its `SYSTEM_PROMPT` explicitly forced Korean output (`"rationale_ko": "한국어 한 문장…"`), which surfaced as Korean text in the plan Verification banner.
- Catalog translated (`label_ko`/`when_ko` → `label`/`when`, content in English).
- Field renamed `rationale_ko` → `rationale` with back-compat reads.
- `molly.js` housekeeping: `QA_STRATEGY_LABELS_KO` → `QA_STRATEGY_LABELS` (the values were already English; the suffix was misleading).
- 5 new regression tests in `test/job-qa-strategist.test.js`.

### Runner — pickNextTask uses input order

- Symptom: a 10-task job whose t1–t8 formed a chain and whose t9–t10 formed an independent chain executed as `t1 → t9 → t2 → t10 → t3 → …`.
- Cause: `topoOrder` is Kahn's BFS, which seeds with every zero-indegree root (t1 + t9) and interleaves them as dependencies clear.
- Fix: `pickNextTask` now iterates `job.tasks` directly (input order). `topoOrder` is still called once at the top for its cycle-check side effect.
- 2 new regression tests pin the user-reported graph and a sanity inverse.

---

## 3) DS English migration (DS-1 / DS-2 / DS-3)

| Phase | File(s) | Korean lines before / after |
|-------|---------|------------------------------|
| DS-1  | `README.md`, `docs/architecture.md`, `docs/migration-status.md`, `src/index.json`, `src/patterns.json` (one prose note) | ~180 → 0 (in those files; intentional Tving-locale samples elsewhere preserved) |
| DS-2  | `GUIDE.md`                                                                            | 109 → 0 |
| DS-3  | `AGENT_DESIGN_SYSTEM_ROADMAP.md`, `STRATEGY.md`                                       | 270 → 0 |

`src/patterns.json`'s sample Tving table columns (creative review pattern) intentionally stay Korean — they're UX copy samples, not prose. The Tving-locale exception from the broader handoff continues to govern.

---

## 4) Two new plan docs

Both went through one full momus revise → re-review cycle.

### `docs/superpowers/plans/2026-05-12-research-parallelism.md` (Type-1)

Read-only research sub-agents that run before each task's coder adapter. Subprocess-based (Claude Code CLI with `--allowedTools Glob,Grep,Read,Task`). Default-off, env-flagged, opt-in. Cost overhead estimated 15–25% blended (worst case 67% on tiny tasks; killed by query-builder's 0-emit policy).

First-pass review found 2 BLOCKERS + 5 MAJORS. Revised. Re-review found 3 light tightenings (subprocess hygiene + cost math under Option B). Applied. Implementation shipped (see §5).

### `docs/superpowers/plans/2026-05-12-concurrent-code-writing-research.md` (Type-2)

Research plan whose deliverable is a design document — *not* implementation. Two orthogonal axes (isolation × conflict-avoidance) → concrete (cell) options. Honest 16–24 h budget. Open Q0 to decide before starting: in parallel with Type-1, or after Type-1 has measured A/B?

First-pass found 2 BLOCKERS + 4 MAJORS. Revised. Re-review approved with one cosmetic ("Day" → "Session") fix already applied.

---

## 5) Type-1 implementation

### Files

| File | Role |
|------|------|
| `orchestrator/lib/job-research.js` | The lib. Exports `buildResearchQueries`, `runResearchQuery`, `runResearch`, `formatBundleForPrompt`. |
| `orchestrator/lib/job-runner.js`   | Added `researchFn` option to `runJob`; Slice E retry policy. |
| `orchestrator/lib/job.js`          | Added `setTaskResearch` helper. |
| `orchestrator/server.js`           | Real coder adapter now receives `research` as 3rd arg; `formatBundleForPrompt` prepends a ≤3 KB pre-context block. The on-retry "previous attempt failed review" prompt block was also translated to English in passing (last Korean residue inside the adapter closure). |
| `orchestrator/test/job-research.test.js` | 22 unit tests (16 from Slice A + 2 from Slice A-fix + 4 from Slice C's formatter). |
| `orchestrator/test/job-runner.test.js`   | +6 wiring tests across Slice B + Slice E. |
| `orchestrator/README.md`           | Documents the 5 RESEARCH_* env vars; also migrated to English. |

### Env vars (off by default)

| Variable | Default | Effect |
|----------|---------|--------|
| `RESEARCH_ENABLED` | `0` | Set to `1` to turn on. |
| `RESEARCH_PARALLELISM` | `2` | Parallel-subprocess cap, clamped `[1, MAX_QUERIES=5]`. |
| `RESEARCH_QUERY_TIMEOUT_MS` | `60000` | Per-query wall-clock. SIGTERM → 3 s grace → SIGKILL. |
| `RESEARCH_AGGREGATE_TIMEOUT_MS` | `90000` | All-queries cap. Aborts via AbortController; in-flight children get SIGTERM. |
| `RESEARCH_MODEL` | `claude-sonnet-4-20250514` | Query-builder model only; subprocesses inherit Claude Code CLI's default. |

### Slice E retry policy (codified)

| Retry kind | Cached bundle? | Re-run research? |
|------------|----------------|------------------|
| First attempt | n/a | yes |
| Coder-fail retry (auto, within runJob) | yes | no — research is still valid |
| Review-fail retry (after resume) | cleared first | yes — reviewer feedback may have moved the target |

### What still needs to happen (Slice F)

A/B comparison on a representative 5-task set: measure adapter wall-clock and tokens (with/without `RESEARCH_ENABLED`), measure review pass-rate (with/without). Target threshold: ≥ +20% review pass-rate or ≥ −20% wall-clock to justify default-on. The plan §Slice F has the exact protocol; output is a CSV under `docs/superpowers/handoffs/` plus a summary table.

---

## 6) Verification commands

```bash
# Run from orchestrator/
node --test test/job-runner.test.js test/job-state.test.js test/job-decomposer.test.js \
  test/job-qa-strategist.test.js test/job-research.test.js test/molly-classifier.test.js \
  test/molly-plan-emitter.test.js test/molly-chat.test.js test/molly-status.test.js \
  test/molly-prd-analyzer.test.js test/molly-lifecycle.test.js
# → 171 pass / 0 fail

# Frontends (run from playground-app/ and dashboard/)
pnpm tsc --noEmit  # both clean

# Korean residue in DS source (intentional Tving samples remain)
grep -rn '[가-힣]' design-system --include='*.md' --include='*.json' | grep -v node_modules | wc -l

# Try the new research step (off by default, opt-in)
RESEARCH_ENABLED=1 pnpm start
```

---

## 7) Known gotchas

- **Research bundle is task-scoped, not job-scoped.** Cross-task caching is a future slice (Phase 3 in the plan).
- **Reviewer doesn't yet receive `research`.** Slice C deferred Phase 4. Slice F's A/B will tell us whether reviewer-side wiring is worth doing.
- **Anthropic ITPM**: `RESEARCH_PARALLELISM=2` is the safe default. Claude Code subprocesses carry ~10 K input tokens of system preamble; at parallelism 2 that's ~24 K input tokens in one wall-clock second — fine against the default-tier ITPM but tight enough that we shouldn't raise it without measuring.
- **`claude` CLI on PATH**: Slice A's Option B assumes the Claude Code CLI is available as `claude` in PATH. If we ever ship the orchestrator into an environment without it, the env-var to override the binary is a future addition.
- **`orchestrator/state/` legacy files**: Slice E's "no `research` field on legacy jobs" is exercised by every existing test fixture that doesn't stamp one — no explicit migration needed, but the runner reads `task.research ?? null` so the back-compat shape is whatever the disk says.

---

## 8) Next session candidates

Pick one — listed by readiness:

1. **Slice F (A/B measurement)** — turn on `RESEARCH_ENABLED=1`, run 5 representative jobs from the historical corpus, capture before/after tokens + wall-clock + review pass-rate. Commit the CSV + summary table; flip the default if numbers justify it.
2. **Type-2 research project (the design-doc deliverable)** — start the 16–24 h research from the sibling plan. **Needs the user's answer to Q0 first**: start now, or queue after Type-1 measurement?
3. **Reviewer-side `research` access** — Phase 4 of the Type-1 plan. Now that the coder uses research, propagate it to `reviewTaskDiff` and measure whether reviewer pass-rate moves.
4. **Cloudflare Tunnel 2-user trial** — `docs/superpowers/plans/2026-05-11-local-share-cloudflare-tunnel.md` is sitting ready since two days ago.
5. **GCP phased deploy** — `docs/superpowers/plans/2026-05-11-gcp-deploy-phased.md` — wait until trial feedback narrows the requirements.

---

## 9) Service ports (unchanged)

- orchestrator `:3847`
- playground-app `:4180`
- dashboard `:4174`

Auto-restart:
- orchestrator: `node --watch` on lib edits
- playground-app / dashboard: Vite HMR

---

*Last updated: 2026-05-12. Research-parallelism (Type-1) is functionally complete behind a default-off flag; next session should pick from §8.*
