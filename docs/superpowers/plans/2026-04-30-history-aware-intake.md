# History-aware intake — Wizard multi-turn 흡수 + `/api/chat` deprecate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Date created:** 2026-04-30
**Estimated:** ~7d (~40h)
**Goal:** `processIntake(text, ctx)` 가 `ctx.history` 받아 multi-turn 처리. Wizard 의 plan_emit ceremony 통합. `/api/chat` deprecate.

**해결되는 문제:**
- D5 misclassify (Wizard 의 단답 "TVING" 이 chat 으로 분류) — prev=ambiguous 인지하면 정답
- 모든 surface 에서 multi-turn 가능 — Slack 에서도 clarifying Q ↔ 답 ↔ plan 흐름
- 2 평행 시스템 (`/api/chat`, `/api/intake`) 통합 — single source of truth

---

## Architecture

```
processIntake(text, ctx)  where  ctx = { history?, surface?, listJobs?, getJob?, channel?, threadTs? }
   │
   ├─ history 없음 또는 prev=terminal kind → 첫 턴 흐름 (기존 dispatcher)
   │
   └─ history 있음 → 직전 assistant.kind 별 routing
        │
        ├─ prev=chat / status_query  → 다음 turn 도 같은 path (composeChatReply / composeStatusReply 가 history 받게)
        │
        ├─ prev=code_change_ambiguous  → handleClarificationAnswer
        │     - cumulative PRD = history + text 합쳐서 prd-analyzer 다시 호출
        │     - 여전히 ambiguous → 다음 Q 반환
        │     - clear → emitPlan 호출 → kind=plan_emit + planItems[]
        │
        └─ prev=plan_emit  → handlePlanEdit
              - "이대로 진행" 류 → createJobFromPlan → kind=job_dispatched + jobId
              - 자유 피드백 → emitPlan 재호출 (피드백 반영)
```

**IntakeKind 확장:** `chat` | `status_query` | `code_change_clear` | `code_change_ambiguous` | **`plan_emit`** | **`job_dispatched`**

**HistoryTurn 형식:**
```ts
{
  role: 'user' | 'assistant',
  content: string,
  kind?: IntakeKind,             // assistant turn 만
  clarifyingQuestion?: string,   // assistant.kind=code_change_ambiguous
  planItems?: PlanItem[],        // assistant.kind=plan_emit
}
```

**Tech Stack:** Node http, fetch, Anthropic API. orchestrator/lib 확장. Playground TS 클라 변경. Slack thread reply / Chrome ext in-memory 도 history 빌드.

---

## File Structure

### Sub-phase A — signature + dispatcher (1.5d)
- **Modify:** `orchestrator/lib/molly-intake.js` — `processIntake` 시그니처 확장, prev kind 별 dispatcher skeleton.
- **Modify:** `orchestrator/server.js` — `/api/intake` payload 에서 `history` 받기.

### Sub-phase B — clarification answer + plan emit 흡수 (1.5d)
- **Modify:** `orchestrator/lib/molly-prd-analyzer.js` — history 있으면 cumulative 컨텍스트로 분석.
- **Create:** `orchestrator/lib/molly-plan-emitter.js` — 기존 server.js 의 `/api/plan` LLM 호출 + DS context loading 을 lib 으로 추출. `emitPlan(goal, ctx) → planItems[]`.
- **Modify:** `orchestrator/server.js` — `/api/plan` 라우터를 thin wrap 으로 (기존 동작 유지).
- **Modify:** `orchestrator/lib/molly-intake.js` — `handleClarificationAnswer`, `handlePlanEdit` 구현.

### Sub-phase C — Playground AIPanel 마이그레이션 (2d, risky)
- **Modify:** `playground-app/src/services/orchestrator-client.ts` — `postIntake({text, history, surface})` 추가, `postChat` deprecated 표시.
- **Modify:** `playground-app/src/editor/AIPanel.tsx` — send 자리에서 `postChat` → `postIntake`. ceremony state (messages / pendingPlan / awaitingApproval) 를 `history` 로 통합.
- 회귀 테스트 — Wizard 의 full ceremony (PRD → Q → 답 → plan → 승인 → 잡) E2E.

### Sub-phase D — Slack/Chrome ext history (0.5d)
- **Modify:** `orchestrator/lib/molly.js` — `handleMention` 에서 `event.thread_ts` 있으면 `conversations.replies` API 로 thread reply 들 가져와 history 변환.
- **Modify:** `chrome-extension/sidepanel.js` — in-memory `mollyChatHistory` array 유지, send 시 history 합쳐 보냄.

