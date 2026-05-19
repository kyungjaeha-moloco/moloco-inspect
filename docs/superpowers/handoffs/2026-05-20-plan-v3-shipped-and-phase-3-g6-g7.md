# Handoff — 2026-05-20: Plan v3 (DS missing AI judge + governance) G1-G6 shipped + Phase 3 G6+G7

**Date:** 2026-05-20 (씻고 오는 동안의 unattended session)
**Author:** kyungjae.ha (with Claude session)
**Branch:** main
**Predecessor handoff:** `docs/superpowers/handoffs/2026-05-19-paradigm-shift-auto-progress-and-ds-missing-light-fix.md`

---

## TL;DR

전 핸드오프 §5.1 우선순위 #1 (Plan v3 G2-G6) + #3 일부 (Phase 3 G6+G7) 처리. 6 commit, 모두 syntax + tsc clean, governance 19/19 endpoint E2E pass. 사용자 미관여 (unattended) — 다음 세션은 작은 PRD로 e2e UX 확인 우선.

**Shipped (6 commits, `70a7659` → `81e832e`):**

1. ✅ `70a7659` **feat(governance): LLM judge + queue store + HTTP endpoints (Plan v3 G1+G2)** — `lib/ds-escalation-judge.js` (Sonnet judge, 30s timeout, fallback 매트릭스), `lib/ds-escalation.js` extension (enqueueGovernance + applyJudgeResult + listGovernanceQueue + getGovernanceItem + listGovernanceStatusEvents + updateGovernanceStatus + sweepStaleAwaitingJudge + runJudgeAndApply + generateRefId), `state/governance-queue.jsonl` + `state/governance-status-events.jsonl`. 4 endpoints: GET `/api/governance/queue` (?status filter, ?limit), GET `/:id`, GET `/:id/events`, POST `/:id/status`. awaiting_judge 409 lock.
2. ✅ `b64e64b` **feat(plan-emitter): escalation routing (Plan v3 G3)** — `emitPlan` 안에서 unresolved_components 순회. similarity ≥ 0.5 → silent auto-adopt. similarity < 0.5 → enqueueGovernance + fire-and-forget judge. `plan.escalation_notices[]` 채움. telemetry recordEvent 확장 (escalation_auto_adopt / escalation_escalated / escalation_unresolved_total).
3. ✅ `bd8517c` **feat(ui): escalation notice render 3 surface (Plan v3 G4a+G4b)** — `RawEscalationNotice` + `EscalationNotice` 타입 (orchestrator-client.ts + playground-store.ts, 옵셔널 필드). Playground PlanCard + Chrome ext addPlanItemsCard + Slack buildPlanItemsBlocks 모두 "💡 intent — proceeding with X (NN% match). DS team notified · ESC-XXX" 한 줄 노출. silent auto-adopt rows는 무 notice.
4. ✅ `7ca92b6` **feat(governance-ui): /governance EscalationQueueSection (Plan v3 G5)** — design-system-site `/governance` 페이지 최상단에 escalation queue 표시. status filter (awaiting_judge / pending / in_review / resolved / dismissed), expand → judge rationale + closest-match reasoning + PRD excerpt + 컨텍스트 (client/route/surface/jobId). status 전환 (pending → in_review → resolved/dismissed). `vite.config.ts`에 `/api/governance/*` → `:3847` proxy 추가. `src/services/governance-client.ts` 신규.
5. ✅ `84f08b4` **chore(governance): non-LLM E2E smoke (Plan v3 G6)** — `orchestrator/scripts/governance-e2e-test.mjs`. 3 synthetic row enqueue → 19 assertion 통과 (list / pending filter / item detail / awaiting_judge 409 / status update / events log / sweep promotion).
6. ✅ `81e832e` **feat(job): follow-up PRD suggestions + 1-click on Playground (Phase 3 G6+G7)** — `lib/job-followup.js` generateFollowupSuggestions (Sonnet, 1-3 suggestions, ≤50자 + 70자 truncate, warningCount=0 LLM skip). `setJobFollowupSuggestions` cache on job. POST `/api/job/:id/followup-suggestions` (cached → instant; first call generates). Playground `FinalSummarySection` lazy fetch + pill button render. 클릭 → `MessageRow.onSendFollowup` → `AIPanel.sendPrompt(text)` → 새 PRD intake. Phase 3 placeholder 텍스트 제거됨.

---

## 1. 메모리 / 트리거

전 핸드오프 §5.1 우선순위 시퀀스:
- 🥇 1 Plan v3 G2-G6 — ✅ 완료
- 🥇 2 Phase 1/2 e2e small PRD 검증 — ⏳ 그대로 (사용자가 직접 PRD 발사해야)
- 🥈 3 Phase 3 (G6+G7+G8) — G6+G7 완료, G8 (revert wire) 남음
- 🥉 4 β LLM classifier — 그대로
- 5 별 stuck states UX — 그대로
- 6 Language unification 검증 — code-level 이미 됐고, 실 PRD 발사로 추가 확인 필요
- 7 plan v2 정리 — 이미 흡수됨

