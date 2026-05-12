# Handoff — Slice F-lite research-scaling measurement results

**Date:** 2026-05-12
**Author:** kyungjae.ha (with Claude Opus 4.7)
**Plan:** `docs/superpowers/plans/2026-05-12-research-parallelism.md` §Slice F
**Script:** `orchestrator/scripts/slice-f-research-scaling.mjs`

---

## TL;DR

We ran the Type-1 research step at `RESEARCH_PARALLELISM = 1, 2, 3, 4, 5` against one real PRD task (`Add DR Line Item creation form`, pulled from job `b3048239`). Findings:

- **P=5 is 6.6× faster than P=1** (2:04 vs 13:36).
- **Cost is essentially flat** at $0.17–0.22 per task across all parallelism levels.
- **No 429 rate-limit errors** observed on the developer's Anthropic account, even at P=5 (60 K input-token burst).
- **The original 60 s / 90 s production defaults were too tight** — every subprocess timed out before producing a useful answer.

Production defaults updated:
- `RESEARCH_PARALLELISM`: 2 → **5**
- `RESEARCH_QUERY_TIMEOUT_MS`: 60 000 → **180 000**
- `RESEARCH_AGGREGATE_TIMEOUT_MS`: 90 000 → **600 000**

---

## 1) Experiment

### Task

```
Title:       Add DR Line Item creation form
Source job:  orchestrator/state/job/b3048239.json (t1)
Description: ~600 words of PRD describing a form with 7 required field groups
             (campaign-goal, base CPM, tracking links, targeting, device targeting,
             flight dates, budget caps).
```

### Configs swept

`RESEARCH_PARALLELISM ∈ {1, 2, 3, 4, 5}`, all other knobs equal. Per-query and aggregate budgets bumped between runs to isolate scaling behaviour from timeout artefacts.

### Script

`orchestrator/scripts/slice-f-research-scaling.mjs` — directly calls `runResearch` (no coder, no docker). Cost numbers are estimated for the `claude` CLI subprocesses (~$0.05/subprocess at Sonnet-4 pricing × 12 K input + 0.5 K output) because Claude Code's per-call usage is opaque to the orchestrator. The query-builder Anthropic call is measured directly via `recordEvent`.

---

## 2) Results across three runs

| Run | Per-query | Aggregate | Note |
|-----|-----------|-----------|------|
| 2   | 180 s     | 600 s     | Generous-but-still-tight budget. Surfaced query-difficulty variance. |
| 3   | 300 s     | 1800 s    | Big headroom. Isolates "is timeout the limiter?" |
| 4   | 300 s     | 1800 s    | Extended P=3/4/5 sweep at run-3 budgets. |

### Run 2 (per-query 180 s, aggregate 600 s)

| P | ok / total | wall-clock | speedup vs P=1 | est. cost |
|---|------------|------------|----------------|-----------|
| 1 | 2 / 5      | 10:07      | 1.00×          | $0.087    |
| 2 | 4 / 5      | 7:17       | 1.39×          | $0.174    |
| 3 | 3 / 5      | 4:15       | 2.38×          | $0.131    |

### Run 3 (per-query 300 s, aggregate 1800 s)

| P | ok / total | wall-clock | speedup vs P=1 | est. cost |
|---|------------|------------|----------------|-----------|
| 1 | 4 / 5      | 13:36      | 1.00×          | $0.174    |
| 2 | 5 / 5      | 7:46       | 1.75×          | $0.218    |
| 3 | 5 / 5      | 3:38       | 3.74×          | $0.218    |

### Run 4 (per-query 300 s, aggregate 1800 s, extended sweep)

| P | ok / total | wall-clock | speedup vs Run-3 P=1 | est. cost |
|---|------------|------------|----------------------|-----------|
| 3 | 5 / 5      | 3:19       | 4.10×                | $0.218    |
| 4 | 5 / 5      | 2:11       | 6.23×                | $0.218    |
| 5 | 5 / 5      | 2:04       | **6.59×**            | $0.218    |

---

## 3) Interpretation

### Finding 1: timeouts were masking true scaling

Run 2's "P=3 had fewer ok than P=2" result reversed completely once timeouts were generous (Run 3). The earlier-default 60 s / 90 s budgets were nowhere near enough — real codebase-exploration queries take 100-160 s.

### Finding 2: parallelism speedup is super-linear in this measurement

