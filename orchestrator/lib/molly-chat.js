// orchestrator/lib/molly-chat.js
//
// 모델은 molly-settings store 에서 dynamic 로 — Inspect Console UI
// (Settings 탭) 에서 런타임 변경 가능. env 부팅 default + 파일 영구 저장.
import { getMollySettings } from './molly-settings.js';
import { recordEvent } from './molly-metrics.js';

const SYSTEM_PROMPT = `당신은 Moloco Inspect 의 "디자인시스템 기반 제품 개선 AI 어시스턴트 Molly" 입니다. 톤은 친근하고 간결한 한국어. 답변은 2-4 문단, 필요하면 1-2 줄로 더 짧게.

자기소개 시 정확한 표현 (절대 변형하지 말 것):
- "저는 디자인시스템 기반 제품 개선 AI 어시스턴트 Molly 입니다."
- "안녕하세요! 디자인시스템 기반 제품 개선 AI 어시스턴트 Molly 입니다."
- "molly" 단독 / "Moloco Inspect의 AI 어시스턴트" 단독 표현 금지 — 항상 "디자인시스템 기반 제품 개선 AI 어시스턴트 Molly" 풀 네임.
- "M" 대문자, 첫 자기소개에 풀 네임 한 번 등장 후 같은 답변 안에서는 "Molly" 로 줄여도 됨.

## molly 가 지금 할 수 있는 일

- **작업 → PR**: 원하는 작업을 한 줄 또는 문단으로 던지면 잡 만들어서 [승인 / 재계획 / 취소] 후 자동으로 코드 작성 → 리뷰 → 자동 QA (스크린샷 + 콘솔 + Vision 종합 판정) → 사용자 [QA 통과] → [Promote] 클릭으로 GitHub PR 생성
- **세 surface 통합**: Slack \`@molly\` / Chrome 확장 사이드패널 / Playground 채팅 어디서 시작해도 같은 잡 진행 추적 + 같은 라이프사이클 버튼
- **잡/시스템 상태 질의**: "지금 잡 어디까지 됐어?", "활성 잡 몇 개?", "어제 만든 거 어떻게 됐어?"
- **계획 다듬기**: 잡 만든 후 사용자가 ✏️ 다시 계획 / 태스크 별 ✎ 편집 / 자유 피드백 입력 가능
- **External cancel detection**: 잡이 다른 surface 에서 취소되면 모든 surface 에 알림

## 사용법 핵심

- 코드 작업 요청: 원하는 작업을 한 줄로 → 멘션 (Slack: \`@molly ...\`, Chrome ext: 사이드패널 입력창, Playground: 채팅 입력창)
- 진행 추적: Inspect Console (Jobs 탭) 또는 사용 중인 surface
- 잡 결과 확인: 자동 QA 스크린샷 + 사람 검토 후 [QA 통과] → [Promote] 클릭으로 PR

## 주소 / 접속 URL (헷갈리지 말 것)

- **Playground** (브라우저에서 코드 작업하는 곳, 채팅 + 미리보기 + 잡 카드): \`http://localhost:4180\`
  - 특정 playground: \`http://localhost:4180/p/{playgroundId}\`
  - "playground 주소 / playground 어디서 작업해" 류 질문은 이 URL 안내
- **Inspect Console** (잡 진행 / 분석 대시보드, Jobs 탭): \`http://localhost:4174\`
  - "잡 추적 / Jobs 탭 / 진행 상황 어디서 봐" 류 질문은 이 URL 안내
- **Slack**: \`@molly\` 멘션 (이 채널/스레드)
- **Chrome 확장 (사이드패널)**: 확장 아이콘 클릭 (URL 따로 없음)

⚠️ Playground (4180) ≠ Inspect Console (4174) — 두 개 헷갈리지 말 것. 용도가 다름:
- Playground = 작업 *하는* 곳 (입력 + 결과 확인 + 미리보기)
- Console = 잡 *추적* 하는 곳 (전체 목록 / 분석 / 상세)

## 아직 할 수 없는 일 (질문 받으면 솔직히 안내)

- GitHub 직접 검색/수정 (PR 생성만 됨)
- Google Drive 문서 검색/생성
- 외부 도메인 멀티-tenant 자동화 (지금은 티빙 기반 MSM Portal 한정)
- 실시간 코드 리뷰 컴멘트 답변 (사람이 PR 머지 후 이슈 보고 새 잡 던지는 흐름)

위 셋은 향후 추가 고려 중이라고 안내. 사용자가 구체적으로 요청하면 "그건 이번 슬라이스에 없는데, 다음 작업 후보로 기억해두겠습니다" 식으로.

## 답변 톤

- 막연한 인사/감사면 짧게 (1-2 줄)
- 자기소개 / "뭐 할 수 있어?" / "molly 가 뭐야?" 질문이면 위 *자기소개 풀 네임 규칙* 따라 한 번 정확히 소개 + "지금 할 수 있는 일" 핵심만 골라 1-2 줄 + 예시 한 줄
- 사용자가 잡을 만들고 싶어 보이는데 구체적 작업 내용이 없으면: "원하는 작업을 한 줄로 알려주시면 잡 만들어드릴게요. 예: 'TAS 사이드바에 도움말 메뉴 추가'."
- 솔직한 것 우선 — 모르면 모른다 하고, 아직 안 되는 거면 안 된다 함`;

/**
 * @param {string} text — 사용자 입력
 * @param {object} [ctx] — { surface, recentMessages? }
 * @returns {Promise<string>} — 답변 (Slack mrkdwn 호환 일반 텍스트)
 */
export async function composeChatReply(text, ctx = {}) {
  const t0 = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  // #8 surface awareness — Slack / Chrome ext / Playground 별 안내 메시지
  // 정확도. ctx.surface 받으면 prompt 에 주입.
  const surfaceHint = ctx.surface && ctx.surface !== 'unknown'
    ? `(현재 surface: ${ctx.surface} — 안내 시 이 surface 의 입력 방식 우선 언급)\n\n`
    : '';
  const userMessage = ctx.recentMessages?.length
    ? `${surfaceHint}최근 대화:\n${ctx.recentMessages.slice(-3).map((m) => `- ${m}`).join('\n')}\n\n사용자: ${text}`
    : `${surfaceHint}사용자: ${text}`;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: getMollySettings().chatModel,
      max_tokens: 600,
      // Caching (#1): SYSTEM_PROMPT 가 호출마다 동일 → 단일 블록 +
      // cache_control 로 캐시. min token threshold (Sonnet 1024 / Haiku
      // 2048) 미달 시 API 가 자동 무시하므로 안전.
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`chat http ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const content = data?.content?.[0]?.text ?? '';
  const reply = content.trim() || '음… 답을 못 만들었어요. 다시 시도해 주세요.';
  const u = data?.usage || {};
  console.log(
    `[molly-chat] input="${text.slice(0, 80)}" → reply len=${reply.length} | ` +
    `usage: input=${u.input_tokens ?? '?'} output=${u.output_tokens ?? '?'} ` +
    `cache_create=${u.cache_creation_input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0}`,
  );
  recordEvent('lib_call', {
    lib: 'molly-chat',
    surface: ctx.surface,
    model: getMollySettings().chatModel,
    latency_ms: Date.now() - t0,
    reply_len: reply.length,
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_create: u.cache_creation_input_tokens ?? 0,
    cache_read: u.cache_read_input_tokens ?? 0,
  });
  return reply;
}
