# Plan — Sub-phase C 마무리 (Phase 3 Task 3.1)

**Date:** 2026-05-06
**Author:** kyungjae.ha (with Claude)
**Predecessor:** `2026-04-30-history-aware-intake.md` (sub-phase A→E ship), `2026-05-06-molly-perf-and-dashboard.md` (handoff)
**Estimate:** ~1 day
**Branch:** main → 작업 가능 (clean)

---

## 목표

이전 슬라이스에서 남긴 3 항목을 끝내 unified intake 사이클을 닫는다.

1. `job_dispatched` → 실제 잡 자동 트리거 (현재는 안내만)
2. Playground messages store 에 `kind` 필드 추가 (heuristic 제거)
3. `MOLLY_HISTORY_AWARE` default ON 전환 (legacy path opt-out)

이로써 Playground 가 multi-turn → plan emit → "이대로" → **자동 실행** 까지 한 흐름.

---

## 비-목표 (이번 슬라이스에서 안 함)

- `/api/chat` 라우트 코드 삭제 — 호출 zero 확인 후 다음 슬라이스 (1-2주 운영 데이터 본 뒤).
- legacy `mollyClassifyAndDispatch + postChat` 코드 삭제 — opt-out 폴백으로 유지.
- Slack / Chrome ext 변경 — Chrome ext 는 이미 `kind` 저장 중 (`sidepanel.js:136`), Slack 은 metadata 슬라이스 (#4) 별건.

---

## 현 상태 (코드 확인)

| 위치 | 현재 | 문제 |
|---|---|---|
| `playground-app/src/store/playground-store.ts:64` | `ChatMessage` 에 `kind` 없음 | history 빌딩 시 heuristic (`m.plan ? plan_emit : chat`) |
| `playground-app/src/editor/AIPanel.tsx:482-487` | 위 heuristic | 옛 메시지 호환은 OK 지만 새 kind (status_query/ambiguous/lifecycle_action/job_dispatched) 손실 |
| `playground-app/src/editor/AIPanel.tsx:538-546` | `case 'job_dispatched'` 안내만 | TODO 주석 — 실제 잡 시작 X |
| `playground-app/src/editor/AIPanel.tsx:469-471` | localStorage `MOLLY_HISTORY_AWARE='1'` opt-in | default OFF — 새 path 가 메인 사용자에게 안 닿음 |
| `playground-app/src/editor/AIPanel.tsx:196` | `executePlan(m: ChatMessage)` | priorUser 만 보고 userPrompt 결정. cumulativePrd 미사용 |

---

## 변경 사항

### Task 0 — `IntakeKind` union 동기화 (선결)

**파일:**
- `playground-app/src/services/orchestrator-client.ts:283-289`
- `orchestrator/lib/molly-intake.js:23` (JSDoc typedef)

server 는 `lifecycle_action` 도 emit (`molly-intake.js:124`) 하지만 client union 과 server typedef 둘 다 6 종만 정의 (stale). Task 2 가 `case 'lifecycle_action'` 추가하려면 union 확장이 선결.

```ts
// orchestrator-client.ts
export type IntakeKind =
  | 'chat'
  | 'status_query'
  | 'lifecycle_action'  // 추가
  | 'code_change_clear'
  | 'code_change_ambiguous'
  | 'plan_emit'
  | 'job_dispatched';
```

server JSDoc 도 동일하게 갱신.

### Task 1 — `ChatMessage.kind` 필드 추가

**파일:** `playground-app/src/store/playground-store.ts`

- `import type { IntakeKind } from '../services/orchestrator-client'` (또는 inline union)
- `ChatMessage` 인터페이스에 옵션 필드:
  ```ts
  /** assistant 만 — 직전 IntakeResult.kind. history-aware 호출 시 dispatcher 가 routing 결정에 사용. */
  kind?: IntakeKind;
  /** code_change_ambiguous 시 clarifying 질문 (UI 렌더링용 + history 재구성용). */
  clarifyingQuestion?: string;
  ```
- `addAssistantMessage` 의 `Omit<...>` 시그니처는 자동 포함 (이미 partial).

**호환성:** 옛 메시지엔 `kind` 없음. history 빌딩 시 `m.kind ?? heuristic` 폴백 유지.

### Task 2 — AIPanel intake 분기에서 kind 기록

**파일:** `playground-app/src/editor/AIPanel.tsx`

- `case 'chat'` / `'status_query'` / `'code_change_ambiguous'` / `'plan_emit'` / `'code_change_clear'` 모두 `addAssistantMessage` 호출 시 `kind` 추가.
- `code_change_ambiguous` 의 경우 `clarifyingQuestion: result.clarifyingQuestion` 도 저장.
- history 빌딩부 (line 479-488) 에서:
  ```ts
  kind: m.role === 'assistant'
    ? (m.kind ?? (m.plan ? 'plan_emit' : 'chat'))
    : undefined,
  ```
  → 새 메시지는 정확, 옛 메시지는 폴백.
- `lifecycle_action` 케이스 switch 에 추가 — `addAssistantMessage({ content: result.response, kind: 'lifecycle_action' })`. 현재 fallthrough → 안내 누락.
- `code_change_clear` 도 분기 유지 + `kind` 기록 (자동 잡 시작은 일단 안 함 — `job_dispatched` 만 자동 트리거. clear 는 보통 plan_emit 으로 이어지는 중간 상태).

### Task 3 — `job_dispatched` 자동 잡 시작

**파일:** `playground-app/src/editor/AIPanel.tsx`

전략: 직전 plan_emit 메시지 (`kind === 'plan_emit'` 또는 `m.plan` 보유) 를 찾아 기존 `executePlan` 재사용.

- `executePlan` 에 옵션 인자 추가 — **`undefined` 체크 explicit** (빈 문자열 override 도 의도된 값으로 인정):
  ```ts
  const executePlan = useCallback(
    async (m: ChatMessage, opts?: { userPromptOverride?: string }) => {
      // ...
      const userPrompt = opts?.userPromptOverride !== undefined
        ? opts.userPromptOverride
        : (priorUser?.content ?? plan.meta.summary ?? m.content);
      // ...
    }
  )
  ```
  → history-aware 흐름에서 priorUser 가 "이대로" 같은 짧은 승인 텍스트일 때 cumulativePrd 가 정확히 우선.

- `case 'job_dispatched'` — **archived / planResolved 가드 + 중복 dispatch 가드** 포함:
  ```ts
  case 'job_dispatched': {
    const planMsg = [...current].reverse().find(
      (x) =>
        x.role === 'assistant' &&
        !x.archived &&
        x.planResolved !== 'accepted' &&
        (x.kind === 'plan_emit' || !!x.plan)
    );
    if (!planMsg?.plan) {
      addAssistantMessage({
        content: '⚠️ 승인된 계획을 찾지 못했어요. plan 카드의 승인 버튼을 사용해주세요.',
        kind: 'job_dispatched',
      });
      break;
    }
    // 중복 dispatch 방지 — 같은 plan 에 두 번 승인 들어와도 한 번만 실행.
    updateMessage(planMsg.id, { planResolved: 'accepted' });
    addAssistantMessage({
      content: '✅ 계획 승인 — 잡을 시작합니다.',
      kind: 'job_dispatched',
    });
    // cumulativePrd 가 있으면 priorUser ("이대로") 대신 사용.
    void executePlan(planMsg, { userPromptOverride: result.cumulativePrd });
    break;
  }
  ```

**중복 dispatch 시나리오:**
1. 사용자 "이대로" → planResolved=accepted, executePlan 시작
2. 사용자 곧장 "이대로" 또 → 가드가 lookup 에서 accepted plan 제외 → "찾지 못했어요" 안내
3. 결과: 하나의 plan 은 한 번만 실행

### Task 4 — `MOLLY_HISTORY_AWARE` default ON + Kill switch

**파일:** `playground-app/src/editor/AIPanel.tsx`, `playground-app/.env` 또는 `vite.config.ts`

- 현재: `getItem('MOLLY_HISTORY_AWARE') === '1'` opt-in
- 변경: 우선순위 — **build-time env > localStorage > default ON**
  ```ts
  const buildEnvForceOff =
    import.meta.env.VITE_MOLLY_HISTORY_AWARE === '0';
  const userOptOut =
    typeof window !== 'undefined' &&
    window.localStorage?.getItem('MOLLY_HISTORY_AWARE') === '0';
  const historyAware = !buildEnvForceOff && !userOptOut;
  ```
- 주석 — "default ON. backout: (1) 사용자별 `localStorage.setItem('MOLLY_HISTORY_AWARE','0')` (2) 전체 `VITE_MOLLY_HISTORY_AWARE=0` 빌드 → 모든 사용자 강제 OFF. 1-2주 운영 후 legacy block 삭제 슬라이스 예정."
- 핸드오프 문서에 backout 콘솔 명령어 한 줄 명시.

### Task 5 — 검증 (수동)

1. orchestrator + playground 재시작
2. localStorage 비우기 — `localStorage.removeItem('MOLLY_HISTORY_AWARE')`
3. 시나리오 A — 첫 turn 인사: "안녕" → kind=chat, 응답
4. 시나리오 B — 명확 PRD: "TVING 메인 페이지 BETA 라벨 추가" → plan_emit (plan 카드)
5. 시나리오 C — "이대로" → job_dispatched → **잡 카드 자동 실행 시작** (`샌드박스에서 실행 시작…`). plan 카드는 `planResolved=accepted` UI 표시
6. 시나리오 C2 (race) — C 직후 다시 "이대로" → "찾지 못했어요" 안내 (중복 dispatch 차단)
7. 시나리오 D — opt-out: `localStorage.setItem('MOLLY_HISTORY_AWARE','0')` → legacy path 동작 (mollyClassifyAndDispatch + postChat)
8. 시나리오 E — 모호 PRD: "뭔가 바꿔줘" → ambiguous 질문 → 답변 → plan_emit (multi-turn)
9. 시나리오 F — lifecycle: "지금 진행 중인 잡 cancel" → `lifecycle_action` 안내 (LLM 호출 X, 즉시 응답)
10. 시나리오 G — time-travel: 과거 commit checkout → 새 PRD → plan_emit → "이대로" → archived plan 메시지가 lookup 되지 X (archived 가드 작동)
11. metrics 대시보드 (`/molly`) — history-aware default ON 후 1-2 turn 후 `job_dispatched` 가 1+ 증가 확인 (legacy 사용자에선 자명히 0)

### Task 6 — 핸드오프 문서

**파일:** `docs/superpowers/handoffs/2026-05-06-sub-phase-c-finalize.md`

이번 슬라이스 commits / 변경 / 검증 / 다음 후보 정리.

---

## 작업 순서

1. Task 0 — IntakeKind union 동기화 (server JSDoc + client + lifecycle_action 추가) (단독 commit)
2. Task 1 — store ChatMessage.kind 타입 추가 (단독 commit)
3. Task 2 — AIPanel intake 분기 kind 기록 + lifecycle_action 케이스 추가 (단독 commit)
4. Task 3 — job_dispatched 자동 실행 + 중복 dispatch 가드 (단독 commit)
5. Task 4 — default ON + VITE_ kill switch (단독 commit)
6. Task 5 — 검증 (수동 7 시나리오 + metrics)
7. Task 6 — 핸드오프 (backout 콘솔 명령어 포함)

각 commit 은 독립 → revert 안전.

---

## 위험 / footguns

- **IntakeKind union 동기화** — server (molly-intake.js JSDoc) ↔ client (orchestrator-client.ts) ↔ store (ChatMessage.kind) 세 곳 모두 같이 갱신. 한 곳 빠지면 TS reject 또는 lifecycle_action drop.
- **executePlan 의 priorUser 우선순위** — history-aware 흐름에서 priorUser 가 "이대로" 같은 짧은 승인 텍스트. `userPromptOverride !== undefined` 분기 explicit (빈 문자열도 override 로 인정). plan.meta.summary fallback 은 override 미지정시에만.
- **plan 메시지 lookup** — `archived` / `planResolved === 'accepted'` 가드 둘 다 추가. multi-job 세션은 비-목표 (현재 Playground 는 단일 active job).
- **isSending race** — `void executePlan(...)` 후 sendPrompt 의 finally 가 setSending(false) 즉시 해제. 사용자가 곧장 다른 메시지 보낼 수 있음. **legacy 흐름 (수동 plan 카드 승인) 도 동일** — 회귀 아님. duplicate 방지는 `planResolved=accepted` 가드로 처리.
- **archived 메시지** — history 빌더 (`current.slice(0, -1)`) 에 archived 섞일 수 있으나 컨텍스트로는 의미 있어 유지. plan lookup 만 archived 제외.
- **/api/chat fallback** — opt-out 사용자가 여전히 사용. deprecation 헤더는 그대로. sunset 일정 미정 (다음 슬라이스).
- **TS strict** — `IntakeKind` import path 가 `orchestrator-client` 면 store → client 의존. circular 우려 X (store 가 client import 하는 건 정상).
- **kill switch 노출** — 사용자별 `localStorage` (개별), build-time `VITE_MOLLY_HISTORY_AWARE=0` (전체). orchestrator config endpoint 기반 원격 kill switch 는 over-engineering — 회귀 시 hot-fix 빌드로 충분.
- **잡 진행 중 새 PRD** — 잡 카드 active 한 채 새 plan_emit 받으면? 잡 큐는 직렬 (서버 측 `enqueueJob`). 새 plan 의 "이대로" 도 큐에 정상 추가. 비-목표지만 자연 동작 OK.

---

## 완료 기준 (DoD)

- [x] IntakeKind union 3곳 동기화 (server JSDoc, client, lifecycle_action 포함)
- [x] ChatMessage.kind 추가 + addAssistantMessage 호출에서 6 kind 분기 모두 기록 (chat/status/lifecycle/clear/ambiguous/plan_emit, job_dispatched 별도)
- [x] history 빌딩에서 m.kind 우선 사용 (옛 메시지 폴백)
- [x] job_dispatched 분기 — archived/accepted 가드 + 중복 dispatch 차단 + executePlan(planMsg, {userPromptOverride: cumulativePrd})
- [x] executePlan 의 userPromptOverride 가 `!== undefined` 로 explicit 분기 (빈 문자열 인정)
- [x] MOLLY_HISTORY_AWARE default ON, VITE_MOLLY_HISTORY_AWARE=0 build-time kill switch
- [x] 시나리오 A-G 수동 검증 (race / lifecycle / time-travel 포함)
- [x] 핸드오프 문서 — backout 콘솔 명령 한 줄 포함

---

## 다음 슬라이스 후보 (이번 끝나고)

- `/api/chat` legacy path 삭제 (호출 zero 데이터 확인 후, 1-2주)
- 50잡 측정 분석 (handoff #2)
- Slack message metadata (handoff #4, 0.5d)
- 자연어 액션 진짜 구현 (handoff #3, 1주, plan 필요)
