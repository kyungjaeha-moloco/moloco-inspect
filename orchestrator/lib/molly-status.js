// orchestrator/lib/molly-status.js

import { getPlaygroundIdForThread } from './slack-thread-map.js';

const STATUS_MODEL = process.env.MOLLY_STATUS_MODEL || 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `당신은 molly 의 status reporter 입니다. 사용자가 잡/시스템 상태에 대해 질문하면 아래 raw 데이터를 보고 친근한 한국어로 답변합니다.

답변 형식:
- 사용자가 묻는 것 (활성 / 어제 / 특정 잡 등) 만 골라 답
- 잡이 많으면 5개 이내로 요약
- 잡 id 는 첫 8자만 (백틱)
- 진행 중인 잡은 reviewed 수 / total 수, 상태, targetRoute
- "자세한 건 Inspect Console (http://localhost:4174) 의 Jobs 탭" 안내 한 줄
- 답변 길이 2-4 문단, 필요하면 1-2 줄

raw 데이터 형식: JSON 배열, 각 잡은 { id, status, tasks: [{status}], targetRoute, createdAt, prdText (앞 80자), playgroundId }

중요:
- 사용자가 "이 thread 의 playground", "playground 가 새로 만들어졌어?" 같이 *현재 thread* 의 playground 매핑 상태를 물으면, raw 데이터의 thisThreadPlayground 필드를 그대로 답에 사용. null 이면 "이 thread 에는 아직 playground 가 없어요. 원하는 작업을 한 줄로 보내주시면 이 thread 에 새 playground 가 만들어집니다." 라고 답.
- 잡 데이터에 같은 playground 가 보인다고 해서 "그게 이 thread 에 새로 생긴 거" 라고 답하면 안 됨. 다른 thread / 다른 surface 가 만든 playground 일 수 있음.
- thisThreadPlayground 가 null 인데 사용자가 "playground 만들어졌어?" 류 질문을 하면 명시적으로 "아직 없음" 이라고 답.

(lifecycle 액션 명령 — "cancel 해줘", "다시 시도해", "promote 진행해" 등 — 은 별도 lifecycle handler 가 처리함. 이 status reporter 는 *순수 상태 질의* 만 받음. 만에 하나 lifecycle 명령이 들어오면 안전하게 "직접 액션은 Inspect Console (http://localhost:4174) 에서" 안내.)`;

/**
 * @param {string} text — 사용자 질문
 * @param {object} ctx — { listJobs, getJob, channel?, threadTs? }
 * @returns {Promise<string>}
 */
export async function composeStatusReply(text, ctx) {
  const jobs = (ctx.listJobs?.() ?? [])
    .slice()
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, 20)
    .map((j) => ({
      id: j.id,
      status: j.status,
      tasks: (j.tasks ?? []).map((t) => ({ status: t.status })),
      targetRoute: j.targetRoute || null,
      createdAt: j.createdAt || null,
      prdText: (j.prdText || '').slice(0, 80),
      playgroundId: j.playgroundId || null,
    }));

  // 이 thread 에 매핑된 playground (Slack 의 thread → playground 1:1).
  // null 이면 PRD 가 아직 안 와서 playground 가 안 만들어진 상태.
  const thisThreadPlayground =
    ctx.channel && ctx.threadTs
      ? getPlaygroundIdForThread(ctx.channel, ctx.threadTs)
      : null;

  if (jobs.length === 0 && !thisThreadPlayground) {
    return '🤔 아직 잡이 하나도 없어요. 원하는 작업을 한 줄로 알려주시면 시작할게요.';
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const userMessage =
    `이 thread 매핑 정보:\nthisThreadPlayground = ${thisThreadPlayground ? `"${thisThreadPlayground}"` : 'null (아직 playground 안 만들어짐)'}\n\n잡 데이터 (createdAt 내림차순, 최대 20개):\n${JSON.stringify(jobs, null, 2)}\n\n사용자 질문: ${text}`;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: STATUS_MODEL,
      max_tokens: 600,
      // Caching (#1): SYSTEM_PROMPT 캐시. Haiku 4.5 minimum cacheable
      // ~2048 tokens 추정 — system prompt 가 미달이면 API 가 자동 무시.
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) {
    // status 답변 실패 시 templated 폴백 — 사용자가 빈 화면 보지 않게.
    const text = await resp.text().catch(() => '');
    console.warn(`[molly-status] http ${resp.status}: ${text.slice(0, 120)} — templated fallback`);
    return templatedFallback(jobs);
  }
  const data = await resp.json();
  const content = data?.content?.[0]?.text ?? '';
  const trimmed = content.trim();
  const reply = trimmed.length >= 30 ? trimmed : templatedFallback(jobs);
  const u = data?.usage || {};
  console.log(
    `[molly-status] input="${text.slice(0, 80)}" → jobs=${jobs.length} reply len=${reply.length} | ` +
    `usage: input=${u.input_tokens ?? '?'} output=${u.output_tokens ?? '?'} ` +
    `cache_create=${u.cache_creation_input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0}`,
  );
  return reply;
}

function templatedFallback(jobs) {
  const TERMINAL = new Set(['complete', 'cancelled']);
  const active = jobs.filter((j) => !TERMINAL.has(j.status));
  const recentDone = jobs.filter((j) => TERMINAL.has(j.status)).slice(0, 3);
  const lines = [];
  if (active.length > 0) {
    lines.push(`🛠️ 진행 중인 잡 ${active.length}개`);
    for (const j of active) {
      const reviewed = j.tasks.filter((t) => t.status === 'reviewed').length;
      lines.push(`• \`${j.id.slice(0, 8)}\` (${j.status}) — ${reviewed}/${j.tasks.length}${j.targetRoute ? ` · ${j.targetRoute}` : ''}`);
    }
  }
  if (recentDone.length > 0) {
    if (lines.length) lines.push('');
    lines.push(`📜 최근 완료`);
    for (const j of recentDone) {
      const verdict = j.status === 'complete' ? '✅' : '❌';
      lines.push(`• \`${j.id.slice(0, 8)}\` ${verdict} ${j.status}`);
    }
  }
  lines.push('');
  lines.push('자세한 건 Inspect Console (http://localhost:4174) 의 Jobs 탭에서.');
  return lines.join('\n');
}
