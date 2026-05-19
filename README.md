# Moloco Inspect

An internal AI agent — codenamed **molly** — that lets Moloco PMs and SAs ship UI changes by describing them in natural language. PM writes a PRD, molly plans it against Moloco's design system, executes inside a sandboxed copy of the product repo, and surfaces a single final-summary card with reviewable warnings, 1-click reverts, and follow-up PRD suggestions. The same agent runs across three surfaces (Playground web app, Chrome extension, Slack).

This is the entire stack — orchestrator, surfaces, sandbox, design-system tooling, and docs — in one mono-repo.

---

## TL;DR for someone looking around

If you have ~5 minutes, read in this order:

1. This file (you are here).
2. [`docs/superpowers/handoffs/2026-05-20-plan-v3-shipped-and-phase-3-g6-g7.md`](./docs/superpowers/handoffs/2026-05-20-plan-v3-shipped-and-phase-3-g6-g7.md) — newest handoff, what shipped today.
3. [`docs/superpowers/plans/2026-05-19-job-pipeline-auto-progress-and-final-summary.md`](./docs/superpowers/plans/2026-05-19-job-pipeline-auto-progress-and-final-summary.md) — the auto-progress paradigm in detail (v3 of the plan).
4. [`docs/superpowers/plans/2026-05-19-ds-missing-ai-judge-governance.md`](./docs/superpowers/plans/2026-05-19-ds-missing-ai-judge-governance.md) — the DS-missing AI judge + governance queue.
5. Browse [`docs/superpowers/handoffs/`](./docs/superpowers/handoffs/) — each handoff is a self-contained snapshot of one session's work; the most recent one always names its predecessor so the chain is traversable.
6. Browse [`docs/superpowers/plans/`](./docs/superpowers/plans/) — every non-trivial change ships with a written plan reviewed by a critic agent before code lands.