### Sub-phase E — `/api/chat` deprecation + handoff (0.5d)
- **Modify:** `orchestrator/server.js` — `/api/chat` 라우터에 `X-Deprecated` 헤더 + `console.warn`. 동작은 그대로.
- **Create:** `docs/superpowers/handoffs/2026-05-XX-history-aware-intake.md`.

---

## Sub-phase A — signature + dispatcher (1.5d)

### Task A.1: IntakeResult / HistoryTurn 타입 확장

**Files:**
- Modify: `orchestrator/lib/molly-intake.js`

- [ ] **JSDoc 에 새 kind 추가**

```js
/**
 * @typedef {object} IntakeResult
 * @property {'chat'|'status_query'|'code_change_clear'|'code_change_ambiguous'|'plan_emit'|'job_dispatched'} kind
 * @property {string} reason
 * @property {string} [response]
 * @property {string} [clarifyingQuestion]
 * @property {string[]} [missingInfo]
 * @property {Array<object>} [planItems]      // kind=plan_emit
 * @property {string} [cumulativePrd]         // kind=plan_emit (history 합쳐 만든 PRD)
 * @property {string} [jobId]                 // kind=job_dispatched
 */

/**
 * @typedef {object} HistoryTurn
 * @property {'user'|'assistant'} role
 * @property {string} content
 * @property {string} [kind]            // assistant turn 만 — 마지막 IntakeResult.kind
 * @property {string} [clarifyingQuestion]
 * @property {Array<object>} [planItems]
 */
```

### Task A.2: `processIntake` 시그니처 + dispatcher skeleton

**Files:**
- Modify: `orchestrator/lib/molly-intake.js`

- [ ] **history 분기 추가, prev kind 별 routing**

```js
export async function processIntake(text, ctx = {}) {
  const history = Array.isArray(ctx.history) ? ctx.history : [];
  const prev = lastAssistantTurn(history);

  // 첫 턴 또는 prev kind 가 chat/status (multi-turn 가능, 단 별도 분기 X)
  if (!prev || prev.kind === 'chat' || prev.kind === 'status_query') {
    return await handleFirstTurn(text, ctx, history);
  }

  switch (prev.kind) {
    case 'code_change_ambiguous':
      return await handleClarificationAnswer(text, history, ctx);
    case 'plan_emit':
      return await handlePlanEdit(text, history, ctx);
    case 'code_change_clear':
    case 'job_dispatched':
      // 잡 만들어진 후 → 자유 chat 로 폴백 (사용자가 새 PRD 던질 수 있음)
      return await handleFirstTurn(text, ctx, history);
    default:
      return await handleFirstTurn(text, ctx, history);
  }
}

function lastAssistantTurn(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === 'assistant') return history[i];
  }
  return null;
}

async function handleFirstTurn(text, ctx, history) {
  // 기존 처리 — classifier → kind 별 분기. recentMessages 에 history 압축 주입.
  const recentMessages = history.slice(-3).map(t => `${t.role}: ${t.content?.slice(0, 200) ?? ''}`);
  const enrichedCtx = { ...ctx, recentMessages };
  const cls = await classifyMollyText(text, enrichedCtx);
  if (cls.kind === 'chat') {
    const response = await composeChatReply(text, enrichedCtx);
    return { kind: 'chat', reason: cls.reason, response };
  }
  if (cls.kind === 'status_query') {
    const response = await composeStatusReply(text, enrichedCtx);
    return { kind: 'status_query', reason: cls.reason, response };
  }
  const analysis = await analyzePrdClarity(text, enrichedCtx);
  if (analysis.clarity === 'ambiguous') {
    return {
      kind: 'code_change_ambiguous',
      reason: cls.reason,
      clarifyingQuestion: analysis.clarifyingQuestion,
      missingInfo: analysis.missingInfo,
    };
  }
  return { kind: 'code_change_clear', reason: cls.reason };
}
```

- [ ] **handleClarificationAnswer / handlePlanEdit 는 sub-phase B 에서 구현. skeleton 만 reject:**

```js
async function handleClarificationAnswer(text, history, ctx) {
  throw new Error('TODO sub-phase B');
}
async function handlePlanEdit(text, history, ctx) {
  throw new Error('TODO sub-phase B');
}
```

