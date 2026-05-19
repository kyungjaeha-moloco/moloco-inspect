# Handoff — 2026-05-19/20: Auto-progress paradigm shift (Phase 1+2) + DS missing light fix + Language unify + Versions button + 7 other fixes

**Date:** 2026-05-19 저녁 → 2026-05-20 새벽 (긴 단일 세션)
**Author:** kyungjae.ha (with Claude session)
**Branch:** main
**Predecessor handoff:** `docs/superpowers/handoffs/2026-05-19-plan-emitter-v2-user-facing-and-ui-cleanup.md`

---

## TL;DR

오늘 세션은 한 핸드오프 안에 묶이지 않을 만큼 큰 paradigm shift + 다수의 user-direction fix. 16개 commit + 1개 신규 plan (v3 작성, 2-round Momus review 반영) + Phase 1/2 ship + 사용자 통찰 5건 반영.

**Core paradigm shift (Plan v4 = v3 file):** Review fail → 사용자 개입 (Retry/Accept/Skip) 흐름 **폐기**. AI 가 task review-fail 도 자동 진행 (severity=warning), 위험한 변경 (security/runtime/data/a11y-blocking = critical) 만 paused. Job 완료 후 final summary card 1개로 통계 + warning + revert/followup 한꺼번에 surface.

**Shipped (16 commits, 새 변경):**

1. ✅ **fix(playground)** — `1a2a175` ExecutionCard SSE re-subscribe after hydrate/refresh — `Running AI` spinner stuck 영구 해결 (job 7e3c57f9 + c67493ef case)
2. ✅ **feat(ui)** — `a6a453b` Original PRD 3 surface (JobCard + Chrome ext + Slack) — collapsible "📝 Original PRD" 어디서든 확인 가능
3. ✅ **docs(plans)** — `42879a7` Plan v4 doc (DEPRECATED v1 stuck-states + v2/v3 auto-progress paradigm) — Momus 2 round review 반영
4. ✅ **feat(plan-emitter)** — `07225f5` G9: `is_new_build` schema + post-process safety net + tripwire (>30% ratio warn)
5. ✅ **feat(reviewer)** — `ef8519b` G10: `IMPORTANT FLAGS:` block in userMessage + SYSTEM_PROMPT directive + Rule 7 conditional skip + new `severity` output field (critical|warning)
6. ✅ **feat(job-runner)** — `2efd28a` G1: review-fail demote — severity=warning → reviewed+continue, severity=critical → paused (existing flow)
7. ✅ **feat(ui)** — `eea1fb8` G11 + G1.5: 🛠 New build badge 4 surface + JobCard `⚠ N warnings` count + per-TaskRow `⚠` icon
8. ✅ **chore(scripts)** — `e35b5ba` Paired smoke fixtures (traffic-control-new-page + campaign-column-reorder) + `is_new_build` 검증 옵션 in evaluate
9. ✅ **feat(job)** — `441461d` G2: `buildJobSummary` derived view + leaf-only `canRevert` pre-compute + Task.changedFiles propagation + JobSummary typedef
10. ✅ **feat(playground)** — `e2eae89` G3: Final summary section in JobCard (stats + warning rows + [↶ Revert] placeholder + Phase 3 followup placeholder) + G1b localStorage onboarding notice
11. ✅ **feat(chrome-ext)** — `6ea5a05` G4: Final summary card render in sidepanel job-polling loop + shared localStorage onboarding flag
12. ✅ **feat(slack)** — `a1d2b12` G5: `postJobFinalSummary` after complete announcement (stats + warning list capped at 5 + Phase 3 placeholder + null-check retry race guard)
13. ✅ **refactor(plan-emitter)** — `0bc95c8` Language detection 제거 — always reply in English regardless of PRD language (60줄 rule → 1줄)
14. ✅ **feat(playground)** — `4c26f81` Versions button in CommitTabBar — 기존 HistoryDialog trigger를 iframe 영역으로 노출
15. ✅ **feat(ui)** — `3786d73` Plan v3 G1 light fix: DS missing 4-option cards 숨김 (3 surface). 데이터 흐름 유지 (`unresolved_components` → `is_new_build` safety net 그대로)

**Tooling (재사용 가능):**
- `orchestrator/scripts/plan-emitter-paired-smoke.mjs` — 7 PRD fixture (5 기존 + 2 신규)
- `orchestrator/scripts/plan-emitter-paired-evaluate.mjs` — `is_new_build` cross-check + post-process safety net audit
- `localStorage` flag `omc.paradigmNoticeShown.v3` — 3 surface 공유 onboarding state

