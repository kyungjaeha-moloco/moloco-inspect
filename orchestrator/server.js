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

import http from 'node:http';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, exec, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import {
  createPreviewAdapter,
} from '../tooling/preview-kit/src/index.js';
import {
  createProductRunner,
} from '../tooling/product-runner/src/index.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_WORKSPACE_ROOT =
  process.env.SOURCE_WORKSPACE_ROOT || '/Users/kyungjae.ha/Documents/Agent-Design-System';
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const LOCAL_DESIGN_SYSTEM_ROOT = path.join(WORKSPACE_ROOT, 'design-system');
const MSM_REPO_ROOT = path.join(SOURCE_WORKSPACE_ROOT, 'msm-portal');
const DESIGN_SYSTEM_ROOT = process.env.DESIGN_SYSTEM_ROOT ||
  (fs.existsSync(LOCAL_DESIGN_SYSTEM_ROOT) ? LOCAL_DESIGN_SYSTEM_ROOT : path.join(SOURCE_WORKSPACE_ROOT, 'design-system'));
const WORKTREE_BASE = path.join(WORKSPACE_ROOT, '.worktrees');
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const ATTACHMENTS_DIR = path.join(__dirname, 'attachments');
const ANALYTICS_DIR = path.join(__dirname, 'analytics');
const REQUEST_HISTORY_PATH = path.join(ANALYTICS_DIR, 'request-history.ndjson');
const REQUEST_SCHEMA_PATH = path.join(DESIGN_SYSTEM_ROOT, 'src', 'pm-sa-request-schema.json');
const PREVIEW_VERIFICATION_PATH = path.join(DESIGN_SYSTEM_ROOT, 'src', 'preview-verification.json');
const PORT = parseInt(process.env.PORT || '3847', 10);
const CODEX_MODEL = process.env.CODEX_MODEL || 'gpt-5.4-mini';
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
const previewAdapter = createPreviewAdapter('msm-portal');
const productRunner = createProductRunner('msm-portal', {
  repoRoot: MSM_REPO_ROOT,
  worktreeBase: WORKTREE_BASE,
});

function getPreviewRuntimeConfig(worktreePath) {
  return previewAdapter.createRuntimeConfig({
    repoRoot: MSM_REPO_ROOT,
    worktreePath,
  });
}

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
  const relativeToRepo = path.relative(productRunner.repoRoot, normalizedPath);

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
  if (updates.status || updates.phase || updates.error) {
    appendAnalyticsEvent(state, 'state_updated', {
      status: state.status,
      phase: state.phase,
      error: state.error,
      summary: updates.status ? `Status changed to ${updates.status}` : `Phase updated to ${state.phase}`,
    });
  }
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
  appendAnalyticsEvent(state, 'log', {
    summary: state.latestLog,
  });
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
    lifecycle: state.analytics?.lifecycle ?? [],
    approvalState: state.analytics?.approvalState ?? 'pending_review',
    iterationCount: state.analytics?.iterationCount ?? 0,
    tokenUsage: state.analytics?.tokenUsage ?? null,
    request: summarizeRequestPayload(state.payload),
  };
}