### Task A.3: `/api/intake` payload 에서 history 받기

**Files:**
- Modify: `orchestrator/server.js`

- [ ] **ctx 에 history 추가, 길이 제한**

```js
const ctx = {
  surface: payload?.surface || 'unknown',
  recentMessages: Array.isArray(payload?.recentMessages) ? payload.recentMessages : [],
  channel: payload?.channel,
  threadTs: payload?.threadTs,
  history: Array.isArray(payload?.history) ? payload.history.slice(-10) : [],
  listJobs,
  getJob,
};
```

### Task A.4: 검증 + commit

- [ ] **curl: history 비어있음 → 기존 동작 (chat/status/code_change_clear/ambiguous 모두 동일)**
- [ ] **curl: history 마지막 = code_change_ambiguous → handleClarificationAnswer throw 확인 (skeleton)**
- [ ] **commit**: `feat(molly): processIntake history-aware skeleton`

---

## Sub-phase B — clarification answer + plan emit 흡수 (1.5d)

### Task B.1: PRD analyzer 가 history 받게

**Files:**
- Modify: `orchestrator/lib/molly-prd-analyzer.js`

- [ ] **ctx.history 있으면 cumulative 컨텍스트로 분석**

```js
export async function analyzePrdClarity(text, ctx = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const history = Array.isArray(ctx.history) ? ctx.history : [];
  let userMessage;
  if (history.length > 0) {
    const turns = history.map(t =>
      `${t.role === 'user' ? '사용자' : 'molly'}: ${(t.content || '').slice(0, 500)}`
    ).join('\n');
    userMessage = `이전 대화:\n${turns}\n\n사용자의 현재 답변/추가 정보:\n${text}\n\n위 누적 컨텍스트로 PRD 가 이제 명확한지 판정해주세요.`;
  } else {
    userMessage = `PRD 후보:\n${text}\n\n분석해주세요.`;
  }
  // ... 기존 호출 그대로
}
```

- [ ] **system prompt 끝에 추가**:

```
누적 컨텍스트가 주어지면 — 사용자가 이전 clarifying question 의 답을 한 것입니다. 이전 PRD + 모든 답변을 합쳐서 *지금 작업 시작할 만큼 명확한지* 판정합니다. 답변이 부분적이면 다음 clarifying Q (한 번에 하나만).
```

### Task B.2: `molly-plan-emitter.js` — `/api/plan` logic 추출

**Files:**
- Create: `orchestrator/lib/molly-plan-emitter.js`
- Modify: `orchestrator/server.js`

- [ ] **`emitPlan(goal, ctx) → planItems[]` 함수 export**
- [ ] **server.js 의 `/api/plan` 라우터 본문에 있는 Anthropic 호출 + DS context loading + JSON parsing 을 lib 으로 옮김**
- [ ] **`/api/plan` 라우터는 lib 호출하는 thin wrap (backward compat)**

### Task B.3: `handleClarificationAnswer` 구현

**Files:**
- Modify: `orchestrator/lib/molly-intake.js`

```js
async function handleClarificationAnswer(text, history, ctx) {
  const analysis = await analyzePrdClarity(text, { ...ctx, history });
  if (analysis.clarity === 'ambiguous') {
    return {
      kind: 'code_change_ambiguous',
      reason: 'follow-up answer still ambiguous',
      clarifyingQuestion: analysis.clarifyingQuestion,
      missingInfo: analysis.missingInfo,
    };
  }
  // clear → cumulative PRD 만들어서 plan emit
  const cumulativePrd = compactCumulativePrd(history, text);
  let planItems;
  try {
    const { emitPlan } = await import('./molly-plan-emitter.js');
    planItems = await emitPlan(cumulativePrd, ctx);
  } catch (err) {
    // plan emit 실패 → code_change_clear 폴백 (잡 직접 만들게)
    return {
      kind: 'code_change_clear',
      reason: `clarified but plan emit failed: ${err.message?.slice(0, 80)}`,
      cumulativePrd,
    };
  }
  return {
    kind: 'plan_emit',
    reason: 'clarified, plan ready',
    cumulativePrd,
    planItems,
  };
}

function compactCumulativePrd(history, latestText) {
  // 첫 번째 user PRD + 모든 user 답변 합치기 (assistant turn 은 컨텍스트로만)
  const userTurns = history.filter(t => t.role === 'user').map(t => t.content || '');
  return [...userTurns, latestText].join('\n\n').trim();
}
```

