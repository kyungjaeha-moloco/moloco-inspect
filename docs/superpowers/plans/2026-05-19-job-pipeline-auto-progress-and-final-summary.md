# Plan — Job pipeline auto-progress + final summary + new-build review relaxation

**Date:** 2026-05-19 (저녁)
**Author:** kyungjae.ha (with Claude session)
**Status:** **draft v3** — momus 2차 리뷰 4 🔴 + 7 🟡 모두 반영 + 사용자 추가 결정 2건 (severity=A reviewer 같이, revert=A leaf-only). v2는 paradigm shift commit, v3는 안전망 추가.
**Trigger:** 핸드오프 `2026-05-19-plan-emitter-v2-user-facing-and-ui-cleanup.md` §5.1 row 1 (Skip → BLOCKED cascade UX) + row 2 (Review fail "new build") + 사용자 통찰 (2026-05-19 저녁): "리뷰 페일을 사용자가 진행중에 보는걸 없에야 한다. AI가 다 진행하고, 그것에 대해서 후속 job이나 계획으로 추가 작업하면서 개선하면 된다."
**Predecessor:** `docs/superpowers/plans/2026-05-19-job-pipeline-stuck-states-and-new-build.md` v1 (DEPRECATED)
**Inherits from:** §5.0 confusion-free user flow first 원칙

---

## 1. 문제 진술 + paradigm shift

### 1.1 기존 가정 (폐기)
"사용자가 task 단위 review fail에 개입한다." 11 task plan에서 review fail이 3건 발생하면 사용자는 3번 Retry/Accept/Skip 결정. Skip이 cascade 만들면 또 결정. 결과: PM은 코드 의사결정을 할 수 없는데도 task-level 의사결정 강요받음.

### 1.2 새 paradigm — 3 layer
**Layer 1 — AI 자동 진행 (review fail은 warning으로 demote):**
- review verdict='fail' → task.status는 여전히 'reviewed' (계속 진행) + review.severity='warning' 메모.
- propagateBlocked 호출 안 함 (어차피 reviewed니까 dependents 진행 가능).
- **단 코드가 안 돌아가는 case** (adapter throws, build/syntax error, retry 소진) 만 paused → 이건 사용자가 진짜 알아야 함.

**Layer 2 — Final summary 1개 메시지:**
- Job 완료 시 사용자에게 결과 카드 1개:
  > ✅ 11/11 완료 · ⚠ 3 review warning · 5 파일 변경
  >
  > Warning 상세:
  > - t3 "광고 단위 행": review가 hand-rolled `<button>` 우려 (참고: 신규 도입 task)
  > - t6 "그룹화 row": review가 inline style 우려
  > - t9 "확인 dialog": review가 z-index 우려
  >
  > 💡 후속 작업 제안:
  > 1. "Traffic Control의 hand-rolled 버튼을 DS button으로 교체" [→ 보내기]
  > 2. "확인 dialog의 focus management 점검" [→ 보내기]

- 3 surface (Playground / Chrome ext / Slack) 동일 형태.

**Layer 3 — Revert 1-click on warning commits:**
- Final summary의 각 warning task에 `[↶ Revert]` 버튼. 클릭 → 해당 commit revert (working tree에 reverse patch + 새 commit).

### 1.3 In-build "new" component은 review가 fail 자체를 안 하도록
review가 fail 하더라도 warning으로 자동 진행되지만, **명시적으로 신규 도입 task는 애초에 warning도 안 뜨도록** plan 단계에서 신호 전달:
- plan-emitter가 `is_new_build:true` 마킹 (자동 판정 — unresolved_components 신호 기반)
- reviewer가 task.is_new_build=true 면 Rule 7 (DS equivalent) 스킵
- 결과: 신규 컴포넌트 도입 task는 깨끗한 ✅ reviewed, warning 없음.

---

## 2. 사용자 결정 anchor (2026-05-19 저녁 직접 답)

| # | 결정 | 답 |
|---|---|---|
| Q1 paradigm | interim review fail UI 제거, AI 자동 진행 + final summary | 채택 |
| Q2 is_new_build 신호 | (B) unresolved_components 자동 판정 | 채택 |
| Q3 Slack 포함 | (b) → 사용자 변경: 같이 (c) — paradigm shift로 Slack 변경 범위 줄어듦 | 같이 |
| 추가1 "진짜 막힘" 기준 | (A) 코드 안 돌아갈 때만 (build/syntax error / retry 소진) | A |
| 추가2 warning commit 처리 | (B) commit 하되 final summary에 revert 1-click | B |
| **v3 추가1 — Review severity 판단 방식 (Momus C2)** | (A) reviewer LLM 이 같은 호출로 severity 분류 | **A** |
| **v3 추가2 — Revert 충돌 처리 (Momus I1)** | (A) leaf-only — 후속 task 가 같은 파일 안 건드린 경우만 revert 활성, 충돌 case 는 grey out + tooltip → 새 PRD 로 처리 | **A** |

---

## 3. 목표 / 비목표

### 3.1 목표 (G1-G8)

**Layer 1 — Auto-progress with severity tier (v3 추가1 = A):**
- **G1** — Reviewer LLM 이 verdict 와 함께 severity 카테고리 판단. 카테고리 매핑:
  - `severity='critical'` — security (auth/login/data leak/XSS), runtime regression (build pass but breaks features), accessibility critical (focus trap broken, ARIA absence on form), data integrity (incorrect mutation paths).
  - `severity='warning'` — DS 미사용 (raw button/table/modal), inline style, naming convention, a11y minor (label improvements), patterns 미준수.
