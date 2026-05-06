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

const ACTION_KEYWORDS = {
  cancel: ['cancel', '취소', '캔슬'],
  promote: ['promote', '프로모트', '머지', 'merge'],
  retry: ['다시 시도', '재시도', 'retry', '리트라이'],
  restart: ['restart', '재시작', '복구'],
  rollback: ['rollback', '롤백'],
};

const SURFACE_INSTRUCTIONS = {
  slack: {
    primary: 'Slack 의 plan 카드 (이 thread 위쪽) 의 [✅ 승인] / [❌ 취소] / [🚀 Promote] 버튼',
    secondary: 'Inspect Console (http://localhost:4174) 의 Jobs 탭에서 잡 카드 → 액션 버튼',
  },
  'chrome-ext': {
    primary: 'Chrome 확장 사이드패널의 잡 카드 → 액션 버튼',
    secondary: 'Inspect Console (http://localhost:4174) 의 Jobs 탭에서 잡 카드 → 액션 버튼',
  },
  playground: {
    primary: 'Playground 채팅창의 잡 카드 → 액션 버튼',
    secondary: 'Inspect Console (http://localhost:4174) 의 Jobs 탭에서 잡 카드 → 액션 버튼',
  },
  unknown: {
    primary: 'Inspect Console (http://localhost:4174) 의 Jobs 탭에서 잡 카드 → 액션 버튼',
    secondary: 'Slack 의 plan 카드 / Chrome 확장 사이드패널 / Playground 채팅창의 잡 카드',
  },
};

/**
 * @param {string} text
 * @param {object} [ctx] — { surface, listJobs, channel?, threadTs? }
 * @returns {Promise<string>} — Slack mrkdwn 호환 응답
 */
export async function composeLifecycleReply(text, ctx = {}) {
  const action = detectAction(text);
  const jobs = (ctx.listJobs?.() ?? [])
    .slice()
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  const surfaceKey = SURFACE_INSTRUCTIONS[ctx.surface] ? ctx.surface : 'unknown';
  const surface = SURFACE_INSTRUCTIONS[surfaceKey];

  const matchedJob = matchJob(text, jobs);
  const ambiguousJobs = !matchedJob ? findCandidateJobs(action, jobs) : [];

  // 1. 잡 식별 못 함 + 후보 여럿 → 되묻기
  if (!matchedJob && ambiguousJobs.length > 1) {
    const list = ambiguousJobs
      .slice(0, 5)
      .map((j) => `• \`${j.id.slice(0, 8)}\` ${j.status} — ${(j.prdText || '').slice(0, 60)}`)
      .join('\n');
    return [
      `🤔 어떤 잡을 ${actionLabel(action)} 하시려는 건가요?`,
      '',
      `현재 활성/최근 잡 ${ambiguousJobs.length}개 중 후보:`,
      list,
      '',
      `잡 ID 처음 8자 알려주세요. 또는 직접 액션:`,
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
      `🤔 ${actionLabel(action)} 할 잡이 안 보여요.`,
      '',
      `현재 활성 잡이 없거나 모두 종료된 상태입니다.`,
      `Inspect Console (http://localhost:4174) 의 Jobs 탭에서 전체 목록 확인 가능.`,
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
    `\`${id}\` 잡 (${prd}${target ? `, ${target}` : ''}) — 현재 *${job.status}* 상태.`,
    '',
    `저는 상태만 확인할 수 있어요. ${actionLabel(action)} 하시려면:`,
    `- ${surface.primary}`,
    `- 또는: ${surface.secondary}`,
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

function actionLabel(action) {
  return {
    cancel: '취소',
    promote: 'Promote',
    retry: '재시도',
    restart: '재시작',
    rollback: '롤백',
    unknown: '액션',
  }[action] || '액션';
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
