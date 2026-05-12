# Plan — Concurrent code-writing for the task runner (research / design)

**Date:** 2026-05-12
**Author:** kyungjae.ha (with Claude Opus 4.7)
**Status:** Research plan — produces a design proposal, not implementation
**Estimate:** 16–24 hours of focused research + writing the design doc (revised after review — header originally said 6–10h, which collided with the 4-day Methodology block; Day 2 case-study reading alone is ~6–8h)
**Related:** `docs/superpowers/plans/2026-05-12-research-parallelism.md` (sibling plan covering the cheaper Type-1 effort)

---

> **Terminology** (review n1): "Type-1" = read-only sub-agents doing research in parallel before the code change (sibling plan). "Type-2" = multiple code-writing agents running concurrently. The "two types" framing came out of an earlier session conversation; defining them here so the labels are self-contained.

## Background

Today our orchestrator's `job-runner.js` has the invariant `Serial only. One task in flight at a time per job.` The reason is real: every task adapter writes into the same per-playground sandbox, commits to the same git branch, and is reviewed by a single reviewer agent. Two adapters running at once would race on file system + git tree + review FSM.

The user observed that Claude Code / OMC / OpenCode can run multiple agents *writing* code at once. Tools like `ultrapilot`, `team`, `swarm` exist precisely for this. The difference between "they can, we can't" is **not the LLM** — it's the **coordination infrastructure** around the LLM (file-ownership partitioning, per-task worktrees, merge orchestration, atomic claiming of work units).

This research plan does **not** build that infrastructure. It produces a **design proposal**: what would coordination infrastructure look like for *our* orchestrator? What are the realistic options, the trade-offs, and the recommended path? The goal is that after reading this we can decide whether to invest in Type-2 parallelism at all, and if yes, which variant.

The sibling Type-1 plan (read-only research sub-agents) lands first because it's cheaper, safer, and gives most of the wall-clock win for our typical task pattern (sequential chains with light independent branches).

---

## Goal of this research

A written design document at the end that answers:

1. **Is concurrent code writing worth it for us?** Given our task graph shapes (mostly chains, occasional independent branches), how often would real parallel slots actually exist?
2. **Which mechanism?** Pick one of {git-worktree-per-task, branch-per-task with serial merge, file-ownership partitioning, claim-based work-pool}, with reasons.
3. **What changes do we need in the orchestrator FSM?** Specifically: how does `running` state, `commitSha`, `currentTaskId`, and the reviewer pipeline evolve when there can be multiple "in-flight" tasks?
4. **What UX changes does the user see?** Playground / Slack / Dashboard need to show N tasks in flight, multiple "WORKING" cards, per-task cancel, partial-failure recovery.
5. **What is the realistic cost?** Tokens (now ×N concurrent), infrastructure (N worktrees on disk, N sandbox containers), and engineering time to build + maintain.

The final doc should be detailed enough that an executor (or junior dev with context) could turn it into a multi-week implementation plan without further design decisions.

---

## Non-goals of this research

- Building anything. The deliverable is a written design.
- Solving truly hostile cases (two tasks that *must* touch the same line). Those stay serial; the design decides what "must" means.
- Replacing our reviewer agent with something parallel-aware. The proposal can either keep serial review (queue) or evolve it; that decision belongs in the doc.

---

## Questions to answer (in the deliverable)

### Q1 — Task graph reality
- How many tasks in a typical 10-task job actually have empty `dependsOn` (i.e. could run in parallel)?
- Of those, how many touch overlapping files? Measure on 5–10 recent jobs from `orchestrator/state/`.
- What is the theoretical wall-clock speedup ceiling for our actual workload?

> **⚠ Corpus-contamination caveat** (from review B1): every file in `orchestrator/state/` predates commit `17ec8f6` (the Kahn-topo → input-order fix). Those job graphs were emitted by a planner that *knew* the runner was Kahn topo + serial. Two confounders: (a) the planner author may have learned to emit shallow `dependsOn` because deep ones reordered surprisingly under topo, and (b) `dependsOn` semantics from that era may not match what today's planner emits. Treat the historical corpus as a **lower bound** on parallel-eligibility, not as an authoritative measurement. The Day-1 task must explicitly call this out, and the remediation is:
>
> - Pick 3 representative PRD prompts from the historical corpus.
> - Re-run them through today's `molly-plan-emitter` + `job-decomposer` (under commit 17ec8f6 + later).
> - Measure parallel-eligibility on the **fresh** task graphs and compare against the historical baseline.
> - If the gap is large, the deliverable's recommendation should be sized against the fresh number, not the historical one.

