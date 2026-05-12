# Plan — Research-parallelism for the task runner (read-only sub-agents)

**Date:** 2026-05-12
**Author:** kyungjae.ha (with Claude Opus 4.7)
**Status:** Draft — awaiting review
**Estimate:** ~10–12 hours of focused implementation (revised after review)
**Related:** `docs/superpowers/plans/2026-05-12-concurrent-code-writing-research.md` (sibling plan covering the larger Type-2 effort)

---

## Background

Our `orchestrator/lib/job-runner.js` runs tasks strictly serially. Each task fires a single coder adapter (Claude Code subprocess) that has to discover everything on its own — similar pages, conventions, API contracts, prior tests — before it writes a line of code. That discovery is essentially a long, sequential preamble inside one expensive Sonnet/Opus call.

Two observations:
- Most discovery is **read-only**. There is no contention if multiple agents do it in parallel.
- The kind of "parallelism" that Claude Code / OMC / OpenCode actually use most often is **read-only sub-agent dispatch** (Task tool, scientist agents, explore agents). That is the safe, cheap variant of parallelism.

This plan adds a **research step before each task's adapter call**: the orchestrator dispatches N read-only research sub-agents in parallel, collects their results, and passes the synthesized context into the coder adapter. The coder still runs serially against the shared sandbox (we are explicitly **not** doing concurrent writes in this plan — that lives in the sibling plan).

This is "OMC-style research, our adapter for code."

---

## Goals / Non-goals

**Goals:**
- Coder adapter receives a research bundle with: similar files, relevant design-system patterns, API/converter file map, related tests, recent commits in the area.
- Wall-clock for the research step is dominated by the slowest of N parallel sub-agents (rather than `N × single-shot`).
- Research output is **persisted on the task** so retries reuse it without re-spending tokens.
- Opt-in flag (`RESEARCH_ENABLED=1`) so we can A/B against the no-research baseline.
- Cost cap: ≤ 5 research sub-agents per task; skip entirely for trivial cosmetic tasks.

**Non-goals:**
- True concurrent code writing (multiple adapters touching the codebase simultaneously) — that is the sibling Type-2 plan.
- Cross-task research caching (later — first prove single-task value).
- Replacing Claude Code's own internal Task tool — we layer **on top** of the adapter, not inside it.
- Slack/Playground UI changes — surfacing the research bundle in the UI is a follow-up; for now the bundle is debug-logged + persisted.

---

## Architecture

```
job-runner.runJob(jobId):
  for each task picked:
    1. setTaskStatus(running)
    2. [NEW]  research = await runResearch(task, ctx)
                          ├─ buildQueries(task) → 3–5 focused questions
                          ├─ Promise.all(dispatch(query) for each)
                          └─ aggregate results into a structured bundle
    3.        adapter(task, ctx, research)   ← coder receives the bundle
    4.        review(diff)
    5.        commit
```

`runResearch` returns:

```ts
type ResearchBundle = {
  queries: Array<{ question: string; answer: string; tokensUsed: number; ms: number }>;
  files: string[];                   // candidate file paths to read
  patterns: string[];                // DS pattern IDs that look relevant
  notes: string;                     // synthesized 2-paragraph summary
  totalTokens: number;
  totalMs: number;
};
```

Persistence: `job.tasks[i].research = bundle` so retries see it.

### Dispatcher mechanism

Two options for the parallel dispatcher:

**Option A — orchestrator-level Anthropic SDK calls.**
The research step makes N parallel HTTP POSTs to `api.anthropic.com/v1/messages`, each with a focused system prompt. Cheap, simple, no subprocess. **But:** without tool access the research model is reasoning from its prior + the task description only — close to "LLM guesswork." Plumbing tool access (custom `grep`/`read` via Anthropic tool-use, or an MCP filesystem server) is non-trivial and ships nothing the rest of the codebase already has.

**Option B — N Claude Code subprocesses (recommended).**
Spawn N short-lived Claude Code processes in parallel, each given a single research query and read-only permissions (`--allowedTools Glob,Grep,Read,Task`). Heavier per call (subprocess startup, sandbox setup) but leverages Claude Code's mature explore/grep/Task tooling for free — which is exactly the discovery work the research is supposed to do.

**Recommendation: Option B.** The momus review surfaced that Option A's "read-only tool surface" was an unsolved blocker — without tools the research is near-useless, and *with* tools we are rebuilding what Claude Code already does. Subprocess startup overhead (~1–2 s per query, parallel) is acceptable for a step that runs once per task. The cost trade-off is paid in wall-clock latency, not engineering complexity.

