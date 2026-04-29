# Handoff — Chrome ext Phase 2 Step 3+4 (Slack lifecycle parity 달성)

**Date:** 2026-04-29 (저녁 세션)
**Author:** kyungjae.ha (with Claude)
**Branch:** main (clean)
**Prior handoff:** `2026-04-29-molly-everywhere.md`
**Plan of record:** `docs/superpowers/plans/2026-04-29-chrome-ext-phase2-step-3-4.md`

---

## TL;DR

> **Chrome ext sidepanel 도 PRD → plan → 코드 → review → QA → PR 풀 lifecycle 가능 — Slack parity 달성.**

이전 handoff 의 후보 1 (Chrome ext Phase 2 Step 3+4) 완료. 7 commits. 추가로 molly 의 30분 watcher spam 도 같이 fix.

다음 세션 첫 후보:
1. **molly 코드/디자인 피드백 루프 설계** (사용자 명시)
2. **multi-tenant onboarding 기획** (사용자 명시)
3. molly chat 모드 / agent_review verify / Chrome ext follow-up

---

## 오늘 세션 (subagent-driven)

writing-plans → momus 리뷰 (3 BLOCKER → revise → re-review APPROVED) → subagent-driven-development 으로 7 commit 실행.

각 task 마다: implementer → spec reviewer → quality reviewer → 필요 시 fix subagent → 재리뷰. 최종 코드 리뷰 1회.

## Commits

```
4a79b0a fix(chrome-ext): use createElement for promote PR URL anchor (defensive XSS)
abe917d feat(chrome-ext): Phase 2 Step 4 (2/2) — Promote card on job complete
1f150ea fix(chrome-ext): QA card — safety timers + dirty-check on update path
fb56692 fix(molly): skip 30min watcher expiration message for user-waiting jobs
f9eddc0 feat(chrome-ext): Phase 2 Step 4 (1/2) — QA completion card with pass/rerun
31224d5 fix(chrome-ext): unlock task-fail buttons after 15s safety timeout
5ea0e4a feat(chrome-ext): Phase 2 Step 3 — per-task transition cards + fail actions
```

총 변경: chrome-extension/sidepanel.{js,css} + orchestrator/lib/molly.js — 605 insertions, 1 deletion.

## What shipped

### A. Per-task transition messages (Step 3)

Slack 의 `pollJobUntilDoneInner` 미러:
- ANNOUNCEABLE 5종 (running/committed/reviewed/failed/skipped) 마다 chat 카드 1개씩
- 동일 task 후속 트랜지션은 in-place update (`announcedTaskState` dedupe)
- failed task 카드에 [🔁 재시도] [✅ 그대로 통과] [⏭ 건너뛰기] inline 버튼
- 버튼은 `/api/job/:id/{retry-task,accept-task,skip-task}` 호출 후 lock + stamp
- 서버 에러 시 unlockOnError, 성공 시 15s safety timer 로 fallback

### B. Paused state surface

- `addPausedMessage` — pausedReason 노출
- 재개 시 dedupe set 에서 'paused' 제거 → 다시 paused 되면 또 한 번 announce

### C. DOM sniff dedupe

사이드패널 reload 시 같은 jobId 폴링이 재진입할 때 chat 에 이미 들어가 있는 카드를 다시 만들지 않도록 `announcedJobStates` / `announcedTaskState` 를 DOM 에서 sniff 해 prefill.

### D. QA completion card (Step 4 part 1)

`status=qa` 진입 시 1회:
- 완료 task 수 + skip 수 + 자동 QA 결과 요약 + targetRoute
- [✅ QA 통과] (항상) + [🔁 자동 QA 재실행] (자동 QA 실패 시)
- `dataset.lastHash` dirty-check 로 무한 재렌더 방지
- 두 버튼 모두 success path 에 15s safety timer (status qa→complete 전이 후 update 안 들어옴 방어)
- 재실행 placeholder ('재실행 중…') → 실 결과 in-place update

### E. Promote card (Step 4 part 2)

`status=complete` 진입 시 1회:
- [🚀 Promote (PR 생성)] [📺 Playground 보기]
- POST `/api/playground/:id/promote` (response top-level prUrl, server.js:2969-2985 확정)
- 성공 시 같은 카드에 PR URL anchor stamp + promoteBtn 영구 lock (concurrent click 으로 다중 PR 생성 방지)
- prUrl anchor 는 createElement + textContent + href 패턴 — innerHTML 회피 (defensive XSS)
- announce 직후 같은 iteration 의 TERMINAL 분기에서 finishLoop (Slack molly.js:1424 미러)

### F. molly silent-timeout fix (덤)

세션 중 사용자가 발견:
> "슬렉에 메시지가 계속 오는데 문제 있는듯 — :stopwatch: molly 의 watcher 가 30분 후 만료됐습니다…"

진단: 잡 a658fef6 (TAS 도움말 메뉴 추가) 이 status=qa 로 사용자 액션 대기. 매 orchestrator restart 시 `resumeWatchersFromDisk()` 가 새 30분 watcher 부착 → 30분 후 expiration 메시지 → restart 마다 반복 spam.

Fix: `pollJobUntilDoneInner` 의 timeout 분기에서 `finalJob.status` 가 qa/complete/paused 면 expiration 메시지 silent skip. 그 상태들은 사용자 액션 대기라 만료 알림이 행동 유발하지 못하고 노이즈만 됨.

