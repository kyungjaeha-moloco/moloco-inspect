# Handoff — PRD→Delivery Thin-Slice Pipeline (+ Playground UX polish)

**Date:** 2026-04-24
**Author:** kyungjae.ha (with Claude)
**Branch:** main
**Starting state:** 962f261 (M5 handoff — promote → msm-portal PR working in dry-run)
**Ending state:** 8465de3
**Commits:** ~40 this session. Plan at `docs/superpowers/plans/2026-04-24-prd-to-delivery-thin-slice-v2.md` (Codex-revised v2).

---

## What landed

### A. Playground polish (carry-over from M4/M5 session)

| Commit | Summary |
|---|---|
| `22682e5` | Smooth AIPanel resize — pointerCapture + rAF |
| `03c7c65` | Commit tab bar (원본 ↔ 작업중), drop time-travel banner |
| `d2b43f5` | Always render Latest tab; hide Baseline when == HEAD |
| `8c6ee20` | ExecutionCard phases → vertical timeline |
| `3d7145a` | Checkpoint UI on ExecutionCard + `restore-to-sha` backend |
| `a825c67` | Phase-timeline ordering (arrival, not hardcoded) + checkpoint footer wrap |
| `2139773` | Reload iframe on 원본/현재 tab click |
| `6ba4283` | `setCurrent` over `mergeCurrent` for full-pg responses |
| `a7b2754` | Rename tab 현재 → 작업중 |
| `632c240` | DS `app-shell` pattern teaches `feature_config` gating |
| `a823a0d` | Treat checkout-at-HEAD as 작업중, not time-travel |
| `b81ae2f` | Auto-reload iframe when HEAD advances |
| `774a3ff` | Persist chat messages to localStorage per playground |
| `ceb323f` | Strict client scoping — stop AI editing wrong-app files |
| `07ab34b` | End-to-end cache invalidation after sandbox git ops |
| `1a56472` | Element picker UX — restore, persistent outline, chip |

### B. J0–J5: PRD→delivery pipeline

The headline work. Plan §4 (v2) executed in order.

| Commit | Work item |
|---|---|
| `ba28149` | **J0** state machine + Codex-revised plan |
| `d84e111` | **J1** Job CRUD + routes + change-request guard |
| `ee968b7` | **J3a** runner + **J3b** change-request adapter |
| `e2e2457` | **J2** PRD → task graph decomposer (LLM) |
| `e134588` | **J4** per-task diff reviewer (LLM, pass/fail) |
| `f3cdac8` | **J5a/J5b** JobDetail page + PRD modal entry |

### C. Post-J5 polish based on live testing

Everything from the first real PRD run (TVING Post-Creative-Review) fed back into fixes.

| Commit | Fix |
|---|---|
| `6585835` | PRD modal → input-bar 📎 button w/ 3 sources (text / Google Docs / Jira) |
| `5439d74` | JobCard inline in chat, replaces separate `/j/:jobId` page |
| `d7fa5ce` | Bump decomposer `max_tokens` + tolerate truncated LLM output |
| `ae33bc1` | Collapse task descriptions by default, compact layout |
| `1983614` | Drop PENDING noise, use index + status-specific icons |
| `ee5104e` | Format expanded descriptions — bullets, paragraphs, larger type |
| `84d879a` | Pixel-agent walk cycle (pablodelucca/pixel-agents) for running tasks |
| `71fec5b` | Retry injects prior review feedback + unpauses job |
| `1d79add` | Retry uses cumulative diff + stronger "complete whole task" hint |
| `9229421` | Decomposer enforces 'one agent run' task-size cap |
| `f7b629c` | JobCard dims tasks superseded by time-travel |
| `b2a5183` | AIPanel dims chat bubbles below the time-travel anchor |
| `1ce5a71` | Fold rewound work into an archived accordion on new prompt |
| `323ac4a` | Clean up stuck revert state when restoreToSha conflicts |
| `d623442` | Tree-swap restore — immune to revert conflicts |
| `16b84cf` | Base64-pipe restore script through docker exec |
| `9c97061` | `restoredFromSha` tracking + RESTORED badge + dim below anchor |
| `8465de3` | Restore button becomes single "Restored" pill once restored |

---

## Architecture — new pieces

### Server (`orchestrator/`)
- **`lib/job-state.js`** — pure FSM (JobStatus / TaskStatus transition tables + guards). 15 unit tests.
- **`lib/job.js`** — disk-backed Job CRUD + user actions (approve, retry, skip, unblock, cancel, resume, markQaPass). Blocked-cascade on skip.
- **`lib/job-runner.js`** — serial worker: topoOrder + pickNextTask + runJob. Retry-exhaust → `skipped` + `blocked` cascade. 8 unit tests.
- **`lib/job-decomposer.js`** — Anthropic Messages API call. System prompt enforces JSON, task-size cap, multi-sub-req bullets, no package.json.
- **`lib/job-reviewer.js`** — second LLM pass, binary pass/fail with ≤150-char note. Empty-diff fast-fail.
- **`server.js` additions**:
  - Routes: `POST /api/playground/:id/job`, `GET/POST /api/job/:id/{decompose,tasks,approve-plan,retry-task,skip-task,unblock-task,cancel,resume,mark-qa-pass}`.
  - `runChangeRequestForTask` — J3b adapter. Fires change-request, awaits pipeline, returns `{commitSha, baseSha, diff}`. Computes cumulative `baseSha..commitSha` diff in-sandbox.
  - `decomposeJobInBackground` + `runJobInBackground` — fire-and-forget helpers with per-job lock. Retry prompt prefix now injects prior reviewer notes.
  - `/api/change-request` 409s with `job_active` when a non-terminal job owns the playground.

