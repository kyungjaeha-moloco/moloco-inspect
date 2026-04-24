/**
 * Unit tests for the Job / Task state machine (J0).
 *
 * Pure FSM tests — no Docker, no HTTP, no orchestrator. Safe to run in
 * CI or as a pre-commit gate:
 *
 *   node --test test/job-state.test.js
 *
 * Table-driven: every (from, to) pair is enumerated. Valid pairs must
 * transition cleanly; invalid pairs must throw InvalidTransitionError.
 * This is the FSM's acceptance contract — editing JOB_TRANSITIONS or
 * TASK_TRANSITIONS without updating this file is what we want to catch.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  JOB_TRANSITIONS,
  TASK_TRANSITIONS,
  InvalidTransitionError,
  canTransitionJob,
  canTransitionTask,
  transitionJob,
  transitionTask,
  jobStatuses,
  taskStatuses,
  isTerminal,
} from '../lib/job-state.js';

// ── Job FSM ──────────────────────────────────────────────────────────

describe('job FSM', () => {
  test('every declared transition is accepted', () => {
    for (const from of jobStatuses()) {
      for (const to of JOB_TRANSITIONS[from]) {
        assert.strictEqual(
          canTransitionJob(from, to),
          true,
          `expected ${from} → ${to} to be valid`,
        );
        assert.strictEqual(transitionJob(from, to), to);
      }
    }
  });

  test('every undeclared transition is rejected', () => {
    const all = jobStatuses();
    for (const from of all) {
      for (const to of all) {
        if (JOB_TRANSITIONS[from].includes(to)) continue;
        assert.strictEqual(canTransitionJob(from, to), false);
        assert.throws(() => transitionJob(from, to), InvalidTransitionError);
      }
    }
  });

  test('unknown source state is rejected (not silently accepted)', () => {
    // @ts-expect-error — intentional bad input
    assert.strictEqual(canTransitionJob('bogus', 'planning'), false);
    assert.throws(
      // @ts-expect-error — intentional bad input
      () => transitionJob('bogus', 'planning'),
      InvalidTransitionError,
    );
  });

  test('complete + cancelled are terminal', () => {
    assert.strictEqual(isTerminal('complete', 'job'), true);
    assert.strictEqual(isTerminal('cancelled', 'job'), true);
    assert.strictEqual(JOB_TRANSITIONS.complete.length, 0);
    assert.strictEqual(JOB_TRANSITIONS.cancelled.length, 0);
  });

  test('paused is a recovery hub — reaches every non-terminal stage', () => {
    const nonTerminal = jobStatuses().filter((s) => !isTerminal(s, 'job'));
    for (const target of nonTerminal) {
      if (target === 'paused') continue;
      assert.strictEqual(
        canTransitionJob('paused', target),
        true,
        `paused must reach ${target} for resume to work`,
      );
    }
  });

  test('cancelled is reachable from every non-terminal stage', () => {
    const nonTerminal = jobStatuses().filter((s) => !isTerminal(s, 'job'));
    for (const from of nonTerminal) {
      assert.strictEqual(
        canTransitionJob(from, 'cancelled'),
        true,
        `${from} must be cancellable`,
      );
    }
  });

  test('no self-loops declared (would hide bugs)', () => {
    for (const from of jobStatuses()) {
      assert.ok(
        !JOB_TRANSITIONS[from].includes(from),
        `job FSM should not declare ${from} → ${from}`,
      );
    }
  });
});

// ── Task FSM ─────────────────────────────────────────────────────────

describe('task FSM', () => {
  test('every declared transition is accepted', () => {
    for (const from of taskStatuses()) {
      for (const to of TASK_TRANSITIONS[from]) {
        assert.strictEqual(
          canTransitionTask(from, to),
          true,
          `expected ${from} → ${to} to be valid`,
        );
        assert.strictEqual(transitionTask(from, to), to);
      }
    }
  });

  test('every undeclared transition is rejected', () => {
    const all = taskStatuses();
    for (const from of all) {
      for (const to of all) {
        if (TASK_TRANSITIONS[from].includes(to)) continue;
        assert.strictEqual(canTransitionTask(from, to), false);
        assert.throws(() => transitionTask(from, to), InvalidTransitionError);
      }
    }
  });

  test('reviewed + skipped are terminal', () => {
    assert.strictEqual(isTerminal('reviewed', 'task'), true);
    assert.strictEqual(isTerminal('skipped', 'task'), true);
  });

  test('failed is retryable → running, or user-skippable', () => {
    assert.strictEqual(canTransitionTask('failed', 'running'), true);
    assert.strictEqual(canTransitionTask('failed', 'skipped'), true);
  });

  test('blocked is reversible (unblock → pending) or skippable', () => {
    assert.strictEqual(canTransitionTask('blocked', 'pending'), true);
    assert.strictEqual(canTransitionTask('blocked', 'skipped'), true);
  });

  test('committed can be re-flagged failed by review', () => {
    // A committed task whose review verdict is `fail` and the user
    // chose `retry` needs a route back to `failed` so the retry path
    // kicks in. Without this, the state machine would leave committed
    // tasks stuck if review disagrees.
    assert.strictEqual(canTransitionTask('committed', 'failed'), true);
  });

  test('no self-loops declared', () => {
    for (const from of taskStatuses()) {
      assert.ok(
        !TASK_TRANSITIONS[from].includes(from),
        `task FSM should not declare ${from} → ${from}`,
      );
    }
  });
});

// ── Error shape ──────────────────────────────────────────────────────

describe('InvalidTransitionError', () => {
  test('carries kind / from / to fields for telemetry', () => {
    try {
      transitionJob('complete', 'planning');
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(err instanceof InvalidTransitionError);
      assert.strictEqual(err.kind, 'job');
      assert.strictEqual(err.from, 'complete');
      assert.strictEqual(err.to, 'planning');
      assert.match(err.message, /complete → planning/);
    }
  });
});
