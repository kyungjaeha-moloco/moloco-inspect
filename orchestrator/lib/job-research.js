/**
 * Job research lib (J7).
 *
 * Plan: docs/superpowers/plans/2026-05-12-research-parallelism.md
 *
 * Before each task's coder adapter fires, this module:
 *   1. Builds 0-5 focused research questions about the task (single
 *      Anthropic Sonnet call — the only direct API call).
 *   2. Dispatches each question as a read-only Claude Code subprocess
 *      in parallel (bounded by RESEARCH_PARALLELISM, default 2).
 *   3. Aggregates the answers into a structured bundle the coder
 *      receives as pre-context.
 *
 * Failure semantics: any failure (query-builder error, subprocess
 * timeout, parse failure) is isolated per-query. The task pipeline
 * is never blocked — runResearch always resolves, never rejects.
 *
 * Subprocess hygiene:
 *   - 60s per-query wall-clock; SIGTERM then SIGKILL after 3s grace
 *   - 90s aggregate cap across all queries
 *   - stdout/stderr captured to orchestrator/logs/research/<jobId>-<taskId>-q<n>.log
 *   - cwd = repo root (so Glob/Grep/Read see design-system + playground-app
 *     + dashboard + chrome-extension etc. at the same time)
 *
 * Testability: spawnFn + fetchFn are injectable via opts; tests use
 * fakes that don't touch the network or the shell.
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordEvent } from './molly-metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const LOG_DIR = path.resolve(REPO_ROOT, 'orchestrator/logs/research');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const QUERY_BUILDER_DEFAULT_MODEL = 'claude-sonnet-4-20250514';

// Budgets — tunable via env so ops can dial back if Anthropic ITPM gets
// tight or if we land on a slower account tier. Values match the plan §
// Failure handling + Subprocess hygiene.
const PER_QUERY_TIMEOUT_MS = Number(process.env.RESEARCH_QUERY_TIMEOUT_MS) || 60_000;
const AGGREGATE_TIMEOUT_MS = Number(process.env.RESEARCH_AGGREGATE_TIMEOUT_MS) || 90_000;
const KILL_GRACE_MS = 3_000;
const MAX_QUERIES = 5;
const DEFAULT_PARALLELISM = Number(process.env.RESEARCH_PARALLELISM) || 2;
const ALLOWED_TOOLS = 'Glob,Grep,Read,Task';

const QUERY_BUILDER_SYSTEM_PROMPT = `You are a research-question planner for an AI coding agent. The coder is about to write code for ONE task; your job is to emit focused retrieval questions the orchestrator will run *before* the coder starts, so the coder begins with context instead of cold.

The codebase you can refer to (the orchestrator runs at the repository root):
- design-system/ — JSON design system (tokens.json, components.json, patterns.json, api-ui-contracts.json, conventions.json)
- playground-app/ — the playground UI (Vite + React + TS)
- dashboard/ — operational dashboard
- chrome-extension/ — Slack/Chrome extension
- orchestrator/ — this server (the coder will rarely modify; safe to reference)
- msm-portal — symlink to the Tving product code (apps/tving, apps/onboard-demo, apps/msm-default)

Output a JSON object with shape:
\`\`\`json
{ "queries": [ { "question": "<full English question, 1 sentence, ≤200 chars>", "scope": "<one of: design-system|playground-app|dashboard|chrome-extension|msm-portal|orchestrator|repo>" } ] }
\`\`\`

Rules:
1. **0 to 5 questions.** Hard cap 5. For trivial / cosmetic tasks (label change, color tweak, single-file rename) emit **0** — \`{ "queries": [] }\` is a valid, encouraged answer.
2. Each question must be answerable by reading a handful of files / running grep, **not** by reasoning. Examples of GOOD: "Find 2-3 existing list pages in src/apps/tving/ and return file paths plus the patterns they use." Examples of BAD: "Decide which approach is better."
3. Prefer questions that surface *concrete file paths*, *concrete pattern IDs*, *concrete entity mappings*. The coder benefits most from "go look here" pointers.
4. Skip questions whose answer is trivially obvious from the task description.
5. \`scope\` is metadata only — it tells operators which area of the codebase each question targets. It does not gate which directories the subprocess can read.

Return only the JSON, no prose.`;

// ── Query builder (single Anthropic call) ───────────────────────────

/**
 * Generate 0-5 focused research questions for a task.
 *
 * @param {{ title: string, description: string }} task
 * @param {{
 *   fetchFn?: typeof fetch,
 *   apiKey?: string,
 *   model?: string,
 * }} [opts]
 * @returns {Promise<Array<{ question: string, scope: string }>>}
 */
