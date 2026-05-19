// Plan v3 §G6 — non-LLM end-to-end check for governance queue endpoints.
// Enqueues 3 synthetic rows directly via the lib, then exercises the HTTP
// endpoints (list, item, events, status). Skips the actual judge LLM — that
// is tested separately to keep the smoke deterministic.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_DIR = path.resolve(__dirname, '..', 'state');
const QUEUE = path.join(STATE_DIR, 'governance-queue.jsonl');
const EVENTS = path.join(STATE_DIR, 'governance-status-events.jsonl');

const BASE = process.env.ORCH_URL || 'http://localhost:3847';

// Snapshot existing rows so we can isolate ours.
const initialQueueLen = fs.existsSync(QUEUE) ? fs.readFileSync(QUEUE, 'utf8').split('\n').filter(Boolean).length : 0;
const initialEventsLen = fs.existsSync(EVENTS) ? fs.readFileSync(EVENTS, 'utf8').split('\n').filter(Boolean).length : 0;

const lib = await import('../lib/ds-escalation.js');
const { enqueueGovernance, applyJudgeResult, generateRefId } = lib;

const ts = Date.now();
const refA = generateRefId(ts);
const refB = generateRefId(ts + 1);
const refC = generateRefId(ts + 2);

console.log(`[gov-e2e] refs A=${refA} B=${refB} C=${refC}`);

enqueueGovernance({
  refId: refA, now: ts,
  intent: 'sticky bottom action bar', reason: 'no DS pattern matches sticky footer',
  kind: 'new_component',
  closestName: 'MCActionBar', closestSimilarity: 0.32, closestReasoning: 'positions actions but not sticky',
  prdSnippet: 'PM wants a sticky bottom action bar on the campaign detail',
  jobId: null, client: 'tving', route: '/campaigns/123', surface: 'playground', user: 'ds-e2e',
});
applyJudgeResult(refA, {
  kind: 'propose_new',
  rationale: 'No DS component handles bottom-pinned action bars; reusable across routes.',
  errorReason: null,
  latencyMs: 1234,
});

enqueueGovernance({
  refId: refB, now: ts + 1,
  intent: 'split button with menu', reason: 'closest button lacks split menu trigger',
  kind: 'extension',
  closestName: 'MCButton2', closestSimilarity: 0.42, closestReasoning: 'same button family, missing menu trigger',
  prdSnippet: 'Need split button with chevron + menu',
  jobId: null, client: 'tving', route: '/orders', surface: 'slack', user: 'ds-e2e',
});
applyJudgeResult(refB, {
  kind: 'extend_existing',
  rationale: 'Same button family — add a split/menu variant prop.',
  errorReason: null,
  latencyMs: 800,
});

enqueueGovernance({
  refId: refC, now: ts + 2,
  intent: 'one-off promo banner', reason: 'product-specific marketing layout',
  kind: 'new_component',
  closestName: null, closestSimilarity: null, closestReasoning: null,
  prdSnippet: 'Add a temporary promo banner above the campaigns table',
  jobId: null, client: 'tving', route: '/campaigns', surface: 'chrome_ext', user: 'ds-e2e',
});
applyJudgeResult(refC, {
  kind: 'unknown',
  rationale: '',
  errorReason: 'timeout',
  latencyMs: 30000,
});

console.log('[gov-e2e] enqueued + judged 3 rows');

async function get(url) {
  const r = await fetch(`${BASE}${url}`);
  const body = await r.json();
  return { ok: r.ok, status: r.status, body };
}
async function post(url, payload) {
  const r = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await r.json();
  return { ok: r.ok, status: r.status, body };
}

let pass = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  ✅ ${label}`); }
  else { fail += 1; console.log(`  ❌ ${label} ${detail}`); }
}

// 1. List — all
let r = await get('/api/governance/queue');
check('list ok', r.ok && r.body.ok);
check('list contains A', !!r.body.items.find((i) => i.id === refA));
check('list contains B', !!r.body.items.find((i) => i.id === refB));
check('list contains C', !!r.body.items.find((i) => i.id === refC));

// 2. List — pending filter (A and B should be pending; C stayed awaiting_judge per applyJudgeResult error path)
r = await get('/api/governance/queue?status=pending');
check('pending-filter list ok', r.ok && r.body.ok);
const pendingIds = new Set(r.body.items.map((i) => i.id));
check('A in pending', pendingIds.has(refA));
check('B in pending', pendingIds.has(refB));
check('C NOT in pending', !pendingIds.has(refC));

// 3. Item detail
r = await get(`/api/governance/queue/${refA}`);
check('item A ok', r.ok && r.body.ok && r.body.item?.id === refA);
check('item A kind=propose_new', r.body.item?.kind === 'propose_new', `kind=${r.body.item?.kind}`);
check('item A has events', Array.isArray(r.body.events) && r.body.events.length >= 2);

// 4. Awaiting_judge status update blocked
r = await post(`/api/governance/queue/${refC}/status`, { status: 'resolved' });
check('C resolve blocked (409)', r.status === 409, `got ${r.status}`);

// 5. Status update OK on pending row
r = await post(`/api/governance/queue/${refA}/status`, { status: 'in_review', note: 'ds-e2e' });
check('A → in_review ok', r.ok && r.body.ok && r.body.item?.status === 'in_review');

r = await post(`/api/governance/queue/${refA}/status`, { status: 'resolved' });
check('A → resolved ok', r.ok && r.body.ok && r.body.item?.status === 'resolved');

// 6. Events endpoint
r = await get(`/api/governance/queue/${refA}/events`);
check('events ok', r.ok && r.body.ok && Array.isArray(r.body.events));
const statuses = r.body.events.map((e) => e.status);
check('events has awaiting_judge', statuses.includes('awaiting_judge'));
check('events has resolved', statuses.includes('resolved'));

// 7. Sweep (force stale on C)
const sweepLib = await import('../lib/ds-escalation.js');
const { sweepStaleAwaitingJudge } = sweepLib;
const result = sweepStaleAwaitingJudge({ now: Date.now() + 10 * 60_000 }); // 10min later
check('sweep promoted C', result.swept >= 1, `swept=${result.swept}`);

r = await get(`/api/governance/queue/${refC}`);
check('C now pending after sweep', r.body.item?.status === 'pending');

console.log(`\n[gov-e2e] ${pass} pass / ${fail} fail`);
console.log(`[gov-e2e] queue rows added: ${(fs.readFileSync(QUEUE, 'utf8').split('\n').filter(Boolean).length) - initialQueueLen}`);
console.log(`[gov-e2e] event rows added: ${(fs.readFileSync(EVENTS, 'utf8').split('\n').filter(Boolean).length) - initialEventsLen}`);
process.exit(fail === 0 ? 0 : 1);
