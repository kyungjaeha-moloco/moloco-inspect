# PRD → Delivery — Thin-Slice Plan

**Status:** Draft (2026-04-24) — pending review
**Author:** kyungjae.ha (with Claude)
**Scope:** Minimum end-to-end pipeline that ingests a PRD, executes it as multiple tasks, reviews diffs, and delivers a PR. Stubs where possible; real agents where unavoidable.

---

## 0. Intent

Validate the **shape** of a multi-agent delivery pipeline before investing in any one stage. Each stage exists, even if it's a single LLM call or a manual-approve button. First pass optimizes for *feedback* ("does this flow make sense?"), not *quality*.

**Success signal:** One real-ish PRD (~3 tasks worth of work) flows from paste → PR without the user having to drop into the orchestrator CLI. We learn where the flow feels wrong.

---

## 1. Pipeline shape (6 stages)

```
┌─────────┐   ┌──────────┐   ┌──────────┐   ┌────────┐   ┌────┐   ┌────────┐
│ Intake  │ → │Decompose │ → │ Delegate │ → │ Review │ → │ QA │ → │Deliver │
│ (paste) │   │  (LLM)   │   │ (loop)   │   │ (LLM)  │   │ ─  │   │(M5 PR) │
└─────────┘   └──────────┘   └──────────┘   └────────┘   └────┘   └────────┘
```

### 1.1 Intake — pasted PRD text
- New entity `Job` scoped to a Playground: `{ id, playgroundId, prdText, status, tasks[], createdAt }`.
- UI: "Start from PRD" button in AIPanel → textarea modal → POST `/api/playground/:id/job`.
- No file upload, no Jira / Google Docs parser yet. User pastes text.

### 1.2 Decompose — LLM to task graph
- Orchestrator calls LLM with PRD text + playground context (client, route).
- LLM returns a `tasks[]` array: `{ id, title, description, dependsOn: string[], patternHint?, targetFile?, acceptanceHint? }`.
- No retry / validation loop yet — if the LLM returns garbage, the user sees garbage and cancels.
- UI: after decompose, show tasks as a vertical checklist. User can edit titles / delete tasks / re-order before approving.
- **Approval gate:** user hits "시작" to unlock Delegate stage.

### 1.3 Delegate — serial loop over tasks
- First pass: **serial only**. Dependencies respected by topological order. Parallel execution is a later optimization.
- Per task: reuse the existing `/api/change-request` pipeline with the task's `description` as `userPrompt` and `targetFile` as a hint.
- Task commit lands on the playground's work branch (same mechanism as today).
- On task error, pause the whole job and surface the error with "retry" / "skip" / "cancel".

### 1.4 Review — LLM diff check
- After each task commit, run a separate LLM call: "Given this diff + the task description, does the diff satisfy the task? Flag anything off."
- Output: `{ verdict: 'pass' | 'concerns' | 'fail', notes: string }`.
- UI: inline below the task in the checklist. `fail` pauses the job; user decides retry / accept / skip.
- No auto-revise loop yet. Human handles concerns.

### 1.5 QA — manual for v0
- Pure stub: renders as a check-list row "Run the app, verify scenarios, mark Pass/Fail."
- Acceptance criteria (from 1.2 `acceptanceHint`) rendered as bullet reminders.
- No Playwright yet. No visual diff. Just a human looking at the iframe.
- Explicit next-iteration hook: the QA step's data shape leaves room for `qaSteps: PlaywrightStep[]` later.

