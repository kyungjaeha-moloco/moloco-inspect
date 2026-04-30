# Handoff — 2026-04-30 history-aware intake (Phase 3 Task 3.1 완성)

**Date:** 2026-04-30
**Author:** kyungjae.ha (with Claude)
**Branch:** main (clean)
**Prior handoffs:** `2026-04-30-marathon-session.md`

---

## TL;DR

> **1주 슬라이스 (Phase 3 Task 3.1) 가 sub-phase A → B → C → D → E 까지 다 ship.** unified intake 가 multi-turn (clarification + plan ceremony + approve/feedback) 까지 처리. surface 3 종 (Slack / Chrome ext / Playground) 다 history 동봉. `/api/chat` deprecation 시작. **D5 misclassify 진짜 fix.**

이번 세션 commits 21+ (sub-phase 단위 분리). Sub-phase C MVP 는 feature flag (`MOLLY_HISTORY_AWARE`) 로 점진 도입. Slack 은 thread reply 를 history 로 변환 — kind 는 휴리스틱.

---

## 이번 세션 commits (시간순)

### 세션 초반 — Phase 2 + 운영 fix (마라톤 세션 후속)
- `930a359` feat(molly): /api/intake 통합 라우트 — Phase 2
- `7e2daca` fix(molly): classifier prompt — lifecycle 명령 → status_query
- `32592c8` experiment(molly): prd-analyzer extended thinking
- `3219240` docs(plan): history-aware intake (1주 슬라이스 plan)
- `75dd8d2` fix(molly): status responder — lifecycle 액션 거짓 약속 금지
- `9b6c135` refactor(molly): Slack handleMention → processIntake 단일 호출 (Task 3.3)
- `ed168ba` refactor(chrome-ext): /api/molly/respond → /api/intake (Task 3.2)
- `45c3105` feat(orch): preview proxy — vite EPIPE auto-recovery
- `9c41d48` fix(chrome-ext): intake 게이트를 submit() 진짜 진입점에
- `379ade7` feat(chrome-ext): side panel origin lock — Claude ext 식

### 1주 슬라이스 sub-phase 단위
- `b51354e` Sub-phase A — processIntake history-aware skeleton
- `f34c1a5` Sub-phase B.1 + B.3 — multi-turn clarification (D5 fix)
- `25d2f9f` Sub-phase B.2 — molly-plan-emitter.js 추출
- `0ac2e65` Sub-phase B.4 — handlePlanEdit + plan_emit integration
- `fcfde28` Sub-phase C MVP — postIntake client + AIPanel feature flag
- `28708db` Sub-phase E — /api/chat deprecation 헤더
- `891caac` Sub-phase D — Chrome ext in-memory mollyChatHistory
- `99d7bf3` Sub-phase D — Slack thread reply → IntakeHistory

총 21+ commits. (마라톤 세션의 24+ 와 합쳐 2일 동안 ~45 commits.)

---

## What shipped

### A. unified intake 6 종 kind 완전 작동

`processIntake(text, ctx)` 가 ctx.history 받아 dispatcher 로 routing:
- **첫 턴 / prev=chat / prev=status_query / prev=clear / prev=job_dispatched** → handleFirstTurn (classifier → kind 별)
- **prev=code_change_ambiguous** → handleClarificationAnswer (cumulative 분석 → 여전히 ambiguous 면 다음 Q, clear 면 plan emit)
- **prev=plan_emit** → handlePlanEdit (APPROVE 휴리스틱 → job_dispatched, 자유 피드백 → plan re-emit)

IntakeKind = `chat` | `status_query` | `code_change_clear` | `code_change_ambiguous` | `plan_emit` | `job_dispatched`.

### B. D5 misclassify 진짜 fix

이전: Wizard 단답 "TVING" → classifier 가 chat 으로 → Wizard 흐름 깨짐.
이제: prev=ambiguous 인지 → cumulative 컨텍스트로 prd-analyzer 호출 → 적절한 follow-up Q ("TVING의 어느 페이지에 BETA 라벨?"). 

curl 검증 5/5 통과 (Group 3+4).

### C. Wizard ceremony server-side 통합

기존 `/api/plan` 의 LLM 호출 + DS context loading 을 `molly-plan-emitter.js` 로 추출. 이제 한 lib 이 surface 3 종 (Slack / Chrome ext / Playground) 의 plan emit 책임. `/api/plan` 은 thin wrap.

handlePlanEdit 의 APPROVE 휴리스틱: `^(이대로( 진행)?|진행( 해줘|해)?|승인|approve|ok|okay|네|예|yes)\.?$`. 매칭 시 `kind: job_dispatched` + cumulativePrd + planItems.

### D. surface 들이 history 동봉

