# Orchestrator Migration Notes

This directory holds the first orchestrator port into the `Moloco Inspect` proposal repo.

## Current state

- Server code and the smoke script live here.
- `analytics/`, `attachments/`, `screenshots/` start empty.
- The actual product repo still references the original workspace.
- The design system defaults to `../design-system` inside this repo.

Default source workspace root:

- `/Users/kyungjae.ha/Documents/Agent-Design-System`

## Layout

- `server.js`
- `scripts/smoke-test.mjs`
- `analytics/`
- `attachments/`
- `screenshots/`

## Environment variables

`server.js` reads the following:

- `SOURCE_WORKSPACE_ROOT`
  - Default: `/Users/kyungjae.ha/Documents/Agent-Design-System`

This is the root used to locate:

- `msm-portal`

You can also set:

- `DESIGN_SYSTEM_ROOT`
  - Default: `/Users/kyungjae.ha/Documents/moloco-inspect/design-system`

So the proposal repo currently holds the orchestrator code and the design system; only the actual product runtime still references the original workspace.

### Research-parallelism (Type-1, plan 2026-05-12)

Each task can run a read-only research step before its coder adapter fires. See `docs/superpowers/plans/2026-05-12-research-parallelism.md` for the full design and `docs/superpowers/handoffs/2026-05-12-slice-f-lite-results.md` for the measurement that grounded the current defaults.

| Variable | Default | Effect |
|----------|---------|--------|
| `RESEARCH_ENABLED` | `0` (off) | Set to `1` to turn on the research step. When off, the runner passes `null` to the adapter as the third argument and behaves exactly like before. |
| `RESEARCH_PARALLELISM` | `5` | Maximum number of read-only Claude Code subprocesses dispatched concurrently per task. Clamped to `[1, MAX_QUERIES=5]`. Slice F-lite measured `5` as the sweet spot — 6.6× faster than `1` at identical cost with no 429s on a developer-tier Anthropic account. Lower this to `3` if you see 429s under concurrent-job load. |
| `RESEARCH_QUERY_TIMEOUT_MS` | `180000` | Per-query subprocess wall-clock (3 min). After SIGTERM + a 3 s grace, the lib sends SIGKILL. The empirically-measured per-query time on a real codebase-exploration prompt is ~100-160 s; the previous 60 s default cut useful answers off mid-stream. |
| `RESEARCH_AGGREGATE_TIMEOUT_MS` | `600000` | Aggregate cap across all queries for a single task (10 min). Sized so `RESEARCH_PARALLELISM=1` can still finish 5 sequential queries (worst case ~800 s) without aborting the bundle. Any in-flight queries when this fires are aborted via AbortController, killed via SIGTERM, and surfaced in the bundle as synthetic `'timeout'` rows. |
| `RESEARCH_MODEL` | `claude-sonnet-4-20250514` | Sonnet model used for the query-builder. The per-query subprocesses use whatever model `claude` (the Claude Code CLI in PATH) defaults to. |

Logs land in `orchestrator/logs/research/<jobId>-<taskId>-q<n>.log`. Cost lines surface in `molly-cost` aggregates under `lib: research_query`, `lib: research_query_builder`, and `lib: research_orchestration`.

## Running

```bash
cd /Users/kyungjae.ha/Documents/moloco-inspect/orchestrator
pnpm install
pnpm start
```

You can override the source workspace explicitly:

```bash
SOURCE_WORKSPACE_ROOT=/Users/kyungjae.ha/Documents/Agent-Design-System pnpm start

# And override the design-system path too if needed:
DESIGN_SYSTEM_ROOT=/Users/kyungjae.ha/Documents/moloco-inspect/design-system pnpm start
```

To try out the new research step while it's off-by-default:

```bash
RESEARCH_ENABLED=1 pnpm start
# tighten the burst if you hit Anthropic rate limits:
RESEARCH_ENABLED=1 RESEARCH_PARALLELISM=1 pnpm start
```

## Next steps

1. Wire the analytics API directly into the proposal repo's dashboard.
2. Re-verify the smoke test against the proposal repo.
3. Gradually internalise the `msm-portal` dependency.
