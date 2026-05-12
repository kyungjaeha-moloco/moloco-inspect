// orchestrator/lib/molly-classifier.js
import { getMollySettings } from './molly-settings.js';
import { recordEvent } from './molly-metrics.js';

export const SYSTEM_PROMPT = `You are Molly's classifier. The user may write in Korean or English; classify the message into exactly one category:

1. **code_change** — A request to add/change/remove code, UI, or design. Page/component/feature work instructions. Usually imperative, describing the desired outcome. Examples: "TAS 사이드바에 도움말 추가", "버튼을 빨강으로 바꿔줘", "Add a help item to the TAS sidebar".
2. **lifecycle_action** — A command to act on an existing job (cancel / 취소 / promote / 다시 시도 / 재시도 / retry / restart / 재시작 / 복구 / 롤백 / rollback). Mentions a job ID or "this job"/"이 잡" with an imperative. Examples: "이 잡 cancel 해줘", "dc1c2ccc 다시 시도해줘", "promote 진행해줘", "Cancel this job". *Not a status query.* (Does not create a new job; expresses an action intent on an existing one.)
3. **status_query** — A *question* about the state of an existing job/playground/system. Examples: "지금 잡 어디까지 됐어?", "어제 만든 거 어떻게 됐어?", "이 잡 cancel 됐어?" (a question!), "How many active jobs?", "Is the server running?".
4. **plan_feedback** — **Only when a plan card is currently pending.** Natural-language feedback tweaking that plan. Examples: "3번째 항목은 X 대신 Y 로", "2번 빼줘", "더 간단히", "Add the missing i18n key", "Make item 3 use Y instead of X". Not a new PRD/job intent — a *fine-grained adjustment to the current plan*. Never classify as plan_feedback if no plan card is pending.
5. **chat** — Anything else. Greetings / thanks / "who are you" / usage questions / suggestions / capability questions / external-tool questions / **information lookups and exploration** ("show me X", "what X is there?", "list X", "summarize X", "what is X?"). Examples: "안녕", "molly 가 뭐야?", "GitHub 도 검색할 수 있어?", "디자인시스템 컴포넌트 목록 보여줘", "어떤 페이지가 있는지 알려줘", "Hi", "What is Molly?".

Response format (JSON only):
{"kind": "code_change" | "lifecycle_action" | "status_query" | "plan_feedback" | "chat", "reason": "<one-line English reason>"}

Rules:
- When in doubt, the safe choice is **chat** (creating no job has zero side effects). Use code_change only when the message is *unambiguously* an instruction to write new code.
- Messages shorter than ~10 chars are almost always chat, status_query, or lifecycle_action.
- Question markers ("어디까지", "됐어?", "어떻게 됐어?", "끝났어?", "활성", "상태", "where", "how far", "is it done?", "finished?", "active", "status") → status_query.
- **Lifecycle keywords** ("cancel/취소/promote/다시 시도/재시도/restart/재시작/복구/롤백/rollback") + imperative (not a question) → **lifecycle_action**. Even more obvious when a job ID or "이 잡"/"this job" is mentioned or inferable.
  - Example: "이 잡 cancel 해줘" = lifecycle_action (command)
  - Example: "이 잡 cancel 됐어?" = status_query (question)
- "추가/수정/변경/만들어/바꿔" or "add/change/modify/create/replace" + a concrete *code/UI target* (page/component/file) → code_change. The lifecycle rule above takes precedence.
- Capability questions ("할 수 있어?", "가능해?", "지원해?", "Can you ...?", "Is it possible?") → chat.
- **Information-lookup priority rule** — "보여줘 / 알려줘 / 정리해줘 / 뭐가 있어? / 어떤 X / 목록 / 리스트 / show me / tell me / list / summarize / which X" → **chat** (a lookup, not a code change). Example: "디자인시스템 컴포넌트 목록 보여줘" = chat (lookup), "디자인시스템 컴포넌트 페이지 만들어줘" = code_change (creation). Use code_change for "보여줘"/"show me" only when it clearly means *adding new UI* (e.g., "TAS 메인에 환영 배너 보여줘").
- **plan_feedback priority rule** — If the context line marks "a plan card is currently pending", consider plan_feedback first. If the user message reads like a *current-plan adjustment* ("3번째", "2번", "item 3", "X instead of Y", "더 간단히", "빼줘", "추가해줘"), classify as plan_feedback. Exception: when it clearly *starts new work* ("이거 말고 다른 거 해줘", "새 페이지 만들어줘", "Forget that, do this instead"), classify as code_change (the user must cancel the existing plan separately).
- If no "plan card pending" marker is present, never classify as plan_feedback.`;

