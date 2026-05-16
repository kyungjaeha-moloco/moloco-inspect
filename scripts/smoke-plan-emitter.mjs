// Track 1 T1.2 smoke test — invoke emitPlan with the condensed system blocks
// (DESIGN.md + components-index instead of full components.json) and report
// usage / plan structure.
//
// Usage: node scripts/smoke-plan-emitter.mjs
// Requires: orchestrator/.env contains ANTHROPIC_API_KEY.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitPlan } from '../orchestrator/lib/molly-plan-emitter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

// Load orchestrator/.env into process.env (minimal parser — no quoting magic)
const envPath = path.join(repoRoot, 'orchestrator', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY missing');
  process.exit(1);
}

const designSystemRoot = path.join(repoRoot, 'design-system');

const PRDS = [
  {
    label: 'tving-oms-archive-delete',
    goal: '예약형 주문 리스트 페이지의 보관 탭 옆에 삭제 탭을 만들고 삭제된 주문들을 모아서 보여줘',
    client: 'tving',
    routeOrPage: '/v1/p/TVING_OMS_DEV/oms/order?type=available',
  },
  {
    label: 'msm-tas-sidebar-beta',
    goal: 'TAS sidebar에 BETA 라벨을 추가해줘',
    client: 'msm-default',
    routeOrPage: '/tas',
  },
];

const t0 = Date.now();
const results = [];

for (const [idx, prd] of PRDS.entries()) {
  console.log(`\n[smoke ${idx + 1}/${PRDS.length}] "${prd.label}"`);
  const start = Date.now();
  try {
    const plan = await emitPlan(
      { goal: prd.goal, client: prd.client, routeOrPage: prd.routeOrPage },
      { designSystemRoot, surface: `smoke-t1.2-${idx + 1}` },
    );
    const elapsed = Date.now() - start;
    const refs = plan.referenced_components || [];
    const unresolved = plan.unresolved_components || [];
    const planItems = plan.plan_items || [];
    console.log(`  ✅ elapsed=${(elapsed / 1000).toFixed(1)}s items=${planItems.length} refs=${refs.length} unresolved=${unresolved.length}`);
    if (refs.length) console.log(`     refs: ${refs.map((r) => r.name).join(', ')}`);
    if (unresolved.length) console.log(`     unresolved: ${unresolved.map((u) => u.intent).join(' | ')}`);
    results.push({ label: prd.label, ok: true, elapsed, planItems: planItems.length, refs: refs.length, unresolved: unresolved.length, summary: plan.summary });
  } catch (err) {
    console.log(`  ❌ ${err.message}`);
    results.push({ label: prd.label, ok: false, error: err.message });
  }
}

console.log(`\n[smoke total] ${(Date.now() - t0) / 1000}s`);
console.log('\nSummary:');
for (const r of results) {
  if (r.ok) {
    console.log(`  ${r.label}: items=${r.planItems} refs=${r.refs} unresolved=${r.unresolved}`);
    console.log(`    summary: ${(r.summary || '').slice(0, 120)}`);
  } else {
    console.log(`  ${r.label}: FAIL — ${r.error}`);
  }
}
