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

  test('SYSTEM_PROMPT Korean appears only inside the Tving locale exception', () => {
    // The decomposer instruction text is English. The exception is the
    // Tving-locale rule (rule 9) which legitimately quotes Korean UI copy
    // (e.g. "환영합니다") as an illustration of how generated product code
    // should preserve user-locale strings. Other Korean would be a regression.
    const koreanMatches = [...SYSTEM_PROMPT.matchAll(/[ㄱ-㆏가-힯]+/g)];
    for (const m of koreanMatches) {
      const before = SYSTEM_PROMPT.slice(Math.max(0, m.index - 250), m.index);
      const after = SYSTEM_PROMPT.slice(m.index, m.index + (m[0].length) + 250);
      const context = before + after;
      assert.match(
        context,
        /(Tving|i18n|locale|user-facing copy|verbatim)/i,
        `Korean codepoint "${m[0]}" at index ${m.index} appears outside the Tving locale exception block`,
      );
    }
  });

  test('SYSTEM_PROMPT documents the Tving locale exception', () => {
    assert.match(
      SYSTEM_PROMPT,
      /Tving/,
      'SYSTEM_PROMPT should mention Tving to ground the locale rule',
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
