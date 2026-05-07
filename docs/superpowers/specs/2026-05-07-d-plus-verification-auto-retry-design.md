# D+ verification_failed 자동 재시도 — Design Spec

**Date:** 2026-05-07
**Author:** kyungjae.ha (with Claude)
**Branch:** main
**Related:**
- 직전 슬라이스 D: `e5ee3a4 feat(pipeline): preview 노출 전 typecheck verify`
- 직전 슬라이스 C: `ec542aa feat(molly plan): plan-emitter 에 components.json 매니페스트 주입`
- 핸드오프: `docs/superpowers/handoffs/2026-05-07-incident-burn-down.md`

---

## 1. 동기

D 슬라이스 (`runTypecheck`) 가 type 에러 검출 → `phase='verification_failed'` 로 빨간 카드 노출까지는 했지만, **사용자가 직접 다시 시도**해야 한다. 첫 시도 실패의 일부는 LLM 한테 에러를 알려주면 한두 번 만에 풀린다 — 자동화 가능한 영역.

## 2. 목표 / 비-목표

**목표**
- verification_failed 시 자동으로 plan 재 emit + 재 적용 + 재 검증을 최대 2회 수행
- 재시도 진행을 사용자에게 명확히 안내 (phase 노출, 채팅 안내 메시지)
- 재시도 성공 시 정상 preview, 실패 시 기존 verification_failed 흐름으로 fallback
- 운영 데이터 (재시도 성공률, 비용, 시간) 측정 가능한 analytics

**비-목표**
- prop 시그니처까지 plan 단계에서 보장 (그건 C+ 의 영역)
- 런타임 / 로직 버그 자동 수정 (tsc 가 잡지 못하는 영역)
- 코드 패치 단위 surgical fix (full plan 재 emit 만 수행)

## 3. 결정 사항 (브레인스토밍 결과)

| 항목 | 결정 | 이유 |
|---|---|---|
| 재시도 단위 | **Plan 재 emit (full pipeline)** | components.json 캐시 재활용, 새 LLM 경로 안 만듦 |
| 최대 재시도 | **2회** | 연구상 76~95% 개선 포착 (1회는 절반) |
| 사용자 가시성 | **보임** (`phase='verification_retry'`, 채팅 안내) | 시간/비용 투명성, 신뢰도 |
| LLM 피드백 | **구조화 에러 + 실패 코드 ±3줄** | superficial → semantic 수정 전환 |
| State 처리 | **자동 revert (`restoreToSha`) 후 fresh apply** | 부분 적용 누적 방지 |
| Anchoring 회피 | 이전 plan JSON 통째로 X, "이전 접근법 재검토" 명시 | LLM 같은 hallucination 반복 ↓ |

## 4. 흐름 (Architecture)

```
plan emit (1차)
  ↓
playground commit (parentSha 기록) + apply
  ↓
runTypecheck (1차)
  ├─ pass → preview_ready  ✓
  └─ fail
        ↓
        retry 루프 (최대 verifyMaxRetries=2 회)
          1) restoreToSha(parentSha) — 깨끗한 상태 복원
          2) phase='verification_retry', verifyAttempt=N
          3) emitPlan({...원래 PRD, verifyFeedback}) — 구조화 에러+코드 ±3줄
          4) playground commit + apply
          5) runTypecheck (재)
              ├─ pass → preview_ready  ✓ (analytics: succeeded)
              └─ fail
                  ├─ N < 2 → 루프 다음 회차
                  └─ N = 2 → status='error', phase='verification_failed' (analytics: exhausted)
```

## 5. 변경되는 파일 / 모듈

