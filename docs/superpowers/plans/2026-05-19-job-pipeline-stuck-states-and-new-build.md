# Plan v4 — Job pipeline: stuck-states UX + "new build" review relaxation

**Date:** 2026-05-19
**Author:** kyungjae.ha (with Claude session)
**Status:** **DEPRECATED v1** — superseded by `2026-05-19-job-pipeline-auto-progress-and-final-summary.md` (사용자 통찰: interim review fail UI 개선이 아니라 제거. AI 자동 진행 + final summary + 후속 PRD 패러다임으로 전환). Momus 리뷰 결과 + 사용자 결정으로 G1-G4 (skip cascade UX) 폐기, G5-G7 (is_new_build) 는 새 plan에 흡수.
**Trigger:** 핸드오프 `2026-05-19-plan-emitter-v2-user-facing-and-ui-cleanup.md` §5.1 row 1 (Skip → BLOCKED cascade UX, 2-3h) + row 2 (Review fail "new build" 약화, 1h plan + 2-4h 실행). 두 항목 모두 §5.0 "confusion-free user flow first" 원칙에 직속.
**Parents:**
- 이전 핸드오프 §1.2 issue #5 (Review fail "DS component 미사용" 스크린샷 #32)
- 이전 핸드오프 §1.2 issue (job 7e3c57f9 — 11 tasks 중 7개 blocked, Resume이 의미 없는 상태로 사용자가 직접 hit)

---

## 1. 문제 진술

### 1.1 두 stuck state — 사용자는 똑같이 "막힌" 으로 인식하지만 backend는 다름

| stuck state | backend signal | 사용자가 봐야 하는 것 |
|---|---|---|
| **A. Skip cascade로 blocked만 남음** | `job.status='paused'`, `pausedReason='stuck: N task(s) need intervention'`. 모든 unfinished task `status='blocked'`. | "내가 skip 한 결과로 N개가 막힘. Resume 해도 더 진행 안 됨. 직접 처리 필요." |
| **B. Review fail로 paused** | `job.status='paused'`, `pausedReason='review-fail on task X: notes'`. 1개 task `status='failed', review.verdict='fail'`. | "이 task는 review가 거부. (1) 재시도 (2) 그대로 수용 (3) skip 중 선택." |

지금 UI는 둘 다 동일한 노란 banner (`⏸ {pausedReason}`) + 항상 enabled 인 Resume 버튼. 사용자는 "Resume 누르면 뭐가 되는지" 알 수 없음. (job 7e3c57f9 케이스: 사용자가 Resume 눌렀지만 ready task 0개라 즉시 같은 paused 상태 복귀.)

### 1.2 "DS strict review" — 신규 컴포넌트 도입 흐름에서 항상 fail

plan-emitter가 새 페이지 / 새 컴포넌트 만드는 task를 생성하면, 코딩 agent는 hand-rolled `<button>` / `<div>` 등을 쓸 수밖에 없음 (해당 DS 컴포넌트가 아직 없음 / DS Missing case). 하지만 review agent는 Rule 7 ("raw `<button>` instead of `MCButton2`" 발견 시 fail) 을 무조건 적용 → 새 컴포넌트 도입 task 는 review fail로 막힘. 이전 핸드오프 §1.2 issue #5 스크린샷 #32 케이스.

### 1.3 두 문제의 공통 origin

두 stuck state 모두 **"사용자가 진행 의도를 명확히 했지만, 시스템의 안전 장치가 그 의도와 충돌"** 패턴. 해결책의 공통 형태:
1. 사용자 의도 신호를 plan 단계에서 명시적으로 캡처 (`is_new_build`).
2. 시스템 안전 장치가 그 신호를 read하여 strict 강도를 조정 (review prompt rule 7 약화).
3. 안전 장치가 발동된 후의 상태 (skip cascade, review fail) UX를 명료화하여 다음 액션을 사용자가 1-click으로 결정.

---

## 2. 목표 / 비목표

### 2.1 목표 (G1-G7)

