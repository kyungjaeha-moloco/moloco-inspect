/**
 * molly-plan-emitter unit tests.
 *
 * Run:  node --test test/molly-plan-emitter.test.js
 *
 * Covers:
 *   - English-migration invariants: SYSTEM_PROMPT has no Korean instruction markers.
 *   - Positive: SYSTEM_PROMPT contains English guidance keywords.
 *   - Regression: grounding rule keywords (patterns.json, components.json, visual_constraints)
 *     are still present after migration.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { SYSTEM_PROMPT } from '../lib/molly-plan-emitter.js';

describe('English-migration invariants — SYSTEM_PROMPT has no Korean instruction markers', () => {
  test('SYSTEM_PROMPT contains no "in Korean>" substring', () => {
    assert.equal(
      SYSTEM_PROMPT.includes('in Korean>'),
      false,
      'SYSTEM_PROMPT must not contain "in Korean>"',
    );
  });

  test('SYSTEM_PROMPT contains no "Korean —" substring', () => {
    assert.equal(
      SYSTEM_PROMPT.includes('Korean —'),
      false,
      'SYSTEM_PROMPT must not contain "Korean —"',
    );
  });
});

describe('English-migration positive assertions — SYSTEM_PROMPT uses English guidance', () => {
  test('SYSTEM_PROMPT contains "in English"', () => {
    assert.ok(
      SYSTEM_PROMPT.includes('in English'),
      'SYSTEM_PROMPT must contain "in English"',
    );
  });

  test('SYSTEM_PROMPT contains "English —"', () => {
    assert.ok(
      SYSTEM_PROMPT.includes('English —'),
      'SYSTEM_PROMPT must contain "English —"',
    );
  });
});

describe('Regression — grounding rule keywords still present after migration', () => {
  test('SYSTEM_PROMPT contains "patterns.json"', () => {
    assert.ok(
      SYSTEM_PROMPT.includes('patterns.json'),
      'SYSTEM_PROMPT must still reference patterns.json',
    );
  });

  test('SYSTEM_PROMPT contains "components.json"', () => {
    assert.ok(
      SYSTEM_PROMPT.includes('components.json'),
      'SYSTEM_PROMPT must still reference components.json',
    );
  });

  test('SYSTEM_PROMPT contains "visual_constraints"', () => {
    assert.ok(
      SYSTEM_PROMPT.includes('visual_constraints'),
      'SYSTEM_PROMPT must still reference visual_constraints',
    );
  });
});