- Job runner handler 변경:
  - `verdict='fail' && severity='critical'` → 기존과 동일하게 `task.status='failed' + setJobStatus('paused')` — 사용자 개입 필요.
  - `verdict='fail' && severity='warning'` (or unset, default warning) → `task.status='reviewed'`, `review={ verdict:'fail', severity:'warning', notes }` 첨부, propagateBlocked 안 함, 다음 task 진행.
  - **build error / syntax / unhandled exception / retry 소진** 은 review 와 무관하게 기존 paused 흐름 유지 (코드 자체가 안 돌아감 case).
- **G1b — First-time onboarding notice (Momus C3):** Per-user `userInfoShownPostAutoProgress` flag (server-side persistent). 첫 final summary 표시 시 inline notice 1회: "AI 가 자동 진행하도록 바뀌었습니다. 아래에 모든 review 경고가 표시됩니다. 위험한 변경 (critical) 은 여전히 멈춰서 알려드립니다." 3 surface 모두.

**Layer 2 — Final summary card:**
- **G2** — Backend: `GET /api/job/:id/summary` (또는 job 객체에 `summary` field) — 통계 + warning task별 details. 데이터 shape는 §4.2.
- **G3** — Playground 3 surface UI — JobCard 하단에 final summary section (job.status='complete' 시 표시). PlanCard와 같은 chat bubble 시리즈 안에 머묾.
- **G4** — Chrome ext sidepanel addJobProgressMessage 가 폴링 → status=complete 감지 시 final summary로 카드 변환.
- **G5** — Slack: 기존 `/api/job` 폴링 alias 대신 job complete event 시 thread에 final summary 메시지 1개 자동 post.

**Layer 3 — Follow-up + revert:**
- **G6** — `POST /api/job/:id/followup-suggestions` (LLM 호출) — warning notes + diff summary → 1-3개 follow-up PRD 제안. Final summary 표시 시 lazy로 호출 (사용자가 보는 시점, opt-in cache 가능).
- **G7** — Follow-up suggestion 1-click → 새 PRD 자동 발사 (`POST /api/intake` 기존 flow 재사용, payload.userPrompt = suggestion text).
- **G8** — Revert: Final summary의 warning task별 `[↶ Revert]` 버튼 → `POST /api/job/:id/task/:taskId/revert` → 해당 task.commitSha 의 reverse patch를 working tree에 apply + 새 commit `revert: t3 ...`.

**New-build 신호 — paradigm 사전 정합:**
- **G9** — `plan_item.is_new_build:boolean` 스키마 + plan-emitter heuristic + post-process 안전망 (`unresolved_components.length > 0 && !is_new_build` → 강제 true).
- **G10** — `planItemsToTasks` 가 `task.isNewBuild` 화이트리스트 추가 (Momus F2). `reviewTaskDiff(task, diff)` 내부에서 `task.isNewBuild` 읽음 + userMessage template (job-reviewer.js:76-84)에 `Task metadata: is_new_build=${task.isNewBuild}` 줄 inject. SYSTEM_PROMPT Rule 7: "If is_new_build is true for THIS task, skip rule 7 entirely; the codebase does not have a DS equivalent yet."
- **G11** — `🛠 New build` 작은 badge — Playground PlanCard, JobCard task row, Chrome ext plan card, Slack plan card 의 plan_item.

### 3.2 비목표 (paradigm shift로 폐기되거나 별 plan으로)
- ~~Skip cascade confirm dialog~~ — paradigm shift로 사용자가 skip을 직접 거의 안 함.
- ~~Resume button disabled / tooltip~~ — paused는 build error case로 한정. 그 경우 raw paused banner 그대로 (실제 사용자가 알아야 하는 case).
- ~~Paused banner 분기 (stuck-blocked vs review-fail)~~ — review fail이 더 이상 paused 안 만듦. stuck-blocked는 build-error pause로 단순화.
- ~~Accept-as-is on blocked task~~ — blocked 자체가 거의 발생 안 함.
- ~~plan-emitter prompt 의 is_new_build 자체 heuristic (without unresolved_components cross-check)~~ — 사용자 Q2=B 답에 따라 post-process 안전망 채택.
- ~~Rule 7 sub-check granularity (D6)~~ — 전체 skip. is_new_build=true 면 raw button, table, status pill, modal 모두 허용.
- ~~기존 ReviewFailActions (Retry/Accept/Skip) 인라인 액션~~ — 살아남지만 paused (build error) case에만 발화. review fail demote 되면 등장 자체가 없음.

### 3.3 §5.0 confusion-free 정합성
G1-G8 모두 "사용자가 task 진행 중 결정 안 함" 패러다임. 사용자가 보는 것: ① plan 단계의 plan card → ② 진행 중 task progress (✅ ⊘) → ③ final summary 1개. interim 결정 0회.

---

## 4. 구현 세부 (파일/라인 검증된 것만)

### 4.1 G1 — Review fail demote (backend)

**File:** `orchestrator/lib/job-runner.js` line 319-324 영역 (해당 라인은 momus 검증으로 review-fail handler 위치 확인됨)

**현재 코드 (개념):**
```js
if (verdict.verdict === 'fail') {
  setTaskStatus(jobId, next.id, 'failed', { review: verdict });
  setJobStatus(jobId, 'paused', { pausedReason: `review-fail on task ${next.id}: ${verdict.notes}` });
  return;
}
```

