/**
 * Click-to-Inspect Orchestration Server
 *
 * HTTP API that receives PM change requests from Chrome Extension,
 * runs Codex in isolated git worktrees, validates changes, and returns previews.
 *
 * Endpoints:
 *   POST /api/change-request   — submit a new change request
 *   POST /api/prd/ingest       — read PRD link/text and extract current-page change hints
 *   GET  /api/status/:id       — poll status of a request
 *   GET  /api/events/:id       — SSE stream for real-time updates
 *   POST /api/approve/:id      — approve changes → create GitHub PR
 *   GET  /api/diff-view/:id    — self-contained HTML diff viewer + approve/reject
 *   POST /api/reject/:id       — reject with feedback → iterate
 *   GET  /api/screenshot/:id   — serve screenshot image
 *   GET  /api/health            — health check
 */

process.on('uncaughtException', (err) => { console.error('[FATAL uncaughtException]', err); });
process.on('unhandledRejection', (err) => { console.error('[FATAL unhandledRejection]', err); });

import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, exec, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import {
  createSandbox, copyFilesIn, execInContainer, extractDiff,
  extractFile, resetSandbox, removeSandbox,
  allocatePort, releasePort,
  createSandboxClient, waitForServerReady, runAgentPrompt,
  buildSandboxPrompt,
} from '../tooling/sandbox-manager/src/index.js';
import {
  listPlaygrounds, getPlayground, createPlayground,
  hibernatePlayground, resumePlayground, archivePlayground,
  updatePlaygroundHead, serializePlayground,
  checkoutCommit, restorePlaygroundHead, revertCommit, restoreToSha, promotePlayground,
  reattachOnStartup,
} from './lib/playground.js';
import { enqueue as enqueueJob, QueueFullError, queueDepth } from './lib/playground-queue.js';
import {
  createJob, getJob, listJobs, activeJobForPlayground,
  setJobTasks, approvePlan, retryTask, acceptTask, skipTask, unblockTask,
  cancelJob, resumeJob, setJobStatus, markQaPass, setTaskMeta, setQaStrategy,
  setTargetRoute, setQaAutoResult, setJobSlackContext, setJobRisks,
} from './lib/job.js';
import { selectQaStrategy } from './lib/job-qa-strategist.js';
import { runQaStrategyInBackground } from './lib/job-qa-runner.js';
import { runJob as runJobRunner } from './lib/job-runner.js';
import { startMolly } from './lib/molly.js';
import { appendChatMessages, generateMessageId } from './lib/chat-store.js';
import { decomposePrd } from './lib/job-decomposer.js';
import { reviewTaskDiff } from './lib/job-reviewer.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_WORKSPACE_ROOT =
  process.env.SOURCE_WORKSPACE_ROOT || '/Users/kyungjae.ha/Documents/Agent-Design-System';
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const LOCAL_DESIGN_SYSTEM_ROOT = path.join(WORKSPACE_ROOT, 'design-system');
const DEFAULT_PRODUCT_REPO_ROOT = path.join(SOURCE_WORKSPACE_ROOT, 'msm-portal');
const DESIGN_SYSTEM_ROOT = process.env.DESIGN_SYSTEM_ROOT ||
  (fs.existsSync(LOCAL_DESIGN_SYSTEM_ROOT) ? LOCAL_DESIGN_SYSTEM_ROOT : path.join(SOURCE_WORKSPACE_ROOT, 'design-system'));
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const STATE_DIR = path.join(__dirname, 'state');
const ATTACHMENTS_DIR = path.join(__dirname, 'attachments');
const ANALYTICS_DIR = path.join(__dirname, 'analytics');
const REQUEST_HISTORY_PATH = path.join(ANALYTICS_DIR, 'request-history.ndjson');
const REQUEST_SCHEMA_PATH = path.join(DESIGN_SYSTEM_ROOT, 'src', 'pm-sa-request-schema.json');
const PREVIEW_VERIFICATION_PATH = path.join(DESIGN_SYSTEM_ROOT, 'src', 'preview-verification.json');
const PORT = parseInt(process.env.PORT || '3847', 10);
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE || 'moloco-inspect-sandbox:latest';
const SANDBOX_API_KEY = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const OPENCODE_AUTH_PATH = '/tmp/opencode-auth.json';
const HAS_OPENCODE_AUTH = fs.existsSync(OPENCODE_AUTH_PATH);
const OPENCODE_API_KEY = (() => {
  try {
    if (HAS_OPENCODE_AUTH) {
      const auth = JSON.parse(fs.readFileSync(OPENCODE_AUTH_PATH, 'utf8'));
      return auth?.opencode?.key || '';
    }
  } catch {}
  return '';
})();
const SANDBOX_PROVIDER = process.env.SANDBOX_PROVIDER || (SANDBOX_API_KEY.startsWith('sk-ant-') ? 'anthropic' : SANDBOX_API_KEY.startsWith('sk-proj-') ? 'openai' : HAS_OPENCODE_AUTH ? 'opencode' : 'anthropic');
const SANDBOX_MODEL = process.env.SANDBOX_MODEL || (SANDBOX_PROVIDER === 'opencode' ? 'opencode/gpt-5-nano' : SANDBOX_PROVIDER === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-6');
const FORBIDDEN_MUTATION_PATTERNS = [
  /(^|\/)package\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
];

function readJsonFile(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function stripHtmlToText(raw) {
  return String(raw || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|tr|section|article|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function derivePrdTitle({ url, rawText, html }) {
  const headingMatch = String(rawText || '').match(/^#\s+(.+)$/m);
  if (headingMatch?.[1]) return headingMatch[1].trim();

  const titleMatch = String(html || '').match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) return titleMatch[1].trim();

  if (url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '') + ' PRD';
    } catch {
      return 'Linked PRD';
    }
  }

  return 'Pasted PRD notes';
}

function summarizePrdText(rawText) {
  const blocks = String(rawText || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^[-*]\s*$/.test(line));

  if (!blocks.length) return 'No key requirements directly linked to the current page were found in the document yet.';

  return blocks.slice(0, 3).join(' ');
}

function buildPrdChangeCandidates(rawText, pagePath) {
  const pageHints = String(pagePath || '').split('/').filter(Boolean);
  const lines = String(rawText || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const keywords = [
    'must', 'should', 'need', 'change', 'update', 'add', 'remove', 'rename',
    'modify', 'change', 'add', 'delete', 'tab', 'button', 'copy', 'label', 'align', 'filter', 'list',
  ];

  const scored = lines
    .map((line) => {
      const lower = line.toLowerCase();
      let score = 0;
      if (keywords.some((keyword) => lower.includes(keyword))) score += 2;
      if (pageHints.some((hint) => hint && lower.includes(hint.toLowerCase()))) score += 2;
      if (/^[-*•]|^\d+\./.test(line)) score += 1;
      return { line, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 5).map((item) => item.line);
}

function buildPrdOpenQuestions(rawText, pagePath) {
  const questions = [];
  const text = String(rawText || '');

  if (!pagePath) {
    questions.push('It would be good to confirm which parts of this PRD should be applied first to the screen you are currently viewing.');
  }

  if (!/(success criteria|success|완료 기준|성공 기준)/i.test(text)) {
    questions.push('Success criteria are not clearly defined in the document, so additional confirmation may be needed on what to verify in the preview.');
  }

  if (!/(do not|out of scope|제외|범위 밖|하지 않는다)/i.test(text)) {
    questions.push('The out-of-scope boundaries are not clearly defined in the document, so it would be good to re-check constraints in the plan card.');
  }

  return questions.slice(0, 3);
}

async function ingestPrdPayload(payload) {
  const url = String(payload?.url || '').trim();
  const pastedText = String(payload?.pastedText || '').trim();
  const pagePath = String(payload?.pagePath || '').trim();

  let sourceType = 'pasted_text';
  let html = '';
  let rawText = pastedText;

  if (!rawText && url) {
    sourceType = 'link';
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(12000),
      headers: {
        'User-Agent': 'Codex-Click-to-Inspect/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch the PRD link (${response.status}). Please check link access permissions or whether the document is publicly shared.`);
    }

    html = await response.text();
    rawText = stripHtmlToText(html);
  }

  if (!rawText) {
    throw new Error('A PRD link or key requirements text is required.');
  }

  return {
    ok: true,
    sourceType,
    url: url || null,
    title: derivePrdTitle({ url, rawText, html }),
    summary: summarizePrdText(rawText),
    changeCandidates: buildPrdChangeCandidates(rawText, pagePath),
    openQuestions: buildPrdOpenQuestions(rawText, pagePath),
    rawTextLength: rawText.length,
  };
}

function ensureAnalyticsStorage() {
  if (!fs.existsSync(ANALYTICS_DIR)) {
    fs.mkdirSync(ANALYTICS_DIR, { recursive: true });
  }

  if (!fs.existsSync(REQUEST_HISTORY_PATH)) {
    fs.writeFileSync(REQUEST_HISTORY_PATH, '', 'utf8');
  }
}

const REQUEST_SCHEMA = readJsonFile(REQUEST_SCHEMA_PATH, {});
const PREVIEW_VERIFICATION = readJsonFile(PREVIEW_VERIFICATION_PATH, {});
const DEFAULT_VALIDATION_EXPECTATIONS =
  REQUEST_SCHEMA?.ui_form_spec?.recommended_defaults?.validation_expectations ?? [
    'design_system_validate',
    'typecheck',
    'preview_screenshot',
  ];
// Sandbox mode: container handles execution

// ─── State ────────────────────────────────────────────────────────────

const requests = new Map(); // id → RequestState
const sseClients = new Map(); // id → Set<Response>

/**
 * @typedef {Object} RequestState
 * @property {string} id
 * @property {'pending'|'processing'|'preview'|'approved'|'rejected'|'error'|'no_change_needed'} status
 * @property {Object} payload - original request from extension
 * @property {string|null} branch
 * @property {string|null} worktreePath
 * @property {string|null} screenshotPath
 * @property {string|null} previewUrl
 * @property {string|null} diff
 * @property {string|null} prUrl
 * @property {string[]|null} changedFiles
 * @property {string} phase
 * @property {string|null} latestLog
 * @property {string} updatedAt
 * @property {string|null} error
 * @property {string[]} log - event log
 * @property {Date} createdAt
 * @property {Object|null} analytics
 */

function inferChangeIntentFromPrompt(payload) {
  const prompt = String(payload?.userPrompt || payload?.requested_change || '').trim();
  if (!prompt) return 'layout_adjustment';
  if (/(?:\b(text|copy|label|placeholder|title|subtitle|description|message)\b|번역|문구|텍스트|설명|타이틀|레이블|플레이스홀더|제목|부제목)/i.test(prompt)) {
    return 'copy_update';
  }
  if (/(?:\b(spacing|padding|margin|gap)\b|간격|여백|패딩|마진)/i.test(prompt)) {
    return 'spacing_adjustment';
  }
  if (/(?:\b(token|semantic|palette|color)\b|색상|토큰)/i.test(prompt)) {
    return 'token_alignment';
  }
  if (/(?:\b(accessibility|a11y|focus|keyboard|aria)\b|접근성)/i.test(prompt)) {
    return 'accessibility_improvement';
  }
  if (/(?:\b(layout|align|header|footer|section)\b|정렬|레이아웃)/i.test(prompt)) {
    return 'layout_adjustment';
  }
  return 'layout_adjustment';
}

function inferClientFromPayload(payload) {
  const explicitClient = typeof payload?.client === 'string' ? payload.client.trim() : '';
  if (explicitClient) return explicitClient;

  const sourceFile = typeof payload?.file === 'string' ? payload.file : '';
  const appMatch = sourceFile.match(/src\/apps\/([^/]+)\//);
  if (appMatch) return appMatch[1];

  const pageUrl = typeof payload?.pageUrl === 'string' ? payload.pageUrl.trim() : '';
  if (pageUrl) {
    if (pageUrl.includes('localhost:8001') || pageUrl.includes('127.0.0.1:8001')) {
      return 'tving';
    }
    if (pageUrl.includes('localhost:9002') || pageUrl.includes('127.0.0.1:9002')) {
      return 'msm-default';
    }
  }

  return 'msm-default';
}

function toRepoRelativePath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return null;
  }

  const normalizedPath = path.normalize(filePath.trim());
  const relativeToRepo = path.relative(DEFAULT_PRODUCT_REPO_ROOT, normalizedPath);

  if (!relativeToRepo.startsWith('..') && !path.isAbsolute(relativeToRepo)) {
    return relativeToRepo;
  }

  return normalizedPath;
}

function defaultSuccessCriteria(changeIntent, payload) {
  const criteria = ['The requested change is visible on the current page in the preview.'];
  if (changeIntent === 'copy_update') {
    criteria.push('The updated copy is actually visible on the current route.');
  }
  if (payload?.language) {
    criteria.push(`The preview and screenshot retain the ${payload.language} language.`);
  }
  return criteria;
}

function buildNormalizedRequestContract(payload) {
  const provided = payload?.requestContract ?? {};
  const inferredClient = inferClientFromPayload(payload);
  const changeIntent = provided.change_intent || inferChangeIntentFromPrompt(payload);
  const target = {
    client: provided.target?.client || inferredClient,
    route_or_page: provided.target?.route_or_page || payload?.pagePath || payload?.pageUrl || '/',
    component_name: provided.target?.component_name || payload?.component || null,
    element_label: provided.target?.element_label || payload?.testId || payload?.component || null,
    selection_context: {
      test_id: provided.target?.selection_context?.test_id || payload?.testId || null,
      source_file: provided.target?.selection_context?.source_file || payload?.file || null,
      language: provided.target?.selection_context?.language || payload?.language || null,
    },
  };

  const validationExpectations = Array.isArray(provided.validation_expectations) && provided.validation_expectations.length
    ? provided.validation_expectations
    : [...DEFAULT_VALIDATION_EXPECTATIONS];

  if (changeIntent === 'copy_update' && !validationExpectations.includes('copy_visible_on_route')) {
    validationExpectations.push('copy_visible_on_route');
  }
  if (changeIntent === 'spacing_adjustment' && !validationExpectations.includes('spacing_visible_on_route')) {
    validationExpectations.push('spacing_visible_on_route');
  }
  if (payload?.language && !validationExpectations.includes('language_match')) {
    validationExpectations.push('language_match');
  }

  return {
    goal: (provided.goal && provided.goal !== payload?.userPrompt ? provided.goal : null)
      || payload?.aiAnalysis?.understanding
      || payload?.goal
      || 'UI improvement request',
    target,
    change_intent: changeIntent,
    requested_change: provided.requested_change || payload?.userPrompt || '',
    constraints: Array.isArray(provided.constraints) ? provided.constraints : [],
    success_criteria:
      Array.isArray(provided.success_criteria) && provided.success_criteria.length
        ? provided.success_criteria
        : defaultSuccessCriteria(changeIntent, payload),
    validation_expectations: validationExpectations,
    attachments: Array.isArray(provided.attachments) ? provided.attachments : [],
  };
}

function normalizePayload(payload) {
  const normalizedFile = toRepoRelativePath(payload?.file);
  const normalizedSourceFile = toRepoRelativePath(
    payload?.requestContract?.target?.selection_context?.source_file,
  );

  const requestContract = buildNormalizedRequestContract(payload || {});
  return {
    ...payload,
    file: normalizedFile,
    client: inferClientFromPayload(payload || {}),
    pagePath: payload?.pagePath || requestContract.target.route_or_page || '/',
    language: payload?.language || requestContract.target.selection_context.language || null,
    requestContract: {
      ...requestContract,
      target: {
        ...requestContract.target,
        selection_context: {
          ...requestContract.target.selection_context,
          source_file:
            normalizedSourceFile ||
            normalizedFile ||
            requestContract.target.selection_context.source_file,
        },
      },
    },
  };
}

/**
 * Job-pipeline adapter (J3b): run a single task as a change-request in
 * the current process and wait for the pipeline to land a commit. The
 * job runner in `job-runner.js` invokes this serially per task, so we
 * deliberately bypass `enqueueJob` — the runner is already the
 * serializer. Also bypasses the queue-full error surface since only
 * one inflight task per playground is possible under this contract.
 *
 * The tagged `jobId` / `taskId` survives into request state analytics
 * so downstream UI can filter the per-task events.
 *
 * @param {{ playgroundId: string, userPrompt: string, client?: string,
 *          jobId: string, taskId: string }} args
 * @returns {Promise<{ commitSha: string, baseSha: string, diff: string }>}
 */
async function runChangeRequestForTask(args) {
  const pg = getPlayground(args.playgroundId);
  if (!pg) throw new Error(`playground not found: ${args.playgroundId}`);
  if (pg.status !== 'active') {
    throw new Error(`playground not active: ${pg.status}`);
  }
  // Retry path needs the *original* baseSha so the review diff covers
  // every attempt's commit, not just the latest tweak. The runner
  // stamps task.baseSha on the first committed run and preserves it
  // across failures. Fresh tasks fall back to the current playground
  // HEAD.
  const baseSha = args.taskBaseSha ?? pg.headCommitSha ?? pg.baselineCommitSha ?? '';
  // Pull the job's targetRoute (set by the decomposer) so the
  // self-verification block in the agent prompt can curl the right
  // URL after the agent's edits — catches the "BETA badge added but
  // result page broken" footgun before review.
  const targetRoute = (() => {
    try {
      return getJob(args.jobId)?.targetRoute;
    } catch {
      return undefined;
    }
  })();
  const state = createRequest({
    playgroundId: args.playgroundId,
    userPrompt: args.userPrompt,
    client: args.client ?? pg.client,
    pagePath: '/',
    jobId: args.jobId,
    taskId: args.taskId,
    targetRoute,
  });
  // Stamp the change-request id on the task immediately so the JobCard's
  // next poll can attach an SSE subscription to the agent stream — without
  // this we'd wait up to one phase-tick (600ms) plus the JobCard's poll
  // (2s) before the live tool-call counter could attach.
  try {
    setTaskMeta(args.jobId, args.taskId, { changeRequestId: state.id });
  } catch {
    /* best-effort UX signal */
  }
  // Stream the change-request's `phase` into the task record so the
  // JobCard's existing 2s poll surfaces a "what is it doing right
  // now" line under the running task title. We poll the in-memory
  // request state every 600ms — cheaper than wiring SSE end-to-end
  // and JobCard already polls the job object on a 2s cadence, so
  // worst-case lag is ~2.6s.
  let lastPhase = null;
  const phaseTick = setInterval(() => {
    const cur = requests.get(state.id);
    if (!cur || cur.phase === lastPhase) return;
    lastPhase = cur.phase;
    try {
      setTaskMeta(args.jobId, args.taskId, {
        currentPhase: cur.phase,
        changeRequestId: state.id,
      });
    } catch {
      // Best-effort UX signal — never let a phase write break the run.
    }
  }, 600);
  try {
    await runPipeline(state.id);
  } finally {
    clearInterval(phaseTick);
    // Clear the live phase the moment the pipeline returns so the
    // JobCard stops showing stale "running_agent" once the task moves
    // on to review.
    try {
      setTaskMeta(args.jobId, args.taskId, { currentPhase: undefined });
    } catch {
      /* see above */
    }
  }
  const final = requests.get(state.id);
  if (!final) throw new Error(`request state vanished: ${state.id}`);
  if (final.status === 'error') {
    throw new Error(final.error || 'change-request pipeline errored');
  }
  // Pipeline wrote the commit via `updatePlaygroundHead`; re-read to
  // grab the fresh sha. On `no_change_needed`, HEAD is unchanged and
  // we return baseSha as commitSha so the runner still marks the task
  // committed (it'll show as an empty diff at review time).
  const updatedPg = getPlayground(args.playgroundId);
  const commitSha = final.commitSha ?? updatedPg?.headCommitSha ?? baseSha;

  // Compute the *cumulative* diff across all attempts for this task
  // (baseSha..commitSha) rather than relying on the change-request
  // pipeline's single-run diff. On first attempt they're identical; on
  // retries the cumulative form is what the reviewer needs to judge
  // whether the whole task has been satisfied, not just the latest
  // tweak.
  let cumulativeDiff = final.diff ?? '';
  if (baseSha && commitSha && baseSha !== commitSha && updatedPg?.sandboxContainerName) {
    try {
      const { stdout } = await execAsync(
        `docker exec ${updatedPg.sandboxContainerName} sh -c "cd /workspace/msm-portal && git diff ${baseSha}..${commitSha}"`,
        { timeout: 15_000, maxBuffer: 10 * 1024 * 1024 },
      );
      if (stdout && stdout.trim()) cumulativeDiff = stdout;
    } catch (err) {
      console.warn(`[job-adapter] cumulative diff failed for ${args.taskId}: ${err.message}`);
      // fall back to the pipeline's single-run diff.
    }
  }

  return {
    commitSha,
    baseSha,
    diff: cumulativeDiff,
  };
}

/**
 * Fire-and-forget runner kick. Called after approve-plan, retry-task,
 * unblock-task, resume — any user action that unblocks the runner to
 * pick up where it left off. The runner itself loops until pause /
 * complete / cancel so calling it again while already running is safe
 * in theory but wasteful; we guard with a per-job lock.
 *
 * @type {Map<string, Promise<unknown>>}
 */
const runningJobs = new Map();

/**
 * Fire-and-forget decomposer. Called right after a job is created and
 * as the body of an explicit \`/decompose\` retry route. On success,
 * the job flips \`decomposing → planning\`; on failure, it pauses with
 * the LLM error surfaced so the user can retry or cancel.
 *
 * @param {string} jobId
 * @param {{ userFeedback?: string }} [opts]
 */
function decomposeJobInBackground(jobId, opts = {}) {
  (async () => {
    const job = getJob(jobId);
    if (!job) return;
    if (job.status !== 'decomposing') return; // race / idempotency
    try {
      const pg = getPlayground(job.playgroundId);
      // Re-decompose path: the prior plan is still on `job.tasks` at
      // this point (we flip status to `decomposing` without clearing
      // tasks). Pass it down so the LLM produces a *different*,
      // finer-grained breakdown instead of a near-clone.
      const previousTasks = job.tasks.length
        ? job.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            dependsOn: t.dependsOn,
          }))
        : undefined;
      const result = await decomposePrd(job.prdText, {
        client: pg?.client,
        previousTasks,
        userFeedback: opts.userFeedback,
        // We don't persist currentRoute on the server; it's known only
        // to the iframe's bridge. Route hint is optional — PRDs usually
        // mention the page explicitly.
      });
      const { tasks, targetRoute, risks } = result;
      setJobTasks(jobId, tasks); // auto-transitions decomposing → planning
      // Stamp the target route hint when the LLM picked one. The UI
      // uses this on the QA / complete screens to show "결과 페이지
      // 열기 ↗" so the user doesn't have to hunt for the new menu
      // entry.
      if (targetRoute) {
        try {
          setTargetRoute(jobId, targetRoute);
        } catch (err) {
          console.warn(
            `[job-decomposer] ${jobId} targetRoute stamp failed:`,
            err.message,
          );
        }
      }
      // Risks the decomposer flagged — surface them in the plan UI
      // so the user signs off on the watch-outs along with the task
      // list. Empty array is fine (no risks worth calling out).
      try {
        setJobRisks(jobId, Array.isArray(risks) ? risks : []);
      } catch (err) {
        console.warn(
          `[job-decomposer] ${jobId} risks stamp failed:`,
          err.message,
        );
      }
      // Pick the QA strategy as part of finalising the plan, *before*
      // the user sees and approves it. This makes QA part of the same
      // "this is the plan" surface the user signs off on, instead of a
      // chip that quietly appears post-approval.
      //
      // Fire-and-forget: failure stamps a `human_only` fallback so the
      // plan still renders + the manual QA pass button remains the
      // gate. We don't block the FSM transition (planning has already
      // happened above).
      (async () => {
        try {
          const j = getJob(jobId);
          if (!j) return;
          const pg = getPlayground(j.playgroundId);
          const choice = await selectQaStrategy({
            prdText: j.prdText,
            tasks: j.tasks,
            client: pg?.client,
          });
          setQaStrategy(jobId, choice);
        } catch (err) {
          console.warn(
            `[qa-strategist] ${jobId} (decompose-time) failed:`,
            err.message,
          );
          try {
            setQaStrategy(jobId, {
              strategy: 'human_only',
              rationale_ko: '자동 선택 실패 — 사람이 직접 확인',
            });
          } catch (stampErr) {
            console.error(
              `[qa-strategist] ${jobId} fallback stamp failed:`,
              stampErr.message,
            );
          }
        }
      })();
    } catch (err) {
      console.warn(`[job-decomposer] ${jobId} failed:`, err.message);
      try {
        setJobStatus(jobId, 'paused', {
          pausedReason: `decompose failed: ${err.message}`,
        });
      } catch (stateErr) {
        console.error(`[job-decomposer] ${jobId} status update failed:`, stateErr.message);
      }
    }
  })();
}

/**
 * Auto-fire the QA runner once the job lands at `qa`. Idempotent:
 * `runJobInBackground` may be re-invoked after a retry/accept/skip
 * action that re-enters the runner and re-resolves at `qa`; we only
 * want one auto-run per job. The `qaAutoResult` field on the job
 * record is the dedupe key — if it's already stamped, skip.
 *
 * @param {Awaited<ReturnType<typeof runJobRunner>> | undefined} finalJob
 */
function maybeFireQaRunner(finalJob) {
  if (!finalJob || finalJob.status !== 'qa') return;
  if (finalJob.qaAutoResult) return; // already ran (manual rerun goes through /rerun-qa)
  runQaStrategyInBackground(finalJob.id);
}

/**
 * One-shot helper for "user approved the plan, do everything that
 * needs to happen now". Used by both the HTTP /approve-plan handler
 * and molly's ✅ approve button so neither path drifts from the other:
 *   1. FSM flip via approvePlan (planning → delegating).
 *   2. Kick the runner.
 *
 * QA strategy used to be picked here, but it now fires at decompose
 * time so the user sees + approves the verification approach as part
 * of the plan. By the time we reach approve, `job.qaStrategy` is
 * already stamped (or has a `human_only` fallback if the strategist
 * call failed).
 *
 * @param {string} jobId
 * @returns {import('./lib/job.js').Job}
 */
function approveAndRunJob(jobId) {
  const updated = approvePlan(jobId);
  // Defensive backstop: if the decompose-time strategist hook didn't
  // land for some reason (older job created before this code path
  // shipped, race, etc.), stamp a human_only fallback now so the
  // runner doesn't dispatch into a missing strategy.
  try {
    const j = getJob(jobId);
    if (j && !j.qaStrategy) {
      setQaStrategy(jobId, {
        strategy: 'human_only',
        rationale_ko: '전략 미설정 — 사람이 직접 확인',
      });
    }
  } catch (err) {
    console.warn(
      `[approve-and-run] ${jobId} qaStrategy backstop failed:`,
      err.message,
    );
  }
  runJobInBackground(jobId);
  return updated;
}

/** @param {string} jobId */
function runJobInBackground(jobId) {
  if (runningJobs.has(jobId)) return;
  const p = runJobRunner(jobId, {
    adapter: (task, ctx) => {
      // On retry (attempt > 0) after a review-fail, inject the prior
      // reviewer's notes into the prompt so the agent actually learns
      // from the last miss. Without this the agent reran the exact
      // same prompt and usually reproduced the same mistake, which
      // made the retry button feel decorative.
      //
      // We also explicitly remind the agent that the prior attempt's
      // commit is still on the branch and the goal is to produce a
      // diff that satisfies the *entire* original requirement — a
      // narrow \"just fix the feedback bullet\" interpretation was the
      // common failure mode before this wording.
      const prevFail = task.attempt > 0 && task.review?.verdict === 'fail';
      const userPrompt = prevFail
        ? [
            `[이전 시도 리뷰 실패 (attempt ${task.attempt})]`,
            `리뷰 피드백: ${task.review?.notes ?? ''}`,
            '',
            '중요:',
            '- 이전 시도의 커밋은 이미 브랜치에 있습니다. 그 결과물에 필요한 변경을 *추가*하세요.',
            '- 단순히 위 피드백 한 줄만 고치면 안 됩니다. 원래 요구사항 *전체*가 구현되어 있는지 검토하고, 빠진 부분을 모두 채우세요.',
            '- 최종 diff (baseline..HEAD) 가 원래 요구사항을 모두 만족해야 통과입니다.',
            '',
            '원래 요구사항:',
            task.description,
          ].join('\n')
        : task.description;
      return runChangeRequestForTask({
        playgroundId: ctx.playgroundId,
        userPrompt,
        jobId: ctx.jobId,
        taskId: task.id,
        taskBaseSha: task.baseSha,
      });
    },
    reviewer: (task, diff) => reviewTaskDiff(task, diff),
  }).then((finalJob) => {
    // Fire the QA runner if this run took the job to `qa`. Fire-and-
    // forget — the runner stamps `qaAutoResult` on completion; the UI
    // poll picks it up and renders the auto-pass / auto-fail banner.
    maybeFireQaRunner(finalJob);
    return finalJob;
  }).catch((err) => {
    console.error(`[job-runner] ${jobId} crashed:`, err);
  }).finally(() => {
    runningJobs.delete(jobId);
  });
  runningJobs.set(jobId, p);
}

function createRequest(payload) {
  const normalizedPayload = normalizePayload(payload);
  const id = randomUUID().slice(0, 8);
  const state = {
    id,
    status: 'pending',
    payload: normalizedPayload,
    branch: `inspect/${id}`,
    worktreePath: null,
    screenshotPath: null,
    previewUrl: null,
    diff: null,
    prUrl: null,
    changedFiles: null,
    phase: 'queued',
    latestLog: null,
    updatedAt: new Date().toISOString(),
    error: null,
    log: [],
    createdAt: new Date(),
    analytics: {
      lifecycle: [],
      approvalState: 'pending_review',
      iterationCount: 0,
      tokenUsage: null,
    },
  };
  requests.set(id, state);
  appendAnalyticsEvent(state, 'request_created', {
    summary: 'Chrome extension request created',
  });
  return state;
}

function persistState(id) {
  try {
    const state = requests.get(id);
    if (!state) return;
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    // Save serializable fields only (exclude sandbox object with container refs)
    const serializable = {
      id: state.id, status: state.status, phase: state.phase,
      request: state.request, payload: state.payload,
      diff: state.diff, changedFiles: state.changedFiles,
      screenshotPath: state.screenshotPath, previewUrl: state.previewUrl,
      livePreviewUrl: state.livePreviewUrl, prUrl: state.prUrl,
      latestLog: state.latestLog, log: state.log,
      error: state.error, analytics: state.analytics,
      createdAt: state.createdAt, updatedAt: state.updatedAt,
      diffStat: state.diffStat || null,
    };
    fs.writeFileSync(path.join(STATE_DIR, `${id}.json`), JSON.stringify(serializable), 'utf-8');
  } catch (e) {
    console.error(`[State] Failed to persist ${id}:`, e.message);
  }
}

function restoreAllState() {
  if (!fs.existsSync(STATE_DIR)) return;
  const files = fs.readdirSync(STATE_DIR).filter(f => f.endsWith('.json'));
  let restored = 0;
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(STATE_DIR, file), 'utf-8'));
      if (data.id && !requests.has(data.id)) {
        // Mark sandbox as expired (container no longer running)
        data.sandbox = null;
        data.sandboxExpired = true;
        if (data.livePreviewUrl) data.livePreviewExpired = true;
        requests.set(data.id, data);
        restored++;
      }
    } catch {}
  }
  if (restored) console.log(`[State] Restored ${restored} requests from disk`);
}

