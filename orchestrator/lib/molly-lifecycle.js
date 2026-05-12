// orchestrator/lib/molly-lifecycle.js
//
// #4 (2026-05-06) — dedicated handler for lifecycle_action. Handles lifecycle
// commands (cancel / promote / retry / restart) that the classifier separates
// into the 4th category. Responsibility split:
//   - status lib: pure state reporting (job data → natural-language summary)
//   - lifecycle lib: lifecycle command → job identification + surface-specific UI guidance
//
// No LLM call (deterministic template). Reasons:
//   - What the user wants is "which button to press" — no need for natural-language variety
//   - Latency / cost = 0
//   - Zero risk of false "I will do X" promises (the code simply cannot)
//
// Job identification heuristics:
//   - 8+ hex chars in the message → job ID candidate
//   - startsWith match against listJobs → identified
//   - If not found: 1 active job → use it; multiple → ask "which job?"

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
 * @returns {Promise<string>} — Slack mrkdwn-compatible response
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

  // 1. Job not identified + multiple candidates → ask which one
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

  // 2. Job not identified + 0 or 1 candidate → guidance only
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

  // 3. Job matched — surface guidance
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
  // promote typically targets complete-status jobs; cancel/retry/restart target active or paused
  const TERMINAL = new Set(['cancelled']);
  const filtered = jobs.filter((j) => !TERMINAL.has(j.status));
  // Up to 5 most recent, active jobs first
  const active = filtered.filter((j) => !['complete', 'cancelled'].includes(j.status));
  if (active.length > 0) return active.slice(0, 5);
  return filtered.slice(0, 5);
}