**스킵·블록 흐름 (G1-G4)**
- **G1** — Playground JobCard Skip 버튼 클릭 시 confirm dialog: "이 task를 skip하면 N개 dependent task가 blocked 됩니다. 계속?". N=0이면 confirm 생략, N≥1이면 강제 표시.
- **G2** — Resume 버튼: 모든 remaining unfinished task가 `blocked` 상태인 경우 disabled + tooltip "모든 다음 task가 blocked — skip 결과 직접 처리 필요". `acting` 중에도 disable 동일.
- **G3** — paused banner 두 가지 case로 분기:
  - **stuck-blocked** (`pausedReason.startsWith('stuck:')`): 노란 ⏸ → 빨간 🚧 + "N개 task가 blocked 상태입니다. 각 task의 ✗ Skip 또는 ✓ Accept as-is 로 처리하세요." + Resume 비활성 안내 명시.
  - **review-fail** (`pausedReason.startsWith('review-fail')`): 기존 노란 ⏸ 유지하되, 본문에 "해당 task의 인라인 액션 (Retry / Accept as-is / Skip) 으로 결정하세요." 추가.
- **G4** — blocked task row에 ✓ "Accept as-is" 액션 추가 (downstream 의존성 만족시키며 진행 — 빈 commit 또는 마지막 reviewed sha 그대로). 백엔드: `acceptJobTask` 가 `status='blocked'` 도 허용하도록 FSM 완화 + 빈 output 처리.

**Review strict 완화 (G5-G7)**
- **G5** — `plan_item.is_new_build: boolean` 스키마 필드 추가 (plan-emitter SYSTEM_PROMPT + JSON schema). 의미: "이 task는 codebase에 동등한 DS 컴포넌트가 존재하지 않는 *신규* 컴포넌트/페이지 도입. hand-rolled markup 허용."
- **G6** — `planItemsToTasks` 가 `task.isNewBuild` 로 전파. `runJob` → `reviewTaskDiff(task, ...)` 호출에서 forwarded. `job-reviewer.js` SYSTEM_PROMPT Rule 7: "If `task.isNewBuild === true`, skip the DS-equivalent check for this task. Hand-rolled markup is allowed because this task is *introducing* the component to the codebase."
- **G7** — JobCard task row + Playground PlanCard item에 `🛠 New build` 작은 badge. 사용자에게 "이 task는 신규 도입이라 review strict 완화됨" 가시화.

### 2.2 비목표
- ~~Slack confirm dialog~~ — Slack은 modal 인터랙션 부재. 별도 thread 메시지로 "Skip 시 N개 blocked" 안내 정도만 가능. **별 PR로 분리** (Slack은 이번 plan 범위 밖).
- ~~Chrome ext의 Skip cascade UX~~ — sidepanel.js 의 job progress 카드는 task-level 액션을 제공하지 않음 (현재 Inspect Console 링크만). Chrome ext skip 흐름 자체가 없으므로 **이 plan 범위 밖**.
- ~~auto-resolve blocked (FSM-level)~~ — blocked의 의미는 그대로 유지 (사용자가 직접 처리해야 함). UX만 명료화. backend FSM에 새 transition 추가는 G4 의 acceptJobTask 허용 1개만.
- ~~plan-emitter가 `is_new_build`를 자동 판정~~ — 시범 단계는 plan-emitter prompt에 규칙 명시 + 자체 판단. 향후 (별 plan) DS missing 신호 (unresolved_components 와 cross-check) 로 자동 추론 가능.
- ~~review prompt 전면 재작성~~ — Rule 7 1개 룰의 conditional skip만. 다른 6개 룰은 unchanged.
- ~~retroactive `isNewBuild` migration~~ — 기존 job 들은 `isNewBuild=false`로 default. 새 PRD 부터 적용.

### 2.3 §5.0 confusion-free 원칙과의 정합성

G1-G4는 모두 "사용자가 어떤 상태인지, 다음에 무엇을 해야 하는지" 를 명시적으로 보여주는 UX 변경. G5-G7은 review가 사용자 의도와 충돌하는 case를 plan 단계의 의도 신호로 사전 차단 (review fail이 일어나기 전 단계 변경). 둘 다 사용자가 "왜 막혔지" 추측할 필요 없음.