### 1.6 Deliver — reuse M5 promote
- On Job completion (all tasks reviewed + QA'd), the existing Promote button is unlocked.
- No change to promote itself — it's already the right primitive.
- PR body can include the PRD text + task list as a bonus (stretch).

---

## 2. Data model

```ts
// orchestrator/lib/job.js (new file)

export type JobStatus =
  | 'decomposing'  // LLM working on task graph
  | 'planning'     // awaiting user approval of tasks
  | 'delegating'   // executing tasks
  | 'reviewing'    // review phase between tasks
  | 'qa'           // manual QA gate
  | 'complete'     // ready to promote
  | 'paused'       // user intervention required
  | 'cancelled';

export type TaskStatus =
  | 'pending' | 'running' | 'committed' | 'reviewed' | 'failed' | 'skipped';

export interface Task {
  id: string;
  title: string;
  description: string;
  dependsOn: string[];  // Task.ids
  patternHint?: string;
  targetFile?: string;
  acceptanceHint?: string[];

  status: TaskStatus;
  changeRequestId?: string;  // links to /api/change-request run
  commitSha?: string;
  review?: {
    verdict: 'pass' | 'concerns' | 'fail';
    notes: string;
  };
}

export interface Job {
  id: string;
  playgroundId: string;
  prdText: string;
  status: JobStatus;
  tasks: Task[];
  createdAt: number;
  updatedAt: number;
}
```

Persistence: `orchestrator/state/job/<id>.json`. Mirrors the playground state file pattern.

---

## 3. Work breakdown

**J1. Backend scaffold (0.5d)**
- `orchestrator/lib/job.js` with CRUD + in-memory index + disk persist (copy `playground.js` shape).
- Routes: `POST /api/playground/:id/job`, `GET /api/job/:id`, `POST /api/job/:id/approve-plan`, `POST /api/job/:id/retry-task`, `POST /api/job/:id/skip-task`, `POST /api/job/:id/cancel`.

**J2. Decompose (0.5d)**
- Add `decomposePrd(prdText, ctx)` function — LLM call with a fixed system prompt. Returns `Task[]`.
- System prompt lives in `tooling/sandbox-manager/src/prompt-builder.js` (for now) or a sibling module.

**J3. Delegate loop (0.5d)**
- `runJob(jobId)` async worker. Topo-sort tasks, run serial, call existing change-request pipeline per task, await completion.
- Wire `changeRequest.playgroundId` + a new `jobId` / `taskId` so the orchestrator can route events back.

**J4. Review (0.5d)**
- `reviewTaskDiff(taskId, diff, description)` — LLM call returning `{ verdict, notes }`.
- Called right after a task's change-request hits `status: 'committed'`.

**J5. UI — JobPanel (1d)**
- New component `playground-app/src/editor/JobPanel.tsx`. Sits beside AIPanel or as a mode toggle.
- Sections: PRD input → task checklist (with status per task) → review notes → QA manual checkbox → Promote button.
- SSE for live job updates (copy `/api/change-request` SSE plumbing).

**J6. End-to-end smoke (0.5d)**
- One PRD: "Add a filter chip for status on the creative-review table, and change the '제출' button color to brand primary." (2–3 tasks.)
- Run job → PR. Observe where the flow breaks.

**Total estimate:** ~3.5 days focused work. Expect slippage at J3 (event routing) and J5 (UI tree shape).

---

## 4. Out of scope for v0 (explicitly)

- Parallel task execution.
- Playwright / automated QA.
- Visual regression.
- Auto-revise loop on review `fail`.
- PRD parsing from Jira / Google Docs / Notion — paste only.
- Cross-playground job orchestration.
- Metrics / analytics on job success rate.

These are on the roadmap but deliberately absent from the thin slice. Each belongs to a future iteration once we know the pipeline shape is sound.

---

## 5. Open questions

- **Q1.** Does the decomposer run once and lock the task list, or can the user ask for re-decomposition after edits? (v0: one-shot, user edits manually.)
- **Q2.** Should review run inline per task, or batched at the end? (v0: inline — catches problems early.)
- **Q3.** Where does JobPanel live in the UI? Replace AIPanel, or separate tab? (v0: separate tab in the same left pane, toggle at top.)
- **Q4.** How do failed `git am` promote rounds interact with a partially-done job? (v0: job stays in `complete`; user re-runs promote manually.)

Resolve these in code review once the shape is live.

---

## 6. Exit criteria for the thin slice

- [ ] One real PRD ingested, decomposed into ≥2 tasks.
- [ ] All tasks committed; diff reviews shown to user.
- [ ] Manual QA checkbox ticked.
- [ ] Promote button creates a real PR.
- [ ] Session handoff doc captures one iteration of "what was wrong with the flow".

The last point is the actual deliverable. The slice exists to generate that doc.
