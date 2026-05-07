# D+ verification_failed 자동 재시도 — Design Spec

**Date:** 2026-05-07 (개정 — Y 접근, 외부 리서치 반영)
**Author:** kyungjae.ha (with Claude)
**Branch:** main
**Related:**
- 직전 슬라이스 D: `e5ee3a4 feat(pipeline): preview 노출 전 typecheck verify`
- 직전 슬라이스 C: `ec542aa feat(molly plan): plan-emitter 에 components.json 매니페스트 주입`
- 핸드오프: `docs/superpowers/handoffs/2026-05-07-incident-burn-down.md`

---

## 1. 동기

D 슬라이스가 type 에러 검출 → `phase='verification_failed'` 로 빨간 카드 노출까지는 했지만, **사용자가 직접 다시 시도**해야 한다. 가장 흔한 type 에러 (TS2741 missing prop, TS2769 overload mismatch) 는 **agent 가 components.json 의 prop 시그니처를 잘못 추론한 code-layer 실수** — agent 한테 에러를 다시 보여주면 한두 번 만에 풀린다.

## 2. 목표 / 비-목표

**목표**
- verification_failed 시 자동으로 agent 재 실행 + 재 검증을 최대 2회 수행
- 재시도 진행을 사용자에게 명확히 안내 (phase 노출, 채팅 안내 메시지)
- 재시도 성공/실패 대시보드 측정 가능

**비-목표**
- Plan-layer hallucination 자동 수정 (없는 컴포넌트 import — components.json 매니페스트 (C) + C+ 의 영역)
- 런타임 / 로직 버그 자동 수정 (tsc 가 잡지 못하는 영역)
- prop 시그니처까지 plan 단계에서 보장 (C+ 영역)

## 3. 결정 사항 (브레인스토밍 + 외부 리서치 반영)

| 항목 | 결정 | 근거 |
|---|---|---|
| 재시도 단위 | **Agent 재 실행 (코드 자기수정)** — plan 재 emit 안 함 | 흔한 type 에러는 code-layer (prop 사용). plan-emitter 다시 한다고 안 풀림. ChatRepair / Self-Refine 표준. |
| 최대 재시도 | **2회** | 연구상 76~95% 개선 포착 (1회는 절반) |
| 사용자 가시성 | **보임** (`phase='verification_retry'`, 채팅 안내) | 시간 / 비용 투명성 |
| LLM 피드백 | **구조화 에러 + 실패 코드 ±3줄** | superficial → semantic 수정 전환 (arxiv 2510.13575) |
| State 처리 | **자동 revert (`restoreToSha`) 후 fresh re-run** | 부분 적용 누적 방지 |
| Anchoring 회피 | "이전 접근법 재검토" 명시 prompt 부가 | LLM 같은 hallucination 반복 ↓ |

## 4. Architecture

```
runPipeline → agent 실행 → diff 수집 → playground commit (parentSha 기록)
  ↓
runTypecheck (1차)
  ├─ pass → preview_ready ✓
  └─ fail
        ↓
        retry 루프 (최대 verifyMaxRetries=2 회)
          1) restoreToSha(parentSha) — 깨끗한 상태 복원
          2) phase='verification_retry', verifyAttempt=N
          3) runAgentPrompt(원래 prompt + verifyFeedback) — agent 자기수정
          4) diff 수집 + playground commit
          5) runTypecheck (재)
              ├─ pass → preview_ready ✓ (analytics: succeeded)
              └─ fail
                  ├─ N < 2 → 루프 다음 회차
                  └─ N = 2 → status='error', phase='verification_failed' (analytics: exhausted)
```

## 5. 변경되는 파일 / 모듈

