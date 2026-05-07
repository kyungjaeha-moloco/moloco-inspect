# Handoff — 2026-05-06 sub-phase C 마무리 (Phase 3 Task 3.1 완성)

**Date:** 2026-05-06
**Author:** kyungjae.ha (with Claude)
**Branch:** main
**Plan:** `docs/superpowers/plans/2026-05-06-sub-phase-c-finalize.md`
**Prior handoffs:** `2026-05-06-molly-perf-and-dashboard.md`, `2026-04-30-history-aware-intake.md`

---

## TL;DR

> **1주 슬라이스의 마지막 3 항목 마무리 — unified intake 사이클 닫음.** "이대로" → 자동 잡 시작이 진짜 동작. ChatMessage.kind 정확 기록. history-aware intake default ON.

이번 세션 변경: 4 파일, +93/-25 라인. 5 commit 단위.

---

## What shipped

### Task 0 — IntakeKind union 동기화

`lifecycle_action` 추가 — server (molly-intake.js JSDoc) ↔ client (orchestrator-client.ts) 동기화. 이전엔 server runtime 만 emit, 타입엔 누락 → Task 2 의 lifecycle_action case 가 TS reject 될 뻔.

### Task 1 — `ChatMessage.kind` 필드 추가

`playground-store.ts` ChatMessage 에 `kind?: IntakeKind` + `clarifyingQuestion?: string` 옵션 필드 추가. 옛 메시지엔 없으니 reader 가 `m.kind ?? heuristic` 폴백.

### Task 2 — AIPanel intake 분기 kind 기록

switch 의 6 kind 모두 `addAssistantMessage` 호출 시 `kind` 전달. `lifecycle_action` case 신규 (이전 fallthrough → 안내 누락). history 빌더 — heuristic → `m.kind ?? heuristic` 정확화.

### Task 3 — `job_dispatched` 자동 잡 시작

`executePlan` 에 `opts?: { userPromptOverride?: string }` 인자. `userPromptOverride !== undefined` 분기 explicit (빈 문자열도 override 인정).

`case 'job_dispatched'`:
- 직전 plan_emit 메시지 lookup (archived / planResolved=accepted 가드)
- `updateMessage(planMsg.id, { planResolved: 'accepted' })` — 중복 dispatch 차단
- `executePlan(planMsg, { userPromptOverride: result.cumulativePrd })`
- 중복 / 폴백 안내 명시

### Task 4 — `MOLLY_HISTORY_AWARE` default ON

우선순위:
1. `VITE_MOLLY_HISTORY_AWARE='0'` build-time → 전체 강제 OFF (회귀 hot-fix)
2. `localStorage.MOLLY_HISTORY_AWARE='0'` → 사용자별 opt-out
3. 기본 ON

신규 `playground-app/src/vite-env.d.ts` — `import.meta.env` 타입 선언.

---

## Files changed

```
M  orchestrator/lib/molly-intake.js                   (JSDoc IntakeKind 에 lifecycle_action 추가)
M  playground-app/src/services/orchestrator-client.ts (IntakeKind union 에 lifecycle_action)
M  playground-app/src/store/playground-store.ts       (ChatMessage.kind + clarifyingQuestion)
M  playground-app/src/editor/AIPanel.tsx              (intake 분기 kind 기록 + job_dispatched 자동 실행 + default ON)
A  playground-app/src/vite-env.d.ts                   (import.meta.env 타입)
A  docs/superpowers/plans/2026-05-06-sub-phase-c-finalize.md
A  docs/superpowers/handoffs/2026-05-06-sub-phase-c-finalize.md (이 문서)
```

---

## 검증

### 자동
- `pnpm tsc --noEmit` (playground-app) → exit 0 ✅
- `curl /api/intake` chat smoke → kind=chat 응답 ✅
- `curl /api/intake` lifecycle_action smoke → kind=lifecycle_action 응답 ✅

### 수동 (사용자 확인 권장)

