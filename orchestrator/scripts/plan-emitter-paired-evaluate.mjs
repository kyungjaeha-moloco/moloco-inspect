#!/usr/bin/env node
//
// Plan-emitter paired evaluate — reads a paired-smoke output JSON and runs the
// V3 gate from plan v2 §6:
//   - Title rubric (plan v2 §3.1 5 categories of forbidden tokens, regex'd)
//   - Body preservation (each plan_item.description retains at least one
//     dev-detail token — file path / component name / import)
//   - Summary table for handoff
//
// Usage:
//   node scripts/plan-emitter-paired-evaluate.mjs docs/measurements/plan-emitter-paired-after-2026-05-19.json

import fs from 'node:fs';
import path from 'node:path';

// plan v2/v3 — forbidden tokens (apply to both title AND description per v3 rule).
// Decomposer SYSTEM_PROMPT forbidden jargon list + identifier/path/import patterns.
const FORBIDDEN_TOKENS = [
  { name: 'identifier', re: /\b(MC|use|get)[A-Z][a-zA-Z]+/ },
  { name: 'file_path', re: /(\.tsx|\.ts|\.json|src\/)/ },
  { name: 'import_stmt', re: /\bimport\s+\{/i },
  {
    name: 'framework_keyword',
    re: /\b(hook|state|props|prop|render|DOM|ref|z-index|useState|useEffect|useQuery|tRPC)\b/i,
  },
  { name: 'backtick_code', re: /`[A-Za-z_][A-Za-z0-9_.\-]*`/ },
];

function checkForbidden(text) {
  return FORBIDDEN_TOKENS.filter((p) => p.re.test(text));
}

function evaluate(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`\n=== V3 evaluation: ${path.basename(file)} (label=${data.label}) ===\n`);

  let totalItems = 0;
  let titleViolations = 0;
  let descriptionViolations = 0;
  let devRefsMissing = 0;
  let totalNewBuild = 0;
  let totalUnresolvedPrds = 0;
  let unresolvedWithoutNewBuild = 0;
  const perPrd = [];

  for (const result of data.results) {
    const perPrdSummary = {
      id: result.id,
      ok: result.ok,
      items: 0,
      titleFails: 0,
      descFails: 0,
      refsMissing: 0,
      newBuildCount: 0,
      unresolvedCount: 0,
    };
    if (!result.ok) {
      console.log(`[${result.id}] SKIPPED — emitPlan failed: ${result.error}`);
      perPrd.push(perPrdSummary);
      continue;
    }
    const items = result.plan?.plan_items ?? [];
    const summary = result.plan?.summary ?? '';
    const refs = result.plan?.referenced_components ?? [];
    const unresolved = result.plan?.unresolved_components ?? [];
    const newBuildItems = items.filter((it) => it?.is_new_build === true);
    perPrdSummary.newBuildCount = newBuildItems.length;
    perPrdSummary.unresolvedCount = unresolved.length;
    totalNewBuild += newBuildItems.length;
    if (unresolved.length > 0) {
      totalUnresolvedPrds++;
      // Plan v3 §4.7 — post-process must lift is_new_build to true on at least
      // one item when unresolved_components is non-empty. If every item is
      // is_new_build=false but unresolved>0, the safety net failed.
      if (newBuildItems.length === 0) {
        unresolvedWithoutNewBuild++;
      }
    }
    console.log(`[${result.id}] ${items.length} items — dt=${result.dt_ms}ms`);
    console.log(`  summary: ${summary.slice(0, 120)}${summary.length > 120 ? '…' : ''}`);
    console.log(`  schema dev refs: ${refs.length} referenced + ${unresolved.length} unresolved`);
    console.log(`  is_new_build: ${newBuildItems.length}/${items.length} items flagged`);
    perPrdSummary.items = items.length;

    if (refs.length === 0 && unresolved.length === 0) {
      perPrdSummary.refsMissing = 1;
      devRefsMissing++;
      console.log(`  ⚠ no component refs in schema (downstream lost dev signal)`);
    }

    for (let i = 0; i < items.length; i++) {
      totalItems++;
      const item = items[i];
      const title = item.title ?? '';
      const description = item.description ?? '';
      const titleHits = checkForbidden(title);
      const descHits = checkForbidden(description);

      const titleBadge = titleHits.length > 0 ? '❌' : '✓';
      const descBadge = descHits.length > 0 ? '❌' : '✓';
      console.log(`  ${i + 1}. ${titleBadge} title: ${title}`);
      if (titleHits.length > 0) {
        titleViolations++;
        perPrdSummary.titleFails++;
        console.log(`     ↳ title violates: ${titleHits.map((h) => h.name).join(', ')}`);
      }
      console.log(`     ${descBadge} description: ${description.slice(0, 140)}${description.length > 140 ? '…' : ''}`);
      if (descHits.length > 0) {
        descriptionViolations++;
        perPrdSummary.descFails++;
        const samples = descHits.map((h) => {
          const m = description.match(h.re);
          return `${h.name}=${m ? m[0] : '?'}`;
        });
        console.log(`     ↳ description violates: ${samples.join(', ')}`);
      }
    }
    console.log('');
    perPrd.push(perPrdSummary);
  }

  console.log(`=== Summary ===`);
  console.log(`Total plan_items: ${totalItems}`);
  console.log(
    `Title violations: ${titleViolations}/${totalItems} ${titleViolations === 0 ? '✓ PASS' : '❌ FAIL'}`,
  );
  console.log(
    `Description violations: ${descriptionViolations}/${totalItems} ${
      descriptionViolations === 0 ? '✓ PASS' : '❌ FAIL'
    }`,
  );
  console.log(
    `Dev refs missing (schema): ${devRefsMissing}/${perPrd.filter((p) => p.ok).length} ${
      devRefsMissing === 0 ? '✓ PASS' : '⚠ downstream may struggle'
    }`,
  );
  const cleanPrds = perPrd.filter((p) => p.ok && p.titleFails === 0 && p.descFails === 0).length;
  const totalOkPrds = perPrd.filter((p) => p.ok).length;
  console.log(
    `Per-PRD fully clean (title + description): ${cleanPrds}/${totalOkPrds} ${
      cleanPrds === totalOkPrds ? '✓ PASS' : '— partial'
    }`,
  );

  // Plan v3 — is_new_build signal + safety-net audit.
  const newBuildRatio = totalItems > 0 ? totalNewBuild / totalItems : 0;
  console.log(
    `is_new_build coverage: ${totalNewBuild}/${totalItems} items (${(newBuildRatio * 100).toFixed(1)}% ratio) ${
      newBuildRatio > 0.5 ? '⚠ >50% — heuristic over-flagging' : '✓ within bounds'
    }`,
  );
  console.log(
    `Post-process safety net: ${
      unresolvedWithoutNewBuild === 0
        ? `✓ PASS — every PRD with unresolved>0 had at least one is_new_build:true item (${totalUnresolvedPrds} PRDs)`
        : `❌ FAIL — ${unresolvedWithoutNewBuild}/${totalUnresolvedPrds} PRDs with unresolved>0 had no is_new_build:true items`
    }`,
  );
  console.log('');
  return {
    totalItems,
    titleViolations,
    descriptionViolations,
    devRefsMissing,
    perPrd,
    cleanPrds,
    totalOkPrds,
    totalNewBuild,
    newBuildRatio,
    unresolvedWithoutNewBuild,
  };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/plan-emitter-paired-evaluate.mjs <paired.json>');
    process.exit(2);
  }
  evaluate(file);
}

main();
