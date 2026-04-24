# PRD → Delivery — Thin-Slice Plan (v2)

**Status:** Ready (2026-04-24) — Codex critic needs-revision feedback applied
**Author:** kyungjae.ha (with Claude)
**Supersedes:** `2026-04-24-prd-to-delivery-thin-slice.md` (v1)
**Review:** Codex critic (c37c80b0) — `.omc/prompts/codex-response-review-request-prd-c37c80b0.md`

---

## 0. Intent (unchanged from v1)

Validate the **shape** of a multi-agent delivery pipeline before investing in any one stage. Each stage exists, even if it's a stub. First pass optimizes for *feedback* ("does this flow make sense?"), not *quality*.

**Success signal:** One real-ish PRD (~3 tasks worth of work) flows from paste → PR without the user having to drop into the orchestrator CLI. We learn where the flow feels wrong.

---

## 1. Pipeline shape (6 stages — unchanged shape, different ordering)

```
┌─────────┐   ┌──────────┐   ┌──────────┐   ┌────────┐   ┌────┐   ┌────────┐
│ Intake  │ → │Decompose │ → │ Delegate │ → │ Review │ → │ QA │ → │Deliver │
│ (paste) │   │  (LLM)   │   │ (loop)   │   │ (LLM)  │   │ ─  │   │(M5 PR) │
└─────────┘   └──────────┘   └──────────┘   └────────┘   └────┘   └────────┘
```

### 1.1 Intake — pasted PRD text
- New entity `Job` scoped to a Playground.
- UI: "Start from PRD" button in AIPanel → textarea modal → `POST /api/playground/:id/job`.
- Paste only. No Jira/Docs parsing, no file upload.

### 1.2 Decompose — LLM → task graph
- Orchestrator calls LLM with PRD text + `client` + `route`.
- Returns `tasks[]`: `{ id, title, description, dependsOn[] }`. **No `patternHint` / `targetFile` auto-generation** — user edits manually.
- No retry loop. Garbage in = user cancels.
- UI: vertical checklist. User can edit title / delete. **No reorder** (breaks `dependsOn`).
- Approval gate: "시작" button → unlocks Delegate.

### 1.3 Delegate — serial loop
- Serial only. Topo-sort by `dependsOn`.
- **Adapter, not direct reuse:** call a thin `runTaskAsChangeRequest(task, jobId)` wrapper around `runAgentPipeline` that:
  - Tags the request with `jobId` + `taskId` (so analytics + UI can filter).
  - Bypasses `status: 'preview'` — task commits directly, no PM approval step.
  - Emits job-scoped events (not preview screenshots, not diff-viewer URLs).
- One task per change-request. Task → `committed` on success.

### 1.4 Review — LLM diff check
- Input: `baseSha..headSha` diff **for that task only** (not full working tree).
- LLM call: "Does this diff satisfy the task description? Pass or fail, one note."
- Output: `{ verdict: 'pass' | 'fail', notes: string }` — **no tri-state**.
- `fail` pauses the job. User decides retry / accept-anyway / skip.

### 1.5 QA — manual for v0
- Pure stub: checkbox row "Run the app, verify scenarios, mark Pass/Fail."
- Acceptance bullets rendered as reminders (from PRD text, not auto-extracted).
- Hook left for `qaSteps: PlaywrightStep[]` later. No implementation in v0.

### 1.6 Deliver — reuse M5 promote
- Unchanged. Existing `/promote` endpoint. Job → `complete` unlocks the button.
- PR body stretch goal: PRD text + task list appended.

---

## 2. Interaction rules (Codex open questions, answered)

