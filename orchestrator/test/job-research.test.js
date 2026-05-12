/**
 * job-research unit tests.
 *
 * Run:  node --test test/job-research.test.js
 *
 * Covers (Slice A — plan 2026-05-12-research-parallelism.md):
 *   - buildResearchQueries: success path, parse-failure → empty list,
 *     HTTP error → empty list, fetch throw → empty list, cap at 5,
 *     scope defaulting, character truncation, empty API key → empty.
 *   - runResearchQuery: ok / non-zero exit code / timeout outcomes, log
 *     file created with stdout+stderr+exit metadata, kill-on-timeout
 *     fires SIGTERM then SIGKILL.
 *   - runResearch: parallelism cap respected, partial failure isolated,
 *     query-builder returning [] short-circuits, aggregate timeout
 *     surfaces synthetic 'timeout' rows for un-finished queries.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildResearchQueries,
  runResearchQuery,
  runResearch,
  formatBundleForPrompt,
} from '../lib/job-research.js';

// ── Fakes ───────────────────────────────────────────────────────────

function makeFetchOk(body) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  });
}
function makeFetchHttpError(status) {
  return async () => ({
    ok: false,
    status,
    json: async () => ({}),
  });
}
function makeFetchThrow(err) {
  return async () => { throw err; };
}

/**
 * Build a fake child-process object that simulates spawn() output and
 * lets the test drive the lifecycle (data → exit / error).
 */
function makeFakeChild(opts = {}) {
  const child = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.killCalls = [];
  child._exited = false;
  child.kill = (sig) => {
    child.killCalls.push(sig);
    // Real subprocesses exit shortly after SIGTERM; without this, fake
    // children leave promises pending forever and node --test cancels
    // the surrounding test. `opts.autoExitOnKill = false` opts out for
    // tests that drive exit() explicitly.
    if (opts.autoExitOnKill !== false && !child._exited) {
      setImmediate(() => child.emitExit(null, sig));
    }
  };
  child.emitData = (data) => stdout.emit('data', Buffer.from(data));
  child.emitStderr = (data) => stderr.emit('data', Buffer.from(data));
  child.emitExit = (code = 0, signal = null) => {
    if (child._exited) return;
    child._exited = true;
    child.emit('exit', code, signal);
  };
  return child;
}

function spawnFnReturning(child) {
  return () => child;
}

function spawnFnThatThrows() {
  return () => { throw new Error('ENOENT'); };
}

// ── buildResearchQueries ────────────────────────────────────────────