### Build the queries

A query-builder LLM call (single Sonnet call) that takes the task title + description and emits **0–5 focused questions** (hard cap 5; query-builder prompt encourages 0 for trivial / cosmetic tasks and 2–4 for typical feature tasks). Constraint: each question must be answerable by reading a handful of files / running grep, **not** by reasoning. The 0–5 emitted is **independent** from the parallel-dispatch fan-out (`RESEARCH_PARALLELISM`, default 2): if the builder emits 5 questions and parallelism is 2, three rounds of 2-then-2-then-1 fire sequentially. Examples for the task "Add a creative review page":

1. "Find 2–3 existing list pages in `src/apps/tving/` and return their file paths + the patterns they follow."
2. "Which design-system pattern in `design-system/src/patterns.json` matches a list page with bulk-selection?"
3. "Trace the Creative entity in `design-system/src/api-ui-contracts.json` and return its converter/model/UI mapping."
4. "Are there existing tests for review screens in `apps/tving/`? Return file paths if so."
5. "What does `git log --since='30 days ago' -- src/apps/tving/component/creative/` show?"

The query-builder prompt teaches the model to skip queries when the task is small (returns 0–1 query). Cost gate.

### Failure handling

- Any individual research sub-call that throws → record the error, omit from bundle, continue.
- Query-builder throws → skip research entirely, proceed with empty bundle (back to current behavior).
- Aggregate timeout (default 90s wall-clock) → return partial bundle.
- All this is wrapped so the **task pipeline is never blocked by research**.

---

## Slices

### Slice A — research lib + query builder (≈2.5h)

`orchestrator/lib/job-research.js` — exports:
- `buildResearchQueries(task)` → `Promise<Array<{ question, scope }>>`. Single Anthropic call (Sonnet) — query builder is the only step that talks to Anthropic directly.
- `runResearchQuery({ question, scope, ctx })` → `Promise<{ answer, tokensUsed, ms }>`. Spawns one Claude Code subprocess with `--allowedTools Glob,Grep,Read,Task` (read-only) and the question as its sole input.
- `runResearch(task, ctx)` → orchestrates the above with `Promise.allSettled` + aggregation.

**Subprocess hygiene** (review follow-up, Option-B-specific):
- **Per-subprocess timeout**: 60 s wall-clock per query. Aggregate cap is the 90 s wall-clock mentioned in §Failure handling. Kill via `child.kill('SIGTERM')` then `SIGKILL` after a 3 s grace; record `'timeout'` outcome in the bundle.
- **Stdout/stderr capture**: stream child output line-by-line into `orchestrator/logs/research/{jobId}-{taskId}-q{n}.log`. The final answer is parsed from the *last* JSON block in stdout (Claude Code emits it on completion).
- **Working directory**: each subprocess `cwd = sandboxRoot(playgroundId)` so `Grep`/`Read` resolve relative paths the same way the coder adapter sees them. Confirm by re-reading the `runChangeRequestForTask` cwd convention before implementing; if it differs, adopt that.
- **Reuse existing utilities**: prefer importing whatever subprocess-spawn helper `runChangeRequestForTask` (server.js:450) already uses, rather than re-implementing. Track the actual reused symbol in the implementation handoff.

Unit-style tests (no live subprocess): mock the spawn helper to return canned stdout, verify the bundle shape, partial-failure isolation, per-query timeout-kill, aggregate timeout, and log-file creation.

### Slice B — wire into runner (≈1h)

`orchestrator/lib/job-runner.js`:
- After `setTaskStatus(running)`, conditionally call `runResearch` if env `RESEARCH_ENABLED=1`.
- Stamp `task.research = bundle` via a new `setTaskResearch` helper in `job.js` (persisted).
- Pass `bundle` as a fourth argument to `adapter(task, ctx, research)`.
- The current adapter signature in server.js needs to accept `research` (back-compat: default to `null`).

### Slice C — adapter integration (≈3h)

The runner-level adapter at `server.js:747` is a closure that **builds a `userPrompt` string** and delegates the actual subprocess spawn to `runChangeRequestForTask` at `server.js:450`. Two layers must be touched:

**Layer 1 — outer closure (server.js:747).** Receives the new `research` argument from the runner. Formats the bundle as a structured pre-context block (≤ 3 KB cap to protect the context budget): bullet list of `files`, a "Suggested patterns" line, and the `notes` paragraph. Either:
  - (a) concatenate the block onto `userPrompt` before passing to `runChangeRequestForTask` (no signature change), or
  - (b) thread `research` through `runChangeRequestForTask`'s signature and into the subprocess prompt builder, separately from `userPrompt`.

  Option (a) is the minimum diff; option (b) gives Claude Code the bundle as a *separate* system-level context block rather than user-text. Pick (a) for v1, defer (b) to a follow-up.

