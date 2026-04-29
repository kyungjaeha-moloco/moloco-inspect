# Handoff — molly chat mode (3 surface 통합)

**Date:** 2026-04-30
**Author:** kyungjae.ha (with Claude)
**Branch:** main (clean)
**Prior handoff:** `2026-04-29-chrome-ext-step-3-4.md`
**Plan of record:** `docs/superpowers/plans/2026-04-30-molly-chat-mode.md`

---

## TL;DR

> **molly 가 세 surface (Slack / Chrome ext / Playground) 에서 mention/submit 받으면 무조건 잡 만들지 않고, classifier 게이트 후 chat / status / code_change 분기.**

이전 handoff 의 후보 2 (molly chat 모드) 완료. 사용자 명시 요청한 Playground 도 v0 에 포함. 5 commits.

다음 세션 첫 후보 (사용자 명시):
- **agent_review negative-path 검증** (원래 순서 후보 3 — 아직 안 함)
- **molly 코드/디자인 피드백 루프 설계** (follow-up 명시)
- **multi-tenant onboarding 기획** (follow-up 명시)

---

## 오늘 슬라이스 진행

writing-plans → momus 리뷰 (2 BLOCKER + 5 IMPROVEMENT → revise → APPROVED) → subagent-driven 으로 5 commit. 각 task: implementer → spec/quality review → 필요 시 fix subagent.

## Commits

```
0f1bf13 feat(playground): molly chat mode — classifier wraps Wizard chat panel
3ea408b feat(chrome-ext): molly chat mode — classifier 우회 + 답변 카드
a88cdbc feat(molly): Slack mention 분류 게이트 — chat/status_query 답변 모드
7087222 fix(molly): fetch timeout + classifier 폴백 일관성
06fb912 feat(orchestrator): /api/molly/respond — classifier + chat/status reply libs
```

총 변경: 신규 3 lib + server.js + 3 surface (molly.js / sidepanel.js / sidepanel.css / orchestrator-client.ts / AIPanel.tsx).

## What shipped

### A. Server-side machinery

**3 신규 lib** (`orchestrator/lib/`):
- `molly-classifier.js` — Haiku 호출. 사용자 텍스트 → `{kind: code_change | chat | status_query, reason}`. brace counting JSON 추출 + 모든 실패 path (no JSON / unterminated / parse / invalid kind / fetch error) → chat 폴백. 15s timeout.
- `molly-chat.js` — Sonnet 호출. molly persona system prompt 포함: capabilities (PRD→PR / 세 surface / 잡 상태 / 계획 다듬기 / external cancel), 사용법 핵심, **아직 할 수 없는 일** (GitHub 직접 검색/수정, Drive 검색/생성, multi-tenant 자동화, 실시간 PR 코드 리뷰 답변). 30s timeout.
- `molly-status.js` — Haiku 호출 (잡 raw 데이터 + 사용자 질문 → 자연어 답변). Haiku 실패 시 templated fallback (active + recent done 5개씩). 30s timeout.

**신규 라우터**: `POST /api/molly/respond` (server.js:2549). 요청 `{text, surface, recentMessages?}` → 응답 `{kind, reason, response?}`.

### B. Slack handleMention 분류 게이트

`molly.js` 의 handleMention 이 mention strip + 빈 텍스트 가드 직후 classifier 호출. classifier 실패 시 폴백 = chat (잡 안 만드는 게 안전).
- `chat` → composeChatReply → thread reply
- `status_query` → composeStatusReply → thread reply
- `code_change` → 기존 흐름 (defaultPlaygroundId 가드 → createJob → decompose → plan post)

`defaultPlaygroundId` / `getPlayground` 가드를 code_change 분기 안으로 이동 — chat/status 는 playground 없어도 응답.

### C. Chrome ext performSubmit 분류 게이트

`sidepanel.js` 의 performSubmit 진입부 (Job 모드 / stateless 분기 *이전*) 에 classifier 우회. chat/status_query 면 `addMollyChatMessage` 카드 (textContent — XSS 안전) 노출 후 return. fetch 실패 시 fallback = code_change (사용자 PRD 던졌는데 네트워크 에러로 chat 답변 받으면 더 이상하니 의도 보호 — server-side 와 비대칭 의도적).

신규 CSS: `.molly-chat-card`, `.molly-chat-header`, `.molly-chat-body`.

### D. Playground chat panel wrapper

`orchestrator-client.ts` 의 `mollyClassifyAndDispatch(text, isFirstMessage)` 신규 export. AIPanel 의 sendPrompt 가 첫 user 메시지면 dispatch 거치고, 후속 turn (Wizard clarification) 은 통과 — multi-turn 보호. zustand getState 동기 read 라 timing race 없음.

### Fallback 정책 정리

- **server-side** (classifier/chat/status lib) → 모든 fetch 실패 / parse 실패 / invalid → `chat` 폴백 (잡 안 만드는 게 안전 우선)
- **client-side** (Chrome ext fetch / Playground fetch) → fetch 자체 실패 → `code_change` 폴백 (사용자 의도 보호 — 비대칭 의도적)

## Files changed

```
A  orchestrator/lib/molly-classifier.js (신규)
A  orchestrator/lib/molly-chat.js       (신규)
A  orchestrator/lib/molly-status.js     (신규)
M  orchestrator/server.js               (+/api/molly/respond)
M  orchestrator/lib/molly.js            (handleMention 분류 게이트)
M  chrome-extension/sidepanel.js        (performSubmit + addMollyChatMessage)
M  chrome-extension/sidepanel.css       (.molly-chat-card 스타일)
M  playground-app/src/services/orchestrator-client.ts (mollyClassifyAndDispatch)
M  playground-app/src/editor/AIPanel.tsx (sendPrompt 분류 분기)
```

