# Plan — DS Missing: AI 자동 판단 + Governance Queue

**Date:** 2026-05-19
**Author:** kyungjae.ha (with Claude session)
**Status:** draft v3 — momus 1차 리뷰 반영 (M1 식별자/라인 검증, M2 ref_id+awaiting_judge, M3 judge fallback 매트릭스, M4 G4 split, M5 meta-tooling orthogonal, m1-m5 minors)
**Trigger:** 2026-05-19 사용자 product 방향 (5 결정 답): "사용자는 코드/구조 모르므로 DS missing 옵션을 보일 필요 없음. AI가 판단 → 비슷한 컴포넌트로 자동 진행. DS밖 신규 / 새 DS 제안 / 기존 확장 케이스는 DS owner에게 에스컬레이션."
**Parent:**
- DEPRECATED v1: `docs/superpowers/plans/2026-05-19-ds-missing-card-ux.md` (4 옵션 UI 노출 + Run 자동 default — 사용자 의도와 모순으로 폐기)
- Original wiring: `docs/superpowers/plans/2026-05-12-ds-escalation-workflow.md` (Slice A 완료, commit `348e7c1`)

---

## 1. 문제 진술 + 새 모델

### 1.1 폐기되는 가정
DS missing 발생 시 사용자에게 4 옵션 (closest_match / custom_build / propose_new / extend_existing) 노출 → 사용자가 선택. 실제 사용자는 코드/구조를 모르므로 옵션 판단 자체 불가. 옵션 노출은 인지 부하만 증가.

### 1.2 새 모델
**Audience 2 분리:**
- **End user (PM/디자이너)**: DS missing 카드 미노출. AI가 비슷한 DS 컴포넌트 자동 채택 → Plan card만 봄. 에스컬레이션 case는 plan에 작은 notice ("DS 팀에 신규 제안됨").
- **DS owner**: design-system-site `http://localhost:4176/governance` pull-based UI에서 에스컬레이션 큐 확인 + 처리.

**처리 흐름:**
```
plan-emitter → unresolved_components 발사
   ↓
ds-escalation (closest_match similarity 계산)
   ↓
similarity ≥ 0.5
   ↓ auto-adopt closest_match
   ↓ Plan에 small notice (선택)
   ↓ telemetry: { auto_adopted: true, similarity, component }
   ↓
사용자는 즉시 Plan card 봄 → Run

similarity < 0.5
   ↓ LLM judge 호출 (escalation type 판단)
   ↓ → propose_new / extend_existing / custom_build 중 1개
   ↓ 그 동안에도 closest_match 로 즉시 사용자 진행 (Q4=A, async best-effort)
   ↓ Plan에 small notice ("DS 팀에 X 제안됨, ref ESC-NNNN")
   ↓ governance queue 등록
   ↓
DS owner: /governance 페이지에서 큐 확인 + 처리
```

---

## 2. 사용자 답에 따른 5 결정 (anchor)

| # | 답 | 설계 함의 |
|---|---|---|
| 1 | governance queue at `:4176/governance` (design-system-site) | 새 페이지 + 새 라우트. 별 Slack/GitHub 채널 사용 안 함 |
| 2 | DS owner pull-based (push notification 없음) | 알림 인프라 불필요. owner가 적극 확인 |
| 3 | LLM 한 번 더 판단 | 추가 LLM 호출 (judge), prompt 새로 설계 |
| 4 | A — closest_match 즉시 진행, escalation은 async | 사용자 대기 0. judge + queue 등록은 background |
| 5 | B — Plan card에 작은 notice | UI 변경: 4 옵션 카드 제거, plan에 1-line notice 추가 |

---

## 3. 목표 / 비목표

### 3.1 목표
- **G1** — 사용자 surface에서 DS missing 4 옵션 카드 제거 (Chrome ext + Playground + Slack)
- **G2** — closest_match similarity ≥ 0.5 시 AI auto-adopt + plan에 (옵션) notice
- **G3** — similarity < 0.5 시 LLM judge → escalation type 판단 → governance queue 등록 + plan notice
- **G4** — design-system-site `/governance` 페이지 — escalation queue 리스트 + 상세 보기 + status 변경
- **G5** — 기존 `/api/missing-choice` API contract 보존 (점진적 deprecation, 새 endpoint 추가)
- **G6** — telemetry 확장: auto_adopted vs judge_routed vs user_resolved 비율 측정