### Q2 — Coordination mechanism

Instead of comparing five pre-shaped "candidates," structure the analysis along **two orthogonal axes** (revision per review M1). Every concrete mechanism is then a cell in the matrix:

**Axis 1 — Isolation mechanism** (where each task's writes land before merge):

| Level | Mechanism | Disk / setup cost |
|-------|-----------|--------------------|
| 0 | None — all tasks share the playground sandbox directly | Free, but serial only |
| 1 | Branch per task on the same checkout | Free; conflict at commit time |
| 2 | Git worktree per task | One checkout per slot — verify msm-portal worktree size during Day 1 (likely ~1–3 GB including `node_modules`; shared `node_modules` via pnpm/symlink should be assumed) |
| 3 | Container per task (Docker / nix-shell) | Heaviest; gives clean process tree + env, gives the reviewer agent a stable env |

**Axis 2 — Conflict-avoidance mechanism** (how we prevent two tasks from clobbering each other):

| Level | Mechanism | Notes |
|-------|-----------|-------|
| 0 | None — race and hope | Only works if Isolation ≥ 2 plus a post-hoc merge tool |
| 1 | Pre-partition file ownership | Compute disjoint write-sets at plan time; reject overlapping plans before dispatch |
| 2 | Claim-based work pool | SQLite-atomic claim; each worker draws one task and locks the files it intends to touch |
| 3 | Post-hoc merge queue | Tasks run freely; a single-threaded merger drains a queue with conflict resolution |

Mechanisms to evaluate are then specific **(isolation, conflict)** cells:

- **(Isolation 2, Conflict 1)** — worktree + pre-partition. The "OMC ultrapilot" style, if M4 / Day-2 reading confirms.
- **(Isolation 1, Conflict 2)** — branch + claim pool. The "OMC swarm" style, again subject to Day-2 verification.
- **(Isolation 2, Conflict 3)** — worktree + post-hoc merge. Highest throughput, hardest failure semantics.
- **(Isolation 0, Conflict 1)** — shared sandbox + pre-partition. Fast-path: if Q1 shows most parallel-eligible tasks are *also* non-overlapping in file paths, we may not need worktrees at all. **This is a possible Q1 conclusion the deliverable must consider.**
- **(Isolation 3, Conflict 1)** — container + pre-partition. Heaviest investment; reserve for a future phase.

For each cell, document:
- How work units are partitioned (static analysis? LLM-decided? user-driven?)
- How disk/sandbox isolation is achieved (concrete tooling)
- How merge happens at the end
- Failure semantics: 3 of 5 succeed, what happens to the 2 that failed?
- Disk cost (measured during Day 1, not asserted)

### Q3 — FSM evolution
- `job.currentTaskId` becomes `job.currentTaskIds: string[]`. What invariants does that break in `job.js`, `molly.js`, `JobCard.tsx`?
- Reviewer ordering: does each task get its own reviewer pass, or do we batch and review once at the end?
- Cancel semantics: does cancelling the job cancel all N in-flight adapters, or only the next ones?
- Retry semantics: if task X failed in parallel with Y, and Y succeeded, do we retry X without redoing Y?

### Q4 — UX implications
- Playground UI: multiple WORKING cards simultaneously. The current UI assumes 1 currently-running. Where does the layout break?
- Slack: do we still post one "task X started" message per task? Threads vs separate messages.
- Dashboard `JobsPage` / `JobDetailPage`: how is concurrent progress shown?
- "Restart during run" semantics with N in-flight: do we resume N or only the most recent?

### Q5 — Cost projection

**Data source (M2 revision):** **Do not hand-wave**. Pull recorded token counts from `recordEvent('lib_call', …)` NDJSON via `orchestrator/lib/molly-cost.js` aggregates for the last 10 representative jobs. Compute:

- Per-task input + output tokens, **mean and p95**, split by `lib` (decomposer, plan-emitter, coder, reviewer, qa-strategist).
- Per-job total token spend and wall-clock duration.

That gives a defensible $/task ground truth, not the vague "$0.30–1.00" placeholder.

**Then project:**
- LLM tokens at N-way concurrency: parallel coder calls fan out by N. Token spend per wall-clock minute scales by N; spend per job is multiplied by 1× (same total work) **only if** there is no retry blow-up. If parallel tasks share a failure (e.g. one breaks the build for the others), worst-case retry can push the multiplier to 1.5–2×. Bound this case using `attempt > 0` counts from the same `lib_call` corpus.
- Infrastructure: N worktrees on disk (size measured in Day 1), possibly N sandbox containers, possibly N Vite dev servers if preview rendering needs to run concurrently per task. Disk + RAM ceiling on a 16 GB MacBook (the current dev surface).
- Engineering: rough person-week estimate for each (isolation, conflict) cell from Q2. Target a range, e.g. **(0,1) ≈ 1 wk; (2,1) ≈ 3–4 wks; (2,3) ≈ 5–6 wks; (3,1) ≈ 6+ wks**. Validate by spot-checking with someone who's built one of these before.

### Q6 — Comparative case studies

Revised list per review M4. Dropped Cline/Aider (single-agent designs — they have no concurrent-write story to learn from). Added three sources with public material on multi-agent / multi-worker file coordination:

- **OMC ultrapilot** — `skills/ultrapilot.md` and the supporting agent definitions. How does it partition? What's the merge story? **Verify the partitioning model — it may be claim-based rather than pre-partition. Don't anchor cell names to unverified claims (review n3).**
- **OMC swarm** — claim-based SQLite (`oh-my-claudecode:swarm` skill). Strengths / weaknesses; atomic-claim implementation details.
- **OMC team** — Claude Code native teams (`oh-my-claudecode:team`). How is coordination wired?
- **Ramp Inspect** — worktree-based isolation. From the blog post and any linked design docs.
- **Devin / Cognition Labs** — the publicly documented "junior engineers" pattern with worktree isolation per parallel track. Closest existing match to what we'd be proposing.
- **Sourcegraph Cody / Amp swarm** — public design notes on parallel agent file-locking; useful for Conflict-axis levels 1–2.
- **Buildkite / Bazel remote execution** — not LLM-specific, but the math of "many workers, atomic claim, merge queue" (Conflict-axis levels 2–3) is identical and well-trodden territory.
- **OpenCode (Open-Inspect)** — referenced from our `design-system/STRATEGY.md`. Skim only — likely yields little for Q6 but worth a sanity pass.

---

## Methodology

Honest budget: **16–24 hours across 4 working sessions** (review B2 — the original "Day 1…4" was paced at ~6 h/day; that was too tight for Day 2's case-study reading alone).

```
Session 1 (~4–6 h) — Measure (Q1)
  - jq-mine `orchestrator/state/` job files. Count parallel-eligible tasks
    per job. Map file-overlap between independent tasks (grep diffs by file).
  - Re-plan 3 representative historical PRDs under today's planner (per the
    B1 corpus-contamination remediation). Compare historical vs fresh.
  - Output: a CSV with one row per job summarising max parallelism, plus a
    short narrative on the historical-vs-fresh delta.

Session 2 (~6–8 h) — Read (Q6)
  - OMC ultrapilot + swarm + team source: read the skill definitions and
    the underlying agent code. Annotate how each coordinates writes.
    Verify whether ultrapilot is pre-partition or claim-based.
  - Ramp Inspect blog + any linked design docs.
  - Devin / Cognition public materials on the worktree-per-track pattern.
  - Sourcegraph Amp file-locking notes.
  - Bazel / Buildkite RBE: how claim + merge works at scale (skim — this
    is for prior-art validation of Conflict axis levels 2–3, not adoption).
  - OpenCode skim (likely yields nothing — time-box to 20 min).
  - Output: a 1-page comparison table keyed by (isolation, conflict) cells.

Session 3 (~4–6 h) — Compare (Q2 + Q3 + Q4 + Q5)
  - Fill in the (isolation, conflict) matrix with concrete mechanisms
    drawn from Session 2's reading.
  - For the 2 most-promising cells, deep-dive into Q3 (FSM) and Q4 (UX).
  - Run the Q5 cost projection against the molly-cost.js measurements
    captured in Session 1.

Session 4 (~2–4 h) — Recommend + write
  - One-page executive summary: recommended (isolation, conflict) cell,
    phasing, open risks, hand-off to an implementation plan.
  - Append: Q0–Q6 evidence as supporting sections.
  - If Session 1's contamination remediation showed parallel-eligibility
    is near-zero, the executive summary may instead recommend "kill" or
    "redirect" (see Definition of done).
```

**Failure mode to watch:** Session 2 reading is the most likely to blow the budget. If the OMC source dive runs over, cut Bazel/Buildkite + OpenCode rather than skimping on Sessions 3–4. The deliverable's recommendation matters more than exhaustive case-study coverage.

---

## Deliverable

A single document `docs/superpowers/plans/2026-05-XX-concurrent-code-writing-design.md` with the structure:

```
1. Executive summary (1 page) — recommended (isolation, conflict) cell,
   phasing, dead-ends ruled out
2. Workload measurement (Q1) — including the historical-vs-fresh
   contamination analysis
3. Comparative case studies (Q6 condensed)
4. Mechanism trade-off matrix on the two axes (Q2)
5. FSM design proposal for the recommended cell (Q3)
6. UX proposal (Q4)
7. Cost projection (Q5) — anchored on molly-cost.js measured tokens
8. Open questions and decisions deferred to implementation
9. Phased implementation outline (high level — actual implementation plan
   is a separate doc, target range 2–6 engineer-weeks depending on cell)
```

---

## Risks of this research itself

| Risk | Mitigation |
|------|-----------|
| Q1 measurement shows our task graphs almost never have real parallelism → research concludes "don't build it" | That's a valid outcome. The doc still produces value by killing a tempting direction early. |
| Q6 case studies are shallow because OMC source is large and idiomatic | Time-box reading to Day 2. Note which sections we couldn't reach and ship anyway. |
| Cost projection is hand-wavy — we don't know per-task tokens precisely | Use actual `molly-cost.js` logs from a real 10-task job to ground the numbers. |
| Recommendation gets shelved indefinitely | Set a re-look date in the doc: revisit if Type-1 research-parallelism shipped + measured wall-clock is still painful 4 weeks later. |

---

## Open questions for the user (to answer before research starts)

0. **Strategic prior — should we even do this now?** (review M3) The sibling Type-1 plan (read-only research sub-agents) hasn't shipped yet. The background of this plan asserts Type-1 captures most of the wall-clock win. If we wait until Type-1 has measured A/B numbers, this Type-2 research has firm ground to stand on; if we start in parallel, we risk doing 16–24 h of work that gets recommended away by a "Type-1 was enough" finding. **Decision needed**: start Type-2 now in parallel, or queue it for after Type-1 measurement?
1. **Workload sample** — should the Day-1 measurement use jobs from the last 7 days only, or the full backlog of `orchestrator/state/`? (See B1 corpus-contamination caveat.)
2. **Cost threshold** — what token-cost premium is "too much"? 2×? 5×? Helps set the recommendation bar.
3. **UX patience** — would the team accept "the Playground shows 5 spinners at once" as a normal state, or is that visual noise a non-starter? Affects mechanism choice.

---

## Definition of done

- Deliverable document committed at `docs/superpowers/plans/2026-05-XX-concurrent-code-writing-design.md`.
- Recommendation is explicit (one mechanism cell from Q2's matrix, with phasing).
- All open questions above (Q0 + Q1–3) are addressed in the doc (either resolved or escalated).
- Decision sign-off from the user, picking **one** of four outcomes:
  - **green-light implementation plan** (write the implementation plan next),
  - **shelf for 4 weeks** (revisit after Type-1 measured),
  - **redirect** (e.g. Day-1 finds the bottleneck is reviewer parallelism, not coder — turn the research toward that instead),
  - **kill** (Day-1 shows no real parallel-eligible workload — drop the line of investigation).
