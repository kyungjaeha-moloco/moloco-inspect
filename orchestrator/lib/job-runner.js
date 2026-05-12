/**
 * Job runner — serial task execution (J3a).
 *
 * Plan: docs/superpowers/plans/2026-04-24-prd-to-delivery-thin-slice-v2.md §4 J3a
 *
 * Pure orchestration logic, parameterised over an `adapter` (runs a task
 * → commit) and a `reviewer` (validates a task's diff). Production wires
 * the real change-request adapter in J3b; tests wire mocks.
 *
 * Invariants:
 *   - Serial only. One task in flight at a time per job.
 *   - FSM transitions go through `job.setJobStatus` / `setTaskStatus` so
 *     they're persisted and guarded by `job-state.js`.
 *   - Cancel is "cancel-after-current" (v2 §2 Q3): we only check status
 *     *between* tasks. The in-flight adapter may complete normally;
 *     its commit still lands in the sandbox git tree regardless, but
 *     we simply stop feeding new tasks once cancelled is observed.
 *   - Retry up to `maxAttempts` (default 2) auto-retries; beyond that
 *     the task is marked `failed` and the job pauses for human input.
 *   - A `failed` (terminal retry) or `skipped` task cascades `blocked`
 *     to every pending descendant via `skipTask` logic; handled in
 *     job.js helpers. The runner calls `skipTask` to get the cascade.
 */

import {
  getJob,
  setJobStatus,
  setTaskStatus,
  skipTask,
} from './job.js';

// ── Topo-sort + task selection ──────────────────────────────────────

/**
 * Kahn-ish topological order. Cycle → throws (shouldn't happen; the
 * decomposer validates). We only consider tasks in `pending` or
 * `failed` (retry-eligible) state for the next-runnable pick; tasks
 * already `running`/`committed`/`reviewed`/`skipped`/`blocked` are
 * excluded.
 *
 * @param {import('./job.js').Task[]} tasks
 * @returns {string[]} task IDs in a valid execution order
 */
export function topoOrder(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  /** @type {Map<string, number>} */
  const inDegree = new Map();
  for (const t of tasks) inDegree.set(t.id, t.dependsOn.length);
  const queue = tasks.filter((t) => t.dependsOn.length === 0).map((t) => t.id);
  /** @type {string[]} */
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const t of tasks) {
      if (!t.dependsOn.includes(id)) continue;
      const d = inDegree.get(t.id) - 1;
      inDegree.set(t.id, d);
      if (d === 0) queue.push(t.id);
    }
  }
  if (order.length !== tasks.length) {
    throw new Error(
      `task graph has a cycle (reached ${order.length}/${tasks.length})`,
    );
  }
  // Silence unused warning + keep the byId check around for future
  // enrichment (e.g. priority tiebreak).
  void byId;
  return order;
}

/**
 * Pick the next task to run.
 *
 * The runner is serial-only ("Serial only. One task in flight at a time
 * per job." — see top-of-file invariants), so we iterate tasks in
 * **input order** (the order the decomposer emitted, which is also the
 * order the UI shows as `1, 2, 3, …`) and return the first one whose
 * `dependsOn` are all satisfied. This matches user mental model:
 * a numbered plan runs in numbered order.
 *
 * Why not topo order: Kahn's BFS interleaves chains when multiple
 * tasks share zero in-degree (e.g. independent feature A and feature
 * B both having no deps). For a serial runner that interleaving has
 * no throughput benefit and only makes execution order surprising
 * relative to the displayed numbering. Topo is still invoked once
 * here purely for its cycle-detection side effect.
 *
 * Selection rules:
 *   - `pending` with all deps in `reviewed`/`skipped` → return.
 *   - `failed` with `attempt < maxAttempts` (retry budget) → return.
 *   - Anything else → continue.
 *
 * @param {import('./job.js').Job} job
 * @param {number} maxAttempts
 * @returns {import('./job.js').Task | null}
 */
export function pickNextTask(job, maxAttempts) {
  topoOrder(job.tasks); // cycle-check side effect; throws on cycle
  const byId = new Map(job.tasks.map((t) => [t.id, t]));
  for (const t of job.tasks) {
    const depsSatisfied = t.dependsOn.every((depId) => {
      const d = byId.get(depId);
      return d && (d.status === 'reviewed' || d.status === 'skipped');
    });
    if (!depsSatisfied) continue;
    if (t.status === 'pending') return t;
    if (t.status === 'failed' && t.attempt < maxAttempts) return t;
  }
  return null;
}

// ── Runner ──────────────────────────────────────────────────────────

/**
 * @typedef {(task: import('./job.js').Task, ctx: { jobId: string, playgroundId: string })
 *   => Promise<{ commitSha: string, baseSha: string, diff?: string }>} TaskAdapter
 *
 * @typedef {(task: import('./job.js').Task, diff: string, description: string)
 *   => Promise<{ verdict: 'pass' | 'fail', notes: string }>} TaskReviewer
 */

/**
 * Run a job to completion (or pause / cancel). Returns the final Job.
 * Throws only on programmer errors (bad FSM transitions); adapter /
 * reviewer failures are caught and translated to state changes.
 *
 * @param {string} jobId
 * @param {{
 *   adapter: TaskAdapter,
 *   reviewer?: TaskReviewer,
 *   maxAttempts?: number,
 * }} opts
 * @returns {Promise<import('./job.js').Job>}
 */