### 3.2 비목표
- ~~push notification (Slack mention, email)~~ — Q2 답: pull-based
- ~~DS owner authentication / RBAC~~ — 시범 단계, 별 thread
- ~~escalation case의 자동 PR 생성~~ — Q1 답: governance UI에서 owner가 수동 결정. AI는 분류만.
- ~~mobile-friendly governance UI~~ — desktop-only OK 시범
- ~~per-client escalation pool~~ — 전체 1개 큐 시범, 클라이언트 분리는 별 thread
- ~~LLM judge multi-turn (사용자에게 clarifying question)~~ — 단일 turn, async background

### 3.3 Real Screens Priority 메모리와의 관계 (momus M5)

이 plan은 **meta-tooling work** — 실제 사용자가 보는 서비스 화면이 아니라 plan 생성 파이프라인의 backend 흐름 + 별 admin UI (governance) 작업. `feedback_real_screens_priority.md` ("실서비스 화면 최우선, 컴포넌트 조립은 부차적") 와는 직교 — 본 plan은 *별도 admin surface* + *backend signal routing* 이고 사용자 서비스 화면 자체 개선이 아님. 시범 단계 (1-2 사용자만 영향) 라 cost 낮음 + DS owner workflow 시범 의도. real-screens lane (Chrome ext 캡처→LLM, Track 2 region-targeted edit 등) 우선순위 그대로 유지.

---

## 4. 영향 받는 코드/기능

### 4.1 백엔드 (`orchestrator/`) — momus m3: 코드 식별자/주석 English (메모리 `feedback_code_in_english.md`). 사용자 UI notice copy는 user locale OK.

1. **`lib/ds-escalation.js`** —
   - 새 함수 `judgeEscalationType({ unresolvedComponent, similarity, prdContext })` → LLM 호출, return `{ kind: 'propose_new'|'extend_existing'|'custom_build', rationale: string }`
   - 새 함수 `enqueueGovernance(escalationItem)` → `state/governance-queue.jsonl` append
   - 새 함수 `listGovernanceQueue({ status, limit })` → 큐 read
   - 새 함수 `updateGovernanceStatus(id, status)` → owner 액션
   - 기존 `recordMissingChoice` 는 owner manual 액션에서만 사용 (사용자 surface는 호출 안 함)

2. **`server.js`** — 새 endpoint:
   - `GET /api/governance/queue?status=pending` → 큐 리스트
   - `GET /api/governance/queue/:id` → 상세
   - `POST /api/governance/queue/:id/status` → status 업데이트
   - 기존 `/api/missing-choice` 는 보존 (점진적 deprecation)

3. **`lib/molly-plan-emitter.js`** 또는 별 helper —
   - plan 응답에 `escalation_notices: [{ component, action, ref_id }]` 새 필드. 사용자 surface에서 plan card에 1-line notice 표시.
   - **(momus n4)** schema 추가 위치: plan-emitter의 response JSON schema — `lib/molly-plan-emitter.js` 의 SYSTEM_PROMPT JSON 예시에 새 필드 명시. DESIGN.md (Layer 0)는 변경 없음 (런타임 응답 schema라 plan-emitter prompt 안에 명시).

### 4.2 사용자 surface — 4 옵션 카드 제거 (momus M1 — 식별자 + 라인 검증)

**현존 4 CHOICE_KINDS** (`ds-escalation.js:25`): `closest_match`, `custom_build`, `propose_new`, `extend_existing` (verified)

1. **`chrome-extension/sidepanel.js`** — `renderMissingComponentSections` 영역 (line ~2810-2940):
   - 4 옵션 버튼 UI 제거 (또는 hidden)
   - Plan card 안에 `escalation_notices` 표시 (1-line notice, optional)

2. **`playground-app/src/editor/AIPanel.tsx`** — `MissingComponentCard` (line ~4103-4295):
   - 동일하게 카드 자체 제거, plan card에 notice 추가