| 파일 | 변경 |
|---|---|
| `orchestrator/server.js` | (a) 신규 `runTypecheckWithRetry` helper. (b) 기존 `runTypecheck` → `{pass, feedback}` 반환으로 리팩토 (실패 시 즉시 error 상태 기록 X — 호출자 위임). (c) playground commit 직전 `state.parentSha` 저장. (d) agent + commit 부분 (라인 ~1290-1385) 을 `runAgentAndCommit(prompt, ...)` helper 로 추출 — retry 에서 재호출 가능하도록. (e) feedback 블록 빌더 (`buildVerifyFeedback` — 구조화 에러 + ±3줄 코드 컨텍스트) 신규. |
| `orchestrator/lib/molly-settings.js` | `ALLOWED_KEYS` 에 `verifyMaxRetries` 추가 (기본값 2). |
| `orchestrator/state/molly-settings.json` | (런타임) `verifyMaxRetries: 2` 신규 키 |
| `playground-app/src/editor/AIPanel.tsx` | `PHASE_LABELS` 에 `verification_retry: '재시도 중 (검증 실패)'` 추가; 재시도 성공/실패 시 채팅 안내 메시지 |
| `playground-app/src/editor/JobCard.tsx` | `phaseLabelKo` 에 동일 라벨 |
| `orchestrator/lib/playground.js` | 변경 없음 (`restoreToSha` 재사용) |
| `orchestrator/lib/molly-plan-emitter.js` | 변경 없음 (Y 결정 — plan 재 emit 안 함) |

## 6. 핵심 인터페이스 (시그니처만)

```javascript
// runTypecheck — 반환 형태 확장 (기존 boolean → 구조)
async function runTypecheck(id, containerId, state) → Promise<{
  pass: boolean,
  feedback?: { errorCount, firstError, structured: Array<{file, line, col, tsCode, message}> }
}>

// runAgentAndCommit — agent 1회 실행 + commit (기존 inline 로직 추출)
// retryFeedback 있으면 prompt 끝에 구조화 에러 블록 + 재검토 지시 append
async function runAgentAndCommit(id, sandbox, state, opts) → Promise<{
  ok: boolean,
  diff?: { changedFiles, diffText },
  sha?: string,
  error?: string
}>
// opts = { prompt, retryFeedback?, isRetry?: boolean }

// runTypecheckWithRetry — 신규 retry orchestrator
// 두 호출 지점 (playground / legacy) 의 runTypecheck 호출을 이걸로 교체
async function runTypecheckWithRetry(id, sandbox, state) → Promise<boolean>
// 내부: runTypecheck → fail → restoreToSha → runAgentAndCommit → runTypecheck (loop)

// buildVerifyFeedback — 컨테이너에서 ±3줄 코드 컨텍스트 읽어 feedback 블록 생성
async function buildVerifyFeedback(containerId, feedback) → Promise<string>
```

피드백 블록 예시:
```
이전 시도가 TypeScript 타입 검증에 실패했습니다.

발생한 에러:
1. src/apps/foo/Bar.tsx (12, 5)
   error TS2741: Property 'variant' is missing in type '{ children: string; }'
                 but required in type 'ButtonProps'.
   해당 코드:
   10 | export function Bar() {
   11 |   return (
   12 |     <Button>저장</Button>
   13 |   );
   14 | }

지시:
- 이전 접근법을 그대로 반복하지 말고 재검토하세요.
- components.json 의 prop 시그니처를 다시 확인하세요.
```

## 7. UX 안내 (사용자 흐름)

| 단계 | 잡 카드 phase | 채팅 안내 |
|---|---|---|
| 재시도 시작 | `재시도 중 (검증 실패) N/2` | (없음 — phase 만 바뀜) |
| 재시도 성공 | `완료` (preview_ready) | `ℹ️ 첫 시도가 타입 에러로 실패해서 자동 재시도로 해결했습니다 (N회 만에 성공)` |
| 재시도 모두 실패 | `검증 실패` (기존) | `⚠️ 자동 재시도 2회 모두 타입 에러를 잡지 못했습니다. 첫 에러: ...` |

로그 패널에는 매 단계 추가: `타입 에러 발견 — 자동 재시도 중 (1/2)` / `해당 변경 되돌리는 중` / `Agent 재 실행 중...`

## 8. 에러 처리 / 경계 케이스