function updateRequest(id, updates) {
  const state = requests.get(id);
  if (!state) return null;
  Object.assign(state, updates);
  state.updatedAt = new Date().toISOString();
  if (updates.status) {
    state.log.push(`[${new Date().toISOString()}] ${updates.status}${updates.error ? ': ' + updates.error : ''}`);
  }
  // Analytics moved to explicit calls only (preview_ready, approved, rejected)
  // Notify SSE clients
  const clients = sseClients.get(id);
  if (clients) {
    const event = JSON.stringify({
      id,
      status: state.status,
      phase: state.phase,
      latestLog: state.latestLog,
      updatedAt: state.updatedAt,
      diff: state.diff,
      screenshotUrl: state.screenshotPath ? `/api/screenshot/${id}` : null,
      previewUrl: state.previewUrl,
      livePreviewUrl: state.livePreviewUrl || null,
      prUrl: state.prUrl,
      error: state.error,
    });
    for (const res of clients) {
      res.write(`data: ${event}\n\n`);
    }
  }
  persistState(id);
  return state;
}

function appendLog(id, message) {
  const state = requests.get(id);
  if (!state) return;
  state.latestLog = String(message);
  state.log.push({ at: new Date().toISOString(), message: state.latestLog });
  updateRequest(id, {});
}

function sanitizeSelectedElements(selectedElements) {
  if (!Array.isArray(selectedElements)) return [];
  return selectedElements.slice(0, 8).map((item) => ({
    component: item?.component || null,
    testId: item?.testId || null,
    domTag: item?.semantics?.domTag || null,
    labelText: item?.semantics?.labelText || null,
    shortPath: item?.shortPath || null,
  }));
}

function summarizeRequestPayload(payload) {
  const requestContract = payload?.requestContract ?? {};
  return {
    userPrompt: payload?.userPrompt || '',
    pageUrl: payload?.pageUrl || null,
    pagePath: payload?.pagePath || null,
    client: payload?.client || null,
    language: payload?.language || null,
    component: payload?.component || null,
    testId: payload?.testId || null,
    file: payload?.file || null,
    hasCapture: Boolean(payload?.selectionScreenshotPath),
    capturePath: payload?.selectionScreenshotPath || null,
    selectedElements: sanitizeSelectedElements(payload?.selectedElements),
    requestContract: {
      goal: requestContract.goal || null,
      change_intent: requestContract.change_intent || null,
      requested_change: requestContract.requested_change || null,
      constraints: requestContract.constraints || [],
      success_criteria: requestContract.success_criteria || [],
      validation_expectations: requestContract.validation_expectations || [],
      target: requestContract.target || null,
    },
    plan: payload?.approvedPlan || payload?.planSummary || null,
    planConfirmed: Boolean(payload?.approvedPlan || payload?.planSummary),
    aiAnalysis: payload?.aiAnalysis || null,
  };
}

function buildExecutionMetadata(state) {
  return {
    layer: 'sandbox',
    productId: 'msm-portal',
    sandboxImage: SANDBOX_IMAGE,
    provider: SANDBOX_PROVIDER,
    model: SANDBOX_MODEL,
    containerId: state.sandbox?.containerId || null,
  };
}

function buildAnalyticsSnapshot(state) {
  const durationMs = state.createdAt ? Date.now() - new Date(state.createdAt).getTime() : null;
  const changedFiles = Array.isArray(state.changedFiles) ? state.changedFiles : [];
  const screenshotRelative = state.screenshotPath ? path.relative(WORKSPACE_ROOT, state.screenshotPath) : null;
  const attachmentRelative = state.payload?.selectionScreenshotPath
    ? path.relative(WORKSPACE_ROOT, state.payload.selectionScreenshotPath)
    : null;

  return {
    id: state.id,
    status: state.status,
    phase: state.phase,
    createdAt: state.createdAt instanceof Date ? state.createdAt.toISOString() : state.createdAt,
    updatedAt: state.updatedAt,
    durationMs,
    latestLog: state.latestLog,
    error: state.error,
    branch: state.branch,
    worktreePath: state.worktreePath ? path.relative(WORKSPACE_ROOT, state.worktreePath) : null,
    previewUrl: state.previewUrl,
    livePreviewUrl: state.livePreviewUrl || null,
    livePreviewExpired: state.livePreviewExpired || false,
    sandboxExpired: state.sandboxExpired || false,
    screenshotUrl: state.screenshotPath ? `/api/screenshot/${state.id}` : null,
    screenshotPath: screenshotRelative,
    attachmentPath: attachmentRelative,
    changedFiles,
    changedFileCount: changedFiles.length,
    diffLineCount: state.diff ? state.diff.split('\n').length : 0,
    diff: state.diff || null,
    logCount: state.log.length,
    lifecycleCount: (state.analytics?.lifecycle ?? []).length,
    approvalState: state.analytics?.approvalState ?? 'pending_review',
    iterationCount: state.analytics?.iterationCount ?? 0,
    tokenUsage: state.analytics?.tokenUsage ?? null,
    request: summarizeRequestPayload(state.payload),
    execution: buildExecutionMetadata(state),
  };
}