---

## 3. 사용자 답 (가설 — 사용자 1-2 round confirmation 필요)

| # | 가설 | 영향 |
|---|---|---|
| 1 | Skip confirm은 N≥1 시에만 노출 (N=0이면 즉시 skip) | UX 마찰 최소화. 의존 없는 task skip은 빈번 → 매번 confirm은 oversold. |
| 2 | Resume disabled tooltip은 "모든 다음 task가 blocked" 한국어로 (영어 PRD에도 한국어 OK — UI 텍스트는 사용자 locale) | Tving Korean 사용자가 primary. msm-portal i18n과는 별 surface. |
| 3 | `🛠 New build` badge는 plan stage + JobCard 둘 다 노출 | 사용자가 Run 전 plan 확인 단계에서도 "이건 신규 도입이라 strict review off" 알 수 있어야 함. |
| 4 | `is_new_build` 자동 판정 신호 — plan-emitter가 `unresolved_components`에 entry가 있는 plan_item을 자동으로 `is_new_build=true` 설정 | 사용자가 PRD에 명시 안 해도 DS missing signal로 추론. plan-emitter prompt에 룰 추가. |
| 5 | G4 "Accept as-is" on blocked task — 빈 commit 또는 skip 의 alias? | 빈 commit 보다는 "task를 skipped로 marking하고 dependents 도 정상 진행하도록 cascade 없이" 처리가 의도에 맞음. (= blocked → skipped, propagateBlocked 호출 X) |

→ 사용자 답 받기 전 단계는 draft 상태. 답 받으면 v2.

---

## 4. 구현 세부

### 4.1 G1 — Skip confirm dialog (Playground)

**File:** `playground-app/src/editor/JobCard.tsx`

**위치 1:** TaskRow의 ✗ Skip 버튼 (line 818 추정 — explore 결과)
- onClick → `computeCascadeCount(job.tasks, task.id)` (helper) → N≥1 시 `window.confirm(\`이 task를 skip하면 ${N}개 dependent task가 blocked 됩니다.\\n\\n계속할까요?\`)` → 거부 시 early return.
- `computeCascadeCount` — `dependsOn` 역방향 그래프 BFS, status='pending' 인 descendant만 count. (`propagateBlocked` backend 로직과 동치, frontend mirror.)

**위치 2:** ReviewFailActions의 ✗ Skip 버튼 (이미 cascade tooltip 있음, JobCard.tsx:781-788)
- 동일 confirm 적용.

**테스트:**
- Unit (vitest): mock job with 11 tasks (job 7e3c57f9 형태), skip t1 → cascade=10 → confirm fires.
- Manual: Playground 에 multi-step job 만들고 skip t2 → "1개 dependent task가 blocked 됩니다" 표시 확인.

### 4.2 G2 — Resume disabled + tooltip

**File:** `playground-app/src/editor/JobCard.tsx` line 132 + 456

**Change:**
```tsx
const allBlocked = job.status === 'paused' && job.tasks.every(
  (t) => t.status === 'reviewed' || t.status === 'skipped' || t.status === 'blocked',
) && job.tasks.some((t) => t.status === 'blocked');
const canResume = job.status === 'paused' && !allBlocked;
// ...
<button
  disabled={!canResume || acting}
  title={allBlocked ? '모든 다음 task가 blocked — 각 task의 ✗ Skip 또는 ✓ Accept as-is 로 처리하세요' : undefined}
  onClick={() => runAction(() => resumeJob(job.id))}
>
  Resume
</button>
```

**테스트:** job 7e3c57f9 같은 fixture (10 blocked + 1 reviewed) → Resume disabled + tooltip 표시.

### 4.3 G3 — Paused banner 분기

**File:** `playground-app/src/editor/JobCard.tsx` line 247-261 (`job.pausedReason` banner)