| 파일 | 변경 | 책임 |
|---|---|---|
| `orchestrator/server.js` | (a) `runTypecheckWithRetry` helper 신설; 두 호출 지점 (playground / legacy) 모두 이걸로 교체. (b) 기존 `runTypecheck` 는 `{pass, feedback}` 반환 형태로 리팩토 (실패 시 즉시 error 상태 기록 X — 호출자에 위임). (c) playground commit 호출 직전 `state.parentSha = (현재 HEAD)` 기록. (d) `applyAndCommitPlan` 헬퍼 추출 — 기존 pipeline 의 plan→commit→apply 부분을 retry 에서 재호출 가능하도록. | retry 오케스트레이션, restoreToSha 호출, phase 전환, analytics |
| `orchestrator/lib/molly-plan-emitter.js` | `emitPlan(args, ctx)` 의 `args` 에 옵셔널 `verifyFeedback` 추가. SYSTEM_PROMPT 에 "재시도 시 가이드" 블록 (`cache_control: ephemeral` 마지막 블록 직전 — 캐시 영향 최소화). user prompt 에 에러 + 코드 컨텍스트 추가. | 에러 컨텍스트 흡수해 plan 재생성 |
| `orchestrator/lib/playground.js` | 변경 없음. 기존 `restoreToSha` 활용. | (재사용) |
| `orchestrator/lib/molly-settings.js` | `ALLOWED_KEYS` 에 `verifyMaxRetries` 추가. 기본값 2. | 운영 토글 |
| `orchestrator/state/molly-settings.json` | (런타임) `verifyMaxRetries: 2` 신규 키 | 토글 값 |
| `playground-app/src/editor/AIPanel.tsx` | `PHASE_LABELS` 에 `verification_retry: '재시도 중 (검증 실패)'` 추가; 재시도 성공 / 실패 시 채팅 안내 메시지 emit (intake 의 `code_change_clear` 폴백 안내 패턴 재활용) | 한국어 라벨, 사용자 안내 |
| `playground-app/src/editor/JobCard.tsx` | `phaseLabelKo` 에 동일 라벨 추가 | 한국어 라벨 |

## 6. 핵심 인터페이스

### `runTypecheck` 리팩토 — 반환 형태 확장

```javascript
// before
async function runTypecheck(id, containerId, state): Promise<boolean>

// after
async function runTypecheck(id, containerId, state): Promise<{
  pass: boolean,
  feedback?: {
    errorCount: number,
    firstError: string,
    regressionLines: string[],         // 최대 50줄
    structured: Array<{                // ±3줄 코드 컨텍스트 첨부용
      file: string,
      line: number,
      col: number,
      tsCode: string,
      message: string,
      contextLines?: string[]          // ±3줄 (호출자가 컨테이너에서 읽어 채움)
    }>
  }
}>
```

기존 호출자 코드:
```javascript
// before
const verifyOk = await runTypecheck(...);
if (!verifyOk) return;
```

이걸 wrapper 로 교체:
```javascript
// after
const verifyOk = await runTypecheckWithRetry(id, sandbox, state, planMeta);
if (!verifyOk) return;
```

### `runTypecheckWithRetry` — 신규 helper

```javascript
async function runTypecheckWithRetry(id, sandbox, state, planMeta, ctx) {
  // planMeta = { goal, client, routeOrPage, prdUrl, jiraUrl, parentSha }
  // ctx     = { designSystemRoot, requestSchemaPath, surface } — emitPlan 의 두번째 인자
  const settings = readSettingsCached();
  const MAX_RETRIES = Number(settings.verifyMaxRetries ?? 2);
  const GLOBAL_TIMEOUT_MS = 15 * 60 * 1000;
  const startedAt = Date.now();

  let result = await runTypecheck(id, sandbox.containerId, state);
  if (result.pass) return true;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (Date.now() - startedAt > GLOBAL_TIMEOUT_MS) {
      // 글로벌 cap 초과 — exhausted 처리
      writeVerificationFailed(id, state, result.feedback, attempt - 1);
      appendAnalyticsEvent(state, 'verification_retry_failed', {
        reason: 'global_timeout', attempt: attempt - 1
      });
      return false;
    }

    // 1) restore
    try {
      await restoreToSha(state.playgroundId, planMeta.parentSha);
    } catch (err) {
      writeVerificationFailed(id, state, result.feedback, attempt - 1);
      appendAnalyticsEvent(state, 'verification_retry_failed', {
        reason: 'restore_error', attempt, message: err.message?.slice(0, 200)
      });
      return false;
    }

    // 2) phase / log / analytics
    updateRequest(id, { phase: 'verification_retry', verifyAttempt: attempt });
    appendLog(id, `타입 에러 발견 — 자동 재시도 중 (${attempt}/${MAX_RETRIES})`);
    appendAnalyticsEvent(state, 'verification_retry_attempted', {
      attempt,
      errorCount: result.feedback.errorCount,
      firstError: result.feedback.firstError.slice(0, 200),
    });

    // 3) re-emit plan
    let newPlan;
    try {
      newPlan = await emitPlan({
        ...planMeta,
        verifyFeedback: buildFeedbackBlock(result.feedback, sandbox.containerId),
      }, ctx);
    } catch (err) {
      writeVerificationFailed(id, state, result.feedback, attempt - 1);
      appendAnalyticsEvent(state, 'verification_retry_failed', {
        reason: 'llm_error', attempt, message: err.message?.slice(0, 200)
      });
      return false;
    }

    // 4) re-apply (existing pipeline subroutine — extracted helper)
    const applied = await applyAndCommitPlan(id, newPlan, sandbox, state);
    if (!applied.ok) {
      writeVerificationFailed(id, state, result.feedback, attempt);
      appendAnalyticsEvent(state, 'verification_retry_failed', {
        reason: 'apply_error', attempt
      });
      return false;
    }

    // 5) re-verify
    result = await runTypecheck(id, sandbox.containerId, state);
    if (result.pass) {
      appendAnalyticsEvent(state, 'verification_retry_succeeded', {
        attempt, totalRetryMs: Date.now() - startedAt
      });
      // 사용자 안내 메시지 (chat) — applyAndCommitPlan 흐름에서 chat 주입
      return true;
    }
  }

  // 모든 retry 소진
  writeVerificationFailed(id, state, result.feedback, MAX_RETRIES);
  appendAnalyticsEvent(state, 'verification_retry_exhausted', {
    attempts: MAX_RETRIES, finalError: result.feedback.firstError.slice(0, 200),
    totalRetryMs: Date.now() - startedAt
  });
  return false;
}
```