3. **`orchestrator/lib/molly.js`** — Slack handler 4 옵션 전체 wiring (verified line numbers):
   - **line 428**: `appInstance.action(\`molly_missing_${choice}\`, ...)` — 4 action handlers (`molly_missing_closest_match`, `molly_missing_custom_build`, `molly_missing_propose_new`, `molly_missing_extend_existing`) 등록 루프. 본 plan에서는 *제거 안 함* (deprecated wiring, 후속 PR cleanup)
   - **line 1486**: `postMissingComponentCards` 호출 — 사용자 surface에서는 호출 안 함 (escalation_notices만 사용)
   - **line 1501-1518**: `postMissingComponentCards` 정의 — 그대로 둠 (legacy, 후속 cleanup)
   - **line 1520-1530**: `buildMissingComponentBlocks` + `action_id` rendering — 사용자 surface 미발사
   - **line 1622**: missing-choice preview catch — 그대로 둠 (4 옵션 cleanup 후 같이 제거)
   - **new wiring**: plan 메시지에 `escalation_notices` 블록 추가 (별 helper, 1-line per notice). escalation 케이스에만 발사.

### 4.3 Governance UI (`design-system-site/`)

**(momus n3)** Port 검증: `design-system-site/package.json:7` 의 `"dev": "vite --host 0.0.0.0 --port 4176"` 확인 — 사용자가 지정한 `:4176/governance` = dev port. preview port는 4177 (vite preview).

1. **`src/App.tsx`** — `/governance` 라우트 추가 (verified 존재)
2. **`src/navigation.ts`** — 사이드바 메뉴 "Governance" 추가 (verified 존재)
3. **`src/pages/GovernancePage.tsx`** (new) — 큐 리스트 + 상세 + status 토글
4. **`src/services/governance-client.ts`** (new) — orchestrator API 호출 wrapper. **CORS (momus R3)**: vite proxy 결정 — `design-system-site/vite.config.ts` 에 `server.proxy` 추가 (`/api/governance/*` → `http://localhost:3847`). 이유: orchestrator의 CORS 정책 변경하지 않고 dev-only 우회 가능, governance UI는 internal admin 도구라 prod 배포 시에도 같은 도메인 reverse-proxy 가정.

### 4.4 Storage

- **`state/governance-queue.jsonl`** — 새 jsonl 파일. 한 줄 = 한 escalation item.
  ```json
  {
    "id": "ESC-2026051901",
    "createdAt": 1779166800000,
    "kind": "propose_new|extend_existing|custom_build",
    "component": { "name": "...", "intent": "...", "similarity": 0.32 },
    "closestMatch": { "name": "...", "similarity": 0.32 },
    "judgeRationale": "...",
    "prdSnippet": "...",
    "status": "pending|in_review|resolved|dismissed",
    "resolvedAt": null,
    "resolution": null
  }
  ```

---

## 5. 설계 결정 (Q&A)

### Q1 — Similarity threshold (auto vs escalate)

- (a) 고정 0.5 ← 제안 (현 ds-escalation.js의 `closestUsable >= 0.5` 그대로 차용)
- (b) 동적 (성공 PR rate 기반 학습)
- (c) PRD 복잡도 결합

**제안: (a).** 단순함. 후속 telemetry로 미세 조정 (별 thread).

### Q2 — LLM judge prompt 구조 + fallback (momus M3)

**Prompt:**
- 입력: unresolved component name/intent, closest match (name, similarity), PRD context, 기존 비슷한 컴포넌트 1-2개 추천
- 출력 (JSON, strict schema): `{ kind, rationale }`. kind ∈ `propose_new | extend_existing | custom_build`. rationale 1-2 sentences.
- 모델: Sonnet 4.6 (낮은 latency, 충분한 추론). thinking off (단순 분류 작업). max_tokens: 200.
- JSON mode (Anthropic의 strict JSON output) 활성화 + schema validation.

**Fallback 매트릭스 (M3):**
| 실패 모드 | 대응 |
|---|---|
| timeout (>30s) | row의 status 그대로 `awaiting_judge` 유지 + kind='unknown' + governance UI에 "Judge timed out" 라벨. owner 수동 분류 가능 |
| JSON parse fail | retry 1회 (다른 model 시도 or temperature 0). 재실패 시 unknown + log warn |
| kind not in CHOICE_KINDS | unknown + log warn ("invalid kind: ${received}") |
| LLM API 500 / rate limit | retry 1회 + 30s 대기. 재실패 시 unknown + governance UI 에러 라벨 |
| ANTHROPIC_API_KEY missing | judge 호출 skip + unknown 상태로 큐 등록 + warn |

**제안:** 별 `lib/ds-escalation-judge.js` 분리. ds-escalation.js가 호출. 모든 fallback 경로에서 governance queue row는 항상 등록됨 (data loss 없음, owner가 수동 처리 가능).

### Q3 — Plan notice 표시 방식