**Change:** 기존 `⏸ {job.pausedReason}` 를 2-branch로:
```tsx
{job.pausedReason && (() => {
  const stuck = job.pausedReason.startsWith('stuck:');
  const reviewFail = job.pausedReason.startsWith('review-fail');
  return (
    <div style={{ ...(stuck ? STUCK_BANNER : PAUSE_BANNER), marginBottom: 8 }}>
      <div style={{ fontWeight: 500 }}>
        {stuck ? '🚧 ' : '⏸ '}
        {job.pausedReason}
      </div>
      <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
        {stuck
          ? '아래 blocked task 각각을 ✗ Skip 또는 ✓ Accept as-is 로 처리한 후 Resume 하세요. Resume 만으로는 진행 불가.'
          : reviewFail
            ? '아래 failed task의 인라인 액션 (🔁 Retry / ✓ Accept as-is / ✗ Skip) 으로 결정하세요.'
            : null}
      </div>
    </div>
  );
})()}
```

`STUCK_BANNER` (빨간) vs `PAUSE_BANNER` (노란) 토큰. `--bg-danger-subtle` / `--border-danger` / `--text-danger` 사용.

### 4.4 G4 — "Accept as-is" on blocked task

**Backend file:** `orchestrator/lib/job.js` — `acceptTask(jobId, taskId)` (acceptJobTask client → server)

**현재 FSM:** acceptJobTask 는 `status='failed'` 이고 `review.verdict='fail'` 인 task만 허용 (review fail recovery). blocked는 거부.

**Change:** blocked → reviewed 허용 + `review.verdict='accept_as_is'` 마킹. **단** propagateBlocked는 호출하지 않음 (이미 blocked = 이미 cascaded). 그리고 이 task에 의존하는 descendant 중 `status='blocked'` 인 것들을 *pending* 으로 되돌려야 함 — 즉 reverse propagation. 새 helper: `propagatePendingFromAccept(job, taskId)` — BFS, blocked descendant 중 dependsOn 가 모두 reviewed/skipped 인 것만 pending 으로.

(주의: revert propagation은 안전성 검증 필수. 잘못하면 이미 user-skip한 task의 dependent까지 살아남. → BFS에서 *직접 deps*가 모두 ok인 경우만 unblock.)

**Frontend file:** `playground-app/src/editor/JobCard.tsx`
- TaskRow의 `canAccept`에 `task.status === 'blocked'` 추가.
- ✓ Accept-as-is 버튼 라벨 변경 ("✓ Accept as-is — leave empty" 등).

### 4.5 G5 — `is_new_build` 스키마 + plan-emitter

**File:** `orchestrator/lib/molly-plan-emitter.js`

**Schema 변경 (SYSTEM_PROMPT의 schema block):**
```
"plan_items": [
  {
    "id": "p1",
    "title": "...",
    "description": "...",
    "intent": "...",
    "target_file": "...",
    "is_new_build": true,           // NEW
    "referenced_components": [...],
    "unresolved_components": [...]
  }
]
```

**Rule 추가 (USER-FACING style rule 아래에 새 섹션):**
```
## Item flag: is_new_build

Set is_new_build:true on a plan_item iff the task **introduces** a new page, container, or component that does not have an equivalent DS component in the codebase yet. The coding agent will write hand-rolled markup, and the per-task reviewer will allow it for THIS task only.

is_new_build:false (default) — the task modifies existing UI or uses existing DS components. Hand-rolled markup will be flagged.

Heuristic — if the plan_item populates unresolved_components or references a brand-new file path under a new feature folder (no existing component fits), set is_new_build:true. Otherwise false.
```

**Q4의 자동 판정:** Heuristic만 prompt에 명시. 더 강력한 cross-check (`unresolved_components.length > 0 → is_new_build=true` post-process)는 별 PR로 분리.

### 4.6 G6 — Reviewer prompt + task flow

**File 1:** `orchestrator/lib/job.js` — `planItemsToTasks` (line 145-158 추정)
- `task.isNewBuild = !!plan_item.is_new_build` 추가.

**File 2:** `orchestrator/lib/job-runner.js` — `reviewTaskDiff` 호출 (line 296-307)
- Forwarded task 객체에 이미 isNewBuild가 들어있음 (job-runner.js가 full task spread).