export async function buildResearchQueries(task, opts = {}) {
  if (!task?.title) return [];
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Without an API key, return empty queries — the orchestrator can still
    // call the coder adapter without a research bundle.
    return [];
  }
  const fetchFn = opts.fetchFn ?? fetch;
  const model = opts.model ?? process.env.RESEARCH_MODEL ?? QUERY_BUILDER_DEFAULT_MODEL;

  const userMessage = [
    `Task title: ${task.title}`,
    '',
    'Task description:',
    String(task.description ?? '').slice(0, 2000),
  ].join('\n');

  const t0 = Date.now();
  let resp;
  try {
    resp = await fetchFn(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: [
          {
            type: 'text',
            text: QUERY_BUILDER_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    recordEvent('lib_call', {
      lib: 'research_query_builder',
      latency_ms: Date.now() - t0,
      error: `fetch failed: ${String(err?.message ?? err).slice(0, 120)}`,
    });
    return [];
  }
  if (!resp.ok) {
    recordEvent('lib_call', {
      lib: 'research_query_builder',
      latency_ms: Date.now() - t0,
      error: `http ${resp.status}`,
    });
    return [];
  }
  // resp.json() can throw when the server returns a 200 with a non-JSON
  // body. Guard the parse so runResearch's "always resolves" contract
  // (no thrown rejection from this lib) holds end-to-end (review MAJOR).
  let data;
  try {
    data = await resp.json();
  } catch (err) {
    recordEvent('lib_call', {
      lib: 'research_query_builder',
      latency_ms: Date.now() - t0,
      error: `json parse failed: ${String(err?.message ?? err).slice(0, 120)}`,
    });
    return [];
  }
  const text = data?.content?.[0]?.text ?? '';
  const queries = parseQueries(text);

  const u = data?.usage || {};
  recordEvent('lib_call', {
    lib: 'research_query_builder',
    model,
    latency_ms: Date.now() - t0,
    queryCount: queries.length,
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_create: u.cache_creation_input_tokens ?? 0,
    cache_read: u.cache_read_input_tokens ?? 0,
  });
  return queries;
}

function parseQueries(text) {
  // Extract first JSON object via brace counting (same approach as molly-classifier).
  const start = text.indexOf('{');
  if (start === -1) return [];
  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return [];
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const raw = Array.isArray(parsed?.queries) ? parsed.queries : [];
  return raw
    .slice(0, MAX_QUERIES)
    .map((q) => ({
      question: typeof q?.question === 'string' ? q.question.trim().slice(0, 400) : '',
      scope: typeof q?.scope === 'string' ? q.scope.trim().slice(0, 32) : 'repo',
    }))
    .filter((q) => q.question.length > 0);
}

// ── Subprocess research (one query per subprocess) ──────────────────

/**
 * Run a single research question as a read-only Claude Code subprocess.
 *
 * Resolves to a structured outcome — never rejects. Caller branches on
 * `outcome` ('ok' | 'timeout' | 'error') to decide whether to include
 * the answer in the bundle.
 *
 * @param {{
 *   question: string,
 *   scope: string,
 *   jobId: string,
 *   taskId: string,
 *   queryIndex: number,
 * }} params
 * @param {{
 *   spawnFn?: typeof spawn,
 *   timeoutMs?: number,
 *   cwd?: string,
 *   logDir?: string,
 * }} [opts]
 * @returns {Promise<{
 *   question: string,
 *   scope: string,
 *   outcome: 'ok' | 'timeout' | 'error',
 *   answer: string,
 *   stderr: string,
 *   ms: number,
 *   logPath: string,
 * }>}
 */
export function runResearchQuery(params, opts = {}) {
  const { question, scope, jobId, taskId, queryIndex } = params;
  const spawnFn = opts.spawnFn ?? spawn;
  const timeoutMs = opts.timeoutMs ?? PER_QUERY_TIMEOUT_MS;
  const cwd = opts.cwd ?? REPO_ROOT;
  const logDir = opts.logDir ?? LOG_DIR;
  const logPath = path.resolve(logDir, `${jobId}-${taskId}-q${queryIndex}.log`);

  // NOTE: this function is intentionally NOT marked `async` — that
  // would force `spawnFn` and listener attachment behind a microtask,
  // making tests that emit data synchronously after calling this
  // function race against the listener registration. We do all mkdir
  // + writeFile work inside the 'exit' handler so listeners attach
  // before the caller's next statement runs.

  const t0 = Date.now();
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnFn('claude', [
        '-p', question,
        '--allowedTools', ALLOWED_TOOLS,
      ], { cwd });
    } catch (err) {
      const outcome = { question, scope, outcome: 'error', answer: '', stderr: String(err?.message ?? err), ms: Date.now() - t0, logPath };
      // Try to persist a log file but don't block on it.
      (async () => {
        try {
          await mkdir(logDir, { recursive: true });
          await writeFile(logPath, `[spawn-error] ${outcome.stderr}\n`);
        } catch { /* logging best-effort */ }
      })();
      recordResearchSubprocessEvent(outcome, { jobId, taskId, queryIndex });
      resolve(outcome);
      return;
    }

    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;
    let killGraceTimer = null;
    let resolved = false; // guard so 'error' + 'exit' double-fire is safe
    child.stdout?.on('data', (d) => { stdout += String(d); });
    child.stderr?.on('data', (d) => { stderr += String(d); });

    const timer = setTimeout(() => {
      killedByTimeout = true;
      try { child.kill('SIGTERM'); } catch { /* already dead */ }
      killGraceTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already dead */ }
      }, KILL_GRACE_MS);
    }, timeoutMs);

    // External abort (aggregate-timeout from runResearch) — kill the
    // child and let the 'exit' handler resolve the promise normally.
    const onAbort = () => {
      killedByTimeout = true;
      try { child.kill('SIGTERM'); } catch { /* already dead */ }
      killGraceTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already dead */ }
      }, KILL_GRACE_MS);
    };
    if (opts.signal) {
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    const cleanup = () => {
      clearTimeout(timer);
      if (killGraceTimer) clearTimeout(killGraceTimer);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
    };

    // Single resolution path. Handles both happy `exit` and stuck-error
    // cases where `exit` may not fire (post-spawn EPERM on some
    // platforms — review MAJOR). `resolved` guard makes double-fire
    // safe; both 'error' and 'exit' funnel through here.
    const finalize = async (kind, code, signal) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      const ms = Date.now() - t0;
      const outcome = killedByTimeout
        ? 'timeout'
        : (kind === 'exit'
            ? (code === 0 ? 'ok' : 'error')
            : 'error');
      const answer = stdout.trim();
      try {
        await mkdir(logDir, { recursive: true });
        await writeFile(
          logPath,
          [
            `[${kind}] code=${code} signal=${signal} outcome=${outcome} ms=${ms}`,
            '--- stdout ---',
            stdout,
            '--- stderr ---',
            stderr,
          ].join('\n'),
        );
      } catch {
        // Logging failure must not break the research flow.
      }
      const result = { question, scope, outcome, answer, stderr, ms, logPath };
      recordResearchSubprocessEvent(result, { jobId, taskId, queryIndex });
      resolve(result);
    };

    child.on('error', (err) => {
      stderr += `[child-error] ${err?.message ?? err}\n`;
      // On most platforms libuv emits 'exit' right after 'error'. If
      // it doesn't (e.g. post-spawn EPERM), still resolve via the
      // microtask fallback so we don't leak listeners or the per-query
      // timer (review MAJOR).
      queueMicrotask(() => { if (!resolved) finalize('error', null, null); });
    });

    child.on('exit', (code, signal) => {
      finalize('exit', code, signal);
    });
  });
}

