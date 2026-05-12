# Handoff — Ontology Phase 0+ + DS Escalation Slice A (3 commit, 2 new file)

**Date:** 2026-05-12
**Author:** kyungjae.ha (with Claude)
**Branch:** main (clean)
**Period:** 2026-05-12 (1 세션, ds-ecosystem-planning handoff 직후 같은 날)
**Prior handoff:** `2026-05-12-ds-ecosystem-planning.md` (10 commit + 5 plan 문서 종합)

---

## TL;DR

> **Ontology Phase 0+ (DS 카탈로그가 코드베이스 현실 반영) + DS Escalation Slice A (DS 없을 때 3 surface 4-옵션 UX) + GovernancePage Usage Insights (Slice C bootstrap). 3 commit, +3,077 lines, 2 new file.**

핵심 흐름:
1. **Ontology Phase 0** — `extract-cross-refs.mjs` 신규 (`usedInPatterns`/`relatedComponents`/`requiredProviders` 자동 추출)
2. **Phase 0+ 보강** — Agent-Design-System 3,615 .tsx 파일 walk → `usage_stats.file_count` 실측 갱신 + 소스 import 정규식으로 `requiredProviders` 백필
3. **DS Escalation Slice A** — `unresolved_components` 4-옵션 UX 3 surface (Slack 인터랙티브 / Playground 카드 / Chrome ext sub-card) + 단일 jsonl sink
4. **Slice C bootstrap** — GovernancePage 에 Usage Insights 섹션 (top-N bar + anomaly callout)
5. **거버넌스 시그널 부산물** — MCStatusBadge: stable 인데 msm-portal-web 사용 0회

---

## What Shipped (commit 시간순)

### `6e85af3` feat(design-system): Ontology Phase 0 cross-ref + Phase 0+ codebase scan
- `design-system/scripts/extract-cross-refs.mjs` 신규 (256 line)
- `design-system/src/components.json` — 112 컴포넌트 모두에 4 신규 필드 (`usedInPatterns`/`relatedComponents`/`requiredProviders`/`usage_stats`)
- `design-system/package.json` — `extract-xrefs` script 추가
- `meta.ontology_xref` 메타데이터 스탬프

**자동 추출 결과**:
- usedInPatterns: 19 / 112 (17%) — patterns.json grep, 정상 (패턴이 의도적으로 좁음)
- requiredProviders: 54 + 3 백필 = 57 / 112 (51%)
- relatedComponents: 72 / 112 (64%) — commonly_paired_with + 폴더 sibling union
- usage_stats.file_count: 98 / 109 컴포넌트가 use > 0 (90% adoption)

**Idempotency**: 직렬화 결과 동일 시 write skip + generatedAt 재사용. byte-level 재실행 시 동일 md5.

**Graceful skip**: `Agent-Design-System` 워크스페이스 없으면 Phase 0 만 실행.

### `348e7c1` feat(ds-escalation): Slice A — 4-옵션 missing component UX (3 surface)
- `orchestrator/lib/ds-escalation.js` 신규 (215 line) — 공유 lib (`normalizeUnresolved`, `buildMissingComponentCard`, `recordMissingChoice`, `readMissingChoices`, `buildDraftPreview`)
- `orchestrator/lib/molly-plan-emitter.js` — `closest_match` schema 가 object `{ name, importStatement, similarity_score, reasoning }` + `kind` (new_component/extension/composition_miss)
- `orchestrator/server.js` — POST `/api/missing-choice` 엔드포인트
- `orchestrator/lib/molly.js` — Slack `postMissingComponentCards` + `handleMissingChoice` + 4 action_id (`molly_missing_{kind}`) + ⓒ/ⓓ thread preview
- `playground-app/src/services/orchestrator-client.ts` — `RawUnresolvedComponent` 타입 + `postMissingChoice` 헬퍼
- `playground-app/src/store/playground-store.ts` — `PlanUnresolvedComponent` 타입 + `resolveMissingComponent` action
- `playground-app/src/editor/AIPanel.tsx` — `MissingComponentCard` 컴포넌트 (2×2 그리드 + recommended 강조 + draft preview 인라인)
- `chrome-extension/sidepanel.js` — `renderMissingComponentSections` 인라인 sub-card

