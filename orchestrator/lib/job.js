/**
 * Job lifecycle — PRD → delivery thin-slice (J1).
 *
 * Plan: docs/superpowers/plans/2026-04-24-prd-to-delivery-thin-slice-v2.md
 *
 * CRUD + in-memory index + disk persistence. Mirrors the shape of
 * `playground.js` deliberately — same state-dir convention, same
 * "restore on module init" pattern, same `persist()` helper. Anything
 * that touches the state machine goes through `job-state.js` guards so
 * invalid transitions fail loud.
 *
 * J1 scope: pure state management + route handlers. Orchestration
 * (runJob worker) lands in J3a. LLM decompose + review land in J2 + J4.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  transitionJob,
  transitionTask,
  isTerminal,
  InvalidTransitionError,
} from './job-state.js';

/**
 * Reasons a user can select when acting on a task or cancelling a job.
 * Follows the "data captured just before shipping is never lost" principle
 * from the 5-framework. v0 enum is kept small — expand/merge based on
 * observed data distribution.
 */
export const ACTION_REASONS = Object.freeze({
  syntax_error: '문법/타입 에러',
  logic_error: '논리/구현 오류',
  scope_creep: '범위 벗어남 (PRD 외 변경)',
  partial: '부분 구현 (요구사항 일부만)',
  wrong_target: '잘못된 파일/컴포넌트',
  over_delivered: '오버 딜리버 (과한 변경)',
  other: '기타',
});

function normalizeReason(reason) {
  if (!reason) return null;
  if (typeof reason !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(ACTION_REASONS, reason) ? reason : null;
}

const STATE_DIR = new URL('../state/job/', import.meta.url).pathname;
fs.mkdirSync(STATE_DIR, { recursive: true });

// ── Types (JSDoc) ───────────────────────────────────────────────────

/**
 * @typedef {import('./job-state.js').JobStatus} JobStatus
 * @typedef {import('./job-state.js').TaskStatus} TaskStatus
 */

/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string[]} dependsOn
 * @property {TaskStatus} status
 * @property {number} attempt
 * @property {string} [changeRequestId]
 * @property {string} [commitSha]
 * @property {string} [baseSha]
 * @property {{ verdict: 'pass' | 'fail', notes: string }} [review]
 */

/**
 * @typedef {Object} Job
 * @property {string} id
 * @property {string} playgroundId
 * @property {string} prdText
 * @property {JobStatus} status
 * @property {Task[]} tasks
 * @property {string} [currentTaskId]
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {string} [pausedReason]
 */

// ── In-memory index ─────────────────────────────────────────────────

/** @type {Map<string, Job>} */
const jobs = new Map();

// Restore on boot. If a process died mid-run, mark those jobs paused so
// the user explicitly resumes — v2 §2 Q6.
let recoveredCount = 0;
for (const file of fs.readdirSync(STATE_DIR)) {
  if (!file.endsWith('.json')) continue;
  try {
    const raw = /** @type {Job} */ (
      JSON.parse(fs.readFileSync(path.join(STATE_DIR, file), 'utf8'))
    );
    if (raw.status === 'delegating' || raw.status === 'reviewing') {
      raw.status = 'paused';
      raw.pausedReason = 'restart during run';
      raw.updatedAt = Date.now();
      recoveredCount += 1;
      persist(raw);
    }
    jobs.set(raw.id, raw);
  } catch (err) {
    console.warn('[job] skipped malformed state:', file, err.message);
  }
}
if (recoveredCount > 0) {
  console.log(`[job] auto-paused ${recoveredCount} in-flight jobs from prior run`);
}
console.log(`[job] restored ${jobs.size} jobs from disk`);

// ── Persistence ─────────────────────────────────────────────────────

/** @param {Job} job */
function persist(job) {
  fs.writeFileSync(
    path.join(STATE_DIR, `${job.id}.json`),
    JSON.stringify(job, null, 2),
    'utf8',
  );
}

function nowMs() {
  return Date.now();
}

function shortId() {
  return randomUUID().replace(/-/g, '').slice(0, 8);
}

// ── CRUD ────────────────────────────────────────────────────────────

