# Handoff — DS Ecosystem Planning (DS loop v2 + 배포 + Escalation + Ontology, 10 commit)

**Date:** 2026-05-12
**Author:** kyungjae.ha (with Claude)
**Branch:** main (clean)
**Period:** 2026-05-07 → 2026-05-12 (3 sessions)
**Prior handoffs:**
- `2026-05-07-incident-burn-down.md` (D/C commit + 8 commit 종합)
- `2026-04-30-history-aware-intake.md` (sub-phase A-E 완성)

---

## TL;DR

> **DS loop v2 의 S0/S2/S3-A 완료 + 좀비 fix + 5 plan 문서 (배포 2 + escalation + ontology + DS loop). 10 commit, 4 lib/script 변경 + ~2400 plan markdown.**

핵심 흐름:
1. **DS loop v2** S0 (cache 1h + Sonnet) + S2 (ts-morph component-props.json) + S3 Phase A (referenced/unresolved schema) 완료
2. **검증 통과** — Slack 시범 plan emit 에서 `refs=4 unresolved=0` 로그 확인
3. **2 명 시범 운영 + GCP 정식 배포** plan — 5명 researcher + Momus 비판 review
4. **DS escalation workflow** + **Ontology evolution** plan — 추가 5명 researcher
5. **사용자 지적 반영** — PRD entity extraction 잘못된 가정 → plan emit 후처리 dependency expansion 으로 정정
6. **좀비 프로세스 누적 차단** — 3 dev script 에 trap + lsof kill

---

## What Shipped (commit 시간순)

### `1297ced` docs(plan): Molly × DS 루프 v2 — research-informed (5 슬라이스)
5명 researcher 외부 리서치 결과로 plan 정밀화. S0 quick wins / S1 compact manifest (조건부) / S2 ts-morph props / S3 UX 폴리시 / S4 governance / S5 사후 분석.

### `a80659f` feat(molly plan-emitter): S0 — cache TTL 1h + planModel Sonnet 다운
- `molly-plan-emitter.js:139` cache_control 에 `ttl: '1h'` 추가
- `state/molly-settings.json` planModel `claude-opus-4-7` → `claude-sonnet-4-6`
- 효과: 1h cache hit 보장 + 모델 비용 절반 → 누적 75%↓
- Backout: dashboard Settings UI 1줄

### `59da71a` feat(design-system): ts-morph 기반 component-props.json 추출 (S2 part 1)
- `design-system/scripts/extract-props.mjs` 신규 (ts-morph)
- `design-system/src/component-props.json` 자동 생성 (37 / 70 컴포넌트, 1163 props)
- `design-system/package.json` ts-morph devDep 추가
- R2 권장 그대로 (react-docgen-typescript 는 styled-components v6 broken)
- 21 케이스는 "no MT*Props type found" (barrel-exported 또는 다른 명명 — 별 슬라이스로 fallback)

### `378b82c` feat(molly plan-emitter): component-props.json inject + props guidance (S2 part 2)
- `molly-plan-emitter.js` systemBlocks 에 component-props 블록 추가
- cache_control 마지막 블록을 components.json → component-props.json 으로 이동
- SYSTEM_PROMPT 가이드 갱신 — required props verbatim 명시
- `readComponentPropsCached` helper (mtime-aware)
- 검증: incident PRD (TS2741 누락 케이스) 에서 `MCFormTextInput.name: string (required)` 정확 추출

### `742c4c5` fix(molly): Slack 경로의 processIntake 에 designSystemRoot 주입
- S2 검증 중 발견: Slack 흐름에서 `emitPlan: designSystemRoot not provided` 로 first-turn auto plan emit fail
- `server.js` startMolly 호출에 `designSystemRoot` / `requestSchemaPath` 추가
- `lib/molly.js` processIntake 호출에 opts.designSystemRoot 전파
- 3 surface (Slack / Playground / Chrome ext) symmetry 회복

