# Unified intake — orchestrator 가 surface 무관 entry point — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** 모든 surface (Slack / Chrome ext / Playground / curl / future) 가 동일한 entry point 를 통해 PRD/요청을 보내고, **orchestrator 가 메시지 특성을 분석해 처리 경로 (chat / status / clarify / atomic-execute / decompose-job / epic-split) 를 결정**하는 통합 구조.

**Architecture (3 phase):**
- **Phase 1**: 기존 `/api/molly/respond` 에 PRD 명확도 체크 추가 — 모호한 PRD 면 clarifying Q 반환. Slack/Chrome ext 도 Wizard 처럼 clarify 가능. **Surface 단위 분기 그대로 유지**.
- **Phase 2**: `/api/intake` 통합 라우트 도입. classify + clarity + size 분석을 한 번에. 처리 경로 결정 후 surface 가 알맞게 렌더.
- **Phase 3**: Surface refactor — 모든 surface 가 `/api/intake` 만 호출. `/api/chat` (Wizard) deprecate. 기존 endpoint 들은 alias 로 유지 (backward compat).

**Tech Stack:** Node http, fetch, Anthropic API. orchestrator-side 추가 lib (분석기 + 라우터). 기존 lib (classifier / chat / status) 재사용.

---

## File Structure

### Phase 1
- **Create:** `orchestrator/lib/molly-prd-analyzer.js` — `analyzePrdClarity(text, ctx) → {clarity, clarifyingQuestion?}`. Sonnet 1 호출, 명확/모호 판정 + 모호 시 한 줄 clarifying Q.
- **Modify:** `orchestrator/lib/molly.js` — handleMention 의 code_change 분기 진입 직전, clarity 체크. 모호 시 thread reply 로 Q + 잡 안 만듦.
- **Modify:** `orchestrator/server.js` — `/api/molly/respond` 의 code_change 분기 응답에 `clarity` / `clarifyingQuestion` 추가.
- **Modify:** `chrome-extension/sidepanel.js` — `/api/molly/respond` 응답 처리 시 `clarifyingQuestion` 있으면 답변 카드로 surface, 잡 안 만듦.

### Phase 2
- **Create:** `orchestrator/lib/molly-intake.js` — `processIntake(text, ctx) → IntakeResult`. classify + clarity + size 분석을 통합 wrapper. 내부적으로 기존 lib 들 호출.
- **Create:** `orchestrator/server.js` 안의 `/api/intake` 라우터 — `processIntake` 호출 후 결과 그대로 응답.
- **Modify:** `/api/molly/respond` 라우터 — `/api/intake` 로 redirect 또는 동일 lib 호출 (backward compat).

### Phase 3
- **Modify:** `playground-app/src/editor/AIPanel.tsx` — `postChat` 호출 자리에서 `postIntake` 로 교체. clarifying / plan_emit / job_create 분기 처리.
- **Modify:** `playground-app/src/services/orchestrator-client.ts` — `postIntake` 신규 export. 기존 `postChat` 은 deprecated 표시.
- **Modify:** `chrome-extension/sidepanel.js` — `/api/molly/respond` → `/api/intake` 로 endpoint 만 변경 (응답 shape 유사).
- **Modify:** `orchestrator/lib/molly.js` — handleMention 이 `processIntake` lib 직접 호출 (HTTP 우회 안 함, 같은 process 라).

---

## Phase 1 — PRD 명확도 체크 (1-2 일)

### Task 1.1: `molly-prd-analyzer.js` 생성

**Files:**
- Create: `orchestrator/lib/molly-prd-analyzer.js`

- [ ] **단일 export 함수 + Sonnet 호출**

```js
// orchestrator/lib/molly-prd-analyzer.js
const PRD_MODEL = process.env.MOLLY_PRD_MODEL || 'claude-sonnet-4-20250514';

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
- 한국어, 친근한 톤, 1-2 문장`;

/**
 * @param {string} text — 사용자 PRD 본문 (mention strip 등 cleanup 후)
 * @param {object} [ctx] — { surface }
 * @returns {Promise<{clarity: 'clear'|'ambiguous', clarifyingQuestion: string, missingInfo: string[]}>}
 */