**새 코드 (severity tier 반영, v3):**
```js
if (verdict.verdict === 'fail') {
  const severity = verdict.severity === 'critical' ? 'critical' : 'warning';
  if (severity === 'critical') {
    // Critical = security / runtime regression / a11y-blocking. Keep paused
    // so the user reviews before code lands on main.
    setTaskStatus(jobId, next.id, 'failed', {
      review: { verdict: 'fail', severity: 'critical', notes: verdict.notes },
    });
    setJobStatus(jobId, 'paused', {
      pausedReason: `review-critical on task ${next.id}: ${verdict.notes}`,
    });
    return;
  }
  // severity === 'warning' — demote and continue. Surface in final summary.
  setTaskStatus(jobId, next.id, 'reviewed', {
    review: { verdict: 'fail', severity: 'warning', notes: verdict.notes },
  });
  continue; // no propagateBlocked, no setJobStatus paused
}
```

**"진짜 막힘" — build/syntax/exception / retry 소진 / critical review 경로:**
- 이 경로들은 모두 기존 paused 흐름 유지. `pausedReason` prefix 로 구분: `'review-critical: ...'`, `'task X failed after N attempts: ...'`.
- **Momus F1 ack — build-error pause 의 dependents:** `setTaskStatus(taskId, 'failed')` + `propagateBlocked(job, taskId)` 그대로 호출 (현 코드). dependents 가 blocked. paradigm shift 적용 후에도 이 chain 은 남아 있음. 이 case 의 UX (사용자 개입) 는 별 plan v5 에서 다룰 것 — 본 plan 범위는 "review fail demote + final summary + revert/follow-up 으로 review fail UX 의 confusion 해소" 까지로 한정. Final summary 는 partial job (paused 상태) 도 지원 (§4.2 참고).

### 4.2 G2 — Final summary backend

**File:** `orchestrator/lib/job.js` — `buildJobSummary(job)` 신규 함수 (job.js 끝 영역)

**Data shape:**
```js
{
  total: 11,
  reviewed: 11,
  skipped: 0,
  blocked: 0,
  failed: 0,
  warningCount: 3,
  warnings: [
    { taskId: 't3', title: 'Build a single ad unit row', notes: '...', commitSha: 'abc123', isNewBuild: true },
    { taskId: 't6', title: 'Group ad unit rows', notes: '...', commitSha: 'def456', isNewBuild: false },
    ...
  ],
  changedFiles: ['src/...tsx', ...],
  finalSha: 'xyz789',
}
```

**Surface:** job 객체에 `summary` field 자동 생성 (job 완료 시 buildJobSummary 호출 + persist). 별 endpoint 안 만듦 — 기존 `GET /api/job/:id` 응답에 포함.

### 4.3 G3-G5 — Final summary UI (3 surface)

**G3 Playground:** `playground-app/src/editor/JobCard.tsx` — job.status === 'complete' && job.summary 면, task list 아래에 새 section 렌더링. 디자인:
- 헤더: `✅ 11/11 완료 · ⚠ 3 review warning · 5 파일 변경`
- Warning list — 각 row에 `[↶ Revert]` 버튼 (G8 wire)
- Follow-up suggestions section — 1-3 buttons (G6/G7 wire)

**G4 Chrome ext:** `chrome-extension/sidepanel.js` — `startHttpJobPolling` 가 status=complete 받으면 기존 progress card 를 final summary card 로 변환. addJobProgressMessage가 받았던 msg element 를 in-place 교체.

**G5 Slack:** `orchestrator/lib/molly.js` — job complete event handler가 thread에 final summary message post. `postJobFinalSummary({ client, channel, threadTs, summary })` 신규 함수. mrkdwn으로 통계 + warning + follow-up buttons (Slack interactive button).

**Momus I3 fix — race condition spec:**
- `setJobStatus('complete')` 가 **같은 transaction 안에서** `buildJobSummary()` 호출 + `job.summary = ...` 저장 + persist 완료.
- Slack handler 가 polling/event 로 `job.status === 'complete'` 감지 시 `job.summary` 이미 존재 보장.
- 방어선: molly.js `postJobFinalSummary` 가 `if (!job.summary)` null-check + 200ms 후 1회 재조회 (1초 retry budget).

### 4.4 G6 — Follow-up PRD suggestions endpoint

**File:** `orchestrator/lib/job-followup.js` 신규
- `generateFollowupSuggestions(job, summary)` — Anthropic API call.
- **Momus I2 fix — warning-count branch:**
  - `summary.warningCount === 0` → LLM skip. 반환: `[]`. UI 는 "후속 작업 제안 없음. 새 PRD 직접 입력 가능" 표시.
  - `summary.warningCount > 0` → LLM call.
- LLM Prompt (warning>0): "이 job 의 warning notes + changed files. PM 이 warning 을 정리할 만한 다음 작업 1-3개 (PRD locale 따라). 각 **50자 이내 (Slack interactive button 호환)**, '~ 교체', '~ 정리', '~ 점검' 같은 동사로 시작. JSON 으로만 응답: `{ suggestions: [{ text, intent_hint }] }`."
- Cache: 같은 job 에 대해 first call 만 LLM, 이후는 persist 된 결과 반환.
- **Safety: 코드 측 truncate at 70 chars + ellipsis** (LLM 무시 case 대비).
- **3 surface text parity (Momus I4):** Same text on all surfaces. Slack 50자 한계 = 다른 surface 도 50자 (parity).