(orchestrator 프로세스는 fix 반영을 위해 restart 필요.)

## Files changed

```
M  chrome-extension/sidepanel.css   (+45)
M  chrome-extension/sidepanel.js    (+550)
M  orchestrator/lib/molly.js        (+10)
A  docs/superpowers/plans/2026-04-29-chrome-ext-phase2-step-3-4.md
```

## 다음 세션 첫 5분 (Pre-flight)

```bash
git status --short
git log --oneline -10

# 서비스
curl -s -o /dev/null -w "orch :3847 → %{http_code}\n" http://localhost:3847/api/playground
curl -s -o /dev/null -w "play :4180 → %{http_code}\n" http://localhost:4180/
curl -s -o /dev/null -w "dash :4174 → %{http_code}\n" http://localhost:4174/

# orchestrator restart 필요? (molly silent-timeout fix 반영용)
# 만약 옛 코드면: orchestrator/ 디렉토리에서 pnpm start 재시작

# Chrome ext reload 필요 (chrome://extensions/ → "Moloco Inspect" 새로고침)
```

## 다음 세션 후보 (우선순위)

### 1. molly 코드/디자인 피드백 루프 설계 (사용자 명시)

> "몰리가 생성한 코드와 디자인에 대한 피드백 루프는 어떻게 설계해야할까? 리서치를 통해서 계획을 세워보자."

리서치 + 기획 슬라이스. 각도:
- DS 일관성: shared components 96% 커버지만 1320 app-level files 0% 커버지 (memory: project_ds_product_gap.md 참고). agent 가 새 페이지 만들 때 어떻게 DS 토큰/패턴 안 어기게?
- code review 패턴: 현 리뷰어는 "한 task 끝날 때마다 LLM 검토" — pass/fail + notes. 사용자가 review 결과 보고 보내는 신호 (재시도 / 그대로 통과 / 건너뛰기) 가 prompt 학습으로 흘러가는가?
- agent_review (host-side Playwright + Vision) 결과 — 'sign-in 리다이렉트로 가드 미스' 같은 패턴이 다음 잡 prompt 에 반영되는가?
- 사용자 직접 review (Playground 의 ✏️ 다시 계획 / 카드의 ✎ 편집 / chrome ext 의 plan card 재계획) 를 시간순 trace 로 모아 학습 데이터 화?
- 디자인 피드백: 결과 페이지 스크린샷 → 사용자 만족도 → 다음 잡 visual 가이드?

### 2. multi-tenant onboarding 기획 (사용자 명시)

> "지금은 티빙 기반으로 MSM Portal 을 만들어서 제품 개선을 하는 수준의 작업이지만, 장기적으로 티빙이 아닌 새 클라이언트가 온보딩해서 MSM Portal 을 쓰게 되면 그들을 위한 커스텀/브랜딩 적용이 필요. 구조적 탐색을 통해 기획."

- multi-tenant theming (DS 토큰 오버라이드)
- 도메인/라우팅 분리
- 클라이언트별 feature flag
- 데이터 isolation
- 온보딩 flow 자체

### 3. molly chat 모드 (사용자 이전 요청, 보류 중)

분류 게이트 (Haiku): `code_change` / `chat` / `status_query`. ~2-3h.

### 4. agent_review negative-path verify

권한 가드 시나리오로 직접 검증. ~30분~1h.

### 5. Chrome ext follow-up (final review 발견)

- task-transition card 에 dirty-check 추가 (QA card 패턴과 일관)
- Promote 카드 idempotent server 응답 시 unlock fallback
- cancelled 카드 surface (현재는 progress dot 만 갈림)
- cumulative chat overflow 정리 (12-15+ 카드)
- molly silent-timeout 에 'planning' 추가 검토

### 6. Sandbox vite EPIPE auto-recovery, Promote E2E verify

이전 handoff 그대로 계승.

## 알려진 한계 (이전 handoff + 신규)

- Sandbox vite EPIPE — 수동 복구
- Playground 동시 잡 — 한 playground 한 잡
- molly watcher 30분 timeout — qa/complete/paused 는 silent skip 됨 (이번 fix). 하지만 watcher 자체는 여전히 30분에 expire.
- Auto-create playground 부팅 ~30초
- Inspect Console pre-existing TS 에러 (Recharts 등)
- Chrome ext stateless 흐름의 옛 clarification 코드 잔존

## How to start the next session

```
이전 세션 핸드오프 두 개 읽고 현재 상태:
docs/superpowers/handoffs/2026-04-29-molly-everywhere.md (오전)
docs/superpowers/handoffs/2026-04-29-chrome-ext-step-3-4.md (저녁, 이 문서)

main 깨끗. 마지막 7 commits 가 chrome ext + molly 변경.

사용자 명시 다음 슬라이스:
  1. molly 코드/디자인 피드백 루프 설계 (리서치 → 기획)
  2. multi-tenant onboarding 기획 (구조적 탐색 → 기획)

서비스: orchestrator :3847 / playground-app :4180 / dashboard :4174
모두 백그라운드. 단 orchestrator 는 molly fix 반영 위해 restart 필요할 수 있음.
```

---

*마지막 업데이트: 2026-04-29 저녁*