- **Playground (Sub-phase C MVP)**: `localStorage.MOLLY_HISTORY_AWARE='1'` flag 로 새 path. default off. 활성 시 postIntake 호출 + history 동봉.
- **Chrome ext (Sub-phase D)**: `mollyChatHistory` module-level array (sidepanel session). addUserMessage / addMollyChatMessage 에서 push. submit/performSubmit 에서 동봉.
- **Slack (Sub-phase D)**: `buildSlackHistory()` — conversations.replies → history 변환. bot 메시지 휴리스틱 (`m.bot_id`, "🤔" 접두사 → ambiguous).

### E. `/api/chat` deprecation

응답에 `X-Deprecated`, `Sunset` 헤더 + `console.warn` (caller UA / origin 추적). 동작은 그대로. 호출 zero 확인 후 (50잡 측정 슬라이스 또는 Playground default ON 후) 삭제 사이클.

### F. 부수 효과들

- **chat 응답이 history 인지** — handleFirstTurn 가 history 마지막 3 turn 을 recentMessages 에 압축 주입 → composeChatReply 가 컨텍스트 활용. (curl A.2 검증: "근데 어떤 surface 가 가장 빠르게?" → chat 응답이 직전 대화 인지함.)

- **classifier lifecycle 명령** — "이 잡 cancel" 등 lifecycle 명령 → status_query 분류. status responder system prompt 도 거짓 약속 금지 ("저는 상태만 확인할 수 있어요" 명시).

- **Chrome ext side panel origin lock** — Claude ext 식 single-origin 동작. 첫 클릭한 origin 만 활성. 다른 origin 으로 navigate 하면 자동 collapse.

- **vite EPIPE auto-recovery** — esbuild 죽으면 supervisorctl restart vite 자동 호출 + 503 + Refresh:5 안내 페이지.

- **prd-analyzer extended thinking** — `MOLLY_PRD_THINKING=2048` (default ON). missingInfo 풍부도 ↑, latency 3s → 10s. env 로 즉시 off.

---

## Files changed (이번 세션)

### Create
```
A  orchestrator/lib/molly-plan-emitter.js (B.2)
A  docs/superpowers/plans/2026-04-30-history-aware-intake.md (1주 plan)
A  docs/superpowers/handoffs/2026-04-30-history-aware-intake.md (이 문서)
```

### Modify (이번 세션)
```
M  orchestrator/lib/molly.js                 (Slack handleMention → processIntake + buildSlackHistory)
M  orchestrator/lib/molly-classifier.js      (lifecycle 명령 → status_query)
M  orchestrator/lib/molly-status.js          (lifecycle 액션 거짓 약속 금지)
M  orchestrator/lib/molly-prd-analyzer.js    (history-aware + extended thinking)
M  orchestrator/lib/molly-intake.js          (history-aware dispatcher + handlers + plan emit)
M  orchestrator/server.js                    (/api/intake history, /api/plan thin wrap, /api/chat deprecation, vite EPIPE recovery)
M  chrome-extension/sidepanel.js             (intake gate at submit, in-memory history)
M  chrome-extension/background.js            (origin lock side panel)
M  playground-app/src/services/orchestrator-client.ts (postIntake + types)
M  playground-app/src/editor/AIPanel.tsx     (MOLLY_HISTORY_AWARE feature flag path)
```

---

## 다음 세션 첫 5분 (Pre-flight)

```bash
git status --short
git log --oneline -25  # 이번 + 마라톤 세션 commits

# 서비스
curl -s -o /dev/null -w "orch :3847 → %{http_code}\n" http://localhost:3847/api/playground

# /api/intake 6 종 kind smoke
curl -s -X POST http://localhost:3847/api/intake \
  -H 'content-type: application/json' \
  -d '{"text":"안녕"}' | head -c 200

# /api/chat deprecation 헤더 확인
curl -s -i -X POST http://localhost:3847/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"test"}]}' 2>&1 | head -5
# expect: X-Deprecated header

# orchestrator restart 권장 (이번 세션 변경 다 반영)
# cd orchestrator && pnpm start

# Chrome ext reload (chrome://extensions/) — sidepanel + background 변경
# Playground refresh — postIntake client 변경 + AIPanel feature flag
# Optional: localStorage.setItem('MOLLY_HISTORY_AWARE', '1') 로 새 path 활성
```

---

## 사용자 손길 검증 남은 것

| 작업 | 검증 방법 |
|---|---|
| Slack multi-turn | thread 안에서 PRD → 🤔 Q → 답 → 또 Q 또는 plan card |
| Chrome ext multi-turn (history) | sidepanel 안에서 PRD → 🤔 Q → 답 (history 가 server 로 가는지 devtools network 탭) |
| Playground multi-turn (feature flag) | localStorage MOLLY_HISTORY_AWARE='1' 후 새로고침 → multi-turn 작동 |
| vite EPIPE auto-recovery | sandbox 컨테이너 안 esbuild kill → preview 새로고침 → 503 + 자동 restart |

---

## 다음 세션 후보 (우선순위)

### 1. Sub-phase C 마무리 (~1d)
- `job_dispatched` 가 실제 createJob 트리거 (postChangeRequest 통합)
- message store 에 kind metadata 필드 추가 (history 정확도 ↑)
- ceremony state (pendingPlan / awaitingApproval) 를 history 로 통합
- MOLLY_HISTORY_AWARE default ON 전환