export async function runJob(jobId, { adapter, reviewer, maxAttempts = 2 }) {
  if (typeof adapter !== 'function') throw new Error('adapter is required');
  const defaultReviewer = async () => ({ verdict: /** @type {'pass'} */ ('pass'), notes: 'stub review' });
  const review = reviewer ?? defaultReviewer;

  // Outer loop: one iteration per task (or until we bail to pause/qa).
  for (;;) {
    let job = getJob(jobId);
    if (!job) throw new Error(`job not found: ${jobId}`);

    // Exit conditions — user-driven or terminal.
    if (job.status === 'cancelled' || job.status === 'complete') return job;
    if (job.status === 'paused') return job;

    // After a prior iteration's review we might be in `reviewing`; bounce
    // back to `delegating` so the next pick lands.
    if (job.status === 'reviewing') {
      job = setJobStatus(jobId, 'delegating');
    }
    if (job.status !== 'delegating') {
      // Unexpected — the caller should only invoke runJob on a job
      // that's about to or already delegating. Pause for human.
      job = setJobStatus(jobId, 'paused', { pausedReason: `runner-entry-status-${job.status}` });
      return job;
    }

    const next = pickNextTask(job, maxAttempts);
    if (!next) {
      // No runnable tasks. Are we done, or stuck on blocked tasks?
      const unfinished = job.tasks.filter(
        (t) => t.status !== 'reviewed' && t.status !== 'skipped',
      );
      if (unfinished.length === 0) {
        // All tasks are in terminal states → bounce through reviewing
        // (required by FSM) and land in qa.
        job = setJobStatus(jobId, 'reviewing');
        job = setJobStatus(jobId, 'qa');
        return job;
      }
      // Blocked tasks / failed-beyond-maxAttempts remain. Pause for
      // human action (retry / skip / unblock).
      job = setJobStatus(jobId, 'paused', {
        pausedReason: `stuck: ${unfinished.length} task(s) need intervention`,
      });
      return job;
    }

    // Fire the task.
    const isRetry = next.status === 'failed';
    job = setTaskStatus(jobId, next.id, 'running', {
      attempt: isRetry ? next.attempt + 1 : next.attempt,
      currentTaskId: next.id,
    });
    // setTaskStatus only accepts Task fields; the job-level currentTaskId
    // we bake-in via a separate write:
    job.currentTaskId = next.id;

    /** @type {{ commitSha: string, baseSha: string, diff?: string } | null} */
    let adapterResult = null;
    /** @type {Error | null} */
    let adapterError = null;
    try {
      adapterResult = await adapter(
        { ...next, attempt: isRetry ? next.attempt + 1 : next.attempt },
        { jobId, playgroundId: job.playgroundId },
      );
    } catch (err) {
      adapterError = err instanceof Error ? err : new Error(String(err));
    }

    // Re-read after await — user may have cancelled mid-task.
    job = getJob(jobId);
    if (!job) throw new Error(`job vanished mid-run: ${jobId}`);
    if (job.status === 'cancelled') return job;

    if (adapterError || !adapterResult) {
      // Mark task failed. If retry budget remains, the outer loop picks
      // it up again via `pickNextTask` → auto-retry. If exhausted,
      // cascade `skipped` + blocked propagation and pause.
      const attemptsSoFar = (isRetry ? next.attempt + 1 : next.attempt) + 1;
      setTaskStatus(jobId, next.id, 'failed', { attempt: attemptsSoFar });
      if (attemptsSoFar >= maxAttempts) {
        skipTask(jobId, next.id); // cascades blocked
        setJobStatus(jobId, 'paused', {
          pausedReason: `task ${next.id} failed after ${attemptsSoFar} attempts: ${adapterError?.message ?? 'no result'}`,
        });
        return getJob(jobId);
      }
      // Retry budget available — loop continues; pickNextTask will
      // re-select this same task (status=failed, attempt < max).
      continue;
    }

    // Adapter success → committed, stamp commitSha + baseSha.
    setTaskStatus(jobId, next.id, 'committed', {
      commitSha: adapterResult.commitSha,
      baseSha: adapterResult.baseSha,
    });

    // Review phase.
    setJobStatus(jobId, 'reviewing');
    /** @type {{ verdict: 'pass' | 'fail', notes: string }} */
    let verdict;
    try {
      verdict = await review(
        /** @type {import('./job.js').Task} */ ({
          ...next,
          commitSha: adapterResult.commitSha,
          baseSha: adapterResult.baseSha,
          status: 'committed',
          attempt: isRetry ? next.attempt + 1 : next.attempt,
        }),
        adapterResult.diff ?? '',
        next.description,
      );
    } catch (err) {
      verdict = {
        verdict: 'fail',
        notes: `reviewer crashed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (verdict.verdict === 'pass') {
      setTaskStatus(jobId, next.id, 'reviewed', { review: verdict });
      // Loop continues: top of the for(;;) bounces reviewing → delegating.
    } else {
      // Review said `fail`. Flip committed → failed and pause for user.
      setTaskStatus(jobId, next.id, 'failed', { review: verdict });
      setJobStatus(jobId, 'paused', {
        pausedReason: `review-fail on task ${next.id}: ${verdict.notes}`,
      });
      return getJob(jobId);
    }
  }
}