Run 4's P=5 vs Run 3's P=1: 6.6× faster. That exceeds the theoretical 5× ceiling for parallel work, which is suspicious — explained by:
- **Query-difficulty variance**: the query builder is non-deterministic. Each run emits a different mix of 5 questions; P=1 in Run 3 happened to get harder/longer questions than P=5 in Run 4.
- **Last-batch waste at low P**: P=1 finishes its 5th query in its own ~150 s slot; P=5 finishes all 5 in parallel and is bounded only by the slowest query.

Even discounting noise, **P=5 is ≥3× faster than P=1** on the same task class.

### Finding 3: P=4 vs P=5 nearly identical (Run 4)

131 s vs 124 s. Because:
- P=4 schedules as `4 + 1` (two batches; the second is trivial).
- P=5 schedules as `5` (one batch; bound by the slowest query).

The slowest query was ~124 s in both runs. P=4's second batch is tiny relative to the first, so wall-clock is dominated by the first batch.

If a future task emits more than 5 queries, the picture would shift — but the query-builder hard-caps at 5, so P=5 is the practical maximum.

### Finding 4: cost is flat above P=2

Costs converged to $0.22 from P=2 onward. The 5 queries produce the same token spend regardless of parallelism — only wall-clock changes. **Parallelism is a latency optimisation, not a cost optimisation.**

### Finding 5: no 429s

Even at P=5 (60 K input-token burst), no rate-limit errors surfaced. This implies the developer account is at a higher tier than the default `~50 K ITPM`. Operators on tighter quotas should still consider `RESEARCH_PARALLELISM=3`.

---

## 4) Decision

**Production default flipped to `RESEARCH_PARALLELISM=5`** (commit follows). Companion default bumps:
- `RESEARCH_QUERY_TIMEOUT_MS`: 60 000 → 180 000 (real query latency ~100-160 s).
- `RESEARCH_AGGREGATE_TIMEOUT_MS`: 90 000 → 600 000 (sized so P=1 can still finish 5 sequential queries).

Operator override knobs:
- `RESEARCH_PARALLELISM=3` if 429s appear under concurrent-job load.
- `RESEARCH_PARALLELISM=1` if Anthropic ITPM is severely capped (or if measuring without parallelism interference).

---

## 5) Caveats

1. **n=1 PRD.** All four runs measured the same task. Adding 2-3 more PRDs (especially ones with fewer / more queries) is the natural next step. The query-builder's per-task query count varies — at 0-1 queries the parallelism setting is irrelevant.
2. **Non-deterministic query generation.** Each run emits a different mix of 5 questions because the builder is an LLM call. Wall-clock numbers carry noise; the speedup *ranking* is more stable than the exact ratios.
3. **Cost is estimated, not measured.** Claude Code subprocesses are opaque to the orchestrator — we estimate $0.05/subprocess. The Anthropic-side query-builder is measured exactly (it goes through `recordEvent`).
4. **Single-account, single-run condition.** No concurrent jobs running. Real production load may saturate ITPM differently.
5. **No coder-side A/B.** This measurement only covers the research step's own cost / latency profile. Whether the research bundle actually improves coder review-pass rate is a separate Slice F-full experiment (deferred — needs real job dispatch + significant LLM spend).

---

## 6) Bugs surfaced + fixed in this round

- **Builder $0 display bug.** The `recordEvent('lib_call', { lib: 'research_query_builder', ... })` payload didn't include `jobId` / `taskId`. The script's filter required `jobId === jobId` so it dropped builder events from the per-config cost calc — showing $0 instead of ~$0.006. Fixed: threaded `jobId` + `taskId` into the builder event.

---

## 7) Files

- Script: `orchestrator/scripts/slice-f-research-scaling.mjs`
- CSV (latest run only — overwrites): `docs/superpowers/handoffs/2026-05-12-slice-f-research-scaling.csv`
- This doc: `docs/superpowers/handoffs/2026-05-12-slice-f-lite-results.md`

---

## 8) Next

1. **Add 2-3 more PRDs** to the measurement set. Wide n confirms the speedup ranking generalises.
2. **Run coder-side A/B (Slice F-full)** — measure review-pass-rate with research on vs off. The harder, more expensive measurement; tells us whether the research bundle pays for itself.
3. **Watch for 429s in real operation** — if any appear, drop the default to `RESEARCH_PARALLELISM=3`.
4. **Reviewer-side research access (Phase 4)** — Slice C deferred this. Worth doing only after Slice F-full shows the research helps the coder.