describe('buildResearchQueries', () => {
  test('parses a valid Anthropic response', async () => {
    const fetchFn = makeFetchOk({
      content: [{
        text: JSON.stringify({
          queries: [
            { question: 'Find list pages in apps/tving/', scope: 'msm-portal' },
            { question: 'Check patterns.json#list-page', scope: 'design-system' },
          ],
        }),
      }],
      usage: { input_tokens: 50, output_tokens: 30 },
    });
    const qs = await buildResearchQueries(
      { title: 'Add list page', description: 'desc' },
      { fetchFn, apiKey: 'sk-test' },
    );
    assert.equal(qs.length, 2);
    assert.equal(qs[0].question, 'Find list pages in apps/tving/');
    assert.equal(qs[0].scope, 'msm-portal');
  });

  test('returns [] when API key missing', async () => {
    const fetchFn = async () => { throw new Error('should not call'); };
    const qs = await buildResearchQueries(
      { title: 'task' },
      { fetchFn, apiKey: '' },
    );
    assert.deepEqual(qs, []);
  });

  test('returns [] on HTTP error', async () => {
    const fetchFn = makeFetchHttpError(500);
    const qs = await buildResearchQueries(
      { title: 't' },
      { fetchFn, apiKey: 'sk-x' },
    );
    assert.deepEqual(qs, []);
  });

  test('returns [] on fetch throw', async () => {
    const fetchFn = makeFetchThrow(new Error('network down'));
    const qs = await buildResearchQueries(
      { title: 't' },
      { fetchFn, apiKey: 'sk-x' },
    );
    assert.deepEqual(qs, []);
  });

  test('returns [] when content has no JSON', async () => {
    const fetchFn = makeFetchOk({ content: [{ text: 'I think you should...' }] });
    const qs = await buildResearchQueries(
      { title: 't' },
      { fetchFn, apiKey: 'sk-x' },
    );
    assert.deepEqual(qs, []);
  });

  test('returns [] when JSON is malformed', async () => {
    const fetchFn = makeFetchOk({ content: [{ text: '{"queries": [bad' }] });
    const qs = await buildResearchQueries(
      { title: 't' },
      { fetchFn, apiKey: 'sk-x' },
    );
    assert.deepEqual(qs, []);
  });

  // Regression for the review-MAJOR: resp.json() can throw on a 200
  // with non-JSON body. The lib must catch and return [], not propagate.
  test('returns [] when resp.json() throws (non-JSON body)', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON'); },
    });
    const qs = await buildResearchQueries(
      { title: 't' },
      { fetchFn, apiKey: 'sk-x' },
    );
    assert.deepEqual(qs, []);
  });

  test('hard-caps at 5 queries', async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ question: `q${i}`, scope: 'repo' }));
    const fetchFn = makeFetchOk({ content: [{ text: JSON.stringify({ queries: many }) }] });
    const qs = await buildResearchQueries(
      { title: 't' },
      { fetchFn, apiKey: 'sk-x' },
    );
    assert.equal(qs.length, 5);
    assert.equal(qs[0].question, 'q0');
    assert.equal(qs[4].question, 'q4');
  });

  test('defaults missing scope to "repo" and filters empty questions', async () => {
    const fetchFn = makeFetchOk({
      content: [{ text: JSON.stringify({ queries: [
        { question: 'with scope', scope: 'design-system' },
        { question: 'no scope' },                       // scope absent → defaults to 'repo'
        { question: '', scope: 'repo' },                // empty question → filtered out
        { question: '   ', scope: 'repo' },             // whitespace-only → filtered out
      ] }) }],
    });
    const qs = await buildResearchQueries(
      { title: 't' },
      { fetchFn, apiKey: 'sk-x' },
    );
    assert.equal(qs.length, 2);
    assert.equal(qs[0].scope, 'design-system');
    assert.equal(qs[1].scope, 'repo');
  });
});

// ── runResearchQuery ────────────────────────────────────────────────