**Endpoint:** `POST /api/job/:id/followup-suggestions` → `[{ text, intent_hint }, ...]`

**UI lazy load:** Final summary 표시 시 useEffect 로 fetch. Slack 은 final summary post 시점에 미리 호출 (interactive button text 에 들어가야 하므로).

### 4.5 G7 — Follow-up 1-click

**Playground / Chrome ext:** button click → `postIntake({ text: suggestion.text, surface, playgroundId, ... })` (기존 intake flow 재사용).

**Slack:** interactive button → 기존 plan-card-redecompose 와 비슷한 action handler → cumulativePrd = suggestion.text 로 새 intake.

### 4.6 G8 — Revert 1-click (v3 추가2 = A, Leaf-only)

**Pre-compute "canRevert" — Backend (`buildJobSummary` 시점):**
- 각 warning task `t` 에 대해 `canRevert(t) = !laterTasks.some(lt => intersect(lt.changedFiles, t.changedFiles).length > 0)`
- summary.warnings[*] 에 `canRevert: boolean` field 추가.
- 충돌 가능 task 는 `canRevert=false` — UI 에서 button grey out + tooltip "후속 task 가 같은 파일을 수정 — 이 revert 는 새 PRD 로 처리하세요. [💬 follow-up PRD 제안 보기]" (follow-up 섹션 으로 anchor 스크롤).

**Backend endpoint:** `POST /api/job/:id/task/:taskId/revert`
- 401: 만약 `summary.warnings[taskId].canRevert === false` → `409 Conflict` + 명확한 이유. **이 path 는 frontend 가 button disable 로 이미 차단 — backend 는 방어선.**
- 200 path: task.commitSha 의 reverse patch 를 `git diff <prev>..<commit>` 으로 추출 → `git apply -R` → `git commit -m "revert: t${taskId} ${task.title}"`.
- git revert 명령 안 씀 (commit chain 의존성 망가짐).
- **Historical job 지원 (Momus I7):** taskId 의 commitSha 가 git history 에 살아있으면 OK. 안 살아있으면 `410 Gone` + "이 commit 은 이미 다른 작업으로 정리됨" 메시지.

**Frontend:** 3 surface 모두 button click → backend call → on success refresh job state (summary 갱신).

**파라다임 정합:** 충돌 case 는 사용자가 git 다룰 일 없음. paradigm 의 follow-up PRD flow 가 자연스럽게 흡수.

### 4.7 G9 — `is_new_build` schema + post-process

**File:** `orchestrator/lib/molly-plan-emitter.js`

**Schema 추가 (line 99-102 영역):**
```
"plan_items": [
  {
    ...
    "is_new_build": false,    // default; LLM may set true if introducing brand-new UI without a DS equivalent
    ...
  }
]
```

**Prompt rule (USER-FACING rule 아래에 새 섹션):**
```
## Item flag: is_new_build

Set is_new_build:true on a plan_item ONLY when the task introduces UI for which the codebase has no equivalent DS component. Use unresolved_components as the primary signal — if THIS plan_item creates a component or page whose intent is also listed in unresolved_components, set is_new_build:true.

Default is_new_build:false.
```

**Post-process safety net (`emitPlan` after JSON parse):**
```js
for (const item of plan.plan_items || []) {
  if ((item.unresolved_components || []).length > 0 && !item.is_new_build) {
    item.is_new_build = true; // safety net per Plan v2 §4.7
  }
}
```

**Momus F5 mitigation:** Plan-emitter 가 over-flag 한 case 모니터링 — `is_new_build:true` 인데 `unresolved_components` 비어있으면 telemetry warning. 추후 cross-check 강화 가능.

### 4.8 G10 — Reviewer plumbing (Momus F2 fix)

**File 1:** `orchestrator/lib/job.js` — `planItemsToTasks` (line 145-158)
- 새 field whitelist 추가: `isNewBuild: !!plan_item.is_new_build`.

**File 2:** `orchestrator/lib/job-reviewer.js` (Momus F2 강화)
- userMessage template (line 76-84) **상단** 에 별도 block 추가:
  ```
  IMPORTANT FLAGS:
  - is_new_build: ${task.isNewBuild ?? false}

  Description: ...
  Diff: ...
  ```
- SYSTEM_PROMPT (line 17-31) 에 directive 추가: "Before applying any rule, scan the IMPORTANT FLAGS block at the top of the user message. If is_new_build=true, skip Rule 7 entirely for this task (hand-rolled markup is allowed because the codebase has no DS equivalent yet). Rules 1-6 still apply."
- SYSTEM_PROMPT 에 새 출력 field 명시: "Your JSON response MUST include `severity: 'critical' | 'warning'` when verdict='fail'. critical = security / auth / data-leak / runtime regression / a11y critical. warning = DS 미사용 / inline style / naming / a11y minor. Default = warning."

**File 3:** `orchestrator/server.js` line 788 의 reviewTaskDiff 호출 — 이미 task 객체 전체 전달하면 OK. signature 변경 불필요 (task.isNewBuild 가 reviewTaskDiff 내부에서 읽힘).

### 4.9 G11 — `🛠 New build` badge UI

**Playground PlanCard** (`playground-app/src/editor/AIPanel.tsx`, line 3175-3196 영역):
- 각 plan item 에 `item.is_new_build && <Chip label="🛠 New build" color="info" />` 추가.