export async function analyzePrdClarity(text, ctx = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const userMessage = `PRD 후보:\n${text}\n\n분석해주세요.`;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: PRD_MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    // 분석 실패 = clear 폴백 (잡 진행 — molly 의 안전 디폴트와 반대.
    // 이유: clarify 가 잘못 fail 하면 사용자가 답답한 무한 루프.
    // 실제 잡 만들고 task review 가 잡아내는 게 차라리 빠름).
    console.warn(`[prd-analyzer] http ${resp.status} — fallback clear`);
    return { clarity: 'clear', clarifyingQuestion: '', missingInfo: [] };
  }
  const data = await resp.json();
  const content = data?.content?.[0]?.text ?? '';
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
  console.log(`[prd-analyzer] input="${text.slice(0, 80)}" → clarity=${clarity} q="${clarifyingQuestion.slice(0, 60)}"`);
  return { clarity, clarifyingQuestion, missingInfo };
}
```

- [ ] **node --check syntax 확인**
- [ ] **단일 합성 테스트 (script):**

```bash
ANTHROPIC_API_KEY=... node -e "
import('./orchestrator/lib/molly-prd-analyzer.js').then(async m => {
  console.log(await m.analyzePrdClarity('TAS 사이드바에 BETA 라벨 추가'));
  console.log(await m.analyzePrdClarity('개선해줘'));
});
"
```
expect: 첫번째 = clear, 둘째 = ambiguous.

### Task 1.2: Slack handleMention 분기 추가

**Files:**
- Modify: `orchestrator/lib/molly.js` (`handleMention` 의 code_change 진입 직전)

- [ ] **Classifier 가 code_change 반환 후, 첫 번째 PRD 인 경우 PRD analyzer 호출**

```js
// 분류 결과가 code_change 면, PRD 명확도 체크 추가
if (cls.kind === 'code_change') {
  let analysis;
  try {
    const { analyzePrdClarity } = await import('./molly-prd-analyzer.js');
    analysis = await analyzePrdClarity(text, { surface: 'slack' });
  } catch (err) {
    logger.warn(`[molly] prd analyzer failed: ${err.message} — proceeding`);
    analysis = { clarity: 'clear', clarifyingQuestion: '', missingInfo: [] };
  }
  if (analysis.clarity === 'ambiguous' && analysis.clarifyingQuestion) {
    // 모호 → 잡 안 만들고 clarifying Q 만 thread reply
    if (thinkingTs) {
      try { await client.chat.delete({ channel: event.channel, ts: thinkingTs }); } catch {}
    }
    await say({
      thread_ts: threadTs,
      text: `🤔 ${analysis.clarifyingQuestion}`,
    });
    return;
  }
  // 명확 → 기존 흐름 (createJob ...)
}
```

- [ ] **순서**: classifier → PRD analyzer (code_change 만) → ambiguous 면 reply, clear 면 createJob
- [ ] **node --check syntax 확인**

### Task 1.3: server.js `/api/molly/respond` 응답 확장

**Files:**
- Modify: `orchestrator/server.js`

- [ ] **code_change 분기에서 clarity 분석 추가**

```js
// code_change 분기 — clarity 분석 후 결과에 따라 응답 다름
if (kind === 'code_change') {
  try {
    const { analyzePrdClarity } = await import('./lib/molly-prd-analyzer.js');
    const analysis = await analyzePrdClarity(text, ctx);
    return json(res, 200, {
      ok: true,
      kind,
      reason,
      clarity: analysis.clarity,
      clarifyingQuestion: analysis.clarifyingQuestion,
      missingInfo: analysis.missingInfo,
    });
  } catch (err) {
    // 분석 실패 = 기존 동작 (clear 폴백)
    return json(res, 200, { ok: true, kind, reason, clarity: 'clear', clarifyingQuestion: '', missingInfo: [] });
  }
}
```

(chat / status_query 분기는 그대로)

### Task 1.4: Chrome ext sidepanel 응답 처리

**Files:**
- Modify: `chrome-extension/sidepanel.js` (`performSubmit` 의 classifier fetch 응답 처리)

- [ ] **kind=code_change + clarity=ambiguous 면 답변 카드로 surface 후 return**

```js
if (r.ok) {
  const data = await r.json();
  const kind = data?.kind;
  if (kind === 'chat' || kind === 'status_query') {
    addMollyChatMessage(data.response || '(빈 응답)', kind);
    return;
  }
  // code_change + ambiguous → clarifying Q 만 surface, 잡 안 만듦
  if (kind === 'code_change' && data?.clarity === 'ambiguous' && data?.clarifyingQuestion) {
    addMollyChatMessage(`🤔 ${data.clarifyingQuestion}`, 'clarify');
    return;
  }
  // code_change + clear → 기존 흐름 (job 생성)
}
```

### Task 1.5: 검증 + commit

- [ ] **수동 테스트 3 케이스**:
  - Slack 에서 "TAS 사이드바 BETA 라벨" → 잡 만들어짐 (clear)
  - Slack 에서 "개선해줘" → clarifying Q 받음 (ambiguous)
  - Slack 에서 "안녕" → chat 답변 (classifier 단계에서 분기)

- [ ] **`node --check` 4 파일 (analyzer, molly, server, sidepanel)**

- [ ] **commit**:

```bash
git add orchestrator/lib/molly-prd-analyzer.js orchestrator/lib/molly.js orchestrator/server.js chrome-extension/sidepanel.js
git commit -m "$(cat <<'EOF'
feat(molly): PRD 명확도 체크 — Phase 1 of unified intake

