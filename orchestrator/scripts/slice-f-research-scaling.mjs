#!/usr/bin/env node
/**
 * Slice F-lite — research-step scaling measurement.
 *
 * Compares wall-clock + query distribution at RESEARCH_PARALLELISM = 1 / 2 / 3
 * against a fixed real task (DR Line Item creation form from job b3048239).
 *
 * Skips the coder adapter entirely — this measurement isolates the research
 * step. Full coder A/B with RESEARCH_ENABLED=0 vs =1 is a future session;
 * that needs real job dispatch + docker sandbox + significant LLM spend.
 *
 * Plan: docs/superpowers/plans/2026-05-12-research-parallelism.md §Slice F
 * (this script implements the "research isolation" portion of it).
 *
 * Output: a Markdown table to stdout + a CSV file under
 *   docs/superpowers/handoffs/2026-05-12-slice-f-research-scaling.csv
 *
 * Cost note: each subprocess is one `claude` CLI invocation. Per-subprocess
 * token cost (~12 K input + ~500 output ≈ ~$0.05 at Sonnet pricing) is
 * estimated, not measured — Claude Code's per-call usage is opaque to the
 * orchestrator. The query-builder Anthropic call IS measured (it goes
 * through recordEvent + we read the NDJSON).
 *
 * Total cost: ~$0.15 across 3 configs against a single representative task.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/slice-f-research-scaling.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import { runResearch } from '../lib/job-research.js';
import { loadEvents } from '../lib/molly-metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// Sonnet 4 approx pricing (per million tokens). Subject to change in
// the official price list; update molly-pricing.js if it drifts.
const PRICE_PER_M_INPUT_USD = 3;
const PRICE_PER_M_OUTPUT_USD = 15;
const EST_INPUT_PER_SUBPROCESS = 12_000;  // ~10K preamble + ~2K query
const EST_OUTPUT_PER_SUBPROCESS = 500;

// Real task from job b3048239 (the DR Line Item PRD).
const TASK = {
  id: 'slicef-t1',
  title: 'Add DR Line Item creation form',
  description: [
    "When this task is done, an AdOps user will see a new option to create a DR Line Item (campaign template) and a form to fill in all DR-specific parameters.",
    "",
    "The form must collect: (1) Campaign goal type, fixed to 'Click optimized' and shown as read-only. (2) Base CPM bid as a required numeric input used as the auction bid base. (3) Tracking link field for App (MMP) tracking and Web Pixel ID field for Web tracking — at least one of the two must be provided. (4) Targeting conditions section, optional, with a helper note 'Strongly recommended to leave empty'. (5) Device targeting where CTV is disabled and cannot be selected (with a note explaining CTV is excluded for the MVP phase). (6) Flight start date and end date, both required. (7) Daily budget cap and total budget cap, both required numeric inputs. The form should save the new DR Line Item to the list of templates.",
    "",
    "In this stage, the actual creative attachment and the Order submission flow will not work yet.",
  ].join('\n'),
};

const CONFIGS = [
  { parallelism: 3 },
  { parallelism: 4 },
  { parallelism: 5 },
];

// Bumped further from the second run's 180s/600s budgets so timeouts
// no longer mask true scaling behaviour. The second run revealed that
// P=3 had MORE timeouts than P=2 (3/5 ok vs 4/5 ok) — possibly because
// per-query budget was still tight at 180s OR because Anthropic API
// queues at higher parallelism. This run isolates the question by
// giving so much headroom that timeouts are effectively impossible.
// If P=3 still has lower ok rate, the cause is API-side, not budget.
const PER_QUERY_TIMEOUT_MS = 300_000;  // 5 min — plenty of headroom
const AGGREGATE_TIMEOUT_MS = 1_800_000; // 30 min — generous

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY not set in env.');
    process.exit(1);
  }

  const runId = `slicef-${Date.now()}`;
  const results = [];

  console.log(`\n== Slice F-lite — research-step scaling ==`);
  console.log(`Task: "${TASK.title}"`);
  console.log(`Run ID: ${runId}\n`);

  for (const cfg of CONFIGS) {
    const jobId = `${runId}-p${cfg.parallelism}`;
    console.log(`→ parallelism=${cfg.parallelism}  (jobId=${jobId})`);
    const tStart = Date.now();
    const bundle = await runResearch(
      TASK,
      { jobId },
      {
        parallelism: cfg.parallelism,
        queryTimeoutMs: PER_QUERY_TIMEOUT_MS,
        aggregateTimeoutMs: AGGREGATE_TIMEOUT_MS,
      },
    );
    const totalMs = Date.now() - tStart;

    const queryEvents = (loadEvents(tStart - 5000) || []).filter(
      (e) =>
        e.type === 'lib_call' &&
        e.jobId === jobId &&
        (e.lib === 'research_query' || e.lib === 'research_query_builder'),
    );
    const builderEvent = queryEvents.find((e) => e.lib === 'research_query_builder');
    const subprocessEvents = queryEvents.filter((e) => e.lib === 'research_query');

    const subOk = subprocessEvents.filter((e) => e.outcome === 'ok').length;
    const subTimeout = subprocessEvents.filter((e) => e.outcome === 'timeout').length;
    const subError = subprocessEvents.filter((e) => e.outcome === 'error').length;
    const subTotal = subprocessEvents.length;

    // Cost: builder is metered, subprocesses are estimated.
    const builderInUsd = ((builderEvent?.input_tokens ?? 0) / 1e6) * PRICE_PER_M_INPUT_USD;
    const builderOutUsd = ((builderEvent?.output_tokens ?? 0) / 1e6) * PRICE_PER_M_OUTPUT_USD;
    const builderUsd = builderInUsd + builderOutUsd;
    const estSubprocessUsd =
      subOk *
      ((EST_INPUT_PER_SUBPROCESS / 1e6) * PRICE_PER_M_INPUT_USD +
        (EST_OUTPUT_PER_SUBPROCESS / 1e6) * PRICE_PER_M_OUTPUT_USD);
    const totalUsd = builderUsd + estSubprocessUsd;

    const row = {
      parallelism: cfg.parallelism,
      builderQueryCount: bundle.builderQueryCount,
      subprocessTotal: subTotal,
      subprocessOk: subOk,
      subprocessTimeout: subTimeout,
      subprocessError: subError,
      bundleTotalMs: bundle.totalMs,
      scriptTotalMs: totalMs,
      builderUsd: round4(builderUsd),
      estSubprocessUsd: round4(estSubprocessUsd),
      totalUsd: round4(totalUsd),
      builderInputTokens: builderEvent?.input_tokens ?? 0,
      builderOutputTokens: builderEvent?.output_tokens ?? 0,
    };
    results.push(row);
    console.log(
      `   queries=${row.builderQueryCount} (ok=${subOk}/timeout=${subTimeout}/err=${subError})  ` +
        `bundleMs=${row.bundleTotalMs}  scriptMs=${row.scriptTotalMs}  cost≈$${row.totalUsd}\n`,
    );

    // Small breather between configs so any in-flight events flush to NDJSON
    // (recordEvent's fs.appendFile is async) and so we don't slam the API
    // back-to-back at the highest parallelism setting.
    await sleep(2000);
  }

  // ── Output ────────────────────────────────────────────────────────
  const tableMd = renderMarkdownTable(results);
  const csv = renderCsv(results);

  console.log('\n== Comparison ==\n');
  console.log(tableMd);

  const outDir = path.resolve(REPO_ROOT, 'docs/superpowers/handoffs');
  await mkdir(outDir, { recursive: true });
  const csvPath = path.join(outDir, '2026-05-12-slice-f-research-scaling.csv');
  await writeFile(csvPath, csv, 'utf8');
  console.log(`\nCSV → ${csvPath}`);
}

function renderMarkdownTable(rows) {
  const headers = [
    'parallelism',
    'queries',
    'ok/to/err',
    'bundleMs',
    'scriptMs',
    'speedup-vs-P1',
    'builder $',
    'est subprocess $',
    'total $',
  ];
  const p1Ms = rows.find((r) => r.parallelism === 1)?.bundleTotalMs;
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ];
  for (const r of rows) {
    const speedup = p1Ms
      ? (p1Ms / Math.max(1, r.bundleTotalMs)).toFixed(2) + '×'
      : '—';
    lines.push(
      `| ${r.parallelism} | ${r.builderQueryCount} | ${r.subprocessOk}/${r.subprocessTimeout}/${r.subprocessError} | ${r.bundleTotalMs} | ${r.scriptTotalMs} | ${speedup} | $${r.builderUsd} | $${r.estSubprocessUsd} | $${r.totalUsd} |`,
    );
  }
  return lines.join('\n');
}

function renderCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => JSON.stringify(r[h] ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}

function round4(n) {
  return Math.round(n * 1e4) / 1e4;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

main().catch((err) => {
  console.error('script failed:', err);
  process.exit(1);
});
