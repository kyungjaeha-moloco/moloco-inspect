# Handoff — 2026-05-07 incident burn-down (서버 재기동 사고에서 시작된 8 commit)

**Date:** 2026-05-07
**Author:** kyungjae.ha (with Claude)
**Branch:** main
**Plans referenced:**
- `docs/superpowers/plans/2026-05-06-reattach-archive-race-fix.md`
- `docs/superpowers/plans/2026-05-07-plan-emitter-design-system-manifest.md`
- (sub-phase C 마무리 plan 은 전 세션 — 이번엔 그 작업 commit 만)

**Prior handoff:** `docs/superpowers/handoffs/2026-05-06-sub-phase-c-finalize.md`

---

## TL;DR

> **서버 재기동 → 8 playground 가 사용자 의도 없이 `archived` 마킹 → root cause 추적**으로 시작해서 운영 사고 burn-down 으로 확장. 8 commit, ~+850 / -90 라인. Molly 의 chat 환각 / status query / plan emit / typecheck verify 를 한 번에 정리.

핵심 6 incident:
1. 서버 재기동 → reattach docker race → 8 playground false-archive
2. Molly chat 답변에 URL plain text + "잡 생성됐어요" 환각
3. Molly status query 가 Playground 의 change-request 못 봄 → 잡 카드 보이는데 "잡 못 찾음" 답변
4. Plan emit 자체가 LLM 404/400 — 모델 ID 거짓 (`claude-opus-4-7-20251201`) + Opus 4.7 의 thinking API 형식 변경 미반영
5. Plan 의 demo 컴포넌트가 type 에러 채로 commit → silent 안 보임
6. 위 5 의 type 에러를 plan emitter LLM 이 컴포넌트 catalog 못 봐서 hallucinate

---

## What shipped (8 commit, 시간순)

### `804e3bc` fix(sandbox): macOS AppleDouble 파일 차단

`copyFilesIn` 시 macOS BSD tar 의 `._*` xattr 동반 파일이 Linux sandbox 안에서 5428개 stray TS/JS 로 보여 esbuild 가 죽는 회귀. `COPYFILE_DISABLE=1` + 컨테이너 안 baseline commit 직전 `find -name '._*' -delete` 두 겹 방어.

### `7a35773` feat(molly): unified intake 사이클 마무리 + 분류 정확도 + first-turn plan emit

- 전 세션 sub-phase C 마무리 (lifecycle_action union 동기화 / ChatMessage.kind 필드 / 6 intake kind store 기록 / job_dispatched 자동 executePlan / MOLLY_HISTORY_AWARE default ON)
- 추가 fix: classifier — "보여줘 / 알려줘 / 정리해줘" 류 정보 조회 → chat 명시
- 추가 fix: handleFirstTurn — PRD 가 첫 턴에 명확하면 emitPlan 까지 묶어 반환 (이전엔 code_change_clear 만 반환하고 클라이언트엔 "plan 곧 emit 됩니다" 거짓 약속만)
- AIPanel 의 code_change_clear 폴백 안내 정직화 (plan 못 만들 때 사용자에게 명시)

### `f43a9df` fix(playground): reattach docker race + UI resume 버튼

- `inspectContainerWithRetry` (2s/8s/15s timeout, 1.5s/4s 백오프) — macOS sleep/wake 후 docker daemon race 견딤
- `archivedReason: 'user' | 'reattach-missing'` 필드 추가 — 진짜 archive 와 사고 archive 구분. reattach skip 가드 'user' 만 (reattach-missing 은 매 부팅 재검사 → 컨테이너 부활 시 자동 복구)
- WARN 로그 — missingCount >= 3 일 때 운영 알림
- UI resume 버튼: `LivePreview` 의 placeholder → `HibernatedPlaceholder` 컴포넌트로 분리. status 별 메시지 + `재개` 버튼 + 진행 중 disabled + 에러 표시
- `PlaygroundDetail` 의 `handleResume` callback (resumePlayground → setCurrent + reloadNonce++)

### `7a6473c` fix(molly): Opus 4.7 thinking API 마이그레이션 + settings cache + 모델 ID 정정

세 겹 fix — 각각 단독으로 emitPlan / PRD analyzer 가 항상 LLM error 반환:
1. `state/molly-settings.json` 의 `prdModel` / `planModel` 이 가짜 ID `claude-opus-4-7-20251201` (실재 안 함). `claude-opus-4-7` (alias) 로 정정 + `ALLOWED_MODELS` 도 갱신
2. Opus 4.7 의 thinking API 변경 — `{type:'enabled', budget_tokens:N}` 거부, `{type:'adaptive'}` + top-level `output_config.effort` 사용. `buildThinkingConfig(modelId, budget)` 헬퍼로 모델별 분기 (4.6+ 는 adaptive, 4.5 이하는 legacy budget). plan-emitter / prd-analyzer 둘 다 적용
3. `molly-settings.js` 의 cache 가 file mtime 인식 못 함 → 외부 sed 후 process restart 까지 옛 값. mtime 체크 추가 (각 호출 stat 1회)

