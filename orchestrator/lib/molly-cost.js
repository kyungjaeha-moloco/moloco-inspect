// orchestrator/lib/molly-cost.js
//
// LLM cost aggregation. Combines lib_call events from molly-metrics with cost
// data from the sandbox agent and converts to USD using the price table in
// molly-pricing.js.
//
// Output: { window, total_usd, by_model, by_source, hourly_series,
//           unknown_model_calls }
//
// Depends on: molly-metrics.loadEvents (events stream), molly-pricing.getPricing /
// computeEventUsd.

import { loadEvents } from './molly-metrics.js';
import { computeEventUsd } from './molly-pricing.js';

const WINDOW_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/**
 * @param {'24h'|'7d'|'30d'} window
 * @returns {{
 *   window: string,
 *   total_usd: number,
 *   by_model: Record<string, {calls:number, tokens:number, usd:number}>,
 *   by_source: Record<string, {calls:number, usd:number}>,
 *   hourly_series: Array<{ hour: string, usd: number }>,
 *   unknown_model_calls: number
 * }}
 */
export function getCostMetrics(window = '24h') {
  const windowMs = WINDOW_MS[window] ?? WINDOW_MS['24h'];
  const cutoff = Date.now() - windowMs;
  // Read NDJSON files up to the 30d window
  const maxDays = Math.ceil(windowMs / (24 * 60 * 60 * 1000)) + 1;
  const events = loadEvents(cutoff, { maxDays });

  let totalUsd = 0;
  let unknownModelCalls = 0;
  /** @type {Record<string, {calls:number, tokens:number, usd:number}>} */
  const byModel = {};
  /** @type {Record<string, {calls:number, usd:number}>} */
  const bySource = {};
  /** @type {Map<number, number>} */
  const hourBucket = new Map(); // hour epoch ms → usd

  for (const evt of events) {
    let usd = 0;
    let modelId = null;
    let source = null;

    if (evt.type === 'lib_call') {
      // Events without a model field are fast-path / lifecycle calls that
      // didn't invoke an LLM. Exclude from cost calculation rather than
      // counting as unknown.
      if (!evt.model) continue;
      const r = computeEventUsd(evt);
      usd = r.usd;
      if (r.unknownModel) unknownModelCalls += 1;
      modelId = evt.model;
      source = evt.lib || 'unknown';
    } else if (evt.type === 'agent_done') {
      // Sandbox agent — opencode provides the USD cost directly
      usd = Number(evt.cost) || 0;
      modelId = evt.agentModel || evt.model || 'sandbox-agent';
      source = 'agent';
    } else {
      continue;
    }

    if (usd <= 0 && source !== 'agent') continue;
    totalUsd += usd;

    // by_model
    if (!byModel[modelId]) byModel[modelId] = { calls: 0, tokens: 0, usd: 0 };
    byModel[modelId].calls += 1;
    byModel[modelId].tokens +=
      (evt.input_tokens ?? 0) +
      (evt.output_tokens ?? 0) +
      (evt.cache_create ?? 0) +
      (evt.cache_create_5m ?? 0) +
      (evt.cache_create_1h ?? 0) +
      (evt.cache_read ?? 0);
    byModel[modelId].usd += usd;

    // by_source
    if (!bySource[source]) bySource[source] = { calls: 0, usd: 0 };
    bySource[source].calls += 1;
    bySource[source].usd += usd;

    // hourly_series — bucket by ISO hour
    const hourMs = Math.floor(evt.t / (60 * 60 * 1000)) * (60 * 60 * 1000);
    hourBucket.set(hourMs, (hourBucket.get(hourMs) || 0) + usd);
  }

  // Convert and sort hourly_series (hourly granularity is most meaningful for
  // the 24h window; 7d/30d are also returned as hour buckets — the UI decides
  // whether to group them by day)
  const hourly_series = Array.from(hourBucket.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hourMs, usd]) => ({
      hour: new Date(hourMs).toISOString(),
      usd: round4(usd),
    }));

  return {
    window,
    total_usd: round4(totalUsd),
    by_model: roundMap(byModel),
    by_source: roundMap(bySource),
    hourly_series,
    unknown_model_calls: unknownModelCalls,
  };
}

function round4(n) {
  return Math.round(n * 1e4) / 1e4;
}

function roundMap(m) {
  const out = {};
  for (const [k, v] of Object.entries(m)) {
    out[k] = { ...v, usd: round4(v.usd) };
  }
  return out;
}
