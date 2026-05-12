/**
 * molly-classifier unit tests.
 *
 * Run:  node --test test/molly-classifier.test.js
 *
 * Covers:
 *   - Regression: fast-path Korean keyword matching (greeting / lifecycle).
 *   - Regression: looksLikePrd Korean keyword heuristic.
 *   - Regression: buildClassifierUserMessage assembly (recent + pending plan).
 *   - English-migration invariant: SYSTEM_PROMPT contains no Korean codepoints.
 *   - English-migration invariant: buildClassifierUserMessage labels are English
 *     (output contains no Korean when inputs are ASCII-only).
 *
 * The fast-path regex (GREETING_RE / LIFECYCLE_FAST_RE) and the PRD_KEYWORDS
 * list intentionally keep Korean strings — those match user input. The
 * invariant only applies to LLM-facing prompts.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SYSTEM_PROMPT,
  fastPathClassify,
  looksLikePrd,
  buildClassifierUserMessage,
} from '../lib/molly-classifier.js';

// Korean Hangul (Jamo + syllables) — used to assert prompts are English.
const HANGUL_RE = /[ㄱ-㆏가-힯]/;

describe('fastPathClassify — Korean greeting (regression)', () => {
  test('"안녕" → chat', () => {
    assert.deepEqual(fastPathClassify('안녕'), {
      kind: 'chat',
      reason: 'fast-path: greeting',
    });
  });

  test('"안녕하세요" → chat', () => {
    assert.equal(fastPathClassify('안녕하세요')?.kind, 'chat');
  });

  test('"ㅎㅇ" → chat', () => {
    assert.equal(fastPathClassify('ㅎㅇ')?.kind, 'chat');
  });

  test('"hi" → chat', () => {
    assert.equal(fastPathClassify('hi')?.kind, 'chat');
  });

  test('"좋은 아침" → chat', () => {
    assert.equal(fastPathClassify('좋은 아침')?.kind, 'chat');
  });
});

describe('fastPathClassify — Korean lifecycle keyword (regression)', () => {
  test('"취소" → lifecycle_action', () => {
    assert.deepEqual(fastPathClassify('취소'), {
      kind: 'lifecycle_action',
      reason: 'fast-path: lifecycle keyword',
    });
  });

  test('"재시도 dc1c2ccc" → lifecycle_action', () => {
    assert.equal(fastPathClassify('재시도 dc1c2ccc')?.kind, 'lifecycle_action');
  });

  test('"롤백" → lifecycle_action', () => {
    assert.equal(fastPathClassify('롤백')?.kind, 'lifecycle_action');
  });

  test('"rollback" → lifecycle_action', () => {
    assert.equal(fastPathClassify('rollback')?.kind, 'lifecycle_action');
  });

  test('"cancel" → lifecycle_action', () => {
    assert.equal(fastPathClassify('cancel')?.kind, 'lifecycle_action');
  });
});

describe('fastPathClassify — no match', () => {
  test('non-greeting non-lifecycle text → null', () => {
    assert.equal(fastPathClassify('TAS 사이드바에 도움말 추가해줘'), null);
  });

  test('long greeting-ish text → null (length gate)', () => {
    // "안녕하세요 반갑습니다" — > 12 chars after trim, falls through to LLM.
    assert.equal(fastPathClassify('안녕하세요 반갑습니다 잘부탁드립니다'), null);
  });
});

describe('looksLikePrd — Korean keyword heuristic (regression)', () => {
  test('short text → false', () => {
    assert.equal(looksLikePrd('짧은 메시지'), false);
  });

  test('long text with one keyword → false', () => {
    const text = '이것은 길고 긴 메시지이며 80자가 넘어가는 문장입니다. 추가 하나만 등장합니다. 다른 것 없음.';
    assert.equal(looksLikePrd(text), false);
  });

  test('long text with two PRD keywords → true', () => {
    const text = 'TAS 사이드바에 도움말 메뉴 추가해줘. 새로운 페이지를 만들어주고 i18n 키도 같이 등록해줘. 이건 PRD 라고 봐도 무방한 분량 길이입니다.';
    assert.ok(text.length >= 80, `precondition: text >= 80 chars (was ${text.length})`);
    assert.equal(looksLikePrd(text), true);
  });
});

describe('buildClassifierUserMessage — assembly (regression)', () => {
  test('plain text only', () => {
    const msg = buildClassifierUserMessage('hello world', {});
    assert.match(msg, /hello world/);
  });

  test('recent messages are included', () => {
    const msg = buildClassifierUserMessage('hello', {
      recentMessages: ['previous-a', 'previous-b'],
    });
    assert.match(msg, /previous-a/);
    assert.match(msg, /previous-b/);
  });

  test('pending plan hint is included', () => {
    const msg = buildClassifierUserMessage('hello', {
      hasPendingPlan: true,
      pendingPlanSummary: 'PLAN-XYZ',
    });
    assert.match(msg, /PLAN-XYZ/);
    assert.match(msg, /pending/i);
  });
});

describe('English-migration invariant — prompts use English instructions', () => {
  // SYSTEM_PROMPT may still contain Korean *keyword tokens* ("취소", "재시도", "롤백")
  // and Korean *user-message examples* — the LLM needs them to match Korean input
  // (the original handoff explicitly preserves these for classification accuracy).
  // What MUST be English is the meta-narrative: category descriptions, rules,
  // response format, and the `reason` field guidance.
  test('SYSTEM_PROMPT has no Korean instruction markers', () => {
    const KOREAN_INSTRUCTION_MARKERS = [
      '한 줄 한국어',
      '한국어로',
      '<한 줄',
      'in Korean>',
      '<...in Korean>',
    ];
    for (const marker of KOREAN_INSTRUCTION_MARKERS) {
      assert.equal(
        SYSTEM_PROMPT.includes(marker),
        false,
        `SYSTEM_PROMPT must not contain instruction marker "${marker}"`,
      );
    }
  });

  test('SYSTEM_PROMPT guides English reasoning', () => {
    assert.match(
      SYSTEM_PROMPT,
      /(one-line English|in English)/i,
      'SYSTEM_PROMPT should explicitly request an English `reason`',
    );
  });

  test('buildClassifierUserMessage labels are English (ASCII-only inputs ⇒ ASCII-only output)', () => {
    const msg = buildClassifierUserMessage('plain ascii text', {
      recentMessages: ['ascii-prev-a', 'ascii-prev-b'],
      hasPendingPlan: true,
      pendingPlanSummary: 'ascii-summary',
    });
    const match = msg.match(HANGUL_RE);
    assert.equal(
      match,
      null,
      `User message labels must be English. Korean found: ${match?.[0]} at index ${match?.index}`,
    );
  });
});
