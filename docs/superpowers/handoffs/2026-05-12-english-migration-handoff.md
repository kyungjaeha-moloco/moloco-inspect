# Handoff — 2026-05-12 English migration + 이번 세션 결과 정리

**Date:** 2026-05-12
**Author:** kyungjae.ha (with Claude)
**Branch:** main
**Prior handoff:** `docs/superpowers/handoffs/2026-05-07-incident-burn-down.md`

---

## TL;DR

이번 세션 ~25 commit (D+ retry, cost tracking, Slack mrkdwn, plan unification + fast-track, plan_feedback, ESC for SELECTED ELEMENT, JobCard button reorder, comment UX 5-phase overhaul). 다음 세션 task: **시스템 전체 영어화** (한 곳 빼고 — 사용자 input 은 한글 OK). 추천 순서 **C → B** (LLM prompts → UI 영역별), 다 진행해야 함.

---

## 1) 이번 세션 commit 정리 (시간순 핵심만)

```
d07101e feat(cost): LLM 비용 추적 + Dashboard Overview 가시화
9cbf45a fix(molly slack): CommonMark → mrkdwn 변환
8a07411 feat(pipeline): D+ verification_failed 자동 재시도 — Y 접근
f777ef2 fix(playground): plan 카드 파일경로 wrap
313b4c6 fix(playground): plan 카드 우측 클리핑 회귀 (flex minWidth)
c628422 feat(plan): "다시 계획" — Playground plan_items 자유 피드백 재 emit
6652d3b docs(plan): plan 통일 + intent fast-track plan 문서
385d8b4 feat(plan): fast-track intent 판정 helper
006f638 feat(job): autoApprove + skipDecomposer 옵션 — backend
afb6b85 feat(molly slack): plan_items 카드 + 3 button + redecompose modal
37e1c6c feat(chrome-ext): plan_items 카드 + job tasks 카드 read-only
4eca149 feat(playground): fast-track 배지 + skipDecomposer 전달
8021dbc docs: fast-track intent 소스 명시 + Playground 옵션 cosmetic 명시
fad9025 fix(playground): JobCard footer 버튼 재배치
dd09088 feat(plan): 채팅으로도 plan_feedback — 3 surface 일관 자연어 수정
98af877 feat(playground): SELECTED ELEMENT — Escape 키로 해제
dc5393e docs(plan): Playground 코멘트 UX overhaul plan 문서
05832f0 feat(pin-store): selectedPinId state (P1.1)
8d9dc53 feat(playground): pin pulse highlight (P1.2)
e3bdf63 feat(playground): 코멘트 row 클릭 → iframe activate (P1.3)
24f1c2a feat(playground): 'C' 단축키 + 자동 interactive 복귀 (P1.4)
b080e70 feat(playground): 코멘트 → Molly 작업 변환 (P2.1)
544e96e feat(playground): Chat 스트림 inline 코멘트 카드 (P3.1)
7636bcd feat(playground): stale 코멘트 자동 archive (P4.1)
8839412 feat(pins): server-side pin store (P5.1)
bf08c70 feat(pins): /api/playground/:id/pins endpoints (P5.2)
d8fef69 feat(pins): pin-store server sync (P5.3)
8ed3cbf fix(playground): pinsForPlayground useShallow — 무한 re-render fix
```

**main clean.**

---

## 2) 다음 세션 작업 — 시스템 전체 영어화

### 사용자 요청

> 플레이그라운드 및 Molly, 크롬익스텐션, 슬렉 및 에이전트는 전부 영어로 동작해야해.
> 인풋은 한글이 될수 있지만 다른건 모두 영어로 나와야해

### 핵심 원칙

- **사용자 input 한글 OK** — 한국어 PRD 그대로 받음
- **출력은 모두 영문** — Molly response, UI label, button text, plan_items title/description, error message, Slack/Chrome ext 메시지 등
- 코드 주석은 한글 유지 (개발자 컨텍스트, UX 영향 X)
- emoji 유지 (visual cue, language-agnostic)
- tone: casual but professional (기존 한국어 톤과 동등)

### 추천 순서 (사용자 동의)

**Phase C → B (먼저 LLM prompts, 그 다음 영역별 UI)**

#### Phase C — LLM prompts 영문화 (가장 사용자 직접 영향)

