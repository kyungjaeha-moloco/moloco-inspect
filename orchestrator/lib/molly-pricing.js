// orchestrator/lib/molly-pricing.js
//
// Anthropic Claude API per-model token price table.
//
// Source: https://platform.claude.com/docs/en/about-claude/pricing
// Verified: 2026-05-07 (researcher agent fetched directly)
//
// Unit: USD per 1M tokens (MTok).
// cache_create_5m / cache_create_1h split — Anthropic offers two TTL options.
//   5m  = 1.25× input
//   1h  = 2.0×  input
//   read = 0.1×  input (same for all TTLs)
//
// Sync ALLOWED_MODELS (molly-settings.js) when adding a new model.
// Update this file manually + refresh the verified date when pricing changes.
//
// Sonnet 4 (claude-sonnet-4-20250514) is scheduled for retirement 2026-06-15 —
// still in use via runtime settings so the price entry is kept. Calls after
// 2026-06-15 will be blocked by the API, so it will never fall through to
// unknown_model.

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
 * Look up the price entry for a model ID. Unknown model → null.
 * @param {string} modelId
 * @returns {object|null}
 */
export function getPricing(modelId) {
  return PRICING[modelId] ?? null;
}

/**
 * Calculate the USD cost for a single lib_call event.
 *
 * Cache-create handling policy:
 * - If the event has separate cache_create_5m / cache_create_1h fields, use those first.
 * - If only the combined cache_create field is present: plan-emitter assumes 1h
 *   (1h cache_control is explicit via S0), all other libs assume 5m (Anthropic default).
 *
 * Unknown model → returns 0 + unknownModel: true.
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
    // No separate fields — use per-lib heuristic
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