function recordResearchSubprocessEvent(result, ctx = {}) {
  recordEvent('lib_call', {
    lib: 'research_query',
    jobId: ctx.jobId,
    taskId: ctx.taskId,
    queryIndex: ctx.queryIndex,
    scope: result.scope,
    outcome: result.outcome,
    latency_ms: result.ms,
    answer_chars: result.answer.length,
    stderr_chars: (result.stderr || '').length,
  });
}

// ── Orchestration ───────────────────────────────────────────────────

/**
 * Run the full research step for one task. Builds queries, dispatches
 * them under a parallelism cap, returns an aggregated bundle.
 *
 * Always resolves — never rejects. Returns an empty/partial bundle on
 * any failure so the caller can pass `bundle ?? null` down to the coder.
 *
 * @param {{
 *   id: string,
 *   title: string,
 *   description: string,
 * }} task
 * @param {{
 *   jobId: string,
 * }} ctx
 * @param {{
 *   spawnFn?: typeof spawn,
 *   fetchFn?: typeof fetch,
 *   parallelism?: number,
 *   aggregateTimeoutMs?: number,
 *   apiKey?: string,
 *   model?: string,
 *   cwd?: string,
 *   logDir?: string,
 * }} [opts]
 * @returns {Promise<{
 *   queries: Array<{ question: string, scope: string, outcome: string, answer: string, ms: number, logPath: string }>,
 *   totalMs: number,
 *   builderQueryCount: number,
 *   parallelism: number,
 * }>}
 */