**Recommended 결정 로직 (3 surface 공통)**:
- `closestUsable` (similarity ≥ 0.5) → ⓐ closest_match
- kind=extension 이고 closest_match 있음 → ⓓ extend_existing
- 그 외 → ⓒ propose_new

**텔레메트리**: 3 surface 모두 `state/molly-missing-choices.jsonl` 단일 sink

### `4f8a7f0` feat(ds-site): GovernancePage Usage Insights (Slice C 시작점)
- `design-system-site/src/pages/GovernancePage.tsx` — `UsageInsightsSection` 컴포넌트
- `design-system-site/src/App.tsx` — catalog 전달

**렌더링**:
- 4 stat card (Components in use / Zero-usage / Stable-but-zero / Total call-site files)
- ⚠️ Stable-but-zero anomaly callout (internal 만, 외부 라이브러리는 path:null 로 제외)
- Top-15 horizontal bar chart (warning/accent/회색 색 인코딩)

---

## 핵심 결정

1. **Phase 0 부터 시작 (가장 작음, 0.5일)** — 사용자 선택지 1-3 중 "3, 2" 순
2. **Phase 0 보강 옵션 A+B 채택** — 코드베이스 scan + provider 백필 (지금 한 번 짜면 Slice C 도 같은 데이터 소스 재사용)
3. **Slice A 우선 (Slice B 보다 먼저)** — Slice B (Auto-PR) 는 GitHub App 등록 의존, Slice A 가 시범 운영 차단 차단의 본질
4. **Draft preview 만 Slice A** — ⓒ/ⓓ 클릭 시 PR 본문 미리보기만, 실제 PR 생성은 Slice B
5. **External-library 컴포넌트 anomaly 제외** — path:null (`@moloco/moloco-cloud-react-ui`) 는 msm-portal-web 스캔 범위 밖, false positive 차단
6. **3 commit 으로 분할** — Phase 0+ / Slice A / Slice C 시작점 → 개별 revert 안전

---

## Files Changed

```
A  design-system/scripts/extract-cross-refs.mjs           +256
M  design-system/src/components.json                      +1620 / -258
M  design-system/package.json                             +1
A  orchestrator/lib/ds-escalation.js                      +215
M  orchestrator/lib/molly-plan-emitter.js                 +20 / -3
M  orchestrator/lib/molly.js                              +158
M  orchestrator/server.js                                 +47
M  playground-app/src/editor/AIPanel.tsx                  +267 / -2
M  playground-app/src/services/orchestrator-client.ts     +60
M  playground-app/src/store/playground-store.ts           +49
M  chrome-extension/sidepanel.js                          +206
M  design-system-site/src/App.tsx                         +1 / -1
M  design-system-site/src/pages/GovernancePage.tsx        +137 / -2
A  docs/superpowers/handoffs/2026-05-12-ontology-phase0-and-escalation-slice-a.md  (이 문서)
```

---

## 검증

### 자동 통과
- `node --check` (ds-escalation, molly, molly-plan-emitter, server, sidepanel) — 모두 OK
- `pnpm tsc --noEmit` playground-app + design-system-site — 0 에러
- `pnpm vite build` playground-app (408KB) + design-system-site (792KB) — 모두 exit 0
- `jq empty` components.json — valid
- `extract-cross-refs.mjs` 2회 실행 → 동일 md5 hash (byte-level idempotent)

### 종단 검증 (orchestrator live)
- `POST /api/missing-choice` 3 케이스:
  - object closest_match + propose_new → 200 ok + draft preview 본문
  - legacy string closest_match + closest_match → 200 ok + null draftPreview (normalize 통과)
  - invalid choice → 400 "choice must be one of 4 known kinds"
