/**
 * Job / Task state machines — thin-slice PRD pipeline (J0).
 *
 * Plan: docs/superpowers/plans/2026-04-24-prd-to-delivery-thin-slice-v2.md §3.1
 *
 * Two separate but interacting FSMs:
 *
 *   Job-level:
 *     decomposing → planning → delegating ↔ reviewing → qa → complete
 *                                     ↕
 *                                  paused  ← any non-terminal stage
 *                                  cancelled  ← any non-terminal stage
 *
 *   Task-level (inside a job):
 *     pending → running → committed → reviewed
 *                 ↓           ↓
 *              failed → skipped        (skipped after N failed attempts,
 *                                       or user `skip` action)
 *     any → blocked   (upstream dependency skipped/failed — user can
 *                       `unblock` to override)
 *
 * Transitions are declared as lookup tables; `canTransitionJob` /
 * `transitionJob` read them. Invalid transitions throw
 * `InvalidTransitionError` with a message naming both states — callers
 * handle or surface. Guards run after the table check so we fail loud
 * on unknown states too.
 *
 * The module is intentionally pure. No IO, no network, no LLM. It's the
 * single trusted source of "can we move from X to Y?" and downstream
 * code (runJob, orchestrator routes) composes it with side effects.
 */

// ── Types (JSDoc for editor hints) ──────────────────────────────────

/**
 * @typedef {'decomposing'
 *   | 'planning'
 *   | 'delegating'
 *   | 'reviewing'
 *   | 'qa'
 *   | 'complete'
 *   | 'paused'
 *   | 'cancelled'} JobStatus
 */

/**
 * @typedef {'pending'
 *   | 'running'
 *   | 'committed'
 *   | 'reviewed'
 *   | 'failed'
 *   | 'skipped'
 *   | 'blocked'} TaskStatus
 */

// ── Job transitions ──────────────────────────────────────────────────

/** @type {Readonly<Record<JobStatus, readonly JobStatus[]>>} */
export const JOB_TRANSITIONS = Object.freeze({
  decomposing: ['planning', 'paused', 'cancelled'],
  // planning → decomposing is the user-driven "break into smaller pieces" loop:
  // the LLM returned a plan but the user wants a fresh breakdown
  // before approving. We flip the job back into the decomposing stage
  // and let decomposeJobInBackground re-run the LLM.
  planning: ['decomposing', 'delegating', 'paused', 'cancelled'],
  delegating: ['reviewing', 'paused', 'cancelled'],
  // reviewing → delegating is the loop back for the next task; → qa is
  // the out-exit when all tasks reviewed; → paused fires on review-fail.
  reviewing: ['delegating', 'qa', 'paused', 'cancelled'],
  qa: ['complete', 'paused', 'cancelled'],
  // Terminal states.
  complete: [],
  // Paused is recoverable to whichever stage the job came from; the
  // orchestrator stores the prior status in `pausedReason` / a sibling
  // field so `resume` knows where to go. For the FSM's purposes, any of
  // the non-terminal stages is a legal target.
  paused: ['decomposing', 'planning', 'delegating', 'reviewing', 'qa', 'cancelled'],
  cancelled: [],
});

// ── Task transitions ─────────────────────────────────────────────────

/** @type {Readonly<Record<TaskStatus, readonly TaskStatus[]>>} */
export const TASK_TRANSITIONS = Object.freeze({
  pending: ['running', 'blocked', 'skipped'],
  // `running` can land in `committed` (adapter success), `failed`
  // (adapter error), or `skipped` (user cancel of the current task).
  running: ['committed', 'failed', 'skipped'],
  committed: ['reviewed', 'failed'], // review can flag a commit as failed
  reviewed: [], // terminal
  // Failed tasks can be retried (→ running again), skipped, or
  // accepted-anyway by the user (→ reviewed) — escape hatch for the
  // common "agent overshot scope but result is still useful" case
  // where a literal redo would be churn for no gain.
  failed: ['running', 'skipped', 'reviewed'],
  skipped: [], // terminal
  // Blocked is a soft terminal — user can manually unblock back to pending.
  blocked: ['pending', 'skipped'],
});

// ── Errors ───────────────────────────────────────────────────────────

export class InvalidTransitionError extends Error {
  /**
   * @param {string} kind  'job' | 'task'
   * @param {string} from
   * @param {string} to
   */
  constructor(kind, from, to) {
    super(`Invalid ${kind} transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
    this.kind = kind;
    this.from = from;
    this.to = to;
  }
}

// ── Pure predicates ──────────────────────────────────────────────────

/**
 * @param {JobStatus} from
 * @param {JobStatus} to
 * @returns {boolean}
 */
export function canTransitionJob(from, to) {
  const allowed = JOB_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * @param {TaskStatus} from
 * @param {TaskStatus} to
 * @returns {boolean}
 */
export function canTransitionTask(from, to) {
  const allowed = TASK_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

// ── Guarded transitions (throw on invalid) ───────────────────────────

/**
 * @param {JobStatus} from
 * @param {JobStatus} to
 * @returns {JobStatus} the `to` state, for fluent chaining
 * @throws {InvalidTransitionError}
 */
export function transitionJob(from, to) {
  if (!canTransitionJob(from, to)) throw new InvalidTransitionError('job', from, to);
  return to;
}

/**
 * @param {TaskStatus} from
 * @param {TaskStatus} to
 * @returns {TaskStatus}
 * @throws {InvalidTransitionError}
 */
export function transitionTask(from, to) {
  if (!canTransitionTask(from, to)) throw new InvalidTransitionError('task', from, to);
  return to;
}

// ── Introspection helpers (used by tests + diagnostics) ──────────────

/** @returns {JobStatus[]} */
export function jobStatuses() {
  return /** @type {JobStatus[]} */ (Object.keys(JOB_TRANSITIONS));
}

/** @returns {TaskStatus[]} */
export function taskStatuses() {
  return /** @type {TaskStatus[]} */ (Object.keys(TASK_TRANSITIONS));
}

/**
 * Terminal = no outgoing transitions. Handy for "can this be resumed?"
 * checks in the UI / runner.
 * @param {JobStatus | TaskStatus} status
 * @param {'job' | 'task'} kind
 * @returns {boolean}
 */
export function isTerminal(status, kind) {
  const table = kind === 'job' ? JOB_TRANSITIONS : TASK_TRANSITIONS;
  const row = /** @type {readonly string[] | undefined} */ (table[status]);
  return Array.isArray(row) && row.length === 0;
}