**Layer 2 — `runChangeRequestForTask` (server.js:450).** Verify it doesn't truncate or rewrite the `userPrompt` in a way that strips the pre-context block. Add a regression test.

**Reviewer-side wiring (deferred).** The reviewer adapter at `server.js:782` does **not** receive `research` in v1. The reviewer judges the diff against the task description as today. If A/B (Slice E) shows that reviewers would benefit from `research` too (e.g. "research found DS pattern X with anatomy Y → reviewer can check against Y"), that becomes a Phase 2 follow-up. Tracking issue in the handoff doc.

### Slice D — observability (≈1h) — must precede A/B

Cost / latency is recorded via the existing `recordEvent('lib_call', …)` pattern that `molly-status.js:143`, `molly-chat.js`, `molly-classifier.js`, `molly-plan-emitter.js`, and `molly-prd-analyzer.js` already use. **Not** by adding lines to `molly-cost.js` — that file is a read-side NDJSON aggregator, not a recorder (review B1).

- Add `recordEvent('lib_call', { lib: 'research', jobId, taskId, query, inputTokens, outputTokens, durationMs })` once per research query.
- Add `recordEvent('lib_call', { lib: 'research_orchestration', jobId, taskId, queryCount, totalMs })` once per task's research step.
- `molly-cost.js` already buckets `lib_call` events by `lib` field, so dashboards pick this up for free.
- Bundle dump for offline analysis goes to `orchestrator/logs/research/{jobId}-{taskId}.json` (orchestrator-local; **not** `.omc/logs/…` which is per-user). Confirm the orchestrator writes to its own `orchestrator/logs/` dir (`fs.mkdir({recursive:true})` on first run).

### Slice E — state migration + pause/resume + retry semantics (≈1.5h) — new slice from review M3

- **Migration**: jobs persisted before this feature have no `research` field. `getJob` already tolerates missing optional fields; adapter must read `task.research ?? null`. Add a unit test loading a legacy fixture from `orchestrator/test/fixtures/legacy-job-no-research.json` and verifying no crash.
- **Pause/resume**: when `runJob` re-enters after a pause (`job-runner.js:153–162`), if the currently-resumed task already has `task.research` set, reuse it (no re-spend). If the task is being retried *after a reviewer-fail*, re-run research so the new attempt benefits from any code that changed since the previous attempt (the reviewer feedback may have moved the target). The decision lives in `runResearch`: `if (task.research && !task.lastReviewFeedback) return task.research`.
- **Retry-after-failure**: if the adapter fails (not the reviewer), keep the existing research bundle for the retry — the failure was on coder, the research is still valid.

### Slice F — A/B comparison (≈1h) — depends on Slice D

- Run 5 representative tasks twice: once with `RESEARCH_ENABLED=0`, once with `=1`. Measure: adapter wall-clock, adapter tokens, review pass rate.
- Commit the comparison spreadsheet (CSV) under `docs/superpowers/handoffs/`.
- "No regression in serial-task throughput when `RESEARCH_ENABLED=0`" means: median adapter wall-clock and median adapter tokens stay within ±5% of the pre-feature baseline (one fresh measurement run, same task list, captured before this work ships).

### Slice G — opt-in flag + docs (≈0.5h)

- Env flag `RESEARCH_ENABLED` (default `0`). Per-job override via job state.
- README + handoff entry.

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Research adds latency that outweighs the benefit | Medium | Slice F A/B is the gate. Default-off until we have evidence. |
| Token cost balloons (N × research per task) | Medium | Hard cap at 5 queries per task. Query-builder is incentivized in its prompt to return 0–1 query for small tasks. |
| Research answers are bland and don't help the coder | Medium | Slice F measures review pass-rate, not just speed. If pass-rate is flat, kill the feature. |
| Parallel subprocesses overwhelm Anthropic rate limit (ITPM/OTPM, not RPM) | Medium-High | Each Option-B subprocess carries ~10 K input tokens of Claude Code preamble + ~2 K of question = **~12 K input tokens per query**. At `RESEARCH_PARALLELISM=2` that's 24 K input tokens dispatched in one wall-clock second; at the default Anthropic tier ITPM of ~50 K, two such bursts in the same minute touch the ceiling. At parallelism=5 the burst alone exceeds the per-second budget. Mitigations: (i) cap parallel queries at **2 concurrent** by default — this is now an enforcement (not "lift to 5 if you feel like it") because Option B's preamble makes higher fan-out unsafe, (ii) jittered exponential backoff on `429` with `Retry-After` honored, (iii) `RESEARCH_PARALLELISM` env var to tune *down* to 1 on accounts with tighter limits. Re-measure when the team's ITPM tier changes. |
| Research bundle becomes stale on retry | Low | Bundle is task-scoped, not job-scoped. Re-run only when explicitly invalidated (`setTaskResearch(null)`). |

