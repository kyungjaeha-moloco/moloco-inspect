# Handoff — Level 1 assertions + 액션 사유 enum capture

**Date:** 2026-04-30
**Author:** kyungjae.ha (with Claude)
**Branch:** main (clean)
**Prior handoffs:** `2026-04-30-molly-chat-mode.md`, `2026-04-29-chrome-ext-step-3-4.md`
**Plan of record:** `docs/superpowers/plans/2026-04-30-level1-assertions-action-reasons.md`

---

## TL;DR

> **agent_review LLM 의 false-pass 차단 (Level 1 deterministic assertion) + 사용자 액션 사유 enum capture**.
>
> 5 framework 컨센서스 (Hamel Husain / Shankar / Yan / Anthropic / Kothari) 의 "관찰 → 분류 → binary 기준 → assertion" 흐름의 첫 두 단계 시작. 옵션 A 의 "원칙 5-7 개 미리 정의" 보다 보수적인 데이터-우선 진로.

---

## 오늘 슬라이스

옵션 X — Level 1 assertion + 액션 사유 enum.

리서치 → 결정 framework reference → 질문 트리 → momus 리뷰 (2 BLOCKER + 5 IMPROVEMENT → revise → APPROVED) → subagent-driven 으로 2 commit.

## Commits

```
bf7bde1 feat(action-reasons): capture optional reason on retry/accept/skip/cancel
49d7fe4 feat(qa): Level 1 deterministic assertions on top of agent_review LLM verdict
```

총 변경: agent-review.js + 신규 verify-level1-assertions.mjs (unit test 6/6 통과) + job.js / server.js / sidepanel.js / sidepanel.css.

## What shipped

### A. Level 1 deterministic assertion in agent_review

**원동력**: 실 잡 88a27157 에서 agent_review LLM 이 finalUrl=/sign-in 인데도 passed=true 찍음. 합성 검증 4/4 통과와 모순 — LLM 만 믿으면 false-pass 발생.

**구현** (`orchestrator/lib/qa-adapters/agent-review.js`):
- `runLevel1Assertions(evidence, job)` export 함수 — 5 assertion + warnings 배열
  - **A1** (hard fail): finalUrl 에 `/sign-in` 포함 → 권한 가드 회귀
  - **A2** (hard fail): HTTP 비-2xx → 라우트 깨짐
  - **A3** (warning only): targetRoute ≠ finalPath → 의도된 redirect 가능성 큼. final verdict 영향 X, evidence.assertionWarnings[] 에만 기록
  - **A4** (hard fail): 빈 body 렌더 — `< 20 자` 또는 `<div id="root"></div>` 정확 매칭. hydration race 우려로 임계값 보수적
  - **A5** (hard fail): pageErrors[] 비어있지 않음 → uncaught throw
- assertion 호출 위치를 `capturePageEvidence` 직후 (LLM 호출 전) 로 옮김 — LLM 실패 시도 deterministic verdict 살아남음
- `buildEvidence` helper 가 5 개 LLM-실패 early-return path 모두 evidence 에 assertion 결과 보존
- 정상 path 결합: `finalPassed = passed && lvl1.passed` — LLM pass + assertion pass 만 final pass
- evidence 에 신규 필드: `assertionPassed` / `assertionFailures[]` / `assertionWarnings[]` / `llmVerdict`

**검증**: `orchestrator/scripts/verify-level1-assertions.mjs` unit test 6 케이스 (A1-A5 + clean) 6/6 통과. A3 케이스는 `expectedPassed=true + expectedWarningRegex`.

### B. 액션 사유 enum capture (server + Chrome ext)

**원동력**: 5 framework — "shipped 직전 capture 못 하면 영영 손실". 사용자가 retry/skip/cancel 누르는 사유가 매번 사라지면 후처리 분석 불가.

**Server** (`orchestrator/lib/job.js`):
- `ACTION_REASONS` frozen enum 7 개: `syntax_error / logic_error / scope_creep / partial / wrong_target / over_delivered / other`
- `normalizeReason(reason)` — invalid 면 null
- 4 액션 함수 시그니처 확장: `retryTask` / `acceptTask` / `skipTask` / `cancelJob` 모두 optional `actionMeta = { reason, reasonText }`
- task 의 경우 `task.actionHistory[].push({kind, reason, reasonText, at})` 누적
- cancel 의 경우 `job.cancelMeta = {reason, reasonText, at}` 단일
- 후위 호환: reason 미전달 시 actionHistory push 안 함, 기존 동작 그대로

**Server router** (`orchestrator/server.js`): 4 라우터 (`retry-task` / `accept-task` / `skip-task` / `cancel`) 모두 body 에서 reason / reasonText 추출 후 actionMeta 로 lib 에 전달.

**Chrome ext** (`chrome-extension/sidepanel.js` + `sidepanel.css`):
- `appendTaskFailActions` 안에 reason picker `<select>` 추가 (8 옵션 — 빈 옵션 + 7 enum)
- post() body 에 `reason: picker.value || undefined` 포함
- CSS 3 신규 클래스 (`.task-fail-reason-picker` / `.task-fail-reason-label` / `.task-fail-reason-select`)
- 강제 X — 인지 부담 줄임. 미선택 시 JSON.stringify 가 키 제거

### Slack / Playground 는 follow-up

명시적 v0 외. plan 의 주의사항 #7 에 entry point 적혀있음:
- Slack: `molly.js:826` `handleTaskAction` — value 에 modal trigger 추가, `views.open` 으로 picker. ~1.5h
- Playground: `JobCard.tsx:1052` `<ReviewFailActions>` — 버튼 옆 select. ~30 min
- 합쳐 별도 슬라이스 ~2-3h

