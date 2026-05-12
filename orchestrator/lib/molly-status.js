// orchestrator/lib/molly-status.js

import { getPlaygroundIdForThread } from './slack-thread-map.js';
import { getMollySettings } from './molly-settings.js';
import { recordEvent } from './molly-metrics.js';

export const SYSTEM_PROMPT = `You are Molly's status reporter. When a user asks about task or system status, read the raw data below and reply in friendly, concise English.

**Language rule (critical):** ALWAYS reply in English. Even when the user's question is in Korean (or another language), your reply MUST be in English. Users frequently ask in Korean — you always answer in English so downstream surfaces render consistently.

Reply guide:
- Answer only what the user is asking about (active tasks, yesterday's tasks, a specific task, etc.)
- If there are many tasks, summarise up to 5
- Show IDs as the first 8 characters in backticks
- For in-progress tasks show reviewed / total subtask count, status, and targetRoute / phase
- Always include one line pointing to Inspect Console (http://localhost:4174) Jobs / Requests tabs
- Reply length: 2-4 paragraphs, or 1-2 lines when terse is appropriate

Raw data format: JSON array, each task has:
- common: { id, kind, status, prdText (first 80 chars), playgroundId, createdAt }
- kind='job' (large task created by Slack/Chrome ext): + { tasks: [{status}], targetRoute }
- kind='change-request' (task created when a Playground plan card is approved): + { phase }

Do not expose the "job" vs "change-request" distinction to the user — refer to both naturally as "task". The kind field is an internal signal for the LLM to produce accurate answers only.

Important:
- If the user asks about *this thread's* playground mapping (e.g. "did a playground get created for this thread?"), use the thisThreadPlayground field from the raw data directly. If it is null, reply: "This thread doesn't have a playground yet. Send a one-line work request and a new playground will be created for this thread."
- Do not assume a playground visible in the task data was created for this thread — it may belong to a different thread or surface.
- If thisThreadPlayground is null and the user asks whether a playground was created, explicitly say it does not exist yet.

(Lifecycle action commands — cancel, retry, promote, etc. — are handled by a separate lifecycle handler. This status reporter handles *pure status queries only*. If a lifecycle command somehow arrives here, safely redirect: "For direct actions, use Inspect Console (http://localhost:4174).")`;

/**
 * @param {string} text — 사용자 질문
 * @param {object} ctx — { listJobs, getJob, channel?, threadTs? }
 * @returns {Promise<string>}
 */