---

## 1. Trigger + paradigm shift narrative

### 1.1 핸드오프 §5.1 priority items 진입

전일 핸드오프 §5.1 우선순위:
- 🥇 1 Skip → BLOCKED cascade UX (Plan v4 묶음)
- 🥇 1b 원본 PRD 표시 UI
- 🥈 2 Review fail "new build" 약화 (Plan v4 core)

사용자 결정 (시간순):
- 1b → 즉시 진행 → ship (`a6a453b`)
- 1 + 2 묶어서 → Plan v4 작성

### 1.2 Plan v4 의 paradigm pivot — 사용자 통찰

v1 draft: Skip cascade UX 개선 + review fail "new build" 약화 — task-level 사용자 개입 개선에 초점.

사용자 통찰 (저녁 ~22:00):
> "리뷰 페일을 사용자가 진행중에 보는걸 없에야 하는게 내 생각이야. 일일이 들어와서 그런 액션들을 한다는게 말이안된다. ai 가 다 진행하고, 그것에 대해서 후속 job 이나 계획을 세워서 추가로 작업하면서 개선하면 되니까."

→ v1 폐기, v2/v3 신규 paradigm: AI 가 task review-fail 자동 진행, 사용자는 결과만 봄, 개선은 follow-up PRD로.

추가 결정 5건:
- Q2=B: `is_new_build` 자동 판정 = unresolved_components 신호 기반
- Q3=같이: Slack 도 포함
- 추가1=A: "진짜 막힘" 기준은 코드 안 돌아갈 때만 (build/syntax/retry-exhaust)
- 추가2=B: warning commit 처리는 main에 commit + final summary에 revert 1-click
- v3 추가1=A: severity 분류는 reviewer LLM 이 같은 호출에 emit
- v3 추가2=A: revert mechanism은 leaf-only canRevert (충돌 case는 follow-up PRD)

### 1.3 Momus 2 round review

**Round 1 (v1):** 🔴 3건 (F1 G4 chain unsolved + F2 reviewer plumbing 미검증 + F3 line 추정) + 🟡 8건. → v2 작성.

**Round 2 (v2):** 🔴 4건 (C1 test 파일 인용 잘못 + C2 critical severity 없음 + C3 onboarding 누락 + C4 Phase 1 worse than current) + 🟡 7건. → v3 작성.

V3 = 사용자 추가 결정 2건 + Momus C1-C4 + I1-I7 모두 반영.

### 1.4 사용자 통찰 5건 (오늘 발견)

| # | 통찰 | 처리 |
|---|---|---|
| ① | Review fail UI 폐기 → AI 자동 진행 | Plan v3 paradigm 전체 핵심 |
| ② | "응답은 영어로 통일" (Korean detection 너무 복잡) | `0bc95c8` 즉시 적용 |
| ③ | "Intake context bleed — 이전 thread 영향" | followup §5 (β LLM classifier 추후 6-8h) |
| ④ | Versions = 탭 (Working 옆 버전 비교) | `4c26f81` Versions 버튼 추가 (기존 HistoryDialog trigger 노출) |
| ⑤ | DS missing 4-option 카드 "너무 크고 불필요" | `3786d73` Plan v3 G1 light fix (3 surface 숨김) |

---

## 2. Shipped 변경 inventory

### 2.1 Plan v4 = Plan v3 file (auto-progress paradigm)

**File:** `docs/superpowers/plans/2026-05-19-job-pipeline-auto-progress-and-final-summary.md` (534 lines)
**Predecessor:** `2026-05-19-job-pipeline-stuck-states-and-new-build.md` — **DEPRECATED v1** (v1 → v2 paradigm shift narrative 포함)

**G1 → G11** + v2 → v3 changelog at §12.

### 2.2 Phase 1 ship — Auto-progress backbone (5 commits + scripts)