/**
 * Map plan_items (from fast-track intake) to the internal Task shape.
 * Only items with `enabled !== false` are included.
 *
 * @param {Array<{ id?: string, title?: string, description?: string, target_file?: string, pattern_id?: string, enabled?: boolean }> | undefined} planItems
 * @returns {Task[]}
 */
function planItemsToTasks(planItems) {
  if (!Array.isArray(planItems)) return [];
  return planItems
    .filter((p) => p.enabled !== false)
    .map((p, i) => ({
      id: p.id ?? `task-${i + 1}`,
      title: p.title ?? '(no title)',
      description: p.description ?? '',
      targetFile: p.target_file ?? null,
      patternId: p.pattern_id ?? null,
      dependsOn: [],
      status: /** @type {import('./job-state.js').TaskStatus} */ ('pending'),
      attempt: 0,
    }));
}

/**
 * @param {{
 *   playgroundId: string,
 *   prdText: string,
 *   baselineHeadSha?: string,
 *   autoApprove?: boolean,
 *   skipDecomposer?: boolean,
 *   planItems?: Array<{ id?: string, title?: string, description?: string, target_file?: string, pattern_id?: string, enabled?: boolean }>,
 * }} input
 *   `baselineHeadSha` is the playground's HEAD at the moment the job is
 *   created — recorded so cancel can offer "rewind everything this job
 *   committed" without losing work that landed before this job started.
 *   `autoApprove` — when true, skips the `planning` (user approval) phase
 *   and transitions directly to `delegating`.
 *   `skipDecomposer` — when true, uses `planItems` as the task list instead
 *   of calling the LLM decomposer. Requires `planItems` to be non-empty.
 * @returns {Job}
 */
