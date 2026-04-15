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

  try {
    updateRequest(id, { status: 'processing', phase: 'creating_sandbox' });
    appendAnalyticsEvent(state, 'pipeline_start', { summary: 'Pipeline started', phase: 'creating_sandbox' });
    appendLog(id, 'Creating sandbox container...');
    const openCodePort = await allocatePort();
    const vitePort = await allocatePort();
    const sandboxApiKey = SANDBOX_PROVIDER === 'opencode' ? (OPENCODE_API_KEY || SANDBOX_API_KEY) : SANDBOX_API_KEY;
    const sandbox = await createSandbox({
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
    const agentResult = await runAgentPrompt(client, { prompt, provider: SANDBOX_PROVIDER, model: SANDBOX_MODEL });
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

    // Start live preview in sandbox + diff viewer
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
  // No local patch to revert — preview is sandbox-only
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
  if (pathname === '/api/change-request' && req.method === 'POST') {
    const payload = maybePersistSelectionScreenshot(await parseBody(req));
    if (!payload.userPrompt) {
      return json(res, 400, { error: 'userPrompt is required' });
    }
    const state = createRequest(payload);
    // Start pipeline in background
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

    // Send current state immediately
    const event = JSON.stringify({
      id,
      status: state.status,
      phase: state.phase,
      latestLog: state.latestLog,
      updatedAt: state.updatedAt,
      diff: state.diff,
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
});