---

## Cost estimate

Honest math, per single task (not per job). **Option B** (Claude Code subprocess) inflates per-query input tokens by the Claude Code system-prompt preamble (~10 K tokens of tool-use scaffolding loaded into every subprocess), so the cost is materially higher than a raw Anthropic API call would be:

- Query-builder: 1 Sonnet call via raw Anthropic API, ~500 tokens. **~$0.003.**
- N research sub-calls (Option B subprocesses): 0–5 Sonnet calls, each with ~10 K input (preamble) + ~2 K input (question + scope) + ~500 output tokens. **~$0.04 per query** at Sonnet pricing → **0–$0.20 per task**.
- Single Opus coder call (today): **~$0.30–1.00 per task** depending on context size.

Overhead ratio:
- **Best case** (zero research queries on a trivial task, query-builder only): ~0.3%.
- **Typical case** (3 queries on a feature task vs $0.50 coder): $0.12 / $0.50 ≈ 24%.
- **Worst case** (5 queries on a cheap coder, $0.20 / $0.30): **~67%**. This is the actual worst case under Option B and is meaningfully worse than the Option-A estimate (17%) the original plan stated.

Job-level (N tasks): the ratio is preserved, not multiplied. A 5-task job pays 5 × research and 5 × coder, so the percentage stays the same. But the absolute additional spend matters — at 24% on a $5 job, that's an extra ~$1.20 per job for research overhead.

**Mitigation for the worst case**: the query-builder prompt is incentivized to emit 0 questions for trivial tasks, so the 5-query worst case fires only on substantial features where coder cost is itself high (≥$0.50). The realistic blended overhead from Slice F's A/B will land closer to 15–25% than to 67%. We commit to that being **the** measurable number — if the blended number lands above 30%, the feature is killed regardless of speedup, because cost is then dominating.

---

## Phases

```
Phase 1 (this plan) — Slices A–G. Ship behind `RESEARCH_ENABLED` flag. Off by default.
                      Order: A → B → C → D → E → F → G. D (observability) must
                      land before F (A/B) because F needs the recorded metrics.
Phase 2 (follow-up) — Default flag on for a week. Measure with the operational dashboard.
Phase 3 (follow-up) — Cross-task caching (same job → shared file index, shared design-system loads).
Phase 4 (deferred)  — Reviewer-side research access (see Slice C "Reviewer-side wiring").
```

---

## Open questions

1. **Default-off vs default-on** — once Slice F shows positive results, do we flip global default, or per-task heuristic (e.g. research only when description is >200 chars)?
2. **Bundle staleness across pause/resume** — Slice E codifies "reuse if no review feedback; re-run if reviewer failed the previous attempt." Is that the right policy, or should *every* resume re-run research to be safe? Trade-off: cost vs freshness.
3. **UI surfacing** — should the Playground / Slack show a "🔍 Researching..." chip while research is in flight, so users see something is happening? Or stay invisible and only show the eventual adapter run?
4. **Subprocess pool size** — Slice A's `RESEARCH_PARALLELISM` env var defaults to 2 to respect ITPM. Should we surface this per-job (a slow-iteration job could safely use 5; a fast-iteration job stays at 2)?

---

## Definition of done

- `RESEARCH_ENABLED=1` produces a non-empty bundle for a representative task and the adapter visibly uses it.
- A/B numbers from Slice F are committed in a handoff doc (CSV + summary table).
- Cost-tracking events `lib_call`/`lib: research` and `lib: research_orchestration` appear in `molly-cost` aggregates.
- **No regression** when `RESEARCH_ENABLED=0` is defined as: median adapter wall-clock and median adapter token spend stay within ±5% of the pre-feature baseline, measured against the same 5-task control set captured immediately before this work merges.
- Tests in `orchestrator/test/job-research.test.js` cover: bundle shape, partial-failure isolation, timeout, legacy-job back-compat (no `research` field), and pause/resume policy from Slice E. Tests use `node --test` like the rest of `orchestrator/test/`.