### 2. 자연어 액션 — 4번째 카테고리 `action` (~1주, plan 필요)
- D1/D2 의 진짜 fix — "이 잡 cancel" → 실제 cancel 실행
- handlePlanEdit 의 APPROVE 휴리스틱 확장 — cancel/promote/restart/retry
- 안전장치 (confirmation), audit log

### 3. Slack message metadata 박기 (~0.5d)
- bot 답변에 metadata API 또는 reaction 으로 kind 박기
- buildSlackHistory 의 휴리스틱 정확도 ↑

### 4. Decomposer — 큰 PRD epic 자동 분해 (~2-4h)
- prd-analyzer 다음 단계: size/scope 분석 → sub-PRD 들로 자동 제안
- handleClarificationAnswer 의 plan emit 결과가 너무 큰 epic 이면 분해 제안

### 5. 50 잡 누적 후 측정 (운영 1-2주 후)
- assertion vs LLM verdict disagreement 빈도
- task.actionHistory.reason null 비율
- A3 redirect warning 의도된 vs 회귀
- classifier misfire — lifecycle 규칙 false-positive (이번 세션 추가)
- thinking ON vs OFF — ambiguous 비율 / latency 인내 (이번 세션 추가)
- 짧은 모호 PRD ("디자인 좀 다듬어줘") 의 chat 폴주 비율 (이번 세션 회귀)

### 6. multi-tenant v1 PR + merge (별도 repo, 사용자 협업)
### 7. v2 multi-tenant — tving brand color (#9 후)

---

## 알려진 한계 / footguns

- **Sub-phase C MVP 의 job_dispatched 미구현** — `kind: job_dispatched` 받으면 안내 메시지만 surface. 실제 createJob 트리거는 후속 슬라이스. **현재 사용자가 plan 카드 승인 버튼 클릭으로 진행해야 함.** `MOLLY_HISTORY_AWARE` flag 활성화 시 plan_emit 후 승인 흐름이 두 가지 (헷갈림): (a) postIntake 가 자동 보낸 안내 메시지 + (b) plan card 승인 버튼.
- **Slack history 의 metadata 부재** — 휴리스틱 ("🤔 " 접두사) 만으로 ambiguous 분류. plan_emit 카드는 attachments 라 detect 안 됨 → 'chat' 으로 분류. Phase 4 후속에서 metadata API 또는 reaction emoji 로 박는 것 검토.
- **Chrome ext history session-only** — sidepanel reload 시 초기화. chrome.storage 영구 보존은 별 슬라이스.
- **Playground history 의 assistant kind 추정** — 옛 메시지엔 metadata 없음. plan 유무로만 구분. message store 에 kind 필드 추가 필요.
- **deprecation 헤더 ASCII only** — Node HTTP layer 가 non-ASCII 거부. em-dash → ASCII hyphen.
- **classifier 의 짧은 모호 PRD 회귀** — "디자인 좀 다듬어줘" 가 ambiguous → chat 으로 폴백 (보수성 ↑). 50잡 후 측정.
- **prd-analyzer thinking latency** — 3s → 10s. 코드 잡 부팅 30s 대비 작지만, 사용자 인내 한도 측정 필요.
- **Sandbox vite EPIPE auto-recovery 미검증** — 코드 review 만. 실제 발생 시 효과 측정.
- **Pre-existing Inspect Console TS 에러** — Recharts 타입, RequestDetailPage diff/log 필드 등.

---

## How to start the next session

```
이전 세션 핸드오프 두 개 읽고 종합 파악:
docs/superpowers/handoffs/2026-04-30-marathon-session.md
docs/superpowers/handoffs/2026-04-30-history-aware-intake.md (이 문서)

main 깨끗. 21+ commits 이번 세션 (1주 슬라이스 sub-phase A→E 완성).
unified intake 6 종 kind multi-turn ceremony 가 server-side 로 다
작동. surface 들 (Slack / Chrome ext / Playground) 다 history 동봉.

남은 큰 piece:
  1. Sub-phase C 마무리 (job_dispatched 실제 createJob, kind metadata,
     MOLLY_HISTORY_AWARE default ON) — 1d
  2. 자연어 액션 — 4번째 카테고리 'action' (plan 필요) — 1주
  3. Slack metadata 박기 — 0.5d
  4. Decomposer — 큰 PRD 자동 분해 — 2-4h
  5. 50잡 측정 (운영 1-2주 후)
  6. multi-tenant v1 PR + merge (사용자 협업)

서비스: orchestrator :3847 / playground-app :4180 / dashboard :4174
orchestrator restart 필요할 수 있음 (이번 세션 변경 반영).
Chrome ext reload + Playground refresh 권장.

Plan: docs/superpowers/plans/2026-04-30-history-aware-intake.md
```

---

*마지막 업데이트: 2026-04-30 history-aware intake 세션 종료 시점*
