/**
 * molly-chat unit tests.
 *
 * Run:  node --test test/molly-chat.test.js
 *
 * Covers:
 *   - English-migration invariant: SYSTEM_PROMPT contains exact self-intro marker.
 *   - English-migration invariant: SYSTEM_PROMPT contains no Korean codepoints.
 *   - Key concepts survive migration: surface names, URLs, domain terms.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { SYSTEM_PROMPT } from '../lib/molly-chat.js';

// Korean Hangul (Jamo + syllables) — used to assert the prompt is English.
const HANGUL_RE = /[ㄱ-㆏가-힯]/;

describe('English-migration invariant — self-intro name marker', () => {
  test('SYSTEM_PROMPT contains exact self-intro string', () => {
    assert.ok(
      SYSTEM_PROMPT.includes('Molly, an AI assistant for design-system-driven product improvements'),
      'SYSTEM_PROMPT must contain exact string: "Molly, an AI assistant for design-system-driven product improvements"',
    );
  });
});

describe('English-migration invariant — no Korean codepoints', () => {
  test('SYSTEM_PROMPT contains no Hangul characters', () => {
    const match = SYSTEM_PROMPT.match(HANGUL_RE);
    assert.equal(
      match,
      null,
      `SYSTEM_PROMPT must be fully English. Korean found: "${match?.[0]}" near index ${match?.index}`,
    );
  });
});

describe('Key concepts survive migration', () => {
  const REQUIRED_CONCEPTS = [
    'Playground',
    'Inspect Console',
    'Slack',
    'Chrome',
    'http://localhost:4180',
    'http://localhost:4174',
    'design system',
    'plan',
  ];

  for (const concept of REQUIRED_CONCEPTS) {
    test(`SYSTEM_PROMPT mentions "${concept}"`, () => {
      assert.ok(
        SYSTEM_PROMPT.includes(concept),
        `SYSTEM_PROMPT must mention "${concept}"`,
      );
    });
  }
});