export async function runResearch(task, ctx, opts = {}) {
  if (!task?.id || !ctx?.jobId) {
    return { queries: [], totalMs: 0, builderQueryCount: 0, parallelism: 0 };
  }
  const parallelism = Math.max(
    1,
    Math.min(MAX_QUERIES, opts.parallelism ?? DEFAULT_PARALLELISM),
  );
  const aggregateTimeoutMs = opts.aggregateTimeoutMs ?? AGGREGATE_TIMEOUT_MS;

  const t0 = Date.now();
  const queries = await buildResearchQueries(task, {
    fetchFn: opts.fetchFn,
    apiKey: opts.apiKey,
    model: opts.model,
  });
  if (queries.length === 0) {
    const bundle = {
      queries: [],
      totalMs: Date.now() - t0,
      builderQueryCount: 0,
      parallelism,
    };
    recordResearchOrchestrationEvent(ctx.jobId, task.id, bundle);
    return bundle;
  }

  // Pool-based parallel dispatch. Each worker pulls the next index from
  // a shared cursor; pool size = parallelism. An AbortController fires
  // when the aggregate timeout elapses — runResearchQuery listens to it
  // and kills its child, so workers can unblock and return cleanly.
  /** @type {Array<{question:string,scope:string,outcome:string,answer:string,stderr:string,ms:number,logPath:string}>} */
  const results = new Array(queries.length);
  let cursor = 0;
  const abortController = new AbortController();

  const worker = async () => {
    while (true) {
      if (abortController.signal.aborted) return;
      const idx = cursor++;
      if (idx >= queries.length) return;
      const q = queries[idx];
      const r = await runResearchQuery(
        { question: q.question, scope: q.scope, jobId: ctx.jobId, taskId: task.id, queryIndex: idx },
        {
          spawnFn: opts.spawnFn,
          cwd: opts.cwd,
          logDir: opts.logDir,
          signal: abortController.signal,
        },
      );
      results[idx] = r;
    }
  };

  const aggregateTimerHandle = setTimeout(
    () => abortController.abort(),
    aggregateTimeoutMs,
  );

  await Promise.allSettled(Array.from({ length: parallelism }, () => worker()));
  clearTimeout(aggregateTimerHandle);

  // Convert any holes (queries never reached because the abort fired
  // before the worker advanced to them) to synthetic outcome rows so
  // the bundle shape stays consistent.
  for (let i = 0; i < queries.length; i++) {
    if (!results[i]) {
      results[i] = {
        question: queries[i].question,
        scope: queries[i].scope,
        outcome: 'timeout',
        answer: '',
        stderr: 'aggregate timeout',
        ms: aggregateTimeoutMs,
        logPath: '',
      };
    }
  }

  const bundle = {
    queries: results.map((r) => ({
      question: r.question,
      scope: r.scope,
      outcome: r.outcome,
      answer: r.answer,
      // stderr surfaced so callers can debug error / timeout outcomes
      // without grepping log files (review MINOR). Bounded at 1 KB —
      // anything longer is in the log file at `logPath`.
      stderr: typeof r.stderr === 'string' ? r.stderr.slice(0, 1024) : '',
      ms: r.ms,
      logPath: r.logPath,
    })),
    totalMs: Date.now() - t0,
    builderQueryCount: queries.length,
    parallelism,
  };
  recordResearchOrchestrationEvent(ctx.jobId, task.id, bundle);
  return bundle;
}

