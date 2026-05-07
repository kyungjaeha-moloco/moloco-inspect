// orchestrator/lib/molly-classifier.js
import { getMollySettings } from './molly-settings.js';
import { recordEvent } from './molly-metrics.js';

const SYSTEM_PROMPT = `당신은 molly 의 분류기입니다. 사용자가 보낸 메시지를 다음 넷 중 하나로 분류하세요:

1. **code_change** — 코드/UI/디자인 을 추가/변경/제거해달라는 요청. 페이지/컴포넌트/기능 작업 지시. 보통 명령형, 결과물 묘사. 예: "TAS 사이드바에 도움말 추가", "버튼을 빨강으로 바꿔줘".
2. **lifecycle_action** — 기존 잡 에 대한 액션 명령 (cancel / 취소해 / promote / 다시 시도 / 재시도 / restart / 복구 / 롤백). 잡 ID 또는 "이 잡" 언급 + 명령형. 예: "이 잡 cancel 해줘", "dc1c2ccc 다시 시도해줘", "promote 진행해줘", "이 잡 취소해". *상태 질의는 아님.* (새 잡 만들지 않음, 기존 잡에 대한 액션 의도).
3. **status_query** — 기존 잡/플레이그라운드/시스템 상태 *질의* (의문/조회). 예: "지금 잡 어디까지 됐어?", "어제 만든 거 어떻게 됐어?", "이 잡 cancel 됐어?" (질문!), "활성 잡 몇 개?", "서버 잘 돌고 있어?".
4. **chat** — 그 외 대화. 인사 / 감사 / 자기소개 질의 / 사용법 / 개선 제안 / molly 능력 질의 / 외부 도구 가능성 질의 / **정보 조회·탐색 질의** ("X 보여줘", "어떤 X 있어?", "X 목록 알려줘", "X 정리해줘", "X 가 뭐야?"). 예: "안녕", "molly 가 뭐야?", "GitHub 도 검색할 수 있어?", "디자인시스템 컴포넌트 목록 보여줘", "어떤 페이지가 있는지 알려줘".

응답 형식 (반드시 JSON 만):
{"kind": "code_change" | "lifecycle_action" | "status_query" | "chat", "reason": "<한 줄 한국어>"}

규칙:
- 애매하면 안전한 쪽 = **chat** (잡 안 만드는 게 부작용 0). code_change 는 *명백히* 새 코드 작업 지시일 때만.
- 길이 < 10자 인 경우 거의 chat 또는 status_query 또는 lifecycle_action.
- "어디까지", "됐어?", "어떻게 됐어?", "끝났어?", "활성", "상태" 의문 → status_query.
- **lifecycle 키워드** ("cancel/취소/promote/다시 시도/재시도/restart/복구/롤백") + 명령형 (의문 X) → **lifecycle_action**. 잡 ID 또는 "이 잡" 명시 또는 추론 가능 시 더 명백.
  - 예: "이 잡 cancel 해줘" = lifecycle_action (명령)
  - 예: "이 잡 cancel 됐어?" = status_query (질문)
- "추가/수정/변경/만들어/바꿔" + 구체적 *코드/UI 대상* (페이지/컴포넌트/파일) → code_change. 단 위 lifecycle 키워드 우선.
- "할 수 있어?", "가능해?", "지원해?" 능력 질의 → chat.
- **정보 조회 우선 규칙** — "보여줘 / 알려줘 / 정리해줘 / 뭐가 있어? / 어떤 X / 목록 / 리스트" 류는 **chat** (코드 변경 아님, 단순 조회). 예: "디자인시스템 컴포넌트 목록 보여줘" = chat (조회), "디자인시스템 컴포넌트 페이지 만들어줘" = code_change (생성). "보여줘" 가 명백히 *새 UI 추가* 를 의미할 때만 (예: "TAS 메인에 환영 배너 보여줘") code_change.`;

/**
 * @param {string} text — 사용자 입력 (멘션 텍스트 stripped 등 cleanup 된 상태)
 * @param {object} [ctx] — { surface: 'slack'|'chrome-ext', recentMessages?: [...] }
 * @returns {Promise<{kind: 'code_change'|'status_query'|'chat', reason: string}>}
 */
// #5 fast-path heuristic — LLM 호출 우회. conservative (애매하면 안 잡고
// classifier 호출). 잘못 잡으면 사용자 경험 깨지니 명백한 경우만.
const GREETING_RE = /^(안녕(하세요)?[.!]?|hi|hello|hey|ㅎㅇ|반갑(습니다|네)?[.!]?|좋은\s?(아침|오후|저녁))[\s.!]*$/i;
const LIFECYCLE_FAST_RE = /^(cancel|취소|캔슬|promote|프로모트|다시\s?시도|재시도|retry|restart|재시작|복구|롤백|rollback)[\s_]*([a-f0-9]{8,})?[\s.!]*$/i;

function fastPathClassify(text) {
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
  const userMessage = ctx.recentMessages?.length
    ? `최근 대화:\n${ctx.recentMessages.slice(-3).map((m) => `- ${m}`).join('\n')}\n\n분류할 메시지:\n${text}`
    : `분류할 메시지:\n${text}`;

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
  if (!['code_change', 'lifecycle_action', 'status_query', 'chat'].includes(parsed?.kind)) {
    return { kind: 'chat', reason: `classifier returned invalid kind="${parsed?.kind}", defaulting to chat` };
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
 * PRD-like 휴리스틱 — 길이 > 80자 AND 명령형 키워드 2개 이상.
 * 명백한 chat (짧은 인사, 감사) 은 nudge 안 함.
 */
function looksLikePrd(text) {
  if (!text || text.length < 80) return false;
  const PRD_KEYWORDS = ['추가', '수정', '변경', '만들어', '바꿔', '구현', '도입', 'PRD', 'TAS', '페이지'];
  let hits = 0;
  for (const kw of PRD_KEYWORDS) {
    if (text.includes(kw)) hits++;
    if (hits >= 2) return true;
  }
  return false;
}