## 다음 세션 첫 5분 (Pre-flight)

```bash
git status --short
git log --oneline -10

# 서비스
curl -s -o /dev/null -w "orch :3847 → %{http_code}\n" http://localhost:3847/api/playground
curl -s -o /dev/null -w "play :4180 → %{http_code}\n" http://localhost:4180/
curl -s -o /dev/null -w "dash :4174 → %{http_code}\n" http://localhost:4174/

# molly 새 엔드포인트 sanity
curl -s -X POST http://localhost:3847/api/molly/respond \
  -H 'content-type: application/json' \
  -d '{"text":"안녕","surface":"slack"}' | head -c 400

# orchestrator restart 필요 — Task 1 server libs + handleMention 분기 적용
# Chrome ext reload 필요
# Playground 는 vite HMR 로 자동 반영
```

## Manual E2E 검증 절차 (사용자 측)

orchestrator 재시작 + Chrome ext reload 후:

| 케이스 | Surface | 입력 | 기대 결과 |
|---|---|---|---|
| 1 | Slack | `@molly 안녕` | 친근한 답변 1개, 잡 X |
| 2 | Slack | `@molly 지금 잡 어디까지 됐어?` | 잡 목록 자연어 답변 |
| 3 | Slack | `@molly TAS 사이드바에 도움말 메뉴 추가` | 기존 plan card flow |
| 4 | Chrome ext | "안녕" | molly 답변 카드, 잡 X |
| 5 | Chrome ext | "활성 잡 몇 개?" | molly status 카드 |
| 6 | Chrome ext | PRD-like 텍스트 | 기존 Job pipeline |
| 7 | Playground | "molly 가 뭐야?" | molly 답변 (assistant message), Wizard 진입 X |
| 8 | Playground | "어제 만든 거 어떻게 됐어?" | 잡 요약 (Haiku 자연어) |
| 9 | Playground | PRD 던지기 | Wizard 의 기존 plan emit + createJob 흐름 |

추가 회귀:
- **Playground multi-turn Wizard**: 첫 PRD → Wizard clarification → 사용자 답변 → 분류 안 거치고 Wizard 진행

## 다음 세션 후보 (우선순위)

### 1. agent_review negative-path 검증 (원래 순서 후보 3)

권한 가드 시나리오로 agent_review QA 가 sign-in redirect 같은 미스를 잘 잡는지 직접 검증. ~30분~1h.

### 2. molly 코드/디자인 피드백 루프 설계 (사용자 명시 follow-up)

리서치 + 기획 슬라이스. DS 일관성 / agent_review → 학습 / 사용자 review 신호 → prompt 개선 등 다각도.

### 3. multi-tenant onboarding 기획 (사용자 명시 follow-up)

티빙 외 새 클라이언트 온보딩 시 커스텀/브랜딩 구조 기획.

### 4. Chrome ext follow-up

이전 handoff 에서 listed:
- task-transition card dirty-check
- Promote 카드 idempotent unlock fallback
- cancelled 카드 surface
- cumulative chat overflow 정리

### 5. molly chat mode follow-ups

- multi-turn molly chat (현재는 1-turn)
- molly 가 잡 cancel 같은 액션도 자연어로 받기
- 외부 도구 통합: GitHub 검색/수정, Drive 검색/생성, 실시간 PR 컴멘트 답변
- Chrome ext addMollyChatMessage 의 id/scrollToBottom 패턴 정합 (final review 발견)
- Chrome ext stateless clarification 응답이 chat 으로 오분류 잠재 (final review 발견)

### 6. Sandbox vite EPIPE auto-recovery, Promote E2E verify

이전 handoff 그대로 계승.

## 알려진 한계 / footguns

- **Classifier misfire**: 짧은 PRD ("BETA 라벨") 가 chat 으로 분류될 가능성. 폴백은 chat 이라 안전한 방향이지만 사용자가 다시 명시적으로 "잡 만들어줘" 보내야 함.
- **Wizard 후속 turn 은 분류 안 거침** (Playground): "안녕" → Wizard 가 응답 → 사용자가 후속 "취소" 입력하면 후속이라 분류 안 거치고 Wizard 가 잡 만들 수도 있음. 보통 첫 메시지에서 결정되는 시나리오라 v0 에서는 OK.
- **fetch timeout 고정값**: classifier 15s, chat/status 30s. Anthropic API 가 평균보다 느린 케이스에서 timeout 가능성.
- **Chrome ext stateless 의 clarification 흐름**: classifier 가 매 submit 거치므로 clarification 응답("그냥 진행") 이 chat 으로 오분류될 잠재. stateless flow 가 deprecated 예정이라 follow-up.

## How to start the next session

```
이전 세션 핸드오프 두 개 읽고 현재 상태:
docs/superpowers/handoffs/2026-04-29-chrome-ext-step-3-4.md
docs/superpowers/handoffs/2026-04-30-molly-chat-mode.md

main 깨끗. 마지막 5 commits 가 molly chat mode (server libs + 3 surface).

원래 순서 후보 셋 다 끝남:
  ✅ Chrome ext Phase 2 Step 3+4
  ✅ molly chat mode (3 surface)
  ⬜ agent_review negative-path 검증

사용자 명시 follow-up:
  ⬜ molly 코드/디자인 피드백 루프 설계
  ⬜ multi-tenant onboarding 기획

서비스: orchestrator :3847 / playground-app :4180 / dashboard :4174
모두 백그라운드. orchestrator 는 새 엔드포인트 반영 위해 restart 필요.
```

---

*마지막 업데이트: 2026-04-30*