// ── Bundle formatter (used by the runner-adapter integration) ──────

/**
 * Format a research bundle as a Markdown pre-context block to prepend
 * onto the coder adapter's user prompt. Plan §Slice C requires:
 *   - bullet-style summary of the research findings
 *   - ≤3 KB cap by default (env-tunable so ops can dial)
 *   - returns '' on empty / null / all-non-ok bundles (caller decides)
 *
 * Truncation policy when the block exceeds the byte cap:
 *   1. Drop tail findings one at a time, smallest-impact first, until fits.
 *   2. If even the first finding is too big, truncate its answer text and
 *      flag the truncation in the footer.
 *
 * @param {{
 *   queries?: Array<{ question:string, scope:string, outcome:string, answer:string, ms:number }>
 * } | null | undefined} bundle
 * @param {{ maxBytes?: number }} [opts]
 * @returns {string}
 */
export function formatBundleForPrompt(bundle, opts = {}) {
  const maxBytes = opts.maxBytes ?? 3072;
  if (!bundle || !Array.isArray(bundle.queries)) return '';
  const ok = bundle.queries.filter(
    (q) => q && q.outcome === 'ok' && typeof q.answer === 'string' && q.answer.trim().length > 0,
  );
  if (ok.length === 0) return '';

  const sections = ok.map(formatBundleSection);

  // 1. Try the full block first.
  const full = wrapBlock(sections, 0);
  if (Buffer.byteLength(full, 'utf8') <= maxBytes) return full;

  // 2. Drop tail sections one at a time until it fits.
  for (let n = sections.length - 1; n >= 1; n--) {
    const candidate = wrapBlock(sections.slice(0, n), sections.length - n);
    if (Buffer.byteLength(candidate, 'utf8') <= maxBytes) return candidate;
  }

  // 3. Single section is too big — truncate its answer text.
  const first = ok[0];
  const header = `### Research finding 1: ${first.question}\n[scope: ${first.scope} | ${first.ms}ms]\n`;
  const wrapHead = `## Research context (gathered before this task)\n\n`;
  const wrapFoot = `\n\n(Truncated: ${ok.length} finding(s) total; only the first shown, and its answer was clipped.)\n\n`;
  const overhead = Buffer.byteLength(wrapHead + header + '… [truncated]' + wrapFoot, 'utf8');
  const answerBudget = Math.max(100, maxBytes - overhead);
  const truncatedAnswer = first.answer.slice(0, answerBudget) + '… [truncated]';
  return wrapHead + header + truncatedAnswer + wrapFoot;
}

function formatBundleSection(q, idx) {
  return `### Research finding ${idx + 1}: ${q.question}\n[scope: ${q.scope} | ${q.ms}ms]\n${q.answer.trim()}`;
}

function wrapBlock(sections, omittedCount) {
  const head = `## Research context (gathered before this task)\n\n`;
  const foot = omittedCount > 0
    ? `\n\n(Truncated: ${omittedCount} additional finding(s) omitted. End of research context — proceed with the task description below.)\n\n`
    : `\n\n(End of research context — proceed with the task description below.)\n\n`;
  return head + sections.join('\n\n') + foot;
}

function recordResearchOrchestrationEvent(jobId, taskId, bundle) {
  recordEvent('lib_call', {
    lib: 'research_orchestration',
    jobId,
    taskId,
    queryCount: bundle.builderQueryCount,
    parallelism: bundle.parallelism,
    totalMs: bundle.totalMs,
    okCount: bundle.queries.filter((q) => q.outcome === 'ok').length,
    timeoutCount: bundle.queries.filter((q) => q.outcome === 'timeout').length,
    errorCount: bundle.queries.filter((q) => q.outcome === 'error').length,
  });
}