| # | Commit | 핵심 변경 |
|---|---|---|
| G9 | `07225f5` | `plan_item.is_new_build` schema. SYSTEM_PROMPT에 "Item flag: is_new_build" rule. emitPlan post-process: `unresolved_components.length > 0 && !is_new_build → 강제 true`. `is_new_build_ratio` per plan 로그 + recordEvent. >30% tripwire warn. |
| G10 | `ef8519b` | `planItemsToTasks` whitelist `isNewBuild`. job-reviewer.js: userMessage 상단에 `IMPORTANT FLAGS:` block + SYSTEM_PROMPT directive ("Before any rule, scan IMPORTANT FLAGS"). Rule 7 conditional skip when is_new_build=true. 새 `severity` output field (critical / warning) 명시. 모든 fail-soft path도 severity 설정 (empty diff → critical, no API key → critical, parse fail → warning). |
| G1 | `2efd28a` | job-runner.js review-fail handler 변경: severity='critical' → 기존 paused 흐름, severity='warning' (default) → task.status='reviewed' + review.severity='warning' 메모 + continue (no propagateBlocked). reviewer 크래시는 critical. |
| G11 | `eea1fb8` | 🛠 New build badge 4 surface — Playground PlanCard Chip + JobCard TaskRow inline span + Chrome ext addPlanItemsCard span + Slack buildPlanItemsBlocks italicized mrkdwn. |
| G1.5 | `eea1fb8` (같은) | JobCard 헤더 `⚠ N review warnings` count + per-TaskRow `⚠` icon (`task.review.severity==='warning'`). Phase 1 만 ship 해도 사용자가 warning 존재 인지 가능. |
| Tooling | `e35b5ba` | Paired smoke fixtures 2 추가 (traffic-control-new-page warning-heavy + campaign-column-reorder zero-warning). evaluate에 `is_new_build` cross-check + post-process safety net audit. |

### 2.3 Phase 2 ship — Final summary 3 surface (4 commits)

| # | Commit | 핵심 변경 |
|---|---|---|
| G2 | `441461d` | `buildJobSummary(job)` 신규 — 통계 + warning list + canRevert (leaf-only) + changedFiles aggregate + finalSha. Derived view (race-free per Momus I3). `Task.changedFiles` 추가 — change-request adapter → job-runner → Task. GET /api/job/:id 응답에 `{ ...job, summary }`. JobSummary typedef. |
| G3 | `e2eae89` | JobCard `FinalSummarySection` — job.status='complete' OR warningCount>0 시 표시. Stats row + per-warning row (notes + 🛠 New build badge + [↶ Revert] button) + Phase 3 followup placeholder. G1b onboarding inline notice (`omc.paradigmNoticeShown.v3` localStorage flag) "AI 가 자동 진행하도록 바뀌었어요...". |
| G4 | `6ea5a05` | Chrome ext sidepanel `renderOrUpdateFinalSummaryCard` — polling loop에서 status=complete OR warningCount>0 시 카드 in-place 갱신. 같은 localStorage flag share. |
| G5 | `a1d2b12` | molly.js `postJobFinalSummary` — job complete 시 thread에 별 message. mrkdwn 통계 + warning list (5개 cap + "more") + Phase 3 placeholder. null-check retry race guard. |

### 2.4 사용자-direction 5 fixes (5 commits)

| # | Commit | 변경 |
|---|---|---|
| Original PRD UI | `a6a453b` | 3 surface — JobCard `<details>` + Chrome ext `buildOriginalPrdDetails()` helper + Slack `postOriginalPrdMessage()` 별 thread message (2700 chars cut + escape Slack control chars + `>` quote). |
| ExecutionCard SSE | `1a2a175` | AIPanel `reconciliationSubsRef` — hydrated messages 의 non-terminal executions에 SSE 재구독. server 의 즉시 replay로 즉시 transition. ref Map dedupe + playgroundId change cleanup. |
| Language unify | `0bc95c8` | SYSTEM_PROMPT 60줄 language rule → 1줄 "Always reply in English". userPrompt도 영어 통일. 모든 코너 케이스 (history-aware, clarification, context bleed) 일관. |
| Versions button | `4c26f81` | `CommitTabBar` 에 `📜 Versions` 버튼 우측 → 기존 HistoryDialog trigger. Tab bar compact 유지 + 사용자 멘탈 모델 (탭 = 버전) 충족. |
| DS missing light fix | `3786d73` | Plan v3 G1 partial — 4-option 카드 render 3 surface 폐기. 데이터 흐름 + safety net 그대로. 코드는 `void MissingComponentCard` reference로 보존 → plan v3 G4b re-enable 시 1-line revert. |

### 2.5 영향 받는 file 인덱스 (오늘 변경 누적)