### `033f973` feat(molly plan-emitter): plan 응답 schema 에 referenced/unresolved components (S3 Phase A)
- SYSTEM_PROMPT 에 "Component reference tracking" 섹션 추가
- output schema 에 `referenced_components` + `unresolved_components` 필드
- LLM 이 사용한 DS 컴포넌트 + DS 없는 의도 분리 명시
- 검증 통과: 사용자 본인 plan emit 시 `refs=4 unresolved=0` 로그 확인 (Sonnet 4.6 으로 새 schema 자동 채움)

### `59d6dec` fix(dev-script): 3 surface 의 dev script 에 좀비 차단
- `orchestrator/package.json` / `playground-app/package.json` / `dashboard/package.json`
- `trap 'kill 0' EXIT INT TERM` + `lsof -ti :PORT | xargs kill -9` 시작 전 청소
- 부모 shell detach 시 nodemon orphan 누적 차단
- Tier 1 (증상 + 시작 시 청소). 근본은 PM2 / Cloud Run 으로 다음 단계 plan 에서 대체

### `7235da1` docs(plan): Molly 배포 path — 2명 로컬 시범 + GCP 단계적 (2 plan)
- `2026-05-11-local-share-cloudflare-tunnel.md` — 2명 시범 (사용자 + 팀원 1명)
- `2026-05-11-gcp-deploy-phased.md` — Phase 1 MVP / Phase 2 Sandbox / Phase 3 Hardening
- 5명 researcher + Momus 비판 review 통과 (revision)
- Slack bot install 이미 완료 → IT 의존성 5개 중 1개 (GCP project) 만 필요
- 사용자 결정: 2명 시범 다음 주 시작 → 1-2주 후 GCP 전환

### `b03b2b5` docs(plan): DS escalation workflow + Ontology evolution (2 plan, 리서치 기반)
- `2026-05-12-ds-escalation-workflow.md` — DS 없는 컴포넌트 처리 5 슬라이스 (UX / Auto-PR / Metric / Lifecycle / Triage)
- `2026-05-12-ontology-evolution.md` — Lightweight 6 Phase (cross-ref / plan 후처리 / tool_use enum / ... )
- 추가 5명 researcher 결과 종합
- 사용자 지적 반영: Phase 1 = plan emit 후처리 dependency expansion (PRD entity extraction 잘못된 가정)
- 핵심 evidence: tool_use schema enum 가 가장 강한 hallucination 차단 (63% → 1.7%)

---

## 핵심 결정 (사용자 + 리서치)

### S0 / S2 / S3-A 진행 (DS loop v2)
1. ⏸️ S0.3 dashboard 차트 = **실서비스 진입 시** 만든다 (테스트 단계엔 jsonl 직접 확인)
2. ✅ S2 ts-morph 채택 (react-docgen-typescript styled-components v6 broken)
3. ✅ S3 Phase A schema 확장 — 검증 통과

### 배포 path
4. ✅ **2명 시범** 먼저 (5-10명 → 2명 축소 — M1 16GB 한계 안 닿음, SPOF 위험 낮음)
5. ✅ Cloudflare Tunnel + Google SSO 로 다음 주 시범
6. ✅ 1-2주 후 GCP Phase 1 MVP (Cloud Run + IAP + Secret Manager + GCE worker)
7. ✅ Slack bot install 이미 완료 → IT 의존성 1개만 (GCP project)
8. ⏸️ Anthropic API tier upgrade / Compliance review 는 5+명 확장 전에만

### DS escalation
9. ✅ 다음 주 2명 시범 운영 직전 진행 (실제 케이스가 검증)
10. ✅ RFC 는 5-10명 팀에 over-engineering → GitHub Issue + 주 1회 triage
11. ✅ AI 자동 PR 은 "탐지·기록"까지만 — 구현 PR 은 사람
12. ✅ ⓐ closest_match default 강조 (engineer 속도 우선)
13. ✅ ⓒ/ⓓ "초안 보기" 2단계 (Renovate 패턴)
14. ✅ 임계값 3회 (5-10명 팀)