**File 3:** `orchestrator/lib/job-reviewer.js` — SYSTEM_PROMPT Rule 7 (line 26)
- Existing: "Design system check — fail if the diff introduces *new* hand-rolled UI..."
- New: prepend "If `task.is_new_build === true`, skip this rule and accept hand-rolled markup. Otherwise, the existing rule applies." (system prompt에서 task 객체 inject 시 `is_new_build` field 같이 전달.)

**Reviewer caller도 확인:** reviewer call signature가 task의 임의 field 그대로 받는지. 만약 `{ id, title, description }` 만 받는다면 sig 확장 필요.

### 4.7 G7 — `🛠 New build` badge

**File 1:** `playground-app/src/editor/AIPanel.tsx` — `PlanCard` (line 3175-3196 plan item rendering)
- 각 plan item 옆에 `item.is_new_build === true` 시 작은 badge `🛠 New build` 추가. shared-ui Chip 컴포넌트 재사용.

**File 2:** `playground-app/src/editor/JobCard.tsx` — TaskRow header
- `task.isNewBuild === true` 시 task title 옆에 동일 badge.

**File 3:** `chrome-extension/sidepanel.js` — `addPlanItemsCard` (line 2578-2592 plan item rendering)
- `p.is_new_build === true` 시 plain `<span>🛠 New build</span>` 추가.

---

## 5. UX 화면 변화 — before / after

### 5.1 Skip cascade — job 7e3c57f9 type 케이스

**Before:**
```
[Job header]
⏸ stuck: 7 task(s) need intervention
[Task list]
  t1 ✅ reviewed
  t2 ⊘ skipped
  t3 ✅ reviewed
  t4 ✅ reviewed
  t5 🚫 blocked     ← user has no idea what to do
  ...
  t11 🚫 blocked
[Resume button]    ← enabled, does nothing useful
```

**After:**
```
[Job header]
🚧 stuck: 7 task(s) need intervention
   아래 blocked task 각각을 ✗ Skip 또는 ✓ Accept as-is 로 처리한 후 Resume 하세요. Resume 만으로는 진행 불가.
[Task list]
  t1 ✅ reviewed
  ...
  t5 🚫 blocked [✗ Skip] [✓ Accept as-is]
  ...
  t11 🚫 blocked [✗ Skip] [✓ Accept as-is]
[Resume button] (disabled — tooltip: 모든 다음 task가 blocked)
```

### 5.2 Review fail — DS strict 케이스

**Before:**
```
⏸ review-fail on task t3: introduced raw <button> instead of MCButton2
[Task list]
  ...
  t3 ⚠ failed   review notes: introduced raw <button>...
    [🔁 Retry] [✓ Accept as-is] [✗ Skip]
```

**After (G5-G7 적용 후 plan-emitter가 t3에 is_new_build=true 박았으면):**
```
[PlanCard 단계에서]
  3. Build a single ad unit row with slider 🛠 New build
     설명: 이 작업이 끝나면 광고 단위 행에 슬라이더가 보입니다.

[Run 이후 JobCard에서]
  t3 ✅ reviewed   (review 통과, 새 컴포넌트 도입 strict off)
```

기존 review-fail banner는 is_new_build=false 인 task가 hand-rolled markup 쓴 case에만 발화. 사용자가 "왜 fail 됐는지" 명확히 인지 가능.

---

## 6. 검증 방법

### 6.1 Unit / 통합 테스트
- `orchestrator/test/job.test.js` — `acceptTask` 가 status=blocked 도 허용 + propagatePending 정상 작동 (G4)
- `orchestrator/test/job-reviewer.test.js` — task.is_new_build=true 인 case에 Rule 7 skip (G6)
- `playground-app/...` vitest — `computeCascadeCount` helper (G1), allBlocked detection (G2)

### 6.2 Paired smoke (PRD → end-to-end)
- 기존 5 PRD fixture (`orchestrator/scripts/plan-emitter-paired-smoke.mjs`) + 새 fixture 1개: **"Build a brand-new Traffic Control page from scratch"** (full new feature, multiple plan items expected to have `is_new_build=true`).
- 검증 포인트:
  - plan-emitter output: 신규 컴포넌트 도입 plan_item에 `is_new_build:true`.
  - downstream Job task: `task.isNewBuild===true`.
  - job-reviewer Rule 7 skip 시 review pass.