- (a) **항상 표시** ("AI가 X로 진행" + escalation 케이스 추가 "DS 팀에 제안됨")
- (b) escalation 케이스만 표시 (auto-adopt는 무 notice)
- (c) plan 본문 안에 inline

**제안: (b).** auto-adopt 케이스에서 noise 없음. escalation만 1-line notice ("💡 'X' 컴포넌트가 DS에 없어 'Y'(50% 유사)로 진행. DS 팀에 새 컴포넌트 제안 등록 (ESC-NNNN)").

### Q4 — Async escalation timing (momus M2 — ref_id race + lifecycle)

- judge LLM 호출: ~2-5s
- 사용자 즉시 진행 → judge는 background
- queue 등록 2단계: **awaiting_judge** (plan response 시점) → judge 완료 후 **pending** (owner 대기)

**ref_id 포맷 통일 (momus M2):**
- 포맷 결정: **`ESC-${base36(timestamp_ms)}`** — collision-free (ms 정밀도, base36 인코딩으로 짧음, sortable)
- 예: `ESC-LKW2X8R3` (10자리 base36 ≈ ms timestamp)
- §4.4 storage 예시의 `ESC-2026051901` (날짜+seq) 폐기

**구현:**
1. plan-emitter가 unresolved component 발견 → ds-escalation handler 호출
2. ds-escalation handler:
   - similarity 계산
   - similarity < 0.5 → `ref_id` 즉시 생성 + `state/governance-queue.jsonl` append (status: `awaiting_judge`)
   - plan response에 escalation_notices 포함 (ref_id 들고)
   - judge LLM 호출 promise spawn (await 안 함, fire-and-forget with logging)
3. judge 완료 → 같은 ref_id row의 status를 `pending` + kind/rationale 채움 (M2 m2: status event log append 방식, 아래 m2 참조)

**Pre-judge state 처리 (governance UI):**
- 새 status: `awaiting_judge` — judge 미완료 (kind=`unknown`)
- UI에서 별 라벨 ("🤔 Judging...") 표시. owner 액션 불가 (status 변경 disabled).
- judge 완료 시 자동 `pending` 전환 — owner 액션 가능.

**Crash recovery (momus R2):**
- orchestrator restart 시 `awaiting_judge` 중 >5분 경과한 row를 startup sweep으로 `unknown`(kind) + `pending`(status) 강제 전환. judge 호출 중 process restart 발생 시 영구 고립 방지.
- 구현: `ds-escalation.js` 안에 `sweepStaleAwaitingJudge()` 함수 추가, server.js startup hook에서 호출.

### Q5 — Status lifecycle (governance UI)

- `awaiting_judge` (큐 등록 즉시, judge 미완료, owner 액션 disabled) → `pending` (judge 완료, owner 대기) → `in_review` (DS owner가 클릭) → `resolved` (owner가 처리 완료) / `dismissed` (owner가 무시 결정)
- 별 비즈니스 로직 X (시범 단계). 단순 상태 토글.
- **Concurrency (momus m2)**: status 변경은 event log append 패턴 — `state/governance-status-events.jsonl` 새 파일. 한 줄 = `{ ref_id, ts, status, owner_id? }`. UI는 ref_id 별 최신 event row의 status 표시. 2-탭 동시 변경 시 last-write-wins (event log 기반이라 안전).

### Q6 — 기존 `/api/missing-choice` 처리

- 4 옵션 UI 사라지면 호출 사이트 0이 됨
- 백엔드 endpoint는 보존 (deprecated marker만 추가). 후속 PR에서 제거.

**제안:** 사용자 surface에서만 호출 제거. backend endpoint는 다음 PR에서 별도 처리.

---

## 6. 슬라이스

### Slice G1 — LLM judge + governance queue store *(2-3h)*
- 새 `lib/ds-escalation-judge.js` — LLM 호출, JSON 응답 파싱
- 새 함수 in `ds-escalation.js`: `enqueueGovernance`, `listGovernanceQueue`, `updateGovernanceStatus`
- 새 storage: `state/governance-queue.jsonl`
- 단위 검증: judge 호출 1회 (PRD + unresolved → kind/rationale)

### Slice G2 — server.js endpoints *(1-1.5h)*
- `GET /api/governance/queue`
- `GET /api/governance/queue/:id`
- `POST /api/governance/queue/:id/status`
- 단위: curl로 큐 등록/조회/업데이트