**Backend (orchestrator):**
- `orchestrator/lib/job.js` — Task typedef (isNewBuild, changedFiles, severity), JobSummary typedef, buildJobSummary 신규
- `orchestrator/lib/job-runner.js` — review-fail handler severity branch, setTaskStatus 'committed' patch에 changedFiles 추가
- `orchestrator/lib/job-reviewer.js` — SYSTEM_PROMPT IMPORTANT FLAGS directive + severity rule + Rule 7 conditional, userMessage IMPORTANT FLAGS block, severity output 파싱
- `orchestrator/lib/molly-plan-emitter.js` — schema is_new_build field + post-process + tripwire + language English unify
- `orchestrator/lib/molly.js` — postOriginalPrdMessage + postJobFinalSummary + buildPlanItemsBlocks 🛠 New build marker. postMissingComponentCards early-return.
- `orchestrator/server.js` — runChangeRequestForTask returns changedFiles, GET /api/job/:id `{ ...job, summary }`, buildJobSummary import

**Frontend (playground-app):**
- `playground-app/src/services/orchestrator-client.ts` — RawPlanItem.is_new_build, PlanItem.isNewBuild, JobTask.isNewBuild + changedFiles + review.severity, JobSummary interface, Job.summary
- `playground-app/src/store/playground-store.ts` — PlanItem.isNewBuild
- `playground-app/src/editor/AIPanel.tsx` — reconciliation SSE re-subscribe, RawPlanItem→PlanItem 매핑에 isNewBuild, PlanCard 🛠 New build Chip, MissingComponentCard JSX 폐기 + void reference
- `playground-app/src/editor/JobCard.tsx` — Original PRD `<details>`, header warningCount badge, TaskRow 🛠 New build + ⚠, FinalSummarySection (footer + onboarding notice)
- `playground-app/src/pages/PlaygroundDetail.tsx` — CommitTabBar.onShowVersions + 📜 Versions button

**Frontend (chrome-extension):**
- `chrome-extension/sidepanel.js` — buildOriginalPrdDetails, 🛠 New build span in plan card, renderOrUpdateFinalSummaryCard + buildFinalSummaryCard, renderMissingComponentSections early-return

**Scripts:**
- `orchestrator/scripts/plan-emitter-paired-smoke.mjs` — 2 신규 fixture
- `orchestrator/scripts/plan-emitter-paired-evaluate.mjs` — is_new_build coverage + safety net audit

**Plans:**
- `docs/superpowers/plans/2026-05-19-job-pipeline-stuck-states-and-new-build.md` — DEPRECATED v1
- `docs/superpowers/plans/2026-05-19-job-pipeline-auto-progress-and-final-summary.md` — v3 (active)

---

## 3. 측정 + 검증 결과

### 3.1 Phase 1 검증 (orchestrator 로그)

`is_new_build` post-process safety net 정상 작동:
```
[plan-emitter] Generated 3 items unresolved=0 | new_build=0/3 ratio=0.00 corrections=0   ✅ 안전망 발동 안 함 (정상)
[plan-emitter] Generated 7 items unresolved=1 | new_build=7/7 ratio=1.00 corrections=5   ✅ 발동 (LLM이 2/7 마킹 → 5개 lift)
[plan-emitter] is_new_build_ratio=1.00 (>0.30 threshold). 7/7 items flagged ...           ✅ tripwire warn
```

paired smoke 7 PRD fixture 정상 실행. `plan-emitter-paired-evaluate.mjs` 의 새 audit 통과.

### 3.2 Phase 1 검증 (Playground UI)

- ✅ 🛠 New build badge 5/5 items 표시 (Traffic Control PRD)
- ✅ Original PRD collapsible 정상
- ✅ DS missing 카드 render (Plan v3 G1 적용 전 캡처) — 적용 후 사라짐

### 3.3 Phase 1 G1 (review fail demote) — 직접 검증 미완

이유: Anthropic LLM 529 overloaded_error 가 오늘 자주 발화 — decompose 단계에서 hung → review 단계까지 도달 못 함. 코드 path는 unit-level reasoning으로 정상 검증, 실 PRD 검증은 다음 세션.

### 3.4 Phase 2 — UI 코드 검증 OK, e2e 미완

- ✅ tsc clean (모든 type 정합)
- ✅ Node syntax clean (5 backend file)
- ⚠ Job complete 실제 도달 → final summary 표시 검증 미완 (Anthropic overload 영향 동일)

