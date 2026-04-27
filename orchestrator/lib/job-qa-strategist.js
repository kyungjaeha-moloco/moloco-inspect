/**
 * QA strategy selector (J6).
 *
 * After the user approves a task plan, the orchestrator picks ONE QA
 * strategy from a fixed catalog based on the PRD + task list shape.
 * Strategy choice drives:
 *   - WHEN QA runs (between every task vs once at the end vs never).
 *   - WHAT QA does (Playwright route smoke vs visual diff vs lint-only
 *     vs human-only).
 *
 * v0 only stamps the choice + rationale onto the job record so the UI
 * can show the user "we picked X because Y". Actually executing each
 * strategy lives in `lib/job-qa-runner.js` (next slice). The catalog
 * here is the source of truth — id, ko-label, when-to-use blurbs.
 *
 * Failure modes: LLM returns garbage / unreachable / API key missing.
 * Caller wraps in try/catch and falls back to `human_only` (the
 * existing default v0 behavior — manual QA pass button) if anything
 * goes wrong, so the job pipeline never blocks on the strategist.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Strategy catalog — keep this list narrow on purpose. The LLM picks
 * one id; the UI renders the label + description; the executor (next
 * slice) maps id → adapter. Adding a strategy means: extend this
 * catalog + (later) add an adapter.
 *
 * @typedef {'inline_per_task' | 'final_route_smoke' | 'visual_diff' | 'lint_only' | 'human_only'} QaStrategyId
 */
export const QA_STRATEGIES = Object.freeze([
  {
    id: 'inline_per_task',
    label_ko: '각 작업 직후 검증',
    when_ko:
      '여러 작업이 순차로 의존하고, 한 단계가 잘못되면 뒤가 다 무너지는 케이스 (예: 데이터 → 테이블 → 필터 → 액션 체인). 각 작업 직후 자동 스모크 테스트.',
  },
  {
    id: 'final_route_smoke',
    label_ko: '마무리 후 라우트 스모크 테스트',
    when_ko:
      '새로운 페이지/라우트를 추가하거나, UI 골격을 새로 짜는 케이스. 모든 작업이 끝난 뒤 한 번에 Playwright 헤드리스로 라우트 로드 + 핵심 요소 렌더링 확인.',
  },
  {
    id: 'visual_diff',
    label_ko: '시각적 회귀 비교',
    when_ko:
      '기존 화면을 미세하게 수정하는 케이스 (컬러/카피/레이아웃 조정). 변경 전후 스크린샷 비교로 의도치 않은 시각 회귀 감지.',
  },
  {
    id: 'lint_only',
    label_ko: '타입/린트만 통과',
    when_ko:
      '비즈니스 로직 위주 변경이라 UI 동작은 거의 안 바뀌는 케이스 (헬퍼 함수, 데이터 변환, 상수 추가). TypeScript + ESLint만 통과시키고 사람 QA 생략.',
  },
  {
    id: 'human_only',
    label_ko: '사람이 직접 확인',
    when_ko:
      '자동화로 잡기 어려운 UX/접근성/사용성 변경 (예: 모달 흐름, 폼 검증 메시지). 자동 QA 없이 작업중 탭에서 사용자가 직접 확인 후 통과 처리.',
  },
]);

const STRATEGY_IDS = QA_STRATEGIES.map((s) => s.id);

const SYSTEM_PROMPT = `You are a QA strategist for a low-code playground that turns product requests into UI changes via a coding agent. After tasks are decomposed but before they run, your job is to pick ONE QA strategy from a fixed catalog so the orchestrator knows when and how to verify the work.

Strategies (you must pick exactly one id from this list):

${QA_STRATEGIES.map(
  (s) => `- ${s.id}: ${s.label_ko} — ${s.when_ko}`,
).join('\n')}

Decision heuristics:
- New route / new page scaffold → final_route_smoke.
- Multi-step pipeline where each task feeds the next → inline_per_task.
- Cosmetic / micro-copy / styling tweak with no behavior change → visual_diff.
- Pure data layer / helper / constant changes with no visible UI delta → lint_only.
- UX flow, accessibility, error message wording, modal interaction → human_only.

Output a single fenced \`\`\`json block with this exact shape — no prose:
\`\`\`json
{ "strategy": "<one of: ${STRATEGY_IDS.join(' | ')}>", "rationale_ko": "한국어 한 문장, 80자 이내, '왜 이 전략인가'를 사용자가 읽을 수 있게." }
\`\`\``;

/**
 * @param {{
 *   prdText: string,
 *   tasks: Array<{ id: string, title: string, description: string }>,
 *   client?: string,
 *   apiKey?: string,
 *   model?: string,
 * }} input
 * @returns {Promise<{ strategy: QaStrategyId, rationale_ko: string }>}
 */
export async function selectQaStrategy(input) {
  const { prdText, tasks, client, apiKey: ctxKey, model: ctxModel } = input;
  if (!prdText || typeof prdText !== 'string') {
    throw new Error('prdText required');
  }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('tasks required (non-empty)');
  }
  const apiKey =
    ctxKey ||
    process.env.ANTHROPIC_API_KEY ||
    (process.env.SANDBOX_API_KEY && process.env.SANDBOX_API_KEY.startsWith('sk-ant-')
      ? process.env.SANDBOX_API_KEY
      : null);
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const model = ctxModel || process.env.PLAN_MODEL || 'claude-sonnet-4-20250514';

  const taskList = tasks
    .map((t, i) => `${i + 1}. ${t.title}\n   ${t.description.slice(0, 200)}`)
    .join('\n\n');
  const userMessage = [
    client ? `Target client: ${client}` : null,
    '',
    'PRD:',
    prdText.trim(),
    '',
    `Approved task plan (${tasks.length} task${tasks.length > 1 ? 's' : ''}):`,
    taskList,
  ]
    .filter((line) => line !== null)
    .join('\n');

  const resp = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!resp.ok) {
    throw new Error(`LLM ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  }
  const result = await resp.json();
  const text = (result.content?.[0]?.text || '').trim();
  if (!text) throw new Error('empty LLM response');

  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  const bare = !fenced && text.startsWith('{') ? text : null;
  const raw = fenced ? fenced[1] : bare;
  if (!raw) throw new Error(`missing JSON block: ${text.slice(0, 120)}`);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`JSON parse failed: ${err.message}`);
  }
  const strategy = parsed?.strategy;
  if (!STRATEGY_IDS.includes(strategy)) {
    throw new Error(`invalid strategy: ${strategy}`);
  }
  const rationale_ko =
    typeof parsed?.rationale_ko === 'string'
      ? parsed.rationale_ko.trim().slice(0, 200)
      : '';
  return { strategy, rationale_ko };
}