사용자 결정: surface 무관 동일 처리. Phase 1 = Slack/Chrome ext 도
Wizard 처럼 모호한 PRD 에 clarifying Q 받게.

- 신규 lib molly-prd-analyzer.js — Sonnet 호출, clarity (clear|ambiguous)
  + clarifyingQuestion. 분석 실패 = clear 폴백 (잡 만들기 안 막음).
- molly.js handleMention 의 code_change 분기 진입 전 analyzer 호출.
  ambiguous 면 thread reply 만 + 잡 안 만듦.
- /api/molly/respond 응답에 clarity / clarifyingQuestion / missingInfo 추가.
- Chrome ext sidepanel 이 ambiguous 응답을 답변 카드로 surface (잡 안 만듦).

다음 phase 2-3 은 unified plan (docs/superpowers/plans/2026-04-30-unified-intake.md) 참조.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — `/api/intake` 통합 라우트 (1 주)

### Task 2.1: `molly-intake.js` 라이브러리

**Files:**
- Create: `orchestrator/lib/molly-intake.js`

- [ ] **`processIntake(text, ctx) → IntakeResult` 단일 함수**

```js
// orchestrator/lib/molly-intake.js
import { classifyMollyText } from './molly-classifier.js';
import { composeChatReply } from './molly-chat.js';
import { composeStatusReply } from './molly-status.js';
import { analyzePrdClarity } from './molly-prd-analyzer.js';

/**
 * @typedef {object} IntakeResult
 * @property {'chat'|'status_query'|'code_change_clear'|'code_change_ambiguous'} kind
 * @property {string} reason
 * @property {string} [response]  // chat / status_query
 * @property {string} [clarifyingQuestion]  // code_change_ambiguous
 * @property {string[]} [missingInfo]  // code_change_ambiguous
 * @property {object} [meta]  // 향후 size/scope 분석 등
 */

export async function processIntake(text, ctx = {}) {
  const cls = await classifyMollyText(text, ctx);
  if (cls.kind === 'chat') {
    const response = await composeChatReply(text, ctx);
    return { kind: 'chat', reason: cls.reason, response };
  }
  if (cls.kind === 'status_query') {
    const response = await composeStatusReply(text, ctx);
    return { kind: 'status_query', reason: cls.reason, response };
  }
  // code_change → PRD analyzer
  const analysis = await analyzePrdClarity(text, ctx);
  if (analysis.clarity === 'ambiguous') {
    return {
      kind: 'code_change_ambiguous',
      reason: cls.reason,
      clarifyingQuestion: analysis.clarifyingQuestion,
      missingInfo: analysis.missingInfo,
    };
  }
  return {
    kind: 'code_change_clear',
    reason: cls.reason,
  };
}
```

### Task 2.2: `/api/intake` 라우터

**Files:**
- Modify: `orchestrator/server.js`

- [ ] **신규 라우터 + 기존 `/api/molly/respond` 도 동일 lib 호출 (alias 유지)**

```js
if (pathname === '/api/intake' && req.method === 'POST') {
  try {
    const { processIntake } = await import('./lib/molly-intake.js');
    const payload = await parseBody(req);
    const text = String(payload?.text ?? '').trim();
    if (!text) return json(res, 400, { ok: false, error: 'text required' });
    const ctx = {
      surface: payload?.surface || 'unknown',
      recentMessages: Array.isArray(payload?.recentMessages) ? payload.recentMessages : [],
      channel: payload?.channel,
      threadTs: payload?.threadTs,
      listJobs,
      getJob,
    };
    const result = await processIntake(text, ctx);
    return json(res, 200, { ok: true, ...result });
  } catch (err) {
    return json(res, 500, { ok: false, error: err?.message ?? String(err) });
  }
}
```

기존 `/api/molly/respond` 는 동일 코드로 wrap 하거나 그대로 두기 (Phase 3 에서 deprecate).

### Task 2.3: 검증 + commit

- [ ] **curl 3 케이스 — `/api/intake` 가 4 종 kind 모두 반환:**
  - "안녕" → kind=chat
  - "지금 잡 어디까지" → kind=status_query
  - "TAS 사이드바 BETA" → kind=code_change_clear
  - "개선해줘" → kind=code_change_ambiguous + clarifyingQuestion
- [ ] **commit**

---

## Phase 3 — Surface refactor (1 주)

### Task 3.1: Playground AIPanel — `/api/chat` → `/api/intake`

**Files:**
- Modify: `playground-app/src/services/orchestrator-client.ts`
- Modify: `playground-app/src/editor/AIPanel.tsx`