### `emitPlan` 에 `verifyFeedback` 인자

```javascript
// 호출 시
emitPlan({
  goal: '...',
  client: 'tving',
  routeOrPage: '/foo',
  // 신규
  verifyFeedback: `
이전 시도가 TypeScript 타입 검증에 실패했습니다.

발생한 에러:
─────────────────────
1. src/apps/foo/Bar.tsx (12, 5)
   error TS2741: Property 'variant' is missing in type '{ children: string; }'
                 but required in type 'ButtonProps'.

   해당 코드:
   \`\`\`tsx
   10 | export function Bar() {
   11 |   return (
   12 |     <Button>저장</Button>
   13 |   );
   14 | }
   \`\`\`
─────────────────────

지시:
- 이전 접근법을 그대로 반복하지 말고 재검토하세요.
- components.json 의 import 와 prop 시그니처를 다시 확인하세요.
- 동일한 컴포넌트로 재시도해도 되고, 다른 컴포넌트로 변경해도 됩니다.
`,
}, ctx)
```

`molly-plan-emitter.js` 내부:
- SYSTEM_PROMPT 에 "재시도 시 가이드" 텍스트 (정적, 캐시됨) — verifyFeedback 유무 무관 항상 포함
- userPrompt builder 에 `if (args.verifyFeedback) { append(args.verifyFeedback) }`

캐시 영향: `verifyFeedback` 는 user message 에 들어가므로 systemBlocks 캐시 (218KB components.json) 그대로 유지. cache_read 90% 할인 보존.

## 7. UX 안내 (사용자 흐름)

### 단계 1 — 재시도 시작
- **잡 카드**: `재시도 중 (검증 실패) 1/2`
- **로그 패널**: `타입 에러 발견 — 자동 재시도 중 (1/2)` → `해당 변경 되돌리는 중` → `Molly 한테 에러 알려서 plan 다시 만드는 중`

### 단계 2A — 재시도 성공
- **잡 카드**: `완료` (preview_ready)
- **채팅 안내** (한 줄):
  > ℹ️ 첫 시도가 타입 에러로 실패해서 자동 재시도로 해결했습니다. (N회 만에 성공)

### 단계 2B — 재시도 모두 실패 (2회)
- **잡 카드**: `검증 실패` (기존 phase)
- **채팅 안내**:
  > ⚠️ 자동 재시도 2회 모두 타입 에러를 잡지 못했습니다.
  > 첫 에러: `<file:line> error TS2741: ...`
  > 다시 시도하시려면 PRD 를 좀 더 구체적으로 작성하시거나 다른 컴포넌트를 명시해 주세요.

## 8. 에러 처리 / 경계 케이스

| 케이스 | 처리 |
|---|---|
| Plan 재 emit LLM 에러 (404/timeout) | retry 횟수 소비 안 함, 1회 LLM 재호출 (3s backoff). 실패 시 `verification_retry_failed` 후 verification_failed |
| `restoreToSha` 실패 | retry 포기, verification_failed. 채팅: "재시도 준비 중 오류 — 수동 시도 필요" |
| 재시도 중 사용자 cancel | 기존 cancel 흐름 그대로. 다음 await 지점에서 cleanup 후 종료 |
| `parentSha` 추적 | playground commit 직후 `state.parentSha = (이전 HEAD)` 기록 — race 안전 |
| 같은 hallucination 반복 | 알려진 한계로 명시. 1회 retry 후 또 같으면 2회로 가도 효과 작음 (운영 측정 후 결정) |
| 글로벌 시간 초과 (15분) | retry 루프 진입 전마다 체크. 초과 시 verification_failed |
| `verifyMaxRetries=0` 운영 토글 | 자동 재시도 OFF, 기존 D 동작 그대로 |

## 9. Analytics 이벤트 (4개 신규)

```javascript
// 재시도 시도
appendAnalyticsEvent(state, 'verification_retry_attempted', {
  attempt: 1 | 2,
  errorCount, firstError, parentSha
});