### Slice G3 — plan-emitter notice + ds-escalation wiring *(1.5-2h)*
- ds-escalation handler: similarity < 0.5 분기에서 judge 호출 + queue 등록 + ref_id 생성
- plan 응답에 `escalation_notices` 필드 추가
- 단위: end-to-end PRD → plan response 까지

### Slice G4a — Plan response 새 필드 추가 (backward compatible, momus M4 split) *(1h)*
- plan-emitter response schema에 `escalation_notices` 새 필드 추가 (옵션 필드, default `[]`)
- 기존 consumer (chrome ext / playground / slack) 는 미인식 (기존 동작 유지)
- 단위: orchestrator → curl로 plan response 확인 → `escalation_notices` 들어옴

### Slice G4b — 사용자 surface 4 옵션 UI 제거 + notice render *(2-3h)*
- G4a 후, 모든 consumer가 새 필드 인식하는 시점에 진행
- Chrome ext: renderMissingComponentSections → 4 옵션 UI 제거 + escalation_notices 렌더
- Playground: MissingComponentCard → 동일 패턴
- Slack: molly.js → postMissingComponentCards 호출 제거 + plan 메시지에 escalation_notices 블록 추가
- 단위: 3 surface 각각 escalation 케이스 시뮬레이션
- Deploy ordering: G4a 먼저 prod 배포 → 모든 consumer가 새 필드 처리 확인 → G4b 배포

### Slice G5 — design-system-site governance page *(2-3h)*
- 새 `src/pages/GovernancePage.tsx`
- 큐 리스트 + 상세 + status 토글
- `src/services/governance-client.ts` API wrapper
- 라우트 + 사이드바 메뉴
- 단위: dev server에서 큐 표시 + status 변경

### Slice G6 — end-to-end 검증 *(1-1.5h)*
- 5 escalation 시나리오 (similarity < 0.5인 PRD):
  - 신규 패턴 컴포넌트 요청 → judge: propose_new
  - 기존 컴포넌트에 prop 추가 필요 → judge: extend_existing
  - DS 적합 아닌 케이스 → judge: custom_build
- 각각 사용자 surface에 notice 잘 표시되는지 + governance UI에 큐 등록되는지
- DS owner 흉내 → status 토글

---

## 7. 검증

### 7.1 기능 검증 (Slice G6)
- [ ] similarity ≥ 0.5: auto-adopt, plan notice 없음
- [ ] similarity < 0.5: judge 호출 → queue 등록 → plan notice 표시
- [ ] 3 surface (Chrome ext / Playground / Slack) 동일 동작
- [ ] DS owner: `/governance` 큐 리스트 표시, 상세 보기, status 변경 (`pending → in_review → resolved`)
- [ ] 사용자 즉시 진행 (Q4=A) — judge LLM 응답 대기 안 함
- [ ] ref_id (ESC-NNNN) 발급 + plan ↔ governance queue link

### 7.2 telemetry 검증
- [ ] `state/governance-queue.jsonl` 에 escalation 케이스 append
- [ ] kind 분포: propose_new / extend_existing / custom_build 비율
- [ ] auto-adopt 비율 (similarity ≥ 0.5 케이스)
- [ ] LLM judge latency 분포
- [ ] **(momus m1) auto-adopt 후 user-initiated retry/edit 비율** — 사용자가 plan을 다시 re-plan/cancel/edit 하는 비율로 잘못된 매핑 추적. 30% 초과 시 silent auto-adopt 정책 재검토 + plan body 안 subtle hint ("Using Y similar to X") 도입 검토

### 7.3 회귀 검증
- [ ] 기존 `/api/missing-choice` endpoint 응답 정상 (사용 X지만 보존)
- [ ] plan-emitter 응답 시간 변화 없음 (judge가 async background이므로)

### 7.4 사용자 경험 검증 (rubric, 3 surface 각 ≥3 runs)
- [ ] PM이 plan card 보고 즉시 Run 가능 (옵션 선택 부담 없음)
- [ ] escalation 케이스에서 사용자가 plan notice 의미 즉시 이해 가능 (5초 이내 자가 설명)
- [ ] DS owner가 governance UI에서 5분 안에 큐 1건 처리 가능 (read → status 변경)
- **(momus m4)** G6 5 시나리오는 시범 sanity check. 실 정확도는 배포 후 1주 telemetry 누적으로 재평가. n=5 단독 판단 금지.

---

## 8. 리스크 / 미해결