**Playground JobCard** (`playground-app/src/editor/JobCard.tsx`):
- TaskRow header 에 `task.isNewBuild && <Chip label="🛠 New build" color="info" />` 추가.

**Chrome ext** (`chrome-extension/sidepanel.js` `addPlanItemsCard`):
- 각 plan_item 렌더링 (line 2578-2592 영역) 에 `<span class="badge new-build">🛠 New build</span>` 추가.

**Slack** (`orchestrator/lib/molly.js` `buildPlanItemsBlocks` line 1627 영역):
- 각 item title 옆에 small mrkdwn 마커 `🛠 _New build_` (italicized).

---

## 5. UX 변화 — before / after

### 5.1 11 task plan 흐름

**Before (현재):**
1. User: PRD 보냄
2. Plan card → Run
3. t1 reviewed ✅
4. t2 review fail → ⏸ paused → "review-fail on task t2: introduced raw button"
5. User: Retry / Accept-as-is / Skip 선택 (사용자 5초 멈춤, 보통 의미 모름)
6. ... t3-t11 동일 패턴, 3-7번 더 멈춤

**After:**
1. User: PRD 보냄
2. Plan card → 각 plan_item 옆에 `🛠 New build` badge (해당 task)
3. Run → 사용자는 다른 일 함
4. t1..t11 자동 진행 (review fail 발생해도 warning 메모만)
5. Job complete → Final summary 1개 메시지:
   > ✅ 11/11 완료 · ⚠ 3 review warning · 5 파일 변경
   > Warnings: t3 (hand-rolled `<button>`) · t6 (inline style) · t9 (z-index)
   > 후속 작업 제안:
   > [↗ Hand-rolled 버튼들을 MCButton2로 교체]
   > [↗ Inline style을 token으로 정리]
   > [↗ Dialog focus management 점검]
   > Revert: [↶ t3] [↶ t6] [↶ t9]

### 5.2 진짜 막힘 (build error) 흐름

**Before/After 동일:**
1. t5 코딩 agent 가 build error 던짐 → retry 3회 소진
2. ⏸ paused "task t5 failed after 3 attempts: TypeError ..."
3. Resume / Retry / Skip 액션 (현재 ReviewFailActions UI 그대로)
4. 사용자가 진짜 알아야 하는 case 만 사용자에게 도달.

---

## 6. 검증 방법

### 6.1 Unit (Momus C1 fix — file 실재 검증)
- **existing** `orchestrator/test/job-runner.test.js` — review fail handler severity branch 추가: critical → paused / warning → reviewed + 다음 task. propagateBlocked 호출 여부 검증 (G1).
- **existing** `orchestrator/test/molly-plan-emitter.test.js` — post-process 가 `unresolved>0 && !is_new_build` 시 강제 true (G9). prompt rule emit 검증 (`is_new_build`).
- **NEW** `orchestrator/test/job-summary.test.js` — `buildJobSummary` 가 warning + commit + file 정상 집계 + `canRevert` 정상 계산 (leaf-only logic) (G2, G8).
- **NEW** `orchestrator/test/job-reviewer.test.js` — `reviewTaskDiff` 가 IMPORTANT FLAGS block 정상 inject + (mocked LLM) severity field 정상 파싱 (G10).
- **NEW** `orchestrator/test/job-followup.test.js` — warningCount=0 시 LLM call skip + warningCount>0 시 prompt 정상 + 70-char truncate (G6).

### 6.2 Integration (end-to-end)
**새 paired-smoke fixture:** "Build a brand-new Traffic Control page from scratch" — 11 task plan 예상. 검증 chain:
1. plan-emitter output → 신규 컴포넌트 도입 plan_item 에 `is_new_build:true` (G9 prompt + post-process).
2. planItemsToTasks output → `task.isNewBuild=true` (G10).
3. reviewer call → userMessage 에 `Task metadata: is_new_build=true` 줄 포함 (G10).
4. reviewer verdict 'pass' (mocked LLM 또는 real with snapshot).
5. job complete → summary.warningCount=0 for is_new_build tasks.

**기존 5 PRD fixture (paired-smoke):** baseline cache ratio + per-PRD review verdict 비교 (before/after review fail rate).

### 6.3 Manual UX
- **Auto-progress**: "Build a brand-new Traffic Control page" PRD 발사 → 사용자 개입 0회로 끝까지 진행 → final summary 확인.
- **Final summary 3 surface**: Playground / Chrome ext / Slack 모두 같은 데이터 표시.
- **Follow-up 1-click**: 제안 버튼 클릭 → 새 PRD intake 정상 → 새 plan card 등장.
- **Revert 1-click**: warning task revert → working tree 변경 확인 + 새 commit 생성.
- **진짜 막힘**: build error 강제 발생 (잘못된 import 같은 PRD) → 사용자가 paused 진입 확인.

### 6.4 Telemetry
- `review_fail_demote_count` — G1 demote 발생 횟수.
- `review_critical_count` — severity='critical' 발생 횟수 (G1, v3 추가).
- `final_summary_view` — 사용자가 final summary 본 횟수.
- `followup_suggestion_click_rate` — suggestion 클릭율.
- `revert_click_rate` — revert 클릭율.
- `revert_blocked_by_conflict` — leaf-only canRevert=false 발생 횟수 (G8, v3 추가).
- `is_new_build_ratio` — plan_items 중 is_new_build=true 비율.
- `is_new_build_post_process_corrections` — post-process safety net 발화 횟수.