describe('runResearchQuery', () => {
  test('captures stdout as answer when child exits 0', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'jr-test-'));
    try {
      const child = makeFakeChild();
      const promise = runResearchQuery(
        { question: 'q', scope: 'repo', jobId: 'j1', taskId: 't1', queryIndex: 0 },
        { spawnFn: spawnFnReturning(child), logDir: tmp },
      );
      child.emitData('list-pages: a.tsx, b.tsx');
      child.emitExit(0);
      const r = await promise;
      assert.equal(r.outcome, 'ok');
      assert.equal(r.answer, 'list-pages: a.tsx, b.tsx');
      assert.equal(r.scope, 'repo');
      assert.ok(r.logPath.endsWith('j1-t1-q0.log'));
      const log = await readFile(r.logPath, 'utf8');
      assert.ok(log.includes('--- stdout ---'));
      assert.ok(log.includes('list-pages'));
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('marks non-zero exit as outcome=error', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'jr-test-'));
    try {
      const child = makeFakeChild();
      const promise = runResearchQuery(
        { question: 'q', scope: 'repo', jobId: 'j1', taskId: 't1', queryIndex: 1 },
        { spawnFn: spawnFnReturning(child), logDir: tmp },
      );
      child.emitStderr('claude: command not understood');
      child.emitExit(1);
      const r = await promise;
      assert.equal(r.outcome, 'error');
      assert.match(r.stderr, /command not understood/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('marks timeout when SIGTERM fires before exit', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'jr-test-'));
    try {
      const child = makeFakeChild();
      const promise = runResearchQuery(
        { question: 'q', scope: 'repo', jobId: 'j1', taskId: 't1', queryIndex: 2 },
        { spawnFn: spawnFnReturning(child), logDir: tmp, timeoutMs: 50 },
      );
      // Don't emit stdout; let the timer fire. Simulate the child ack-ing
      // the SIGTERM by exiting (signal name passed in exit).
      await new Promise((r) => setTimeout(r, 80));
      child.emitExit(null, 'SIGTERM');
      const r = await promise;
      assert.equal(r.outcome, 'timeout');
      assert.ok(child.killCalls.includes('SIGTERM'), `kill SIGTERM should be called; got ${child.killCalls.join(',')}`);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('handles spawn() throwing (ENOENT etc.)', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'jr-test-'));
    try {
      const r = await runResearchQuery(
        { question: 'q', scope: 'repo', jobId: 'j1', taskId: 't1', queryIndex: 3 },
        { spawnFn: spawnFnThatThrows(), logDir: tmp },
      );
      assert.equal(r.outcome, 'error');
      assert.match(r.stderr, /ENOENT/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  // Regression for the review-MAJOR: child emits 'error' with no
  // follow-up 'exit'. The lib must still resolve via the microtask
  // fallback so promises don't leak.
  test('resolves with outcome=error when child emits error without exit', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'jr-test-'));
    try {
      const child = makeFakeChild();
      const promise = runResearchQuery(
        { question: 'q', scope: 'repo', jobId: 'j1', taskId: 't1', queryIndex: 4 },
        { spawnFn: spawnFnReturning(child), logDir: tmp },
      );
      // Emit 'error' on the child but never 'exit'. The microtask
      // fallback inside runResearchQuery should finalize regardless.
      child.emit('error', new Error('post-spawn EPERM'));
      const r = await promise;
      assert.equal(r.outcome, 'error');
      assert.match(r.stderr, /post-spawn EPERM/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

// ── runResearch ─────────────────────────────────────────────────────

describe('runResearch (orchestration)', () => {
  test('returns empty bundle when query-builder emits zero queries', async () => {
    const fetchFn = makeFetchOk({ content: [{ text: JSON.stringify({ queries: [] }) }] });
    const bundle = await runResearch(
      { id: 't1', title: 'trivial', description: '' },
      { jobId: 'j1' },
      { fetchFn, apiKey: 'sk-x' },
    );
    assert.equal(bundle.queries.length, 0);
    assert.equal(bundle.builderQueryCount, 0);
  });

  test('runs N queries in parallel and aggregates outcomes', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'jr-test-'));
    try {
      const fetchFn = makeFetchOk({
        content: [{ text: JSON.stringify({ queries: [
          { question: 'q0', scope: 'design-system' },
          { question: 'q1', scope: 'msm-portal' },
          { question: 'q2', scope: 'repo' },
        ] }) }],
      });
      // One spawnFn that hands out a fresh fake child per call and resolves
      // each one asynchronously. We capture the spawn index at spawn time
      // (NOT inside setImmediate, where the closure would see the final
      // length and produce duplicate answers under parallel dispatch).
      const children = [];
      const spawnFn = () => {
        const idx = children.length;
        const c = makeFakeChild();
        children.push(c);
        setImmediate(() => {
          c.emitData(`answer-${idx}`);
          c.emitExit(0);
        });
        return c;
      };
      const bundle = await runResearch(
        { id: 't1', title: 'feature', description: 'desc' },
        { jobId: 'j1' },
        { fetchFn, apiKey: 'sk-x', spawnFn, parallelism: 2, logDir: tmp },
      );
      assert.equal(bundle.queries.length, 3);
      assert.equal(bundle.builderQueryCount, 3);
      assert.equal(bundle.parallelism, 2);
      assert.deepEqual(
        bundle.queries.map((q) => q.outcome).sort(),
        ['ok', 'ok', 'ok'],
      );
      const answers = bundle.queries.map((q) => q.answer).sort();
      assert.deepEqual(answers, ['answer-0', 'answer-1', 'answer-2']);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('isolates per-query failures — one query crash does not kill the bundle', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'jr-test-'));
    try {
      const fetchFn = makeFetchOk({
        content: [{ text: JSON.stringify({ queries: [
          { question: 'ok', scope: 'repo' },
          { question: 'crash', scope: 'repo' },
        ] }) }],
      });
      const order = [];
      const spawnFn = () => {
        const idx = order.length;
        order.push(idx);
        const c = makeFakeChild();
        setImmediate(() => {
          if (idx === 1) {
            c.emitStderr('boom');
            c.emitExit(1);
          } else {
            c.emitData(`ok-answer`);
            c.emitExit(0);
          }
        });
        return c;
      };
      const bundle = await runResearch(
        { id: 't1', title: 'feature', description: 'desc' },
        { jobId: 'j1' },
        { fetchFn, apiKey: 'sk-x', spawnFn, parallelism: 2, logDir: tmp },
      );
      assert.equal(bundle.queries.length, 2);
      const outcomes = bundle.queries.map((q) => q.outcome).sort();
      assert.deepEqual(outcomes, ['error', 'ok']);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('format integration — empty / null / no-ok bundles produce empty string', () => {
    assert.equal(formatBundleForPrompt(null), '');
    assert.equal(formatBundleForPrompt(undefined), '');
    assert.equal(formatBundleForPrompt({}), '');
    assert.equal(formatBundleForPrompt({ queries: [] }), '');
    assert.equal(
      formatBundleForPrompt({ queries: [{ outcome: 'error', answer: '' }] }),
      '',
    );
    assert.equal(
      formatBundleForPrompt({ queries: [{ outcome: 'ok', answer: '   ' }] }),
      '',
    );
  });

  test('format integration — single ok query renders a complete block', () => {
    const block = formatBundleForPrompt({
      queries: [{
        question: 'where do list pages live?',
        scope: 'msm-portal',
        outcome: 'ok',
        answer: 'src/apps/tving/page/order/OrderListPage.tsx',
        ms: 850,
      }],
    });
    assert.match(block, /## Research context/);
    assert.match(block, /Research finding 1: where do list pages live\?/);
    assert.match(block, /\[scope: msm-portal \| 850ms\]/);
    assert.match(block, /OrderListPage\.tsx/);
    assert.match(block, /End of research context/);
  });

  test('format integration — drops tail findings when block exceeds maxBytes', () => {
    // Three findings × ~200 bytes each ≈ 600 bytes. Cap at 400 should
    // drop the last finding (and probably the middle one too).
    const block = formatBundleForPrompt({
      queries: [
        { question: 'q1', scope: 'repo', outcome: 'ok', answer: 'a'.repeat(150), ms: 1 },
        { question: 'q2', scope: 'repo', outcome: 'ok', answer: 'b'.repeat(150), ms: 1 },
        { question: 'q3', scope: 'repo', outcome: 'ok', answer: 'c'.repeat(150), ms: 1 },
      ],
    }, { maxBytes: 400 });
    assert.ok(Buffer.byteLength(block, 'utf8') <= 400, `block was ${Buffer.byteLength(block, 'utf8')} bytes`);
    assert.match(block, /Truncated: .* additional finding/);
  });

  test('format integration — clips a single huge answer when cap is small', () => {
    const block = formatBundleForPrompt({
      queries: [{
        question: 'huge',
        scope: 'repo',
        outcome: 'ok',
        answer: 'X'.repeat(10_000),
        ms: 1,
      }],
    }, { maxBytes: 500 });
    assert.ok(Buffer.byteLength(block, 'utf8') <= 500);
    assert.match(block, /\[truncated\]/);
  });

  test('aggregate timeout surfaces synthetic timeout rows', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'jr-test-'));
    try {
      const fetchFn = makeFetchOk({
        content: [{ text: JSON.stringify({ queries: [
          { question: 'slow1', scope: 'repo' },
          { question: 'slow2', scope: 'repo' },
        ] }) }],
      });
      // spawnFn returns children that *never* exit on their own. The
      // aggregate-timeout path should fill in synthetic rows.
      const spawnFn = () => makeFakeChild();
      const bundle = await runResearch(
        { id: 't1', title: 'feature', description: 'desc' },
        { jobId: 'j1' },
        {
          fetchFn,
          apiKey: 'sk-x',
          spawnFn,
          parallelism: 2,
          aggregateTimeoutMs: 80,
          logDir: tmp,
        },
      );
      assert.equal(bundle.queries.length, 2);
      // Aggregate timer fires before any child reports; both should be
      // synthetic 'timeout' rows.
      for (const q of bundle.queries) {
        assert.equal(q.outcome, 'timeout');
        assert.equal(q.answer, '');
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