- 측정: 새 fixture를 paired-evaluate.mjs에 추가, `--include-is-new-build` 검사 옵션.

### 6.3 Manual UX 검증 (사용자 직접)
- **Skip cascade**: job 7e3c57f9 fixture replay (또는 그 형태의 새 job) → 화면 노란→빨간 banner 전환, Resume disabled, blocked task에 Accept as-is 동작.
- **Review fail 약화**: "Build a brand-new Traffic Control page" 형태의 PRD 발사 → 신규 컴포넌트 task가 review fail 없이 통과.
- **PlanCard badge**: 위 PRD plan card에 `🛠 New build` 표시.

### 6.4 Telemetry
- 새 metric: `task_skip_cascade_n` (skip 시 cascade 크기 분포)
- 새 metric: `is_new_build_ratio` (plan_items 중 is_new_build=true 비율 — 너무 높으면 plan-emitter가 over-flag)
- 기존 review fail rate 변화: before/after 5 PRD smoke (`docs/measurements/plan-emitter-paired-after-...json` 에 review verdict 추가)

---

## 7. 리스크 + 미해결 결정

### 7.1 리스크 — Rxx

| # | 리스크 | 영향 | 완화 |
|---|---|---|---|
| **R1** | plan-emitter가 `is_new_build`를 과도하게 true로 마킹 → review가 너무 느슨해져 실제 DS 미사용 케이스 통과 | DS 일관성 저하 | §6.4 telemetry로 비율 monitoring, 50% 이상이면 prompt revisit. Heuristic prompt를 보수적으로 작성 (default false). |
| **R2** | G4 "Accept as-is on blocked" 의 propagatePending 로직이 잘못된 task까지 unblock | downstream graph corruption | 직접 deps만 검사 (transitive 안 함). Unit test로 cycle / 다단계 의존 cover. v1은 G4를 **opt-in feature flag** 뒤에 둘 것 (`acceptBlockedTasksEnabled`). |
| **R3** | G3 banner 분기가 unknown `pausedReason` 형식 (예: `decompose failed: ...`) 을 못 잡아서 default 노란만 표시 | 새 stuck state 추가 시 안내 누락 | `else` fallback에 "다음 액션을 결정한 후 Resume 하세요" 일반 안내 추가. |
| **R4** | `is_new_build` 도입으로 reviewer signature 변경 → 기존 호출자 (Slack 등) 가 안 보내면 prompt 에러 | 빌드 break | reviewer 가 task.is_new_build 를 optional로 처리 (`!!task?.is_new_build`). 기본값 false → strict rule 그대로. |
| **R5** | Slack은 이번 plan에서 confirm UX 미적용 → 사용자가 Slack/Playground 차이로 혼란 | 일관성 부족 | 비목표로 명시 (§2.2). 별 PR로 Slack-side cascade UX 추가 가능 (block kit modal 또는 confirm-with-button). |
| **R6** | UI 텍스트가 한국어 hard-code → 영어 UI 환경 사용자 (개발팀 일부) 에 어색 | 일부 사용자 UX | `feedback_code_in_english.md` 메모리: code identifiers 영어, UI copy는 user locale. Tving primary = Korean. 영어 사용자 분은 i18n 별 thread. |

### 7.2 미해결 결정 (사용자 답 필요)

| # | 항목 | 옵션 |
|---|---|---|
| **D1** | "Accept as-is on blocked" 의 실제 backend 동작 | (A) blocked → reviewed (가짜 통과). dependent unblock. (B) blocked → skipped + propagatePending. (C) 빈 commit 만들고 reviewed. |
| **D2** | `is_new_build` 자동 판정 — plan-emitter가 unresolved_components 있는 plan_item 을 자동 is_new_build=true 로? | (A) Heuristic 만 prompt에 명시 (간단). (B) post-process로 unresolved>0 → is_new_build=true 강제 (강력). |
| **D3** | Skip confirm 의 cascade count 계산 — backend round-trip vs frontend mirror? | (A) frontend BFS (즉시, 의존 그래프 정확). (B) skipTask 호출하면서 dry-run 모드 추가. |
| **D4** | G4를 feature flag 뒤에? | (A) 즉시 출시 (이 plan 범위). (B) `acceptBlockedTasksEnabled` env var 뒤. |
| **D5** | "🛠 New build" badge 색상 / 위치 | shared-ui Chip color 토큰 — `info` (파란) vs `warning` (주황) vs 새 토큰 |