**Momus I5 fix — warning_lifecycle funnel (paradigm core metric):**
- 새 metric: 각 warning 의 life cycle 추적 (`{ jobId, taskId, emittedAt, summaryViewedAt?, actionType?, actionAt? }`)
- `actionType`: `'revert'` / `'followup_sent'` / `'explicit_dismiss'` / `'expired'` (job 완료 후 N 일 동안 액션 없음)
- Dashboard: emitted → summary_viewed → action_taken funnel chart. paradigm 효과성 측정 핵심.

**Momus I6 fix — is_new_build tripwire:**
- 매 plan-emit 후 `is_new_build_ratio` 계산. **30% 초과 시** alert (Slack DM 또는 dashboard banner). plan-emitter prompt 재검토 신호.

**Onboarding telemetry (Momus C3):**
- `userInfoShownPostAutoProgress` per-user flag — 새 metric `users_shown_paradigm_notice` (전체 사용자 중 notice 본 비율).

---

## 7. 리스크 + 미해결 결정

### 7.1 리스크 R1-R8

| # | 리스크 | 영향 | 완화 |
|---|---|---|---|
| **R1** | review fail demote 로 진짜 buggy 코드가 main에 commit. 사용자가 final summary 안 보고 다음 PRD 보내면 누적. | 코드 품질 저하 | (a) Final summary 가 chat history 에 영구 보존 — 사용자가 언제든 revert 가능. (b) Telemetry `final_summary_view`로 사용자 검토 비율 모니터. (c) Future: warning이 N% 넘으면 plan-emitter 가 자동으로 "이번 plan은 너무 risky — 작게 쪼개기" suggest. |
| **R2** | Follow-up suggestion LLM 호출이 cost 추가. | 비용 | (a) Cache per-job. (b) Lazy load (사용자가 final summary 볼 때만 호출). (c) Slack은 post 시점에 미리 호출 (button text 필요) — 1회. |
| **R3** | Revert button 이 commit chain 충돌 (후속 task가 revert task의 변경 위에 쌓였을 때). | revert 실패 | working-tree reverse patch + 새 commit 방식 (git revert 명령 안 씀). conflict 시 409 + "manual 정리 필요" 메시지. |
| **R4** | `is_new_build` 자동 판정 false positive (unresolved 표시 안 됐는데 실제 new build) — Rule 7 가 strict 발화하여 review fail. | 일부 task fail | review fail은 이제 warning 으로 demote → final summary 에 표시 → 사용자가 follow-up PRD 로 정리. paradigm 이 R4 를 자체 흡수. |
| **R5** | `is_new_build` 자동 판정 false negative (실제 new build인데 unresolved 비어있음) — 사용자가 직접 일반 plan으로 진행. | DS strict review가 발화 → warning → final summary 노출 | R4 와 동일하게 paradigm 흡수. |
| **R6** | "진짜 막힘" 의 build error 가 retry 3회로 풀리지 않으면 paused — 사용자가 ReviewFailActions UI 봄. paradigm 이탈. | 사용자가 한 번 멈춤 | 이건 의도된 escape hatch. build error는 사용자가 알아야 함. UI 유지 + 명확한 메시지 ("코드가 안 돌아갑니다. 직접 확인 필요"). |
| **R7** | Slack final summary 가 thread 노이즈. 11 task plan 진행 중 task progress 도 thread 에 들어가면 더더욱 길어짐. | Slack 가독성 저하 | (a) thread 중간 progress 는 silent (필요 시 expand). (b) final summary 만 단일 카드. (c) Future: thread 전체 collapse + 카드 form 으로 변경. |
| **R8** | revert 1-click 이 사용자 의도 명확 못 살림 — "이 코드 별로다" vs "이 코드는 의도와 다르다" 구분 못 함. | revert 후에도 같은 패턴 다시 발생 가능 | revert button 옆에 "어떤 점이 문제?" optional input → follow-up PRD 의 context로 활용. v3 이후. |

### 7.2 결정 D1-D4 (v3 명시화)

| # | 항목 | v3 spec |
|---|---|---|
| **D1** | Final summary 위치 (Playground) | JobCard 안 footer section (같은 chat bubble 흐름). 별 message bubble 안 만듦. |
| **D2** | Revert git mechanism (Momus I1 → load-bearing) | **Leaf-only working-tree reverse patch.** canRevert pre-compute → 충돌 가능 task button grey out. backend 방어선: 409 + 명확 메시지. paradigm 정합 (사용자 git 안 다룸). |
| **D3** | Follow-up suggestion 개수 | 1-3 dynamic (LLM 판단). warningCount=0 → []. |
| **D4** | 사용자가 final summary 보기 전 새 PRD 보내면 (Momus I7 → 명시) | summary 는 job 객체 안 영구 저장. revert endpoint 는 historical jobId 받음 — commitSha 가 git history 에 살아있는 한 revert 가능 (410 Gone if collapsed). chat history 의 final summary message 영구 보존 — 새 plan card 는 뒤에 추가. |

추가 risk **R9 (Momus F1 ack)** — build-error pause 의 dependents chain. 별 plan v5 thread.

추가 risk **R10 (Momus C2 추가)** — severity 카테고리 분류 LLM 정확도. 완화: 매 critical 분류를 telemetry 로 review + 분기 6개월 후 분류 audit (false positive/negative 비율).