/**
 * @param {string} text — 사용자 입력 (멘션 텍스트 stripped 등 cleanup 된 상태)
 * @param {object} [ctx] — { surface: 'slack'|'chrome-ext'|'playground',
 *                           recentMessages?: [...],
 *                           hasPendingPlan?: boolean,  // plan 카드 pending 표시 — plan_feedback 분기 활성화
 *                           pendingPlanSummary?: string  // pending plan 의 한 줄 요약 (분류 정확도 ↑)
 *                         }
 * @returns {Promise<{kind: 'code_change'|'lifecycle_action'|'status_query'|'plan_feedback'|'chat', reason: string}>}
 */
// #5 fast-path heuristic — LLM 호출 우회. conservative (애매하면 안 잡고
// classifier 호출). 잘못 잡으면 사용자 경험 깨지니 명백한 경우만.
const GREETING_RE = /^(안녕(하세요)?[.!]?|hi|hello|hey|ㅎㅇ|반갑(습니다|네)?[.!]?|좋은\s?(아침|오후|저녁))[\s.!]*$/i;
const LIFECYCLE_FAST_RE = /^(cancel|취소|캔슬|promote|프로모트|다시\s?시도|재시도|retry|restart|재시작|복구|롤백|rollback)[\s_]*([a-f0-9]{8,})?[\s.!]*$/i;

export function fastPathClassify(text) {
  const trimmed = text.trim();
  if (trimmed.length < 12 && GREETING_RE.test(trimmed)) {
    return { kind: 'chat', reason: 'fast-path: greeting' };
  }
  if (LIFECYCLE_FAST_RE.test(trimmed)) {
    return { kind: 'lifecycle_action', reason: 'fast-path: lifecycle keyword' };
  }
  return null;
}