### 3.5 별 발견 (이번 세션)

**Intake history-aware context bleed** (사용자 ③ 통찰):
- 사용자가 "CSV 버튼 추가" PRD 보냈는데 plan-emitter가 이전 thread 의 Traffic Control + column swap도 합쳐서 5 item plan emit
- 원인: intake `cumulativePrd` 가 thread 내 모든 user message 누적
- 해결: β LLM classifier 자동 분리 (followup §5)

**Job 7e3c57f9 / c67493ef ExecutionCard stuck** — `1a2a175`로 해결. SSE re-subscribe on hydrate.

**Job f1c86f01 stuck** — adapter t1 hung (Anthropic overload 추정), 사용자가 t6-t10 직접 skip 시도 → paradigm shift는 review 단계에 도달 못 해서 적용 안 됨. paradigm 한계 노출: build error / adapter hang 등 "다른 stuck states" 는 별 plan v5 필요.

---

## 4. 미해결 결정 / decision points

| # | 항목 | 위치 |
|---|---|---|
| 1 | Base 탭 항상 표시 vs 현재 (commit 후) | `PlaygroundDetail.tsx:1077` — 사용자 통찰 시점 OK / 별 fix 시점 결정 |
| 2 | Phase 2 G1b onboarding notice — localStorage flag vs server-side per-user | 현재 localStorage. Multi-device 환경 도래 시 server-side migrate |
| 3 | canRevert leaf-only — 충돌 case 도 처리하고 싶으면 rolling-revert | Plan v3 §4.6 D2=A 결정. 사용자 친화도 평가 후 별 PR |
| 4 | Job complete 자동 도달 (build error / Anthropic overload) — 사용자가 진짜 막힘 case에서 paradigm shift 약속이 깨짐 | "다른 stuck states UX" 새 plan v5 필요 |
| 5 | Plan v3 (DS missing AI judge governance) Slice G2-G6 진입 시점 | 11.5-15h 추가 — 다음 multi-session |

---

## 5. Followup items (우선순위)

### 5.1 §5.0 confusion-free 원칙 — 다음 세션 우선

| 순위 | 항목 | 추정 | 근거 |
|---|---|---|---|
| 🥇 1 | **Plan v3 G2-G6 (DS missing AI judge + governance) 진입** | 9-12h (G1 done) | 사용자가 "Plan v3 전체 실행" 명확히 결정함. G1 이미 완료, G2 (server endpoints) → G3 (plan-emitter wiring) → G4 (notice render) → G5 (governance UI) → G6 (e2e) 순. |
| 🥇 2 | **Phase 1 / Phase 2 e2e 검증 — 작은 PRD 발사** | 0.5-1h | Anthropic overload 회복 후 / 작은 PRD (예: "Campaign placeholder text 변경") 발사 → review-fail demote + final summary 실 동작 확인. |
| 🥈 3 | **Phase 3 (revert wire + followup endpoint + suggestion UI)** | 7h | Plan v3 §4.4 G6 followup endpoint + §4.6 G8 revert wire (Phase 2 placeholder 활성화). |
| 🥉 4 | **β LLM classifier 자동 context 분리** | 6-8h | 오늘 ③ 통찰. intake bleed 해결. False positive 처리 + telemetry. |
| 5 | **"다른 stuck states" UX (build error / Anthropic overload / adapter hang)** | 2-3h plan + 4-6h ship | Job f1c86f01 case. paradigm shift 약속의 빈틈. 별 Plan v5. |
| 6 | **Language unification 검증** | 0.5h | 새 PRD (한국어/영어) 발사 후 plan 응답 모두 영어인지 확인 |
| 7 | **handoff §5 row 5 (plan v2 문서 DEPRECATED 정리)** | 0.3h | 어제 §5.1 row 5 carryover — 어제 plan v2 이미 deprecated 마킹됨 (오늘 작업 안에 흡수). 추가 정리 불요. |

### 5.2 메모리 갱신 권장