---

## 8. 일정 추정

| 항목 | 추정 |
|---|---|
| G1 (review fail demote) | 1.5h (코드 + unit test) |
| G2 (buildJobSummary backend) | 1.5h |
| G3 (Playground final summary UI) | 2.5h |
| G4 (Chrome ext final summary) | 1.5h |
| G5 (Slack final summary) | 2h |
| G6 (followup endpoint + LLM call) | 2.5h |
| G7 (followup 1-click 3 surface) | 1.5h |
| G8 (revert 1-click 3 surface + backend) | 3h |
| G9 (plan-emitter is_new_build + post-process) | 1h |
| G10 (reviewer plumbing per Momus F2) | 1.5h |
| G11 (`🛠 New build` badge 3 surface) | 1.5h |
| Paired smoke 새 fixture + evaluate option | 1.5h |
| Telemetry wiring | 1h |
| Manual UX 검증 (4 lane) | 1h |
| G1.5 (warning indicator Phase 1 추가, v3) | 1h |
| Onboarding notice (G1b, v3) | 1h |
| **합계** | **~25h (~3.2 day)** |

Momus F10 지적 (v1 15-17h) 대비 +9h — Phase 1 minimal warning indicator + onboarding notice + severity tier wire + leaf-only canRevert pre-compute 로 정직한 증가.

**Plan 분할 옵션 — 사용자 답 필요 (§9 참고):**
- (A) 한 plan 으로 23h 진행
- (B) Phase 1 (G1+G9+G10+G11 — auto-progress backbone + badge, ~8h) → Phase 2 (G2-G5 final summary, ~8h) → Phase 3 (G6-G8 followup + revert, ~7h). 각 phase 끝 사용자 검증.

---

## 9. 실행 순서 (제안 Phase B)

### Phase 1 — Auto-progress backbone + minimal warning surface (9h, Day 1) — **Momus C4 fix**
1. **G9** (is_new_build schema + post-process + tripwire) — 1h
2. **G10** (reviewer plumbing + IMPORTANT FLAGS + severity output) — 2h
3. **G1** (review fail demote in job-runner + severity branch + onboarding flag) — 2h
4. **G11** (badge UI 3 surface) — 1.5h
5. **G1.5 — Minimal warning indicator (NEW in v3):** JobCard footer 에 simple `⚠ N review warnings` count + TaskRow header 옆 small `⚠` 아이콘 (`task.review.severity==='warning'` 일 때). full final summary 는 Phase 2, 단 Phase 1 만 ship 해도 사용자가 warning 존재 인지 가능. ~1h
6. Paired smoke 새 fixture (warning-heavy + zero-warning 2개, Momus M3) — 1.5h
7. **검증 1:** "Build Traffic Control page" PRD 발사 → 사용자 개입 0회 끝까지 진행 + plan card에 `🛠 New build` 보임 + JobCard에 `⚠ N warnings` 보임 + telemetry 새 metric 확인 — 1h

→ Phase 1 만으로도 사용자 경험은 개선됨 (interim UI 다 사라짐) + 현재보다 worse 되지 않음 (warning 가시화). full final summary + revert + follow-up 은 Phase 2/3 에서.

### Phase 2 — Final summary 3 surface (8h, Day 2)
1. **G2** (buildJobSummary backend + persist) — 1.5h
2. **G3** (Playground final summary UI) — 2.5h
3. **G4** (Chrome ext final summary) — 1.5h
4. **G5** (Slack final summary) — 2h
5. **검증 2:** 동일 PRD 다시 발사 → final summary 3 surface 모두 일관 표시 — 0.5h

### Phase 3 — Follow-up + revert (7h, Day 3 morning)
1. **G6** (followup endpoint + LLM cache) — 2.5h
2. **G7** (followup 1-click 3 surface) — 1.5h
3. **G8** (revert 1-click 3 surface + backend) — 3h
4. **검증 3:** follow-up suggestion 클릭 → 새 PRD chain. revert 1개 → working tree 변경 확인 — 0.5h
5. 핸드오프 작성 — 0.5h

---

## 10. 관련 파일 인덱스 (Momus F3 fix — 모두 검증된 라인)

### Backend
- `orchestrator/lib/job.js` — `planItemsToTasks` (line 145-158, momus 검증) — G10 task.isNewBuild whitelist. `buildJobSummary` (신규) — G2. `acceptTask` (line 420), `propagateBlocked` (line 697) — 직접 수정 안 함 (paradigm shift 로 폐기).
- `orchestrator/lib/job-runner.js` — review fail handler 영역 — G1. (정확한 라인은 G1 구현 시 다시 verify.)
- `orchestrator/lib/job-reviewer.js` — `reviewTaskDiff` (line 39), SYSTEM_PROMPT Rule 7 (line 26), userMessage template (line 76-84) — G10.
- `orchestrator/lib/molly-plan-emitter.js` — schema (line 99-102, momus 검증), post-process — G9. SYSTEM_PROMPT — G9 prompt rule.
- `orchestrator/lib/molly.js` — `postPlanItemsMessage` (line 1476-1511, 어제 변경됨), 새 `postJobFinalSummary` — G5.
- `orchestrator/lib/job-followup.js` 신규 — G6.
- `orchestrator/server.js` — `reviewTaskDiff` 호출 (line 788, momus 검증) — sig 변경 불필요. 새 endpoints: `POST /api/job/:id/followup-suggestions`, `POST /api/job/:id/task/:taskId/revert`.

