// orchestrator/lib/molly-metrics.js
//
// Molly 운영 메트릭 수집 + 집계.
//
// 수집:
//   recordEvent(type, payload) — 메모리 ring buffer (last 2000) + 파일
//   append (orchestrator/state/molly-metrics-YYYY-MM-DD.ndjson). 비동기
//   write — 호출 latency 영향 ~0.
//
// 집계:
//   getMetrics(window='1h'|'24h'|'7d') — 메모리 ring + 파일 합쳐서
//   9 메트릭 집계.
//
// Event type:
//   - 'lib_call'       — molly-classifier / chat / status / prd-analyzer /
//                        plan-emitter / lifecycle 호출 결과
//   - 'intake_result'  — /api/intake 의 최종 kind
//   - 'intake_error'   — /api/intake 500 응답 카테고리
//
// 모든 event 공통 필드: t (ms), type, surface?

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(__dirname, '..', 'state');

const RING_MAX = 2000;
/** @type {Array<object>} */
const ring = [];

function fileForDay(d = new Date()) {
  const ymd = d.toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(STATE_DIR, `molly-metrics-${ymd}.ndjson`);
}

/**
 * @param {string} type
 * @param {object} [payload]
 */
export function recordEvent(type, payload = {}) {
  const evt = { t: Date.now(), type, ...payload };
  ring.push(evt);
  if (ring.length > RING_MAX) ring.shift();
  // file append (best-effort, 비동기 — write fail 해도 메모리 ring 은 OK)
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFile(fileForDay(), JSON.stringify(evt) + '\n', (err) => {
      if (err) console.warn('[molly-metrics] append failed:', err.message);
    });
  } catch (err) {
    console.warn('[molly-metrics] write failed:', err.message);
  }
}

/**
 * @param {'1h'|'24h'|'7d'} window
 * @returns {object} aggregated metrics
 */
