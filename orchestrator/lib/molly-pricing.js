// orchestrator/lib/molly-pricing.js
//
// Anthropic Claude API 모델별 토큰 단가 테이블.
//
// Source: https://platform.claude.com/docs/en/about-claude/pricing
// Verified: 2026-05-07 (researcher 에이전트 직접 fetch 확인)
//
// 단위: USD per 1M tokens (MTok).
// cache_create_5m / cache_create_1h 분리 — Anthropic 이 두 TTL 옵션 제공.
//   5m  = 1.25× input
//   1h  = 2.0×  input
//   read = 0.1×  input (모든 TTL 동일)
//
// 사용 모델 추가 시 ALLOWED_MODELS (molly-settings.js) 와 동기화.
// Pricing 변경 시 이 파일 수동 업데이트 + verified date 갱신.
//
// Sonnet 4 (claude-sonnet-4-20250514) 는 2026-06-15 retired 예정 — runtime
// settings 에서 아직 사용 중이라 단가 포함. 2026-06-15 이후 호출은 API 가
// 차단할 것이므로 unknown_model 로 빠질 일 없음.

export const PRICING = {
  'claude-haiku-4-5-20251001': {
    input: 1.00,
    output: 5.00,
    cacheCreate5m: 1.25,
    cacheCreate1h: 2.00,
    cacheRead: 0.10,
  },
  'claude-sonnet-4-20250514': {
    input: 3.00,
    output: 15.00,
    cacheCreate5m: 3.75,
    cacheCreate1h: 6.00,
    cacheRead: 0.30,
    deprecated: true,
    retiredOn: '2026-06-15',
  },
  'claude-sonnet-4-5-20250929': {
    input: 3.00,
    output: 15.00,
    cacheCreate5m: 3.75,
    cacheCreate1h: 6.00,
    cacheRead: 0.30,
  },
  'claude-sonnet-4-6': {
    input: 3.00,
    output: 15.00,
    cacheCreate5m: 3.75,
    cacheCreate1h: 6.00,
    cacheRead: 0.30,
  },
  'claude-opus-4-5-20251101': {
    input: 5.00,
    output: 25.00,
    cacheCreate5m: 6.25,
    cacheCreate1h: 10.00,
    cacheRead: 0.50,
  },
  'claude-opus-4-6': {
    input: 5.00,
    output: 25.00,
    cacheCreate5m: 6.25,
    cacheCreate1h: 10.00,
    cacheRead: 0.50,
  },
  'claude-opus-4-7': {
    input: 5.00,
    output: 25.00,
    cacheCreate5m: 6.25,
    cacheCreate1h: 10.00,
    cacheRead: 0.50,
  },
};

/**
 * 모델 ID 로 단가 조회. 알 수 없는 모델 → null.
 * @param {string} modelId
 * @returns {object|null}
 */
export function getPricing(modelId) {
  return PRICING[modelId] ?? null;
}

/**
 * 한 lib_call event 의 USD 비용 계산.
 *
 * Cache create 처리 정책:
 * - event 가 cache_create_5m / cache_create_1h 분리 필드를 가지면 그걸 우선
 * - 분리 필드 없고 cache_create 단일 필드만 있으면, plan-emitter 는 1h 가정
 *   (S0 적용으로 1h cache_control 명시), 그 외 lib 는 5m 가정 (Anthropic 기본)
 *
 * 알 수 없는 모델 → 0 반환 + unknownModel: true 표시.
 *
 * @param {object} evt — lib_call event { lib, model, input_tokens, output_tokens,
 *                       cache_create?, cache_create_5m?, cache_create_1h?, cache_read? }
 * @returns {{ usd: number, unknownModel: boolean }}
 */
export function computeEventUsd(evt) {
  const p = getPricing(evt.model);
  if (!p) return { usd: 0, unknownModel: true };

  const inputTok = evt.input_tokens ?? 0;
  const outputTok = evt.output_tokens ?? 0;
  const cacheReadTok = evt.cache_read ?? 0;

  let create5m = evt.cache_create_5m;
  let create1h = evt.cache_create_1h;
  if (create5m === undefined && create1h === undefined) {
    // 분리 필드 없음 — lib 별 휴리스틱
    const total = evt.cache_create ?? 0;
    if (evt.lib === 'plan-emitter') {
      create1h = total;
      create5m = 0;
    } else {
      create5m = total;
      create1h = 0;
    }
  } else {
    create5m = create5m ?? 0;
    create1h = create1h ?? 0;
  }

  const usd =
    (inputTok / 1e6) * p.input +
    (outputTok / 1e6) * p.output +
    (create5m / 1e6) * p.cacheCreate5m +
    (create1h / 1e6) * p.cacheCreate1h +
    (cacheReadTok / 1e6) * p.cacheRead;

  return { usd, unknownModel: false };
}