## Files changed

```
M  orchestrator/lib/qa-adapters/agent-review.js  (assertion + buildEvidence helper)
A  orchestrator/scripts/verify-level1-assertions.mjs  (unit test)
M  orchestrator/lib/job.js  (ACTION_REASONS enum + 4 함수 시그니처)
M  orchestrator/server.js  (4 라우터 body 추출)
M  chrome-extension/sidepanel.js  (picker)
M  chrome-extension/sidepanel.css  (.task-fail-reason-picker)
```

## 다음 세션 첫 5분 (Pre-flight)

```bash
git status --short
git log --oneline -10

# 서비스
curl -s -o /dev/null -w "orch :3847 → %{http_code}\n" http://localhost:3847/api/playground

# unit test
node orchestrator/scripts/verify-level1-assertions.mjs
# expect: 6/6 통과

# orchestrator restart 필요 (assertion + actionMeta server 변경)
# Chrome ext reload 필요 (picker UI)
```

## Manual E2E (사용자 측)

orchestrator 재시작 + Chrome ext reload 후:

| 케이스 | 기대 결과 |
|---|---|
| 권한 가드 시나리오 (TAS 에 admin-only 페이지 추가) | qaAutoResult.passed=false + assertionFailures 에 A1 |
| 정상 잡 | qaAutoResult.passed=true + assertionFailures=[] + assertionWarnings=[] |
| 의도된 redirect (form submit 후 /list) | passed=true + assertionWarnings 에 A3 (final 영향 X) |
| Chrome ext fail-actions picker — "scope_creep" 선택 후 [그대로 통과] | jobs json 의 task.actionHistory[0] = {kind:'accept', reason:'scope_creep', ...} |

검증 명령:
```bash
cat orchestrator/state/job/<jobId>.json | python3 -c "import sys,json;j=json.load(sys.stdin);[print(t.get('id'),t.get('actionHistory')) for t in j.get('tasks',[])]"
```

## 다음 세션 후보 (우선순위)

### 1. multi-tenant v1 (~1-2 주, 사용자 명시 follow-up)

리서치 끝남 (`docs/superpowers/research/2026-04-30-multi-tenant-onboarding.md`). v1 권장:
- `Agent-Design-System/msm-portal/js/msm-portal-web/src/apps/{client}/config/theme.ts` 추가 (각 클라 customTheme 채움)
- `pnpm client-app generate` CLI 확장 (vite.config.ts alias / package.json / .firebaserc 자동 패치)
- 새 클라 1개 받는 시간을 1-3 일 → 반나절 수준으로

### 2. Slack/Playground reason picker — Slice 3 follow-up

위 plan 주의사항 #7 에 entry point. ~2-3h.

### 3. molly chat mode 운영 개선 (Task #13)

- 서버 fallback 보수성 (PRD-like 길이/키워드 휴리스틱)
- status_query thread_ts 기반 Job lookup
- Classifier observability (input/output 로깅)
- Slack/Playground typing indicator

### 4. Chrome ext follow-up (Task #7)

- task-transition card dirty-check
- Promote 카드 idempotent unlock
- cancelled 카드 surface
- cumulative chat overflow 정리

### 5. 데이터 누적 측정

50 잡 누적 후 분석:
- assertionPassed != llmVerdict 케이스 (LLM 의 false-pass 빈도)
- task.actionHistory[].reason !== null 비율 (< 30% 면 v1 강제 enum)
- A3 warning 의 의도된 redirect vs 회귀 비율 (7:3 이상이면 hard fail 전환)

## 알려진 한계

- **A3 false positive 잠재**: 의도된 redirect 케이스 (`/orders` → `/orders/123`). v0 정책 = warning only 라 final verdict 영향 X 지만, evidence 에 노이즈 누적. 50 잡 후 패턴 보고 결정.
- **A4 hydration race**: SPA 가 networkidle 후 hydrate 끝나기 전에 measured 되면 false fail. 임계값 < 20 + 명시적 패턴으로 보수적이지만 잠재.
- **Picker 미선택률 미관측**: 50 잡 누적까지 데이터 없음.
- **Slack/Playground reason 미적용**: Chrome ext 만 v0. 해당 surface 의 데이터는 누락.

## How to start the next session

```
이전 세션 핸드오프:
  docs/superpowers/handoffs/2026-04-29-chrome-ext-step-3-4.md
  docs/superpowers/handoffs/2026-04-30-molly-chat-mode.md
  docs/superpowers/handoffs/2026-04-30-l1-assertions-action-reasons.md

main 깨끗. 마지막 2 commits:
  bf7bde1 feat(action-reasons): ...
  49d7fe4 feat(qa): Level 1 deterministic assertions ...

리서치 docs (의사결정 reference):
  docs/superpowers/research/2026-04-30-feedback-loop-decision-framework.md
  docs/superpowers/research/2026-04-30-molly-feedback-loop.md
  docs/superpowers/research/2026-04-30-molly-failure-taxonomy.md
  docs/superpowers/research/2026-04-30-multi-tenant-onboarding.md

우선순위:
  1. multi-tenant v1 — research 끝남, plan 작성 시작 가능
  2. Slack/Playground reason picker — Slice 3 follow-up
  3. molly chat mode 운영 개선 / Chrome ext follow-up

서비스: orchestrator :3847 / playground-app :4180 / dashboard :4174
orchestrator restart 필요 (assertion + actionMeta).
Chrome ext reload 필요.
```

---

*마지막 업데이트: 2026-04-30 저녁*
