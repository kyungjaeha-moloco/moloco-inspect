# Handoff — 2026-04-30 마라톤 세션 종합

**Date:** 2026-04-30
**Author:** kyungjae.ha (with Claude)
**Branch:** main (clean)
**Prior handoffs:** `2026-04-29-chrome-ext-step-3-4.md`, `2026-04-30-molly-chat-mode.md`, `2026-04-30-l1-assertions-action-reasons.md`, `2026-04-30-multi-tenant-v1.md`

---

## TL;DR

> 이번 세션은 **molly + 3 surface (Slack / Chrome ext / Playground) 통합 강화 + 4 가지 리서치 문서 + multi-tenant v1 별도 repo 작업**. 24+ commits, 7+ slices.

세션 중 사용자 명시 결정으로 **3 surface 의 entry point 통합 방향** 도 잡힘 (Phase 1 완료, Phase 2-3 plan 으로 정리).

---

## 이번 세션 commits (시간순)

### Block A — Slice 1 (오전): Chrome ext Phase 2 Step 3+4 (Slack lifecycle parity)
이전 handoff (`2026-04-29-chrome-ext-step-3-4.md`) 에서 종합. 8 commits.

### Block B — Slice 2: molly chat mode 3 surface 통합
이전 handoff (`2026-04-30-molly-chat-mode.md`) 에서 종합. 5 commits.

### Block C — Slice 3: Level 1 assertions + 액션 사유 enum
이전 handoff (`2026-04-30-l1-assertions-action-reasons.md`) 에서 종합. 3 commits.

### Block D — 리서치 + 결정 framework
4 docs in `docs/superpowers/research/`:
- `2026-04-30-feedback-loop-decision-framework.md` — 5 framework / 7 함정 / 결정 알고리즘 (재사용 reference)
- `2026-04-30-molly-feedback-loop.md` — molly 옵션 비교
- `2026-04-30-molly-failure-taxonomy.md` — 24 잡 open coding 10 카테고리
- `2026-04-30-multi-tenant-onboarding.md` — multi-tenant 아키텍처 옵션

### Block E — Slice 4: 사용자 명시 follow-ups (parallel batch)
- `5eae916` Slack reason picker (handleTaskAction modal)
- `b3edc31` Playground reason picker (ReviewFailActions select)
- `f3ee476` Chrome ext 4 follow-ups (dirty-check / Promote unlock / cancelled / overflow)

### Block F — Slice 5+6: multi-tenant v1 (별도 repo)
- `3093a52` plan (inspect repo)
- 별도 repo (Agent-Design-System/msm-portal `feature/multi-tenant-v1`):
  - `a86d29d5` baseTheme + mergeTheme
  - `2a42c203` CLI 자동화
  - `6d5016e7` dry-run 검증
- `9612014` cross-repo handoff (inspect repo)

### Block G — molly chat ops 운영 개선
- `571286b` 4 개선 (PRD nudge / observability / typing indicator / status fallback)

### Block H — molly thread mapping + Chrome ext last playground reuse
- `efc0ce4` Slack thread → playground 1:1 매핑
- `f1f2180` Chrome ext lastPlaygroundId reuse + [+ 새 작업] 버튼

### Block I — molly external transition fix
- `aaf2482` Playground/외부 approve/cancel 시 Slack 알림 + plan card stamp
- `efa94e7` MOLLY_PLAYGROUND_ID legacy fallback 제거 (새 thread = 새 playground)

### Block J — molly status thread 인지
- `fd4b43d` "이 thread 에 playground 있어?" 정확 답변

### Block K — Phase 1 (unified intake)
- `db806c9` PRD 명확도 체크 — Slack/Chrome ext 도 Wizard 처럼 clarify
- `53ffdf2` plan 추가
- `975a2c1` Playground 의 isFirst 가드 제거 (매 turn classifier)

총 ~24 commits inspect repo + 3 commits Agent-Design-System repo.

---

## What shipped (요약)

### A. molly = 진짜 3 surface 통합 ("molly everywhere")

- Slack `@molly` / Chrome ext 사이드패널 / Playground 채팅 모두 같은 정책으로 작동
- 입력 종류별 분기 (chat / status / code_change) — classifier 로
- 모호한 PRD 는 clarifying Q (Phase 1 통합)
- 같은 thread / 같은 사용자 작업 = 같은 playground reuse
- 새 작업 = 새 playground (Slack thread / Chrome ext "+새 작업" 버튼)
- 외부 transition (Playground 에서 승인/취소) Slack 에 알림 + plan card 무력화

### B. molly QA 강화 — Level 1 deterministic + Constitutional 셀프크리틱 시작점

- agent_review LLM verdict 위에 5 개 deterministic assertion (sign-in redirect / HTTP / route mismatch / blank body / page errors)
- 합성 검증 4/4 통과 (verify-agent-review.mjs)
- LLM 단독 false-pass 차단 (실 잡 88a27157 같은 케이스)