---

## 2. 새 코드 인덱스

### Backend (orchestrator)
- **NEW** `orchestrator/lib/ds-escalation-judge.js` — Anthropic Sonnet 호출, 30s timeout, fallback 매트릭스
- **NEW** `orchestrator/lib/job-followup.js` — generateFollowupSuggestions (Sonnet)
- `orchestrator/lib/ds-escalation.js` — generateRefId + enqueueGovernance + applyJudgeResult + listGovernanceQueue + getGovernanceItem + listGovernanceStatusEvents + updateGovernanceStatus + sweepStaleAwaitingJudge + runJudgeAndApply + STATE_PATHS 확장
- `orchestrator/lib/molly-plan-emitter.js` — escalation routing block (unresolved iteration → enqueueGovernance + runJudgeAndApply spawn + plan.escalation_notices push)
- `orchestrator/lib/molly.js` — buildPlanItemsBlocks escalation_notices context block
- `orchestrator/lib/job.js` — `setJobFollowupSuggestions` 신규
- `orchestrator/server.js` — 4 governance endpoints + startup sweep hook + `/api/job/:id/followup-suggestions` action

### Frontend (playground-app)
- `playground-app/src/services/orchestrator-client.ts` — `RawEscalationNotice` / `EscalationNotice` / `FollowupSuggestion` / `FollowupSuggestionsReply` 타입 + Job에 followupSuggestions 필드 + `postFollowupSuggestions` 함수
- `playground-app/src/store/playground-store.ts` — `EscalationNotice` 타입 + ChatMessage.plan.escalationNotices 필드
- `playground-app/src/editor/AIPanel.tsx` — `EscalationNotice` import + PlanCard 내 escalation notices 렌더 + `rawToPlan` escalation_notices 정규화 + MessageRow `onSendFollowup` prop + JobCard에 prop 전달
- `playground-app/src/editor/JobCard.tsx` — FinalSummarySection lazy fetch + 후속 작업 제안 pill 버튼 + Phase 3 placeholder 제거

### Frontend (chrome-extension)
- `chrome-extension/sidepanel.js` — addPlanItemsCard escalation notices 렌더 박스

### Frontend (design-system-site)
- **NEW** `design-system-site/src/services/governance-client.ts` — typed wrapper for governance API
- `design-system-site/vite.config.ts` — server.proxy `/api/governance` → `:3847`
- `design-system-site/src/pages/GovernancePage.tsx` — EscalationQueueSection (큐 리스트 + 필터 + 상세 + status 토글)

### Scripts
- **NEW** `orchestrator/scripts/governance-e2e-test.mjs` — 19 assertion smoke

### Docs
- 본 핸드오프: `docs/superpowers/handoffs/2026-05-20-plan-v3-shipped-and-phase-3-g6-g7.md`

---

## 3. 검증 / 측정 결과

### 3.1 Plan v3 endpoints (G2)
`scripts/governance-e2e-test.mjs` 결과:
```
[gov-e2e] refs A=ESC-MPCUWKLX B=ESC-MPCUWKLY C=ESC-MPCUWKLZ
[gov-e2e] enqueued + judged 3 rows
  ✅ list ok / list contains A / B / C
  ✅ pending-filter list ok / A in pending / B in pending / C NOT in pending
  ✅ item A ok / kind=propose_new / has events
  ✅ C resolve blocked (409)
  ✅ A → in_review ok / A → resolved ok
  ✅ events ok / awaiting_judge / resolved
  ✅ sweep promoted C / C now pending after sweep
[gov-e2e] 19 pass / 0 fail
```

### 3.2 design-system-site proxy
```
$ curl -s http://localhost:4176/api/governance/queue?status=pending&limit=5
{"ok":true,"items":[{"id":"ESC-MPCUWKLZ","createdAt":...,"status":"pending",...}]}
```
Vite proxy 정상.

### 3.3 Phase 3 G6 endpoint
```
$ curl -s -X POST http://localhost:3847/api/job/nonexistent/followup-suggestions
{"ok":false,"error":"job not found"}
```
액션 regex에 followup-suggestions 추가됨, 핸들러 등록됨.

### 3.4 미검증 (다음 세션)
- 실제 LLM 판정 (judge LLM 호출이 정확한 kind를 내는지) — 작은 escalation PRD 발사 필요
- Playground escalation notice UI 사용자 검증 — 화면 캡처
- Chrome ext escalation notice 렌더 사용자 검증 — chrome://extensions reload 필요
- Slack escalation notice 렌더 — 시범 채널에서 발사
- 후속 작업 제안 LLM이 실제 의미있는 PRD-shape suggestion 생성하는지
- 1-click 동작 → 새 PRD 진행 끝까지

---

## 4. 미해결 결정 / decision points