→ 이 5개 답 받으면 v2 작성.

---

## 8. 일정 추정 (D1-D5 답 받은 가정)

| 항목 | 추정 |
|---|---|
| G1 (skip confirm) | 1h |
| G2 (resume disable) | 0.5h |
| G3 (banner 분기) | 1h |
| G4 (accept-as-is on blocked) | 3-4h (backend FSM + propagatePending + frontend + tests) |
| G5 (is_new_build schema + prompt) | 1h |
| G6 (reviewer flow) | 1.5h |
| G7 (badge UI 3 surface) | 1.5h |
| Paired smoke 추가 | 1h |
| 측정 + telemetry | 1h |
| **합계** | **11-12h** (1.5 day) |

G4 가 가장 무거움. v2에서 G4를 feature flag 뒤로 미루면 -2h.

---

## 9. 실행 순서 (제안)

**Day 1 (morning, ~5h):**
1. G5 + G6 (`is_new_build` end-to-end) — backend 측 단순 작업
2. paired smoke 새 fixture 1개 + telemetry
3. 실 검증 1 round (사용자: 새 컴포넌트 도입 PRD 발사)

**Day 1 (afternoon, ~3h):**
4. G1 + G2 + G3 (Playground UI 3 변경) — 사용자 가시화
5. 실 검증 1 round (사용자: skip cascade case 만들고 UX 확인)

**Day 2 (~3-4h):**
6. G4 (가장 위험한 backend FSM 변경)
7. G7 (badge UI 3 surface)
8. 최종 검증 + 핸드오프

각 단계 후 짧은 평가 (§5.0 원칙대로) → 다음 단계.

---

## 10. 관련 파일 인덱스

### 백엔드 (예상 변경)
- `orchestrator/lib/job.js` — `acceptTask`, `propagatePendingFromAccept` 신규, `planItemsToTasks` (G4, G6)
- `orchestrator/lib/job-runner.js` — `reviewTaskDiff` 호출 시 task 전체 전달 확인 (G6)
- `orchestrator/lib/job-reviewer.js` — SYSTEM_PROMPT Rule 7 conditional (G6)
- `orchestrator/lib/molly-plan-emitter.js` — schema + USER-FACING 룰 아래에 `is_new_build` 섹션 (G5)

### 프론트 (예상 변경)
- `playground-app/src/editor/JobCard.tsx` — TaskRow skip confirm, banner 분기, Resume disable, blocked accept-as-is, badge (G1, G2, G3, G4, G7)
- `playground-app/src/editor/AIPanel.tsx` — PlanCard plan item badge (G7)
- `chrome-extension/sidepanel.js` — plan card plan item badge (G7)

### 측정 / 스크립트
- `orchestrator/scripts/plan-emitter-paired-smoke.mjs` — 새 PRD fixture 1개 (G5 검증)
- `orchestrator/scripts/plan-emitter-paired-evaluate.mjs` — `is_new_build` 검사 옵션 (G5)

### 새 telemetry
- `task_skip_cascade_n`, `is_new_build_ratio` (G1, G5)

### 핸드오프
- 본: 다음 세션 종료 시 `docs/superpowers/handoffs/2026-05-2X-plan-v4-stuck-states-and-new-build.md` 작성
- 이전: `docs/superpowers/handoffs/2026-05-19-plan-emitter-v2-user-facing-and-ui-cleanup.md`

---

*Plan v1 작성: 2026-05-19 저녁 Claude session. 사용자 D1-D5 답 + 1차 리뷰 후 v2 작성 예정.*