export async function classifyMollyText(text, ctx = {}) {
  // #5 fast-path — LLM 호출 전 cheap heuristic. 매칭 시 즉시 반환 (latency 0).
  const fast = fastPathClassify(text);
  if (fast) {
    console.log(`[molly-classifier] fast-path → kind=${fast.kind} reason="${fast.reason}"`);
    recordEvent('lib_call', {
      lib: 'molly-classifier',
      surface: ctx.surface,
      latency_ms: 0,
      kind: fast.kind,
      fastPath: true,
    });
    return fast;
  }
  const t0 = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const userMessage = buildClassifierUserMessage(text, ctx);

  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: getMollySettings().classifierModel,
        max_tokens: 200,
        // Caching (#1): 매 호출 거치는 핫패스 — system prompt 가 짧아도
        // (~500 tokens) cache_control 마커 둠. Haiku threshold (~2048)
        // 미달이면 API 자동 무시. 향후 prompt 확장 시 자동 캐시.
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return { kind: 'chat', reason: `classifier fetch failed: ${err.message?.slice(0, 80)}` };
  }
  if (!resp.ok) {
    return { kind: 'chat', reason: `classifier http error ${resp.status}` };
  }
  const data = await resp.json();
  const content = data?.content?.[0]?.text ?? '';
  // 응답에서 JSON 추출 — brace counting 으로 reason 안의 `}` 가 깨뜨리지
  // 않게. parse 실패 시 chat 으로 안전하게 폴백 (잡 안 만드는 게 부작용 0).
  const start = content.indexOf('{');
  if (start === -1) {
    return { kind: 'chat', reason: 'classifier produced no JSON, defaulting to chat' };
  }
  let depth = 0;
  let end = -1;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) {
    return { kind: 'chat', reason: 'classifier JSON unterminated, defaulting to chat' };
  }
  let parsed;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch (err) {
    return { kind: 'chat', reason: `classifier parse failed: ${err.message?.slice(0, 80)}, defaulting to chat` };
  }
  if (!['code_change', 'lifecycle_action', 'status_query', 'plan_feedback', 'chat'].includes(parsed?.kind)) {
    return { kind: 'chat', reason: `classifier returned invalid kind="${parsed?.kind}", defaulting to chat` };
  }
  // plan_feedback 안전망 — hasPendingPlan 이 false 인데 LLM 이 잘못 분류
  // 한 경우 chat 으로 downgrade (jobs 안 만드는 게 부작용 0).
  if (parsed.kind === 'plan_feedback' && !ctx.hasPendingPlan) {
    parsed.kind = 'chat';
    parsed.reason = `plan_feedback without pending plan — downgraded to chat. orig: ${parsed.reason || ''}`;
  }

  // PRD-like nudge — classifier 가 명백한 PRD-like 텍스트를 chat 으로
  // 잘못 분류한 경우 code_change 로 보정. 5 framework 의 "false-pass
  // 최소화" 정책. PRD 휴리스틱은 보수적으로 — 길이 > 80 자 + 명령형
  // 키워드 둘 이상 조건만 충족 시.
  let kind = parsed.kind;
  let reason = parsed.reason || '';
  if (kind === 'chat' && looksLikePrd(text)) {
    kind = 'code_change';
    reason = `chat → code_change (PRD-like heuristic): ${reason}`;
  }

  const u = data?.usage || {};
  console.log(
    `[molly-classifier] input="${text.slice(0, 80)}" → kind=${kind} reason="${reason.slice(0, 80)}" | ` +
    `usage: input=${u.input_tokens ?? '?'} output=${u.output_tokens ?? '?'} ` +
    `cache_create=${u.cache_creation_input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0}`,
  );
  recordEvent('lib_call', {
    lib: 'molly-classifier',
    surface: ctx.surface,
    model: getMollySettings().classifierModel,
    latency_ms: Date.now() - t0,
    kind,
    fastPath: false,
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_create: u.cache_creation_input_tokens ?? 0,
    cache_read: u.cache_read_input_tokens ?? 0,
  });
  return { kind, reason };
}

/**
 * Build the classifier's user message — recent context + pending plan hint +
 * the message to classify. Extracted for testability (label invariants).
 */
export function buildClassifierUserMessage(text, ctx = {}) {
  const lines = [];
  if (ctx.recentMessages?.length) {
    lines.push(`Recent conversation:\n${ctx.recentMessages.slice(-3).map((m) => `- ${m}`).join('\n')}`);
  }
  if (ctx.hasPendingPlan) {
    // plan 카드 떠있는 컨텍스트 — plan_feedback 분기 활성화. summary 첨부 시
    // classifier 가 "사용자 message 가 이 plan 의 항목 조정 같은가?" 판단에
    // 더 정확.
    const summaryLine = ctx.pendingPlanSummary
      ? ` (summary: ${String(ctx.pendingPlanSummary).slice(0, 200)})`
      : '';
    lines.push(`Context: **a plan card is currently pending**${summaryLine}.`);
  }
  lines.push(`Message to classify:\n${text}`);
  return lines.join('\n\n');
}

/**
 * PRD-like 휴리스틱 — 길이 > 80자 AND 명령형 키워드 2개 이상.
 * 명백한 chat (짧은 인사, 감사) 은 nudge 안 함.
 */
export function looksLikePrd(text) {
  if (!text || text.length < 80) return false;
  const PRD_KEYWORDS = ['추가', '수정', '변경', '만들어', '바꿔', '구현', '도입', 'PRD', 'TAS', '페이지'];
  let hits = 0;
  for (const kw of PRD_KEYWORDS) {
    if (text.includes(kw)) hits++;
    if (hits >= 2) return true;
  }
  return false;
}