export async function composeStatusReply(text, ctx) {
  const t0 = Date.now();
  // #6 — 활성 작업 (running / queued / processing / paused / preview / pending /
  // ...) 우선, 그 다음 최근 종료 작업. 사용자가 보통 진행 중 상태 궁금. 토큰
  // 줄어들고 답변 정확도 ↑. terminal 집합은 jobs 와 change-requests 양쪽
  // 의 종결 상태를 포괄.
  const TERMINAL = new Set([
    'cancelled', // job
    'complete',  // job
    'approved',  // change-request 사용자 승인 후 종결
    'rejected',  // change-request
    'error',     // change-request
    'no_change_needed', // change-request
  ]);

  // Normalize both entities into a single shape so the LLM sees them
  // uniformly. Jobs come from the job lib (`/api/job`); change-requests
  // are the playground plan-card → executePlan flow tracked by server.js
  // (`/api/change-request`). Without merging, status_query answers miss
  // anything created from a Playground card.
  const allJobs = (ctx.listJobs?.() ?? []).map((j) => ({
    id: j.id,
    kind: 'job',
    status: j.status,
    tasks: (j.tasks ?? []).map((t) => ({ status: t.status })),
    targetRoute: j.targetRoute || null,
    createdAt: j.createdAt || null, // epoch ms
    prdText: (j.prdText || '').slice(0, 80),
    playgroundId: j.playgroundId || null,
  }));

  const allRequests = (ctx.listRequests?.() ?? []).map((r) => ({
    id: r.id,
    kind: 'change-request',
    status: r.status,
    phase: r.phase || null,
    createdAt: parseTimestamp(r.createdAt),
    prdText: ((r.payload?.userPrompt) || '').slice(0, 80),
    // change-request 는 payload.playgroundId 에 보관 (top-level 아님).
    playgroundId: r.payload?.playgroundId || r.playgroundId || null,
  }));

  const merged = [...allJobs, ...allRequests];
  const sorted = merged.slice().sort((a, b) => {
    const aActive = !TERMINAL.has(a.status) ? 1 : 0;
    const bActive = !TERMINAL.has(b.status) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive; // active first
    return (b.createdAt ?? 0) - (a.createdAt ?? 0);    // then most recent
  });
  const jobs = sorted.slice(0, 20);

  // 이 thread 에 매핑된 playground (Slack 의 thread → playground 1:1).
  // null 이면 PRD 가 아직 안 와서 playground 가 안 만들어진 상태.
  const thisThreadPlayground =
    ctx.channel && ctx.threadTs
      ? getPlaygroundIdForThread(ctx.channel, ctx.threadTs)
      : null;

  if (jobs.length === 0 && !thisThreadPlayground) {
    return "🤔 No tasks yet. Send a one-line work request and I'll get started.";
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  // #8 surface awareness — Inspect Console / Slack / Chrome ext / Playground
  // 별 안내 메시지 정확도. ctx.surface 받으면 prompt 에 주입.
  const surfaceHint = ctx.surface && ctx.surface !== 'unknown'
    ? `(current surface: ${ctx.surface} — always include Console link, and also mention the job card / side-panel on the user's surface)\n\n`
    : '';
  const userMessage =
    `${surfaceHint}Thread mapping:\nthisThreadPlayground = ${thisThreadPlayground ? `"${thisThreadPlayground}"` : 'null (no playground for this thread yet)'}\n\nTask data (active first → createdAt descending, max 20):\n${JSON.stringify(jobs, null, 2)}\n\nUser question: ${text}`;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: getMollySettings().statusModel,
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
  recordEvent('lib_call', {
    lib: 'molly-status',
    surface: ctx.surface,
    model: getMollySettings().statusModel,
    latency_ms: Date.now() - t0,
    jobs_count: jobs.length,
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
  });
  return reply;
}

/**
 * Normalize createdAt to epoch ms. Jobs store epoch ms directly; change-
 * requests store an ISO string ("2026-05-07T04:07:40.079Z"). We sort by
 * recency across both, so they need a uniform numeric form.
 */
function parseTimestamp(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw) {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? 0 : ms;
  }
  return 0;
}

function templatedFallback(jobs) {
  const TERMINAL = new Set(['complete', 'cancelled']);
  const active = jobs.filter((j) => !TERMINAL.has(j.status));
  const recentDone = jobs.filter((j) => TERMINAL.has(j.status)).slice(0, 3);
  const lines = [];
  if (active.length > 0) {
    lines.push(`🛠️ Active tasks: ${active.length}`);
    for (const j of active) {
      const reviewed = j.tasks.filter((t) => t.status === 'reviewed').length;
      lines.push(`• \`${j.id.slice(0, 8)}\` (${j.status}) — ${reviewed}/${j.tasks.length}${j.targetRoute ? ` · ${j.targetRoute}` : ''}`);
    }
  }
  if (recentDone.length > 0) {
    if (lines.length) lines.push('');
    lines.push(`📜 Recently completed`);
    for (const j of recentDone) {
      const verdict = j.status === 'complete' ? '✅' : '❌';
      lines.push(`• \`${j.id.slice(0, 8)}\` ${verdict} ${j.status}`);
    }
  }
  lines.push('');
  lines.push('For details, see the Jobs tab in Inspect Console (http://localhost:4174).');
  return lines.join('\n');
}
