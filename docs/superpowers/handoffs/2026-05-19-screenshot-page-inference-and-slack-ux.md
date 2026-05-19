# Handoff — 2026-05-19: Screenshot page inference fix + Slack progress UX + Decomposer timeout + 3 follow-up plans

**Date:** 2026-05-19
**Author:** kyungjae.ha (with Claude session)
**Branch:** main
**Predecessor handoff:** `docs/superpowers/handoffs/2026-05-19-screenshot-condensation-foundation-mcp.md` (어제 5-track plan + DESIGN.md Foundation + MCP)
**Parallel handoff:** `docs/superpowers/handoffs/2026-05-19-vp-pre-read-finalization.md` (VP 미팅 prep)

---

## TL;DR

오늘 세션의 4 progress + 3 approved follow-up plans.

**Shipped (code):**
1. ✅ **Screenshot page inference fix** — Chrome ext에서 region 캡처 후 chat 요청 시 Molly가 "어느 페이지인가요?" 되묻기 → **plan_emit 즉시 발사**. n=1 paired flip (ambiguous → clear) 확인. `clarity=ambiguous → clear`, `intake_result.kind=code_change_ambiguous → plan_emit`.
2. ✅ **Decomposer timeout fix** — `job-decomposer.js` fetch에 90s AbortSignal 추가. Stuck job 1b17e7df cancel. orchestrator restart로 새 코드 활성화.
3. ✅ **Slack progress messages** — 60-90s 무반응 → 2 단계 메시지 갱신 (`analyzing_prd` → `drafting_plan`). 사용자 테스트 pending.

**Planned (도구 4건 APPROVED, 실행 별 세션):**
- F4 paired 5-case 측정 (page-inference)
- Plan-emitter user-facing titles (v2 APPROVED, V0~V4 측정 게이트)
- DS missing AI judge + governance queue (v3 APPROVED, 10.5-15h 큰 plan)

---

## 1. Trigger + 흐름

### 1.1 Screenshot page inference (오늘 첫 user-reported case)

2026-05-19 11:19 — 사용자: Chrome ext에서 region 캡처 (`Available/Draft/Archived` 탭) + chat "탭을 4개로 만들고 삭제 탭을 마지막에 추가해줘"
→ Molly: "🤔 Could you tell me which page or component contains these tabs (Available / Draft / Archived) so I can add the '삭제' tab there?"
→ 어제 핸드오프 §1과 동일 증상 (`docs/superpowers/handoffs/2026-05-19-screenshot-condensation-foundation-mcp.md`). 즉 어제 commit `7ebe162` / `fddf2ec` / `cdbd2c8` 적용 후에도 user case 변화 0.

### 1.2 Decomposer stuck (오늘 두 번째 user-reported)
2026-05-19 13:14 — Slack에서 별 PRD 요청 → job `1b17e7df` decomposing 상태로 11분 hang. metrics에 decomposer event 0건.

### 1.3 Slack UX "멈춘 것 같다" (세 번째)
사용자 Slack chat 후 plan 발사까지 72s 동안 "🤔 One moment…" 만 노출.

### 1.4 Plan card verbosity + DS missing UX (네 번째 + 다섯 번째)
사용자 피드백: "Plan items의 자세히 보기 버튼이 너무 많아 — 사용자가 개발적 내용 + 파일 경로 같은 거 알아야 할 필요 있나?" + "DS missing 4 옵션은 사용자가 판단하기 어렵다 (사용자는 코드/구조 모름) — AI가 판단 + DS owner에게 에스컬레이션."

→ 두 가지 후속 plan으로 분리.

---

## 2. Shipped 변경 (commit-ready)

### 2.1 Page inference fix
| 파일 | 변경 |
|---|---|
| `chrome-extension/sidepanel.js` | helper `resolveCapturePageContext` extract (drift 방지) + intake 2 site에 `client`/`routeOrPage`/`language` 추가 |
| `orchestrator/lib/molly-prd-analyzer.js` | `buildContextPrefix` 헬퍼 + truthiness rules + recordEvent에 `client_attached` / `route_attached` / `language_attached` / `cache_create` / `cache_read` |

**핵심 telemetry (paired before/after):**
- 11:19:39: `clarity=ambiguous, img_attached=1, client/route/language=N/A (old code)` → `kind=code_change_ambiguous`
- 12:57:19: `clarity=clear, img_attached=1, client_attached=1, route_attached=1` → `kind=plan_emit`