### Ontology
15. ✅ Full RDF/OWL 은 overkill (R1/R2/R3/R4 모두 동의)
16. ✅ Lightweight 6 Phase 단계적 진화
17. ✅ Phase 1 정정 — plan emit 후처리 (사용자 지적: PRD 에 컴포넌트 이름 명시 안 함)
18. ✅ tool_use input_schema enum 이 가장 강한 evidence

---

## Files Changed (이번 세션 합산)

```
M  orchestrator/lib/molly-plan-emitter.js     +50 (S0 ttl + S2 inject + S3 schema)
M  orchestrator/lib/molly.js                  +12 (Slack designSystemRoot fix)
M  orchestrator/server.js                     +12 (startMolly designSystemRoot)
M  orchestrator/state/molly-settings.json     +0 (planModel sonnet, git untracked)
M  orchestrator/package.json                  +1 (좀비 fix)
M  playground-app/package.json                +1 (좀비 fix)
M  dashboard/package.json                     +1 (좀비 fix)
M  design-system/package.json                 +2 (ts-morph + extract-props script)
M  design-system/pnpm-lock.yaml               +N (ts-morph)
A  design-system/scripts/extract-props.mjs    +160
A  design-system/src/component-props.json     +1163 props (auto-generated)
A  docs/superpowers/plans/2026-05-07-molly-ds-loop-v2-research-informed.md  +329
A  docs/superpowers/plans/2026-05-11-local-share-cloudflare-tunnel.md       +291
A  docs/superpowers/plans/2026-05-11-gcp-deploy-phased.md                   +339
A  docs/superpowers/plans/2026-05-12-ds-escalation-workflow.md              +465
A  docs/superpowers/plans/2026-05-12-ontology-evolution.md                  +450
A  docs/superpowers/handoffs/2026-05-12-ds-ecosystem-planning.md            (이 문서)
```

---

## 검증

### 자동 통과
- `node --check` (molly-plan-emitter.js, molly.js, server.js) — 모두 OK
- `jq parse` (3 package.json + components.json + component-props.json) — 모두 OK
- `extract-props.mjs` 실행 — 37 / 70 컴포넌트 추출, 1163 props
- `git status --short` — clean 통과

### 운영 검증 (Slack 시범)
사용자 본인 plan emit 시 로그:
```
[plan-emitter] components.json loaded (mtime=2026-04-13)
[plan-emitter] component-props.json loaded (mtime=2026-05-07)
[plan-emitter] Generated 7 items for client=msm-default route=/
  | refs=4 unresolved=0
  | usage: input=121 output=3086 cache_create=225066 cache_read=0
```

✅ S0 (Sonnet 자동 채움) + S2 (component-props loaded) + S3-A (refs/unresolved) 한 번에 검증

### 수동 검증 (사용자 환경에서 권장)
- 좀비 fix 후 dev 명령 2번 연속 실행 → 둘 다 성공 (`pkill + start`)
- orchestrator 재시작 후 첫 plan emit `cache_create > 0`, 두번째 `cache_read > 0` 확인
- S3 결과 (plan 객체 의 referenced/unresolved) 가 job state 에 저장 안 됨 → DS escalation plan Slice B 에서 해결 예정

---

## Backout

### 단독 revert 안전 — 최근부터
```bash
# DS escalation + Ontology plan 만 제거
git revert b03b2b5

# 배포 plan 만 제거
git revert 7235da1

# 좀비 fix 만 — 3 dev script 원복
git revert 59d6dec

# S3 Phase A schema 만 — referenced/unresolved 필드 LLM 응답에서 사라짐 (caller 가 null 처리해야 안전)
git revert 033f973

# Slack designSystemRoot fix 만 — Slack 경로 plan emit 다시 fail
git revert 742c4c5

# S2 part 2 — component-props.json inject 제거 (caller 무영향)
git revert 378b82c

# S2 part 1 — ts-morph 추출 제거 (S2 part 2 도 같이 revert 권장)
git revert 59da71a

# S0 — cache 5분 + Opus 복귀 (state/molly-settings.json 직접 변경)
git revert a80659f
```