| # | Question | v0 decision |
|---|---|---|
| Q1 | Job running + user sends ad-hoc AIPanel change-request on same playground? | **Block.** Server guard: while a `Job` is in `delegating`/`reviewing`, `/api/change-request` for that playground rejects with `job_active`. UI disables input with a "job 실행 중 — ..." hint. |
| Q2 | Per-task diff scope? | **`baseSha..headSha` for that task only.** Not full working-tree. Keeps review focused. |
| Q3 | Cancel semantics? | **Cancel-after-current.** Hard-stopping mid-agent risks corrupt commits / orphaned container state. Cancel marks job `cancelled` on the next task boundary. |
| Q4 | Skipped dependency → downstream tasks? | **Auto-block + warning.** Tasks whose `dependsOn` contains a skipped/failed task move to `blocked`. User can manually unblock ("실행 강행") if they know the skip is harmless. |
| Q5 | Change-request artifact pruning? | **None in v0.** Artifacts accumulate as they do today. Pruning strategy is a v1 concern; track as follow-up. |
| Q6 | Orchestrator restart → running jobs? | **Always `paused`.** Restart detection sets any `delegating`/`reviewing` job to `paused` with a "restart during run" note. User clicks Resume. No silent auto-resume — the in-flight task's actual state is too fuzzy to trust. |

---

## 3. Data model

```ts
// orchestrator/lib/job.js (new file)

export type JobStatus =
  | 'decomposing'   // LLM working on task graph
  | 'planning'      // awaiting user approval of tasks
  | 'delegating'    // executing tasks
  | 'reviewing'     // review phase between tasks
  | 'qa'            // manual QA gate
  | 'complete'      // ready to promote
  | 'paused'        // user intervention required (also: restart recovery)
  | 'cancelled';

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'committed'
  | 'reviewed'
  | 'failed'
  | 'skipped'
  | 'blocked';  // upstream dep was skipped/failed

export interface Task {
  id: string;
  title: string;
  description: string;
  dependsOn: string[];

  status: TaskStatus;
  attempt: number;              // for idempotency / retry counting
  changeRequestId?: string;     // current/last CR this task spawned
  commitSha?: string;           // set when status === 'committed' | 'reviewed'
  baseSha?: string;             // the HEAD at task start — drives per-task diff
  review?: {
    verdict: 'pass' | 'fail';
    notes: string;
  };
}

export interface Job {
  id: string;
  playgroundId: string;
  prdText: string;
  status: JobStatus;
  tasks: Task[];
  currentTaskId?: string;       // for restart recovery + UI cursor
  createdAt: number;
  updatedAt: number;
  pausedReason?: string;        // "restart during run" | "review-fail" | etc.
}
```

Persistence: `orchestrator/state/job/<id>.json`. Mirrors `playground.js`.

### 3.1 State machine — valid transitions

```
decomposing → planning → delegating → reviewing → qa → complete
                           ↕  (loop per task)
                         paused  ← any stage can enter paused
                         cancelled  ← from any non-terminal stage
```

Task-level:
```
pending → running → committed → reviewed
          ↓           ↓
        failed ← retry (attempt++)
          ↓
        skipped
        
any → blocked (upstream skipped/failed)
```

Enforce transitions in `setJobStatus(id, next)` / `setTaskStatus(taskId, next)` helpers. Reject invalid transitions with `InvalidTransitionError`.

---

## 4. Work breakdown (revised)

**J0. State machine contract (0.5d)** — new
- Write `orchestrator/lib/job-state.js` with transition tables + guards. No UI, no LLM.
- Unit tests: every valid transition passes, every invalid transition throws. Table-driven.
- **Exit:** the state machine is the smallest thing we can trust; everything downstream depends on it.

**J1. Backend scaffold (0.5d)**
- `orchestrator/lib/job.js`: CRUD, in-memory index, disk persist.
- Routes: `POST /api/playground/:id/job`, `GET /api/job/:id`, `POST /api/job/:id/approve-plan`, `POST /api/job/:id/retry-task`, `POST /api/job/:id/skip-task`, `POST /api/job/:id/unblock-task`, `POST /api/job/:id/cancel`, `POST /api/job/:id/resume`.
- On process boot: scan disk, transition any `delegating`/`reviewing` → `paused` with `pausedReason: 'restart during run'`.