1. localStorage 비우기 — `localStorage.removeItem('MOLLY_HISTORY_AWARE')`
2. 시나리오 A — 첫 turn 인사: "안녕" → kind=chat 답변
3. 시나리오 B — 명확 PRD: "TVING 메인 페이지 BETA 라벨 추가" → plan_emit (plan 카드)
4. 시나리오 C — "이대로" → **잡 카드 자동 실행 시작** (`샌드박스에서 실행 시작…`). plan 카드 `accepted` 마킹
5. 시나리오 C2 (race) — C 직후 "이대로" 또 → "찾지 못했어요" 안내
6. 시나리오 D — opt-out: `localStorage.setItem('MOLLY_HISTORY_AWARE','0')` → legacy path 동작
7. 시나리오 E — 모호 PRD: "뭔가 바꿔줘" → ambiguous → 답변 → plan_emit
8. 시나리오 F — lifecycle: "지금 진행 중인 잡 cancel" → lifecycle_action 안내 (즉시)
9. 시나리오 G — time-travel → 새 PRD → "이대로" → archived plan 무시 (가드)
10. metrics `/molly` — `intake kind 분포` 에 job_dispatched 1+ 증가

---

## Backout (회귀 발견 시)

### 사용자 개별
브라우저 콘솔:
```js
localStorage.setItem('MOLLY_HISTORY_AWARE', '0')
location.reload()
```
→ 즉시 legacy path 복귀.

### 전체 강제 OFF
빌드/배포 환경에 `VITE_MOLLY_HISTORY_AWARE=0` 설정 후 재빌드:
```bash
VITE_MOLLY_HISTORY_AWARE=0 pnpm build
```

---

## 알려진 한계 / footguns

- **isSending race** — `void executePlan(...)` 후 finally 가 input lock 즉시 해제. 같은 plan 두 번 승인은 `planResolved=accepted` 가드로 차단. 다른 새 메시지 보내는 건 의도된 거동 (잡은 비동기 카드).
- **archived 메시지 history 포함** — 컨텍스트로 의미 있어 유지. plan lookup 만 archived 제외.
- **multi-job 세션** — 비-목표. 현재 Playground 는 단일 active job 가정.
- **/api/chat sunset** — opt-out 사용자 + 옛 캐시. 호출 zero 확인 후 (1-2주) legacy block + /api/chat 라우트 삭제 슬라이스.
- **검증 시나리오 C/D/E/F/G 는 수동** — UI 이므로 자동화 불가. 사용자 확인 필요.

---

## 다음 슬라이스 후보

1. **/api/chat legacy 삭제** (1-2주 후, 호출 zero 확인)
   - AIPanel 의 legacy path block 제거
   - server 의 /api/chat route + postChat / mollyClassifyAndDispatch client 함수 제거
2. **50잡 측정 분석** (1-2주 운영 후) — metrics `/molly` 데이터로 cache hit / Haiku 회귀 / fast-path miss / ambiguous 비율 / thinking ON vs OFF 효과
3. **자연어 액션 진짜 구현** (~1주, plan 필요) — lifecycle_action 이 진짜 cancel/retry 호출. confirmation flow + audit log.
4. **Slack message metadata** (~0.5d) — buildSlackHistory 정확도 ↑
5. **Decomposer** (B.4 잔여) — 큰 PRD 자동 분해

---

## How to start the next session

```
이전 세션 핸드오프 3개 종합:
- docs/superpowers/handoffs/2026-04-30-history-aware-intake.md
- docs/superpowers/handoffs/2026-05-06-molly-perf-and-dashboard.md
- docs/superpowers/handoffs/2026-05-06-sub-phase-c-finalize.md (이 문서)

main clean. sub-phase C 마무리 ship.
- IntakeKind 에 lifecycle_action 추가 (server+client 동기화)
- ChatMessage.kind 필드 추가 (옛 메시지 폴백)
- 6 intake kind 모두 store 에 기록
- job_dispatched → 자동 executePlan (archived/race 가드 포함)
- MOLLY_HISTORY_AWARE default ON (VITE_ build-time + localStorage opt-out)

서비스: orchestrator :3847 / playground-app :4180 / dashboard :4174
재시작 권장: orchestrator (JSDoc 만 — 무영향), playground-app (vite HMR 자동)

다음 후보: /api/chat legacy 삭제 (1-2주 후) 또는 50잡 측정 분석
```

---

*마지막 업데이트: 2026-05-06 sub-phase C 마무리 세션 종료 시점*