### 2.2 Decomposer timeout
| 파일 | 변경 |
|---|---|
| `orchestrator/lib/job-decomposer.js` | fetch에 `AbortSignal.timeout(90000)`. 90s 초과 시 catch → setJobStatus(paused, pausedReason="decompose failed: ...") |

원인: decomposer는 prd-analyzer/plan-emitter와 달리 timeout/recordEvent 없음. Anthropic 응답 안 오면 영원히 hang.

### 2.3 Slack progress messages
| 파일 | 변경 |
|---|---|
| `orchestrator/lib/molly-intake.js` | `fireProgress(stage)` 헬퍼 + 2 호출 (`analyzing_prd` before prd-analyzer / `drafting_plan` before emitPlan) |
| `orchestrator/lib/molly.js` | Slack handler에 `onProgress` 콜백 wiring → chat.update로 thinkingTs 갱신. stage→message dict, fire-and-forget catch + logger.warn |

기대: "🤔 One moment…" → "📥 Got it — analyzing your request..." → "📝 Drafting a plan... (this usually takes 30-90s)"

---

## 3. Plan 문서 (5개)

### 3.1 APPROVED + shipped
- **`2026-05-19-screenshot-page-inference-fix.md`** (v3) — Lane 2 Slice 1.4 follow-up. F1 (RC-A 측정) + F2 (Chrome ext route/client/language) + F3a (prd-analyzer user msg prepend) + F3b prereq (recordEvent cache 필드) 다 실행. F4 paired 측정 + F3b 본 적용은 pending. momus 3차 APPROVED.

### 3.2 APPROVED + 실행 (P1+P2 only)
- **`2026-05-19-slack-progress-messages.md`** (v2) — P1+P2 shipped, P3 사용자 Slack 테스트 + P4 chrome ext/playground 회귀 검증 pending. momus APPROVED with minors.

### 3.3 APPROVED, 실행 대기
- **`2026-05-19-plan-emitter-user-facing-titles.md`** (v2) — plan-emitter SYSTEM_PROMPT에 forbidden jargon rule + 한국어/영어 paired examples. 회귀 위험 (fddf2ec cache 측정) — V2 paired smoke + cache gate (drop ≤ 10pp) 필수. momus APPROVED. 다음 세션.

- **`2026-05-19-ds-missing-ai-judge-governance.md`** (v3) — DS missing 4 옵션 사용자 surface 제거. AI judge (LLM 추가 호출) + governance queue (design-system-site `/governance` pull-based) + escalation_notices plan response 필드. ref_id `ESC-${base36(timestamp_ms)}`. 10.5-15h 큰 plan. momus 4차 APPROVED. 다음 세션.

### 3.4 DEPRECATED
- **`2026-05-19-ds-missing-card-ux.md`** (v1, 폐기) — auto-default + Advanced 메뉴 모델. 사용자 의도 ("AI가 판단해서 자동 처리, 사용자는 코드 모름") 와 모순 → 폐기. 후속 v3가 진짜 모델.

---

## 4. 측정 데이터

### 4.1 Page inference paired before/after (n=1)

| | Before (11:19) | After (12:57) |
|---|---|---|
| `clarity` | ambiguous | **clear** ✅ |
| `intake_result.kind` | code_change_ambiguous | **plan_emit** ✅ |
| `img_attached` | 1 (16426 bytes) | 1 (32342 bytes) |
| `client_attached` | n/a | **1** ✅ |
| `route_attached` | n/a | **1** ✅ |
| `language_attached` | n/a | 0 ⚠️ |
| `cache_create` | n/a | 0 |
| `cache_read` | n/a | 0 |
| `latency_ms` | 2988 | 2124 (−29%) |
| Plan result | "Which page?" 되묻기 | TVING OMS 정확 식별 + 5 STEPS + RISKS + VERIFICATION |

⚠️ `language_attached=0` 미스터리 — Chrome ext header banner에 "en" 표시되지만 prd-analyzer엔 안 옴. 다음 세션 quick debug 권장.

### 4.2 Slack plan-emitter latency
12:18 chrome-ext = ~40s, 13:09 slack = ~72s, 13:56 slack = ~72s (4084 output tokens, cache hit 112399). "this usually takes 30-90s" 워딩 정직.

---

## 5. 다음 세션 우선순위 (consolidated)