기존 `postChat` 은 multi-turn Wizard 인데 `/api/intake` 는 single-turn. **문제**:
- Wizard 의 multi-turn clarification (사용자 답변 → 또 다른 Q → 결국 plan emit) 을 어떻게 통합?

선택지:
- **A. multi-turn 도 `/api/intake` 안에서 처리** — payload 에 `history` 추가, server 가 누적 컨텍스트 보고 다음 Q / plan 결정. 사실상 `/api/chat` 의 기능 흡수.
- **B. /api/chat 유지 + intake 와 chain** — surface 가 첫 턴은 intake, 후속 턴은 chat.

→ **A 권장** (진정한 통합).

- [ ] **`postIntake(text, ctx)` + `postIntakeWithHistory(messages)` 두 export**
- [ ] **AIPanel sendPrompt — 첫 턴 / 후속 턴 분기**:
  - 첫 턴: `postIntake` 호출 — 결과 종류별 분기
  - 후속 턴: messages 누적해서 `postIntakeWithHistory` (Wizard ceremony 흐름과 동일)
- [ ] **plan_emit 결과 처리 — Wizard 의 plan_items[] 형태를 `code_change_clear` 의 plan 필드로 returning** — server 의 processIntake 가 multi-turn 시 plan emit 까지 처리하게 확장

### Task 3.2: Chrome ext — `/api/molly/respond` → `/api/intake`

**Files:**
- Modify: `chrome-extension/sidepanel.js`

- [ ] **endpoint 만 swap. 응답 shape 동일 (kind 4 종)**.
- [ ] **code_change_clear → 기존 Job pipeline. code_change_ambiguous → 답변 카드.**

### Task 3.3: Slack handleMention — lib 직접 호출

**Files:**
- Modify: `orchestrator/lib/molly.js`

- [ ] **Phase 1 의 분기 (classifier + analyzer 별개) → `processIntake` 단일 호출**
- [ ] **결과 kind 별 분기 (chat / status / code_change_ambiguous / code_change_clear)**

### Task 3.4: `/api/chat` deprecate

**Files:**
- Modify: `orchestrator/server.js`

- [ ] **`/api/chat` 라우터에 deprecation 헤더 추가** + log warn. 동작은 그대로.
- [ ] **README / handoff 에 deprecation 명시. 추후 슬라이스에서 삭제.**

### Task 3.5: 통합 회귀 테스트 + handoff + commit

- [ ] **3 surface (Slack / Chrome ext / Playground) E2E 검증**
- [ ] **handoff doc 작성**
- [ ] **commit (분리하거나 묶거나)**

---

## Self-Review

- [x] Phase 1 / 2 / 3 단계적 — 각 phase 끝나면 ship 가능
- [x] Backward compat — 기존 endpoint (`/api/chat`, `/api/molly/respond`) 는 alias 또는 deprecation 으로 유지
- [x] Surface 별 분기는 transport 만 — 처리 로직은 orchestrator 가 단일 source
- [x] Wizard 의 multi-turn 기능도 통합 (Task 3.1 의 옵션 A)
- [x] PRD analyzer 가 code_change 만 거치고 chat / status 는 거치지 않음 (성능)

## 예상 시간

- Phase 1 (Task 1.1~1.5): ~1.5~2 일 (~5-6h 코딩 + 검증)
- Phase 2 (Task 2.1~2.3): ~3-5 일 (~1 주)
- Phase 3 (Task 3.1~3.5): ~5-7 일 (~1 주)
- **합계**: ~2-3 주 분량. 단계적으로 실행 + 사이사이 운영 데이터 보면서 조정.

## 주의사항

1. **PRD analyzer 는 code_change 만 거침** — chat / status 는 미통과. Phase 1 이 Slack 만 적용한 게 아니라 모든 surface 의 code_change 입력에 적용.
2. **Multi-turn 통합 (Phase 3 Task 3.1)** — 가장 어려운 piece. Wizard 의 plan_items[] emit 흐름을 `processIntake` 안에 흡수해야 함. processIntake 가 history 받으면 multi-turn 처리, 없으면 single-turn 처럼.
3. **Backward compat 약속** — `/api/chat` 와 `/api/molly/respond` 는 Phase 3 직후 삭제 X. 별도 deprecation cycle (~분기) 후 삭제.
4. **PRD analyzer 의 모호 폴백** — http 실패 / parse 실패 / 분석 timeout 시 무조건 `clarity=clear` 폴백. molly chat mode 의 fallback 정책 (chat 폴백) 과 *반대* — clarify 가 잘못 fail 하면 사용자가 답답한 무한 루프. 잡 만들고 task review 가 잡아내는 게 차라리 빠름.
5. **운영 데이터 수집** — Phase 1 후 1-2 주 동안 clarity=ambiguous 비율 로깅 → 너무 많으면 prompt 보수적 조정.