### Task B.4: `handlePlanEdit` 구현

**Files:**
- Modify: `orchestrator/lib/molly-intake.js`

- [ ] **간단 휴리스틱 — "이대로", "진행", "ok", "approve" 키워드 → dispatch. 그 외 → re-emit.**

```js
async function handlePlanEdit(text, history, ctx) {
  const APPROVE = /(이대로|진행|승인|approve|ok|네\s|네$|yes\b)/i;
  const prev = lastAssistantTurn(history);
  if (APPROVE.test(text.trim())) {
    // dispatch — caller 가 createJob 호출. lib 은 의도만 반환.
    return {
      kind: 'job_dispatched',
      reason: 'user approved plan',
      cumulativePrd: extractCumulative(history),
      planItems: prev?.planItems ?? [],
    };
  }
  // 자유 피드백 → plan re-emit
  const cumulativePrd = `${extractCumulative(history)}\n\n[추가 피드백]\n${text}`;
  const { emitPlan } = await import('./molly-plan-emitter.js');
  const planItems = await emitPlan(cumulativePrd, ctx);
  return {
    kind: 'plan_emit',
    reason: 'plan revised per feedback',
    cumulativePrd,
    planItems,
  };
}
```

**Note:** `kind: 'job_dispatched'` 는 lib 안에서 createJob 호출하지 않음 — caller (server.js / Playground) 가 시그널 받아 createJob 부름. lib 은 stateless 유지.

### Task B.5: 검증 + commit

- [ ] **curl 시퀀스**:

```bash
# Turn 1 — ambiguous
curl ... -d '{"text":"광고 페이지 개선해줘","history":[]}'
# 기대: kind=code_change_ambiguous, clarifyingQuestion="어떤..."

# Turn 2 — answer
curl ... -d '{"text":"광고 소재 리스트","history":[
  {"role":"user","content":"광고 페이지 개선해줘"},
  {"role":"assistant","content":"어떤 부분?","kind":"code_change_ambiguous","clarifyingQuestion":"어떤 부분?"}
]}'
# 기대: kind=plan_emit + planItems[]

# Turn 3 — approve
curl ... -d '{"text":"이대로 진행","history":[..., {"role":"assistant","content":"...","kind":"plan_emit","planItems":[...]}]}'
# 기대: kind=job_dispatched + cumulativePrd
```

- [ ] **commit**: `feat(molly): handleClarificationAnswer + plan emit 흡수`

---

## Sub-phase C — Playground AIPanel 마이그레이션 (2d, risky)

### Task C.1: `orchestrator-client.ts` — postIntake export

**Files:**
- Modify: `playground-app/src/services/orchestrator-client.ts`

- [ ] **`postIntake({ text, history, surface })` 함수 export**
- [ ] **`postChat` 은 `@deprecated` JSDoc 표시**

### Task C.2: AIPanel ceremony state → history 마이그레이션

**Files:**
- Modify: `playground-app/src/editor/AIPanel.tsx`

- [ ] **send 자리 — postChat → postIntake**:

```ts
const result = await postIntake({
  text: userInput,
  history: buildHistoryFromMessages(messages),
  surface: 'playground',
});
switch (result.kind) {
  case 'chat':
  case 'status_query':
    appendMessage({ role: 'assistant', content: result.response, kind: result.kind });
    break;
  case 'code_change_ambiguous':
    appendMessage({ role: 'assistant', content: result.clarifyingQuestion, kind: result.kind, clarifyingQuestion: result.clarifyingQuestion });
    break;
  case 'plan_emit':
    appendMessage({ role: 'assistant', content: '', kind: result.kind, planItems: result.planItems });
    setPendingPlan(result.planItems); // 기존 plan card UI 재사용
    break;
  case 'job_dispatched':
    // caller 가 createJob 부름
    const job = await createJobFromPlan(result.cumulativePrd, result.planItems);
    transitionToJobMode(job.id);
    break;
  case 'code_change_clear':
    // 즉시 잡 만들기 (plan emit 우회 — 사용자가 명확하게 던졌을 때)
    const directJob = await createDirectJob(userInput);
    transitionToJobMode(directJob.id);
    break;
}
```

### Task C.3: 회귀 E2E 테스트