export function getMetrics(window = '1h') {
  const windowMs = ({ '1h': 60 * 60 * 1000, '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000 })[window]
    ?? 60 * 60 * 1000;
  const cutoff = Date.now() - windowMs;
  const events = loadEvents(cutoff);
  return aggregate(events, window);
}

/**
 * 메모리 ring + 파일 (필요한 최근 N day) 합쳐서 cutoff 이후 events 반환.
 */
function loadEvents(cutoff) {
  const fromRing = ring.filter((e) => e.t >= cutoff);
  // 파일에서도 — 24h+ 윈도우면 어제 파일도 로드
  const days = Math.ceil((Date.now() - cutoff) / (24 * 60 * 60 * 1000)) + 1;
  const fileEvents = [];
  for (let i = 0; i < Math.min(days, 8); i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const f = fileForDay(d);
    if (!fs.existsSync(f)) continue;
    try {
      const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const evt = JSON.parse(line);
          if (evt.t >= cutoff) fileEvents.push(evt);
        } catch {}
      }
    } catch (err) {
      console.warn(`[molly-metrics] read failed ${f}:`, err.message);
    }
  }
  // ring 가 가장 최근 — dedupe by t+type+lib (heuristic)
  const seen = new Set();
  const out = [];
  for (const e of [...fileEvents, ...fromRing]) {
    const k = `${e.t}|${e.type}|${e.lib ?? ''}|${e.kind ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function aggregate(events, window) {
  const libCalls = events.filter((e) => e.type === 'lib_call');
  const intakeResults = events.filter((e) => e.type === 'intake_result');
  const intakeErrors = events.filter((e) => e.type === 'intake_error');

  // 1. plan-emitter cache hit ratio
  const planCalls = libCalls.filter((e) => e.lib === 'plan-emitter');
  const planCacheHits = planCalls.filter((e) => (e.cache_read ?? 0) > 0).length;
  const planCacheCreates = planCalls.filter((e) => (e.cache_create ?? 0) > 0).length;

  // 2. chat latency percentiles
  const chatCalls = libCalls.filter((e) => e.lib === 'molly-chat');
  const chatLatencies = chatCalls.map((e) => e.latency_ms).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);

  // 3. classifier fast-path 비율
  const classifierCalls = libCalls.filter((e) => e.lib === 'molly-classifier');
  const fastPathCalls = classifierCalls.filter((e) => e.fastPath === true).length;

  // 4. lifecycle: 잡 매칭 / 미매칭
  const lifecycleCalls = libCalls.filter((e) => e.lib === 'molly-lifecycle');
  const lifecycleMatched = lifecycleCalls.filter((e) => e.jobMatched === true).length;

  // 5. PRD ambiguous 비율
  const prdCalls = libCalls.filter((e) => e.lib === 'prd-analyzer');
  const prdAmbiguous = prdCalls.filter((e) => e.clarity === 'ambiguous').length;

  // 6. Thinking ON/OFF 별 latency
  const prdThinkingOn = prdCalls.filter((e) => e.thinking === true);
  const prdThinkingOff = prdCalls.filter((e) => e.thinking === false);
  const prdThinkingOnLat = prdThinkingOn.map((e) => e.latency_ms).filter(Number.isFinite);
  const prdThinkingOffLat = prdThinkingOff.map((e) => e.latency_ms).filter(Number.isFinite);

  // 7. fallback 카테고리 빈도
  const errorCategories = {};
  for (const e of intakeErrors) {
    const cat = e.category || 'other';
    errorCategories[cat] = (errorCategories[cat] || 0) + 1;
  }

  // 8. plan dispatch — plan_emit → job_dispatched
  const planEmitCount = intakeResults.filter((e) => e.kind === 'plan_emit').length;
  const jobDispatchedCount = intakeResults.filter((e) => e.kind === 'job_dispatched').length;

  // 9. clarification turn 수 (대략 — same session/surface 별 ambiguous 연속)
  // 단순화: 전체 ambiguous count vs clear count 비율로 보여주고, 분포는 미완.
  const intakeKinds = intakeResults.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] || 0) + 1;
    return acc;
  }, {});

  // Time-bucket for line charts (5m / 1h / 6h based on window)
  const bucketMs = window === '1h' ? 5 * 60 * 1000 : window === '24h' ? 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
  const cacheBuckets = bucketStats(planCalls, bucketMs, (e) => ({
    hit: (e.cache_read ?? 0) > 0 ? 1 : 0,
    total: 1,
  }));
  const ambiguousBuckets = bucketStats(prdCalls, bucketMs, (e) => ({
    ambig: e.clarity === 'ambiguous' ? 1 : 0,
    total: 1,
  }));

  return {
    window,
    eventCount: events.length,
    cache: {
      planCalls: planCalls.length,
      planCacheHits,
      planCacheCreates,
      hitRatio: planCalls.length ? planCacheHits / planCalls.length : 0,
      buckets: cacheBuckets.map((b) => ({
        t: b.t,
        ratio: b.total ? b.hit / b.total : 0,
        total: b.total,
      })),
    },
    chatLatency: {
      n: chatLatencies.length,
      p50: percentile(chatLatencies, 0.5),
      p95: percentile(chatLatencies, 0.95),
      p99: percentile(chatLatencies, 0.99),
      mean: chatLatencies.length ? Math.round(chatLatencies.reduce((a, b) => a + b, 0) / chatLatencies.length) : 0,
    },
    fastPath: {
      total: classifierCalls.length,
      fastPath: fastPathCalls,
      missFreq: classifierCalls.length ? 1 - fastPathCalls / classifierCalls.length : 0,
    },
    lifecycle: {
      total: lifecycleCalls.length,
      matched: lifecycleMatched,
      matchRatio: lifecycleCalls.length ? lifecycleMatched / lifecycleCalls.length : 0,
    },
    ambiguous: {
      total: prdCalls.length,
      ambiguous: prdAmbiguous,
      ratio: prdCalls.length ? prdAmbiguous / prdCalls.length : 0,
      buckets: ambiguousBuckets.map((b) => ({
        t: b.t,
        ratio: b.total ? b.ambig / b.total : 0,
        total: b.total,
      })),
    },
    thinking: {
      prdOn: { n: prdThinkingOnLat.length, mean: meanInt(prdThinkingOnLat) },
      prdOff: { n: prdThinkingOffLat.length, mean: meanInt(prdThinkingOffLat) },
    },
    fallback: errorCategories,
    plan: {
      planEmit: planEmitCount,
      jobDispatched: jobDispatchedCount,
      dispatchRatio: planEmitCount ? jobDispatchedCount / planEmitCount : 0,
    },
    intakeKinds,
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return Math.round(sorted[idx]);
}

function meanInt(arr) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function bucketStats(events, bucketMs, fn) {
  if (!events.length) return [];
  const buckets = new Map();
  for (const e of events) {
    const b = Math.floor(e.t / bucketMs) * bucketMs;
    if (!buckets.has(b)) buckets.set(b, { t: b });
    const stats = fn(e);
    const cur = buckets.get(b);
    for (const [k, v] of Object.entries(stats)) {
      cur[k] = (cur[k] || 0) + v;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.t - b.t);
}