// 재시도 성공
appendAnalyticsEvent(state, 'verification_retry_succeeded', {
  attempt,           // 몇 번째에 성공
  totalRetryMs       // 누적 시간
});

// 모든 재시도 소진
appendAnalyticsEvent(state, 'verification_retry_exhausted', {
  attempts: 2,
  finalError, totalRetryMs
});

// 재시도 자체 실패 (LLM/restore/timeout)
appendAnalyticsEvent(state, 'verification_retry_failed', {
  reason: 'llm_error' | 'restore_error' | 'apply_error' | 'global_timeout',
  attempt,
  message
});
```

대시보드 지표 (운영 1주 후):
- 재시도 성공률 = `succeeded / (succeeded + exhausted)`
- 평균 retry 시간
- 에러 종류별 (TS2741 / TS2769 / etc.) 성공률
- → C+ 결정의 정량 근거

## 10. 검증 / 테스트

### 자동
- `node -c` (server.js, plan-emitter.js)
- `pnpm tsc --noEmit` (playground-app — 새 phase 라벨 type OK)
- runTypecheckWithRetry 단위 검증 — 시나리오:
  - fail → fail → pass (2회만에 성공)
  - fail → pass (1회만에 성공)
  - fail → fail → fail (모두 실패, exhausted)
  - restore 실패 (verification_retry_failed)
  - LLM 에러 (verification_retry_failed)
  - 글로벌 timeout

### 수동 (사용자 환경)
1. **인위적 fail**: PRD 에 "존재하지 않는 prop 사용" → 첫 시도 fail → 자동 재시도 성공 확인
2. **수렴 안 하는 fail**: 컴포넌트 catalog 에 없는 가상 import → 2회 다 실패 → 빨간 카드 + 채팅 안내 확인
3. **재시도 중 cancel**: 깨끗한 정리, 컨테이너/git state 정상
4. **Settings 토글**: dashboard 에서 `verifyMaxRetries=0` → 자동 재시도 off
5. **Analytics 확인**: 위 시나리오마다 이벤트 4 종 발사 확인

## 11. 알려진 한계

- 재시도가 같은 hallucination 반복하는 케이스 ~30% 잔존. C+ (props 시그니처 매니페스트) 가 진짜 수렴.
- 로직 버그 (tsc pass, runtime fail) 는 retry 대상 X.
- 첫 retry 비용: cache hit 으로 ~$0.16 (Sonnet) / ~$0.32 (Opus) 추가. 운영 1주 측정 후 cap 조정.
- `restoreToSha` 가 tree-swap 방식이라 git history 에 추가 commit 생성 — log 가독성 약간 ↓ (revert ↔ commit ↔ ...).
- `applyAndCommitPlan` 추출이 본 슬라이스 외 영향 — 기존 pipeline 함수 분해가 작은 리팩토 동반.

## 12. Backout

각 변경 독립 — 단독 revert 가능:
- `runTypecheckWithRetry` 만 제거하고 두 호출자에서 `runTypecheck` 직접 호출로 되돌림 → D 슬라이스 동작
- `verifyMaxRetries=0` 으로 두면 코드 그대로 두고 효과만 OFF

## 13. 추정 작업량

- server.js: 100-150 줄 (helper + applyAndCommitPlan 추출)
- molly-plan-emitter.js: 30-50 줄 (verifyFeedback 처리)
- molly-settings.js: 5 줄 (key 추가)
- AIPanel.tsx, JobCard.tsx: 각 5-10 줄 (라벨 + 안내 메시지)
- 합계: ~200 줄, **0.5d** (반나절)

## 14. 다음 단계

1. 본 spec 사용자 리뷰 → 확정
2. `superpowers:writing-plans` 로 단계별 implementation plan 작성
3. 구현 + 테스트
4. 운영 1주 후 metrics 측정 → C+ 또는 다른 슬라이스 결정
