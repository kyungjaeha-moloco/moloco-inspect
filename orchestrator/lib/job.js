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
 * @param {{ playgroundId: string, prdText: string }} input
 * @returns {Job}
 */
export function createJob({ playgroundId, prdText }) {
  if (!playgroundId) throw new Error('playgroundId required');
  if (typeof prdText !== 'string' || !prdText.trim()) {
    throw new Error('prdText required');
  }
  /** @type {Job} */
  const job = {
    id: shortId(),
    playgroundId,
    prdText,
    status: 'decomposing',
    tasks: [],
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  jobs.set(job.id, job);
  persist(job);
  return job;
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

/** @param {string} jobId @param {string} taskId */
export function retryTask(jobId, taskId) {
  const job = getJob(jobId);
  if (!job) throw new Error(`job not found: ${jobId}`);
  const task = job.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  // Retry from failed → running bumps attempt counter; runJob picks
  // up from there.
  return setTaskStatus(jobId, taskId, 'running', { attempt: task.attempt + 1 });
}

/** @param {string} jobId @param {string} taskId */
export function skipTask(jobId, taskId) {
  const job = getJob(jobId);
  if (!job) throw new Error(`job not found: ${jobId}`);
  const task = job.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
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

/** @param {string} jobId */
export function cancelJob(jobId) {
  // v2 §2 Q3 — cancel-after-current. The actual "finish current task
  // then stop" logic lives in runJob (J3a). Here we just flip state
  // so the worker sees the signal on its next tick.
  return setJobStatus(jobId, 'cancelled');
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
