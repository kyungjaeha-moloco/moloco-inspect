# Revised Implementation Plan — Phase 1 & 3

> Durable request history + safe container reuse
> Date: 2026-04-15
> Revised to match the current code in `orchestrator/server.js`, `tooling/sandbox-manager/src/*`, `chrome-extension/*`, and `dashboard/src/pages/RequestDetailPage.tsx`

---

## Scope

Keep this to 4 working days, low-risk, with a rollback point at the end of each day.

This revision fixes the known issues:

1. Step boundaries now match the real `runPipeline()` flow.
2. Progress updates stay polling-based because the Chrome Extension currently uses `GET /api/status/:id`, not `EventSource`.
3. SQLite schema includes `run_id`, `attempt_no`, `logs`, and persisted analytics events.
4. Retry behavior is decided by pipeline entry conditions, not only inside `handleReject()`.
5. Retry clears stale `diff`, `screenshot`, `previewUrl`, `livePreviewUrl`, and `error` first.
6. Container reuse is gated by a health check before `resetSandbox()`.
7. New files use ESM `export` / `import`, not `module.exports`.
8. Restart behavior is described honestly: history survives, live sandbox execution does not fully survive.
9. Retry restarts Vite deterministically instead of only recapturing a screenshot.
10. Sandbox drift risk is explicitly handled with reuse guards and fresh fallback.

---

## Current Code Reality

| Area | Current behavior |
|------|------------------|
| Extension progress UI | Polls `GET /api/status/:id` every 2s |
| SSE | `GET /api/events/:id` exists, but the extension does not use it |
| Dashboard detail page | Loads analytics/detail data; not SSE-driven |
| Persistence today | `orchestrator/state/*.json` + `orchestrator/analytics/request-history.ndjson` |
| Pipeline today | create sandbox -> sync source -> start OpenCode -> run agent -> collect diff -> install deps -> typecheck -> auth patch/injection -> start Vite -> screenshot |
| Retry today | `handleReject()` resets the sandbox and then calls `runPipeline(id)` from the top |
| Reuse risk today | `resetSandbox()` only resets git-tracked files; it does not validate container health or restart Vite |
| Module system | `orchestrator/package.json` is ESM |

---

## Product Goal

### Phase 1

Persist request history, logs, analytics, and run attempts in SQLite so the extension and dashboard can reload a request safely.

### Phase 3

Make "Request Changes" fast when reuse is safe, but fall back to a fresh sandbox automatically when reuse is risky.

---

## Non-Goals For This 4-Day Pass

1. Do not promise true in-flight resume after server restart.
2. Do not migrate the whole UI stack to SSE in this pass.
3. Do not add a job queue or worker system.
4. Do not attempt indefinite container reuse across many retries.

---

## Honest Restart Behavior

After this phase:

| Survives restart | Does not reliably survive restart |
|------------------|-----------------------------------|
| request metadata | running container process |
| diff text | OpenCode session |
| changed files | live Vite process |
| screenshot path | forwarded ports |
| logs | auth-injected runtime state inside container |
| analytics events | mid-flight execution |

Implementation rule:

On startup, restore request history from SQLite. Any request that was `pending` or `processing` when the server stopped is marked `error` or `interrupted`, with `sandboxExpired=true` and `livePreviewExpired=true`. The user can retry, but that retry starts fresh unless a healthy reusable container is still confirmed.

This removes the false "100% restore" claim.

---

## Revised Runner Boundaries

Split the monolithic `runPipeline()` into steps that match the real code:

| Step | Current real behavior | Reused on retry? |
|------|------------------------|------------------|
| `create_sandbox` | allocate ports, `createSandbox()` | fresh only |
| `sync_source` | `copyFilesIn()`, remove `._*`, copy CA/auth files | fresh only |
| `start_opencode` | `createSandboxClient()` + `waitForServerReady()` | reuse if healthy |
| `run_agent` | `runAgentPrompt()` | yes |
| `collect_diff` | `extractDiff()` | yes |
| `install_dependencies` | copy `.npmrc`, run `pnpm install --frozen-lockfile` in `js/msm-portal-web` | skip only if reuse is safe |
| `validate` | `pnpm exec tsc --noEmit -p js/msm-portal-web/tsconfig.json` | yes |
| `prepare_preview_auth` | fetch preview tokens, patch auth provider, inject auth script into `index.html` | yes |
| `start_vite` | start or restart Vite and wait for `http://localhost:5173/` | yes, always restart on retry |
| `capture_screenshot` | Playwright screenshot or fallback screenshot | yes |
| `preview_ready` | set preview URLs, status, analytics | yes |

Why this matters:

1. The previous plan skipped the real `install_dependencies` step.
2. OpenCode startup and Vite startup are separate dependencies.
3. OpenCode depends on sandbox creation and health.
4. Vite depends on synced source, installed deps, auth injection, and explicit boot.

---

## Polling Strategy: Improve `/api/status`, Do Not Switch UI To SSE Yet

For this phase, keep the extension polling-based.

Reason:

1. `chrome-extension/background.js` already polls `/api/status/:id`.
2. `chrome-extension/sidepanel.js` already expects full status payloads.
3. The dashboard request detail page is not currently wired to SSE.
4. Polling is the safer 4-day implementation for a product-designer workflow.

### Change

Upgrade `GET /api/status/:id` to accept a cursor:

`GET /api/status/:id?cursor=<last_log_seq>`

Response example:

```json
{
  "id": "abcd1234",
  "status": "processing",
  "phase": "run_agent",
  "cursor": 42,
  "latestLog": "Running agent...",
  "newLogs": [
    { "seq": 41, "at": "2026-04-15T10:00:00.000Z", "phase": "run_agent", "message": "OpenCode server ready" },
    { "seq": 42, "at": "2026-04-15T10:00:03.000Z", "phase": "run_agent", "message": "Running agent..." }
  ],
  "diff": null,
  "screenshotUrl": null,
  "previewUrl": null,
  "prUrl": null,
  "changedFiles": null,
  "error": null
}
```

### UI changes

1. Extension stores `lastLogSeq` per active request.
2. Extension polls with `cursor` and appends only `newLogs`.
3. Dashboard detail page polls active requests until they leave `pending` / `processing`.
4. Existing `/api/events/:id` can remain as-is for now.

This gives durable reconnect behavior without a risky transport rewrite.

---

## SQLite Design

Add:

- `orchestrator/db/sqlite.js`
- `orchestrator/db/migrations/001_initial.sql`

Use ESM only:

```js
export function initDb() {}
export function createRequestRecord() {}
```

### Schema

```sql
CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  phase TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  branch TEXT,
  latest_run_id TEXT,
  latest_attempt_no INTEGER NOT NULL DEFAULT 0,
  preview_url TEXT,
  live_preview_url TEXT,
  screenshot_path TEXT,
  diff_text TEXT,
  changed_files_json TEXT,
  pr_url TEXT,
  error_text TEXT,
  sandbox_expired INTEGER NOT NULL DEFAULT 0,
  live_preview_expired INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  trigger TEXT NOT NULL,
  mode TEXT NOT NULL, -- fresh | reuse
  status TEXT NOT NULL, -- running | completed | failed | interrupted
  container_id TEXT,
  opencode_port INTEGER,
  vite_port INTEGER,
  session_id TEXT,
  provider TEXT,
  model TEXT,
  health_check_json TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (request_id) REFERENCES requests(id)
);

CREATE TABLE steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json TEXT,
  error_text TEXT,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs(run_id),
  FOREIGN KEY (request_id) REFERENCES requests(id)
);

CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  phase TEXT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(run_id),
  FOREIGN KEY (request_id) REFERENCES requests(id)
);

CREATE UNIQUE INDEX idx_logs_request_seq
  ON logs(request_id, seq);

CREATE TABLE analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  run_id TEXT,
  attempt_no INTEGER,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES requests(id)
);
```

### Why this schema

1. `requests` stores the latest snapshot used by `/api/status/:id`.
2. `runs` introduces `run_id` and `attempt_no`, which are necessary to analyze retries honestly.
3. `steps` gives step-level observability.
4. `logs` enables polling with cursor.
5. `analytics_events` makes analytics durable instead of NDJSON-only.

### Compatibility / rollback

For one release, keep dual-write:

1. SQLite becomes the primary source.
2. Continue writing `orchestrator/state/*.json` as fallback.
3. Continue appending `request-history.ndjson` as fallback.

---

## Retry Architecture

### The real fix

Do not only change `handleReject()`.

Introduce a single pipeline entry point:

```js
export async function startPipeline({ requestId, trigger }) {
  const state = getRequestState(requestId);
  const decision = await decideRunEntry(state, trigger);

  if (decision.mode === 'reuse') {
    await prepareRetryState(state, decision);
    return runFromStep({ requestId, runId: decision.runId, startStep: 'run_agent' });
  }

  await prepareFreshRunState(state, decision);
  return runFromStep({ requestId, runId: decision.runId, startStep: 'create_sandbox' });
}
```

`handleReject()` becomes thin:

1. persist feedback
2. increment `attempt_no`
3. clear stale state
4. call `startPipeline({ requestId, trigger: 'reject_feedback' })`

This fixes the real issue: retry behavior must be decided by runner entry conditions, not by `handleReject()` alone.

---

## Required State Cleanup Before Retry

Before any retry, clear stale UI-visible state:

```js
updateRequestSnapshot(id, {
  status: 'processing',
  phase: 'queued_for_retry',
  diffText: null,
  changedFiles: null,
  screenshotPath: null,
  previewUrl: null,
  livePreviewUrl: null,
  errorText: null,
  livePreviewExpired: 0,
  sandboxExpired: 0
});
```

Also clear temp artifacts when reusing:

1. remove `/workspace/results/*`
2. clear or rotate `/tmp/vite.log`
3. overwrite old screenshot for the request

This prevents old preview data from leaking into the new attempt.

---

## Container Health Check Before Reuse