**J3a. Orchestration core (1d)** — split from v1 J3
- `runJob(jobId)` worker. Topo-sort, serial execution, pause/cancel handling, retry counting, blocked-downstream propagation.
- **Uses static tasks** (not LLM). For testing: a fixture `Job` with 3 hand-written tasks + an adapter mock that just writes a file.
- Smoke test: happy path + one forced failure (retry → skip → `blocked` propagation).
- **Exit:** orchestration correctness is proven before any LLM is in the loop.

**J3b. Change-request adapter (0.5d)**
- `runTaskAsChangeRequest(task, jobId)`:
  - Calls `runAgentPipeline` with job-scoped payload.
  - Records `changeRequestId` + `baseSha` on the task.
  - On commit: updates task to `committed`, captures `commitSha`.
  - On error: task → `failed`.
- Server guard: `/api/change-request` rejects when a job is active on that playground (`job_active` error).

**J2. Decompose (0.5d)**
- Replace J3a's static tasks with LLM output.
- `decomposePrd(prdText, ctx)` — one-shot LLM call. System prompt lives in `tooling/sandbox-manager/src/job-prompts.js` (new file — not in sandbox prompt-builder because it runs on the host).
- Validation: ensure `dependsOn` references valid task IDs. Fail loud if not — don't try to auto-fix.

**J4. Review (0.5d)**
- `reviewTaskDiff(taskId, diff, description)` — one-shot LLM call.
- Diff scope: `git diff task.baseSha..task.commitSha` inside the sandbox.
- `pass|fail` with one note.
- `fail` → job `paused` with `pausedReason: 'review-fail'`.

**J5a. JobPanel read view (0.5d)**
- New `playground-app/src/editor/JobPanel.tsx`. Sits as a tab toggle in the left pane (next to AIPanel).
- Renders `Job` via `GET /api/job/:id` **polled every 2–3 s**. No SSE in v0.
- Sections: PRD text (collapsed after start) → task list (status pills) → review notes → QA checklist → Promote button (disabled until `complete`).

**J5b. JobPanel controls (0.5d)**
- Wire action buttons: approve-plan, retry-task, skip-task, unblock-task, cancel, resume.
- PRD modal for Intake.
- Disable AIPanel input when `jobActive` (Q1).

**J6. End-to-end smoke (0.5d)** — run twice
- **J6a happy path:** small real-ish PRD (~2–3 tasks). One filter chip + one copy tweak. Pastes, approves, all green, PR created.
- **J6b failure path:** force a task to fail (use a PRD where task 2 depends on a non-existent file). Verify `failed` → retry → skip → downstream `blocked` → user override → completion.
- Deliverable: one-page handoff capturing "what felt wrong" (per v0 exit criteria).

**Total estimate:** ~5 days focused work. Buffer to 7 days for integration surprises (task adapter event routing, state-machine edge cases discovered in J6b).

---

## 5. Out of scope for v0 (carried from v1 + Codex cuts)

- Parallel task execution.
- Playwright / automated QA.
- Visual regression.
- Auto-revise on review fail (`fail` just pauses — human handles).
- PRD parsing from Jira / Docs / Notion.
- Cross-playground job orchestration.
- Metrics / analytics for job success rate.
- **SSE for job updates** — poll-based in v0.
- **Task reorder** — dependsOn integrity; delete + re-decompose instead.
- **Decomposer generating `patternHint` / `targetFile`** — user types those if needed.
- **Review tri-state** (`concerns`) — binary only.
- **Artifact pruning** — accumulate; pruning is a v1 concern.

---

## 6. Approved unchanged (Codex noted)

- Serial execution first.
- Manual QA stub.
- Reusing playground promote as the delivery primitive.
- The out-of-scope list itself is disciplined and correct.

---

## 7. Exit criteria

- [ ] J0 state machine unit tests green.
- [ ] J3a happy-path + failure-path smoke runs (static tasks) pass.
- [ ] J6a: one real PRD → ≥2 tasks → all reviewed → PR created.
- [ ] J6b: forced failure → correct `blocked` propagation → manual unblock → completion.
- [ ] Session handoff doc captures "what was wrong with the flow". ← **the real deliverable**
