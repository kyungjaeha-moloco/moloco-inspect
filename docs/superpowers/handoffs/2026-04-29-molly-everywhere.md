# Handoff — molly everywhere (Slack/Playground/Chrome ext 통합)

**Date:** 2026-04-29
**Author:** kyungjae.ha (with Claude)
**Branch:** main (clean)
**Prior handoffs:** `2026-04-27-pipeline-polish-and-qa-strategy.md`,
`2026-04-27-qa-strategy-runner.md`

---

## TL;DR

오늘 세션의 큰 그림:

> **molly 가 세 surface 에서 같은 모양/같은 목적으로 작동하도록**

- Slack — `@molly <PRD>` 가 잡 lifecycle 끝까지 (계획 승인 → 작업 → QA → Promote) 모두 thread 안에서 진행 가능
- Playground — chat panel 이 jobs/Slack 변경 실시간 반영, Inspect Console 직접 deep-link
- Chrome ext — 기존 단발 change-request 흐름 → 통합 Job pipeline 으로 전환 (Step 1+2 완료)
- Inspect Console — Jobs 가 first-class 개념으로 사이드바·Overview·디테일·breadcrumb 전부 추가

**모든 변경 commit 됨.** 다음 세션 시작점: Phase 2 Step 3+4 (사이드패널 task buttons / QA pass / Promote) 또는 별도 슬라이스 (molly 의 chat 모드, agent_review verification 케이스, 다른 발견 이슈들).

---

## 오늘 시작 시점 (Recap)

세션 시작 시점에는:
- molly Phase 1 (인사 봇) + Phase 2.0 (PRD → 잡 → 진행 알림 → 완료) 끝나 있었음
- Inspect Console 은 아직 **Inspect Hub** 이름이고 Jobs 개념 없음 (Requests 만)
- Chrome ext 는 옛날 단발 change-request 흐름
- decomposer 가 risks/verification 안 만듦
- molly QA 통과/Promote 는 Slack 에서 못 함, Playground 가야 함

## 오늘 끝낸 일 (커밋 순)

### A. Slack 가독성 + 진행 가시성
- 계획 메시지 task 본문 전체 노출 (1./2./3. bullet 포함)
- ✏️ 다시 계획 모달 (자유 피드백 입력)
- task 진행 메시지 in-place edit (작업 중 → 검토 중 → 통과)
- 외부 cancel 감지 (Playground/curl) → Slack 알림
- Orchestrator 재시작 시 활성 잡 자동 재구독 (`slackContext` 영속화)
- Chat 4초 polling (Playground 새로고침 없이 동기화)
- 첫 메시지에 Playground URL 포함

### B. agent_review QA 전략
- 새 strategy `agent_review` (strategist 디폴트)
- Playwright 스크린샷 + 콘솔 + diff + body text 수집
- Claude Vision 한 번 호출, `{passed, notes}` 판정
- 권한 가드 함정 (sign-in redirect) 자동 감지

### C. opencode self-verify (RULE 8)
- prompt-builder.js 에 RULE 8 추가
- 에이전트가 finish 전 `tsc --noEmit` + `curl localhost:5173/{targetRoute}` 자체 검증

