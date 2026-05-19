#!/usr/bin/env node
//
// Plan-emitter paired smoke — fires the 5 PRDs from plan v2 §5 V2 against
// emitPlan() directly, captures the JSON output to disk, and lets the regular
// recordEvent('lib_call', 'plan-emitter', ...) write per-call metrics to
// orchestrator/state/molly-metrics-YYYY-MM-DD.ndjson for cache delta analysis.
//
// Usage:
//   node --env-file-if-exists=.env scripts/plan-emitter-paired-smoke.mjs before
//   node --env-file-if-exists=.env scripts/plan-emitter-paired-smoke.mjs after
//
// Output:
//   docs/measurements/plan-emitter-paired-<label>-<YYYY-MM-DD>.json — full plan JSON per PRD
//
// Methodology (plan v2 §5 V2, momus B1):
//   - 1 warmup call (PRD #1 again) absorbs cold cache_create after deploy
//   - 5 measurement calls for each PRD; metrics include cache_read / cache_create
//   - Run "before" with current code, then deploy V1 rule change, then "after"

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { emitPlan } from '../lib/molly-plan-emitter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ORCHESTRATOR_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ORCHESTRATOR_DIR, '..');

const DESIGN_SYSTEM_ROOT =
  process.env.DESIGN_SYSTEM_ROOT || path.join(REPO_ROOT, 'design-system');
const REQUEST_SCHEMA_PATH = path.join(DESIGN_SYSTEM_ROOT, 'src', 'pm-sa-request-schema.json');

const PRDS = [
  {
    id: 'creative-review-deleted',
    goal: '크리에이티브 리뷰 페이지에 삭제된 소재를 보여줄 수 있도록 탭을 만들어줘',
    client: 'tving',
    routeOrPage: '/oms/creative-review',
    language: 'ko',
  },
  {
    id: 'campaign-list-filter',
    goal: '캠페인 리스트 페이지에 상태(running/paused/draft)별 필터를 추가해줘',
    client: 'tving',
    routeOrPage: '/oms/campaign',
    language: 'ko',
  },
  {
    id: 'creative-detail-status',
    goal: 'Creative Detail 페이지의 status dropdown에 "보류" 상태 옵션 추가',
    client: 'tving',
    routeOrPage: '/oms/creative',
    language: 'ko',
  },
  {
    id: 'audience-export',
    goal: 'Audience 페이지에 CSV export 버튼 추가',
    client: 'tving',
    routeOrPage: '/oms/audience',
    language: 'ko',
  },
  {
    id: 'adgroup-column',
    goal: 'Ad Group 테이블에 column 보이기/숨기기 토글 기능 추가',
    client: 'tving',
    routeOrPage: '/oms/adgroup',
    language: 'ko',
  },
];

const ctx = {
  designSystemRoot: DESIGN_SYSTEM_ROOT,
  requestSchemaPath: REQUEST_SCHEMA_PATH,
};

async function main() {
  const label = process.argv[2];
  if (!label || !['before', 'after'].includes(label)) {
    console.error('Usage: node scripts/plan-emitter-paired-smoke.mjs <before|after>');
    process.exit(2);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set — load .env or pass via --env-file-if-exists');
    process.exit(2);
  }

  const outDir = path.join(REPO_ROOT, 'docs', 'measurements');
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n=== Plan-emitter paired smoke [${label}] — DS=${DESIGN_SYSTEM_ROOT} ===`);

  console.log('\n[warmup] firing PRD #1 once to absorb cold cache_create...');
  try {
    const t0 = Date.now();
    await emitPlan(
      { goal: PRDS[0].goal, client: PRDS[0].client, routeOrPage: PRDS[0].routeOrPage },
      ctx,
    );
    console.log(`[warmup] done (${Date.now() - t0}ms)`);
  } catch (e) {
    console.error(`[warmup] FAILED: ${e.message}`);
    process.exit(1);
  }

  const results = [];
  for (const prd of PRDS) {
    console.log(`\n[${prd.id}] emitPlan...`);
    const t0 = Date.now();
    try {
      const plan = await emitPlan(
        { goal: prd.goal, client: prd.client, routeOrPage: prd.routeOrPage },
        ctx,
      );
      const dt = Date.now() - t0;
      const titles = (plan?.plan_items ?? []).map((i) => i.title);
      console.log(`  ok ${dt}ms — ${titles.length} items`);
      titles.forEach((t, i) => console.log(`    ${i + 1}. ${t}`));
      results.push({ id: prd.id, goal: prd.goal, ok: true, dt_ms: dt, plan });
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
      results.push({ id: prd.id, goal: prd.goal, ok: false, error: e.message });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const outFile = path.join(outDir, `plan-emitter-paired-${label}-${today}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ label, ts: Date.now(), prds: PRDS, results }, null, 2));
  console.log(`\nsaved: ${outFile}`);
  console.log(`metrics: orchestrator/state/molly-metrics-${today}.ndjson (filter type=lib_call lib=plan-emitter)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