| 파일 | 변경 |
|---|---|
| `orchestrator/lib/molly-classifier.js` | SYSTEM_PROMPT 영문화 ('한 줄 한국어 reason' → 'one-line English reason'). Korean 카테고리 설명 → English. PRD-like 한글 키워드는 유지 (input 분류에 사용). |
| `orchestrator/lib/molly-chat.js` | composeChatReply 의 SYSTEM_PROMPT — 친근한 한국어 답변 → friendly English. "절대 금지 — 환각/거짓 진행 안내" 섹션의 한국어 예시는 영문 동등 표현으로. |
| `orchestrator/lib/molly-status.js` | composeStatusReply 의 한국어 표/응답 가이드 → English. SYSTEM_PROMPT 변경. |
| `orchestrator/lib/molly-prd-analyzer.js` | clarifying question Korean → English. |
| `orchestrator/lib/molly-plan-emitter.js` | SYSTEM_PROMPT 의 `summary: "<...in Korean>"`, `title: "<Short action description in Korean>"`, `description: "<1-2 sentence technical detail in Korean>"` → English. unresolved_components 의 intent/reason 도. visual_constraints 는 이미 영문. |
| `orchestrator/lib/decomposer*` (별 file 들) | task title / risksKo / qaRationaleKo → English. 필드명 `risksKo` 도 `risks` 로 rename 권장. |
| `orchestrator/lib/molly-lifecycle.js` | template response Korean → English. |

⚠️ Slack mrkdwn 변환 (`toSlackMrkdwn`) — 한글 폰트 없는 surface 에서도 동작. 그대로.

⚠️ Classifier 의 한글 키워드 (예: "취소", "재시도", "이 잡") — input 매칭용. 유지 (사용자가 한글로 lifecycle 명령 보낼 수 있음).

#### Phase B — UI 영역별 영문화

각 영역 별 commit:

##### B.1 — Playground UI (`playground-app/src/`)
- `editor/AIPanel.tsx`: tabs ('Chat' / 'Comments'), button labels, placeholder, empty state ("아직 댓글이 없습니다." → "No comments yet."), hint text, error messages
- `editor/LivePreview.tsx`: comment mode banner ("📍 Comment mode — C / ESC 키로 종료" → "📍 Comment mode — C / ESC to exit")
- `editor/JobCard.tsx`: phase labels ('승인하고 시작' → 'Approve and start'), action button text, `phaseLabelKo` 함수 → `phaseLabel` (이름 변경 + 값 영문)
- `pages/PlaygroundDetail.tsx`, `JobDetail.tsx`, `JobsPage.tsx`, etc.: 모든 user-visible string
- 그 외 component 내 한국어 텍스트

##### B.2 — Chrome ext (`chrome-extension/sidepanel.js`)
- 모든 한국어 시스템 메시지 / placeholder / button text
- `addPlanItemsCard` / `addPlanApprovalCard` 의 헤더 ("📋 Plan", "📋 진행 상황" → "📋 Progress")
- 에러 stamp ("❌ 취소됨" → "❌ Cancelled"), placeholder prompt

##### B.3 — Slack 메시지 빌더 (`orchestrator/lib/molly.js`)
- 시스템 메시지 ("🤖 받았습니다" → "🤖 Got it"), 카드 헤더, 버튼 라벨 ("실행하기 →" → "Run →"), 에러 안내
- `postPlanItemsMessage` / `postPlanMessage` / `handlePlanItemsRedecomposeOpen` modal 의 title/label
- Stamp 함수 ("✅ <@user> 님이 실행 시작했습니다" → "✅ <@user> approved and started")

##### B.4 — Dashboard (`dashboard/`)
- Pages / components 의 모든 한국어 텍스트
- Settings UI, Cost dashboard, Metrics page

##### B.5 — Phase labels / error messages 통합
- `phaseLabelKo` 함수 영문화 + rename to `phaseLabel`
- pipeline error / job error message templates
- Inline notification text

### 작업량 추정

- Phase C (LLM prompts): ~0.5d. 6-7 lib 의 SYSTEM_PROMPT 다듬기.
- Phase B.1 (Playground UI): ~0.5d.
- Phase B.2 (Chrome ext): ~0.25d.
- Phase B.3 (Slack): ~0.25d.
- Phase B.4 (Dashboard): ~0.5d.
- Phase B.5 (통합/cleanup): ~0.25d.
- **합계 ~2.25d**.

---

## 3) 결정 사항 (이번 세션 합의)

| 항목 | 결정 |
|---|---|
| 한글 입력 | OK — 분류는 그대로 |
| 출력 (UI / LLM / 메시지) | 전부 영문 |
| 코드 주석 | 한글 유지 |
| Emoji | 유지 |
| Tone | casual but professional |
| Phase 순서 | C (LLM) → B (UI 영역별) |
| 모두 작업 | Yes — 다 진행 |