### Frontend (Playground)
- `playground-app/src/editor/JobCard.tsx` — `canResume` (line 132 momus 검증), paused banner (line 247-261 momus 검증), TaskRow (line 818 momus 검증) — G3 final summary section 추가. badge — G11. Skip cascade / Resume disable / banner 분기는 폐기.
- `playground-app/src/editor/AIPanel.tsx` — `PlanCard` (line 3099+) plan item 에 badge — G11.

### Frontend (Chrome ext)
- `chrome-extension/sidepanel.js` — `addJobProgressMessage` (line 2298, 어제 변경됨), `startHttpJobPolling` (line 2353) — G4 final summary 변환. `addPlanItemsCard` (line 2550, 어제 변경됨) badge — G11.

### 측정 / 스크립트
- `orchestrator/scripts/plan-emitter-paired-smoke.mjs` — 새 fixture 1개 (G9 검증).
- `orchestrator/scripts/plan-emitter-paired-evaluate.mjs` — `is_new_build` cross-check.

### 핸드오프
- 작성 예정: `docs/superpowers/handoffs/2026-05-XX-job-pipeline-auto-progress.md` (Phase 1/2/3 완료 시점)

---

## 11. v1 vs v2 변경 요약 (changelog)

| v1 (DEPRECATED) | v2 |
|---|---|
| G1-G4: Skip cascade UX 개선 (confirm dialog / Resume disable / banner 분기 / Accept-as-is) | **폐기.** paradigm shift — 사용자가 task-level 결정 안 함. |
| G5-G7: is_new_build 신호 + review 완화 + badge | **유지 + 강화.** G9-G11. post-process 안전망 추가 (Momus F5). reviewer plumbing 완전히 wire (Momus F2). |
| Slack 비목표 | **포함.** 사용자 Q3 답 변경. Final summary thread 메시지 + interactive buttons. |
| Final summary / follow-up / revert 개념 없음 | **신규 G1-G8** core paradigm. |
| 11-12h | **23h** (Momus F10 정직한 추정, 사용자 paradigm 추가 작업 포함) |
| Momus 🔴 F1 (G4 chain unsolved) | **해결.** G4 폐기로 chain 문제 자체 없어짐. |
| Momus 🔴 F2 (reviewer plumbing 미검증) | **해결.** §4.8 명시. |
| Momus 🔴 F3 (line 추정) | **해결.** §10 검증된 line 만 인용, 미검증은 "G1 구현 시 verify" 명시. |
| Momus 🟡 F4-F11 | **모두 v2 에 반영.** F4 (FSM wording), F5 (post-process), F6 (integration test), F7 (Rules 1-6 still fire — §5.1 wording), F8 (Rule 7 granularity — 전체 skip 결정), F9 (실행 순서 — Phase 분할 + UX 빠른 검증), F10 (timing 정직화), F11 (Slack 포함). |

---

## 12. v2 → v3 변경 요약 (Momus 2차 리뷰 반영)

| v2 | v3 |
|---|---|
| Review fail → 전부 warning demote | **severity tier 추가** (critical → paused 유지, warning → demote). reviewer LLM 이 같은 호출에 severity field 출력 (v3 추가1=A). |
| Onboarding 없음 | **G1b — first-time inline notice** per-user flag, 3 surface 동일. |
| Phase 1 (8h) — final summary 없이 ship | **Phase 1 (9h) — G1.5 minimal warning indicator** 포함 (JobCard footer + TaskRow `⚠`). Phase 1 만으로도 사용자 worse off 안 됨 (Momus C4). |
| Test file 인용: `job.test.js`, `job-reviewer.test.js` (실재 안 함) | 실재 파일 (`job-runner.test.js`, `molly-plan-emitter.test.js`) + 신규 (`job-summary.test.js`, `job-reviewer.test.js`, `job-followup.test.js`) 명시 (Momus C1). |
| Revert: working-tree reverse patch, 충돌 시 409 | **Leaf-only canRevert pre-compute** + UI button grey out. 충돌 case 는 paradigm follow-up flow 가 흡수 (v3 추가2=A, Momus I1). |
| Followup LLM call 무조건 | **warningCount=0 시 skip + warningCount>0 시 prompt** (Momus I2). 50자 constraint + 70자 truncate. 3 surface text parity (Momus I4). |
| Slack post 순서 미명시 | **setJobStatus('complete') atomicity spec** + null-check retry (Momus I3). |
| Reviewer prompt: `Task metadata: is_new_build=...` 단일 줄 | **IMPORTANT FLAGS block** + SYSTEM_PROMPT directive (Momus F2 강화). severity output field 명시. |
| Telemetry 6개 metric (event 단위) | **+warning_lifecycle funnel** (emitted→viewed→action), is_new_build tripwire (>30% alert), 8개 metric 총 (Momus I5, I6). |
| D2/D4 small default | **D2 load-bearing 명시 (leaf-only), D4 explicit spec** (historical job revert, chat archival 영구). |
| build-error pause dependents 미언급 | **§4.1 R9 ack** — 별 plan v5 thread 약속. |

---

*Plan v3 작성: 2026-05-19 저녁 Claude session (v2 → v3 incremental update, Momus 2차 리뷰 4 🔴 + 7 🟡 + 5 🟢 반영). 사용자 추가 결정 2건 (severity=A, revert=A) 반영. Phase 1 (9h) 진입 준비 완료.*