function appendAnalyticsEvent(state, type, details = {}) {
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

function shouldIgnoreCodexLogLine(line) {
  const normalized = String(line).trim();
  if (!normalized) return true;

  return [
    normalized === 'codex',
    normalized === 'exec',
    normalized.startsWith('/bin/zsh -lc '),
    normalized.startsWith('succeeded in '),
    normalized.startsWith('exited '),
    'WARN codex_state::runtime',
    'WARN codex_rollout::state_db',
    'WARN codex_rollout::list',
    'WARN codex_core::plugins::manifest',
    'WARN codex_core::shell_snapshot',
    'WARN codex_rmcp_client::rmcp_client',
    'PM Request:',
    'Design system path:',
    'You are modifying MSM Portal UI code.',
    'Component:',
    'File:',
    'Before editing UI code, read',
    'Stay within this repository',
    'Make the smallest possible UI change',
    'Edit only the target file',
    'Do not install dependencies.',
    'Do not modify package.json',
    'Do not create commits or branches.',
  ].some((token) => normalized.includes(token));
}

function getPreviewClient(payload) {
  return inferClientFromPayload(payload);
}

function getPreviewContext(payload) {
  const client = getPreviewClient(payload);
  return previewAdapter.buildPreviewContext({ payload, client });
}

function isTextChangeRequest(payload) {
  return /\b(text|copy|label|placeholder|title|subtitle|description|message|번역|문구|텍스트|설명|타이틀|레이블|플레이스홀더)\b/i.test(
    String(payload?.userPrompt || ''),
  );
}

function verifyLocaleAlignment(payload, changedFiles) {
  const expectedLanguage = getPreviewContext(payload).language;
  if (!expectedLanguage) {
    return {
      ok: true,
      message: 'Locale alignment skipped (no explicit page language)',
    };
  }

  const languageAssetPattern = /\/src\/i18n\/assets\/([^/]+)\//;
  const changedLanguageAssets = changedFiles.filter((file) => languageAssetPattern.test(file));
  if (!changedLanguageAssets.length) {
    return {
      ok: true,
      message: `Locale alignment passed for ${expectedLanguage} (no locale asset changes)`,
    };
  }

  const changedLanguages = new Set(
    changedLanguageAssets
      .map((file) => file.match(languageAssetPattern)?.[1] || null)
      .filter(Boolean),
  );

  if (!changedLanguages.has(expectedLanguage)) {
    return {
      ok: false,
      message: `Locale alignment failed: current page language is ${expectedLanguage}, but changed locale files were ${Array.from(changedLanguages).join(', ')}`,
    };
  }

  return {
    ok: true,
    message: `Locale alignment passed for ${expectedLanguage}`,
  };
}

function getChangeIntent(payload) {
  return payload?.requestContract?.change_intent || inferChangeIntentFromPrompt(payload);
}

function isCopyChangeRequest(payload) {
  return getChangeIntent(payload) === 'copy_update' || isTextChangeRequest(payload);
}

function extractTranslationNamespacesFromFile(worktreePath, relativeFile) {
  if (!relativeFile) return [];

  const absolutePath = path.join(worktreePath, relativeFile);
  if (!fs.existsSync(absolutePath)) return [];
  const source = fs.readFileSync(absolutePath, 'utf8');
  const matches = Array.from(source.matchAll(/useTranslation\(\s*['"`]([^'"`]+)['"`]\s*\)/g));
  return Array.from(new Set(matches.map((match) => match[1]).filter(Boolean)));
}

function collectCopyChangeContext({ payload, changedFiles, worktreePath }) {
  const targetFile =
    payload?.requestContract?.target?.selection_context?.source_file ||
    payload?.file ||
    null;
  const namespaces = extractTranslationNamespacesFromFile(worktreePath, targetFile);
  const { localeFiles, changedEntries } = productRunner.collectLocaleStringChanges({
    worktreePath,
    changedFiles,
  });

  const namespaceChanges = namespaces.length
    ? changedEntries.filter((entry) =>
        namespaces.some((namespace) => entry.path === namespace || entry.path.startsWith(`${namespace}.`)),
      )
    : [];

  const visibleTextCandidates = Array.from(
    new Set(
      namespaceChanges
        .map((entry) => String(entry.after || '').trim())
        .filter(Boolean),
    ),
  );

  return {
    targetFile,
    namespaces,
    localeFiles,
    changedEntries,
    namespaceChanges,
    visibleTextCandidates,
  };
}

function getValidationExpectations(payload) {
  return Array.isArray(payload?.requestContract?.validation_expectations)
    ? payload.requestContract.validation_expectations
    : [];
}

function shouldRunProductBuild({ payload, changedFiles }) {
  if (!changedFiles.some((file) => previewAdapter.isProductFile(file))) {
    return false;
  }

  const expectations = getValidationExpectations(payload);
  if (expectations.includes('build') || expectations.includes('product_build')) {
    return true;
  }

  return changedFiles.some((file) =>
    /\/src\/(app-builder\/route|route\/|apps\/[^/]+\/page\/|apps\/[^/]+\/config\/layout)/.test(file),
  );
}

function shouldRunProductTests({ payload, changedFiles }) {
  if (!changedFiles.some((file) => previewAdapter.isProductFile(file))) {
    return false;
  }

  const expectations = getValidationExpectations(payload);
  if (expectations.includes('test') || expectations.includes('tests') || expectations.includes('product_test')) {
    return true;
  }

  return changedFiles.some((file) => /\.(test|spec)\.(ts|tsx)$/.test(file));
}

function verifyCopyNamespaceAlignment({ payload, changedFiles, worktreePath }) {
  if (!isCopyChangeRequest(payload)) {
    return { ok: true, message: 'Copy verification skipped (intent is not copy_update)' };
  }

  const context = collectCopyChangeContext({ payload, changedFiles, worktreePath });

  if (!context.targetFile) {
    return {
      ok: true,
      message: 'Copy namespace verification skipped (no source file hint available)',
      context,
    };
  }

  if (!context.namespaces.length) {
    return {
      ok: true,
      message: 'Copy namespace verification skipped (target file has no explicit useTranslation namespace)',
      context,
    };
  }

  if (!context.localeFiles.length) {
    return {
      ok: true,
      message: `Copy namespace verification passed (no locale assets changed; target namespaces: ${context.namespaces.join(', ')})`,
      context,
    };
  }

  if (!context.namespaceChanges.length) {
    return {
      ok: false,
      message: `Copy namespace verification failed: locale changes did not touch namespaces used by ${path.basename(context.targetFile)} (${context.namespaces.join(', ')})`,
      context,
    };
  }

  return {
    ok: true,
    message: `Copy namespace verification passed for ${context.namespaces.join(', ')}`,
    context,
  };
}

async function verifyCopyVisibleOnRoute({ payload, previewUrl, worktreePath, visibleTextCandidates }) {
  if (!isCopyChangeRequest(payload)) {
    return { ok: true, message: 'Copy visibility verification skipped (intent is not copy_update)' };
  }
  return await previewAdapter.verifyCopyVisible({
    runtimeConfig: getPreviewRuntimeConfig(worktreePath),
    previewUrl,
    expectedLanguage: getPreviewContext(payload).language || '',
    candidates: visibleTextCandidates,
  });
}

async function getAvailablePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate preview port')));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function ensureWorktreeNodeModules(worktreePath) {
  const runtimeConfig = getPreviewRuntimeConfig(worktreePath);
  const worktreeNodeModules = runtimeConfig.worktreeNodeModulesPath;
  const sourceNodeModules = runtimeConfig.sourceNodeModulesPath;

  if (fs.existsSync(worktreeNodeModules)) {
    return;
  }

  fs.symlinkSync(sourceNodeModules, worktreeNodeModules, process.platform === 'win32' ? 'junction' : 'dir');
}

async function waitForServerReady(url, getEarlyError, timeoutMs = 45_000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    const earlyError = typeof getEarlyError === 'function' ? getEarlyError() : null;
    if (earlyError) {
      throw earlyError;
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok || response.status === 302 || response.status === 404) {
        return;
      }
      lastError = new Error(`Server responded with status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw lastError || new Error(`Timed out waiting for preview server at ${url}`);
}

async function capturePreviewScreenshot({ id, worktreePath, payload }) {
  const previewContext = getPreviewContext(payload);
  const runtimeConfig = getPreviewRuntimeConfig(worktreePath);
  const client = previewContext.client;
  const expectedLanguage = previewContext.language;
  const route = previewContext.bootstrapRoute;
  const previewMode = 'test';
  const port = await getAvailablePort();
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${id}.png`);
  const previewUrl = `http://127.0.0.1:${port}${route}`;
  ensureWorktreeNodeModules(worktreePath);

  const previewServer = spawn(
      'pnpm',
      [
        'exec',
        'vite',
        '--mode',
        previewMode,
        '--host',
        '127.0.0.1',
        '--strictPort',
        '--port',
      String(port),
      '--config',
      runtimeConfig.viteConfigPath,
    ],
    {
      cwd: runtimeConfig.worktreeAppRoot,
      env: {
        ...process.env,
        CLIENT: client,
        MODE: previewMode,
        PORT: String(port),
        COREPACK_ENABLE_AUTO_PIN: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let serverLogs = '';
  let previewExitError = null;
  const collectServerLog = (chunk) => {
    serverLogs += chunk.toString();
    serverLogs = serverLogs.slice(-4000);
  };

  previewServer.stdout.on('data', collectServerLog);
  previewServer.stderr.on('data', collectServerLog);
  previewServer.on('close', (code, signal) => {
    if (code === 0 || signal === 'SIGTERM' || signal === 'SIGKILL') {
      return;
    }
    previewExitError = new Error(`Preview server exited early with code ${code ?? 'unknown'}`);
  });

  try {
    await waitForServerReady(`http://127.0.0.1:${port}/`, () => previewExitError);
    const { stdout } = await previewAdapter.captureScreenshot({
      runtimeConfig,
      previewUrl,
      screenshotPath,
      expectedLanguage,
      client,
    });
    return { screenshotPath, previewUrl, previewServer, screenshotStdout: stdout };
  } catch (error) {
    previewServer.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        previewServer.kill('SIGKILL');
        resolve();
      }, 3000);
      previewServer.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    const logTail = serverLogs
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-8)
      .join(' | ');
    if (logTail) {
      throw new Error(`Screenshot failed: ${error.message} [preview logs: ${logTail}]`);
    }
    throw new Error(`Screenshot failed: ${error.message}`);
  }
}

async function runCodexCommand({ id, worktreePath, promptInputPath, agentOutputPath, targetFile }) {
  const codexArgs = [
    'exec',
    '--dangerously-bypass-approvals-and-sandbox',
    '--skip-git-repo-check',
    '--disable', 'plugins',
    '--ephemeral',
    '--cd', worktreePath,
    '--add-dir', DESIGN_SYSTEM_ROOT,
    '--model', CODEX_MODEL,
    '--config', 'model_reasoning_effort="low"',
    '--output-last-message', agentOutputPath,
    '-',
  ];

  return await new Promise((resolve, reject) => {
    const child = spawn('codex', codexArgs, {
      cwd: worktreePath,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let settled = false;
    const timeoutMs = 240_000;
    const noDiffTimeoutMs = 90_000;
    const noDiffIdleGraceMs = 20_000;
    let earlyStopTriggered = false;
    let monitorBusy = false;
    let lastActivityAt = Date.now();

    const stopEarlyIfScopedDiffExists = async () => {
      if (settled || monitorBusy || !targetFile) return;
      monitorBusy = true;
      try {
        const { stdout } = await execAsync('git diff --name-only', { cwd: worktreePath });
        const changedFiles = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        const hasForbiddenChanges = changedFiles.some((file) =>
          FORBIDDEN_MUTATION_PATTERNS.some((pattern) => pattern.test(file)),
        );
        if (!hasForbiddenChanges && changedFiles.includes(targetFile)) {
          earlyStopTriggered = true;
          appendLog(id, `Detected scoped edit in ${targetFile}; stopping Codex early to prepare preview.`);
          child.kill('SIGTERM');
        }
      } catch {
        // ignore monitor failures
      } finally {
        monitorBusy = false;
      }
    };

    const monitorInterval = setInterval(() => {
      void stopEarlyIfScopedDiffExists();
    }, 5000);

    const pushChunkLines = (chunk, previous, label) => {
      const combined = previous + chunk.toString();
      lastActivityAt = Date.now();
      const lines = combined.split('\n');
      const remainder = lines.pop() ?? '';
      lines
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !shouldIgnoreCodexLogLine(line))
        .slice(-4)
        .forEach((line) => appendLog(id, `[codex ${label}] ${line}`));
      return remainder;
    };

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearInterval(monitorInterval);
      clearInterval(noDiffTimeout);
      appendLog(id, `Codex timed out after ${Math.round(timeoutMs / 1000)}s`);
      child.kill('SIGTERM');
      reject(new Error(`Codex timed out after ${Math.round(timeoutMs / 1000)} seconds`));
    }, timeoutMs);

    const noDiffTimeout = setInterval(async () => {
      if (settled) return;
      if (Date.now() - lastActivityAt < noDiffIdleGraceMs) {
        return;
      }
      if (Date.now() < lastActivityAt + noDiffTimeoutMs) {
        return;
      }
      try {
        const { stdout } = await execAsync('git diff --name-only', { cwd: worktreePath });
        const changedFiles = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .filter((file) => file !== '.omc/');
        if (changedFiles.length === 0) {
          settled = true;
          clearInterval(monitorInterval);
          clearTimeout(timeout);
          clearInterval(noDiffTimeout);
          appendLog(id, `Codex stalled for ${Math.round(noDiffTimeoutMs / 1000)}s without making a code change`);
          child.kill('SIGTERM');
          reject(new Error('Codex stalled before producing a code change'));
        }
      } catch {
        // ignore timeout diff check failures
      }
    }, 5000);

    child.stdout.on('data', (chunk) => {
      stdoutBuffer = pushChunkLines(chunk, stdoutBuffer, 'stdout');
    });

    child.stderr.on('data', (chunk) => {
      stderrBuffer = pushChunkLines(chunk, stderrBuffer, 'stderr');
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      clearInterval(noDiffTimeout);
      clearInterval(monitorInterval);
      if (settled) return;
      settled = true;
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      clearInterval(noDiffTimeout);
      clearInterval(monitorInterval);
      if (settled) return;
      settled = true;
      if (stdoutBuffer.trim()) appendLog(id, `[codex stdout] ${stdoutBuffer.trim()}`);
      if (stderrBuffer.trim()) appendLog(id, `[codex stderr] ${stderrBuffer.trim()}`);
      if (code === 0 || earlyStopTriggered) {
        resolve();
        return;
      }
      reject(new Error(`Codex exited with code ${code ?? 'unknown'}`));
    });

    const promptStream = fs.createReadStream(promptInputPath);
    promptStream.on('error', (error) => {
      clearTimeout(timeout);
      clearInterval(noDiffTimeout);
      clearInterval(monitorInterval);
      if (settled) return;
      settled = true;
      reject(error);
    });
    promptStream.pipe(child.stdin);
  });
}

// ─── Pipeline ─────────────────────────────────────────────────────────

async function runPipeline(id) {
  const state = requests.get(id);
  if (!state) return;

  try {
    // Step 1: Create git worktree
    updateRequest(id, { status: 'processing', phase: 'creating_worktree' });
    appendLog(id, 'Creating git worktree...');

    const worktreeInfo = await productRunner.createWorktree({
      requestId: id,
      initialBranch: state.branch,
    });
    const { branchName, worktreePath } = worktreeInfo;
    if (branchName !== state.branch) {
      updateRequest(id, { branch: branchName });
      appendLog(id, `Inspect branch name adjusted to avoid collision: ${branchName}`);
    }

    updateRequest(id, { worktreePath });
    appendLog(id, `Worktree created at ${worktreePath}`);

    const workspaceSync = await productRunner.syncLocalChangesIntoWorktree(worktreePath);
    if (workspaceSync.totalChanged) {
      appendLog(
        id,
        `Synced local workspace changes into worktree (copied ${workspaceSync.copiedCount}, removed ${workspaceSync.removedCount})`,
      );

      const baselineCommitted = await productRunner.commitBaseline(worktreePath);
      if (baselineCommitted) {
        appendLog(id, 'Committed local workspace baseline inside inspect worktree');
      }
    }

    // Step 2: Write inspect-prompt.json into worktree
    const omcDir = path.join(worktreePath, '.omc');
    if (!fs.existsSync(omcDir)) fs.mkdirSync(omcDir, { recursive: true });
    const promptPath = path.join(omcDir, 'inspect-prompt.json');
    fs.writeFileSync(promptPath, JSON.stringify(state.payload, null, 2));
    appendLog(id, 'Wrote inspect-prompt.json');

    // Step 3: Run Codex
    updateRequest(id, { phase: 'running_codex' });
    appendLog(id, 'Running Codex...');
    const prompt = buildPrompt(state.payload, worktreePath);
    const agentOutputPath = path.join(worktreePath, '.omc', `codex-last-message-${id}.txt`);
    const promptInputPath = path.join(worktreePath, '.omc', `codex-prompt-${id}.txt`);
    fs.writeFileSync(promptInputPath, prompt, 'utf-8');

    await runCodexCommand({
      id,
      worktreePath,
      promptInputPath,
      agentOutputPath,
      targetFile:
        state.payload.file && !path.isAbsolute(state.payload.file)
          ? path.join(worktreePath, state.payload.file)
          : state.payload.file || null,
    });
    appendLog(id, 'Codex finished');

    // Step 4: Revert forbidden dependency metadata changes, then collect diff
    updateRequest(id, { phase: 'collecting_diff' });
    const { stdout: preChangedFilesOutput } = await execAsync('git diff --name-only', { cwd: worktreePath });
    const preChangedFiles = preChangedFilesOutput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const forbiddenFiles = preChangedFiles.filter((file) =>
      FORBIDDEN_MUTATION_PATTERNS.some((pattern) => pattern.test(file)),
    );
    if (forbiddenFiles.length) {
      await execFileAsync('git', ['checkout', '--', ...forbiddenFiles], {
        cwd: worktreePath,
        timeout: 120_000,
        env: { ...process.env },
      });
      appendLog(id, `Reverted forbidden file changes: ${forbiddenFiles.join(', ')}`);
    }

    const { stdout: diffOutput } = await execAsync(`git diff --stat -- . ':(exclude).omc/**'`, { cwd: worktreePath });

    // Get full diff, excluding internal orchestrator artifacts.
    const { stdout: fullDiff } = await execAsync(`git diff -- . ':(exclude).omc/**'`, { cwd: worktreePath });
    const { stdout: changedFilesOutput } = await execAsync(`git diff --name-only -- . ':(exclude).omc/**'`, { cwd: worktreePath });
    const changedFiles = changedFilesOutput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    updateRequest(id, { diff: fullDiff, changedFiles });
    if (diffOutput.trim()) {
      appendLog(id, `Changes: ${diffOutput.trim()}`);
    }

    if (!changedFiles.length) {
      state.analytics.approvalState = 'not_required';
      updateRequest(id, {
        status: 'no_change_needed',
        phase: 'no_change_needed',
        diff: null,
        changedFiles: [],
        screenshotPath: null,
        previewUrl: null,
      });
      appendLog(id, 'Codex determined that no app code change was needed for this request.');
      await cleanup(id);
      return;
    }

    let copyVerificationContext = null;

    // Step 5: Validate changed files and typecheck if MSM web files changed
    try {
      updateRequest(id, { phase: 'validating' });
      const filesForValidation = changedFiles
        .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
        .filter((file) => previewAdapter.isProductSourceFile(file));

      if (filesForValidation.length) {
        appendLog(id, `Validating ${filesForValidation.length} changed TypeScript files...`);
        const validationTargets = filesForValidation.map((file) => path.join(worktreePath, file));
        await execFileAsync(
          'npx',
          ['tsx', 'scripts/validate.ts', ...validationTargets],
          { cwd: DESIGN_SYSTEM_ROOT, timeout: 240_000, env: { ...process.env } },
        );
        appendLog(id, 'Design-system validation passed');
      } else {
        appendLog(id, 'Design-system validation skipped (no changed TypeScript files)');
      }

      const changedMsmWebFiles = changedFiles.some((file) => previewAdapter.isProductFile(file));
      if (changedMsmWebFiles) {
        appendLog(id, 'Running msm-portal-web typecheck...');
        await productRunner.runTypecheck({ worktreePath });
        appendLog(id, 'Typecheck passed');
      }

      if (shouldRunProductBuild({ payload: state.payload, changedFiles })) {
        updateRequest(id, { phase: 'running_build' });
        appendLog(id, 'Running msm-portal-web build (policy matched)...');
        await productRunner.runBuild({
          worktreePath,
          client: state.payload?.client || 'msm-default',
          mode: 'test',
        });
        appendLog(id, 'Build passed');
      } else {
        appendLog(id, 'Build skipped (policy not matched)');
      }

      if (shouldRunProductTests({ payload: state.payload, changedFiles })) {
        updateRequest(id, { phase: 'running_tests' });
        appendLog(id, 'Running msm-portal-web tests (policy matched)...');
        await productRunner.runTests({ worktreePath });
        appendLog(id, 'Tests passed');
      } else {
        appendLog(id, 'Tests skipped (policy not matched)');
      }

      const localeCheck = verifyLocaleAlignment(state.payload, changedFiles);
      if (!localeCheck.ok) {
        throw new Error(localeCheck.message);
      }
      appendLog(id, localeCheck.message);

      const copyNamespaceCheck = verifyCopyNamespaceAlignment({
        payload: state.payload,
        changedFiles,
        worktreePath,
      });
      copyVerificationContext = copyNamespaceCheck.context || null;
      if (!copyNamespaceCheck.ok) {
        throw new Error(copyNamespaceCheck.message);
      }
      appendLog(id, copyNamespaceCheck.message);
    } catch (e) {
      updateRequest(id, { status: 'error', phase: 'validating', error: `Validation failed: ${e.message}` });
      appendLog(id, 'Validation failed');
      if (e.stdout) appendLog(id, String(e.stdout).slice(0, 1000));
      if (e.stderr) appendLog(id, String(e.stderr).slice(0, 1000));
      await cleanup(id);
      return;
    }

    // Step 6: Screenshot preview + verification
    try {
      if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
      const changedMsmWebFiles = changedFiles.some((file) => previewAdapter.isProductFile(file));
      if (!changedMsmWebFiles) {
        appendLog(id, 'Screenshot skipped (no msm-portal-web changes)');
      } else {
        updateRequest(id, { phase: 'capturing_screenshot' });
        appendLog(id, 'Starting preview app for screenshot capture...');

        let previewResult = null;
        let screenshotError = null;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            previewResult = await capturePreviewScreenshot({
              id,
              worktreePath,
              payload: state.payload,
            });
            break;
          } catch (error) {
            screenshotError = error;
            appendLog(id, `Preview verification attempt ${attempt} failed: ${error.message}`);
          }
        }

        if (!previewResult) {
          throw screenshotError || new Error('Preview verification failed');
        }

        state.previewServer = previewResult.previewServer;
        const previewContext = getPreviewContext(state.payload);
        const runtimeConfig = getPreviewRuntimeConfig(worktreePath);
        updateRequest(id, {
          screenshotPath: previewResult.screenshotPath,
          previewUrl: previewResult.previewUrl,
        });
        appendLog(id, `Screenshot captured: ${path.basename(previewResult.screenshotPath)}`);
        const routeVerification = await previewAdapter.verifyRoute({
          runtimeConfig,
          previewUrl: previewResult.previewUrl,
          expectedLanguage: previewContext.language,
          client: previewContext.client,
        });
        if (!routeVerification.ok) {
          throw new Error(routeVerification.message);
        }
        appendLog(id, routeVerification.message);

        const copyVisibleCheck = await verifyCopyVisibleOnRoute({
          payload: state.payload,
          previewUrl: previewResult.previewUrl,
          worktreePath,
          visibleTextCandidates: copyVerificationContext?.visibleTextCandidates || [],
        });
        if (!copyVisibleCheck.ok) {
          throw new Error(copyVisibleCheck.message);
        }
        appendLog(id, copyVisibleCheck.message);
        appendLog(id, `Preview verification passed${getPreviewContext(state.payload).language ? ` (language: ${getPreviewContext(state.payload).language})` : ''}`);
      }
    } catch (error) {
      updateRequest(id, { status: 'error', phase: 'capturing_screenshot', error: `Preview verification failed: ${error.message}` });
      appendLog(id, `Preview verification failed: ${error.message}`);
      await cleanup(id);
      return;
    }

    // Step 7: Ready for review
    updateRequest(id, { status: 'preview', phase: 'preview_ready' });
    appendAnalyticsEvent(state, 'preview_ready', {
      summary: 'Preview is ready for review',
      previewUrl: state.previewUrl,
      screenshotUrl: state.screenshotPath ? `/api/screenshot/${state.id}` : null,
    });
    appendLog(id, 'Ready for PM review');

  } catch (e) {
    updateRequest(id, { status: 'error', phase: 'pipeline_error', error: e.message });
    appendLog(id, 'Pipeline error: ' + e.message);
    await cleanup(id);
  }
}

function buildPrompt(payload, worktreePath = null) {
  const parts = ['You are modifying MSM Portal UI code. Follow the design system rules in AGENTS.md and design-system JSON files.'];
  const requestContract = payload.requestContract || {};
  const targetFileForEdit =
    payload.file && worktreePath && !path.isAbsolute(payload.file)
      ? path.join(worktreePath, payload.file)
      : payload.file;

  if (payload.component) parts.push(`Component: ${payload.component}`);
  if (targetFileForEdit) parts.push(`File: ${targetFileForEdit}:${payload.line || ''}`);
  if (payload.testId) parts.push(`Test ID: ${payload.testId}`);
  if (payload.pagePath) parts.push(`Current route: ${payload.pagePath}`);
  if (payload.client) parts.push(`Current client: ${payload.client}`);
  if (Array.isArray(payload.selectedElements) && payload.selectedElements.length) {
    parts.push(`Selected elements: ${payload.selectedElements.map((item) => item.testId || item.component || item.semantics?.labelText || item.semantics?.domTag || 'element').join(' | ')}`);
  }
  if (requestContract.goal) parts.push(`Request goal: ${requestContract.goal}`);
  if (requestContract.change_intent) parts.push(`Change intent: ${requestContract.change_intent}`);
  if (Array.isArray(requestContract.constraints) && requestContract.constraints.length) {
    parts.push(`Constraints: ${requestContract.constraints.join(' | ')}`);
  }
  if (Array.isArray(requestContract.success_criteria) && requestContract.success_criteria.length) {
    parts.push(`Success criteria: ${requestContract.success_criteria.join(' | ')}`);
  }
  if (payload.styles) {
    const s = payload.styles;
    parts.push(`Current styles: font ${s.fontSize}/${s.fontWeight}, color ${s.color}, bg ${s.backgroundColor}, padding ${s.padding}, size ${s.width}x${s.height}`);
  }
  if (payload.selectionRect) {
    parts.push(`Selected screenshot region: ${Math.round(payload.selectionRect.width)}x${Math.round(payload.selectionRect.height)} at (${Math.round(payload.selectionRect.left)}, ${Math.round(payload.selectionRect.top)})`);
  }
  if (payload.selectionScreenshotPath) {
    parts.push(`Reference screenshot saved at: ${payload.selectionScreenshotPath}`);
    parts.push('Use the selected screenshot as visual context for the requested UI change if helpful.');
  }
  if (payload.language) {
    parts.push(`Current page language: ${payload.language}`);
    parts.push('Preserve the current page language in the preview and in any visible copy changes. If you edit translation resources, prefer the matching locale file over English by default.');
  }
  parts.push(`\nPM Request: ${payload.userPrompt}`);
  parts.push(`\nDesign system path: ${DESIGN_SYSTEM_ROOT}`);
  parts.push('\nStart by opening only the target file around the requested line and inspect the existing implementation first.');
  parts.push('\nRead design-system/src/tokens.json, components.json, patterns.json, and conventions.json only with targeted lookups for the exact token or component you need.');
  parts.push('\nDo not print or dump raw JSON contents from design-system files. Use rg, sed for small ranges, or focused node queries only.');
  parts.push('\nMake the smallest possible UI change that satisfies the request.');
  parts.push('\nEdit only the target file unless a directly related shared styled/auth file must also change.');
  parts.push('\nDo not install dependencies. Do not run pnpm install, npm install, yarn, or bun install.');
  parts.push('\nDo not modify package.json, pnpm-lock.yaml, package-lock.json, yarn.lock, or workspace config files.');
  parts.push('\nDo not create commits or branches. The orchestrator will run validation and typecheck after you finish.');
  parts.push('\nStay on the current route for preview and implementation. Do not solve the request by changing a different page.');
  parts.push('\nPrefer files that belong to the current route or shared dependencies actually used by that route.');
  parts.push('\nIf this is a copy_update request, first verify which component file owns the visible text and which useTranslation namespace that component uses before editing any locale file.');
  parts.push('\nIf a locale file changes, keep the edit inside the namespace used by the selected component and avoid touching sibling auth or unrelated submit labels.');
  if (/\b(spacing|margin|padding|gap)\b/i.test(payload.userPrompt || '')) {
    parts.push('\nThis is a spacing-only request. Prefer adjusting one existing spacing value to the next appropriate theme.mcui.spacing(...) step. Do not refactor layout structure.');
  }
  if (/\b(tab|tabs|탭)\b/i.test(payload.userPrompt || '')) {
    parts.push('\nThis is a tab-related structural request. Modify the currently viewed page or its directly shared tab dependencies only. Do not switch to another route, page, or unrelated tab implementation.');
  }
  if (isTextChangeRequest(payload)) {
    parts.push('\nThis request likely changes visible copy. Make sure the updated text is reflected in the current page language and lands in the correct i18n resource when applicable.');
  }

  return parts.join('\n');
}

async function handleApprove(id) {
  const state = requests.get(id);
  if (!state || state.status !== 'preview') return null;

  try {
    state.analytics.approvalState = 'approved';
    updateRequest(id, { status: 'approved' });
    updateRequest(id, { phase: 'applying_local_patch' });
    appendLog(id, 'PM approved, applying patch to local workspace...');

    const applyResult = await productRunner.applyPatchToLocalRepo({
      requestId: id,
      worktreePath: state.worktreePath,
      diff: state.diff || '',
      changedFiles: state.changedFiles || [],
    });
    if (applyResult.mode === 'direct_apply') {
      appendLog(id, 'Patch applied to local workspace with direct apply');
    } else if (applyResult.mode === 'three_way') {
      appendLog(id, 'Patch applied to local workspace with 3-way merge');
    } else {
      appendLog(id, '3-way merge failed, syncing changed files from worktree...');
      appendLog(id, `Copied ${applyResult.appliedFiles?.length || 0} changed files from worktree`);
      appendLog(id, `Backed up previous local files under ${applyResult.backupRoot}`);
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

  // Reset worktree
  if (state.worktreePath) {
    await productRunner.resetWorktree(state.worktreePath);
  }

  // Re-run pipeline
  runPipeline(id);
  return state;
}

async function cleanup(id) {
  const state = requests.get(id);
  if (!state) return;
  if (state.previewServer) {
    try {
      state.previewServer.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          state.previewServer.kill('SIGKILL');
          resolve();
        }, 3000);
        state.previewServer.once('close', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    } catch { /* ignore */ }
  }
  if (state.worktreePath && fs.existsSync(state.worktreePath)) {
    await productRunner.removeWorktree(state.worktreePath);
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
      repoRoot: MSM_REPO_ROOT,
      designSystemRoot: DESIGN_SYSTEM_ROOT,
      model: CODEX_MODEL,
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
server.listen(PORT, () => {
  console.log(`[Orchestrator] Listening on http://localhost:${PORT}`);
  console.log(`[Orchestrator] Workspace root: ${WORKSPACE_ROOT}`);
  console.log(`[Orchestrator] Repo root: ${MSM_REPO_ROOT}`);
  console.log(`[Orchestrator] Design system root: ${DESIGN_SYSTEM_ROOT}`);
  console.log(`[Orchestrator] Model: ${CODEX_MODEL}`);
  console.log(`[Orchestrator] Worktrees: ${WORKTREE_BASE}`);
});