### `f6c5cd6` fix(molly): chat 환각 안내 차단 + URL 자동링크 렌더링

- `composeChatReply` SYSTEM_PROMPT 에 "절대 금지 — 환각/거짓 진행 안내" 섹션 추가. "잡 생성됐어요" / "계획 단계로 넘어갑니다" / "곧 코드 작성이 시작됩니다" 같은 거짓 약속 명시 금지 + 대안 가이드
- AIPanel `renderInlineSegments` 에 URL 토큰 분기. http/https whitelist + 트레일링 punctuation 트림 + target="_blank" rel="noopener noreferrer"

### `746d84e` fix(molly status): Playground change-request 도 status_query 답변에 포함

`composeStatusReply` 가 `listJobs` 만 받아서 Playground 흐름의 change-request (별 entity, server.js 의 `requests` Map) 못 봄. 사용자 잡 카드 보이는데 Molly 는 "잡 못 찾음" 답변 → 모순.

- server.js 두 호출 지점에 `listRequests: () => [...requests.values()]` 추가
- molly-status.js — jobs / requests 를 동일 shape (`{id, kind:'job'|'change-request', status, ...}`) 으로 정규화 후 LLM 에 합쳐 전달
- TERMINAL 집합 양쪽 entity 의 종결 상태 모두 포괄. createdAt epoch ms 정규화 (`parseTimestamp`).
- SYSTEM_PROMPT — "두 entity 차이 노출 X, 사용자에겐 '작업' 으로 통합 표현"

### `e5ee3a4` feat(pipeline): preview 노출 전 typecheck verify — silent failure 차단 (D)

incident: 사용자가 plan 카드 승인 → 잡 commit 까지 갔지만 demo 컴포넌트에 type 에러 (TS2769 / TS2741) → vite 가 mount 실패 → 화면에 silent 안 보임.

- `runTypecheck(id, containerId, state)` 헬퍼 — preview_ready 직전 `tsc --noEmit -p tsconfig.app.json` (NODE_OPTIONS=4GB heap, 5분 timeout) 실행
- baseline 에러 (msm-portal-bff 등 ~수십 줄) 우회: `state.changedFiles` 와 매칭하는 라인만 regression 으로 카운트
- 실패 시 `status='error'`, `phase='verification_failed'` (신규 phase), 첫 regression 줄 surface
- playground 흐름과 legacy 흐름 모두 같은 helper 사용 (legacy 의 in-line tsc block 통일)

### `ec542aa` feat(molly plan): plan-emitter 에 components.json 매니페스트 주입 (C)

D 가 detection layer 였다면 C 는 prevention layer. plan-emitter 가 진짜 컴포넌트 매니페스트 (~458KB / 112 components) 를 보고 plan 만들도록.

- `components.json` (name / importStatement / when_to_use / do_not_use / antiPatterns 등) 을 systemBlocks 에 추가. `cache_control: ephemeral` 마지막 블록에 이동 (가장 큰 블록이라 cache 가치 ↑)
- SYSTEM_PROMPT 가이드: "ONLY reference components in components.json" / "use importStatement verbatim" / "honor when_to_use / do_not_use" / **"prop 정확도는 D 의 책임 — plan 은 의도까지만"** (가장 중요한 분업)
- `readComponentsCached` 헬퍼 — mtime-aware cache (이전 commit 7a6473c 의 molly-settings 패턴 재활용). design-system 갱신 시 다음 호출에 새 내용 반영
- userPrompt 의 DS 리소스 목록에도 components.json 포함

검증 결과:
- incident PRD 재시도 → kind=plan_emit, plan_items=5, 모두 components.json 의 진짜 컴포넌트만 참조
- cache_create=218,462 첫 호출 / cache_read=218,462 두번째 = 90% 할인 작동
- mtime cache: 첫 호출 시 "components.json loaded" 로그, 이후 silent

---

## Files changed (이번 세션 합산)