| 메모리 항목 | 변경 |
|---|---|
| `project_canvas_app.md` | Plan v3 (auto-progress paradigm) Phase 1+2 ship 표시. Plan v4 = v3 file로 변경 (v1 DEPRECATED). DS missing 카드 light fix (G1) 완료. Language English unification. Versions button. |
| `project_molly_ds_loop.md` | Auto-progress paradigm 적용 — review fail은 warning으로 demote, severity='critical' 만 paused. |
| `project_canvas_future.md` | Plan v3 G2-G6 (DS missing AI judge + governance) 다음 세션 진입. Phase 3 (revert + followup) 도. |
| (신규) `feedback_paradigm_pivot_signal.md` | "AI 가 자동 진행 vs 사용자 task-level 개입" — 사용자가 task-level 결정 안 함 paradigm 강력 선호. interim review/skip UX는 confusion 만 증가 |

---

## 6. Service ports + verification (2026-05-20 새벽 종료 시점)

- orchestrator `:3847` ✅ listening (PID 알 수 없음 — 마지막 restart `bo7088di5` background task)
- design-system-site `:4176` ✅ (가정)
- playground-app `:4180` ✅ (Vite HMR 으로 자동 반영됨)
- dashboard `:4174` ✅ (가정)
- Chrome ext: **reload 필요** (chrome://extensions → 새로고침) — 오늘 sidepanel.js 변경 5건

---

## 7. 관련 file index

### 코드 변경 (오늘 누적, 14 파일)
**Backend:**
- `orchestrator/lib/job.js` (Task typedef + buildJobSummary)
- `orchestrator/lib/job-runner.js` (severity branch + changedFiles propagation)
- `orchestrator/lib/job-reviewer.js` (IMPORTANT FLAGS + severity output)
- `orchestrator/lib/molly-plan-emitter.js` (is_new_build + language unify)
- `orchestrator/lib/molly.js` (Original PRD + final summary + new-build marker + missing-cards suppress)
- `orchestrator/server.js` (changedFiles in adapter return + summary attach)

**Frontend (playground-app):**
- `playground-app/src/services/orchestrator-client.ts` (5 type extensions)
- `playground-app/src/store/playground-store.ts` (PlanItem.isNewBuild)
- `playground-app/src/editor/AIPanel.tsx` (SSE reconcile + Plan v3 G1 + 🛠 badge)
- `playground-app/src/editor/JobCard.tsx` (Original PRD + warning count + 🛠 badge + ⚠ icon + FinalSummarySection)
- `playground-app/src/pages/PlaygroundDetail.tsx` (Versions button)

**Frontend (chrome-extension):**
- `chrome-extension/sidepanel.js` (Original PRD + final summary card + 🛠 marker + missing-cards suppress)

**Scripts:**
- `orchestrator/scripts/plan-emitter-paired-smoke.mjs`
- `orchestrator/scripts/plan-emitter-paired-evaluate.mjs`

### 신규 file (오늘)
- `docs/superpowers/plans/2026-05-19-job-pipeline-stuck-states-and-new-build.md` (DEPRECATED v1)
- `docs/superpowers/plans/2026-05-19-job-pipeline-auto-progress-and-final-summary.md` (v3 active)

### 핸드오프
- 본: `docs/superpowers/handoffs/2026-05-19-paradigm-shift-auto-progress-and-ds-missing-light-fix.md`
- 어제: `docs/superpowers/handoffs/2026-05-19-plan-emitter-v2-user-facing-and-ui-cleanup.md`

---

## 8. Session reflection

오늘 세션은 **사용자 통찰이 시스템 설계를 매번 바꾸는 패턴**의 가장 강력한 예. v1 plan 작성 → Momus 4 critical issues → 사용자 paradigm pivot 통찰 → v2/v3 거의 새 plan → Phase 1/2 ship → 검증 중 또 다른 통찰 (language, intake bleed, Versions, DS missing) → 추가 light fix들. 한 세션 16 commit + 2 plan doc + 2-round critic review + multiple user-direction pivots.

**confusion-free first** 원칙 (어제 §5.0) 이 paradigm pivot의 진짜 신호. 사용자가 시스템을 사용하면서 무엇이 confusion 인지를 발견 → 즉시 fix. 다음 세션도 plan v3 진입 + 작은 PRD 발사 → 또 다른 통찰 → … 의 cycle 이 예상됨.

---

*Handoff 작성: 2026-05-20 새벽 Claude session. 16 commit + 2 plan + 2-round Momus + 5 사용자 통찰 반영 + Phase 1/2 ship + Plan v3 G1 partial. 다음 세션은 Plan v3 G2-G6 (DS missing AI judge + governance) + Phase 1/2 e2e 검증 작은 PRD 발사 우선.*
