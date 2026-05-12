/**
 * job-qa-strategist unit tests.
 *
 * Run:  node --test test/job-qa-strategist.test.js
 *
 * Covers:
 *   - English-migration invariant: SYSTEM_PROMPT contains no Korean codepoints.
 *   - English-migration invariant: no Korean instruction markers in prompt.
 *   - Catalog invariant: every strategy entry uses `label` + `when` (not `_ko`).
 *   - Catalog invariant: no strategy label/when contains Korean codepoints.
 *   - Field-name invariant: prompt asks for `rationale` not `rationale_ko`.
 *   - Positive: prompt explicitly says "in English" / "Language rule".
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SYSTEM_PROMPT,
  QA_STRATEGIES,
} from '../lib/job-qa-strategist.js';

const HANGUL_RE = /[ㄱ-㆏가-힯]/;

describe('English-migration invariant — SYSTEM_PROMPT uses English instructions', () => {
  test('SYSTEM_PROMPT contains no Korean codepoints', () => {
    const match = SYSTEM_PROMPT.match(HANGUL_RE);
    assert.equal(
      match,
      null,
      `SYSTEM_PROMPT must not contain Korean codepoints; found "${match?.[0]}" at index ${match?.index}`,
    );
  });

  test('SYSTEM_PROMPT has no Korean instruction markers', () => {
    const KOREAN_INSTRUCTION_MARKERS = [
      'in Korean>',
      '한 줄 한국어',
      '한국어 한 문장',
      '<Korean',
    ];
    for (const marker of KOREAN_INSTRUCTION_MARKERS) {
      assert.equal(
        SYSTEM_PROMPT.includes(marker),
        false,
        `SYSTEM_PROMPT must not contain instruction marker "${marker}"`,
      );
    }
  });

  test('SYSTEM_PROMPT contains an explicit English-language rule', () => {
    assert.ok(
      SYSTEM_PROMPT.includes('English'),
      'SYSTEM_PROMPT should mention English explicitly',
    );
    assert.ok(
      /Language rule/i.test(SYSTEM_PROMPT),
      'SYSTEM_PROMPT should contain a Language rule line',
    );
  });

  test('SYSTEM_PROMPT asks for `rationale`, not legacy `rationale_ko`', () => {
    assert.ok(
      SYSTEM_PROMPT.includes('"rationale"'),
      'SYSTEM_PROMPT JSON schema should reference "rationale"',
    );
    assert.equal(
      SYSTEM_PROMPT.includes('"rationale_ko"'),
      false,
      'SYSTEM_PROMPT must not reference legacy "rationale_ko" field',
    );
  });
});

describe('Catalog invariant — QA_STRATEGIES uses English label/when', () => {
  test('every strategy uses `label` + `when` keys (not `_ko` variants)', () => {
    for (const s of QA_STRATEGIES) {
      assert.equal(typeof s.label, 'string', `${s.id} missing label`);
      assert.equal(typeof s.when, 'string', `${s.id} missing when`);
      assert.equal(
        'label_ko' in s,
        false,
        `${s.id} still has legacy label_ko field`,
      );
      assert.equal(
        'when_ko' in s,
        false,
        `${s.id} still has legacy when_ko field`,
      );
    }
  });

  test('no strategy label or when contains Korean codepoints', () => {
    for (const s of QA_STRATEGIES) {
      const labelMatch = s.label.match(HANGUL_RE);
      assert.equal(
        labelMatch,
        null,
        `${s.id}.label must be English; found "${labelMatch?.[0]}"`,
      );
      const whenMatch = s.when.match(HANGUL_RE);
      assert.equal(
        whenMatch,
        null,
        `${s.id}.when must be English; found "${whenMatch?.[0]}"`,
      );
    }
  });
});
