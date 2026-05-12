/**
 * molly-prd-analyzer unit tests.
 *
 * Run:  node --test test/molly-prd-analyzer.test.js
 *
 * Covers:
 *   - English-migration invariant: SYSTEM_PROMPT contains no Korean instruction text.
 *   - English-migration invariant: SYSTEM_PROMPT contains expected English phrases.
 *   - buildPrdUserMessage: labels are English (ASCII-only inputs => ASCII-only output).
 *   - buildPrdUserMessage: without history produces correct English template.
 *   - buildPrdUserMessage: with history produces correct English cumulative template.
 *
 * Note: SYSTEM_PROMPT and buildPrdUserMessage do NOT need to be Korean-free in the
 * sense of matching user input — but all instruction/meta text must be English.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SYSTEM_PROMPT,
  buildPrdUserMessage,
} from '../lib/molly-prd-analyzer.js';

// Korean Hangul (Jamo + syllables) — used to assert prompts are English.
const HANGUL_RE = /[ㄱ-㆏가-힯]/;

describe('English-migration invariant — SYSTEM_PROMPT uses English instructions', () => {
  test('SYSTEM_PROMPT has no Korean codepoints', () => {
    const match = SYSTEM_PROMPT.match(HANGUL_RE);
    assert.equal(
      match,
      null,
      `SYSTEM_PROMPT must contain no Korean. Found: "${match?.[0]}" at index ${match?.index}`,
    );
  });

  test('SYSTEM_PROMPT contains English clarity criteria phrase', () => {
    assert.match(
      SYSTEM_PROMPT,
      /Clear criteria/i,
      'SYSTEM_PROMPT should contain English "Clear criteria" section',
    );
  });

  test('SYSTEM_PROMPT contains English ambiguous criteria phrase', () => {
    assert.match(
      SYSTEM_PROMPT,
      /Ambiguous criteria/i,
      'SYSTEM_PROMPT should contain English "Ambiguous criteria" section',
    );
  });

  test('SYSTEM_PROMPT instructs English clarifying question', () => {
    assert.match(
      SYSTEM_PROMPT,
      /Friendly, concise English/i,
      'SYSTEM_PROMPT should request a friendly, concise English clarifying question',
    );
  });

  test('SYSTEM_PROMPT contains English cumulative context mode header', () => {
    assert.match(
      SYSTEM_PROMPT,
      /Cumulative context mode/i,
      'SYSTEM_PROMPT should contain English "Cumulative context mode" section',
    );
  });
});

describe('buildPrdUserMessage — no history', () => {
  test('contains PRD text', () => {
    const msg = buildPrdUserMessage('Add a help button to the sidebar', {});
    assert.match(msg, /Add a help button to the sidebar/);
  });

  test('uses English label "PRD candidate"', () => {
    const msg = buildPrdUserMessage('some prd text', {});
    assert.match(msg, /PRD candidate/i);
  });

  test('no Korean in output when input is ASCII-only', () => {
    const msg = buildPrdUserMessage('ascii prd text', {});
    const match = msg.match(HANGUL_RE);
    assert.equal(
      match,
      null,
      `buildPrdUserMessage (no history) must produce no Korean. Found: ${match?.[0]}`,
    );
  });
});

describe('buildPrdUserMessage — with history', () => {
  const history = [
    { role: 'assistant', content: 'Which page should be changed?' },
    { role: 'user', content: 'The TAS sidebar.' },
  ];

  test('contains current PRD text', () => {
    const msg = buildPrdUserMessage('Add a help button', { history });
    assert.match(msg, /Add a help button/);
  });

  test('contains history turns', () => {
    const msg = buildPrdUserMessage('Add a help button', { history });
    assert.match(msg, /Which page should be changed\?/);
    assert.match(msg, /The TAS sidebar\./);
  });

  test('uses English label "Previous conversation"', () => {
    const msg = buildPrdUserMessage('some text', { history });
    assert.match(msg, /Previous conversation/i);
  });

  test('uses English label for current reply', () => {
    const msg = buildPrdUserMessage('some text', { history });
    assert.match(msg, /User's current reply/i);
  });

  test('uses English role label "user" (not Korean)', () => {
    const msg = buildPrdUserMessage('some text', { history });
    // Roles should be "user:" and "molly:" — no Korean word for "user" (사용자)
    assert.doesNotMatch(msg, /사용자/);
  });

  test('no Korean in output when inputs are ASCII-only', () => {
    const asciiHistory = [
      { role: 'assistant', content: 'Which page?' },
      { role: 'user', content: 'The sidebar.' },
    ];
    const msg = buildPrdUserMessage('ascii prd', { history: asciiHistory });
    const match = msg.match(HANGUL_RE);
    assert.equal(
      match,
      null,
      `buildPrdUserMessage (with history) must produce no Korean. Found: ${match?.[0]}`,
    );
  });
});