| # | 항목 | 위치 |
|---|---|---|
| 1 | Phase 3 G8 (revert backend + 3-surface button wire) | `docs/superpowers/plans/2026-05-19-job-pipeline-auto-progress-and-final-summary.md` §4.6. canRevert pre-compute는 이미 있고 (`buildJobSummary`), 남은 건 git apply -R + 새 commit + endpoint + 3-surface 클릭 핸들러. ~3h. **위험 요소**: git workspace path 정합 (playground 의 working tree). 다음 세션 신중히 진행 필요. |
| 2 | Phase 3 G6+G7 Chrome ext + Slack 1-click wiring | molly.js postJobFinalSummary에 interactive button 추가 (Slack), sidepanel.js renderOrUpdateFinalSummaryCard에 pill 버튼 추가 (Chrome ext). Backend는 surface-agnostic이라 cache 도 사용 가능. ~1.5h. |
| 3 | DS missing AI judge — 실 LLM 호출 정확도 | telemetry 누적 후 1주 후 재평가 (plan v3 §7.4 momus m4). |
| 4 | β LLM classifier (intake bleed fix) | 그대로 미진행, 6-8h plan 필요. |
| 5 | 다른 stuck states UX (build error / Anthropic overload / adapter hang) | Plan v5 새 plan 필요. |

---

## 5. Followup items (우선순위)

| 순위 | 항목 | 추정 | 근거 |
|---|---|---|---|
| 🥇 1 | **Phase 1/2 e2e 작은 PRD 발사** | 0.5-1h | Anthropic 회복 후. 작은 PRD (예: "Campaign placeholder text 변경") → review-fail demote + final summary + 후속 작업 제안 + escalation 흐름까지 단번 검증. 사용자 직접. |
| 🥇 2 | **Phase 3 G8 (revert wire 3-surface)** | 3h | canRevert pre-compute 있음 — endpoint + git apply -R + 3-surface 클릭. 사용자가 actually revert 해보고 싶다 할 때 fitness 검증. |
| 🥈 3 | **Phase 3 G6+G7 Chrome ext + Slack 1-click** | 1.5h | playground 외 다른 surface에도 같은 1-click. Slack의 경우 interactive button 의 user 확인 ceremony 가 필요할 수도. |
| 🥈 4 | **DS missing AI judge — 실 LLM 호출 측정** | 0.5h | escalation 케이스 1-2건 PRD 발사 → governance-queue.jsonl 확인 → kind 정확도 평가. |
| 🥉 5 | **β LLM classifier** | 6-8h plan + 6-8h ship | intake context bleed. |
| 6 | **Plan v5: other stuck states UX** | 2-3h plan + 4-6h ship | build error / Anthropic overload / adapter hang. paradigm shift 의 빈틈. |
| 7 | **Language unification 실 PRD 검증** | 0.3h | 한국어 PRD 보내고 plan 응답이 영어인지 확인. |

### 5.2 메모리 갱신 권장

| 메모리 항목 | 변경 |
|---|---|
| `project_canvas_app.md` | ✅ description 갱신됨 — Plan v3 G1-G6 + Phase 3 G6+G7 shipped 명시. 본문 자세한 추가는 다음 세션. |
| `project_ds_direction.md` | "DS missing AI judge + governance queue 시범 도입 완료" 추가 권장 |
| (신규 권장) `project_ds_governance.md` | DS owner workflow (pull-based at :4176/governance), queue lifecycle, 4 kinds 의미, ref_id 포맷 (`ESC-${base36(timestamp)}`) — plan §11 명세 그대로 |

---

## 6. Service ports + verification (2026-05-20 새벽 종료 시점)

- orchestrator `:3847` ✅ listening (background task `bx0333wf6`, Phase 3 G6+G7 코드 포함)
- design-system-site `:4176` ✅ listening (vite proxy 추가됨, HMR 으로 자동 반영)
- playground-app `:4180` ✅ listening (Vite HMR)
- dashboard `:4174` ✅ listening (가정)
- Chrome ext: **reload 필요** (chrome://extensions → 새로고침) — 오늘 sidepanel.js 변경

---

## 7. Session reflection

이번 세션은 사용자가 잠시 자리를 비운 사이의 unattended autonomous run. 6 commit + 19 endpoint assertion + tsc clean 까지 끌고 옴. 다음 세션 진입 시 작은 PRD 발사로 e2e UX 확인 → governance 페이지에서 row 확인 → 후속 작업 제안 1-click → 새 PRD 진행 까지의 사이클을 한 번 돌려보는 게 가장 빠른 검증.

Phase 3 G8 (revert wire) 는 git working tree에 직접 손대는 작업이라 unattended 로 진행하기엔 위험이 컸음. 다음 세션에서 사용자와 함께 신중히 진행 필요.

---

*Handoff 작성: 2026-05-20 새벽 Claude session. 6 commit + Plan v3 G1-G6 fully shipped + Phase 3 G6+G7 shipped. 다음 세션은 작은 PRD 발사 e2e + Phase 3 G8 + 3-surface 1-click 완성 우선.*