state/molly-settings.json 은 git untracked — runtime UI 에서 1줄로 Opus 복귀 가능.

---

## 알려진 한계 / footguns

### S2 (ts-morph) 한계
- 21 / 70 컴포넌트 가 "no MT*Props type found" — barrel-exported (form/shared/index.ts) 또는 다른 명명 (MCFormSingleRichSelect 등). 추후 fallback 로직 필요
- 평균 props 31.4 — `Omit<ComponentProps<typeof X>, ...>` 가 inherited HTML props 까지 expand. 의도된 동작이지만 토큰 비용 ↑

### S3 plan persistence
- plan-emitter 응답에 referenced/unresolved 들어가지만 **job state 에 저장 안 됨**. plan_items 만 tasks 로 변환. 별 작업 필요 (DS escalation Slice B 에서 처리)

### orchestrator 좀비
- 좀비 fix Tier 1 (증상 청소). 부모 shell detach 시 child orphan 동작 자체는 안 막음. **새 dev 시작 시 청소만 보장**. 근본 fix 는 PM2 / Cloud Run min/max=1 (GCP P1)

### Cloud Run min=1 의 always-on 비용
- Slack Socket Mode 본질적 제약. Sonnet 다운 + 1h cache 로 LLM 비용 더 큰 절감

### S5 (사후 분석) OTel GenAI 는 experimental
- 진입 전 추가 리서치 권장 (Momus 도 지적)

### DS escalation Auto-PR 의 GitHub App private key
- 현재는 .env 임시. GCP P1 진입 시 Secret Manager 로 이전 필수

### Anthropic API rate limit
- 5-20명 동시 plan emit 시 Tier 1 (50 RPM) 초과 가능. `bottleneck` token bucket + 429 backoff 별 작업 필요 (DS escalation 외 별 슬라이스)

---

## 다음 슬라이스 후보 (우선순위 순)

| 우선 | 항목 | 추정 | 효과 |
|------|------|------|------|
| 🥇 | **다음 주 2명 시범 운영 시작** (local Cloudflare Tunnel + Google SSO) | 5-6h 셋업 | 1-2주 사용 데이터 누적 |
| 🥈 | **DS escalation Slice A** (4-옵션 UX, 3 surface) | 1.5-2일 | 사용자 차단 차단 |
| 🥉 | **Ontology Phase 0** (cross-ref 필드 자동 추출) | 0.5일 | 가장 작은 작업, 즉시 가치 |
| 4 | **Ontology Phase 1 정정** (plan 후처리 dependency expansion) | 1일 | dependency 자동 보완 |
| 5 | **Ontology Phase 2** (tool_use enum 강제) | 1일 | hallucination 거의 0 |
| 6 | **DS escalation Slice B** (Auto-PR GitHub App) | 1-1.5일 | DS 요청 자동 누적 |
| 7 | **DS escalation Slice C** (Metric + GovernancePage 시각화) | 1-1.5일 | 우선순위 결정 데이터 |
| 8 | **S2 한계 보강** (21 누락 컴포넌트 fallback) | 0.5일 | DS 커버리지 ↑ |
| 9 | **GCP P1 MVP** (시범 1-2주 후) | 2-4일 (Momus 보정: 5-8일) | 5-20명 확장 base |
| 10 | **DS escalation Slice D/E** (Lifecycle + Triage workflow) | 1일 | governance 정식화 |

---

## How to Start the Next Session