### D. Inspect Console 재구성 (이름 + Jobs)
- "Inspect Hub" → **Inspect Console** (브라우저 탭 제목 + 사이드바)
- 사이드바 메뉴: Overview / **Jobs** (신규) / Requests / Settings
- `/jobs` — 잡 인덱스 (필터, 검색, 5초 폴링)
- `/jobs/:jobId` — 잡 상세 (PRD, qaStrategy, qaAutoResult, tasks → request 링크)
- `/requests/:requestId` — 잡에 속한 request 면 "⤴ Job xxxx · task tN" 브레드크럼
- Overview — Job stats 4 cards (Active/Today's/Success Rate/Avg Duration), Recent Jobs 섹션, 인프라 strip 의 active jobs 링크
- RequestDetailPage — job-task 면 "Agent Analysis" 자리에 "Task Context" 표시 (title + description + PRD head + targetRoute + qaStrategy + review notes)

### E. Decomposer risks
- `risks_ko[]` 0-3개, PRD-specific 만 (generic 리스크는 prompt 로 억제)
- Slack plan blocks + JobCard PlanRisksBlock surface

### F. Plan UI 의 QA visibility
- Strategist 호출을 approve 후 → decompose 끝부분 으로 이동
- Plan 단계에서 `🧪 검증 단계: agent_review — ...` 한 줄 surface (Slack + JobCard)

### G. molly Phase 2.2 — Slack lifecycle 버튼
- 자동 QA 결과 메시지에 [✅ QA 통과] [🔁 자동 QA 재실행] (실패 시) 버튼
- ✅ QA 통과 → status complete → 다음 메시지 [🚀 Promote] [📺 Playground 보기]
- 🚀 Promote → `promotePlayground` → PR URL 을 thread reply
- 리뷰 실패한 task → [🔁 재시도] [✅ 그대로 통과] [⏭ 건너뛰기] 인라인 버튼
- 30분 timeout 메시지 URL 버그 수정 (jobId → playgroundId)

### H. Chrome ext Phase 2 (Step 1+2)
- **자동 생성 playground**: 셀렉터 디폴트 = "🆕 New playground (자동 생성)" — 첫 send 시 새 playground 자동 부팅
- **Job pipeline 라우팅**: change-request 대신 `/api/playground/:id/job` (실제 playground 있을 때)
- **사이드패널 plan card**: status=planning 감지 시 [✅ 승인] [✏️ 다시 계획] [❌ 취소] 버튼 카드 자동 추가
- **Tab grouping**: 확장 아이콘 클릭 시 탭이 시안색 "Moloco Inspect" 그룹에 자동 추가, 그룹 외 탭에서는 사이드패널 자동 collapse
- **Chat-active 레이아웃**: 첫 메시지 후 playground/element card 숨김 (정보가 chip + iframe 으로 이미 보임)
- **Send 잠금**: 잡 진행 중엔 send 버튼 disabled
- **Clarification 흐름 제거** (Job 모드일 때): "Proceed with this plan / Adjust the plan" UI 가 Job pipeline 의 decomposer 와 중복이라 Job 모드에서만 건너뜀
- "Open Ops Dashboard" → "Open Inspect Console" 라벨

### I. 기타
- PixelAgentSprite 1.5× 크기로 축소 (32×48 → 24×36)
- 📜 히스토리 버튼: page header → AIPanel chat header 우측 정렬
- Cancel 시 playground chat 에 메시지 mirror
- AIPanel 자동 스크롤 (진입 시 + 라이브 업데이트, 사용자가 위로 올려서 옛 메시지 보고 있으면 안 따라감)

---

## Files changed (오늘 세션)

```
M  chrome-extension/background.js
M  chrome-extension/manifest.json
M  chrome-extension/sidepanel.css
M  chrome-extension/sidepanel.html
M  chrome-extension/sidepanel.js
A  dashboard/src/pages/JobsPage.tsx
A  dashboard/src/pages/JobDetailPage.tsx
M  dashboard/src/pages/OverviewPage.tsx
M  dashboard/src/pages/RequestDetailPage.tsx
M  dashboard/src/components/OpsLayout.tsx
M  dashboard/src/navigation.ts
M  dashboard/src/App.tsx
M  dashboard/index.html
M  orchestrator/lib/job-decomposer.js
M  orchestrator/lib/job.js
M  orchestrator/lib/job-qa-runner.js
M  orchestrator/lib/job-qa-strategist.js
M  orchestrator/lib/molly.js
A  orchestrator/lib/qa-adapters/agent-review.js
A  orchestrator/lib/screenshot.js
A  orchestrator/lib/chat-store.js
M  orchestrator/server.js
M  playground-app/src/editor/AIPanel.tsx
M  playground-app/src/editor/JobCard.tsx
M  playground-app/src/pages/PlaygroundDetail.tsx
M  playground-app/src/services/orchestrator-client.ts
M  playground-app/src/store/playground-store.ts
M  tooling/sandbox-manager/src/prompt-builder.js
A  docs/architecture/system-overview.md
```

각 commit 의 message 본문에 어떤 파일에 무슨 변경이 있는지 상세히 기록됨.

---

## 다음 세션 첫 5분 (Pre-flight)

```bash
git status --short            # clean 확인
git log --oneline -10         # 마지막 커밋 위치

# 서비스
lsof -ti :3847 | head -1      # orchestrator
lsof -ti :4180 | head -1      # playground-app
lsof -ti :4174 | head -1      # dashboard

# 컨테이너
docker ps --filter "name=inspect-pg-" --format '{{.Names}} {{.Status}}'

# 핸드오프 읽기 (이 문서)
```

서비스가 죽어 있으면:
```bash
cd /Users/kyungjae.ha/Documents/moloco-inspect/orchestrator && pnpm start &
cd /Users/kyungjae.ha/Documents/moloco-inspect/playground-app && pnpm dev &
cd /Users/kyungjae.ha/Documents/moloco-inspect/dashboard && pnpm dev &
```

---

## 다음 세션 후보 (우선순위 순)

### 1. Chrome ext Phase 2 Step 3+4 (Slack lifecycle parity)
지금 Step 1+2 까지 됨 — 사이드패널이 plan card + 승인/재계획/취소 까지 처리. **남은 것**:
- **Step 3** (~1시간): 리뷰 실패한 task 에 [🔁 재시도] [✅ 그대로 통과] [⏭ 건너뛰기] 버튼 (Slack 의 task buttons 와 동일)
- **Step 4** (~1.5시간): QA 결과 + [✅ QA 통과] / [🔁 자동 QA 재실행] / [🚀 Promote] 버튼 (Slack 의 lifecycle 버튼과 동일)

이거 끝나면 Chrome ext 도 PRD → 코드 → QA → PR 까지 완전한 lifecycle 가능. **molly 가 진짜로 세 surface 에서 같은 모양**.

### 2. molly chat 모드 (사용자 명시 요청)
> "크롬 익스텐션이든 플레이그라운드든 슬렉이든 molly 는 특정 테스크 외에 대화도 가능한거지?"

지금은 **NO** — 모든 mention/submit 이 Job 생성으로 들어감. 일반 대화/질문 (`@molly 안녕`, `이 잡 어떻게 돼?`)은 잘못된 PRD 로 처리됨.

**구현 (~2-3시간)**:
- 분류 게이트: 짧은 LLM 호출 (Haiku 같은 빠른 모델)로 `code_change` / `chat` / `status_query` 분류
- chat 모드: Claude 한 번 호출, 답변을 thread reply (Slack) / 사이드패널 (Chrome ext) / 채팅 (Playground)
- status_query 모드: getJob/listJobs 호출해서 자연어 응답
- 세 surface 통합 — 같은 분류 로직 재사용

### 3. agent_review verification — 첫 negative-path 검증
오늘 agent_review 구현은 했지만 실제로 **권한 가드 시나리오 (allowedRoles → /sign-in 리다이렉트)** 를 잡아내는지 직접 검증 안 했음. PRD: "TAS 에 관리자 전용 페이지 추가" 류의 잡 던져서 negative path 동작 확인 필요.

### 4. Slack 가독성 — 작업 종합 메시지 줄이기
완료 메시지가 5-6줄로 좀 길음. 2-3줄로 줄이는 거 후보.

### 5. Phase 2 Step 1 의 새 sandbox vite EPIPE 문제
오늘 한 번 발생 (`docker exec ... supervisorctl restart vite` 로 수동 복구). 자동 복구 로직 추가 후보 — vite 응답 EPIPE/non-200 감지 시 supervisorctl restart 자동 호출.

### 6. Promote 흐름 검증
오늘 molly Phase 2.2 에서 Promote 버튼 추가했지만 실제 PR 생성까지 끝까지 검증 안 했음. 검증 필요.

### 7. 작은 정리들
- Decomposer 가 emit 한 risks 가 실전에서 quality 가 어느 정도인지 데이터 수집 후 prompt 튜닝
- Chrome ext 의 옛 clarification 코드 (shouldStartClarification, buildClarificationConfig 등) 더 이상 안 쓰니까 stateless 모드 deprecated 시 제거 가능
- Inspect Console RequestDetailPage 의 pre-existing TS 에러들 정리

---

## 알려진 한계 / footguns

1. **Sandbox vite EPIPE**: 컨테이너 안 esbuild 자식 프로세스가 죽으면 `[plugin:vite:client-inject] write EPIPE` 발생. 현재 수동 복구 — 자동화 미구현.
2. **Playground 동시 잡**: 한 playground 에 동시에 여러 잡 못 돌림. UI 상에서 send 잠금으로 막지만 다른 surface (예: 한 surface 에서 잡 중인데 다른 surface 에서 시도) 는 409 응답 받고 사람-가독적 에러 보임.
3. **molly watcher 30분 timeout**: 사람이 ✅ QA 통과 / Promote 안 누르면 30분 후 watcher 만료. URL 메시지는 정상화됐지만 watcher 자체는 아직 만료.
4. **Auto-create playground 부팅 시간**: ~30초. 사이드패널에 "Playground 부팅 중…" 인디케이터는 있지만 첫 사용자에게는 답답할 수 있음.
5. **Inspect Console 의 일부 TS 에러**: OverviewPage / RequestDetailPage 에 pre-existing 에러 (Recharts 타입 호환). 빌드는 작동하지만 깔끔하지 않음.

---

## 활성 playground / 잡 (검증용)

세션 끝 시점:
- 5개 활성 playground (`d912c046`, `a90c9895`, `52fd083e`, `9cb08297`, 그리고 chrome ext 가 만든 `6b258531`)
- 활성 잡 두 개 정도 (molly resumed 2 active job watchers)

분리된 컨테이너 정리는 아직 안 함.

---

## How to start the next session

```
이전 세션 핸드오프 읽고 현재 상태 파악:
docs/superpowers/handoffs/2026-04-29-molly-everywhere.md

main 깨끗. 마지막 커밋 두 개:
  01ddd85 feat(chrome-ext): Phase 2 — auto-playground, Job pipeline, ...
  00ef9a3 feat(orchestrator+playground): risks in plan + molly Phase 2.2 ...

다음 슬라이스 후보:
  1. Chrome ext Phase 2 Step 3+4 — task buttons + QA pass/Promote (Slack parity)
  2. molly chat 모드 (사용자 요청) — 일반 대화/질문 분류 + 답변
  3. agent_review negative-path 검증 (권한 가드 시나리오)

서비스: orchestrator :3847 / playground-app :4180 / dashboard :4174
모두 백그라운드. lsof 로 살아있는지 확인 후 진행.
```

### Memory 업데이트 후보

`/Users/kyungjae.ha/.claude/projects/-Users-kyungjae-ha-Documents-moloco-inspect/memory/project_canvas_app.md`
의 "Through 2026-04-27 polish" 라인을 `Through 2026-04-29 molly-everywhere` 로 업데이트하고 이 핸드오프 링크 추가.

---

*마지막 업데이트: 2026-04-29*