Reuse only if all checks pass:

1. `state.sandbox.containerId` exists
2. `docker inspect` confirms the container is still running
3. `execInContainer(containerId, 'pwd')` succeeds
4. OpenCode health succeeds, or succeeds after reset
5. `resetSandbox()` succeeds and `git status --porcelain` is clean
6. `js/msm-portal-web/node_modules` still exists, or reinstall is acceptable

If any check fails, log the reason and start a fresh run.

---

## Vite Strategy On Retry

Do not only recapture a screenshot.

On retry:

1. `resetSandbox()` to clean repo changes
2. re-run `run_agent`
3. re-run `collect_diff`
4. run `install_dependencies` only if needed
5. re-run `prepare_preview_auth`
6. hard-restart Vite:
   - kill existing Vite process
   - clear old log file
   - start Vite again
   - wait for health
7. re-capture screenshot

Recommended helper:

```js
export async function restartVitePreview({ containerId, clientEnv }) {}
```

This is safer than trying to trust an old Vite process.

---

## Sandbox Drift Policy

Reuse is an optimization, not a correctness guarantee.

Drift can come from:

1. stale `node_modules`
2. dead background Vite process
3. temp files outside git
4. leftover auth/runtime state
5. partially unhealthy OpenCode server

Practical policy for this phase:

1. reuse only for the next immediate reject/retry cycle
2. always restart Vite on retry
3. if reuse health check, typecheck, or preview boot fails once, fall back to a fresh container

This keeps the feature fast without pretending reused sandboxes stay clean forever.

---

## 4-Day Delivery Plan

## Day 1 — Refactor Runner Boundaries

### Deliverables

1. add `orchestrator/pipeline/steps.js`
2. add `orchestrator/pipeline/runner.js`
3. move the current `runPipeline()` flow into real step functions
4. keep `server.js` as the HTTP/API layer

### Rollback

Feature flag:

```bash
PIPELINE_RUNNER_V2=false
```

### Done when

1. fresh request still reaches preview
2. logs show step start and completion in order
3. no behavior change yet for retry or restart

---

## Day 2 — Add SQLite Snapshot + Logs + Analytics

### Deliverables

1. add `better-sqlite3` to `orchestrator/package.json`
2. add `orchestrator/db/sqlite.js`
3. add `orchestrator/db/migrations/001_initial.sql`
4. persist requests, runs, steps, logs, and analytics events

### Rollback

```bash
USE_SQLITE=false
```

### Done when

1. `orchestrator/inspect.db` exists
2. `/api/status/:id` still works
3. JSON and NDJSON compatibility writes still exist

---

## Day 3 — Durable Polling With Cursor + Honest Restart Recovery

### Deliverables

1. upgrade `/api/status/:id` to accept `cursor`
2. return `newLogs` and `cursor`
3. restore request snapshots from SQLite on startup
4. mark interrupted live runs honestly

### Implementation details

1. requests restored without confirmed healthy containers get `sandboxExpired=true`
2. restored live preview URLs get `livePreviewExpired=true`
3. requests that were mid-run at restart become `error` with a retry message
4. extension and dashboard both consume cursor-based polling

### Rollback

Ignore `cursor` and return the old status payload shape.

### Done when

1. closing and reopening the side panel preserves prior logs
2. restarting the server preserves request history
3. interrupted runs are marked honestly

---

## Day 4 — Safe Container Reuse For Reject/Retry

### Deliverables

1. add health-checked reuse decision
2. clear stale state before retry
3. restart Vite on retry
4. fall back to fresh run on drift or health failure

### Maximum retry policy

Keep it simple:

1. allow up to 3 attempts total per request
2. if reuse fails once, do one fresh retry automatically
3. if the request still fails after that, stop and show error

### Rollback

```bash
ENABLE_SANDBOX_REUSE=false
```

### Done when

1. "Request Changes" usually skips new container creation when healthy
2. retry clears old diff, screenshot, preview URL, and error first
3. Vite restarts on retry
4. unhealthy reuse falls back to fresh automatically

---

## Files To Change

### New files

- `orchestrator/pipeline/steps.js`
- `orchestrator/pipeline/runner.js`
- `orchestrator/db/sqlite.js`
- `orchestrator/db/migrations/001_initial.sql`

### Modified files

- `orchestrator/server.js`
- `orchestrator/package.json`
- `chrome-extension/background.js`
- `chrome-extension/sidepanel.js`
- `dashboard/src/pages/RequestDetailPage.tsx`
- `tooling/sandbox-manager/src/container.js`

---

## Acceptance Checklist

1. Fresh request still reaches preview.
2. Request history is visible after panel reload.
3. SQLite stores request snapshots, steps, logs, and analytics events.
4. Restart does not pretend live sandboxes were restored.
5. Reject/retry clears stale UI state first.
6. Retry decision is based on pipeline entry conditions, not only `handleReject()`.
7. Vite is restarted on retry.
8. Reuse falls back to fresh run on health failure or drift.
9. New modules use ESM only.
10. Every day ends with a flag-based rollback path.