function appendAnalyticsEvent(state, type, details = {}) {
  try {
    ensureAnalyticsStorage();
    if (!state.analytics) {
      state.analytics = {
        lifecycle: [],
        approvalState: 'pending_review',
        iterationCount: 0,
        tokenUsage: null,
      };
    }

    const event = {
      at: new Date().toISOString(),
      type,
      ...details,
    };
    state.analytics.lifecycle.push(event);

    const record = {
      event,
      snapshot: buildAnalyticsSnapshot(state),
    };

    fs.appendFileSync(REQUEST_HISTORY_PATH, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (e) {
    console.error(`[Analytics] appendAnalyticsEvent failed:`, e.message);
  }
}

function readAnalyticsHistory(limit = 200) {
  ensureAnalyticsStorage();
  const lines = fs
    .readFileSync(REQUEST_HISTORY_PATH, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function buildLatestRequestSnapshots(records) {
  const latestByRequest = new Map();
  for (const record of records) {
    if (record?.snapshot?.id) {
      latestByRequest.set(record.snapshot.id, record.snapshot);
    }
  }

  return Array.from(latestByRequest.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

function buildAnalyticsSummary(records) {
  const requestsList = buildLatestRequestSnapshots(records);
  const statusCounts = requestsList.reduce((acc, request) => {
    acc[request.status] = (acc[request.status] || 0) + 1;
    return acc;
  }, {});

  const approvedCount = requestsList.filter((request) => request.approvalState === 'approved').length;
  const rejectedCount = requestsList.filter((request) => request.approvalState === 'rejected').length;
  const noChangeNeededCount = requestsList.filter((request) => request.status === 'no_change_needed').length;
  const avgDurationMs = requestsList.length
    ? Math.round(
        requestsList.reduce((sum, request) => sum + (request.durationMs || 0), 0) / requestsList.length,
      )
    : 0;
  const routeCounts = {};
  const fileCounts = {};

  requestsList.forEach((request) => {
    const route = request?.request?.pagePath || request?.request?.pageUrl || '/';
    if (route) {
      routeCounts[route] = (routeCounts[route] || 0) + 1;
    }

    const changedFiles = Array.isArray(request.changedFiles) ? request.changedFiles : [];
    changedFiles.forEach((file) => {
      fileCounts[file] = (fileCounts[file] || 0) + 1;
    });
  });

  const topRoutes = Object.entries(routeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([route, count]) => ({ route, count }));

  const topFiles = Object.entries(fileCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, count]) => ({ file, count }));

  const now = Date.now();
  const hourlyBuckets = Array.from({ length: 24 }, (_, index) => {
    const start = new Date(now - (23 - index) * 60 * 60 * 1000);
    start.setMinutes(0, 0, 0);
    return {
      hour: start.toISOString(),
      total: 0,
      approved: 0,
      noChangeNeeded: 0,
      averageDurationMs: 0,
      _durationSumMs: 0,
    };
  });

  requestsList.forEach((request) => {
    const createdAt = new Date(request.createdAt).getTime();
    const bucketIndex = hourlyBuckets.findIndex((bucket, index) => {
      const bucketStart = new Date(bucket.hour).getTime();
      const nextStart =
        index < hourlyBuckets.length - 1
          ? new Date(hourlyBuckets[index + 1].hour).getTime()
          : bucketStart + 60 * 60 * 1000;
      return createdAt >= bucketStart && createdAt < nextStart;
    });

    if (bucketIndex === -1) return;
    hourlyBuckets[bucketIndex].total += 1;
    hourlyBuckets[bucketIndex]._durationSumMs += request.durationMs || 0;
    if (request.approvalState === 'approved') {
      hourlyBuckets[bucketIndex].approved += 1;
    }
    if (request.status === 'no_change_needed') {
      hourlyBuckets[bucketIndex].noChangeNeeded += 1;
    }
  });

  const normalizedHourlyBuckets = hourlyBuckets.map((bucket) => ({
    hour: bucket.hour,
    total: bucket.total,
    approved: bucket.approved,
    noChangeNeeded: bucket.noChangeNeeded,
    averageDurationMs: bucket.total ? Math.round(bucket._durationSumMs / bucket.total) : 0,
  }));

  return {
    totalRequests: requestsList.length,
    approvedCount,
    rejectedCount,
    approvalRate: requestsList.length ? approvedCount / requestsList.length : 0,
    noChangeNeededRate: requestsList.length ? noChangeNeededCount / requestsList.length : 0,
    averageDurationMs: avgDurationMs,
    statusCounts,
    topRoutes,
    topFiles,
    hourlyBuckets: normalizedHourlyBuckets,
  };
}

function buildAnalyticsDetail(records, requestId) {
  const related = records.filter((record) => record?.snapshot?.id === requestId);
  if (!related.length) return null;

  const latest = related[related.length - 1].snapshot;
  return {
    request: latest,
    events: related.map((record) => record.event),
  };
}

function maybePersistSelectionScreenshot(payload) {
  const dataUrl = typeof payload?.selectionScreenshotDataUrl === 'string'
    ? payload.selectionScreenshotDataUrl
    : '';
  if (!dataUrl.startsWith('data:image/')) {
    return payload;
  }

  if (!fs.existsSync(ATTACHMENTS_DIR)) {
    fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  }

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return payload;
  const [, mimeType, base64Data] = match;
  const extension = mimeType.includes('jpeg') ? 'jpg' : 'png';
  const filePath = path.join(ATTACHMENTS_DIR, `selection-${randomUUID().slice(0, 8)}.${extension}`);
  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

  return {
    ...payload,
    selectionScreenshotPath: filePath,
    selectionScreenshotMimeType: mimeType,
    selectionScreenshotDataUrl: undefined,
  };
}

// ─── Pipeline (Docker Sandbox + OpenCode) ────────────────────────────

async function runPipeline(id) {
  const state = requests.get(id);
  if (!state) return;

  // M1b: if the request names a Playground, reuse its container + branch
  // instead of spawning a fresh sandbox. Otherwise legacy one-shot flow.
  const playgroundId = state.payload?.playgroundId || state.request?.playgroundId;
  const pg = playgroundId ? getPlayground(playgroundId) : null;

  try {
    let sandbox;
    let openCodePort;
    let vitePort;

    if (pg) {
      if (pg.status === 'archived') {
        throw new Error(`playground ${playgroundId} is archived`);
      }
      if (pg.status === 'hibernated') {
        appendLog(id, `Resuming playground ${playgroundId}...`);
        await resumePlayground(pg.id);
      }
      const fresh = getPlayground(pg.id);
      sandbox = {
        containerId: fresh.sandboxContainerName,
        containerName: fresh.sandboxContainerName,
        openCodePort: fresh.opencodePort,
        vitePort: fresh.vitePort,
      };
      openCodePort = fresh.opencodePort;
      vitePort = fresh.vitePort;
      state.sandbox = sandbox;
      state.playgroundId = fresh.id;
      updateRequest(id, { status: 'processing', phase: 'running_agent' });
      appendLog(id, `Reusing playground ${fresh.id} container ${fresh.sandboxContainerName}`);
      appendAnalyticsEvent(state, 'playground_attached', { summary: `Playground ${fresh.id}`, phase: 'running_agent' });
    } else {
      updateRequest(id, { status: 'processing', phase: 'creating_sandbox' });
      appendAnalyticsEvent(state, 'pipeline_start', { summary: 'Pipeline started', phase: 'creating_sandbox' });
      appendLog(id, 'Creating sandbox container...');
      openCodePort = await allocatePort();
      vitePort = await allocatePort();
      const sandboxApiKey = SANDBOX_PROVIDER === 'opencode' ? (OPENCODE_API_KEY || SANDBOX_API_KEY) : SANDBOX_API_KEY;
      sandbox = await createSandbox({
        requestId: id, imageName: SANDBOX_IMAGE,
        openCodePort, vitePort, apiKey: sandboxApiKey, provider: SANDBOX_PROVIDER,
      });
      state.sandbox = sandbox;
      appendAnalyticsEvent(state, 'sandbox_created', { summary: `Container ${sandbox.containerName}`, phase: 'creating_sandbox', ports: { openCode: openCodePort, vite: vitePort } });
      appendLog(id, `Sandbox: ${sandbox.containerName} (oc:${openCodePort} vite:${vitePort})`);

      updateRequest(id, { phase: 'syncing_source' });
      if (fs.existsSync(DEFAULT_PRODUCT_REPO_ROOT)) {
        await copyFilesIn({ containerId: sandbox.containerId, sourceDir: DEFAULT_PRODUCT_REPO_ROOT });
        // Remove macOS resource fork files (._*) that break esbuild/vite
        await execInContainer({ containerId: sandbox.containerId, command: 'find /workspace -name "._*" -delete 2>/dev/null || true', timeout: 10000 }).catch(() => {});
        // Inject Zscaler CA cert for corporate proxy SSL (SSL_CERT_FILE=/tmp/ca-bundle.crt set at container creation)
        const zscalerCaPath = path.join(__dirname, '..', 'sandbox', 'zscaler-ca.pem');
        if (fs.existsSync(zscalerCaPath)) {
          await execAsync(`docker cp "${zscalerCaPath}" "${sandbox.containerId}:/tmp/zscaler-ca.pem"`, { timeout: 5000 }).catch(() => {});
          await execInContainer({ containerId: sandbox.containerId, command: 'cp /etc/ssl/certs/ca-certificates.crt /tmp/ca-bundle.crt && cat /tmp/zscaler-ca.pem >> /tmp/ca-bundle.crt', timeout: 5000 }).catch(() => {});
        }
        appendLog(id, 'Source synced into sandbox');
      }
    }
    // Copy opencode auth for OAuth-based providers
    if (fs.existsSync(OPENCODE_AUTH_PATH)) {
      await execAsync(`docker exec "${sandbox.containerId}" mkdir -p /root/.local/share/opencode`, { timeout: 3000 }).catch(() => {});
      await execAsync(`docker cp "${OPENCODE_AUTH_PATH}" "${sandbox.containerId}:/root/.local/share/opencode/auth.json"`, { timeout: 3000 }).catch(() => {});
    }

    updateRequest(id, { phase: 'starting_agent' });
    const client = createSandboxClient({ openCodePort });
    await waitForServerReady(client);
    appendLog(id, 'OpenCode server ready');

    updateRequest(id, { phase: 'running_agent' });
    appendAnalyticsEvent(state, 'agent_start', { summary: `Running ${SANDBOX_PROVIDER}/${SANDBOX_MODEL}`, phase: 'running_agent', provider: SANDBOX_PROVIDER, model: SANDBOX_MODEL });
    appendLog(id, `Running agent (${SANDBOX_PROVIDER}/${SANDBOX_MODEL})...`);
    const prompt = buildSandboxPrompt(state.payload);

    // Live event stream from OpenCode /global/event — translate to log lines
    // so Canvas AIPanel shows tool calls, text snippets, diff progress in
    // near-real-time instead of a silent 30–300 s gap.
    let lastLoggedText = '';
    const onAgentEvent = (payload) => {
      try {
        const t = payload?.type;
        const props = payload?.properties ?? {};
        if (t === 'message.part.updated') {
          const part = props.part ?? {};
          if (part.type === 'tool' && part.tool) {
            appendLog(id, `🛠️ ${part.tool}`);
          } else if (part.type === 'text' && part.text && part.text !== lastLoggedText) {
            const snippet = part.text.slice(0, 160).replace(/\n/g, ' ');
            appendLog(id, `💬 ${snippet}`);
            lastLoggedText = part.text;
          }
        } else if (t === 'session.diff') {
          const count = props.diff?.length ?? 0;
          if (count > 0) appendLog(id, `📝 ${count} file${count > 1 ? 's' : ''} touched`);
        }
      } catch {
        // ignore any malformed event — logging is best-effort
      }
    };

    const agentResult = await runAgentPrompt(client, {
      prompt,
      provider: SANDBOX_PROVIDER,
      model: SANDBOX_MODEL,
      onEvent: onAgentEvent,
    });
    if (agentResult.error) {
      throw new Error(`Agent: ${agentResult.error.name}: ${agentResult.error.data?.message || ''}`);
    }
    appendAnalyticsEvent(state, 'agent_done', { summary: `Agent finished ($${(agentResult.cost || 0).toFixed(4)})`, phase: 'collecting_diff', cost: agentResult.cost || 0 });
    appendLog(id, `Agent done (cost: $${(agentResult.cost || 0).toFixed(4)})`);

    updateRequest(id, { phase: 'collecting_diff' });
    const diff = await extractDiff({ containerId: sandbox.containerId });
    updateRequest(id, { diff: diff.diffText, changedFiles: diff.changedFiles });
    if (diff.diffStat.trim()) {
      appendAnalyticsEvent(state, 'diff_collected', { summary: diff.diffStat.trim(), phase: 'collecting_diff', filesChanged: diff.changedFiles.length });
      appendLog(id, `Changes: ${diff.diffStat.trim()}`);
    }

    if (!diff.changedFiles.length) {
      state.analytics.approvalState = 'not_required';
      updateRequest(id, { status: 'no_change_needed', phase: 'no_change_needed', diff: null, changedFiles: [], screenshotPath: null, previewUrl: null });
      appendLog(id, 'No code change needed.');
      await cleanup(id);
      return;
    }

    // M1b: for playground-attached requests, persist change as a real commit
    // so timeline ("이 시점으로 돌아가기") and revert semantics can land on a
    // sha. `--no-verify` skips husky+lint-staged (spike A1: saves 3-5s/req).
    if (state.playgroundId) {
      try {
        const prompt = state.payload?.userPrompt || 'playground change';
        const msg = prompt.split('\n')[0].slice(0, 72).replace(/"/g, '\\"');
        await execInContainer({
          containerId: sandbox.containerId,
          command: [
            'cd /workspace/msm-portal',
            'git add -A',
            `git commit --no-verify -m "${msg}" --allow-empty`,
          ].join(' && '),
          timeout: 15_000,
        });
        const shaRes = await execInContainer({
          containerId: sandbox.containerId,
          command: 'cd /workspace/msm-portal && git rev-parse HEAD',
          timeout: 5_000,
        });
        const sha = (shaRes.stdout || '').trim();
        if (sha) {
          state.commitSha = sha;
          updatePlaygroundHead(state.playgroundId, sha);
          appendLog(id, `Committed ${sha.slice(0, 8)}`);
          // Poke the in-sandbox Vite plugin so it invalidates its module
          // graph and pushes a full-reload to the browser. See
          // `signalInvalidate` in lib/playground.js for why this is needed
          // (inotify silently misses git-am writes on Docker overlayfs).
          try {
            await execInContainer({
              containerId: sandbox.containerId,
              command: 'touch /workspace/.playground-invalidate',
              timeout: 5_000,
            });
          } catch (err) {
            console.warn(`[pipeline] invalidate signal failed: ${err.message}`);
          }
        }
      } catch (err) {
        console.warn(`[pipeline] playground commit failed: ${err.message}`);
      }
    }

    // M1b: playground-attached requests already have Vite running (supervisorctl)
    // and node_modules pre-baked. Skip the whole one-shot preview setup block
    // and just record preview URLs pointing at the live playground.
    if (state.playgroundId) {
      const pagePath = state.request?.pagePath || state.payload?.pagePath || '/';
      const diffViewUrl = `http://127.0.0.1:${PORT}/api/diff-view/${id}`;
      const livePreviewUrl = vitePort ? `http://127.0.0.1:${vitePort}${pagePath}` : null;
      updateRequest(id, { previewUrl: diffViewUrl, livePreviewUrl });
      updateRequest(id, { status: 'preview', phase: 'preview_ready' });
      appendAnalyticsEvent(state, 'preview_ready', { summary: 'Playground change applied', previewUrl: diffViewUrl });
      appendLog(id, 'Change applied to playground');
      return;
    }

    // Start live preview in sandbox + diff viewer (legacy one-shot path)
    try {
      const pagePath = state.request?.pagePath || state.payload?.pagePath || '/';
      const clientEnv = state.request?.client || state.payload?.client || 'tving';

      appendLog(id, 'Installing dependencies...');
      // Copy .npmrc for private registry auth
      const npmrcPath = path.join(os.homedir(), '.npmrc');
      if (fs.existsSync(npmrcPath)) {
        await execAsync(`docker cp "${npmrcPath}" "${sandbox.containerId}:/root/.npmrc"`, { timeout: 5000 }).catch(() => {});
      }
      await execInContainer({
        containerId: sandbox.containerId,
        command: 'cd /workspace/msm-portal/js/msm-portal-web && pnpm install --frozen-lockfile 2>&1 | tail -3',
        timeout: 180000,
      });

      // TypeScript check (after pnpm install so node_modules exists)
      try {
        updateRequest(id, { phase: 'validating' });
        appendLog(id, 'Running TypeScript check...');
        const tc = await execInContainer({ containerId: sandbox.containerId, command: 'cd /workspace/msm-portal && pnpm exec tsc --noEmit -p js/msm-portal-web/tsconfig.json 2>&1', timeout: 60000 });
        appendLog(id, tc.exitCode === 0 ? 'Typecheck passed' : 'Typecheck warning: ' + (tc.stdout + tc.stderr).slice(0, 300));
      } catch (e) { appendLog(id, 'Typecheck skipped: ' + e.message); }

      // Auth: fetch real tokens from MSM API and inject into sandbox
      const msmApiUrl = 'https://msm-api-test.moloco.cloud/msm/v1';
      const previewEmail = process.env.PREVIEW_EMAIL || 'kyungjae.ha@moloco.com';
      const previewPassword = process.env.PREVIEW_PASSWORD || 'Romanticview+4';
      // Derive workplace ID from URL path (e.g. TVING_OMS_DEV) or env
      const wpId = (() => {
        const rawPath = state.payload?.pageUrl || state.payload?.pagePath || '';
        const m = rawPath.match(/\/v1\/p\/([^/]+)\//);
        if (m) return m[1];
        return clientEnv === 'tving' ? 'TVING_OMS_DEV' : clientEnv.toUpperCase();
      })();

      let idToken = '';
      let wpToken = '';
      try {
        const idResp = await fetch(`${msmApiUrl}/auth/id-tokens`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: previewEmail, password: previewPassword }),
        });
        if (idResp.ok) {
          const idData = await idResp.json();
          idToken = idData.token || '';
        }
        if (idToken) {
          const wpResp = await fetch(`${msmApiUrl}/auth/tokens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ workplace_id: wpId }),
          });
          if (wpResp.ok) {
            const wpData = await wpResp.json();
            wpToken = wpData.token || '';
          }
        }
        // Store tokens in state for proxy auth injection
        updateRequest(id, { authTokens: { idToken: idToken || '', wpToken: wpToken || '', wpId } });
        appendLog(id, `Auth tokens: idToken=${idToken ? 'OK' : 'FAIL'} wpToken=${wpToken ? 'OK' : 'FAIL'} wp=${wpId}`);
      } catch (authErr) {
        appendLog(id, 'Auth token fetch failed: ' + (authErr.message || '').slice(0, 200));
      }

      const actualIdToken = idToken || 'mock-preview-token';
      const actualWpToken = wpToken || `mock-workplace-token:${wpId}`;

      // Replace AuthProvider with bypass that uses real tokens
      const authBypassProvider = `import { FC, PropsWithChildren, useCallback } from 'react';
import { AuthContext } from './AuthContext';
import { AuthTokenMemoryStorage, WorkplaceTokenMemoryStorage } from './memory-storage';

const ID_TOKEN = '${actualIdToken}';
const WP_TOKEN = '${actualWpToken}';
const WP_ID = '${wpId}';

AuthTokenMemoryStorage.setToken(ID_TOKEN);
WorkplaceTokenMemoryStorage.setToken(WP_TOKEN);

const noop = async () => {};
const AuthProvider: FC<PropsWithChildren> = ({ children }) => {
  const getIdToken = useCallback(() => ID_TOKEN, []);
  const getWorkplaceToken = useCallback(() => WP_TOKEN, []);
  return (
    <AuthContext.Provider value={{
      isAuthenticatedForUser: true,
      isAuthenticatedForWorkplace: true,
      workplaceId: WP_ID,
      manualSignedOut: false,
      signIn: noop,
      signInWithMFA: noop,
      signInWithCache: noop,
      enterWorkplace: noop,
      enterWorkplaceWithCache: noop,
      exitWorkplace: () => {},
      signOut: () => {},
      getIdToken,
      getWorkplaceToken,
      getWorkplaceTokenWithWorkplaceId: async () => WP_TOKEN,
    }}>{children}</AuthContext.Provider>
  );
};
export default AuthProvider;
`;
      await execInContainer({
        containerId: sandbox.containerId,
        command: `cat > /workspace/msm-portal/js/msm-portal-web/src/common/auth/AuthProvider.tsx << 'AUTHEOF'\n${authBypassProvider}AUTHEOF`,
        timeout: 5000,
      }).then(() => {
        appendLog(id, `Auth bypass: AuthProvider with real tokens (${wpId})`);
      }).catch(e => appendLog(id, 'Auth bypass failed: ' + e.message));

      // Inject tokens + language into index.html for localStorage/sessionStorage seeding
      const expireTime = 'String(Math.floor(Date.now()/1000)+54000)';
      const lang = state.payload?.language || 'ko';
      const indexHtmlPath = `src/apps/${clientEnv}/index.html`;
      const authScript = `<script>(function(){var e=${expireTime},a=JSON.stringify({token:"${actualIdToken}",expireTime:e}),w=JSON.stringify({token:"${actualWpToken}",workplaceId:"${wpId}",expireTime:e});try{localStorage.setItem("MSM_AUTH",a);localStorage.setItem("MSM_AUTH_WORKPLACE",w);sessionStorage.setItem("MSM_AUTH",a);sessionStorage.setItem("MSM_AUTH_WORKPLACE",w);localStorage.setItem("i18nextLng","${lang}")}catch(x){}})()</script>`;
      await execInContainer({
        containerId: sandbox.containerId,
        command: `cd /workspace/msm-portal/js/msm-portal-web && sed -i 's|</head>|${authScript.replace(/'/g, "\\'")}\\n</head>|' ${indexHtmlPath}`,
        timeout: 5000,
      }).catch(() => {});

      appendLog(id, 'Starting live preview server...');
      // Start vite in background
      await execInContainer({
        containerId: sandbox.containerId,
        command: `cd /workspace/msm-portal/js/msm-portal-web && CLIENT=${clientEnv} nohup npx vite --mode test --host 0.0.0.0 --port 5173 > /tmp/vite.log 2>&1 &`,
        timeout: 5000,
      }).catch(() => null);
      // Poll for vite readiness (up to 30s)
      let viteReady = false;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const check = await execInContainer({
          containerId: sandbox.containerId,
          command: 'curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null || echo "000"',
          timeout: 3000,
        }).catch(() => ({ stdout: '000' }));
        if (check.stdout.trim() === '200') { viteReady = true; break; }
      }

      // Auth tokens already injected into index.html — direct access works
      const livePreviewUrl = `http://127.0.0.1:${sandbox.vitePort}${pagePath}`;
      const diffViewUrl = `http://127.0.0.1:${PORT}/api/diff-view/${id}`;
      updateRequest(id, {
        previewUrl: diffViewUrl,
        livePreviewUrl: livePreviewUrl,
      });
      appendLog(id, viteReady ? 'Live preview ready' : 'Live preview starting (may need a moment to load)');

      // Capture screenshot using Playwright inside the sandbox (after vite is ready)
      if (viteReady) {
        try {
          if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
          updateRequest(id, { phase: 'capturing_screenshot' });
          appendLog(id, 'Capturing screenshot via Playwright...');
          // Write auth config as JSON file to avoid shell escaping issues with JWT tokens
          const screenshotConfig = JSON.stringify({
            idToken: actualIdToken,
            wpToken: actualWpToken,
            wpId,
            lang,
            pagePath: pagePath || '/',
          });
          await execInContainer({
            containerId: sandbox.containerId,
            command: `mkdir -p /workspace/results && cat > /workspace/results/auth.json << 'JSONEOF'\n${screenshotConfig}\nJSONEOF`,
            timeout: 5000,
          });
          const screenshotScript = `
const { chromium } = require('/usr/local/lib/node_modules/playwright');
const fs = require('fs');
(async () => {
  const cfg = JSON.parse(fs.readFileSync('/workspace/results/auth.json','utf8'));
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // Set tokens BEFORE navigating to target page — prevents "unknown user" on first load
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await page.evaluate((c) => {
    var e=String(Math.floor(Date.now()/1000)+54000);
    localStorage.setItem('MSM_AUTH',JSON.stringify({token:c.idToken,expireTime:e}));
    localStorage.setItem('MSM_AUTH_WORKPLACE',JSON.stringify({token:c.wpToken,workplaceId:c.wpId,expireTime:e}));
    sessionStorage.setItem('MSM_AUTH',JSON.stringify({token:c.idToken,expireTime:e}));
    sessionStorage.setItem('MSM_AUTH_WORKPLACE',JSON.stringify({token:c.wpToken,workplaceId:c.wpId,expireTime:e}));
    localStorage.setItem('i18nextLng',c.lang);
  }, cfg);
  // Now navigate to the actual target page with tokens already in storage
  await page.goto('http://localhost:5173' + cfg.pagePath, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/workspace/results/screenshot.png', fullPage: false });
  await browser.close();
})();`.trim();
          await execInContainer({
            containerId: sandbox.containerId,
            command: `node -e '${screenshotScript.replace(/'/g, "'\"'\"'")}'`,
            timeout: 45000,
          });
          const ssPath = path.join(SCREENSHOTS_DIR, `${id}.png`);
          await extractFile({ containerId: sandbox.containerId, containerPath: '/workspace/results/screenshot.png', hostPath: ssPath }).catch(() => null);
          if (fs.existsSync(ssPath)) {
            updateRequest(id, { screenshotPath: ssPath });
            appendLog(id, 'Screenshot captured');
          } else {
            appendLog(id, 'Screenshot file not found after capture');
          }
        } catch (ssErr) {
          appendLog(id, 'Screenshot capture failed: ' + (ssErr.message || '').slice(0, 200));
        }
      } else {
        // Fallback: capture vite log and attempt error-state screenshot
        try {
          const viteLog = await execInContainer({
            containerId: sandbox.containerId,
            command: 'tail -20 /tmp/vite.log 2>/dev/null || echo "No vite log"',
            timeout: 5000,
          }).catch(() => ({ stdout: 'Could not read vite log' }));
          appendLog(id, 'Vite not ready. Log tail: ' + (viteLog.stdout || '').slice(0, 300));

          if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
          const fallbackScript = `
const { chromium } = require('/usr/local/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:5173/', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/workspace/results/screenshot.png', fullPage: false });
  await browser.close();
})();`.trim();
          await execInContainer({
            containerId: sandbox.containerId,
            command: `mkdir -p /workspace/results && node -e '${fallbackScript.replace(/'/g, "'\"'\"'")}'`,
            timeout: 20000,
          });
          const ssPath = path.join(SCREENSHOTS_DIR, `${id}.png`);
          await extractFile({ containerId: sandbox.containerId, containerPath: '/workspace/results/screenshot.png', hostPath: ssPath }).catch(() => null);
          if (fs.existsSync(ssPath)) {
            updateRequest(id, { screenshotPath: ssPath });
            appendLog(id, 'Fallback screenshot captured (vite may not be fully loaded)');
          }
        } catch (fbErr) {
          appendLog(id, 'Fallback screenshot failed: ' + (fbErr.message || '').slice(0, 200));
        }
      }
    } catch (error) {
      // Even on error, try to set live preview URL if sandbox has a vite port
      const diffViewUrl = `http://127.0.0.1:${PORT}/api/diff-view/${id}`;
      const fallbackLive = sandbox?.vitePort ? `http://127.0.0.1:${sandbox.vitePort}${state.request?.pagePath || '/'}` : null;
      updateRequest(id, { previewUrl: diffViewUrl, livePreviewUrl: fallbackLive });
      appendLog(id, 'Live preview setup error: ' + (error.message || '').slice(0, 200));
    }

    updateRequest(id, { status: 'preview', phase: 'preview_ready' });
    appendAnalyticsEvent(state, 'preview_ready', { summary: 'Preview ready', previewUrl: state.previewUrl, screenshotUrl: state.screenshotPath ? `/api/screenshot/${state.id}` : null });
    appendLog(id, 'Ready for PM review');

  } catch (e) {
    updateRequest(id, { status: 'error', phase: 'pipeline_error', error: e.message });
    appendAnalyticsEvent(state, 'pipeline_error', { summary: e.message.slice(0, 200), phase: 'pipeline_error' });
    appendLog(id, 'Pipeline error: ' + e.message);
    await cleanup(id);
  }
}

async function handleApprove(id) {
  const state = requests.get(id);
  if (!state || state.status !== 'preview') return null;

  try {
    state.analytics.approvalState = 'approved';
    updateRequest(id, { status: 'approved' });
    updateRequest(id, { phase: 'creating_pr' });
    appendLog(id, 'PM approved, creating GitHub PR...');
    appendLog(id, `Branch: inspect/${id.slice(0,8)}, Diff size: ${(state.diff || '').length} bytes`);

    // Create PR from sandbox diff
    try {
      const branchName = `inspect/${state.id.slice(0,8)}`;
      const title = state.payload?.userPrompt ? state.payload.userPrompt.slice(0, 70) : `Inspect change ${state.id.slice(0,8)}`;
      const client = state.payload?.client || state.request?.client || '';
      const diff = state.diff || '';

      if (diff && fs.existsSync(DEFAULT_PRODUCT_REPO_ROOT)) {
        // Save diff to temp file for git apply
        const patchPath = path.join(SCREENSHOTS_DIR, `${id}.patch`);
        fs.writeFileSync(patchPath, diff, 'utf-8');

        // Stash any uncommitted changes on main (track whether we actually stashed)
        let didStash = false;
        try {
          const stashOut = await execAsync(`cd "${DEFAULT_PRODUCT_REPO_ROOT}" && git stash`, { timeout: 5000 });
          didStash = !stashOut.stdout.includes('No local changes');
        } catch {}

        // Clean up existing branch if any
        try { await execAsync(`cd "${DEFAULT_PRODUCT_REPO_ROOT}" && git branch -D "${branchName}" 2>/dev/null`, { timeout: 5000 }); } catch {}

        // Apply diff to a new branch and create PR
        await execAsync(`cd "${DEFAULT_PRODUCT_REPO_ROOT}" && git checkout -b "${branchName}"`, { timeout: 10000 });
        await execAsync(`cd "${DEFAULT_PRODUCT_REPO_ROOT}" && git apply --whitespace=nowarn "${patchPath}"`, { timeout: 10000 });
        await execAsync(`cd "${DEFAULT_PRODUCT_REPO_ROOT}" && git add -A && git commit -m "feat: ${title.replace(/"/g, '\\"')}\n\nGenerated by Moloco Inspect Agent\nRequest: ${state.id}"`, { timeout: 10000 });

        const prBody = [
          '## Summary',
          state.payload?.userPrompt || 'Automated change by Moloco Inspect',
          '',
          '## Details',
          `- **Request ID:** \`${state.id}\``,
          `- **Client:** ${client || 'unknown'}`,
          `- **Changed files:** ${state.diffStat || 'N/A'}`,
          '',
          '---',
          '_Generated by [Moloco Inspect Agent](http://localhost:4174)_',
        ].join('\n');
        // Write PR body to a temp file to avoid shell injection from user prompt text
        const prBodyPath = path.join(SCREENSHOTS_DIR, `${id}.prbody`);
        fs.writeFileSync(prBodyPath, prBody, 'utf-8');
        const prResult = await execAsync(`cd "${DEFAULT_PRODUCT_REPO_ROOT}" && gh pr create --title "${title.replace(/"/g, '\\"')}" --body-file "${prBodyPath}" --base main`, { timeout: 15000 });
        fs.rmSync(prBodyPath, { force: true });
        state.prUrl = prResult.stdout.trim();
        updateRequest(id, { prUrl: state.prUrl });
        appendLog(id, `PR created: ${state.prUrl}`);

        // Switch back to main
        await execAsync(`cd "${DEFAULT_PRODUCT_REPO_ROOT}" && git checkout main`, { timeout: 5000 });
        if (didStash) { try { await execAsync(`cd "${DEFAULT_PRODUCT_REPO_ROOT}" && git stash pop`, { timeout: 5000 }); } catch {} }

        fs.rmSync(patchPath, { force: true });
      }
    } catch (prErr) {
      appendLog(id, 'PR creation failed: ' + prErr.message);
      // Attempt to switch back to main even on failure
      try { await execAsync(`cd "${DEFAULT_PRODUCT_REPO_ROOT}" && git checkout main`, { timeout: 5000 }); } catch {}
      if (didStash) { try { await execAsync(`cd "${DEFAULT_PRODUCT_REPO_ROOT}" && git stash pop`, { timeout: 5000 }); } catch {} }
    }

    await cleanup(id);
    appendAnalyticsEvent(state, 'request_approved', {
      summary: 'PM approved and PR created',
      prUrl: state.prUrl || null,
    });
    return state;
  } catch (e) {
    updateRequest(id, { status: 'error', error: e.message });
    await cleanup(id);
    return state;
  }
}

async function handleReject(id, feedback) {
  const state = requests.get(id);
  if (!state || state.status !== 'preview') return null;

  // Reset changes and re-run with feedback
  state.analytics.approvalState = 'rejected';
  state.analytics.iterationCount = (state.analytics.iterationCount || 0) + 1;
  appendAnalyticsEvent(state, 'request_rejected', {
    summary: 'PM requested changes',
    feedback,
  });
  state.payload.userPrompt = `${state.payload.userPrompt}\n\nPM FEEDBACK (iterate on this): ${feedback}`;
  updateRequest(id, { status: 'pending', phase: 'queued_for_retry', diff: null });

  if (state.sandbox) {
    if (state.analytics.iterationCount >= 3) { await cleanup(id); }
    else { await resetSandbox({ containerId: state.sandbox.containerId }); }
  }

  // Re-run pipeline
  runPipeline(id);
  return state;
}

async function cleanup(id) {
  const state = requests.get(id);
  if (!state) return;
  // Playground-attached requests must NOT destroy the shared container.
  // The playground owns its sandbox lifecycle (hibernate/archive via its own API).
  if (state.playgroundId) {
    state.sandbox = null;
    return;
  }
  // Legacy one-shot flow: tear down the per-request container.
  if (state.sandbox) {
    await removeSandbox({ containerId: state.sandbox.containerId });
    releasePort(state.sandbox.openCodePort);
    releasePort(state.sandbox.vitePort);
    state.sandbox = null;
  }
}

// ─── Diff Viewer HTML Builder ─────────────────────────────────────────

function buildDiffViewerHtml({ requestId, diff, screenshotUrl, changedFiles, userPrompt, status, livePreviewUrl }) {
  const escapedDiff = diff.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Color-code diff lines
  const coloredDiff = escapedDiff.split('\n').map(line => {
    if (line.startsWith('+') && !line.startsWith('+++')) return `<span class="diff-add">${line}</span>`;
    if (line.startsWith('-') && !line.startsWith('---')) return `<span class="diff-del">${line}</span>`;
    if (line.startsWith('@@')) return `<span class="diff-hunk">${line}</span>`;
    if (line.startsWith('diff --git')) return `<span class="diff-file">${line}</span>`;
    return `<span>${line}</span>`;
  }).join('\n');

  const screenshotHtml = screenshotUrl
    ? `<div class="section">
        <h2>Screenshot Preview</h2>
        <img src="${screenshotUrl}" alt="Preview" class="screenshot" />
      </div>`
    : '';

  const fileListHtml = changedFiles.map(f => `<li><code>${f}</code></li>`).join('');

  const addCount = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
  const delCount = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---')).length;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>Review — ${requestId.slice(0,8)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --bg: #f4f4f4; --surface: #ffffff; --surface-raised: #f4f4f4;
    --border: #e0e0e0; --border-accent: rgba(15,98,254,0.2);
    --text: #161616; --text-secondary: #525252; --text-muted: #8d8d8d;
    --accent: #0f62fe; --accent-hover: #0043ce;
    --green: #24a148; --green-bg: rgba(36,161,72,0.08); --green-border: rgba(36,161,72,0.25);
    --red: #da1e28; --red-bg: rgba(218,30,40,0.06); --red-border: rgba(218,30,40,0.2);
    --hunk-bg: rgba(15,98,254,0.06); --hunk-text: #0f62fe;
    --radius: 6px; --radius-lg: 8px;
  }
  body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
  .container { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }

  /* Header */
  .header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
  .header-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--accent); display: flex; align-items: center; justify-content: center; }
  .header-icon svg { color: #fff; }
  .header h1 { font-size: 18px; font-weight: 600; flex: 1; }
  .header code { font-size: 13px; color: var(--text-secondary); font-family: 'JetBrains Mono', monospace; }
  .badge { padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase; }
  .badge-preview { background: rgba(56,139,253,0.15); color: var(--accent); border: 1px solid rgba(56,139,253,0.3); }
  .badge-approved { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-border); }

  /* Prompt card */
  .prompt-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; margin-bottom: 24px; }
  .prompt-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); margin-bottom: 8px; }
  .prompt-text { font-size: 14px; line-height: 1.7; color: var(--text); }

  /* Stats */
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
  .stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; text-align: center; transition: border-color 0.15s; }
  .stat:hover { border-color: var(--border-accent); }
  .stat-value { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .stat-value.green { color: var(--green); }
  .stat-value.red { color: var(--red); }
  .stat-label { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; margin-top: 4px; }

  /* Sections */
  .section { margin-bottom: 24px; }
  .section-header { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .section-header svg { color: var(--text-muted); }

  /* File chips */
  .file-list { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
  .file-chip { padding: 5px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; font-size: 12px; font-family: 'JetBrains Mono', monospace; color: var(--text-secondary); transition: all 0.15s; cursor: default; }
  .file-chip:hover { border-color: var(--accent); color: var(--text); background: var(--surface-raised); }

  /* Diff viewer */
  .diff-viewer { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
  .diff-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--surface-raised); }
  .diff-toolbar-label { font-size: 12px; font-weight: 500; color: var(--text-secondary); }
  .diff-toolbar-stats { display: flex; gap: 12px; font-size: 12px; font-family: 'JetBrains Mono', monospace; }
  .diff-toolbar-stats .add { color: var(--green); }
  .diff-toolbar-stats .del { color: var(--red); }
  .diff-scroll { overflow: auto; max-height: 640px; }
  .diff-scroll pre { padding: 16px; font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.7; white-space: pre; tab-size: 2; counter-reset: line; }
  .diff-add { background: #e6ffec; color: #1a7f37; display: block; padding: 0 16px; margin: 0 -16px; }
  .diff-del { background: #ffebe9; color: #cf222e; display: block; padding: 0 16px; margin: 0 -16px; }
  .diff-hunk { background: var(--hunk-bg); color: var(--hunk-text); display: block; font-weight: 500; padding: 4px 16px; margin: 8px -16px 4px; border-radius: 4px; }
  .diff-file { color: var(--text); display: block; font-weight: 600; padding: 8px 16px; margin: 12px -16px 4px; border-top: 1px solid var(--border); background: var(--surface-raised); }
  .diff-file:first-child { margin-top: 0; border-top: none; }

  /* Screenshot */
  .screenshot-wrap { border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--border); background: var(--surface); }
  .screenshot { width: 100%; display: block; }

  /* Actions */
  .actions { display: flex; gap: 12px; margin-top: 28px; padding-top: 24px; border-top: 1px solid var(--border); }
  .btn { padding: 10px 20px; border-radius: var(--radius); font-size: 13px; font-weight: 600; border: none; cursor: pointer; font-family: 'Inter', sans-serif; display: inline-flex; align-items: center; gap: 8px; transition: all 0.15s; text-decoration: none; }
  .btn svg { width: 16px; height: 16px; }
  .btn-approve { background: var(--green); color: #fff; }
  .btn-approve:hover { background: #46c252; box-shadow: 0 0 0 3px var(--green-bg); }
  .btn-reject { background: transparent; color: var(--red); border: 1px solid var(--red-border); }
  .btn-reject:hover { background: var(--red-bg); }
  .btn-live { background: var(--accent); color: #fff; }
  .btn-live:hover { background: var(--accent-hover); box-shadow: 0 0 0 3px rgba(56,139,253,0.2); }
  .btn-secondary { background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); }
  .btn-secondary:hover { border-color: var(--text-muted); color: var(--text); }

  /* Result banner */
  .result-banner { padding: 16px 20px; border-radius: var(--radius); font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 10px; }
  .result-approved { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-border); }
  .result-rejected { background: var(--red-bg); color: var(--red); border: 1px solid var(--red-border); }

  /* Feedback dialog */
  .feedback-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(4px); }
  .feedback-dialog { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 24px; width: 480px; max-width: 90vw; }
  .feedback-dialog h3 { font-size: 16px; margin-bottom: 12px; }
  .feedback-dialog textarea { width: 100%; height: 100px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-family: inherit; font-size: 13px; padding: 12px; resize: vertical; }
  .feedback-dialog textarea:focus { outline: none; border-color: var(--accent); }
  .feedback-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="header-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
    </div>
    <h1>Code Review <code>${requestId.slice(0,8)}</code></h1>
    <span class="badge badge-${status === 'preview' ? 'preview' : 'approved'}">${status}</span>
  </div>

  <div class="prompt-card">
    <div class="prompt-label">Request</div>
    <div class="prompt-text">${userPrompt.replace(/</g, '&lt;').replace(/\n/g, '<br>') || 'No prompt'}</div>
  </div>

  <div class="stats">
    <div class="stat"><div class="stat-value">${changedFiles.length}</div><div class="stat-label">Changed Files</div></div>
    <div class="stat"><div class="stat-value green">+${addCount}</div><div class="stat-label">Additions</div></div>
    <div class="stat"><div class="stat-value red">-${delCount}</div><div class="stat-label">Deletions</div></div>
  </div>

  ${changedFiles.length ? `<div class="section">
    <div class="section-header">
      <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0113.25 16h-9.5A1.75 1.75 0 012 14.25V1.75z"/></svg>
      Changed Files
    </div>
    <ul class="file-list">${changedFiles.map(f => `<li class="file-chip">${f}</li>`).join('')}</ul>
  </div>` : ''}

  ${screenshotUrl ? `<div class="section">
    <div class="section-header">
      <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M16 13.25A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5zM1.75 2.5a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H1.75z"/></svg>
      Screenshot
    </div>
    <div class="screenshot-wrap"><img src="${screenshotUrl}" alt="Preview" class="screenshot" /></div>
  </div>` : ''}

  <div class="section">
    <div class="section-header" style="justify-content:space-between">
      <span style="display:flex;align-items:center;gap:8px">
        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M8.75 1.75a.75.75 0 00-1.5 0V5H4a.75.75 0 000 1.5h3.25v3.25a.75.75 0 001.5 0V6.5H12A.75.75 0 0012 5H8.75V1.75z"/></svg>
        Code Changes
      </span>
    </div>
    <div class="diff-viewer">
      <div class="diff-toolbar">
        <span class="diff-toolbar-label">${changedFiles.length} file${changedFiles.length !== 1 ? 's' : ''} changed</span>
        <div class="diff-toolbar-stats">
          <span class="add">+${addCount}</span>
          <span class="del">-${delCount}</span>
        </div>
      </div>
      <div class="diff-scroll"><pre>${coloredDiff}</pre></div>
    </div>
  </div>

  <div class="actions" id="actions">
    ${livePreviewUrl ? `<a class="btn btn-live" href="${livePreviewUrl}" target="_blank">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3h7v7"/><path d="M13 3L6 10"/><path d="M11 9v4H3V5h4"/></svg>
      Live Preview
    </a>` : ''}
    <button class="btn btn-approve" onclick="handleApprove()">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8l3 3 5-6"/></svg>
      Approve & Create PR
    </button>
    <button class="btn btn-reject" onclick="showRejectDialog()">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8"/></svg>
      Request Changes
    </button>
    <a class="btn btn-secondary" href="http://127.0.0.1:${PORT}/requests/${requestId}" target="_blank">Dashboard</a>
  </div>
</div>

<div class="feedback-overlay" id="feedbackOverlay" style="display:none">
  <div class="feedback-dialog">
    <h3>Request Changes</h3>
    <p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px">Describe what should be different. The agent will iterate on this feedback.</p>
    <textarea id="feedbackText" placeholder="e.g., Move the button to the right side, change the color to blue..."></textarea>
    <div class="feedback-actions">
      <button class="btn btn-secondary" onclick="hideRejectDialog()">Cancel</button>
      <button class="btn btn-reject" onclick="handleReject()">Submit Feedback</button>
    </div>
  </div>
</div>

<script>
function showRejectDialog() {
  document.getElementById('feedbackOverlay').style.display = 'flex';
  document.getElementById('feedbackText').focus();
}
function hideRejectDialog() {
  document.getElementById('feedbackOverlay').style.display = 'none';
}
async function handleApprove() {
  try {
    const res = await fetch('/api/approve/${requestId}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json();
    if (data.ok !== false) {
      document.getElementById('actions').innerHTML = '<div class="result-banner result-approved"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M4 8l3 3 5-6"/></svg>Approved — PR is being created' + (data.prUrl ? ' <a href="' + data.prUrl + '" target="_blank" style="color:inherit;margin-left:8px">View PR \\u2192</a>' : '') + '</div>';
    } else { alert('Error: ' + (data.error || 'Unknown')); }
  } catch(e) { alert('Failed: ' + e.message); }
}
async function handleReject() {
  const feedback = document.getElementById('feedbackText').value.trim();
  if (!feedback) { document.getElementById('feedbackText').focus(); return; }
  hideRejectDialog();
  try {
    const res = await fetch('/api/reject/${requestId}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feedback }) });
    const data = await res.json();
    if (data.ok !== false) {
      document.getElementById('actions').innerHTML = '<div class="result-banner result-rejected"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 4l-8 8"/><path d="M4 4l8 8"/></svg>Changes requested — agent is iterating</div>';
    } else { alert('Error: ' + (data.error || 'Unknown')); }
  } catch(e) { alert('Failed: ' + e.message); }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') hideRejectDialog();
});
</script>
</body>
</html>`;
}

// ─── HTTP Server ──────────────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Preview proxy — /preview/:requestId/* → sandbox vite
  const previewMatch = pathname.match(/^\/preview\/([^/]+)(\/.*)?$/);
  if (previewMatch) {
    const [, reqId, subPath = '/'] = previewMatch;
    const state = requests.get(reqId);
    if (!state?.sandbox?.vitePort) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h3>Preview not available</h3><p>Sandbox not running for this request.</p>');
      return;
    }
    const client = state.payload?.client || state.request?.client || 'tving';
    const workplaceId = client === 'tving' ? 'TVING_OMS' : client.toUpperCase();

    // If first visit (no __previewed cookie), redirect through bootstrap page for proper auth seeding
    const cookies = req.headers.cookie || '';
    if (!cookies.includes('__previewed=1') && !subPath.includes('__codex/preview-bootstrap') && !subPath.includes('/@') && !subPath.match(/\.\w+$/)) {
      const bootstrapTarget = encodeURIComponent((subPath || '/') + (url.search || ''));
      const bootstrapUrl = `/__codex/preview-bootstrap?target=${bootstrapTarget}&workplaceId=${workplaceId}&lng=ko&client=${client}`;
      res.writeHead(302, {
        'Location': `/preview/${reqId}${bootstrapUrl}`,
        'Set-Cookie': `__previewed=1; Path=/preview/${reqId}; Max-Age=28800`,
      });
      res.end();
      return;
    }

    const target = `http://127.0.0.1:${state.sandbox.vitePort}${subPath}${url.search}`;
    // Fallback: also inject auth tokens directly into HTML in case bootstrap is unavailable
    const authTokens = state.authTokens || {};
    const proxyIdToken = authTokens.idToken || 'mock-preview-token';
    const proxyWpToken = authTokens.wpToken || `mock-workplace-token:${workplaceId}`;
    const proxyWpId = authTokens.wpId || workplaceId;
    const proxyLang = state.payload?.language || 'ko';
    const AUTH_INJECT = `<script>(function(){var e=String(Math.floor(Date.now()/1000)+54000),a=JSON.stringify({token:"${proxyIdToken}",expireTime:e}),w=JSON.stringify({token:"${proxyWpToken}",workplaceId:"${proxyWpId}",expireTime:e});try{localStorage.setItem("MSM_AUTH",a);localStorage.setItem("MSM_AUTH_WORKPLACE",w);sessionStorage.setItem("MSM_AUTH",a);sessionStorage.setItem("MSM_AUTH_WORKPLACE",w);localStorage.setItem("i18nextLng","${proxyLang}")}catch(x){}})()</script>`;
    try {
      const proxyReq = http.request(target, { method: req.method, headers: { ...req.headers, host: `127.0.0.1:${state.sandbox.vitePort}` } }, (proxyRes) => {
        const ct = proxyRes.headers['content-type'] || '';
        if (ct.includes('text/html')) {
          // Buffer HTML to inject auth tokens and rewrite asset paths
          const proxyBase = `/preview/${reqId}`;
          const chunks = [];
          proxyRes.on('data', c => chunks.push(c));
          proxyRes.on('end', () => {
            let html = Buffer.concat(chunks).toString('utf-8');
            // Vite EPIPE auto-recovery — esbuild 자식 프로세스가 죽으면
            // vite 가 "The service is no longer running" HTML 을 반환.
            // 감지 시 supervisorctl restart vite 백그라운드 호출 + 503
            // refresh 페이지로 사용자 안내 (5초 후 자동 새로고침).
            if (html.includes('The service is no longer running') ||
                html.includes('plugin:vite:esbuild')) {
              const containerName = state?.sandbox?.containerName || state?.sandbox?.containerId;
              if (containerName) {
                console.warn(`[preview-proxy] vite EPIPE detected for ${reqId}, triggering supervisorctl restart vite on ${containerName}`);
                execAsync(`docker exec ${containerName} supervisorctl restart vite`, { timeout: 10_000 })
                  .then(() => console.log(`[preview-proxy] vite restarted for ${reqId}`))
                  .catch((err) => console.warn(`[preview-proxy] vite restart failed for ${reqId}: ${err.message}`));
              } else {
                console.warn(`[preview-proxy] vite EPIPE detected for ${reqId} but no containerName — manual restart needed`);
              }
              res.writeHead(503, {
                'Content-Type': 'text/html; charset=utf-8',
                'Refresh': '5',
                'Cache-Control': 'no-store',
              });
              res.end(`<!doctype html><meta charset="utf-8"><title>Preview restarting…</title>
<style>body{font-family:system-ui;padding:48px;text-align:center;color:#444;background:#fafafa}h2{color:#666;margin-bottom:8px}p{color:#888;margin:8px 0}.spin{display:inline-block;animation:spin 1.2s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style>
<h2><span class="spin">🔄</span> Preview server 재시작 중…</h2>
<p>Vite (esbuild) 가 멈춰서 자동으로 다시 시작했습니다.</p>
<p>5초 후 자동 새로고침됩니다.</p>`);
              return;
            }
            // Rewrite absolute asset paths to go through the preview proxy
            html = html.replace(/(src|href)="\/(?!\/)/g, `$1="${proxyBase}/`);
            html = html.replace(/(from\s+")\/(@[^"]+)/g, `$1${proxyBase}/$2`);
            html = html.replace('</head>', AUTH_INJECT + '</head>');
            const headers = { ...proxyRes.headers };
            headers['content-length'] = Buffer.byteLength(html);
            delete headers['content-encoding']; // Remove gzip since we modified
            res.writeHead(proxyRes.statusCode || 200, headers);
            res.end(html);
          });
        } else {
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res);
        }
      });
      proxyReq.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'text/html' });
        res.end('<h3>Preview server not ready</h3><p>The sandbox vite server may still be starting.</p>');
      });
      req.pipe(proxyReq);
    } catch {
      res.writeHead(502);
      res.end('Proxy error');
    }
    return;
  }

  // Health check
  if (pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      requests: requests.size,
      workspaceRoot: WORKSPACE_ROOT,
      repoRoot: DEFAULT_PRODUCT_REPO_ROOT,
      designSystemRoot: DESIGN_SYSTEM_ROOT,
      sandboxImage: SANDBOX_IMAGE,
      model: SANDBOX_MODEL.includes('/') ? SANDBOX_MODEL : SANDBOX_PROVIDER + '/' + SANDBOX_MODEL,
    });
  }

  // Active sandboxes
  if (pathname === '/api/sandboxes') {
    const sandboxes = [];
    for (const [id, state] of requests) {
      if (state.sandbox) {
        sandboxes.push({
          name: state.sandbox.containerName,
          requestId: id,
          status: 'running',
          ports: `oc:${state.sandbox.openCodePort} vite:${state.sandbox.vitePort}`,
          previewUrl: state.previewUrl || null,
        });
      }
    }
    return json(res, 200, { ok: true, sandboxes });
  }

  if (pathname === '/api/request-schema') {
    return json(res, 200, REQUEST_SCHEMA);
  }

  if (pathname === '/api/preview-verification') {
    return json(res, 200, PREVIEW_VERIFICATION);
  }

  if (pathname === '/api/prd/ingest' && req.method === 'POST') {
    try {
      const payload = await parseBody(req);
      const result = await ingestPrdPayload(payload);
      return json(res, 200, result);
    } catch (error) {
      return json(res, 400, { error: error.message || 'PRD ingest failed' });
    }
  }

  // AI-powered request analysis — generates a thoughtful plan
  if (pathname === '/api/analyze-request' && req.method === 'POST') {
    try {
      const payload = await parseBody(req);
      const userPrompt = payload.userPrompt || '';
      const component = payload.component || null;
      const pagePath = payload.pagePath || '/';
      const client = payload.client || 'msm-default';
      const testId = payload.testId || null;
      const language = payload.language || null;
      const intent = payload.requestContract?.change_intent || 'layout_adjustment';
      const selectedElements = payload.selectedElements || [];

      // Try LLM-based analysis first, fall back to smart template
      let analysis = null;

      // Attempt LLM call if API key available
      const analysisPrompt = `You are an expert UI/UX engineer. Analyze this change request.

IMPORTANT: ALL output MUST be in English, regardless of the input language. Translate any non-English request into English in your analysis.

Context: ${client}, route: ${pagePath}, component: ${component || testId || 'unknown'}${language ? ', lang: ' + language : ''}
Selected elements: ${selectedElements.map(e => e.component || e.testId || '').filter(Boolean).join(', ') || 'none'}
Request: "${userPrompt}"

Return ONLY valid JSON (no markdown, no explanation). Every value MUST be in English:
{"understanding":"2-3 sentence summary of the request intent","analysis":"3-4 sentence technical approach (files, components, APIs)","steps":["specific step 1 (include file names)","step 2","step 3","step 4","verification step"],"risks":"risk factors or null","verification":"how to verify the changes"}`;

      try {
        let text = '';
        // Analysis is independent of sandbox provider — try Anthropic first, then OpenAI
        const analysisAnthropicKey = process.env.ANTHROPIC_API_KEY || (SANDBOX_PROVIDER === 'anthropic' ? SANDBOX_API_KEY : null);
        if (analysisAnthropicKey) {
          const analysisModel = process.env.ANALYSIS_MODEL || 'claude-sonnet-4-20250514';
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': analysisAnthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({ model: analysisModel, max_tokens: 1500, messages: [{ role: 'user', content: analysisPrompt }] }),
          });
          if (resp.ok) {
            const result = await resp.json();
            text = (result.content?.[0]?.text || '').trim();
          } else {
            console.error(`[Analysis] Anthropic returned ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
          }
        } else if (process.env.OPENAI_API_KEY) {
          const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-4o', max_tokens: 800, messages: [{ role: 'user', content: analysisPrompt }] }),
          });
          if (resp.ok) {
            const result = await resp.json();
            text = (result.choices?.[0]?.message?.content || '').trim();
          }
        }
        if (text) {
          console.log('[Analysis] Raw text length:', text.length, 'starts:', text.slice(0, 80));
          fs.writeFileSync('/tmp/analysis-raw.txt', text);
          text = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            let raw = jsonMatch[0];
            // Try parsing as-is first
            try { analysis = JSON.parse(raw); console.log('[Analysis] Parsed OK'); }
            catch {
              // Fix truncated JSON: close open strings, arrays, objects
              let fixed = raw;
              // Count open braces/brackets
              const opens = (fixed.match(/{/g) || []).length;
              const closes = (fixed.match(/}/g) || []).length;
              const openBrackets = (fixed.match(/\[/g) || []).length;
              const closeBrackets = (fixed.match(/]/g) || []).length;
              // If truncated mid-string, close the string
              const quotes = (fixed.match(/"/g) || []).length;
              if (quotes % 2 !== 0) fixed += '"';
              // Close arrays and objects
              for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']';
              for (let i = 0; i < opens - closes; i++) fixed += '}';
              try {
                analysis = JSON.parse(fixed);
                console.log('[Analysis] Parsed OK (fixed truncation)');
              } catch (parseErr) { console.error('[Analysis] JSON parse failed after fix:', parseErr.message); }
            }
          } else {
            console.error('[Analysis] No JSON match in text:', text.slice(0, 100));
          }
        } else {
          console.error('[Analysis] No text returned from LLM');
        }
      } catch (llmErr) { console.error('[Analysis] LLM error:', llmErr.message || llmErr); }

      // Smart template fallback — generates detailed plan from context
      if (!analysis) {
        const target = testId || component || 'target element';
        const pageLabel = pagePath.replace(/^\/v1\/p\/[^/]+\//, '').replace(/\?.*$/, '') || 'page';
        const elementInfo = selectedElements.length > 0
          ? selectedElements.map(e => e.component || e.testId || e.semantics?.domTag || '').filter(Boolean).join(', ')
          : target;

        const intentMap = {
          layout_adjustment: {
            understanding: `You requested a layout/placement change for the ${elementInfo} element on the ${pageLabel} page. "${userPrompt}"`,
            analysis: `Analyzing the current Flex/Grid structure of the ${elementInfo} component and adjusting the layout as requested. Implementing with minimal changes while preserving existing design system tokens and styles.`,
            steps: [
              `Locate component files related to ${pageLabel} in the ${client} app (src/apps/${client}/component/)`,
              `Analyze the current layout structure of ${elementInfo} (Flex/Grid, spacing, ordering)`,
              `Modify layout properties to match the request (CSS/style adjustments)`,
              `Verify alignment and spacing with surrounding elements`,
              `Run TypeScript type-check and visual verification`,
            ],
            risks: 'Layout changes may affect responsive design, so verification across various screen sizes is recommended.',
            verification: `Visually verify that the placement of ${elementInfo} on the ${pageLabel} page has been changed as requested`,
          },
          state_handling: {
            understanding: `You requested a change to the behavior/state handling of ${elementInfo} on the ${pageLabel} page. "${userPrompt}"`,
            analysis: `Analyzing the state management logic and event handlers of the ${elementInfo} component. Adding new state or modifying existing logic as needed to implement the requested behavior.`,
            steps: [
              `Analyze the Container/Component files for ${elementInfo}`,
              `Identify the current state management logic (hooks, reducers, context)`,
              `Implement the state/handlers required for the requested behavior`,
              `Check tRPC endpoints if API integration is needed`,
              `Test functionality and run TypeScript type-check`,
            ],
            risks: 'State changes may affect other components, and backend modifications may be required if API calls are involved.',
            verification: `Verify that the new behavior works correctly in ${elementInfo} across different scenarios`,
          },
          copy_update: {
            understanding: `You requested a text/copy change for ${elementInfo} on the ${pageLabel} page. "${userPrompt}"`,
            analysis: `Modifying the i18n files (locales) and the text rendering portion of the component. Updating both Korean and English translation files together.`,
            steps: [
              `Search for the i18n key where the text is used (src/i18n/locales/)`,
              `Update the Korean (ko) translation file`,
              `Update the English (en) translation file`,
              `Replace any hardcoded text in the component with an i18n key`,
              `Verify the updated text displays correctly in the UI`,
            ],
            risks: null,
            verification: `Verify the updated text displays correctly on the ${pageLabel} page`,
          },
          component_swap: {
            understanding: `You requested to swap ${elementInfo} with a different component or add a new component on the ${pageLabel} page. "${userPrompt}"`,
            analysis: `Analyzing the existing component's props and data flow, then replacing it with the appropriate design system component. Also configuring any required wrappers such as FormikHarness and Provider.`,
            steps: [
              `Analyze the current structure and props of the ${elementInfo} component`,
              `Select the replacement design system component and verify its import path`,
              `Swap in the new component and map props accordingly`,
              `Configure required Provider/Wrapper setup`,
              `Run TypeScript type-check and visual verification`,
            ],
            risks: 'Swapping components may change the existing props interface, which could cause type errors.',
            verification: `Verify the new component performs the same functionality as before and the requested changes are reflected`,
          },
        };

        const template = intentMap[intent] || intentMap.layout_adjustment;
        analysis = { ...template };
      }

      return json(res, 200, { ok: true, analysis });
    } catch (error) {
      return json(res, 500, { ok: false, error: error.message });
    }
  }

  // Canvas AI Wizard — chat interface. Takes message history, returns either
  // a clarifying question or a structured plan.
  //
  // ⚠️ DEPRECATED (Phase 3 Task 3.1 sub-phase E, 2026-04-30) — use /api/intake
  // with `history` 대신. /api/chat 은 single-turn 분류만 / classifier
  // 게이트 분리 / plan 흐름 별개. /api/intake 가 6 종 kind (chat /
  // status_query / code_change_clear / code_change_ambiguous / plan_emit /
  // job_dispatched) 통합 dispatch + multi-turn history 처리.
  // 호출자 마이그레이션: Playground postChat → postIntake (sub-phase C).
  // 삭제 시점: 호출 zero 확인 후 (handoff 의 측정 슬라이스 → 1-2 분기).
  if (pathname === '/api/chat' && req.method === 'POST') {
    try {
      // Deprecation 헤더 + 로그 — caller (UA / origin) 추적해 마이그레이션
      // 진행 상황 측정. 헤더는 fetch response 에 보임.
      res.setHeader('X-Deprecated', '/api/intake (history-aware) - see docs/superpowers/plans/2026-04-30-history-aware-intake.md');
      res.setHeader('Sunset', 'TBD');
      console.warn(`[/api/chat] DEPRECATED call from ua="${(req.headers['user-agent'] || 'unknown').slice(0, 80)}" origin="${req.headers.origin || 'none'}"`);
      const payload = await parseBody(req);
      const messages = Array.isArray(payload?.messages) ? payload.messages : [];

      if (messages.length === 0) {
        return json(res, 400, { ok: false, error: 'messages array required' });
      }

      const apiKey =
        process.env.ANTHROPIC_API_KEY ||
        (SANDBOX_PROVIDER === 'anthropic' ? SANDBOX_API_KEY : null);
      if (!apiKey) {
        return json(res, 503, {
          ok: false,
          error: 'ANTHROPIC_API_KEY not configured. Set env var and restart orchestrator.',
        });
      }

      const patternsPath = path.join(DESIGN_SYSTEM_ROOT, 'src', 'patterns.json');
      const apiContractsPath = path.join(DESIGN_SYSTEM_ROOT, 'src', 'api-ui-contracts.json');
      const patterns = readJsonFile(patternsPath, {});
      const apiContracts = readJsonFile(apiContractsPath, {});
      const requestSchema = readJsonFile(REQUEST_SCHEMA_PATH, {});

      const systemPrompt = `You are an AI assistant embedded in Moloco Canvas that helps PMs/SAs plan UI changes for the MSM Portal.

## How you respond
You respond to the user in Korean, in a friendly conversational tone — like a thoughtful PM collaborator, not a form-filling bot.

You have TWO response modes:

**Mode A — Ask a short clarifying question (plain text, Korean):**
Use this when critical info is missing. Ask only ONE focused question at a time. Keep it short (1-2 sentences).
Critical info the plan needs:
- Target client (from enum: msm-default, tving, shortmax, onboard-demo)
- Target page or route (or "new page")
- Specific goal / what should change
- A SINGLE concrete target file/component — if multiple files could reasonably match the user's description, you MUST ask which one rather than guessing

Do NOT ask about client if the user has already implied it (e.g. mentioned "TVING"). Do NOT ask more questions than necessary.

### Disambiguating target files (mandatory)
Many MSM Portal pages render two or more similar tables/sections/views (e.g. "주문에 포함된 소재" tab vs "모든 소재" tab, "예약형" vs "경매형", nested table vs summary card). If the user's request is about "the X page" and X has multiple sub-views/tabs/tables that plausibly match, ask a clarifying question BEFORE emitting a plan. Format:
- List 2–3 concrete candidates, each with a short Korean label AND the specific file/component name in parentheses
- Example:
  "광고 소재 리뷰 페이지에는 테이블이 두 개 있어요. 어느 쪽을 수정할까요?
  (a) '주문에 포함된 소재' 탭 — MCCreativeReviewTable
  (b) '모든 소재' 탭 — MCPublisherCreativeReviewTable"
- Example (예약형 vs 경매형):
  "주문 관리 화면에는 예약형과 경매형 주문이 있어요. 어느 쪽인가요?"

Better to ask one extra round than to silently edit the wrong file — PMs/SAs strongly prefer being asked.

**Mode B — Produce a plan:**
When you have enough info, output a structured plan wrapped in a JSON code fence:

\`\`\`json
{
  "intent": "<copy_update|spacing_adjustment|token_alignment|component_swap|layout_adjustment|state_handling|accessibility_improvement|new_page|new_feature|data_display_change|form_field_addition|bulk_operation>",
  "target": { "client": "<enum>", "route_or_page": "<URL path starting with />" },
  "target_entity": "<Creative|Order|Advertiser|Product|AuctionOrder|PublisherTarget|null>",
  "summary": "<1-2 sentence Korean summary>",
  "visual_constraints": ["<string>"],
  "plan_items": [
    {
      "id": "<kebab-case>",
      "title": "<Korean>",
      "description": "<Korean, 1-2 sentences>",
      "pattern_id": "<pattern id or null>",
      "target_file": "<path or pattern template form or null>",
      "depends_on": []
    }
  ]
}
\`\`\`

You MAY also write a short Korean one-liner BEFORE the JSON block (e.g. "네, 아래 계획으로 진행할 수 있습니다:"). Do NOT write explanatory text AFTER the JSON block.

## Grounding rules (strict)
- ONLY reference pattern_id values that exist in patterns.json. Never invent.
- ONLY reference entity names from api-ui-contracts.json. Use null if unsure.
- ONLY reference feature flags, route keys, i18n keys, and component names that appear in the provided JSON. Never invent.
- target_file should use patterns.json location templates when the exact file is unknown (e.g. "src/apps/{client}/container/...").

## target.route_or_page (strict format)
- MUST be a real URL path that begins with "/" (e.g. "/", "/orders", "/campaigns/new", "/settings/users").
- NEVER a pattern name, component name, or prose description. Invalid examples: "navbar (app-shell)", "MCOmsMainNavbarContainer", "home page".
- When the change affects chrome that appears on every page (top nav, side nav, footer), choose a page where that chrome is clearly rendered — usually "/" or the client's main landing route. Do NOT invent a route the app doesn't have.
- This value is passed directly to Playwright as \`http://localhost:5173{route_or_page}\` to capture the post-change screenshot. A wrong value means the PM will see the wrong page.

## visual_constraints (always include when producing a plan)
These propagate to downstream execution agents so generated screens match the existing product:
- "Follow the existing visual vocabulary of the target client (color, typography, spacing, density, shadow, radius)."
- "Use tokens from design-system/src/tokens.json only. No hardcoded hex/px/font."
- "No aggressive gradient backgrounds."
- "No emoji unless the brand already uses them."
- "No rounded-container-with-left-border-accent tropes."
- "Do not draw icons/imagery as freehand SVG. Use icons from components.json icon catalog, or a placeholder box."
- "Do not substitute overused fonts (Inter, Roboto, Arial, system). Use the DS typography tokens."
- "A correct placeholder is better than a bad attempt at the real component."

## Design system resources (reference these when planning)

pm-sa-request-schema.json:
${JSON.stringify(requestSchema, null, 2)}

patterns.json:
${JSON.stringify(patterns, null, 2)}

api-ui-contracts.json:
${JSON.stringify(apiContracts, null, 2)}`;

      const model = process.env.PLAN_MODEL || 'claude-sonnet-4-20250514';
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content || ''),
          })),
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[Chat] Anthropic ${resp.status}:`, errText.slice(0, 400));
        return json(res, 502, {
          ok: false,
          error: `LLM error: ${resp.status}`,
          detail: errText.slice(0, 400),
        });
      }

      const result = await resp.json();
      const text = (result.content?.[0]?.text || '').trim();
      if (!text) {
        return json(res, 502, { ok: false, error: 'Empty LLM response' });
      }

      // Look for JSON fence — plan mode
      const planMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
      let plan = null;
      let prefix = text;
      if (planMatch) {
        try {
          plan = JSON.parse(planMatch[1]);
          prefix = text.slice(0, planMatch.index).trim();
        } catch (parseErr) {
          console.error('[Chat] Plan JSON parse failed:', parseErr.message);
        }
      }

      console.log(
        `[Chat] Replied (${plan ? 'plan' : 'question'}) after ${messages.length} messages`,
      );
      return json(res, 200, {
        ok: true,
        reply: plan
          ? { type: 'plan', content: prefix, plan }
          : { type: 'question', content: text },
      });
    } catch (error) {
      console.error('[Chat] Unexpected error:', error);
      return json(res, 500, { ok: false, error: error.message });
    }
  }

  // Unified intake — surface 무관 entry point. classifier + chat/status +
  // PRD analyzer 를 한 lib (molly-intake.js) 로 묶어 4 종 kind 반환.
  // Phase 2 of unified intake plan. 기존 /api/molly/respond 는 alias 로 유지
  // (Phase 3 에서 deprecate).
  if (pathname === '/api/intake' && req.method === 'POST') {
    try {
      const { processIntake } = await import('./lib/molly-intake.js');
      const payload = await parseBody(req);
      const text = String(payload?.text ?? '').trim();
      if (!text) return json(res, 400, { ok: false, error: 'text required' });
      const ctx = {
        surface: payload?.surface || 'unknown',
        recentMessages: Array.isArray(payload?.recentMessages) ? payload.recentMessages : [],
        channel: payload?.channel,
        threadTs: payload?.threadTs,
        // Phase 3 Task 3.1 sub-phase A — multi-turn 지원. 클라이언트가
        // 직전 IntakeResult.kind 를 assistant turn 의 kind 로 저장해서
        // 보내야 dispatcher 가 정확한 routing. 길이 제한 10 (토큰 비용).
        history: Array.isArray(payload?.history) ? payload.history.slice(-10) : [],
        listJobs,
        getJob,
        // Sub-phase B.2 — molly-intake 의 handleClarificationAnswer / handlePlanEdit
        // 가 emitPlan 호출 시 DS context 를 알아야 함. caller (Slack/Chrome ext/
        // Playground) 가 client / routeOrPage 도 보내면 plan emitter 가 활용.
        designSystemRoot: DESIGN_SYSTEM_ROOT,
        requestSchemaPath: REQUEST_SCHEMA_PATH,
        client: payload?.client,
        routeOrPage: payload?.routeOrPage,
      };
      const result = await processIntake(text, ctx);
      return json(res, 200, { ok: true, ...result });
    } catch (err) {
      return json(res, 500, { ok: false, error: err?.message ?? String(err) });
    }
  }

  // molly chat mode — classifier 후 분기. 코드 변경 요청이면 잡 생성을
  // 호출자가 알아서 (jobId 반환은 안 함 — surface 가 createJob/decompose
  // 직접 부름. 이 엔드포인트는 분류 + chat/status 응답만 책임).
  if (pathname === '/api/molly/respond' && req.method === 'POST') {
    try {
      const { classifyMollyText } = await import('./lib/molly-classifier.js');
      const { composeChatReply } = await import('./lib/molly-chat.js');
      const { composeStatusReply } = await import('./lib/molly-status.js');
      const payload = await parseBody(req);
      const text = String(payload?.text ?? '').trim();
      if (!text) return json(res, 400, { ok: false, error: 'text required' });
      const ctx = {
        surface: payload?.surface || 'unknown',
        recentMessages: Array.isArray(payload?.recentMessages) ? payload.recentMessages : [],
      };
      const { kind, reason } = await classifyMollyText(text, ctx);
      if (kind === 'chat') {
        const response = await composeChatReply(text, ctx);
        return json(res, 200, { ok: true, kind, reason, response });
      }
      if (kind === 'status_query') {
        const response = await composeStatusReply(text, { listJobs, getJob });
        return json(res, 200, { ok: true, kind, reason, response });
      }
      // code_change — clarity 분석 후 결과에 따라 응답 다름
      try {
        const { analyzePrdClarity } = await import('./lib/molly-prd-analyzer.js');
        const analysis = await analyzePrdClarity(text, ctx);
        return json(res, 200, {
          ok: true,
          kind,
          reason,
          clarity: analysis.clarity,
          clarifyingQuestion: analysis.clarifyingQuestion,
          missingInfo: analysis.missingInfo,
        });
      } catch (err) {
        // 분석 실패 = 기존 동작 (clear 폴백)
        return json(res, 200, { ok: true, kind, reason, clarity: 'clear', clarifyingQuestion: '', missingInfo: [] });
      }
    } catch (err) {
      return json(res, 500, { ok: false, error: err?.message ?? String(err) });
    }
  }

  // Canvas AI Wizard — generate a structured change plan from a PM goal
  // Reads design-system JSON (patterns, api-ui-contracts, pm-sa-request-schema)
  // and asks Claude for a checklist of plan items grounded in real DS patterns.
  if (pathname === '/api/plan' && req.method === 'POST') {
    try {
      const payload = await parseBody(req);
      const { goal, client, routeOrPage, jiraUrl, prdUrl } = payload || {};

      if (!goal || !client || !routeOrPage) {
        return json(res, 400, {
          ok: false,
          error: 'goal, client, routeOrPage are required',
        });
      }

      // Sub-phase B.2 — emitPlan lib 으로 추출. 에러 메시지로 status 분기.
      try {
        const { emitPlan } = await import('./lib/molly-plan-emitter.js');
        const plan = await emitPlan(
          { goal, client, routeOrPage, jiraUrl, prdUrl },
          {
            designSystemRoot: DESIGN_SYSTEM_ROOT,
            requestSchemaPath: REQUEST_SCHEMA_PATH,
          },
        );
        return json(res, 200, { ok: true, plan });
      } catch (err) {
        const msg = err?.message ?? String(err);
        if (/not configured/.test(msg)) {
          return json(res, 503, { ok: false, error: msg });
        }
        if (/required/.test(msg)) {
          return json(res, 400, { ok: false, error: msg });
        }
        if (/LLM error|LLM response|not JSON|invalid JSON|empty LLM/.test(msg)) {
          return json(res, 502, { ok: false, error: msg });
        }
        console.error('[Plan] emitPlan failed:', err);
        return json(res, 500, { ok: false, error: msg });
      }
    } catch (error) {
      console.error('[Plan] Unexpected error:', error);
      return json(res, 500, { ok: false, error: error.message });
    }
  }

  // (Old inline /api/plan body extracted to orchestrator/lib/molly-plan-emitter.js
  // in sub-phase B.2 — see commit history for original prompt + parsing.)

  // Canvas Tweak — generate alternative variant prompts from an approved plan.
  // Returns 2 variations: a layout/placement alternative and a more novel approach.
  if (pathname === '/api/generate-variations' && req.method === 'POST') {
    try {
      const payload = await parseBody(req);
      const { originalPrompt, plan, visualConstraints } = payload || {};
      if (!originalPrompt || !plan) {
        return json(res, 400, {
          ok: false,
          error: 'originalPrompt and plan are required',
        });
      }

      const apiKey =
        process.env.ANTHROPIC_API_KEY ||
        (SANDBOX_PROVIDER === 'anthropic' ? SANDBOX_API_KEY : null);
      if (!apiKey) {
        return json(res, 503, {
          ok: false,
          error: 'ANTHROPIC_API_KEY not configured.',
        });
      }

      const systemPrompt = `You generate UI design variations for Moloco PMs.

Given an approved change plan (intent, target, plan_items), output exactly 2 variant prompts that a code-generation agent will execute in parallel with the original (v1).

Both variants must achieve the same goal but explore DIFFERENT design choices:
- **v2 — layout/placement alternative**: same components, reordered or repositioned. By-the-book DS pattern.
- **v3 — novel approach**: a more creative interaction pattern, different information architecture, or alternative UX metaphor. Still grounded in the DS — no hallucinated components.

Each variant should include a short Korean title, a 1-sentence Korean approach description, and a "promptDelta" — additional instructions (in English) that steer Codex toward that alternative when appended to the original prompt.

Output MUST be valid JSON only (no markdown, no prose). Schema:
{
  "variations": [
    {
      "id": "v2",
      "title": "<Korean, < 20 chars>",
      "approach": "<Korean 1-sentence approach>",
      "promptDelta": "<English additional instructions for Codex>"
    },
    {
      "id": "v3",
      "title": "<Korean>",
      "approach": "<Korean>",
      "promptDelta": "<English>"
    }
  ]
}`;

      const userPrompt = `Original request: ${originalPrompt}

Approved plan:
${JSON.stringify(plan, null, 2)}

Visual constraints to carry forward:
${(visualConstraints || []).map((c) => `- ${c}`).join('\n')}

Generate 2 variations (v2, v3).`;

      const model = process.env.PLAN_MODEL || 'claude-sonnet-4-20250514';
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[Variations] Anthropic ${resp.status}:`, errText.slice(0, 400));
        return json(res, 502, { ok: false, error: `LLM error: ${resp.status}` });
      }

      const result = await resp.json();
      const text = (result.content?.[0]?.text || '').trim();
      const cleaned = text
        .replace(/^```json?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        return json(res, 502, { ok: false, error: 'LLM response not JSON' });
      }

      let parsed;
      try {
        parsed = JSON.parse(match[0]);
      } catch (err) {
        console.error('[Variations] JSON parse failed:', err.message);
        return json(res, 502, { ok: false, error: 'LLM returned invalid JSON' });
      }

      const variations = Array.isArray(parsed?.variations) ? parsed.variations : [];
      console.log(`[Variations] Generated ${variations.length} variant prompts`);
      return json(res, 200, { ok: true, variations });
    } catch (error) {
      console.error('[Variations] Unexpected error:', error);
      return json(res, 500, { ok: false, error: error.message });
    }
  }

  if (pathname === '/api/analytics/requests') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 500);
    const records = readAnalyticsHistory(limit * 4);
    const snapshots = buildLatestRequestSnapshots(records)
      .slice(0, limit)
      .map((snapshot) => ({
        id: snapshot.id,
        status: snapshot.status,
        phase: snapshot.phase,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
        durationMs: snapshot.durationMs,
        approvalState: snapshot.approvalState,
        iterationCount: snapshot.iterationCount,
        pagePath: snapshot.request?.pagePath || null,
        client: snapshot.request?.client || null,
        language: snapshot.request?.language || null,
        requestedChange: snapshot.request?.userPrompt || snapshot.request?.requestContract?.requested_change || null,
        changedFiles: snapshot.changedFiles || [],
        screenshotUrl: snapshot.screenshotUrl || null,
        previewUrl: snapshot.previewUrl || null,
      }));
    return json(res, 200, {
      ok: true,
      records: snapshots,
    });
  }

  if (pathname === '/api/analytics/summary') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '1000', 10) || 1000, 2000);
    const records = readAnalyticsHistory(limit);
    return json(res, 200, {
      ok: true,
      summary: buildAnalyticsSummary(records),
    });
  }

  const analyticsDetailMatch = pathname.match(/^\/api\/analytics\/request\/([\w-]+)$/);
  if (analyticsDetailMatch) {
    const reqId = analyticsDetailMatch[1];
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '5000', 10) || 5000, 10000);
    const records = readAnalyticsHistory(limit);
    const detail = buildAnalyticsDetail(records, reqId);
    if (!detail) {
      return json(res, 404, { ok: false, error: 'Request analytics not found' });
    }
    // Merge persisted state data (diff, livePreviewUrl, changedFiles, etc.) into analytics response
    const liveState = requests.get(reqId);
    if (liveState) {
      if (liveState.diff) detail.request.diff = liveState.diff;
      if (liveState.changedFiles) detail.request.changedFiles = liveState.changedFiles;
      if (liveState.livePreviewUrl) detail.request.livePreviewUrl = liveState.livePreviewUrl;
      if (liveState.livePreviewExpired) detail.request.livePreviewExpired = true;
      if (liveState.sandboxExpired) detail.request.sandboxExpired = true;
      if (liveState.screenshotPath) detail.request.screenshotUrl = `/api/screenshot/${reqId}`;
      if (liveState.log) detail.request.log = liveState.log;
      if (liveState.request?.aiAnalysis) detail.request.request = { ...detail.request.request, aiAnalysis: liveState.request.aiAnalysis };
      if (liveState.previewUrl) detail.request.previewUrl = liveState.previewUrl;
      if (liveState.prUrl) detail.request.prUrl = liveState.prUrl;
    }
    return json(res, 200, {
      ok: true,
      detail,
    });
  }

  // Submit change request
  // ──────────── Playground API (M1a) ────────────
  // Plan: docs/superpowers/plans/2026-04-22-playground-architecture-v3.md
  // CRUD + lifecycle only — does NOT touch /api/change-request pipeline.

  if (pathname === '/api/playground' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { projectId, title, prdUrl, jiraUrl, createdBy } = body || {};
      if (!projectId || !title) {
        return json(res, 400, { ok: false, error: 'projectId and title required' });
      }
      const apiKey =
        process.env.ANTHROPIC_API_KEY ||
        (SANDBOX_PROVIDER === 'anthropic' ? SANDBOX_API_KEY : null);
      if (!apiKey) {
        return json(res, 503, { ok: false, error: 'ANTHROPIC_API_KEY not configured' });
      }
      const pg = await createPlayground({
        projectId, title, prdUrl, jiraUrl, createdBy,
        apiKey, provider: SANDBOX_PROVIDER,
      });
      return json(res, 201, { ok: true, playground: serializePlayground(pg) });
    } catch (err) {
      console.error('[playground] create error:', err);
      return json(res, 500, { ok: false, error: err.message });
    }
  }

  if (pathname === '/api/playground' && req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const projectId = url.searchParams.get('projectId') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const items = listPlaygrounds({ projectId, status }).map(serializePlayground);
    return json(res, 200, { ok: true, playgrounds: items });
  }

  const pgMatch = pathname.match(
    /^\/api\/playground\/([a-zA-Z0-9_-]+)(?:\/(resume|hibernate|archive|checkout|restore-head|restore-to-sha|revert|promote))?$/,
  );
  if (pgMatch) {
    const [, pgId, action] = pgMatch;
    if (!action && req.method === 'GET') {
      const pg = getPlayground(pgId);
      if (!pg) return json(res, 404, { ok: false, error: 'playground not found' });
      return json(res, 200, { ok: true, playground: serializePlayground(pg) });
    }
    if (action && req.method === 'POST') {
      try {
        let updated;
        let extra = {};
        if (action === 'resume') updated = await resumePlayground(pgId);
        else if (action === 'hibernate') updated = await hibernatePlayground(pgId);
        else if (action === 'archive') updated = await archivePlayground(pgId);
        else if (action === 'checkout') {
          const body = await parseBody(req);
          updated = await checkoutCommit(pgId, body?.sha);
        }
        else if (action === 'restore-head') updated = await restorePlaygroundHead(pgId);
        else if (action === 'restore-to-sha') {
          const body = await parseBody(req);
          updated = await restoreToSha(pgId, body?.sha);
        }
        else if (action === 'revert') {
          const body = await parseBody(req);
          updated = await revertCommit(pgId, body?.sha);
        }
        else if (action === 'promote') {
          const body = await parseBody(req);
          const result = await promotePlayground(pgId, {
            dryRun: Boolean(body?.dryRun),
          });
          updated = getPlayground(pgId);
          extra = {
            patches: result.patches,
            patchesDir: result.patchesDir,
            branch: result.branch,
            applied: result.applied,
            skipped: result.skipped,
            prUrl: result.prUrl,
            dryRun: result.dryRun,
          };
        }
        return json(res, 200, { ok: true, playground: serializePlayground(updated), ...extra });
      } catch (err) {
        console.error(`[playground] ${action} error:`, err);
        return json(res, 500, { ok: false, error: err.message });
      }
    }
  }

  // ── Branch / commit log (playground history viz) ─────────────────
  //
  // Returns the synthetic-git commit log for a playground from
  // `baselineCommitSha..HEAD`. The UI uses this to draw a vertical
  // timeline of "what has happened in this playground", including
  // restore-to commits (which appear as ordinary commits on the
  // branch — see playground.js#restoreToSha tree-swap). Commits are
  // newest-first for display convenience.
  if (pathname.match(/^\/api\/playground\/[a-zA-Z0-9_-]+\/log$/) && req.method === 'GET') {
    const m = pathname.match(/^\/api\/playground\/([a-zA-Z0-9_-]+)\/log$/);
    if (m) {
      const [, pgId] = m;
      const pg = getPlayground(pgId);
      if (!pg) return json(res, 404, { ok: false, error: 'playground not found' });
      if (!pg.sandboxContainerName) {
        return json(res, 200, { ok: true, commits: [] });
      }
      try {
        const range = pg.baselineCommitSha
          ? `${pg.baselineCommitSha}..HEAD`
          : 'HEAD';
        const fmt = '%H%x09%P%x09%at%x09%s';
        const cmd = `docker exec ${pg.sandboxContainerName} sh -c "cd /workspace/msm-portal && git log --format='${fmt}' ${range}"`;
        const { stdout } = await execAsync(cmd, {
          timeout: 10_000,
          maxBuffer: 4 * 1024 * 1024,
        });
        const commits = stdout
          .split('\n')
          .filter((line) => line.length)
          .map((line) => {
            const [sha, parents, atSec, ...rest] = line.split('\t');
            return {
              sha,
              parents: parents ? parents.split(' ').filter(Boolean) : [],
              timestamp: Number(atSec) * 1000,
              message: rest.join('\t'),
            };
          });
        return json(res, 200, {
          ok: true,
          commits,
          headSha: pg.headCommitSha ?? null,
          baselineSha: pg.baselineCommitSha ?? null,
        });
      } catch (err) {
        console.warn(`[playground-log] ${pgId} failed:`, err.message);
        return json(res, 500, { ok: false, error: err.message });
      }
    }
  }

  // ── Chat persistence ──────────────────────────────────────────────
  //
  // Browser localStorage is per-origin/per-browser, so chat written from
  // one browser disappears the moment the user opens the playground from
  // a different browser or in incognito. Server-side persistence makes
  // the thread survive that move. Storage shape is intentionally dumb —
  // the client owns the schema (`ChatMessage[]`), the server just round-
  // trips a JSON array against `state/chat/<playgroundId>.json`. That
  // way schema changes (new ChatMessage fields) don't require server
  // updates.
  //
  //   GET  /api/playground/:id/chat   → { messages: ChatMessage[] }
  //   PUT  /api/playground/:id/chat   body { messages: ChatMessage[] }
  //
  // Concurrent edits from two tabs would race (last writer wins), but
  // the playground is a single-user tool by design — good enough for v0.
  if (pathname.match(/^\/api\/playground\/[a-zA-Z0-9_-]+\/chat$/)) {
    const m = pathname.match(/^\/api\/playground\/([a-zA-Z0-9_-]+)\/chat$/);
    if (m) {
      const [, pgId] = m;
      const pg = getPlayground(pgId);
      if (!pg) return json(res, 404, { ok: false, error: 'playground not found' });
      const chatDir = path.join(STATE_DIR, 'chat');
      const chatFile = path.join(chatDir, `${pgId}.json`);
      if (req.method === 'GET') {
        try {
          if (!fs.existsSync(chatFile)) {
            return json(res, 200, { ok: true, messages: [] });
          }
          const raw = fs.readFileSync(chatFile, 'utf-8');
          const parsed = JSON.parse(raw);
          const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
          return json(res, 200, { ok: true, messages });
        } catch (err) {
          console.error(`[chat] read failed for ${pgId}:`, err.message);
          return json(res, 500, { ok: false, error: err.message });
        }
      }
      if (req.method === 'PUT') {
        try {
          const body = await parseBody(req);
          if (!Array.isArray(body?.messages)) {
            return json(res, 400, { ok: false, error: 'messages array required' });
          }
          if (!fs.existsSync(chatDir)) {
            fs.mkdirSync(chatDir, { recursive: true });
          }
          // Atomic write — write to tmp then rename so a crash mid-write
          // doesn't leave a half-flushed file the next read trips on.
          const tmp = `${chatFile}.tmp`;
          fs.writeFileSync(tmp, JSON.stringify({ messages: body.messages }), 'utf-8');
          fs.renameSync(tmp, chatFile);
          return json(res, 200, { ok: true, count: body.messages.length });
        } catch (err) {
          console.error(`[chat] write failed for ${pgId}:`, err.message);
          return json(res, 500, { ok: false, error: err.message });
        }
      }
      return json(res, 405, { ok: false, error: 'method not allowed' });
    }
  }

  // ── Job routes (PRD → delivery thin-slice, J1) ──────────────────
  if (pathname.startsWith('/api/playground/') && pathname.endsWith('/job') && req.method === 'POST') {
    const m = pathname.match(/^\/api\/playground\/([a-zA-Z0-9_-]+)\/job$/);
    if (m) {
      const [, pgId] = m;
      const pg = getPlayground(pgId);
      if (!pg) return json(res, 404, { ok: false, error: 'playground not found' });
      const existing = activeJobForPlayground(pgId);
      if (existing) return json(res, 409, { ok: false, error: 'job_active', jobId: existing.id });
      try {
        const body = await parseBody(req);
        const job = createJob({
          playgroundId: pgId,
          prdText: body?.prdText ?? '',
          // Snapshot the playground's HEAD at job creation. cancel can
          // offer a one-click rewind to this sha to undo every commit
          // this job landed without touching prior history.
          baselineHeadSha: pg.headCommitSha ?? pg.baselineCommitSha ?? undefined,
        });
        // Kick off decompose in background — client polls /api/job/:id
        // and flips the UI when status transitions to `planning`.
        decomposeJobInBackground(job.id);
        return json(res, 200, { ok: true, job });
      } catch (err) {
        return json(res, 400, { ok: false, error: err.message });
      }
    }
  }

  if (pathname === '/api/job' && req.method === 'GET') {
    return json(res, 200, { ok: true, jobs: listJobs() });
  }

  const jobMatch = pathname.match(
    /^\/api\/job\/([a-zA-Z0-9_-]+)(?:\/(decompose|tasks|approve-plan|retry-task|accept-task|skip-task|unblock-task|cancel|resume|mark-qa-pass|rerun-qa))?$/,
  );
  if (jobMatch) {
    const [, jobId, action] = jobMatch;
    if (!action && req.method === 'GET') {
      const job = getJob(jobId);
      if (!job) return json(res, 404, { ok: false, error: 'job not found' });
      return json(res, 200, { ok: true, job });
    }
    if (action && req.method === 'POST') {
      try {
        let updated;
        if (action === 'decompose') {
          // Re-decompose covers three paths:
          //   - LLM-failure recovery: job is `paused` after the
          //     decomposer crashed; flip back to `decomposing` and
          //     re-fire.
          //   - User-driven "다시 계획 세우기": the plan landed (status
          //     `planning`) but the user wants a fresh breakdown
          //     before approving. Same FSM flip + re-fire.
          //   - "이 계획에 수정 요청" with `feedback` — same as above
          //     but with explicit natural-language steering passed
          //     through to the LLM.
          const body = await parseBody(req);
          const job = getJob(jobId);
          if (!job) return json(res, 404, { ok: false, error: 'job not found' });
          if (job.status === 'paused' || job.status === 'planning') {
            updated = setJobStatus(jobId, 'decomposing');
          } else if (job.status !== 'decomposing') {
            return json(res, 400, {
              ok: false,
              error: `cannot decompose from status ${job.status}`,
            });
          } else {
            updated = job;
          }
          const feedback =
            typeof body?.feedback === 'string' ? body.feedback : undefined;
          decomposeJobInBackground(jobId, { userFeedback: feedback });
        }
        else if (action === 'tasks') {
          const body = await parseBody(req);
          if (!Array.isArray(body?.tasks)) {
            return json(res, 400, { ok: false, error: 'tasks array required' });
          }
          updated = setJobTasks(jobId, body.tasks);
        }
        else if (action === 'approve-plan') {
          // Single helper used by both this HTTP path and molly's ✅
          // button so the strategist + runner kickoff stays in sync.
          updated = approveAndRunJob(jobId);
        }
        else if (action === 'retry-task') {
          const body = await parseBody(req);
          updated = retryTask(jobId, body?.taskId, {
            reason: body?.reason,
            reasonText: body?.reasonText,
          });
          runJobInBackground(jobId);
        }
        else if (action === 'accept-task') {
          const body = await parseBody(req);
          updated = acceptTask(jobId, body?.taskId, {
            reason: body?.reason,
            reasonText: body?.reasonText,
          });
          runJobInBackground(jobId);
        }
        else if (action === 'skip-task') {
          const body = await parseBody(req);
          updated = skipTask(jobId, body?.taskId, {
            reason: body?.reason,
            reasonText: body?.reasonText,
          });
          runJobInBackground(jobId);
        }
        else if (action === 'unblock-task') {
          const body = await parseBody(req);
          updated = unblockTask(jobId, body?.taskId);
          runJobInBackground(jobId);
        }
        else if (action === 'mark-qa-pass') updated = markQaPass(jobId);
        else if (action === 'rerun-qa') {
          // Clear the prior result so the runner doesn't dedupe-skip,
          // then fire it. UI shows "🧪 자동 QA 실행 중…" while
          // qaAutoResult is null and the job is still in `qa`.
          const job = getJob(jobId);
          if (!job) return json(res, 404, { ok: false, error: 'job not found' });
          if (job.status !== 'qa') {
            return json(res, 400, {
              ok: false,
              error: `cannot rerun QA from status ${job.status}`,
            });
          }
          updated = setQaAutoResult(jobId, {
            strategy: job.qaStrategy ?? 'human_only',
            passed: false,
            notes: '재실행 중…',
            ranAt: Date.now(),
          });
          // Clear the placeholder marker after stamping so the runner's
          // own write replaces it cleanly. Easier: just tell the runner
          // to overwrite — which it does, since setQaAutoResult is a
          // straight write, not an append. So we skip the clear and let
          // the runner stamp the real result over our placeholder.
          runQaStrategyInBackground(jobId);
        }
        else if (action === 'cancel') {
          const body = await parseBody(req);
          const job = getJob(jobId);
          updated = cancelJob(jobId, {
            reason: body?.reason,
            reasonText: body?.reasonText,
          });
          let rewound = false;
          // Optional rewind: if the user asked to also undo the
          // playground changes this job landed, restore the playground
          // HEAD to the sha snapshotted at job creation. We do this
          // *after* cancelJob so the FSM is already in `cancelled` (no
          // race with the runner picking up another task) and only
          // when there's actually something to rewind.
          if (
            body?.rewind === true &&
            job &&
            job.baselineHeadSha &&
            job.playgroundId
          ) {
            const pg = getPlayground(job.playgroundId);
            if (pg && pg.headCommitSha && pg.headCommitSha !== job.baselineHeadSha) {
              try {
                await restoreToSha(job.playgroundId, job.baselineHeadSha);
                rewound = true;
              } catch (err) {
                console.warn(
                  `[job-cancel] rewind failed for ${jobId}:`,
                  err.message,
                );
                // Cancel itself succeeded — surface the rewind failure
                // in the response so the UI can offer a manual restore.
                return json(res, 200, {
                  ok: true,
                  job: updated,
                  rewindError: err.message,
                });
              }
            }
          }
          // Mirror cancellation into the playground's chat panel so a
          // job started via Slack (or that the user is watching across
          // both surfaces) shows a clear "cancelled" marker in the same
          // place where the job card lives.
          if (job?.playgroundId) {
            try {
              appendChatMessages(job.playgroundId, [
                {
                  id: generateMessageId(),
                  role: 'assistant',
                  content: rewound
                    ? '❌ 이 작업이 취소되었습니다 (변경 내역 되돌리기 적용).'
                    : '❌ 이 작업이 취소되었습니다.',
                  timestamp: Date.now(),
                },
              ]);
            } catch (err) {
              console.warn(
                `[job-cancel] chat mirror failed for ${jobId}:`,
                err.message,
              );
            }
          }
        }
        else if (action === 'resume') {
          const body = await parseBody(req);
          updated = resumeJob(jobId, body?.target ?? 'delegating');
          runJobInBackground(jobId);
        }
        return json(res, 200, { ok: true, job: updated });
      } catch (err) {
        console.error(`[job] ${action} error:`, err);
        return json(res, 400, { ok: false, error: err.message });
      }
    }
  }

  if (pathname === '/api/change-request' && req.method === 'POST') {
    const payload = maybePersistSelectionScreenshot(await parseBody(req));
    if (!payload.userPrompt) {
      return json(res, 400, { error: 'userPrompt is required' });
    }
    // v2 §2 Q1 — if a job is active on this playground, block ad-hoc
    // change-requests so the user's prompt can't interleave with the
    // job's serial task stream (which shares the same git working tree).
    const maybeJob = payload.playgroundId ? activeJobForPlayground(payload.playgroundId) : null;
    if (maybeJob) {
      return json(res, 409, {
        error: 'job_active',
        detail: `Job ${maybeJob.id} is currently ${maybeJob.status} on this playground.`,
      });
    }
    const rawPath = String(payload.pagePath ?? '').trim();
    const looksLikeUrl = /^\/[A-Za-z0-9/_\-.?=&#%+:]*$/.test(rawPath);
    if (!looksLikeUrl) {
      if (rawPath) {
        console.warn(`[change-request] rejecting non-URL pagePath=${JSON.stringify(rawPath)} — falling back to "/"`);
      }
      payload.pagePath = '/';
    }

    // M1b #3: if playground-attached, serialize through the per-playground
    // queue so concurrent requests don't corrupt the shared git working tree.
    const pgId = payload.playgroundId || null;
    if (pgId) {
      const pg = getPlayground(pgId);
      if (!pg) return json(res, 404, { ok: false, error: `playground not found: ${pgId}` });
      if (pg.status === 'archived') {
        return json(res, 409, { ok: false, error: 'playground archived' });
      }
      if (pg.checkedOutSha) {
        return json(res, 409, {
          ok: false,
          error: 'playground is in time-travel state; restore head before new requests',
        });
      }
      const state = createRequest(payload);
      // Enqueue; run in background (do not await) so HTTP response is immediate.
      enqueueJob(pgId, state.id, async () => {
        await runPipeline(state.id);
      }).catch((err) => {
        if (err instanceof QueueFullError) {
          updateRequest(state.id, {
            status: 'error',
            phase: 'queue_full',
            error: err.message,
          });
        } else {
          console.error('[change-request] enqueue error:', err);
        }
      });
      return json(res, 201, {
        id: state.id,
        status: state.status,
        queueDepth: queueDepth(pgId),
      });
    }

    const state = createRequest(payload);
    runPipeline(state.id);
    return json(res, 201, { id: state.id, status: state.status });
  }

  // Get status
  const statusMatch = pathname.match(/^\/api\/status\/(\w+)$/);
  if (statusMatch) {
    const state = requests.get(statusMatch[1]);
    if (!state) return json(res, 404, { error: 'Not found' });
    return json(res, 200, {
      id: state.id,
      status: state.status,
      phase: state.phase,
      latestLog: state.latestLog,
      updatedAt: state.updatedAt,
      diff: state.diff,
      screenshotUrl: state.screenshotPath ? `/api/screenshot/${state.id}` : null,
      previewUrl: state.previewUrl,
      prUrl: state.prUrl,
      changedFiles: state.changedFiles,
      error: state.error,
      log: state.log,
    });
  }

  // SSE events stream
  const eventsMatch = pathname.match(/^\/api\/events\/(\w+)$/);
  if (eventsMatch) {
    const id = eventsMatch[1];
    const state = requests.get(id);
    if (!state) return json(res, 404, { error: 'Not found' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send current state immediately — include every field the in-flight
    // broadcast path (updateRequest) emits so a subscriber that attaches
    // AFTER the request finished still sees the preview URLs and artifacts.
    const event = JSON.stringify({
      id,
      status: state.status,
      phase: state.phase,
      latestLog: state.latestLog,
      updatedAt: state.updatedAt,
      diff: state.diff,
      changedFiles: state.changedFiles,
      screenshotPath: state.screenshotPath,
      previewUrl: state.previewUrl,
      livePreviewUrl: state.livePreviewUrl || null,
      prUrl: state.prUrl,
      error: state.error,
    });
    res.write(`data: ${event}\n\n`);

    // Register for future updates
    if (!sseClients.has(id)) sseClients.set(id, new Set());
    sseClients.get(id).add(res);

    req.on('close', () => {
      const clients = sseClients.get(id);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) sseClients.delete(id);
      }
    });
    return;
  }

  // Diff viewer
  const diffViewMatch = pathname.match(/^\/api\/diff-view\/([\w-]+)$/);
  if (diffViewMatch) {
    const state = requests.get(diffViewMatch[1]);
    if (!state) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h3>Request not found</h3>');
      return;
    }

    const diff = state.diff || 'No changes';
    const screenshotUrl = state.screenshotPath ? `/api/screenshot/${state.id}` : null;
    const changedFiles = state.changedFiles || [];
    const requestId = state.id;
    const userPrompt = state.payload?.userPrompt || '';
    const status = state.status;
    const livePreviewUrl = state.livePreviewUrl || null;

    // Render a self-contained HTML diff viewer
    const html = buildDiffViewerHtml({ requestId, diff, screenshotUrl, changedFiles, userPrompt, status, livePreviewUrl });
    res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
    res.end(html);
    return;
  }

  // Approve
  const approveMatch = pathname.match(/^\/api\/approve\/(\w+)$/);
  if (approveMatch && req.method === 'POST') {
    const state = await handleApprove(approveMatch[1]);
    if (!state) return json(res, 404, { error: 'Not found or not in preview state' });
    return json(res, 200, { id: state.id, status: state.status, prUrl: state.prUrl, error: state.error });
  }

  // Reject with feedback
  const rejectMatch = pathname.match(/^\/api\/reject\/(\w+)$/);
  if (rejectMatch && req.method === 'POST') {
    const body = await parseBody(req);
    const state = await handleReject(rejectMatch[1], body.feedback || '');
    if (!state) return json(res, 404, { error: 'Not found or not in preview state' });
    return json(res, 200, { id: state.id, status: state.status });
  }

  // Serve screenshot
  const screenshotMatch = pathname.match(/^\/api\/screenshot\/(\w+)$/);
  if (screenshotMatch) {
    const imgPath = path.join(SCREENSHOTS_DIR, `${screenshotMatch[1]}.png`);
    if (!fs.existsSync(imgPath)) return json(res, 404, { error: 'Screenshot not found' });
    res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(imgPath).pipe(res);
    return;
  }

  json(res, 404, { error: 'Not found' });
});

ensureAnalyticsStorage();
restoreAllState();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Orchestrator] Listening on http://localhost:${PORT}`);
  console.log(`[Orchestrator] Workspace root: ${WORKSPACE_ROOT}`);
  console.log(`[Orchestrator] Repo root: ${DEFAULT_PRODUCT_REPO_ROOT}`);
  console.log(`[Orchestrator] Design system root: ${DESIGN_SYSTEM_ROOT}`);
  console.log(`[Orchestrator] Sandbox: ${SANDBOX_IMAGE}`);
  console.log(`[Orchestrator] Agent: ${SANDBOX_PROVIDER}/${SANDBOX_MODEL}`);
  // M1b #5: reconcile playground state with docker after a restart — some
  // containers may have been stopped while the orchestrator was down.
  reattachOnStartup().catch((err) => console.warn('[Orchestrator] reattach failed:', err.message));
  // Slack bot — auto-disabled when SLACK_* env vars are blank.
  // Hooks injected here so molly stays decoupled from server internals
  // (no circular imports, no reach-around).
  startMolly({
    defaultPlaygroundId: process.env.MOLLY_PLAYGROUND_ID?.trim() || null,
    createJob,
    getJob,
    listJobs,
    setJobSlackContext,
    // Use the combined helper so molly's ✅ button fires the QA
    // strategist + runner the same way the HTTP /approve-plan handler
    // does. Without this, Slack-originated jobs skipped the strategist
    // entirely and fell back to a no-op `human_only` QA.
    approveJobPlan: approveAndRunJob,
    cancelJob,
    decomposeJobInBackground,
    runJobInBackground,
    getPlayground,
    // QA / lifecycle hooks for the Phase 2.2 Slack buttons.
    markQaPass,
    rerunQa: (jobId) => {
      const j = getJob(jobId);
      if (!j) throw new Error(`job not found: ${jobId}`);
      if (j.status !== 'qa') {
        throw new Error(`cannot rerun QA from status ${j.status}`);
      }
      // Mirror the HTTP /rerun-qa path: stamp a placeholder so the
      // poll dedupe doesn't skip the re-run, then fire the runner.
      setQaAutoResult(jobId, {
        strategy: j.qaStrategy ?? 'human_only',
        passed: false,
        notes: '재실행 중…',
        ranAt: Date.now(),
      });
      runQaStrategyInBackground(jobId);
    },
    retryTask: (jobId, taskId, actionMeta) => {
      retryTask(jobId, taskId, actionMeta);
      runJobInBackground(jobId);
    },
    acceptTask: (jobId, taskId, actionMeta) => {
      acceptTask(jobId, taskId, actionMeta);
      runJobInBackground(jobId);
    },
    skipTaskJob: (jobId, taskId, actionMeta) => {
      skipTask(jobId, taskId, actionMeta);
      runJobInBackground(jobId);
    },
    // Promote — wraps lib/playground.js#promotePlayground so molly
    // doesn't need to import playground internals. Resolves jobId →
    // playgroundId and creates a PR. Returns whatever the helper
    // returns (typically {prUrl, branch}).
    promoteJob: async (jobId) => {
      const j = getJob(jobId);
      if (!j) throw new Error(`job not found: ${jobId}`);
      if (j.status !== 'complete') {
        throw new Error(`promote requires status=complete (current: ${j.status})`);
      }
      return promotePlayground(j.playgroundId);
    },
    // Redecompose: matches the HTTP /decompose handler's behaviour —
    // flip FSM (planning|paused) → decomposing, then kick the
    // background decomposer with optional natural-language feedback.
    redecomposeJob: (jobId, feedback) => {
      const j = getJob(jobId);
      if (!j) throw new Error(`job not found: ${jobId}`);
      if (j.status === 'planning' || j.status === 'paused') {
        setJobStatus(jobId, 'decomposing');
      } else if (j.status !== 'decomposing') {
        throw new Error(`cannot redecompose from status ${j.status}`);
      }
      decomposeJobInBackground(jobId, {
        userFeedback: typeof feedback === 'string' ? feedback : undefined,
      });
    },
    // Create a fresh playground for a Slack thread that has no existing
    // mapping. molly's per-thread policy: 같은 thread → 같은 playground,
    // 다른 thread → 다른 playground. apiKey 는 server-level env 에서 가져와
    // molly 는 ANTHROPIC_API_KEY 에 직접 의존하지 않게.
    createPlayground: async ({ title, createdBy, prdUrl, jiraUrl }) => {
      const apiKey = process.env.ANTHROPIC_API_KEY || SANDBOX_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
      return createPlayground({
        projectId: process.env.MSM_PROJECT_ID || 'default',
        title: title || 'Slack thread',
        createdBy: createdBy || 'molly',
        prdUrl,
        jiraUrl,
        apiKey,
        provider: SANDBOX_PROVIDER || 'anthropic',
        client: process.env.MSM_DEFAULT_CLIENT || 'tving',
      });
    },
  });
});
