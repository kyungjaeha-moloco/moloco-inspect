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
 *   POST /api/approve/:id      — approve changes → apply locally
 *   POST /api/reject/:id       — reject with feedback → iterate
 *   GET  /api/screenshot/:id   — serve screenshot image
 *   GET  /api/health            — health check
 */

process.on('uncaughtException', (err) => { console.error('[FATAL uncaughtException]', err); });
process.on('unhandledRejection', (err) => { console.error('[FATAL unhandledRejection]', err); });

import http from 'node:http';
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
const SANDBOX_PROVIDER = SANDBOX_API_KEY.startsWith('sk-proj-') ? 'openai' : 'anthropic';
const SANDBOX_MODEL = process.env.SANDBOX_MODEL || (SANDBOX_PROVIDER === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514');
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
    goal: provided.goal || payload?.goal || payload?.userPrompt || 'UI improvement request',
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
    const sandbox = await createSandbox({
      requestId: id, imageName: SANDBOX_IMAGE,
      openCodePort, vitePort, apiKey: SANDBOX_API_KEY, provider: SANDBOX_PROVIDER,
    });
    state.sandbox = sandbox;
    appendLog(id, `Sandbox: ${sandbox.containerName} (oc:${openCodePort} vite:${vitePort})`);

    updateRequest(id, { phase: 'syncing_source' });
    if (fs.existsSync(DEFAULT_PRODUCT_REPO_ROOT)) {
      await copyFilesIn({ containerId: sandbox.containerId, sourceDir: DEFAULT_PRODUCT_REPO_ROOT });
      appendLog(id, 'Source synced into sandbox');
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
      updateRequest(id, { previewUrl: `http://127.0.0.1:${sandbox.vitePort}/` });
    } catch (error) { appendLog(id, 'Screenshot skipped'); }

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
    updateRequest(id, { phase: 'applying_local_patch' });
    appendLog(id, 'PM approved, applying patch to local workspace...');

    const diff = state.diff || '';
    if (diff && fs.existsSync(DEFAULT_PRODUCT_REPO_ROOT)) {
      const patchPath = path.join(SCREENSHOTS_DIR, `${id}.patch`);
      fs.writeFileSync(patchPath, diff, 'utf-8');
      try {
        await execFileAsync('git', ['apply', '--whitespace=nowarn', patchPath], { cwd: DEFAULT_PRODUCT_REPO_ROOT, timeout: 120000 });
        appendLog(id, 'Patch applied with direct apply');
      } catch {
        try {
          await execFileAsync('git', ['apply', '--3way', patchPath], { cwd: DEFAULT_PRODUCT_REPO_ROOT, timeout: 120000 });
          appendLog(id, 'Patch applied with 3-way merge');
        } catch (e2) { appendLog(id, 'Patch failed: ' + e2.message); }
      }
      fs.rmSync(patchPath, { force: true });
    }

    await cleanup(id);
    appendAnalyticsEvent(state, 'request_approved', {
      summary: 'PM approved and local apply completed',
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
  if (state.sandbox) {
    await removeSandbox({ containerId: state.sandbox.containerId });
    releasePort(state.sandbox.openCodePort);
    releasePort(state.sandbox.vitePort);
    state.sandbox = null;
  }
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

  // Health check
  if (pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      requests: requests.size,
      workspaceRoot: WORKSPACE_ROOT,
      repoRoot: DEFAULT_PRODUCT_REPO_ROOT,
      designSystemRoot: DESIGN_SYSTEM_ROOT,
      sandboxImage: SANDBOX_IMAGE,
      model: SANDBOX_PROVIDER + '/' + SANDBOX_MODEL,
    });
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