| 순위 | 항목 | 추정 |
|---|---|---|
| 🥇 1 | **사용자 Slack 테스트** — Plan 1 P3 (progress messages 보여지나) + P4 (Chrome ext/Playground 회귀 없나) | 15-30min |
| 🥈 2 | **`language_attached=0` 디버그** — Chrome ext에서 language가 안 흐르는지 sidepanel.js resolvedLanguage 추적 | 15min |
| 🥉 3 | **F4 paired smoke 측정** (page-inference) — 5 케이스, code_change_ambiguous flip + referenced_components 정확도 | 1.5h |
| 4 | **Plan 2 (plan-emitter titles) 실행** — V0~V3, cache gate (drop ≤ 10pp) | 2-2.5h |
| 5 | **Plan 3 (DS AI judge + governance) 실행** — G1~G6 큰 plan | 10.5-15h |
| 6 | **Pre-plan clarification** — 사용자가 "scope creep" 우려 제기. 별 thread, deep discussion 필요 (user "더 고민해볼게") | TBD |

---

## 6. 미해결 결정 / decision points

| # | 항목 | 위치 |
|---|---|---|
| 1 | Pre-plan clarification 메커니즘 — A (clarity 기준 확장) / B (pre-plan question LLM) / D (minimum viable plan + opt-in) — 사용자 선택 대기 | 별 thread |
| 2 | DS missing 4 옵션 사용자 surface 완전 제거 vs 점진적 deprecation | Plan 3 G4a/G4b |
| 3 | F3b (prd-analyzer system prompt 변경) 진입 vs F2/F3a로 충분 | Plan page-inference F4 결과 |
| 4 | Plan 2 cache regression gate 통과 시점 | 다음 세션 |
| 5 | DS owner 의 governance UI 인증/RBAC (지금은 시범 단계) | Plan 3 §3.2 비목표 |

---

## 7. Service ports + verification (2026-05-19)

- orchestrator `:3847` ✅ listening (PID 73743 → 새 코드 로드됨)
- design-system-site `:4176` ✅ (PID 23785)
- playground-app `:4180` ✅ (가정 — 검증 안 함)
- dashboard `:4174` ✅ (가정 — 검증 안 함)

⚠️ Duplicate `pnpm dev` watcher (2개) 가 orchestrator 시작 시 EADDRINUSE 발생. 한 watcher (PID 15735) kill로 해결. 향후 정리.

---

## 8. Memory 갱신 권장

| 메모리 항목 | 갱신 내용 |
|---|---|
| `project_canvas_app.md` | Lane 2 Slice 1.4 F1 측정 완료, F2/F3a/F3b prereq shipped. user-reported case n=1 paired flip. F4 본 측정 + F3b 적용 pending. |
| `project_ds_direction.md` | Plan 3 (DS missing AI judge + governance) APPROVED. 4 옵션 사용자 surface 제거 + governance queue 시범 도입. |
| `project_molly_ds_loop.md` | T1.4 F1 완료, F4 paired 측정 pending |
| 새 메모리 `project_ds_governance.md` (G6 완료 후) | DS owner workflow + queue lifecycle + 4 kinds 의미 |

---

## 9. 관련 파일 인덱스

### 코드 변경 (5)
- `chrome-extension/sidepanel.js` — F2 (resolveCapturePageContext + intake 2 site)
- `orchestrator/lib/molly-prd-analyzer.js` — F3a + F3b prereq
- `orchestrator/lib/job-decomposer.js` — timeout fix
- `orchestrator/lib/molly-intake.js` — fireProgress callsites
- `orchestrator/lib/molly.js` — Slack onProgress wiring

### Plan 문서 (5)
- `docs/superpowers/plans/2026-05-19-screenshot-page-inference-fix.md` (v3)
- `docs/superpowers/plans/2026-05-19-slack-progress-messages.md` (v2)
- `docs/superpowers/plans/2026-05-19-plan-emitter-user-facing-titles.md` (v2)
- `docs/superpowers/plans/2026-05-19-ds-missing-ai-judge-governance.md` (v3)
- `docs/superpowers/plans/2026-05-19-ds-missing-card-ux.md` (DEPRECATED v1)

### 핸드오프
- 본 핸드오프: `docs/superpowers/handoffs/2026-05-19-screenshot-page-inference-and-slack-ux.md`
- 어제: `docs/superpowers/handoffs/2026-05-19-screenshot-condensation-foundation-mcp.md`
- 어제 별 thread: `docs/superpowers/handoffs/2026-05-19-vp-pre-read-finalization.md`

---

*Handoff 작성: 2026-05-19 Claude session. user-reported issues 5개 (page inference, decomposer hang, Slack UX, verbosity, DS missing UX) → 코드 3 fix + plan 3 APPROVED. 다음 세션은 user testing + F4 + Plan 2 → Plan 3 분리 lane.*
