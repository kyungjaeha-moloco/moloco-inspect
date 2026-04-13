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

  if (!blocks.length) return '문서에서 현재 페이지와 직접 연결할 핵심 요구사항을 아직 찾지 못했습니다.';

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
    '수정', '변경', '추가', '삭제', '탭', '버튼', '문구', '레이블', '정렬', '필터', '리스트',
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
    questions.push('이 PRD 중 지금 보고 있는 화면에 먼저 반영할 범위를 한 번 더 확인하는 것이 좋습니다.');
  }

  if (!/(success criteria|success|완료 기준|성공 기준)/i.test(text)) {
    questions.push('완료 기준이 문서에 분명하지 않아 preview에서 무엇을 확인해야 할지 추가 확인이 필요할 수 있습니다.');
  }

  if (!/(do not|out of scope|제외|범위 밖|하지 않는다)/i.test(text)) {
    questions.push('이번 작업에서 건드리면 안 되는 범위가 문서에 분명하지 않아 계획 카드에서 제약을 다시 확인하는 것이 좋습니다.');
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
      throw new Error(`PRD 링크를 읽지 못했습니다 (${response.status}). 링크 접근 권한이나 문서 공개 여부를 확인해주세요.`);
    }

    html = await response.text();
    rawText = stripHtmlToText(html);
  }

  if (!rawText) {
    throw new Error('PRD 링크나 핵심 요구사항 텍스트가 필요합니다.');
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
  const criteria = ['preview에서 요청한 변경이 현재 페이지에 보인다.'];
  if (changeIntent === 'copy_update') {
    criteria.push('현재 route에서 변경된 문구가 실제로 보인다.');
  }
  if (payload?.language) {
    criteria.push(`preview와 screenshot이 ${payload.language} 언어를 유지한다.`);
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
    pagePath: payload?.pagePath || requestContract.target.route_or_page,
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
  return state;
}

function appendLog(id, message) {
  const state = requests.get(id);
  if (!state) return;
  state.latestLog = String(message);
  state.log.push(state.latestLog);
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
    screenshotUrl: state.screenshotPath ? `/api/screenshot/${state.id}` : null,
    screenshotPath: screenshotRelative,
    attachmentPath: attachmentRelative,
    changedFiles,
    changedFileCount: changedFiles.length,
    diffLineCount: state.diff ? state.diff.split('\n').length : 0,
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
    appendLog(id, 'Creating sandbox container...');
    const openCodePort = await allocatePort();
    const vitePort = await allocatePort();
    const sandboxApiKey = SANDBOX_PROVIDER === 'opencode' ? (OPENCODE_API_KEY || SANDBOX_API_KEY) : SANDBOX_API_KEY;
    const sandbox = await createSandbox({
      requestId: id, imageName: SANDBOX_IMAGE,
      openCodePort, vitePort, apiKey: sandboxApiKey, provider: SANDBOX_PROVIDER,
    });
    state.sandbox = sandbox;
    appendLog(id, `Sandbox: ${sandbox.containerName} (oc:${openCodePort} vite:${vitePort})`);

    updateRequest(id, { phase: 'syncing_source' });
    if (fs.existsSync(DEFAULT_PRODUCT_REPO_ROOT)) {
      await copyFilesIn({ containerId: sandbox.containerId, sourceDir: DEFAULT_PRODUCT_REPO_ROOT });
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
    appendLog(id, `Running agent (${SANDBOX_PROVIDER}/${SANDBOX_MODEL})...`);
    const prompt = buildSandboxPrompt(state.payload);
    const agentResult = await runAgentPrompt(client, { prompt, provider: SANDBOX_PROVIDER, model: SANDBOX_MODEL });
    if (agentResult.error) {
      throw new Error(`Agent: ${agentResult.error.name}: ${agentResult.error.data?.message || ''}`);
    }
    appendLog(id, `Agent done (cost: $${(agentResult.cost || 0).toFixed(4)})`);

    updateRequest(id, { phase: 'collecting_diff' });
    const diff = await extractDiff({ containerId: sandbox.containerId });
    updateRequest(id, { diff: diff.diffText, changedFiles: diff.changedFiles });
    if (diff.diffStat.trim()) appendLog(id, `Changes: ${diff.diffStat.trim()}`);

    if (!diff.changedFiles.length) {
      state.analytics.approvalState = 'not_required';
      updateRequest(id, { status: 'no_change_needed', phase: 'no_change_needed', diff: null, changedFiles: [], screenshotPath: null, previewUrl: null });
      appendLog(id, 'No code change needed.');
      await cleanup(id);
      return;
    }

    try {
      updateRequest(id, { phase: 'validating' });
      // Check if node_modules exists before running typecheck
      const nmCheck = await execInContainer({ containerId: sandbox.containerId, command: 'test -d /workspace/msm-portal/js/msm-portal-web/node_modules && echo "exists" || echo "missing"', timeout: 5000 });
      if (nmCheck.stdout.trim() === 'missing') {
        appendLog(id, 'Typecheck skipped (node_modules not in sandbox)');
      } else {
        const tc = await execInContainer({ containerId: sandbox.containerId, command: 'cd /workspace/msm-portal && pnpm exec tsc --noEmit -p js/msm-portal-web/tsconfig.json 2>&1', timeout: 60000 });
        appendLog(id, tc.exitCode === 0 ? 'Typecheck passed' : 'Typecheck warning: ' + (tc.stdout + tc.stderr).slice(0, 300));
      }
    } catch (e) { appendLog(id, 'Typecheck skipped: ' + e.message); }

    try {
      if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
      updateRequest(id, { phase: 'capturing_screenshot' });
      const ssPath = path.join(SCREENSHOTS_DIR, `${id}.png`);
      await extractFile({ containerId: sandbox.containerId, containerPath: '/workspace/results/screenshot.png', hostPath: ssPath }).catch(() => null);
      if (fs.existsSync(ssPath)) { updateRequest(id, { screenshotPath: ssPath }); appendLog(id, 'Screenshot captured'); }
    } catch (error) { appendLog(id, 'Screenshot skipped'); }

    // Start live preview in sandbox + diff viewer
    try {
      const pagePath = state.request?.pagePath || state.payload?.pagePath || '/';
      const clientEnv = state.request?.client || state.payload?.client || 'tving';

      appendLog(id, 'Installing dependencies for live preview...');
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

      // Always set both preview URLs — vite may still be starting
      const livePreviewUrl = `http://127.0.0.1:${sandbox.vitePort}${pagePath}`;
      const diffViewUrl = `http://127.0.0.1:${PORT}/api/diff-view/${id}`;
      updateRequest(id, {
        previewUrl: diffViewUrl,
        livePreviewUrl: livePreviewUrl,
      });
      appendLog(id, viteReady ? 'Live preview ready' : 'Live preview starting (may need a moment to load)');
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

    // Create PR from sandbox diff
    try {
      const branchName = `inspect/${state.id.slice(0,8)}`;
      const title = state.payload?.userPrompt ? state.payload.userPrompt.slice(0, 70) : `Inspect change ${state.id.slice(0,8)}`;
      const diff = state.diff || '';

      if (diff && fs.existsSync(DEFAULT_PRODUCT_REPO_ROOT)) {
        // Save diff to temp file for git apply
        const patchPath = path.join(SCREENSHOTS_DIR, `${id}.patch`);
        fs.writeFileSync(patchPath, diff, 'utf-8');

        // Apply diff to a new branch and create PR
        await execAsync(`cd "${DEFAULT_PRODUCT_REPO_ROOT}" && git checkout -b "${branchName}"`, { timeout: 10000 });
        await execAsync(`cd "${DEFAULT_PRODUCT_REPO_ROOT}" && git apply --whitespace=nowarn "${patchPath}"`, { timeout: 10000 });
        await execAsync(`cd "${DEFAULT_PRODUCT_REPO_ROOT}" && git add -A && git commit -m "feat: ${title.replace(/"/g, '\\"')}\n\nGenerated by Moloco Inspect Agent\nRequest: ${state.id}"`, { timeout: 10000 });

        const prResult = await execAsync(`cd "${DEFAULT_PRODUCT_REPO_ROOT}" && gh pr create --title "${title.replace(/"/g, '\\"')}" --body "Generated by Moloco Inspect\nRequest ID: ${state.id}" --base main`, { timeout: 15000 });
        state.prUrl = prResult.stdout.trim();
        updateRequest(id, { prUrl: state.prUrl });
        appendLog(id, `PR created: ${state.prUrl}`);

        // Switch back to main
        await execAsync(`cd "${DEFAULT_PRODUCT_REPO_ROOT}" && git checkout main`, { timeout: 5000 });

        fs.rmSync(patchPath, { force: true });
      }
    } catch (prErr) {
      appendLog(id, 'PR creation failed: ' + prErr.message);
      // Attempt to switch back to main even on failure
      try { await execAsync(`cd "${DEFAULT_PRODUCT_REPO_ROOT}" && git checkout main`, { timeout: 5000 }); } catch {}
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

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>Preview — ${requestId.slice(0,8)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, sans-serif; background: #f4f4f4; color: #161616; }
  .container { max-width: 960px; margin: 0 auto; padding: 24px; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .header h1 { font-size: 20px; font-weight: 600; }
  .badge { padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; }
  .badge-preview { background: #E3F2FD; color: #0f62fe; }
  .badge-approved { background: #E8F5E9; color: #24a148; }
  .prompt { padding: 16px; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 20px; font-size: 14px; line-height: 1.6; }
  .section { margin-bottom: 24px; }
  .section h2 { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #525252; margin-bottom: 12px; }
  .file-list { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
  .file-list li code { padding: 4px 10px; background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 12px; }
  .diff-viewer { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: auto; max-height: 600px; }
  .diff-viewer pre { padding: 16px; font-family: 'JetBrains Mono', 'SF Mono', monospace; font-size: 12px; line-height: 1.6; white-space: pre; tab-size: 2; }
  .diff-add { background: #e6ffec; color: #1a7f37; display: block; }
  .diff-del { background: #ffebe9; color: #cf222e; display: block; }
  .diff-hunk { background: #ddf4ff; color: #0550ae; display: block; font-weight: 600; }
  .diff-file { background: #f6f8fa; color: #24292f; display: block; font-weight: 700; padding: 4px 0; border-top: 1px solid #e0e0e0; margin-top: 8px; }
  .screenshot { max-width: 100%; border-radius: 8px; border: 1px solid #e0e0e0; }
  .actions { display: flex; gap: 12px; margin-top: 24px; padding-top: 24px; border-top: 1px solid #e0e0e0; }
  .btn { padding: 10px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; border: none; cursor: pointer; font-family: inherit; }
  .btn-approve { background: #24a148; color: #fff; }
  .btn-approve:hover { background: #198038; }
  .btn-reject { background: #fff; color: #da1e28; border: 1px solid #da1e28; }
  .btn-reject:hover { background: #fff1f1; }
  .btn-live { background: #0f62fe; color: #fff; text-decoration: none; }
  .btn-live:hover { background: #0043ce; }
  .btn-dashboard { background: #fff; color: #525252; border: 1px solid #e0e0e0; text-decoration: none; }
  .btn-dashboard:hover { background: #f4f4f4; }
  .stats { display: flex; gap: 16px; margin-bottom: 20px; }
  .stat { padding: 12px 16px; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; text-align: center; }
  .stat-value { font-size: 20px; font-weight: 700; }
  .stat-label { font-size: 11px; color: #525252; text-transform: uppercase; margin-top: 2px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Preview <code style="font-size:14px;opacity:0.6">${requestId.slice(0,8)}</code></h1>
    <span class="badge badge-${status === 'preview' ? 'preview' : 'approved'}">${status}</span>
  </div>

  <div class="prompt">${userPrompt.replace(/</g, '&lt;') || 'No prompt'}</div>

  <div class="stats">
    <div class="stat"><div class="stat-value">${changedFiles.length}</div><div class="stat-label">Changed Files</div></div>
    <div class="stat"><div class="stat-value">${diff.split('\\n').filter(l => l.startsWith('+')).length}</div><div class="stat-label">Lines Added</div></div>
    <div class="stat"><div class="stat-value">${diff.split('\\n').filter(l => l.startsWith('-')).length}</div><div class="stat-label">Lines Removed</div></div>
  </div>

  ${changedFiles.length ? `<div class="section"><h2>Changed Files</h2><ul class="file-list">${fileListHtml}</ul></div>` : ''}

  ${screenshotHtml}

  <div class="section">
    <h2>Code Changes</h2>
    <div class="diff-viewer"><pre>${coloredDiff}</pre></div>
  </div>

  <div class="actions">
    ${livePreviewUrl ? `<a class="btn btn-live" href="${livePreviewUrl}" target="_blank">Live Preview 열기 ↗</a>` : ''}
    <button class="btn btn-approve" onclick="handleAction('approve')">Approve & Create PR</button>
    <button class="btn btn-reject" onclick="handleAction('reject')">Reject</button>
    <a class="btn btn-dashboard" href="http://127.0.0.1:${PORT}/requests/${requestId}" target="_blank">Dashboard</a>
  </div>
</div>
<script>
async function handleAction(action) {
  const url = action === 'approve'
    ? '/api/approve/${requestId}'
    : '/api/reject/${requestId}';
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json();
    if (data.ok !== false) {
      document.querySelector('.actions').innerHTML = action === 'approve'
        ? '<div style="color:#24a148;font-weight:600">Approved — PR will be created</div>'
        : '<div style="color:#da1e28;font-weight:600">Rejected — changes discarded</div>';
    } else {
      alert('Error: ' + (data.error || 'Unknown'));
    }
  } catch(e) { alert('Failed: ' + e.message); }
}
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
    const target = `http://127.0.0.1:${state.sandbox.vitePort}${subPath}${url.search}`;
    try {
      const proxyReq = http.request(target, { method: req.method, headers: { ...req.headers, host: `127.0.0.1:${state.sandbox.vitePort}` } }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
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
      const analysisPrompt = `You are an expert UI/UX engineer. Analyze this change request and return ONLY valid JSON in Korean.

Context: ${client}, route: ${pagePath}, component: ${component || testId || 'unknown'}${language ? ', lang: ' + language : ''}
Selected elements: ${selectedElements.map(e => e.component || e.testId || '').filter(Boolean).join(', ') || 'none'}
Request: "${userPrompt}"

Return JSON:
{"understanding":"요청 의도 2-3문장","analysis":"기술적 구현 방법 3-4문장 (파일, 컴포넌트, API 등)","steps":["구체적 단계1 (파일명 포함)","단계2","단계3","단계4","검증 단계"],"risks":"위험 요소 또는 null","verification":"검증 방법"}`;

      try {
        let text = '';
        // Use the same provider as the sandbox agent
        if (SANDBOX_PROVIDER === 'anthropic' && (SANDBOX_API_KEY || process.env.ANTHROPIC_API_KEY)) {
          const apiKey = process.env.ANTHROPIC_API_KEY || SANDBOX_API_KEY;
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({ model: SANDBOX_MODEL, max_tokens: 1500, messages: [{ role: 'user', content: analysisPrompt }] }),
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
        const target = testId || component || '대상 요소';
        const pageLabel = pagePath.replace(/^\/v1\/p\/[^/]+\//, '').replace(/\?.*$/, '') || 'page';
        const elementInfo = selectedElements.length > 0
          ? selectedElements.map(e => e.component || e.testId || e.semantics?.domTag || '').filter(Boolean).join(', ')
          : target;

        const intentMap = {
          layout_adjustment: {
            understanding: `${pageLabel} 페이지의 ${elementInfo} 요소에 대한 레이아웃/배치 변경을 요청하셨습니다. "${userPrompt}"`,
            analysis: `${elementInfo} 컴포넌트의 현재 Flex/Grid 구조를 분석하고, 요청하신 방향으로 레이아웃을 조정합니다. 기존 디자인 시스템 토큰과 스타일을 유지하면서 최소한의 변경으로 구현합니다.`,
            steps: [
              `${client} 앱의 ${pageLabel} 관련 컴포넌트 파일 탐색 (src/apps/${client}/component/)`,
              `${elementInfo}의 현재 레이아웃 구조 분석 (Flex/Grid, spacing, ordering)`,
              `요청사항에 맞게 레이아웃 속성 수정 (CSS/스타일 조정)`,
              `주변 요소와의 정렬 및 간격 확인`,
              `TypeScript 타입체크 실행 및 시각적 검증`,
            ],
            risks: '레이아웃 변경이 반응형 디자인에 영향을 줄 수 있으므로 다양한 화면 크기에서 확인이 필요합니다.',
            verification: `${pageLabel} 페이지에서 ${elementInfo}의 배치가 요청대로 변경되었는지 시각적으로 확인`,
          },
          state_handling: {
            understanding: `${pageLabel} 페이지에서 ${elementInfo}의 동작/상태 처리를 변경하려는 요청입니다. "${userPrompt}"`,
            analysis: `${elementInfo} 컴포넌트의 상태 관리 로직과 이벤트 핸들러를 분석합니다. 필요한 경우 새로운 상태를 추가하거나 기존 로직을 수정하여 요청된 동작을 구현합니다.`,
            steps: [
              `${elementInfo} 컴포넌트의 Container/Component 파일 분석`,
              `현재 상태 관리 로직 파악 (hooks, reducers, context)`,
              `요청된 동작에 필요한 상태/핸들러 구현`,
              `API 연동이 필요한 경우 tRPC 엔드포인트 확인`,
              `기능 동작 테스트 및 TypeScript 타입체크`,
            ],
            risks: '상태 변경이 다른 컴포넌트에 영향을 줄 수 있으며, API 호출이 필요한 경우 백엔드 수정이 동반될 수 있습니다.',
            verification: `${elementInfo}에서 새로운 동작이 정상적으로 작동하는지 시나리오별로 확인`,
          },
          copy_update: {
            understanding: `${pageLabel} 페이지의 ${elementInfo} 텍스트/문구를 변경하려는 요청입니다. "${userPrompt}"`,
            analysis: `i18n 파일(locales)과 컴포넌트의 텍스트 렌더링 부분을 수정합니다. 한국어/영어 번역 파일을 함께 업데이트합니다.`,
            steps: [
              `해당 텍스트가 사용되는 i18n 키 탐색 (src/i18n/locales/)`,
              `한국어(ko) 번역 파일 수정`,
              `영어(en) 번역 파일 동시 수정`,
              `컴포넌트에서 하드코딩된 텍스트가 있다면 i18n 키로 교체`,
              `변경된 텍스트가 UI에 올바르게 표시되는지 확인`,
            ],
            risks: null,
            verification: `${pageLabel} 페이지에서 변경된 텍스트가 올바르게 표시되는지 확인`,
          },
          component_swap: {
            understanding: `${pageLabel} 페이지에서 ${elementInfo}를 다른 컴포넌트로 교체하거나 새 컴포넌트를 추가하려는 요청입니다. "${userPrompt}"`,
            analysis: `기존 컴포넌트의 props와 데이터 흐름을 분석하고, 디자인 시스템의 적절한 컴포넌트로 교체합니다. FormikHarness, Provider 등 필요한 wrapper도 함께 설정합니다.`,
            steps: [
              `현재 ${elementInfo} 컴포넌트의 구조와 props 분석`,
              `교체할 디자인 시스템 컴포넌트 선택 및 import 경로 확인`,
              `새 컴포넌트로 교체하고 props 매핑`,
              `필요한 Provider/Wrapper 설정`,
              `TypeScript 타입체크 및 시각적 검증`,
            ],
            risks: '컴포넌트 교체 시 기존 props 인터페이스가 달라질 수 있어 타입 오류가 발생할 수 있습니다.',
            verification: `새 컴포넌트가 기존과 동일한 기능을 수행하면서 요청된 변경사항이 반영되었는지 확인`,
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
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '5000', 10) || 5000, 10000);
    const records = readAnalyticsHistory(limit);
    const detail = buildAnalyticsDetail(records, analyticsDetailMatch[1]);
    if (!detail) {
      return json(res, 404, { ok: false, error: 'Request analytics not found' });
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
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Orchestrator] Listening on http://localhost:${PORT}`);
  console.log(`[Orchestrator] Workspace root: ${WORKSPACE_ROOT}`);
  console.log(`[Orchestrator] Repo root: ${DEFAULT_PRODUCT_REPO_ROOT}`);
  console.log(`[Orchestrator] Design system root: ${DESIGN_SYSTEM_ROOT}`);
  console.log(`[Orchestrator] Sandbox: ${SANDBOX_IMAGE}`);
  console.log(`[Orchestrator] Agent: ${SANDBOX_PROVIDER}/${SANDBOX_MODEL}`);
});
