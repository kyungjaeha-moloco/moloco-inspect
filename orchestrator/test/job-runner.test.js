/**
 * Job runner smoke tests (J3a).
 *
 * Uses mock adapter + reviewer so we can assert orchestration behaviour
 * without touching Docker, Vite, or an LLM. Happy path + forced failure
 * path (§4 J6a/J6b).
 *
 * Run:  node --test test/job-runner.test.js
 *
 * State files land in `state/job/` as usual — the tests clean up after
 * themselves so re-runs start fresh.
 */

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  createJob,
  setJobTasks,
  approvePlan,
  getJob,
  resumeJob,
} from '../lib/job.js';
import { runJob, topoOrder, pickNextTask } from '../lib/job-runner.js';

const STATE_DIR = new URL('../state/job/', import.meta.url).pathname;
/** @type {string[]} */
const createdJobIds = [];

function removeJobFile(id) {
  const p = path.join(STATE_DIR, `${id}.json`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

afterEach(() => {
  for (const id of createdJobIds) removeJobFile(id);
  createdJobIds.length = 0;
});

// Helper — skip the decompose step and drop straight to `delegating`.
function seedJob(tasks) {
  const job = createJob({
    playgroundId: 'test-pg',
    prdText: 'test prd',
  });
  createdJobIds.push(job.id);
  setJobTasks(job.id, tasks);
  approvePlan(job.id);
  return job.id;
}

// ── topoOrder ───────────────────────────────────────────────────────

describe('topoOrder', () => {
  test('respects dependsOn', () => {
    const tasks = [
      { id: 'c', title: 'C', description: '', dependsOn: ['b'], status: 'pending', attempt: 0 },
      { id: 'a', title: 'A', description: '', dependsOn: [], status: 'pending', attempt: 0 },
      { id: 'b', title: 'B', description: '', dependsOn: ['a'], status: 'pending', attempt: 0 },
    ];
    assert.deepStrictEqual(topoOrder(tasks), ['a', 'b', 'c']);
  });

  test('throws on cycle', () => {
    const tasks = [
      { id: 'a', title: 'A', description: '', dependsOn: ['b'], status: 'pending', attempt: 0 },
      { id: 'b', title: 'B', description: '', dependsOn: ['a'], status: 'pending', attempt: 0 },
    ];
    assert.throws(() => topoOrder(tasks), /cycle/);
  });
});

// ── pickNextTask ────────────────────────────────────────────────────

describe('pickNextTask', () => {
  test('picks pending task whose deps are reviewed', () => {
    const job = {
      tasks: [
        { id: 'a', dependsOn: [], status: 'reviewed', attempt: 0 },
        { id: 'b', dependsOn: ['a'], status: 'pending', attempt: 0 },
        { id: 'c', dependsOn: ['b'], status: 'pending', attempt: 0 },
      ],
    };
    assert.strictEqual(pickNextTask(/** @type {any} */ (job), 2)?.id, 'b');
  });

  test('allows failed task with retry budget', () => {
    const job = {
      tasks: [
        { id: 'a', dependsOn: [], status: 'failed', attempt: 1 },
      ],
    };
    assert.strictEqual(pickNextTask(/** @type {any} */ (job), 2)?.id, 'a');
  });

  test('skips failed task when retry budget exhausted', () => {
    const job = {
      tasks: [
        { id: 'a', dependsOn: [], status: 'failed', attempt: 3 },
      ],
    };
    assert.strictEqual(pickNextTask(/** @type {any} */ (job), 2), null);
  });

  // Regression: when two chains share zero in-degree roots, the runner
  // used to interleave them via Kahn's BFS (picking the second-chain
  // root right after the first-chain root completed), which surfaced
  // to users as "task 1 done, why is task 9 running before task 2?".
  // Fix: iterate input order (the order tasks appear in the plan / UI),
  // not topo order — the serial runner gets no benefit from interleaving.
  test('picks input order when two chains share zero-indegree roots', () => {
    const job = {
      tasks: [
        { id: 't1', dependsOn: [], status: 'reviewed', attempt: 0 },
        { id: 't2', dependsOn: ['t1'], status: 'pending', attempt: 0 },
        { id: 't3', dependsOn: ['t2'], status: 'pending', attempt: 0 },
        { id: 't9', dependsOn: [], status: 'pending', attempt: 0 },
        { id: 't10', dependsOn: ['t9'], status: 'pending', attempt: 0 },
      ],
    };
    // After t1 reviewed, t2 should be next (input order) — not t9.
    assert.strictEqual(pickNextTask(/** @type {any} */ (job), 2)?.id, 't2');
  });

  test('still picks an independent root if it comes first in input order', () => {
    // Sanity: the fix doesn't hard-prefer the first chain. If the
    // independent task is listed BEFORE the chain, it should still
    // win — input order is the only criterion.
    const job = {
      tasks: [
        { id: 'indep', dependsOn: [], status: 'pending', attempt: 0 },
        { id: 'chainRoot', dependsOn: [], status: 'pending', attempt: 0 },
      ],
    };
    assert.strictEqual(pickNextTask(/** @type {any} */ (job), 2)?.id, 'indep');
  });
});

// ── runJob — happy path ─────────────────────────────────────────────

describe('runJob (happy path)', () => {
  test('runs two tasks to completion → qa', async () => {
    const jobId = seedJob([
      { id: 't1', title: 'A', description: 'do a', dependsOn: [] },
      { id: 't2', title: 'B', description: 'do b', dependsOn: ['t1'] },
    ]);
    /** @type {string[]} */
    const ran = [];
    const adapter = async (task) => {
      ran.push(task.id);
      return { commitSha: `sha-${task.id}`, baseSha: 'base', diff: 'fake diff' };
    };
    const job = await runJob(jobId, { adapter });
    assert.deepStrictEqual(ran, ['t1', 't2']);
    assert.strictEqual(job.status, 'qa');
    for (const t of job.tasks) {
      assert.strictEqual(t.status, 'reviewed');
      assert.match(t.commitSha, /^sha-/);
    }
  });
});

// ── runJob — forced failure path ────────────────────────────────────

describe('runJob (failure path)', () => {
  test('auto-retries then pauses + cascades blocked', async () => {
    const jobId = seedJob([
      { id: 't1', title: 'flaky', description: 'fail', dependsOn: [] },
      { id: 't2', title: 'downstream', description: 'depends on t1', dependsOn: ['t1'] },
    ]);
    const adapter = async () => {
      throw new Error('boom');
    };
    const job = await runJob(jobId, { adapter, maxAttempts: 2 });
    assert.strictEqual(job.status, 'paused');
    const t1 = job.tasks.find((t) => t.id === 't1');
    const t2 = job.tasks.find((t) => t.id === 't2');
    // After max attempts exhausted, t1 is auto-skipped so the cascade fires
    assert.strictEqual(t1.status, 'skipped');
    assert.strictEqual(t2.status, 'blocked');
    assert.ok(t1.attempt >= 2, `expected ≥2 attempts, got ${t1.attempt}`);
    assert.match(job.pausedReason ?? '', /failed/);
  });

  test('review fail pauses the job', async () => {
    const jobId = seedJob([
      { id: 't1', title: 'A', description: 'do a', dependsOn: [] },
    ]);
    const adapter = async () => ({
      commitSha: 'sha-t1',
      baseSha: 'base',
      diff: 'fake',
    });
    const reviewer = async () => ({
      verdict: /** @type {'fail'} */ ('fail'),
      notes: 'does not match description',
    });
    const job = await runJob(jobId, { adapter, reviewer });
    assert.strictEqual(job.status, 'paused');
    const t1 = job.tasks.find((t) => t.id === 't1');
    assert.strictEqual(t1.status, 'failed');
    assert.strictEqual(t1.review?.verdict, 'fail');
    assert.match(job.pausedReason ?? '', /review-fail/);
  });
});

// ── runJob — Slice B: research wiring ───────────────────────────────

describe('runJob (research wiring)', () => {
  test('adapter receives the research bundle as 3rd arg', async () => {
    const jobId = seedJob([
      { id: 't1', title: 'A', description: 'do a', dependsOn: [] },
    ]);
    const fakeBundle = {
      queries: [{ question: 'q', scope: 'repo', outcome: 'ok', answer: 'found', ms: 5, logPath: '/tmp/fake.log' }],
      totalMs: 10,
      builderQueryCount: 1,
      parallelism: 2,
    };
    /** @type {any[]} */
    const adapterCalls = [];
    const adapter = async (task, ctx, research) => {
      adapterCalls.push({ taskId: task.id, research });
      return { commitSha: `sha-${task.id}`, baseSha: 'base', diff: 'fake' };
    };
    const researchFn = async () => fakeBundle;
    await runJob(jobId, { adapter, researchFn });
    assert.equal(adapterCalls.length, 1);
    assert.deepEqual(adapterCalls[0].research, fakeBundle);
  });

  test('research bundle is persisted on the task record', async () => {
    const jobId = seedJob([
      { id: 't1', title: 'A', description: 'do a', dependsOn: [] },
    ]);
    const bundle = { queries: [], totalMs: 1, builderQueryCount: 0, parallelism: 2 };
    const adapter = async () => ({ commitSha: 'sha', baseSha: 'base', diff: 'd' });
    const researchFn = async () => bundle;
    await runJob(jobId, { adapter, researchFn });
    const fresh = getJob(jobId);
    const t1 = fresh.tasks.find((t) => t.id === 't1');
    assert.ok(t1.research, 'task.research should be set');
    assert.equal(t1.research.builderQueryCount, 0);
  });

  test('research is cached across coder-fail auto-retries (Slice E)', async () => {
    // Coder fails → runner auto-retries within the same runJob call.
    // The retry should reuse the cached research bundle — the failure
    // was on the coder, not the reviewer; research is still valid.
    const jobId = seedJob([
      { id: 't1', title: 'A', description: 'do a', dependsOn: [] },
    ]);
    let researchCallCount = 0;
    const researchFn = async () => {
      researchCallCount += 1;
      return { queries: [], totalMs: 1, builderQueryCount: 0, parallelism: 2 };
    };
    let adapterCallCount = 0;
    const adapter = async () => {
      adapterCallCount += 1;
      if (adapterCallCount === 1) throw new Error('coder boom — first attempt fails');
      return { commitSha: 'sha', baseSha: 'base', diff: 'd' };
    };
    await runJob(jobId, { adapter, researchFn, maxAttempts: 3 });
    assert.equal(adapterCallCount, 2, 'adapter should run twice (1 fail + 1 success)');
    assert.equal(researchCallCount, 1, `research should only run once across coder-fail retry; got ${researchCallCount}`);
  });

  test('research is re-run after a review-fail retry (Slice E)', async () => {
    // Reviewer fails → runJob pauses. After the user resumes, the next
    // runJob enters with task.review.verdict='fail'. Slice E policy
    // says: re-run research because the reviewer feedback may have
    // moved the target; stale research is exactly what put us in
    // the hole.
    const jobId = seedJob([
      { id: 't1', title: 'A', description: 'do a', dependsOn: [] },
    ]);
    let researchCallCount = 0;
    const researchFn = async () => {
      researchCallCount += 1;
      return { queries: [], totalMs: 1, builderQueryCount: 0, parallelism: 2, callId: researchCallCount };
    };
    let reviewCount = 0;
    const reviewer = async () => {
      reviewCount += 1;
      return reviewCount === 1
        ? { verdict: /** @type {'fail'} */ ('fail'), notes: 'wrong pattern, redo' }
        : { verdict: /** @type {'pass'} */ ('pass'), notes: 'ok' };
    };
    const adapter = async () => ({ commitSha: 'sha', baseSha: 'base', diff: 'd' });

    // First run: reviewer fails → job pauses.
    const paused = await runJob(jobId, { adapter, reviewer, researchFn });
    assert.equal(paused.status, 'paused', 'job should be paused after review-fail');
    assert.equal(researchCallCount, 1, 'research should have run once on first attempt');

    // Resume the job; the task is still status='failed' with review.verdict='fail'.
    resumeJob(jobId, 'delegating');
    await runJob(jobId, { adapter, reviewer, researchFn, maxAttempts: 3 });

    // Slice E: research re-ran because review.verdict === 'fail'.
    assert.equal(researchCallCount, 2, `expected research re-run after review-fail; got ${researchCallCount}`);
    const t1 = getJob(jobId).tasks.find((t) => t.id === 't1');
    assert.ok(t1.research, 'fresh research bundle should be on the task');
    assert.equal(t1.research.callId, 2, 'task.research should be the *new* bundle from the resume run');
  });

  test('researchFn throwing is swallowed — adapter still runs with null bundle', async () => {
    const jobId = seedJob([
      { id: 't1', title: 'A', description: 'do a', dependsOn: [] },
    ]);
    const researchFn = async () => { throw new Error('research blew up'); };
    /** @type {any[]} */
    const adapterCalls = [];
    const adapter = async (task, ctx, research) => {
      adapterCalls.push(research);
      return { commitSha: 'sha', baseSha: 'base', diff: 'd' };
    };
    const job = await runJob(jobId, { adapter, researchFn });
    assert.equal(job.status, 'qa', 'task should still complete despite research throwing');
    assert.equal(adapterCalls.length, 1);
    assert.equal(adapterCalls[0], null, 'adapter should receive null when research throws');
  });

  test('researchFn=null (explicit disable) skips research; adapter gets undefined as 3rd arg', async () => {
    const jobId = seedJob([
      { id: 't1', title: 'A', description: 'do a', dependsOn: [] },
    ]);
    /** @type {any[]} */
    const adapterCalls = [];
    const adapter = async (task, ctx, research) => {
      adapterCalls.push(research);
      return { commitSha: 'sha', baseSha: 'base', diff: 'd' };
    };
    await runJob(jobId, { adapter, researchFn: null });
    assert.equal(adapterCalls.length, 1);
    // No bundle on the task → adapter sees `null` (the back-compat shape
    // documented in the plan §Slice C: "default to `null`").
    assert.equal(adapterCalls[0], null);
  });
});