- jsonl row 모양 — ts/surface/closest_match/similarity/choice/kind 정확

### Card builder edge case (Node REPL)
- high similarity → recommended=closest_match ✅
- low similarity + kind=extension → recommended=extend_existing ✅
- no closest_match → recommended=propose_new ✅
- legacy string closest_match → normalize → similarity 0 + reasoning 메모 ✅

---

## 🚨 발견된 governance 시그널 (예상 못한 부산물)

Zero-usage 14개 중:
- ✅ 5 deprecated — 정상
- ✅ 4 candidate-for-removal — DS 인지
- ⚠️ **4 stable + zero**: `MCStatusBadge`, `MCFilterWithApplyButton`, `MCBetaTag`, `MCActionTitleTooltip`
  - 3개는 외부 라이브러리 (path:null, `@moloco/moloco-cloud-react-ui`) — msm-portal-web 스캔 범위 밖이라 정상
  - **MCStatusBadge** 만 진짜 anomaly — `path: status-badge/MCStatusBadge.tsx` 자체 컴포넌트인데 0회 사용
  - **거버넌스 액션 후보**: `candidate-for-removal` 로 라벨 강등 or DS 팀에 ping

GovernancePage 의 Usage Insights 섹션이 이 anomaly 를 자동 callout.

---

## Backout

### 단독 revert 안전 — 최근부터
```bash
# Slice C 시작점만 제거 — GovernancePage 의 Usage Insights 섹션 사라짐
git revert 4f8a7f0

# Slice A 만 제거 — 3 surface 4-옵션 UX 사라짐 (closest_match 는 schema 에서 string 으로 복귀)
git revert 348e7c1

# Phase 0+ 제거 — components.json 의 4 신규 필드 사라짐
# 주의: 실측 usage_stats 도 같이 사라짐. plan-emitter 의 cache 가 다음 호출에서 자동 갱신
git revert 6e85af3
```

---

## 알려진 한계 / footguns

### Phase 0+ — codebase scan 한계
- `regex` 기반 import scan 이라 wrapper / re-export 통한 간접 사용은 누락 (false negative).
- 3,615 파일 walk 마다 ~3-5s 걸림. CI 에 넣을 땐 cache 필요.
- `Agent-Design-System` 워크스페이스가 없으면 Phase 0+ 만 graceful skip. CI 에서 같이 체크아웃 필요.

### Slice A — Slack draft preview 가 thread message
- 사용자 PRD verbatim 인용. sensitive 데이터 시 review 절차 필요할 수 있음.
- 2명 시범은 OK, 5+명 확장 시 ephemeral / DM 으로 옮기는 옵션 고려.