### C. 액션 사유 enum 시작 — 데이터 누적 base

- ACTION_REASONS 7 개 (syntax_error / logic_error / scope_creep / partial / wrong_target / over_delivered / other)
- 3 surface UI (Slack modal / Chrome ext picker / Playground select)
- task.actionHistory[] / job.cancelMeta persist
- 50 잡 누적 후 분포 분석 → prompt 튜닝 데이터

### D. Chrome ext 4 follow-up

- task-transition card dirty-check (race + leak 방지)
- Promote 카드 idempotent unlock fallback
- cancelled card surface
- reviewed/skipped task collapse

### E. multi-tenant v1 (별도 repo)

- baseTheme + mergeTheme + 4 client config/theme.ts (시각 회귀 0)
- CLI 자동화 (vite alias / package.json / firebaserc 패치)
- 신규 클라 온보딩 ~1-3일 → ~반나절

### F. 4 research docs — 향후 의사결정 reference

- 피드백 루프 결정 framework (Hamel Husain / Shankar / Yan / Anthropic / Kothari 5 framework + 7 함정 + Q1~Q7 알고리즘)
- molly 실패 유형 분류 (24 잡 open coding 10 카테고리)
- multi-tenant 아키텍처 옵션 비교

### G. unified intake — Phase 1 ✅ / Phase 2-3 plan

- 모든 surface 가 단일 entry point (`/api/intake`) 거치는 통합 방향
- Phase 1 (PRD 명확도 체크) 완료
- Phase 2-3 (통합 라우트 + surface refactor) plan: `docs/superpowers/plans/2026-04-30-unified-intake.md`

---

## Files changed (이번 세션, inspect repo)

```
A  orchestrator/lib/molly-classifier.js
A  orchestrator/lib/molly-chat.js
A  orchestrator/lib/molly-status.js
A  orchestrator/lib/molly-prd-analyzer.js
A  orchestrator/lib/slack-thread-map.js
A  orchestrator/lib/qa-adapters/agent-review.js (Level 1 추가)
A  orchestrator/scripts/verify-agent-review.mjs
A  orchestrator/scripts/verify-level1-assertions.mjs
M  orchestrator/lib/molly.js (handleMention 분기, thread mapping, transitions, prd analyzer, ...)
M  orchestrator/lib/job.js (ACTION_REASONS, slackContext partial update, action meta persist, ...)
M  orchestrator/server.js (다수 endpoint 추가/수정)
M  chrome-extension/sidepanel.js (lifecycle cards, classifier gate, picker, lastPlaygroundId, ...)
M  chrome-extension/sidepanel.css
M  chrome-extension/sidepanel.html
M  playground-app/src/services/orchestrator-client.ts (mollyClassifyAndDispatch, picker actionMeta)
M  playground-app/src/editor/AIPanel.tsx (classifier gate, isFirst 제거, ...)
M  playground-app/src/editor/JobCard.tsx (ReviewFailActions select)
A  docs/superpowers/research/2026-04-30-{feedback-loop-decision-framework,molly-feedback-loop,molly-failure-taxonomy,multi-tenant-onboarding}.md
A  docs/superpowers/plans/2026-04-30-{level1-assertions-action-reasons,multi-tenant-v1,unified-intake}.md
A  docs/superpowers/handoffs/2026-04-30-{molly-chat-mode,l1-assertions-action-reasons,multi-tenant-v1,marathon-session}.md
M  orchestrator/state/slack-thread-playgrounds.json (새 매핑 저장 위치)
```

---

## 다음 세션 첫 5분 (Pre-flight)

```bash
git status --short
git log --oneline -25  # 이번 세션 commits 다 보임

# 서비스
curl -s -o /dev/null -w "orch :3847 → %{http_code}\n" http://localhost:3847/api/playground
curl -s -o /dev/null -w "play :4180 → %{http_code}\n" http://localhost:4180/
curl -s -o /dev/null -w "dash :4174 → %{http_code}\n" http://localhost:4174/

# Phase 1 새 endpoint sanity
curl -s -X POST http://localhost:3847/api/molly/respond \
  -H 'content-type: application/json' \
  -d '{"text":"개선해줘","surface":"slack"}' | head -c 400
# expect: {"ok":true,"kind":"code_change","clarity":"ambiguous","clarifyingQuestion":"..."}

# Restart 권장 — 옛 코드 process 면 분류 게이트 + Phase 1 미반영
# cd orchestrator && pnpm start

# Chrome ext reload (chrome://extensions/) — sidepanel 변경 반영
```

---

## 다음 세션 후보 (우선순위)

### 1. Phase 2 — `/api/intake` 통합 라우트 (~1 주)

Plan: `docs/superpowers/plans/2026-04-30-unified-intake.md` 의 Phase 2 (Task 2.1~2.3).

- `orchestrator/lib/molly-intake.js` 신설 (`processIntake` 단일 함수, 4 lib wrap)
- `/api/intake` 라우터
- 기존 `/api/molly/respond` 도 동일 lib 호출 (alias)

