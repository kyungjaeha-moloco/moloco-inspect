// orchestrator/lib/molly-lifecycle.js
//
// #4 (2026-05-06) — lifecycle_action 전용 핸들러. classifier 가 4번째
// 카테고리로 분리한 lifecycle 명령 (cancel / promote / 재시도 / restart)
// 을 처리. 책임 분리:
//   - status lib: 순수 상태 리포팅 (잡 데이터 → 자연어 요약)
//   - lifecycle lib: lifecycle 명령 → 잡 식별 + surface 별 UI 안내
//
// LLM 호출 안 함 (deterministic template). 이유:
//   - 사용자가 원하는 건 "어떤 버튼을 눌러야 하는지" — 자연어 다양성 X
//   - latency / 비용 0
//   - "수행 약속" 거짓말 위험 0 (코드가 절대 못 함)
//
// 잡 식별 휴리스틱:
//   - 메시지에서 hex 8자 이상 — 잡 ID 후보
//   - listJobs 에서 startsWith match — 식별
//   - 못 찾으면 활성 잡 1개면 그것, 여럿이면 "어떤 잡?" 되묻기

import { recordEvent } from './molly-metrics.js';

export const ACTION_KEYWORDS = {
  cancel: ['cancel', '취소', '캔슬'],
  promote: ['promote', '프로모트', '머지', 'merge'],
  retry: ['다시 시도', '재시도', 'retry', '리트라이'],
  restart: ['restart', '재시작', '복구'],
  rollback: ['rollback', '롤백'],
};

export const SURFACE_INSTRUCTIONS = {
  slack: {
    primary: 'Slack plan card (above in this thread) → [✅ Approve] / [❌ Cancel] / [🚀 Promote] button',
    secondary: 'Inspect Console (http://localhost:4174) → Jobs tab → job card → action button',
  },
  'chrome-ext': {
    primary: 'Chrome extension side panel → job card → action button',
    secondary: 'Inspect Console (http://localhost:4174) → Jobs tab → job card → action button',
  },
  playground: {
    primary: 'Playground chat → job card → action button',
    secondary: 'Inspect Console (http://localhost:4174) → Jobs tab → job card → action button',
  },
  unknown: {
    primary: 'Inspect Console (http://localhost:4174) → Jobs tab → job card → action button',
    secondary: 'Slack plan card / Chrome extension side panel / Playground chat → job card',
  },
};

/**
 * @param {string} text
 * @param {object} [ctx] — { surface, listJobs, channel?, threadTs? }
 * @returns {Promise<string>} — Slack mrkdwn 호환 응답
 */
export async function composeLifecycleReply(text, ctx = {}) {
  const t0 = Date.now();
  const action = detectAction(text);
  const jobs = (ctx.listJobs?.() ?? [])
    .slice()
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  const surfaceKey = SURFACE_INSTRUCTIONS[ctx.surface] ? ctx.surface : 'unknown';
  const surface = SURFACE_INSTRUCTIONS[surfaceKey];

  const matchedJob = matchJob(text, jobs);
  const ambiguousJobs = !matchedJob ? findCandidateJobs(action, jobs) : [];

  recordEvent('lib_call', {
    lib: 'molly-lifecycle',
    surface: ctx.surface,
    latency_ms: Date.now() - t0,
    action,
    jobMatched: !!matchedJob,
    candidates: matchedJob ? 1 : ambiguousJobs.length,
  });

  // 1. 잡 식별 못 함 + 후보 여럿 → 되묻기
  if (!matchedJob && ambiguousJobs.length > 1) {
    const list = ambiguousJobs
      .slice(0, 5)
      .map((j) => `• \`${j.id.slice(0, 8)}\` ${j.status} — ${(j.prdText || '').slice(0, 60)}`)
      .join('\n');
    return [
      `🤔 Which job would you like to ${actionLabel(action)}?`,
      '',
      `${ambiguousJobs.length} active/recent job candidates:`,
      list,
      '',
      `Please share the first 8 characters of the job ID, or act directly:`,
      `- ${surface.primary}`,
    ].join('\n');
  }

  // 2. 잡 식별 못 함 + 후보 0 / 1 → 안내만
  if (!matchedJob) {
    const only = ambiguousJobs[0];
    if (only) {
      return composeReplyForJob(only, action, surface);
    }
    return [
      `🤔 No job found to ${actionLabel(action)}.`,
      '',
      `There are no active jobs or all jobs have already finished.`,
      `You can check the full list at Inspect Console (http://localhost:4174) → Jobs tab.`,
    ].join('\n');
  }

  // 3. 잡 매칭 — surface 안내
  return composeReplyForJob(matchedJob, action, surface);
}

function composeReplyForJob(job, action, surface) {
  const id = job.id.slice(0, 8);
  const prd = (job.prdText || '').slice(0, 80);
  const target = job.targetRoute || '';
  return [
    `Job \`${id}\` (${prd}${target ? `, ${target}` : ''}) — currently *${job.status}*.`,
    '',
    `I can only check status. To ${actionLabel(action)}:`,
    `- ${surface.primary}`,
    `- Or: ${surface.secondary}`,
  ].join('\n');
}

function detectAction(text) {
  const lower = text.toLowerCase();
  for (const [action, keywords] of Object.entries(ACTION_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) return action;
    }
  }
  return 'unknown';
}

export function _actionLabel(action) {
  return {
    cancel: 'Cancel',
    promote: 'Promote',
    retry: 'Retry',
    restart: 'Restart',
    rollback: 'Rollback',
    unknown: 'action',
  }[action] || 'action';
}

function actionLabel(action) {
  return _actionLabel(action);
}

function matchJob(text, jobs) {
  const m = text.match(/\b([a-f0-9]{8,})\b/i);
  if (!m) return null;
  const idHint = m[1].toLowerCase();
  return jobs.find((j) => j.id?.toLowerCase().startsWith(idHint)) ?? null;
}

function findCandidateJobs(action, jobs) {
  // promote 는 보통 complete 상태 잡, cancel/retry/restart 는 active 또는 paused
  const TERMINAL = new Set(['cancelled']);
  const filtered = jobs.filter((j) => !TERMINAL.has(j.status));
  // 최근 5개 + 활성 우선
  const active = filtered.filter((j) => !['complete', 'cancelled'].includes(j.status));
  if (active.length > 0) return active.slice(0, 5);
  return filtered.slice(0, 5);
}