### Slice A — `unresolved_components` 가 plan emitter 응답에 들어가지만 job state 에 저장 안 됨
- 별 작업 필요 — Slice B (Auto-PR) 진입 시 jobs/*.json 에 unresolved snapshot 저장하면 history-aware DM 가능.

### Slice A — `MissingComponentCard` resolution 매칭 키 = intent string
- 같은 plan 안에 동일 intent 가 2개 있으면 첫 번째에만 매칭. plan-emitter 가 dedup 한다고 가정 (현재까지 정상 작동).

### Slice C 시작점 — bar chart 가 클라이언트 렌더만
- 실제 governance 데이터 (request frequency, lifecycle) 는 batch script (`governance-batch.mjs`) 필요. 현재는 usage_stats 만.

### Vite build 청크 사이즈 warning (792KB)
- 사전 존재 warning, 이번 변경 무관. 별 작업 필요 시 manualChunks 설정.

---

## 다음 슬라이스 후보 (우선순위 순)

| 우선 | 항목 | 추정 | 효과 |
|------|------|------|------|
| 🥇 | **다음 주 2명 시범 운영 시작** — local Cloudflare Tunnel + Google SSO | 5-6h | 1-2주 사용 데이터 누적 (Slice A 운영 검증) |
| 🥈 | **DS escalation Slice B** — GitHub App + 자동 PR 생성 (Slice A 의 ⓒ/ⓓ 가 실제 PR 로) | 1-1.5일 | DS 요청 자동 누적 |
| 🥉 | **Slice C 본 작업** — jsonl batch + 자동 watch_list 승격 cron + Coverage Gauge | 1-1.5일 | 우선순위 데이터 + 자동 governance |
| 4 | **Ontology Phase 1** — plan emit 후처리 dependency expansion | 1일 | dependency 자동 보완 |
| 5 | **MCStatusBadge governance 액션** — DS 팀 ping or `candidate-for-removal` 라벨 | 30분 | 가장 작은 정리 |
| 6 | **Ontology Phase 2** — tool_use enum 강제 | 1일 | hallucination 거의 0 (R2 evidence) |
| 7 | **DS escalation Slice D** — Lifecycle 라벨 (Primer 패턴) | 0.5일 | DS 카탈로그 진화 추적 |
| 8 | **Slice E** — Triage workflow 문서 + RFC template | 0.5일 | DS 팀 부담 최소화 |

---

## How to Start the Next Session

```
이전 세션 핸드오프 읽기:
- docs/superpowers/handoffs/2026-05-12-ontology-phase0-and-escalation-slice-a.md (이 문서)
- docs/superpowers/handoffs/2026-05-12-ds-ecosystem-planning.md (선행, 같은 날)

main clean. 3 commit 반영. Phase 0+ + Slice A + Slice C 시작점 완료.

서비스 (좀비 fix 적용된 dev script):
  cd orchestrator && pnpm dev &
  cd playground-app && pnpm dev &
  cd dashboard && pnpm dev &

데이터:
- components.json 에 usage_stats.file_count 실측 데이터 누적
- state/molly-missing-choices.jsonl 가 비어있음 — 시범 운영 후 누적 예정

다음 후보 (우선순위 1-3):
- 1순위: 다음 주 2명 시범 운영 시작 (local Cloudflare Tunnel)
- 2순위: DS escalation Slice B (Auto-PR — Slice A 의 ⓒ/ⓓ 가 실제 PR)
- 3순위: Slice C 본 작업 (jsonl batch + auto watch_list 승격)
```

---

## 메모리 업데이트 후보 (다음 세션 시작 시 검토)

기존 갱신:
- `project_molly_ds_loop.md` — Slice A 완료 반영
- `project_ds_direction.md` — Ontology Phase 0+ 완료 / DS escalation 진행 상황 갱신

신규:
- `project_ontology_evolution.md` — Phase 0+ 완료, Phase 1-2 남음
- `project_ds_escalation.md` — Slice A 완료 / Slice B-E 남음 / MCStatusBadge anomaly 기록

저장 결정:
- 사용자가 다음 세션에서 검토 후 결정 (이 handoff 본 후)

---

## 검증 evidence (요약)

```
Phase 0+ extract-cross-refs.mjs:
  Total components:           112
  with usedInPatterns:        19
  with requiredProviders:     54 + 3 백필 = 57
  with relatedComponents:     72
  codebase scan:              3615 source files
  usage_stats refreshed:      112
  catalogued names with usage>0: 98 / 109
  requiredProviders backfilled: 3

Slice A POST /api/missing-choice:
  object closest_match + propose_new → 200 ok + draftPreview ✓
  legacy string closest_match + closest_match → 200 ok + null preview ✓
  invalid choice → 400 ✓

Card builder edge cases:
  CASE 1 high similarity → closest_match
  CASE 2 low+extension   → extend_existing
  CASE 3 no match        → propose_new
  CASE 4 legacy string   → normalize 통과 (similarity 0)
```

---

*마지막 업데이트: 2026-05-12 세션 종료. 다음 세션은 2명 시범 운영 시작 또는 Slice B/C 진행.*