```
M  orchestrator/lib/molly-chat.js              (+24 환각 가이드)
M  orchestrator/lib/molly-classifier.js        (+5 정보 조회 분류)
M  orchestrator/lib/molly-intake.js            (+25 첫 턴 plan emit + lifecycle)
M  orchestrator/lib/molly-plan-emitter.js      (+50 components.json + adaptive thinking + mtime cache)
M  orchestrator/lib/molly-prd-analyzer.js      (+5 buildThinkingConfig)
M  orchestrator/lib/molly-settings.js          (+50 ALLOWED_MODELS + buildThinkingConfig + mtime cache)
M  orchestrator/lib/molly-status.js            (+40 jobs+requests 합치기)
M  orchestrator/lib/playground.js              (+105 reattach retry + archivedReason)
M  orchestrator/server.js                      (+105 runTypecheck + listRequests)
M  playground-app/src/editor/AIPanel.tsx       (+95 6 intake 분기 + URL 자동링크 + 안내 정직화 + job_dispatched 자동)
M  playground-app/src/editor/LivePreview.tsx   (+125 HibernatedPlaceholder + onResume)
M  playground-app/src/pages/PlaygroundDetail.tsx (+10 handleResume)
M  playground-app/src/services/orchestrator-client.ts (+15 IntakeKind union + Playground.archivedReason)
M  playground-app/src/store/playground-store.ts (+12 ChatMessage.kind)
M  tooling/sandbox-manager/src/container.js    (+15 AppleDouble 차단)
A  playground-app/src/vite-env.d.ts            (import.meta.env 타입)
A  docs/superpowers/plans/2026-05-06-reattach-archive-race-fix.md
A  docs/superpowers/plans/2026-05-06-sub-phase-c-finalize.md
A  docs/superpowers/plans/2026-05-07-plan-emitter-design-system-manifest.md
A  docs/superpowers/handoffs/2026-05-06-sub-phase-c-finalize.md
A  docs/superpowers/handoffs/2026-05-07-incident-burn-down.md (이 문서)
M  orchestrator/state/molly-settings.json      (planModel/prdModel 정정 — git untracked, runtime 갱신만)
M  orchestrator/state/playground/*.json (8개)  (status archived → hibernated 수동 복구 — git untracked)
```

---

## 검증

### 자동 (이미 통과)

- `pnpm tsc --noEmit` (playground-app) — exit 0
- 모든 server lib `node -c` — syntax OK
- intake smoke (chat / status / plan_emit / 폴백) — 의도된 kind 반환
- Resume API: `POST /api/playground/69484d5b/resume` → status='active' + vitePort 할당
- Plan emitter cache hit: cache_create=218462 → cache_read=218462

### 수동 (사용자 환경에서 권장)

1. 8개 hibernated playground UI 에서 "재개" 버튼 클릭 → iframe 정상 로드 확인
2. Molly 에 "디자인시스템 컴포넌트 목록 보여줘" → kind=chat, "잡 생성됐어요" 류 안내 0건
3. Molly 에 "이 잡 어디까지 됐어?" → Playground change-request 도 답변에 포함
4. plan_emit 시 demo 같은 type 에러 케이스 인위 시도 → `phase='verification_failed'` 안내 + iframe 에 안 보이는 silent fail 안 함
5. URL 자동링크 — 챗 응답 안 `http://localhost:4174` 클릭 → 새 탭으로 열림
6. design-system 의 components.json 수정 → 다음 plan 호출 시 "components.json loaded" 로그 확인 (mtime reload 작동)

---

## Backout

각 commit 독립 — 단독 revert 안전. 최근부터 영향 큰 순:

```bash
# C 만 되돌림 — components.json 주입 제거
git revert ec542aa

# D 만 — typecheck verify 제거 (이전엔 항상 silent fail 가능 상태로)
git revert e5ee3a4

# Status query — change-request 합치기 제거
git revert 746d84e

# Chat 환각 가이드 + URL 자동링크 — 둘 다 같은 commit
git revert f6c5cd6

# Settings + thinking API — emitPlan/PRD 가 다시 LLM error 가능 (4.7 모델 사용 중이면 fail)
git revert 7a6473c

# Reattach race fix + UI resume — 다음 부팅에 docker race 시 같은 사고 가능
git revert f43a9df
```

`state/molly-settings.json` 의 모델 ID 정정은 git tracked 가 아님 — 운영 상태 변경. 필요 시 backup 파일 (`*.bak`) 은 cleanup 됨, dashboard Settings 에서 다시 변경 가능.

---

## 알려진 한계 / footguns