```
이전 세션 핸드오프 읽기:
- docs/superpowers/handoffs/2026-05-12-ds-ecosystem-planning.md (이 문서)
- docs/superpowers/handoffs/2026-05-07-incident-burn-down.md (선행)

main clean. 10 commit 반영. 5 plan 문서 추가.

주요 plan 5개:
1. 2026-05-07-molly-ds-loop-v2-research-informed.md (S3 Phase B-G 남음)
2. 2026-05-11-local-share-cloudflare-tunnel.md (다음 주 시범)
3. 2026-05-11-gcp-deploy-phased.md (1-2주 후)
4. 2026-05-12-ds-escalation-workflow.md (시범 직전 진행)
5. 2026-05-12-ontology-evolution.md (Phase 0-2 시범과 병행)

서비스: orchestrator :3847 / playground-app :4180 / dashboard :4174
재시작: 좀비 fix 적용된 dev script 사용 (trap + lsof kill 자동 청소)

다음 후보 (우선순위 1-3):
- 1순위: 다음 주 2명 시범 운영 시작 (local Cloudflare Tunnel 셋업 5-6h)
- 2순위: DS escalation Slice A (4-옵션 UX) — 시범 운영 차단 차단
- 3순위: Ontology Phase 0 (cross-ref 필드) — 가장 작은 작업
```

---

## 메모리 업데이트 후보

기존:
- `project_molly_ds_loop.md` — S0 완료 → **S0/S2/S3-A 완료, S3 Phase B-G 남음** 으로 업데이트
- `project_molly_deploy.md` — 그대로 (이미 2명 시범 + GCP 결정 반영됨)

신규:
- `project_ds_escalation.md` (옵션) — DS 없는 컴포넌트 처리 흐름 결정
- `project_ontology_evolution.md` (옵션) — Lightweight 6 Phase 결정

저장 결정:
- 사용자가 다음 세션에서 검토 후 결정 (이 handoff 본 후)

---

## 외부 리서치 결과 (총 10명)

### Session 1 (배포 5명, 2026-05-11)
- R1: 로컬 임시 셋업 vs GCP — Cloudflare Tunnel + Google SSO
- R2: GCP Node + Docker 패턴 — Cloud Run nested Docker 불가
- R3: state migration — Postgres > Firestore
- R4: Sandbox 격리 — GKE Autopilot + KEDA
- R5: Multi-tenant SSO + audit — Cloud IAP + RLS + audit log

### Session 2 (Ontology 5명, 2026-05-12)
- R1: DS + ontology 사례 — Anthropic MCP Memory pattern 과 isomorphic
- R2: RDF vs JSON for LLM — Full RDF ROI 음수, tool_use schema 강한 evidence
- R3: Layer 결정 — Layer 2 (JSON-LD) + Layer 3 선택 적용
- R4: KG + RAG — 70 컴포넌트엔 in-memory adjacency 충분
- R5: 마이그레이션 — Wikidata 패턴, JSON 그대로 + build-time RDF

### Session 3 (DS escalation 5명, 2026-05-12)
- R1: production 사례 — Builder.io / Figma / Primer / Carbon / Atlassian / Knapsack
- R2: 4-옵션 UX — Slack Block Kit / Web 카드 / Chrome ext 라디오
- R3: Auto-PR — GitHub App + peter-evans Action + Dependabot 패턴
- R4: DS metrics — 6 metric / 4 시각화 / 임계값 3회
- R5: RFC process — 3-level lightweight + 72h SLA

### Momus 비판 review (2026-05-11)
- "Needs revision" — 시간 30-50% 낙관, 사내 정치 0줄, prod 패턴 누락
- 사용자 후속: Slack bot 이미 설치 / GCP project 만 사내 ping → IT 의존성 5개 → 1개

---

*마지막 업데이트: 2026-05-12 세션 종료 시점. 다음 세션은 2명 시범 운영 시작 또는 DS escalation Slice A 또는 Ontology Phase 0 부터.*