### 2. Phase 3 — Surface refactor + Wizard 흡수 (~1 주)

같은 plan 의 Phase 3 (Task 3.1~3.5).

- Playground AIPanel: `/api/chat` → `/api/intake` 로 전환
- Wizard 의 multi-turn 도 통합 라우트 안에서 처리
- Chrome ext / Slack 도 동일 interface
- `/api/chat` deprecate

### 3. multi-tenant v1 PR + merge

별도 repo 의 `feature/multi-tenant-v1` 브랜치. PR 만들고 review + main merge. 사용자 협업 필요.

### 4. v2 multi-tenant — 첫 brand color (별 plan)

tving 의 실제 brand color (`#E41C38` 류) 적용. v1 은 empty override.

### 5. 50 잡 누적 후 데이터 측정

- assertion vs LLM verdict disagreement 빈도 (false-pass 잡힌 케이스)
- task.actionHistory[].reason !== null 비율 (< 30% 면 picker 강제 enum)
- A3 redirect warning 의 의도된 vs 회귀 비율 (7:3 이상이면 hard fail 전환)
- molly classifier misfire 분포 (chat / code_change 오인 빈도)

### 6. molly chat mode 더 깊은 기능

- chat 응답이 multi-turn (현재는 single turn)
- 자연어 액션 ("이 잡 cancel 해줘", "promote 진행해줘")
- GitHub / Drive 외부 도구 통합 (research doc 의 v3 backlog)

### 7. Sandbox vite EPIPE auto-recovery

handoff 의 known limit. supervisorctl restart vite 자동 호출. ~30 분 슬라이스.

### 8. Decomposer 가 큰 PRD epic 자동 분해

PRD analyzer 다음 단계 — clarity 외에 size/scope 분석 → epic → sub-PRDs 자동 제안. 현재는 "단일 job 으로 강제" 만.

---

## 알려진 한계 / footguns

- **Sandbox vite EPIPE** — 컨테이너 안 esbuild 자식 프로세스 죽으면 `[plugin:vite:esbuild] The service is no longer running` 에러. 복구: `docker exec inspect-pg-<id> supervisorctl restart vite` (수동).
- **Playground 동시 잡** — 한 playground 동시 1 잡. 이미 잡 진행 중에 새 잡 시도 → `job_active` 409.
- **molly watcher 30분 timeout** — qa/complete/paused 는 silent skip. 단 watcher 자체는 30 분에 expire.
- **Auto-create playground 30s 부팅** — 첫 멘션 시 30s 대기. UX indicator ("🐣 새 Playground 부팅 중…") 있음.
- **Phase 1 PRD analyzer 의 fallback=clear** — 분석 실패 시 잡 진행. 잘못된 잡 만들어질 수 있음. 단 task review 가 잡아냄.
- **Playground isFirst 가드 제거 후 부작용** — Wizard 의 clarifying 답변 ("TVING") 이 chat 으로 misclassify 가능. Phase 2 통합으로 해결 예정.
- **Pre-existing Inspect Console TS 에러** — Recharts 타입, RequestDetailPage diff/log 필드 등.

---

## How to start the next session

```
이전 세션 핸드오프 4 개 읽고 종합 파악:
docs/superpowers/handoffs/2026-04-29-chrome-ext-step-3-4.md
docs/superpowers/handoffs/2026-04-30-molly-chat-mode.md
docs/superpowers/handoffs/2026-04-30-l1-assertions-action-reasons.md
docs/superpowers/handoffs/2026-04-30-multi-tenant-v1.md
docs/superpowers/handoffs/2026-04-30-marathon-session.md (이 문서)

main 깨끗. 24+ commits 이번 세션. 별도 repo (Agent-Design-System/msm-portal)
의 feature/multi-tenant-v1 브랜치 도 3 commits.

리서치 docs (의사결정 reference):
docs/superpowers/research/2026-04-30-{feedback-loop-decision-framework,
  molly-feedback-loop, molly-failure-taxonomy, multi-tenant-onboarding}.md

다음 슬라이스 후보 (우선순위 순):
  1. Phase 2 /api/intake (1주, plan 끝남)
  2. Phase 3 surface refactor (1주, plan 끝남)
  3. multi-tenant v1 PR + merge (사용자 협업)
  4. v2 multi-tenant — tving brand color
  5. 데이터 측정 (50 잡 누적 후)
  6. molly chat 자연어 액션 / 외부 도구
  7. Sandbox vite EPIPE auto-recovery
  8. Decomposer 큰 PRD epic 자동 분해

서비스: orchestrator :3847 / playground-app :4180 / dashboard :4174
orchestrator restart 필요할 수 있음 (Phase 1 새 endpoint 반영).
Chrome ext reload 권장 (sidepanel 변경 반영).
```

---

*마지막 업데이트: 2026-04-30 마라톤 세션 종료 시점*
