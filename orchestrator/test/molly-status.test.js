/**
 * molly-status unit tests.
 *
 * Run:  node --test test/molly-status.test.js
 *
 * Covers:
 *   - English-migration invariant: SYSTEM_PROMPT contains no Korean codepoints.
 *   - Content invariants: key tokens that must survive the migration.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { SYSTEM_PROMPT } from '../lib/molly-status.js';

// Korean Hangul (Jamo + syllables)
const HANGUL_RE = /[ㄱ-㆏가-힯]/;

describe('English-migration invariant — SYSTEM_PROMPT is Korean-free', () => {
  test('SYSTEM_PROMPT has no Korean codepoints', () => {
    const match = SYSTEM_PROMPT.match(HANGUL_RE);
    assert.equal(
      match,
      null,
      `SYSTEM_PROMPT must not contain Korean characters. Found: "${match?.[0]}" at index ${match?.index}`,
    );
  });
});

describe('Content invariants — key tokens survive migration', () => {
  test("contains 'kind'", () => {
    assert.ok(SYSTEM_PROMPT.includes('kind'), "SYSTEM_PROMPT must contain 'kind'");
  });

  test("contains 'job'", () => {
    assert.ok(SYSTEM_PROMPT.includes('job'), "SYSTEM_PROMPT must contain 'job'");
  });

  test("contains 'change-request'", () => {
    assert.ok(SYSTEM_PROMPT.includes('change-request'), "SYSTEM_PROMPT must contain 'change-request'");
  });

  test("contains 'http://localhost:4174'", () => {
    assert.ok(
      SYSTEM_PROMPT.includes('http://localhost:4174'),
      "SYSTEM_PROMPT must contain 'http://localhost:4174'",
    );
  });

  test("contains 'thisThreadPlayground'", () => {
    assert.ok(
      SYSTEM_PROMPT.includes('thisThreadPlayground'),
      "SYSTEM_PROMPT must contain 'thisThreadPlayground'",
    );
  });

  test("contains 'JSON'", () => {
    assert.ok(SYSTEM_PROMPT.includes('JSON'), "SYSTEM_PROMPT must contain 'JSON'");
  });
});