| 케이스 | 처리 |
|---|---|
| Agent 재 실행 LLM 에러 | retry 횟수 소비 안 함, 1회 backoff (3s) 후 재시도. 실패 시 `verification_retry_failed` (reason='agent_error') |
| `restoreToSha` 실패 | retry 포기, verification_failed. 채팅 안내: "재시도 준비 중 오류 — 수동 시도 필요" |
| 재시도 중 사용자 cancel | 기존 cancel 흐름 (다음 await 지점에서 cleanup 후 종료) |
| `parentSha` 추적 | playground commit 호출 직전 `state.parentSha = (현재 HEAD SHA)` 저장 |
| 글로벌 시간 cap | 15분 초과 시 verification_failed (`reason='global_timeout'`) |
| Agent 가 빈 diff (no_change) 반환 | retry 횟수 소비, retry_failed (`reason='agent_no_change'`). agent 가 자기수정 의지 X 로 해석. |
| `verifyMaxRetries=0` 설정 | 자동 재시도 OFF, 기존 D 동작 그대로 |

## 9. Analytics 이벤트 (4개 신규)

```javascript
appendAnalyticsEvent(state, 'verification_retry_attempted',
  { attempt, errorCount, firstError, parentSha });
appendAnalyticsEvent(state, 'verification_retry_succeeded',
  { attempt, totalRetryMs });
appendAnalyticsEvent(state, 'verification_retry_exhausted',
  { attempts: 2, finalError, totalRetryMs });
appendAnalyticsEvent(state, 'verification_retry_failed',
  { reason: 'agent_error'|'restore_error'|'apply_error'|'global_timeout'|'agent_no_change',
    attempt, message });
```

운영 대시보드 (1주 후): 재시도 성공률 = `succeeded / (succeeded + exhausted)`, 평균 retry 시간, 에러 종류별 (TS2741 / TS2769 등) 성공률 분포.

## 10. 검증 / 테스트

자동:
- `node -c` (server.js)
- `pnpm tsc --noEmit` (playground-app)
- runTypecheckWithRetry 단위: fail→fail→pass / fail→pass / fail→fail→fail / restore 실패 / agent 실패 / global timeout

수동:
1. **인위적 fail**: PRD 에 "존재하지 않는 prop 사용" → 첫 시도 fail → 자동 재시도 성공 확인
2. **수렴 안 하는 fail**: 가상 컴포넌트 import → 2회 다 실패 → 빨간 카드 + 채팅 안내
3. **재시도 중 cancel**: 깨끗한 정리, 컨테이너 / git 정상
4. **Settings 토글**: dashboard 에서 `verifyMaxRetries=0` → off
5. **Analytics 발사**: 위 시나리오마다 이벤트 4종 발사 확인

## 11. 알려진 한계

- **Plan-layer hallucination 미커버** — agent 가 plan-emitter 의 잘못된 컴포넌트 선택을 따라가면 retry 도 못 풀어줌. 그건 C / C+ 영역.
- **로직 버그 (tsc pass, runtime fail)** — retry 대상 X.
- **재시도 비용** — agent 재 실행 = 새 LLM 호출 (cache 안 함). Sonnet 기준 ~$0.50-1.00 / retry 추정. 운영 1주 측정 후 cap 조정.
- **Agent 의 anchoring** — 같은 코드 다시 만드는 케이스 ~30% 잔존. C+ 가 진짜 수렴.
- **`runAgentAndCommit` 추출 시 부수 효과** — 기존 pipeline 함수 분해. 작은 리팩토 동반.

## 12. Backout

- `runTypecheckWithRetry` 만 제거하고 `runTypecheck` 직접 호출로 되돌리면 D 슬라이스 동작 그대로
- `verifyMaxRetries=0` 으로 코드는 두고 효과만 OFF

## 13. 추정 작업량

- server.js: 150-200 줄 (helper 3개 + 추출)
- molly-settings.js: 5 줄
- AIPanel/JobCard: 각 5-10 줄
- 합계: ~200 줄, **0.5d**

## 14. 다음 단계

1. 본 spec 사용자 리뷰 → 확정
2. `superpowers:writing-plans` 로 implementation plan 작성
3. 구현 + 자동 테스트 + 사용자 수동 smoke
4. 운영 1주 후 metrics 측정 → C+ 또는 다음 슬라이스 결정

---

**개정 메모**: 초판 (commit c06e3ab) 은 "Plan 재 emit" (X) 접근이었으나, 외부 리서치 (ChatRepair, Self-Refine, arxiv 2604.10508) 결과 흔한 type 에러는 code-layer 자기수정이 더 효과적임이 확인됨. Y 접근으로 개정.