- **components.json 첫 호출 비용** — ~110K input tokens (Sonnet ≈ $0.33, Opus ≈ $1.65). cache hit 으로 이후 90% 할인. 운영 1주 후 verification_failed 비율과 cost 종합 측정해서 compact manifest 로 줄일지 결정 (plan 의 옵션 B).
- **prop 시그니처는 components.json 에 없음** — plan emitter 가 prop 정확도 보장 X. D 의 typecheck 가 안전망. C+ (TypeScript Compiler API 로 props 추출) 가 다음 슬라이스 후보.
- **Baseline TS 에러 ~수십 줄** — `runTypecheck` 가 changed files 의 line prefix 매칭으로 우회. baseline 에 새 파일 추가 후 그 파일이 changedFiles 에 안 들어가는 edge case 면 false negative 가능. 단순 케이스에선 작동.
- **`tsc --noEmit -p tsconfig.app.json`** 가 5분 timeout — 매 잡마다 ~수십 초 ~분 부담. 자주 일어나면 운영 부담. NODE_OPTIONS 4GB heap 도 컨테이너 메모리에 압박.
- **patterns.json / api-ui-contracts.json / pm-sa-request-schema 는 mtime reload 미적용** — 부팅 후 영원히 stale 가능. 이번 슬라이스 비-목표 (별 슬라이스로 통일 권장).
- **`thinking: { type: 'adaptive' }` + `output_config.effort` 매핑 (budget → effort)** 이 정확도 검증 부족. 1024/3000/8000 임계는 추정 — 실제 LLM 행동과 비교한 적 없음.
- **archive 액션 UI** — 명시 archive 버튼 없음. API 만 있음. 사용자가 archive 하려면 API 직접 또는 reattach-missing 으로 들어가거나. UX 정리 별 슬라이스.
- **Dashboard Overview 데이터 안 보임** — false alarm. default range=7d, 데이터 거의 다 7d 이전. range 조정 또는 default 변경 필요. Empty-state 안내 별 슬라이스.

---

## 다음 슬라이스 후보

| 우선순위 | 항목 | 추정 | 효과 |
|---|---|---|---|
| 1 | **C+ props 시그니처 매니페스트** (TypeScript Compiler API 추출, plan 필요) | ~1d | plan 단계에서 prop 정확도까지 — D 의 verification_failed 거의 0 |
| 2 | **D+ verification_failed 자동 retry** (LLM 에 에러 피드백 + 재 emit) | ~0.5d | 사용자 재시도 부담 ↓ |
| 3 | **운영 1주 후 verification_failed 비율 측정** (관측만, 코드 없음) | 0.25d | C / D / C+ 의 ROI 정량화 |
| 4 | **patterns.json / api-ui-contracts mtime reload 통일** | 0.25d | components.json 과 일관성 |
| 5 | **Dashboard Overview empty-state + default range 조정** | 0.5d | 사용자가 "데이터 없네" 함정에서 빠지지 않게 |
| 6 | **archive 액션 UI** | 0.5d | API 만 있는 archive 를 명시 버튼으로 |
| 7 | **자연어 액션 진짜 구현** (lifecycle_action → 진짜 cancel/retry) | ~1주, plan 필요 | 핸드오프에 계속 남아 있는 항목 |
| 8 | **/api/chat legacy 삭제** (1-2주 운영 후) | 0.5d | unified intake 일원화 |
| 9 | **Slack message metadata** | 0.5d | buildSlackHistory 정확도 ↑ |
| 10 | **Decomposer (sub-phase B.4 잔여)** | ~1주+ | 큰 PRD 자동 분해 |

---

## How to start the next session

```
이전 세션 핸드오프:
- docs/superpowers/handoffs/2026-05-06-sub-phase-c-finalize.md
- docs/superpowers/handoffs/2026-05-07-incident-burn-down.md (이 문서)

main clean. 8 commit 전부 반영. 운영 fix burn-down + plan emit/typecheck 분업 정리.
- AppleDouble 회귀 차단 (804e3bc)
- unified intake 마무리 + 분류/first-turn plan (7a35773)
- reattach docker race fix + UI resume (f43a9df)
- Opus 4.7 thinking API + settings cache + 모델 ID (7a6473c)
- chat 환각 + URL 자동링크 (f6c5cd6)
- status query change-request 합치기 (746d84e)
- preview 직전 typecheck verify, D (e5ee3a4)
- plan-emitter components.json 주입, C (ec542aa)

서비스: orchestrator :3847 / playground-app :4180 / dashboard :4174
재시작: orchestrator (lib 변경 자동 watch), playground-app (vite HMR 자동), dashboard (vite HMR 자동)

다음 후보:
- C+ (props 시그니처 매니페스트) — D 의 verification_failed 거의 0 가능
- D+ (자동 retry) — 사용자 부담 ↓
- 또는 1주 운영 후 verification_failed 비율 측정 (정량적 ROI)
```

---

*마지막 업데이트: 2026-05-07 incident burn-down 세션 종료 시점*