---

## 4) 다음 세션 시작 방법

### 4.1 — 컨텍스트 빠른 복원

```
이전 세션 핸드오프:
- docs/superpowers/handoffs/2026-05-07-incident-burn-down.md
- docs/superpowers/handoffs/2026-05-12-english-migration-handoff.md (이 문서)

main clean. 이번 세션 ~25 commit 완료. comment UX overhaul 5-phase 다 끝남.

다음 작업: 시스템 전체 영어화 (사용자 input 한글 OK, 출력 모두 영문).
순서: Phase C (LLM SYSTEM_PROMPT 영문화) → Phase B (UI 영역별).
```

### 4.2 — Phase C 시작 (LLM prompts)

추천: **subagent-driven** — 각 lib 별 implementer subagent dispatch.

각 task 1 개씩:
1. `molly-classifier.js` SYSTEM_PROMPT 영문화
2. `molly-chat.js` SYSTEM_PROMPT 영문화 + 환각 가이드 영문 동등
3. `molly-status.js` SYSTEM_PROMPT 영문화
4. `molly-prd-analyzer.js` clarifying question English
5. `molly-plan-emitter.js` SYSTEM_PROMPT `<...in Korean>` → `<...in English>`. 모든 필드.
6. decomposer 의 SYSTEM_PROMPT
7. lifecycle template response English

검증:
- 각 LLM 호출 smoke test (curl /api/intake 등)
- 응답이 영문인지 시각적 확인
- classifier 의 분류 정확도 회귀 X 측정 (Korean input → 분류 OK)

### 4.3 — Phase B 진행

Phase C 끝나고 LLM 응답 영문 확인되면 UI 영문화.

각 영역 별 commit. **bulk replace 위험 X** — 단어/문맥 봐가며 자연스러운 표현.

bash 명령 예시:
```bash
# 한국어 텍스트 위치 찾기
grep -rn '[가-힣]' playground-app/src --include="*.tsx" --include="*.ts" | grep -v "//.*[가-힣]" | head -40
```

⚠️ 정규식 `[가-힣]` 으로 한글 찾되, 코드 주석 (`//` 시작) 은 grep -v 로 제외.

### 4.4 — 검증 (각 Phase 후)

- `pnpm tsc --noEmit` (playground-app, dashboard)
- `node --check` (orchestrator)
- 수동 smoke — 각 surface 에서 영문 응답 확인
- 한국어 input 으로 분류 / intake 정상 동작 확인

---

## 5) 알려진 한계 / 함정

- **Classifier prompt 변경 회귀 위험** — 한국어 키워드 매칭 룰 유지 필수. 기존 silent_skip / plan_feedback / lifecycle 분기 안 깨지게.
- **plan-emitter 의 컴포넌트 catalog (components.json)** — 영문 fields. 변경 X. 그 위 SYSTEM_PROMPT 의 instruction 만 영문화.
- **사용자 한국어 PRD → 영문 plan** — agent prompt 가 자연스러운 영문 task description 으로 매핑되는지 확인. 운영 측정.
- **DB / 영구 저장** — 기존 데이터 (Korean) 는 그대로 둠. 새 데이터부터 영문.
- **Dashboard, JobCard 의 phase 라벨** — `phaseLabelKo` 함수 이름 영문화 시 import 호출자 모두 같이 rename.
- **Slack manifest** — 봇 description 도 영문화 (별도 — 워크스페이스 콘솔).

---

## 6) 백로그 / 미정

- **B.5 의 phase 라벨 통합 검토** — `verification_retry`, `verifying`, `verification_failed` 등 영문 라벨. 일관성.
- **운영 1주 후 측정** — D+ retry 비율, fast-track 사용률, plan_feedback (chat) 비율, comment server-sync 사용 패턴.
- **D+ 자동 재시도의 비용** — 운영 측정. retry $0.5-1 누적. cost dashboard 추적.
- **Comment server-side multi-user concurrent** — last-write-wins. 운영 충돌 빈도 측정.

---

## 7) Service ports (그대로)

- orchestrator :3847
- playground-app :4180
- dashboard :4174

재시작 자동:
- orchestrator: lib 변경 watch
- playground-app: vite HMR
- dashboard: vite HMR

---

*마지막 업데이트: 2026-05-12. 다음 세션에서 영문화 시작.*