If you only want to see it running, skip to [Running locally](#running-locally) below.

---

## What molly does (current capability)

```
PM writes a PRD ──► Plan card (3-8 items, badge per item)
                        │
                        ▼
              Approve / Re-plan / Cancel
                        │
                        ▼
         Tasks execute one-by-one in a sandbox
                        │
                        ▼
    Per-task review: pass / fail · severity = warning | critical
                        │
            ┌───────────┴───────────┐
            │                       │
       severity=warning        severity=critical
            │                       │
       auto-continue          pause for user
       (warning logged)       (security / runtime / a11y-blocking)
            │
            ▼
   Job complete → Final summary card (3 surfaces, same shape)
   ┌────────────────────────────────────────────────┐
   │ ✅ 11/11 done · ⚠ 3 warnings · 5 files changed │
   │   Warning rows with [↶ Revert] (Phase 3 G8)    │
   │   💡 Follow-up suggestions  [↗ pill buttons]   │
   └────────────────────────────────────────────────┘
            │
            ▼
   1-click suggestion → new PRD into the same chat
```

When a plan references a UI intent that has no DS equivalent, the orchestrator:
- silently auto-adopts the closest match if similarity ≥ 0.5, or
- enqueues an escalation row (`ESC-<base36>`) into the governance queue and fires the LLM judge in the background to classify the gap (`propose_new` / `extend_existing` / `custom_build`).

The DS owner reviews and triages those rows at [`localhost:4176/governance`](#design-system-site-4176), without ever blocking the PM.

---

## Surfaces

| Surface | Port | Audience | Role |
|---|---|---|---|
| **Moloco Inspect Playground** | `:4180` | PM / SA | Primary chat surface — pick element, describe change, watch the job run, review the final summary. |
| **Chrome extension** (side panel) | n/a | PM / SA | Same molly flow attached to whatever product page you're looking at. Click an element to seed context. |
| **Slack `@molly`** | n/a | PM / SA | Mention molly in any allowlisted channel — same plan ceremony + final summary land in the thread. |
| **Inspect Console** | `:4174` | Operator / DS | Per-job operations dashboard: requests, sandbox health, agent metrics, jobs. |
| **Design-system site** | `:4176` | DS owner | Components / patterns / tokens reference **plus** the new `/governance` escalation queue. |

The orchestrator at `:3847` is the single brain — all surfaces talk to it. Sandboxes run as Docker containers with their own isolated vite dev server and git working tree per playground.

---

## Repo layout

```
moloco-inspect/
├── orchestrator/          Node HTTP server (no framework). Anthropic calls,
│                          sandbox manager, job FSM, plan-emitter,
│                          reviewer, governance queue, follow-up LLM.
├── playground-app/        Moloco Inspect Playground (Vite + React + Zustand).
│                          The main chat surface. Routes: /, /:playgroundId.
├── chrome-extension/      Vanilla-JS side panel. Same PRD → plan → job flow.
├── dashboard/             Inspect Console (Vite + React). Operations view.
├── design-system-site/    Carbon-style DS docs + /governance escalation page.
├── design-system/         JSON source of truth — components.json (~112),
│                          tokens.json, patterns.json, etc.
├── design-system-mcp/     MCP server exposing DS to AI tools (9 tools).
├── sandbox/               Docker image + supervisord (opencode + vite).
├── tooling/               sandbox-manager + preview-kit helpers.
├── scripts/               Smoke + evaluate scripts (paired-smoke, gov e2e).
├── docs/
│   └── superpowers/
│       ├── plans/         Plans (one per non-trivial change). Reviewed by
│       │                  Momus critic before code lands.
│       └── handoffs/      Session-end handoffs. Each names its predecessor.
├── msm-portal -> …        Symlink to the product repo molly edits.
└── README.md              You are here.
```

---

## Recent paradigm: AI auto-progress

Older versions paused the job at every review-fail so the user could pick Retry / Accept / Skip. That gave a PM cognitive load they couldn't act on (the warning is about code, but the user reviewing it isn't writing code). The paradigm flipped on 2026-05-19:

- **Review-fail with `severity='warning'`** (DS-equivalence missed, inline style, naming, a11y minor) → auto-continue, log to job summary, surface post-hoc.
- **Review-fail with `severity='critical'`** (security, runtime regression, data integrity, a11y-blocking) → pause, surface the warning, escalate.
- **Build error / retry exhaust / unhandled exception** → pause (the code literally doesn't run; the user needs to know).
- **Final summary card** at job end aggregates every warning + revert button (leaf-only — greyed if a later task already overwrote the same file) + follow-up PRD suggestions generated by LLM.
- **First-time onboarding notice** explains the paradigm so a clean ✅ run isn't mistaken for "no warnings happened."

Plans of record:
- [Auto-progress paradigm + final summary](./docs/superpowers/plans/2026-05-19-job-pipeline-auto-progress-and-final-summary.md) (v3, ships in Phases 1+2+G6+G7; G8 revert wire is the remaining slice)
- [DS-missing AI judge + governance](./docs/superpowers/plans/2026-05-19-ds-missing-ai-judge-governance.md) (v3, all G1-G6 shipped 2026-05-20)

---

## Governance queue (DS-missing escalations)

When plan-emitter encounters an intent without a close DS match (similarity < 0.5), it routes through this flow:

1. Orchestrator enqueues `state/governance-queue.jsonl` with `status=awaiting_judge`, generates a `ref_id` (`ESC-<base36(ms)>`).
2. Background fire-and-forget call to the Sonnet **judge** LLM classifies the kind: `propose_new` / `extend_existing` / `custom_build`. Promotes the row to `pending` on success or stays `awaiting_judge` until the startup sweep promotes it.
3. The plan card on every surface shows a quiet one-liner: *"💡 split-button menu — proceeding with MCButton2 (42% match). DS team notified · ESC-MPCUWKLY"*. The PM is never blocked.
4. DS owner opens [`localhost:4176/governance`](http://localhost:4176/governance) and triages — Resolve (primary) / Mark in review / Dismiss / Reopen.

API: `GET /api/governance/queue?status=…`, `GET /:id`, `GET /:id/events`, `POST /:id/status`. Status changes are append-only to `state/governance-status-events.jsonl` so concurrent owners get last-write-wins for free.

The `awaiting_judge → pending` lock means the owner cannot short-circuit the judge (server returns 409 until the judge resolves). The 5-minute startup sweep covers crash-mid-judge cases.

---

## Running locally

### Prerequisites
- **Node.js 22+** (for `--watch`, `--env-file-if-exists`)
- **pnpm 10+**
- **Docker Desktop** (sandboxes)
- **GitHub CLI** `gh` (for PR creation)
- **`ANTHROPIC_API_KEY`** in `orchestrator/.env`

### Start the stack

```bash
# Build the sandbox image once (per machine)
cp /etc/ssl/cert.pem sandbox/host-ca.pem
bash sandbox/build-image.sh

# Then in 4 terminals (or use your favourite multiplexer):
cd orchestrator        && pnpm start            # :3847
cd dashboard           && pnpm install && pnpm dev   # :4174 Inspect Console
cd design-system-site  && pnpm install && pnpm dev   # :4176 DS docs + /governance
cd playground-app      && pnpm install && pnpm dev   # :4180 Playground

# Chrome extension:
#   chrome://extensions → Developer Mode → Load Unpacked → chrome-extension/
#   The side panel hooks into whatever product page you're on.
```

### Smoke tests
- `orchestrator/scripts/governance-e2e-test.mjs` — non-LLM smoke for the governance queue endpoints (19 assertions).
- `orchestrator/scripts/plan-emitter-paired-smoke.mjs` — 7 PRD fixtures for plan-emitter.
- `orchestrator/scripts/plan-emitter-paired-evaluate.mjs` — `is_new_build` coverage + post-process safety net audit.

---

## Service ports cheat sheet

| Port | Service | Purpose |
|---|---|---|
| 3847 | orchestrator | Single brain; all surfaces talk here. |
| 4174 | dashboard | Inspect Console (operations dashboard). |
| 4176 | design-system-site | DS docs + `/governance` escalation queue. |
| 4180 | playground-app | Moloco Inspect Playground (PM-facing chat surface). |
| 4177 | design-system-site (preview) | `pnpm preview` build output. |
| 5173 | sandbox vite | Inside each Docker sandbox; proxied to `/preview/:id/*`. |

---

## Documentation

Living docs (each session ships a new handoff):
- [`docs/superpowers/plans/`](./docs/superpowers/plans/) — every non-trivial change has a plan here.
- [`docs/superpowers/handoffs/`](./docs/superpowers/handoffs/) — most recent is the freshest view of the codebase.

Older one-off references:
- [Sandbox Architecture](./docs/SANDBOX_ARCHITECTURE.md)
- [Preview Bootstrap Contract](./docs/PREVIEW_BOOTSTRAP_CONTRACT.md)
- [Product Adapter Contract](./docs/PRODUCT_ADAPTER_CONTRACT.md)

---

## License

Internal use only — Moloco proprietary.