- [ ] **Full ceremony (가장 중요)**:
  1. PRD 모호하게 "광고 페이지 개선" → ambiguous + Q
  2. "광고 소재 리스트" → plan emit + plan card
  3. "이대로 진행" → 잡 모드 전환
- [ ] **Multi-turn chat**: "안녕" → 응답 → "사용법은?" → 사용법 응답
- [ ] **Multi-turn status**: "활성 잡?" → 답 → "그 잡 더 자세히" → 답 (이건 sub-phase D 의 history 효과)
- [ ] **잡 모드 중 추가 입력**: 현재 동작 유지 (chat 모드 비활성, 또는 잡 피드백)

### Task C.4: feature flag + commit

- [ ] **env `MOLLY_HISTORY_AWARE=1` flag 도입** — 기본 off, 검증 끝나면 on
- [ ] **commit (분리)**:
  - `feat(playground): postIntake client + AIPanel ceremony 통합`
  - `feat(playground): MOLLY_HISTORY_AWARE feature flag`

---

## Sub-phase D — Slack/Chrome ext history (0.5d)

### Task D.1: Slack handleMention — thread reply 를 history 로

**Files:**
- Modify: `orchestrator/lib/molly.js`

- [ ] **`event.thread_ts` 있으면 `conversations.replies` 호출 → history 변환**

```js
async function buildSlackHistory(client, channel, threadTs, botUserId) {
  if (!threadTs) return [];
  try {
    const r = await client.conversations.replies({
      channel, ts: threadTs, limit: 20,
    });
    return (r.messages || []).slice(-10).map(m => ({
      role: m.user === botUserId ? 'assistant' : 'user',
      content: m.text || '',
      // kind/clarifyingQuestion/planItems metadata 는 Slack 메시지에 직접 안 박힘 —
      // Phase 4 후속에서 reaction / metadata 로 박는 것 검토. 지금은 plain content 만.
    }));
  } catch (err) {
    logger.warn(`[molly] thread history fetch failed: ${err.message}`);
    return [];
  }
}
```

### Task D.2: Chrome ext sidepanel — in-memory history

**Files:**
- Modify: `chrome-extension/sidepanel.js`

- [ ] **`mollyChatHistory` array, send 시 동봉**

```js
const mollyChatHistory = []; // module-level
function pushHistory(role, content, meta = {}) {
  mollyChatHistory.push({ role, content, ...meta });
  if (mollyChatHistory.length > 20) mollyChatHistory.shift();
}
// send 시:
const r = await fetch(`${baseUrl}/api/intake`, {
  ...,
  body: JSON.stringify({ text: userInput, surface: 'chrome-ext', history: mollyChatHistory.slice(-10) }),
});
```

### Task D.3: 검증 + commit

- [ ] **Slack thread 에서 multi-turn**: PRD → Q → 답 → plan card surface
- [ ] **Chrome ext sidepanel 에서 multi-turn**: 같은 흐름
- [ ] **commit**: `feat(molly): Slack/Chrome ext history 빌드 + intake 동봉`

---

## Sub-phase E — `/api/chat` deprecation + handoff (0.5d)

### Task E.1: `/api/chat` deprecation

**Files:**
- Modify: `orchestrator/server.js`

- [ ] **`/api/chat` 라우터에 헤더 + log warn 추가**

```js
if (pathname === '/api/chat' && req.method === 'POST') {
  res.setHeader('X-Deprecated', 'use /api/intake with history');
  console.warn(`[/api/chat] deprecated call from ${req.headers['user-agent']?.slice(0, 80) ?? 'unknown'}`);
  // 기존 동작 그대로
  ...
}
```

### Task E.2: handoff doc 작성

**Files:**
- Create: `docs/superpowers/handoffs/2026-05-XX-history-aware-intake.md`

- [ ] **TL;DR + sub-phase 별 ship 결과 + 알려진 한계 + 다음 슬라이스**
- [ ] **MEMORY.md 업데이트** — `project_canvas_app.md` 의 마라톤 세션 다음 줄에 추가

### Task E.3: 통합 회귀 + commit

- [ ] **3 surface E2E**: Slack / Chrome ext / Playground 에서 full ceremony 1 회씩
- [ ] **commit**: `chore(molly): /api/chat deprecation + handoff`

---

## Risk + Mitigation