| 리스크 | 영향 | 대응 |
|--------|------|------|
| LLM judge 분류 정확도 부족 → 잘못된 escalation kind | medium | Slice G6 5 케이스 분류 정확도 ≥ 4/5 |
| similarity = 0.5 borderline 케이스 — 너무 많은 auto-adopt | medium | G6 후 telemetry로 threshold 미세 조정 |
| async judge 실패 시 (LLM timeout 등) plan notice 미발사 | medium | judge timeout 30s + fallback: kind='unknown' + 큐 등록 |
| governance queue 적체 (DS owner가 안 봄) | low (시범 단계) | telemetry로 큐 대기 시간 모니터, 알림 별 thread |
| 사용자가 plan notice 무시 → 잘못 매핑된 component로 진행 후 실패 | medium | notice 안에 "DS 팀에 X 제안됨" 명시, manual review 권유 |
| 4 옵션 UI 갑작스러운 제거 → 기존 사용자 (테스트 중인) 혼란 | low | 시범 단계, 사용자 1-2명만 사용 중 |
| /api/missing-choice deprecated 처리 — 코드 잔존 | low | 다음 PR에서 cleanup |
| LLM judge 추가 비용 ($) — 호출당 ~$0.01-0.02 (Sonnet ~500 토큰) | low | 호출 빈도 낮음 (escalation case만), 월 ~$1-3 |
| design-system-site rebuild needed for /governance route | low | 기존 build 흐름 그대로 |

**미해결 (defer):**
- DS owner notification (이메일 / Slack mention)
- Per-client escalation queue
- Escalation case의 자동 PR 생성 (`propose_new` 결과를 design-system repo PR로)
- DS owner authentication / RBAC
- Mobile-friendly governance UI
- LLM judge model A/B (Sonnet vs Haiku)

---

## 9. 추정

| Slice | 추정 |
|-------|------|
| G1 LLM judge + queue store | 2-3h |
| G2 server endpoints | 1-1.5h |
| G3 plan-emitter notice + ds-escalation wiring | 1.5-2h |
| G4a Plan response 새 필드 (backward compat) | 1h |
| G4b 3 surface UI 변경 + notice render | 2-3h |
| G5 governance page | 2-3h |
| G6 end-to-end 검증 | 1-1.5h |
| **합계** | **~10.5-15h** |

---

## 10. 검토 후 진행 순서

1. v3 momus 사인오프 (전 v1 폐기, v2 5건 REVISE, v3은 그 반영)
2. G1+G2 (백엔드 토대)
3. G3 (plan 응답에 notice 포함)
4. **G4a 먼저 (backward compat) → 사용자 surface가 새 필드 무시 OK 확인 → G4b 배포**
5. G5 (governance page)
6. G6 (E2E)

별도 commit grouping:
- Commit 1: G1+G2 (backend foundation)
- Commit 2: G3 (escalation routing)
- Commit 3: G4a (response field additive)
- Commit 4: G4b (3 surface UI)
- Commit 5: G5 (governance UI)
- Commit 6: G6 결과 + cleanup

---

## 11. 메모리/핸드오프 업데이트 영향

- 별 핸드오프 (G6 완료 후) — DS missing 새 모델 (auto-adopt + governance) + 측정 결과
- `project_ds_direction.md` — 다음 항목 추가:
  - "DS missing 4 옵션 카드 제거 (사용자 surface). AI auto-judge + governance queue 시범 도입."
  - link: `docs/superpowers/plans/2026-05-19-ds-missing-ai-judge-governance.md`
- 새 메모리: `project_ds_governance.md` — content 명세:
  - DS owner workflow (pull-based at :4176/governance)
  - queue lifecycle (`awaiting_judge` → `pending` → `in_review` → `resolved`/`dismissed`)
  - escalation 4 kinds 의미 (closest_match, custom_build, propose_new, extend_existing)
  - ref_id 포맷 (`ESC-${base36(timestamp)}`)
- DEPRECATED 표기: `2026-05-12-ds-escalation-workflow.md` Slice A 4-옵션 모델 → "사용자 surface 제거됨, governance UI로 이전" 노트 추가

---

*Plan 작성: 2026-05-19 Claude session. v1 (사용자 직접 선택 4 옵션) 폐기 후 product 방향 재정렬 — "사용자는 코드 모름, AI 자동 판단 + DS owner 에스컬레이션" 모델로 전환.*