export function createJob({ playgroundId, prdText, baselineHeadSha, autoApprove = false, skipDecomposer = false, planItems }) {
  if (!playgroundId) throw new Error('playgroundId required');
  if (typeof prdText !== 'string' || !prdText.trim()) {
    throw new Error('prdText required');
  }

  const initialTasks = skipDecomposer ? planItemsToTasks(planItems) : [];

  if (skipDecomposer && initialTasks.length === 0) {
    throw new Error('skipDecomposer requires at least one enabled planItem');
  }

  /** @type {Job} */
  const job = {
    id: shortId(),
    playgroundId,
    prdText,
    // skipDecomposer jobs start in `planning` (tasks already populated).
    // Normal jobs start in `decomposing` (LLM decomposer fills tasks).
    status: /** @type {import('./job-state.js').JobStatus} */ (skipDecomposer ? 'planning' : 'decomposing'),
    tasks: initialTasks,
    baselineHeadSha,
    autoApprove,
    skipDecomposer,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  jobs.set(job.id, job);
  persist(job);

  // autoApprove: skip the planning (user-approval) phase and go straight
  // to delegating. Uses setJobStatus so the FSM transition is validated.
  if (autoApprove && skipDecomposer) {
    setJobStatus(job.id, 'delegating');
  }

  return getJob(job.id);
}

/**
 * @param {string} id
 * @returns {Job | undefined}
 */
export function getJob(id) {
  return jobs.get(id);
}

/**
 * @returns {Job[]}
 */
export function listJobs() {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Active = not terminal. Used by `/api/change-request` guard to block
 * ad-hoc requests while a job owns the playground (v2 §2 Q1).
 * @param {string} playgroundId
 * @returns {Job | undefined}
 */
export function activeJobForPlayground(playgroundId) {
  for (const job of jobs.values()) {
    if (job.playgroundId !== playgroundId) continue;
    if (isTerminal(job.status, 'job')) continue;
    // `paused` counts as active — user must cancel or resume explicitly
    // before the playground is free.
    return job;
  }
  return undefined;
}

// ── State transitions ───────────────────────────────────────────────

/**
 * Apply a validated job-status change + persist.
 * @param {string} id
 * @param {JobStatus} next
 * @param {{ pausedReason?: string }} [opts]
 * @returns {Job}
 */
export function setJobStatus(id, next, opts = {}) {
  const job = getJob(id);
  if (!job) throw new Error(`job not found: ${id}`);
  transitionJob(job.status, next); // throws InvalidTransitionError on invalid
  job.status = next;
  if (next === 'paused') {
    job.pausedReason = opts.pausedReason ?? job.pausedReason ?? 'unknown';
  } else {
    job.pausedReason = undefined;
  }
  job.updatedAt = nowMs();
  persist(job);
  return job;
}

/**
 * @param {string} jobId
 * @param {string} taskId
 * @param {TaskStatus} next
 * @param {Partial<Task>} [patch]  other fields to set alongside the status
 * @returns {Job}
 */
export function setTaskStatus(jobId, taskId, next, patch = {}) {
  const job = getJob(jobId);
  if (!job) throw new Error(`job not found: ${jobId}`);
  const task = job.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`task not found: ${taskId} in job ${jobId}`);
  transitionTask(task.status, next);
  Object.assign(task, patch, { status: next });
  job.updatedAt = nowMs();
  persist(job);
  return job;
}

/**
 * Patch task metadata fields without a status transition. Used by the
 * change-request adapter to stream the running task's live phase
 * (e.g. `running_agent`, `collecting_diff`) into the task record so
 * the JobCard's existing 2s poll picks it up — gives the user a
 * "what is it doing right now" line without us wiring SSE through.
 *
 * Only legal while task is mid-flight; bails silently if the task is
 * gone (race against cancel).
 *
 * @param {string} jobId
 * @param {string} taskId
 * @param {Partial<Task>} patch
 * @returns {Job | null}
 */
export function setTaskMeta(jobId, taskId, patch) {
  const job = getJob(jobId);
  if (!job) return null;
  const task = job.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  Object.assign(task, patch);
  job.updatedAt = nowMs();
  persist(job);
  return job;
}

/**
 * Overwrite the task list — used by the decomposer once the LLM
 * returns a task graph, and by `approvePlan` when the user edits
 * titles/deletes tasks before starting.
 * @param {string} jobId
 * @param {Array<Omit<Task, 'status' | 'attempt'>> & { status?: never }[]} tasks
 * @returns {Job}
 */
export function setJobTasks(jobId, tasks) {
  const job = getJob(jobId);
  if (!job) throw new Error(`job not found: ${jobId}`);
  // Only legal while still in the pre-delegation phases — changing
  // tasks mid-run would invalidate in-flight state.
  if (job.status !== 'decomposing' && job.status !== 'planning') {
    throw new Error(
      `cannot replace tasks once job is ${job.status}; current phase must be decomposing or planning`,
    );
  }
  job.tasks = tasks.map((t) => ({
    ...t,
    dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
    status: /** @type {TaskStatus} */ ('pending'),
    attempt: 0,
  }));
  // Validate dependsOn references — fail loud per plan §4 J2.
  const ids = new Set(job.tasks.map((t) => t.id));
  for (const t of job.tasks) {
    for (const dep of t.dependsOn) {
      if (!ids.has(dep)) {
        throw new Error(
          `task ${t.id} has unknown dependsOn: ${dep}`,
        );
      }
    }
  }
  // Tasks landing in a freshly-decomposed job flips the job to
  // `planning` (awaiting user approval). Subsequent edits while still
  // in `planning` just update the list in place.
  if (job.status === 'decomposing') {
    transitionJob(job.status, 'planning');
    job.status = 'planning';
  }
  job.updatedAt = nowMs();
  persist(job);
  return job;
}

// ── User actions (v2 §4 J1 routes) ──────────────────────────────────

/** @param {string} jobId */
export function approvePlan(jobId) {
  const job = getJob(jobId);
  if (!job) throw new Error(`job not found: ${jobId}`);
  if (job.tasks.length === 0) {
    throw new Error('cannot approve empty task list');
  }
  return setJobStatus(jobId, 'delegating');
}

/** @param {string} jobId @param {string} taskId @param {{ reason?: string, reasonText?: string }} [actionMeta] */
export function retryTask(jobId, taskId, actionMeta = {}) {
  const job = getJob(jobId);
  if (!job) throw new Error(`job not found: ${jobId}`);
  const task = job.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  if (task.status !== 'failed') {
    throw new Error(`task ${taskId} not in failed state (${task.status})`);
  }
  // Leave status at 'failed' — the runner's pickNextTask treats
  // (failed + attempt < maxAttempts) as retry-eligible and handles
  // the failed → running transition + attempt bump itself. If this
  // action sets 'running' prematurely, pickNextTask no longer picks
  // the task (it filters to pending/failed only) and the job pauses
  // thinking it's stuck.
  //
  // We do, however, need to unpause the job if review-fail paused it.
  const reason = normalizeReason(actionMeta.reason);
  const reasonText = typeof actionMeta.reasonText === 'string' ? actionMeta.reasonText.slice(0, 500) : null;
  if (reason || reasonText) {
    if (!task.actionHistory) task.actionHistory = [];
    task.actionHistory.push({ kind: 'retry', reason, reasonText, at: Date.now() });
    job.updatedAt = nowMs();
    persist(job);
  }
  if (job.status === 'paused') {
    return setJobStatus(jobId, 'delegating');
  }
  return job;
}

/**
 * Accept-anyway escape hatch — user reviewed the failure and decided
 * the result is still acceptable (agent overshot scope, off-by-spec
 * but harmless, etc.). Flips failed → reviewed and unpauses the job
 * so the runner picks up the next task. Preserves the original
 * review.notes but stamps `acceptedByUser` so downstream tooling can
 * tell this wasn't a clean pass.
 *
 * @param {string} jobId
 * @param {string} taskId
 */
export function acceptTask(jobId, taskId, actionMeta = {}) {
  const job = getJob(jobId);
  if (!job) throw new Error(`job not found: ${jobId}`);
  const task = job.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  if (task.status !== 'failed') {
    throw new Error(`task ${taskId} not in failed state (${task.status})`);
  }
  const reason = normalizeReason(actionMeta.reason);
  const reasonText = typeof actionMeta.reasonText === 'string' ? actionMeta.reasonText.slice(0, 500) : null;
  if (reason || reasonText) {
    if (!task.actionHistory) task.actionHistory = [];
    task.actionHistory.push({ kind: 'accept', reason, reasonText, at: Date.now() });
  }
  setTaskStatus(jobId, taskId, 'reviewed', {
    review: {
      ...(task.review ?? { verdict: 'fail', notes: '' }),
      acceptedByUser: true,
    },
  });
  if (job.status === 'paused') {
    return setJobStatus(jobId, 'delegating');
  }
  return getJob(jobId);
}

/** @param {string} jobId @param {string} taskId @param {{ reason?: string, reasonText?: string }} [actionMeta] */
export function skipTask(jobId, taskId, actionMeta = {}) {
  const job = getJob(jobId);
  if (!job) throw new Error(`job not found: ${jobId}`);
  const task = job.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  const reason = normalizeReason(actionMeta.reason);
  const reasonText = typeof actionMeta.reasonText === 'string' ? actionMeta.reasonText.slice(0, 500) : null;
  if (reason || reasonText) {
    if (!task.actionHistory) task.actionHistory = [];
    task.actionHistory.push({ kind: 'skip', reason, reasonText, at: Date.now() });
  }
  const updated = setTaskStatus(jobId, taskId, 'skipped');
  // Cascade: any downstream task whose dependsOn now includes a
  // skipped/failed node gets marked `blocked`. v2 §2 Q4.
  propagateBlocked(updated, taskId);
  persist(updated);
  return updated;
}

/** @param {string} jobId @param {string} taskId */
export function unblockTask(jobId, taskId) {
  return setTaskStatus(jobId, taskId, 'pending');
}

/**
 * Stamp the LLM-picked target route on the job. The UI surfaces it on
 * the completion screen ("Open result page ↗") so the user doesn't have
 * to hunt for the newly-added menu entry. Optional — many PRDs don't
 * map to a single landing URL.
 *
 * @param {string} jobId
 * @param {string} route — must start with "/", e.g. "/post-creative-review"
 * @returns {Job | null}
 */
export function setTargetRoute(jobId, route) {
  const job = getJob(jobId);
  if (!job) return null;
  if (typeof route !== 'string' || !route.startsWith('/')) return job;
  job.targetRoute = route;
  job.updatedAt = nowMs();
  persist(job);
  return job;
}

/**
 * Stamp the QA strategy decision on the job. Called by the server's
 * approve-plan handler after `selectQaStrategy` runs against the
 * approved task list. Strategy choice doesn't gate the runner — it's
 * informational metadata that the QA runner (next slice) and the UI
 * read off the job. Stored fields live alongside `tasks` so they
 * survive disk persist + restart.
 *
 * @param {string} jobId
 * @param {{ strategy: string, rationale?: string, rationale_ko?: string }} info
 *   `rationale` is the current English field; `rationale_ko` is accepted
 *   for back-compat with older callers and is read but not preferred.
 * @returns {Job}
 */
export function setQaStrategy(jobId, info) {
  const job = getJob(jobId);
  if (!job) throw new Error(`job not found: ${jobId}`);
  job.qaStrategy = info.strategy;
  job.qaRationale = info.rationale ?? info.rationale_ko ?? '';
  job.updatedAt = nowMs();
  persist(job);
  return job;
}

/**
 * Stamp the research bundle on a task. Called by the runner before the
 * task's adapter fires. Persisted on disk so a retry or pause/resume
 * can reuse the bundle without re-spending tokens (see Slice E of
 * docs/superpowers/plans/2026-05-12-research-parallelism.md).
 *
 * Accepts `null` / `undefined` as a no-op clear — the runner uses this
 * shape to wipe a stale bundle after a reviewer-fail before re-running.
 *
 * @param {string} jobId
 * @param {string} taskId
 * @param {object | null | undefined} bundle
 * @returns {Job | null}
 */
export function setTaskResearch(jobId, taskId, bundle) {
  const job = getJob(jobId);
  if (!job) return null;
  const task = job.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  task.research = bundle ?? null;
  job.updatedAt = nowMs();
  persist(job);
  return job;
}

/**
 * Stamp PRD-specific risk lines emitted by the decomposer.
 * Surfaced in the plan UI alongside the task list so the user signs
 * off on the verification approach + watch-outs together with the
 * task plan instead of after the fact.
 *
 * @param {string} jobId
 * @param {string[]} risks
 * @returns {Job | null}
 */
export function setJobRisks(jobId, risks) {
  const job = getJob(jobId);
  if (!job) return null;
  job.risks = Array.isArray(risks)
    ? risks
        .filter((r) => typeof r === 'string' && r.trim().length > 0)
        .map((r) => r.trim().slice(0, 200))
        .slice(0, 3)
    : [];
  job.updatedAt = nowMs();
  persist(job);
  return job;
}

/**
 * Persist the Slack thread (channel + thread_ts) and optional
 * `planMessageTs` (for chat.update on the plan card) that originally
 * created this job so molly can post status-change notifications
 * back into the same conversation. Stored on the job record (not in
 * a separate map) so it survives orchestrator restarts — molly's
 * startup scan re-attaches a poll loop to every active job that has
 * a `slackContext`.
 *
 * Partial-update friendly: passing only `{planMessageTs}` after the
 * initial `{channel, threadTs}` write merges into the existing context
 * instead of clearing channel/threadTs. molly's flow is two-phase
 * (mention → setJobSlackContext channel+thread; plan post → setJobSlackContext
 * planMessageTs).
 *
 * @param {string} jobId
 * @param {{ channel?: string, threadTs?: string, planMessageTs?: string }} context
 * @returns {Job | null}
 */
export function setJobSlackContext(jobId, context) {
  const job = getJob(jobId);
  if (!job) return null;
  if (!context) return job;
  const existing = job.slackContext ?? {};
  const next = { ...existing };
  if (context.channel) next.channel = String(context.channel);
  if (context.threadTs) next.threadTs = String(context.threadTs);
  if (context.planMessageTs) next.planMessageTs = String(context.planMessageTs);
  // Don't overwrite existing channel/threadTs with empty values, but
  // allow channel/threadTs to be set on first write. Bail out if we
  // still don't have the minimum required pair.
  if (!next.channel || !next.threadTs) return job;
  job.slackContext = next;
  job.updatedAt = nowMs();
  persist(job);
  return job;
}

/**
 * Stamp the auto-QA run's outcome on the job. Called by
 * `job-qa-runner.js` after the picked strategy's adapter returns.
 * Pure metadata write — no FSM transition. The manual `markQaPass`
 * button remains the gate that flips qa → complete; this just
 * surfaces the auto-run's verdict in the UI ("🧪 Auto QA pass/fail").
 *
 * @param {string} jobId
 * @param {{ strategy: string, passed: boolean, notes: string, ranAt: number, evidence?: object }} result
 * @returns {Job | null}
 */
export function setQaAutoResult(jobId, result) {
  const job = getJob(jobId);
  if (!job) return null;
  job.qaAutoResult = {
    strategy: result.strategy,
    passed: !!result.passed,
    notes: typeof result.notes === 'string' ? result.notes.slice(0, 500) : '',
    ranAt: typeof result.ranAt === 'number' ? result.ranAt : Date.now(),
    ...(result.evidence ? { evidence: result.evidence } : {}),
  };
  job.updatedAt = nowMs();
  persist(job);
  return job;
}

/** @param {string} jobId @param {{ reason?: string, reasonText?: string }} [actionMeta] */
export function cancelJob(jobId, actionMeta = {}) {
  // v2 §2 Q3 — cancel-after-current. The actual "finish current task
  // then stop" logic lives in runJob (J3a). Here we just flip state
  // so the worker sees the signal on its next tick.
  //
  // The in-flight task may still be mid-pipeline (no abort signal
  // crosses the docker boundary). Clear `currentPhase` on any running
  // / committed task so the JobCard's live phase line disappears
  // immediately on cancel, instead of ticking through "Writing code →
  // Collecting changes" for another minute on a job the user already gave
  // up on. Status itself is left intact so the FSM can still walk the
  // task to its natural terminal state in the background.
  const job = getJob(jobId);
  if (job) {
    for (const t of job.tasks) {
      if (t.status === 'running' || t.status === 'committed') {
        t.currentPhase = undefined;
      }
    }
    // Capture cancel reason — lifecycle fires once so a single object suffices.
    const reason = normalizeReason(actionMeta.reason);
    const reasonText = typeof actionMeta.reasonText === 'string' ? actionMeta.reasonText.slice(0, 500) : null;
    if (reason || reasonText) {
      job.cancelMeta = { reason, reasonText, at: Date.now() };
    }
  }
  return setJobStatus(jobId, 'cancelled');
}

/**
 * Mark the QA stage as passed — the user has manually verified the
 * app works as intended in the sandbox and wants to unlock promote.
 * Explicit human gate (v0 scope-cut keeps automated QA out).
 * @param {string} jobId
 */
export function markQaPass(jobId) {
  const job = getJob(jobId);
  if (!job) throw new Error(`job not found: ${jobId}`);
  if (job.status !== 'qa') {
    throw new Error(`cannot mark QA pass from status ${job.status}`);
  }
  return setJobStatus(jobId, 'complete');
}

/**
 * Resume a paused job. Caller (or the runner) decides which non-terminal
 * stage to resume into; the FSM allows any valid non-terminal target.
 * @param {string} jobId
 * @param {JobStatus} target
 */
export function resumeJob(jobId, target) {
  const job = getJob(jobId);
  if (!job) throw new Error(`job not found: ${jobId}`);
  if (job.status !== 'paused') {
    throw new Error(`cannot resume job in status ${job.status}`);
  }
  return setJobStatus(jobId, target);
}

// ── Internal helpers ────────────────────────────────────────────────

/**
 * When a task is skipped or failed, walk the graph and mark every
 * pending/blocked descendant as `blocked`. Does not touch tasks
 * already in a terminal state.
 * @param {Job} job
 * @param {string} changedTaskId
 */
function propagateBlocked(job, changedTaskId) {
  // Build reverse-dep lookup once.
  /** @type {Map<string, string[]>} */
  const reverseDeps = new Map();
  for (const t of job.tasks) {
    for (const dep of t.dependsOn) {
      if (!reverseDeps.has(dep)) reverseDeps.set(dep, []);
      reverseDeps.get(dep).push(t.id);
    }
  }
  const toVisit = [changedTaskId];
  const visited = new Set();
  while (toVisit.length) {
    const id = toVisit.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    for (const childId of reverseDeps.get(id) ?? []) {
      const child = job.tasks.find((t) => t.id === childId);
      if (!child) continue;
      // Only transition if the FSM allows it. `pending → blocked` is
      // valid; most other states are not (running/committed already
      // in flight or done).
      if (child.status !== 'pending') continue;
      try {
        child.status = transitionTask(child.status, 'blocked');
        toVisit.push(child.id);
      } catch (err) {
        if (!(err instanceof InvalidTransitionError)) throw err;
        // Silently ignore tasks the FSM says can't be blocked — they're
        // already in some non-blockable state.
      }
    }
  }
}
