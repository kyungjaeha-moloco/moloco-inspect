// orchestrator/lib/molly-prd-analyzer.js
//
// 모델 + thinking budget 은 molly-settings store 에서 dynamic. UI 변경
// 즉시 반영 (재시작 X).
import { getMollySettings } from './molly-settings.js';
import { recordEvent } from './molly-metrics.js';

const SYSTEM_PROMPT = `당신은 molly 의 PRD 명확도 검사자입니다. 사용자가 코드 작업을 요청하는 PRD 를 받아 그 작업을 *지금 바로 시작할 만큼 명확한지* 판정합니다.

판정 결과 (반드시 JSON 만):
{
  "clarity": "clear" | "ambiguous",
  "clarifyingQuestion": "<모호 시 1 문장 한국어 질문, 명확하면 빈 문자열>",
  "missingInfo": ["<예: target page>", "<예: target component>", ...]
}

명확 (clear) 기준 — 다음 모두 만족:
- 어떤 페이지/컴포넌트/파일을 바꿀지 명시 또는 추론 가능 (예: "TAS 사이드바", "MCMainLayoutHeader.tsx")
- 어떤 변경 (추가 / 수정 / 삭제 / 색상 / 텍스트 / 레이아웃) 인지 명시
- 결과물 모양이 한 줄로 그려지는 수준 ("BETA 라벨" / "도움말 메뉴" 등)

모호 (ambiguous) 기준 — 다음 중 하나라도 해당:
- target 페이지/컴포넌트 모름 ("어디" 가 비어있음)
- 변경 종류 모름 ("뭐를" 이 비어있음)
- "개선해줘", "더 좋게" 같은 가치 판단형 모호 PRD
- 비슷한 후보가 여러 개 있어 실제로 어느 것 손댈지 결정 못 함

clarifyingQuestion 작성 규칙:
- 한 번에 하나만 물음 (멀티-Q 안 됨)
- 명확하면 빈 문자열
- 한국어, 친근한 톤, 1-2 문장

누적 컨텍스트 모드:
- 입력에 "이전 대화" 가 함께 주어지면 — 사용자가 이전 clarifying question 의 답을 한 것입니다.
- 이전 PRD + 모든 답변을 합쳐서 *지금 작업 시작할 만큼 명확한지* 판정합니다.
- 답변이 부분적이고 여전히 모호하면 다음 clarifying Q (한 번에 하나만, 이미 답한 것 다시 묻지 말 것).
- 누적해서 명확해졌으면 clarity=clear 반환. 빈 clarifyingQuestion.`;

/**
 * @param {string} text — 사용자 PRD 본문 (mention strip 등 cleanup 후)
 * @param {object} [ctx] — { surface }
 * @returns {Promise<{clarity: 'clear'|'ambiguous', clarifyingQuestion: string, missingInfo: string[]}>}
 */
export async function analyzePrdClarity(text, ctx = {}) {
  const t0 = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  // Sub-phase B.1 — history 있으면 cumulative 컨텍스트로 분석. 사용자가
  // 이전 clarifying Q 의 답을 한 시나리오. 모든 user turn + 이번 답변
  // 합쳐서 system prompt 의 "누적 컨텍스트 모드" 가 작동.
  const history = Array.isArray(ctx.history) ? ctx.history : [];
  let userMessage;
  if (history.length > 0) {
    const turns = history
      .map((t) => `${t.role === 'user' ? '사용자' : 'molly'}: ${(t.content || '').slice(0, 500)}`)
      .join('\n');
    userMessage = `이전 대화:\n${turns}\n\n사용자의 현재 답변/추가 정보:\n${text}\n\n위 누적 컨텍스트로 PRD 가 이제 명확한지 판정해주세요.`;
  } else {
    userMessage = `PRD 후보:\n${text}\n\n분석해주세요.`;
  }
  const settings = getMollySettings();
  const thinkingBudget = settings.prdThinkingBudget;
  const useThinking = thinkingBudget > 0;
  // thinking 켜면 max_tokens 가 thinking + 응답 합 — 여유 있게.
  const maxTokens = useThinking ? thinkingBudget + 600 : 400;
  const reqBody = {
    model: settings.prdModel,
    max_tokens: maxTokens,
    // Caching (#1): SYSTEM_PROMPT (~700 tokens) cache_control. Sonnet
    // threshold ~1024 — borderline. API 가 자동 결정.
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMessage }],
  };
  if (useThinking) {
    reqBody.thinking = { type: 'enabled', budget_tokens: thinkingBudget };
  }
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(reqBody),
    // thinking 켜면 latency 증가 (~3-10s) — timeout 도 늘림.
    signal: AbortSignal.timeout(useThinking ? 45000 : 15000),
  });
  if (!resp.ok) {
    // 분석 실패 = clear 폴백 (잡 진행 — molly 의 안전 디폴트와 반대.
    // 이유: clarify 가 잘못 fail 하면 사용자가 답답한 무한 루프.
    // 실제 잡 만들고 task review 가 잡아내는 게 차라리 빠름).
    console.warn(`[prd-analyzer] http ${resp.status} — fallback clear`);
    return { clarity: 'clear', clarifyingQuestion: '', missingInfo: [] };
  }
  const data = await resp.json();
  // thinking 켜면 content[0] 가 thinking block. 첫 text block 만 골라야 함.
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const textBlock = blocks.find((b) => b?.type === 'text');
  const content = textBlock?.text ?? '';
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1) {
    return { clarity: 'clear', clarifyingQuestion: '', missingInfo: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch {
    return { clarity: 'clear', clarifyingQuestion: '', missingInfo: [] };
  }
  const clarity = parsed?.clarity === 'ambiguous' ? 'ambiguous' : 'clear';
  const clarifyingQuestion = typeof parsed?.clarifyingQuestion === 'string' ? parsed.clarifyingQuestion.slice(0, 300) : '';
  const missingInfo = Array.isArray(parsed?.missingInfo) ? parsed.missingInfo.slice(0, 5).map(String) : [];
  const u = data?.usage || {};
  console.log(
    `[prd-analyzer] input="${text.slice(0, 80)}" → clarity=${clarity} q="${clarifyingQuestion.slice(0, 60)}" | ` +
    `usage: input=${u.input_tokens ?? '?'} output=${u.output_tokens ?? '?'} ` +
    `cache_create=${u.cache_creation_input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0}`,
  );
  recordEvent('lib_call', {
    lib: 'prd-analyzer',
    surface: ctx.surface,
    model: settings.prdModel,
    latency_ms: Date.now() - t0,
    clarity,
    thinking: useThinking,
    thinking_budget: useThinking ? thinkingBudget : 0,
    has_history: history.length > 0,
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
  });
  return { clarity, clarifyingQuestion, missingInfo };
}
