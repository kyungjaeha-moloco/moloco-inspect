/**
 * molly-lifecycle unit tests.
 *
 * Run:  node --test test/molly-lifecycle.test.js
 *
 * Covers:
 *   - Regression: Korean keyword matching in ACTION_KEYWORDS still works
 *     (these match user input — they must NOT be removed).
 *   - Invariants: all user-facing response templates contain no Korean codepoints.
 *   - Positive: response templates include expected English action words.
 *
 * Korean code comments stay. Korean strings inside ACTION_KEYWORDS that match
 * user input stay. Only user-facing output strings must be English.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTION_KEYWORDS,
  SURFACE_INSTRUCTIONS,
  composeLifecycleReply,
  _actionLabel,
} from '../lib/molly-lifecycle.js';

// Korean Hangul (Jamo + syllables) — used to assert output is English.
const HANGUL_RE = /[ㄱ-㆏가-힯]/;

// ---------------------------------------------------------------------------
// Regression: ACTION_KEYWORDS Korean tokens are preserved
// ---------------------------------------------------------------------------
describe('ACTION_KEYWORDS — Korean input tokens preserved (regression)', () => {
  test('cancel keywords include "취소"', () => {
    assert.ok(ACTION_KEYWORDS.cancel.includes('취소'), 'cancel must include 취소');
  });

  test('cancel keywords include "캔슬"', () => {
    assert.ok(ACTION_KEYWORDS.cancel.includes('캔슬'), 'cancel must include 캔슬');
  });

  test('promote keywords include "프로모트"', () => {
    assert.ok(ACTION_KEYWORDS.promote.includes('프로모트'), 'promote must include 프로모트');
  });

  test('promote keywords include "머지"', () => {
    assert.ok(ACTION_KEYWORDS.promote.includes('머지'), 'promote must include 머지');
  });

  test('retry keywords include "다시 시도"', () => {
    assert.ok(ACTION_KEYWORDS.retry.includes('다시 시도'), 'retry must include 다시 시도');
  });

  test('retry keywords include "재시도"', () => {
    assert.ok(ACTION_KEYWORDS.retry.includes('재시도'), 'retry must include 재시도');
  });

  test('retry keywords include "리트라이"', () => {
    assert.ok(ACTION_KEYWORDS.retry.includes('리트라이'), 'retry must include 리트라이');
  });

  test('restart keywords include "재시작"', () => {
    assert.ok(ACTION_KEYWORDS.restart.includes('재시작'), 'restart must include 재시작');
  });

  test('restart keywords include "복구"', () => {
    assert.ok(ACTION_KEYWORDS.restart.includes('복구'), 'restart must include 복구');
  });

  test('rollback keywords include "롤백"', () => {
    assert.ok(ACTION_KEYWORDS.rollback.includes('롤백'), 'rollback must include 롤백');
  });
});

// ---------------------------------------------------------------------------
// Invariant: SURFACE_INSTRUCTIONS contain no Korean
// ---------------------------------------------------------------------------
describe('SURFACE_INSTRUCTIONS — no Korean in surface instruction strings', () => {
  for (const [surface, { primary, secondary }] of Object.entries(SURFACE_INSTRUCTIONS)) {
    test(`${surface}.primary has no Korean`, () => {
      assert.ok(!HANGUL_RE.test(primary), `${surface}.primary contains Korean: "${primary}"`);
    });
    test(`${surface}.secondary has no Korean`, () => {
      assert.ok(!HANGUL_RE.test(secondary), `${surface}.secondary contains Korean: "${secondary}"`);
    });
  }
});

// ---------------------------------------------------------------------------
// Invariant: _actionLabel returns no Korean
// ---------------------------------------------------------------------------
describe('_actionLabel — no Korean output', () => {
  const actions = ['cancel', 'promote', 'retry', 'restart', 'rollback', 'unknown'];
  for (const action of actions) {
    test(`_actionLabel("${action}") has no Korean`, () => {
      const label = _actionLabel(action);
      assert.ok(!HANGUL_RE.test(label), `_actionLabel("${action}") returned Korean: "${label}"`);
    });
  }
});

// ---------------------------------------------------------------------------
// Positive: _actionLabel returns expected English action words
// ---------------------------------------------------------------------------
describe('_actionLabel — expected English action words', () => {
  test('cancel → contains "cancel"', () => {
    assert.match(_actionLabel('cancel').toLowerCase(), /cancel/);
  });
  test('promote → contains "promote"', () => {
    assert.match(_actionLabel('promote').toLowerCase(), /promot/);
  });
  test('retry → contains "retry" or "retrying"', () => {
    assert.match(_actionLabel('retry').toLowerCase(), /retr/);
  });
  test('restart → contains "restart"', () => {
    assert.match(_actionLabel('restart').toLowerCase(), /restart/);
  });
  test('rollback → contains "rollback"', () => {
    assert.match(_actionLabel('rollback').toLowerCase(), /rollback/);
  });
});

// ---------------------------------------------------------------------------
// Invariant: composeLifecycleReply output contains no Korean
// ---------------------------------------------------------------------------
describe('composeLifecycleReply — no Korean in output', () => {
  const fakeJobs = [
    { id: 'abcd1234efgh', status: 'active', prdText: 'Add sidebar', targetRoute: '/tas' },
    { id: 'beef5678cafe', status: 'paused', prdText: 'Fix header', targetRoute: '/home' },
  ];

  const surfaces = ['slack', 'chrome-ext', 'playground', 'unknown'];

  for (const surface of surfaces) {
    test(`cancel on surface "${surface}" with matched job — no Korean`, async () => {
      const ctx = { surface, listJobs: () => fakeJobs };
      const reply = await composeLifecycleReply('cancel job abcd1234', ctx);
      assert.ok(!HANGUL_RE.test(reply), `Reply contains Korean: "${reply}"`);
    });

    test(`cancel on surface "${surface}" with no jobs — no Korean`, async () => {
      const ctx = { surface, listJobs: () => [] };
      const reply = await composeLifecycleReply('cancel', ctx);
      assert.ok(!HANGUL_RE.test(reply), `Reply contains Korean: "${reply}"`);
    });

    test(`cancel on surface "${surface}" with multiple jobs (ambiguous) — no Korean`, async () => {
      const ctx = { surface, listJobs: () => fakeJobs };
      const reply = await composeLifecycleReply('cancel', ctx);
      assert.ok(!HANGUL_RE.test(reply), `Reply contains Korean: "${reply}"`);
    });
  }

  test('Korean input "취소" triggers cancel path — no Korean in output', async () => {
    const ctx = { surface: 'slack', listJobs: () => fakeJobs };
    const reply = await composeLifecycleReply('이 잡 취소해줘', ctx);
    assert.ok(!HANGUL_RE.test(reply), `Reply contains Korean: "${reply}"`);
  });

  test('Korean input "재시도" triggers retry path — no Korean in output', async () => {
    const ctx = { surface: 'playground', listJobs: () => fakeJobs };
    const reply = await composeLifecycleReply('재시도해줘 abcd1234', ctx);
    assert.ok(!HANGUL_RE.test(reply), `Reply contains Korean: "${reply}"`);
  });
});

// ---------------------------------------------------------------------------
// Positive: composeLifecycleReply output contains expected English keywords
// ---------------------------------------------------------------------------
describe('composeLifecycleReply — expected English keywords in output', () => {
  const fakeJobs = [
    { id: 'abcd1234efgh', status: 'active', prdText: 'Add sidebar', targetRoute: '/tas' },
  ];

  test('cancel with matched job — output contains "cancel" or "Cancel"', async () => {
    const ctx = { surface: 'slack', listJobs: () => fakeJobs };
    const reply = await composeLifecycleReply('cancel job abcd1234', ctx);
    assert.match(reply.toLowerCase(), /cancel/);
  });

  test('no jobs found — output mentions "job" or "Jobs"', async () => {
    const ctx = { surface: 'slack', listJobs: () => [] };
    const reply = await composeLifecycleReply('cancel', ctx);
    assert.match(reply.toLowerCase(), /job/);
  });

  test('ambiguous — output asks user to clarify (contains job id prefix)', async () => {
    const jobs = [
      { id: 'abcd1234efgh', status: 'active', prdText: 'Add sidebar', targetRoute: '/tas' },
      { id: 'beef5678cafe', status: 'active', prdText: 'Fix header', targetRoute: '/home' },
    ];
    const ctx = { surface: 'slack', listJobs: () => jobs };
    const reply = await composeLifecycleReply('cancel', ctx);
    // Should contain partial job IDs (first 8 chars)
    assert.match(reply, /abcd1234|beef5678/);
  });
});