### Client (`playground-app/`)
- **`pages/JobDetail.tsx`** — standalone `/j/:jobId` deep-link route (now a fallback; JobCard is primary).
- **`editor/JobCard.tsx`** — inline live-polling view of a Job. Renders status pill, collapsible task rows, review notes, QA pass button, controls, promote nav. 2s poll, no SSE.
- **`editor/AIPanel.tsx`** — PRD modal on 📎 attach button (text / Google Docs / Jira tabs). Assistant message carries `jobId` → JobCard inline. Archive-on-send flow for time-travel / restore anchors.
- **Store**: `ChatMessage.jobId / attachedElement / archived`, `lastPickedBbox`, `archiveMessagesAfter`, chat localStorage persist.
- **Services**: Job + JobTask types, full CRUD helpers, `markQaPass`, `redecomposeJob`, `restoredFromSha` on Playground.

### Visuals
- **`public/pixel-agents/char_0.png`** — 112×96 sprite sheet from pablodelucca/pixel-agents (MIT). 4-frame walk cycle at 150ms for running tasks.
- **`tokens.css`** — `@keyframes pixelAgentWalk`.
- **FormattedDescription** — auto-detects `(1)(2)(3)` / `-`/`*` bullets / `\n\n` paragraphs in task descriptions.

---

## Known issues / open work

1. **Sandbox-agent task-size fragility.** Even with the "one agent run" rule in the decomposer, complex UI tasks (tables + filters + states) still regularly fail review on the first pass. Retry with cumulative-diff + feedback-prefix helps but isn't a silver bullet. Bigger sandbox model or multi-turn agent loop would help — v1 concern.
2. **Empty diff → auto-fail.** Any task where the agent decides "no change needed" hits `verdict: 'fail'`. If that was actually the right call, the user has to skip. Could be a tri-state but we scope-cut that.
3. **restoredFromSha persistence.** Stored on Playground but not re-validated on orchestrator restart; if HEAD moves via a non-change-request path, the indicator could get stale. Low risk in practice.
4. **Task reorder disabled in v0.** If decomposer gets dependsOn wrong, user deletes + redecomposes — no in-place reorder UI.
5. **QA is a checkbox.** No Playwright, no visual regression — by design for v0 but real gap.
6. **Pipeline events** still come from SSE on `/api/status/:id` but JobCard uses plain polling. Consolidating to SSE would be nicer but 2s poll is fine for now.
7. **Codex reviews** kept rate-limiting (2 failed attempts in this session). Retry offline or via another channel.

---

## Next session candidates

**Tier 0 — unblockers**
- Run the TVING Post-Creative-Review PRD through the new decomposer (post `9229421`) and see if tasks shrink enough to pass first-try review.
- Land the FIRST REAL promote (`gh auth switch --user kyungjaeha-moloco`, then non-dry-run promote). M5 infra is ready; just needs live auth.

**Tier 1 — straightforward**
- Decomposer: add `targetFile` auto-generation only when confident (regex or patterns.json match), otherwise leave blank. Currently always blank per scope-cut.
- JobCard: surface per-task "open change-request dashboard ↗" link (we already tag `jobId`/`taskId` on requests, just need the link).
- Auto-restart the pipeline's Vite plugin invalidation when a *new* container boots — it's already hot-patched in the current container but new playground sandboxes ship with the pre-invalidation plugin in their image.

**Tier 2 — bigger bites**
- Real QA: headless Playwright runner per task with acceptance-hint assertions (plan §4 J6 stretch).
- Parallel task execution when `dependsOn` allows — runner is already serial-by-design but topoOrder gives the info.
- Review auto-revise loop: on `fail`, feed the reviewer's notes back into a capped number of retry iterations before pausing.
- PRD source ingestion: actual Google Docs / Jira fetch via orchestrator-side OAuth.

---

## How to pick up

1. Pull main. Orchestrator lives at `:3847`, playground-app dev server at `:4180`.
2. Run `cd orchestrator && pnpm start` if it's not already running (my long-running restarts this session are gone).
3. Open `http://localhost:4180/p/52fd083e` — the TVING playground that exercised the whole pipeline. Has a paused job `8e4d7e57` if you want to inspect state shapes.
4. Read `docs/superpowers/plans/2026-04-24-prd-to-delivery-thin-slice-v2.md` for the design doc + six Codex open questions answered inline.
5. Grep for `TODO` / `v0` in `orchestrator/lib/job*.js` and `playground-app/src/editor/JobCard.tsx` for inline scope markers.
