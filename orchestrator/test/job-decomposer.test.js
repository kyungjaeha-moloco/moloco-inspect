/**
 * job-decomposer unit tests.
 *
 * Run:  node --test test/job-decomposer.test.js
 *
 * Covers:
 *   - English-migration invariant: SYSTEM_PROMPT contains no Korean codepoints
 *     (except user-input-matching tokens — none expected in decomposer).
 *   - English-migration invariant: no Korean instruction markers in prompt.
 *   - Field-name invariant: prompt references `risks` not `risks_ko`.
 *   - Positive: prompt explicitly says "in English" somewhere.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { SYSTEM_PROMPT } from '../lib/job-decomposer.js';

// Korean Hangul (Jamo + syllables) — used to assert prompts are English.
const HANGUL_RE = /[ㄱ-㆏가-힯]/;

describe('English-migration invariant — SYSTEM_PROMPT uses English instructions', () => {
  test('SYSTEM_PROMPT has no Korean instruction markers', () => {
    const KOREAN_INSTRUCTION_MARKERS = [
      'in Korean>',
      '한 줄 한국어',
      'Korean —',
      '<Korean',
      '한국어 한 문장',
    ];
    for (const marker of KOREAN_INSTRUCTION_MARKERS) {
      assert.equal(
        SYSTEM_PROMPT.includes(marker),
        false,
        `SYSTEM_PROMPT must not contain instruction marker "${marker}"`,
      );
    }
  });

  test('SYSTEM_PROMPT contains "in English" (positive invariant)', () => {
    assert.match(
      SYSTEM_PROMPT,
      /in English/i,
      'SYSTEM_PROMPT should explicitly instruct the LLM to produce English output',
    );
  });

  test('SYSTEM_PROMPT has no Korean codepoints', () => {
    // The decomposer operates on a plan emitted in English (or user's PRD
    // language) and has no user-input matching tokens that require Korean.
    // All Korean here is instruction prose that must be migrated.
    const match = SYSTEM_PROMPT.match(HANGUL_RE);
    assert.equal(
      match,
      null,
      `SYSTEM_PROMPT must have no Korean codepoints. Found: "${match?.[0]}" near index ${match?.index}`,
    );
  });

  test('SYSTEM_PROMPT schema uses "risks" not "risks_ko"', () => {
    assert.ok(
      SYSTEM_PROMPT.includes('"risks"'),
      'SYSTEM_PROMPT schema should reference field name "risks" (not "risks_ko")',
    );
    assert.equal(
      SYSTEM_PROMPT.includes('"risks_ko"'),
      false,
      'SYSTEM_PROMPT schema must not reference the old field name "risks_ko"',
    );
  });
});