| Risk | 완화책 |
|---|---|
| **Playground ceremony 회귀** — Wizard plan emit/edit/dispatch 깨짐 | Sub-phase B 끝나고 server-only E2E (curl 로 plan_emit/job_dispatched 검증) 후 C 진입. C 는 feature flag (`MOLLY_HISTORY_AWARE=1`) 점진 도입 |
| **history 토큰 폭증** | history 마지막 10 turn slice + 각 content slice (≤500자). 5턴+ 면 요약 고려 (별 슬라이스) |
| **prev kind metadata 누락** | history 형식 strict — assistant turn 은 kind 필수. 클라가 마지막 IntakeResult.kind 를 그대로 history 에 저장 |
| **Slack thread → history 변환 비용** | conversations.replies 매 멘션 호출 — 단 20 message 제한. Slack rate limit 감안 (대부분 OK) |
| **Slack history 의 metadata 부재** — 메시지 텍스트만 있고 kind 없음 → dispatcher 가 정확한 routing 어려움 | Phase 4 후속에서 reaction / metadata 로 박는 것 검토. 지금은 prev=null 처리 (첫 턴처럼) — Slack 은 history 효과 절반만 |
| **`/api/plan` deprecation 충돌** | thin wrap 으로 두고 logging 만. 호출 zero 확인 후 (handoff #5 측정) 삭제 |
| **D5 단답 misclassify 가 진짜 fix 되는지** | sub-phase B 끝나고 직접 curl 검증 케이스 추가 (위 sub-phase B Task B.5) |
| **plan_emit 의 planItems schema 안정성** | 기존 Wizard 의 schema 정확히 유지. plan-emitter lib 추출 시 schema test |

---

## 검증 전략 (sub-phase 별)

| sub-phase | 검증 포인트 |
|---|---|
| A | curl: history 4 종 prev kind 별 dispatcher 진입 로그 (prev=ambiguous → throw 'TODO sub-phase B') |
| B | curl 3 turn 시퀀스 (위 Task B.5 스크립트). plan_emit / job_dispatched 결과 schema 확인. D5 ("TVING" 시뮬) 실제 fix 검증 |
| C | Playground UI E2E: full ceremony (PRD → Q → 답 → plan → 잡). chat / status multi-turn |
| D | Slack/Chrome ext 실제 thread 에서 multi-turn |
| E | grep `/api/chat` 호출 로그 → 0 인지 (handoff 시점) |

---

## Self-review

- [x] Multi-turn 모든 surface 통일 (Slack thread / Chrome ext / Playground 같은 흐름)
- [x] Wizard 의 plan ceremony 통합 (별도 endpoint 안 둠)
- [x] Backward compat — `/api/chat`, `/api/plan` 은 alias/deprecation 으로 유지
- [x] D5 misclassify 가 prev=ambiguous 메타로 해결됨 (sub-phase B 효과)
- [x] feature flag 로 점진 도입 (회귀 시 즉시 off)
- [x] Risk: Playground ceremony 회귀가 가장 큼 — sub-phase 분리 (server 먼저, UI 나중)

## 예상 시간 분배

| sub-phase | 시간 |
|---|---|
| A. signature + dispatcher | 1.5d |
| B. clarification answer + plan emit 흡수 | 1.5d |
| C. Playground AIPanel 마이그레이션 (가장 risky) | 2d |
| D. Slack/Chrome ext history | 0.5d |
| E. `/api/chat` deprecation + handoff | 0.5d |
| 버퍼 + E2E 검증 | 1d |
| **합계** | **~7d (~40h)** |

## 주의사항

1. **planItems schema 안정성** — 기존 Wizard UI 가 의존. 추출 시 그대로.
2. **history assistant.kind metadata** — 클라가 정확히 저장해야 dispatcher routing 정확.
3. **Wizard 의 multi-turn clarification 과 PRD analyzer 의 ambiguous** — 통합 시 같은 path 로 합쳐짐. sub-phase B Task B.3 가 검증 포인트.
4. **`/api/chat` 삭제 시점** — Phase 3 이후 1-2 분기 별도 슬라이스. 지금은 deprecation 만.
5. **history 토큰 비용** — code_change_ambiguous 안 일어나도 매 chat 호출에 history 가 들어감. composeChatReply 도 history 받게 → 응답 품질 ↑ 부수 이득.
6. **Slack history 의 한계** — thread reply 가 plain text 라 kind metadata 없음. 첫 시기 Slack 은 history 효과 부분적. 후속 슬라이스 (reaction emoji 또는 message metadata API) 로 개선 검토.
