# Plan — Molly × Design System 루프 v2 (research-informed)

**Date:** 2026-05-07
**Author:** kyungjae.ha (with Claude)
**Predecessor:** `2026-05-07` C commit (`ec542aa`) — components.json 매니페스트 주입
**Branch:** main
**Estimate:** S0 ≈ 0.5d / 전체 ≈ 7-9d (5 슬라이스)

---

## 배경

Molly 가 design system 을 읽고 쓰는 루프를 (1) 더 싸게, (2) 더 정확하게, (3) 사용자/에이전트가 쓰기 쉽게, (4) 새 컴포넌트 발견·사용 0 컴포넌트 식별을 자동화하는 흐름으로 개선. 5 명의 researcher 에이전트로 외부 리서치 (LLM context optimization / props 추출 / DS governance 자동화 / CAI feedback loop / DS-aware AI agents) 후 plan 을 update.

**핵심 변경 (리서치 결과)**:
- ❌ on-demand tool fetch — hallucination/latency 위험. drop
- ✅ **Anthropic 1h TTL prompt cache GA** — `"ttl":"1h"` 명시 시 1시간 hit 보장
- ✅ Sonnet 4.6 으로 plan-emitter 다운 — Opus 대비 비용 절반
- ✅ react-docgen-typescript 비추 (styled-components v6 broken) → **ts-morph 권장**
- ✅ react-scanner + ts-morph + GH Actions 가 governance 자동화 best stack
- ✅ Cursor Composer 2 (2026-03 arxiv) evidence — 옵션 0 (24 잡 수동 분류 먼저) 지지
- ✅ OpenTelemetry GenAI Semantic Conventions — 잡 lineage 표준 emerging
- ✅ Anthropic Memory Tool MCP (`modelcontextprotocol/memory`) GA

---

## 목표 / 비-목표

**목표:**
- plan-emitter 비용 75%↓ (S0 / S1 누적)
- prop hallucination 거의 0 (S2)
- 3 surface (Slack/Playground/Chrome ext) 에 "참조한 컴포넌트" / "DS 없음" UX 통일 (S3)
- 새 컴포넌트 자동 감지 → governance.json PR (S4)
- 사용 0 컴포넌트는 **삭제 안 함, 표시만** — 사후 분석 후 사람이 결정 (S4 / S5)
- design-system-site 의 GovernancePage 확장 — Molly 서포트 + 사람 판단 (S5)
- 잡 lineage 자동 수집 → 24 잡 사후 분석 → 원칙 도출 데이터 기반 (S5)

**비-목표:**
- RAG (벡터 DB) — 70 컴포넌트 규모에서 over-engineering
- 컴포넌트 자동 삭제 — 사용 0 도 보존, 표시만
- Backstage / Bit.dev / Knapsack — over-engineering 또는 SaaS 비용
- Cursor 식 real-time RL — 자체 인프라 비현실적

---

## 슬라이스 요약 (의존성 + 추천 순서)

```
[S0] Quick wins (1h TTL + Sonnet 다운) ─┐
                                        ├─→ 운영 1주 측정
[S1] Read 효율화 (compact + enum 강제) ─┤    ↓
                                        │   회귀 없으면 S1 후순위 가능
[S2] ts-morph props 매니페스트 ─────────┴─→ [S3] UX 폴리시
                                                    │
                          [S4] react-scanner + governance auto-PR (표시만, 삭제 X)
                                                    │
                          [S5] OTel + Memory MCP + Batch eval + GovernancePage 확장
                                                    │
                          24 잡 사후 분석 → 원칙 도출 (Molly 서포트 + 사람 판단)
```

| # | 슬라이스 | 추정 | 효과 |
|---|---------|------|------|
| S0 | 1h TTL + Sonnet 다운 + 메트릭 surface | 0.5d | 비용 75%↓ 즉시 |
| S1 | Compact manifest + constrained tool_choice (enum) | 1d | 토큰 80%↓ + hallucination 원천 차단 (옵션) |
| S2 | ts-morph props 매니페스트 | 1d | prop hallucination 거의 0 |
| S3 | UX 폴리시 (referenced/unresolved + remapping + Chrome ext step 3+4) | 1.5d | 사용자 surface + missing-component 처리 |
| S4 | react-scanner + governance auto-PR (표시만) | 1.5d | DS 자기 갱신 (사람 승인) |
| S5 | OTel + Memory MCP + Batch eval + GovernancePage 사후분석 | 2-3d | 24 잡 분류 자동화 + 원칙 도출 |

---

## S0 — Quick wins (이번 commit)

### Task S0.1 — molly-plan-emitter.js cache_control TTL 1h 명시

**파일:** `orchestrator/lib/molly-plan-emitter.js:139`

```js
// 변경 전
cache_control: { type: 'ephemeral' },

// 변경 후
cache_control: { type: 'ephemeral', ttl: '1h' },
```

**근거 (R1 리서치)**: Anthropic 이 2026-03 경 기본 TTL 을 5분 → 1시간 보낸 변경 후 5분으로 되돌림. 명시적 `"ttl":"1h"` 미지정 시 5분 TTL 적용. 1h cache write 비용은 2.0× (5분은 1.25×) 이지만 hit 가 1시간 보장 → plan 호출 빈도 1시간 N회면 N-1 회 hit 로 절감.

**Trade-off**: 첫 호출 비용 ~60% ↑ ($0.69 → $1.10, Opus). 그러나 두번째 hit 부터 동일 ($0.055). 운영 빈도가 1시간 1회 미만이면 5분 유지가 유리 — 운영 1주 후 측정해서 결정.

### Task S0.2 — planModel Opus → Sonnet 다운

**파일:** `orchestrator/state/molly-settings.json`

```json
// 변경 전
"planModel": "claude-opus-4-7",

// 변경 후
"planModel": "claude-sonnet-4-6",
```

`prdModel` 은 Opus 유지 (PRD 분석은 plan emit 보다 더 reasoning-heavy).

**근거 (R1)**: Sonnet 4.6 = Opus 대비 입력 1/3 가격. plan-emitter 는 components.json 카탈로그에서 컴포넌트 선택 + 의도 표현이 주 역할로 Sonnet 충분 가능성 높음. 다만 정확도 회귀 risk 있어 **운영 1주 verification_failed 비율 측정 필수**.

**Backout**: dashboard Settings UI 에서 1줄 변경으로 Opus 복귀.

### Task S0.3 — dashboard MollyMetrics 에 cache 메트릭 surface

**파일:** `dashboard/src/pages/MollyMetricsPage.tsx`

이미 `molly-metrics.js` 가 `cache_create / cache_read / verification_failed` 카운터 수집 중. 페이지에 시계열 차트 추가:
- cache hit ratio (cache_read / (cache_create + cache_read))
- verification_failed rate (per day)
- planModel breakdown

**Backout**: 차트 컴포넌트 revert.

### S0 검증

**자동:**
- `pnpm tsc --noEmit` (orchestrator + dashboard) — exit 0
- 첫 plan 호출 → 두번째 호출의 `cache_read_input_tokens > 0` 로그 확인
- `state/molly-settings.json` 의 planModel 값 확인

**수동:**
1. orchestrator 재시작 → 같은 PRD 두 번 호출 → `cache_create=N` → `cache_read=N` 동일값 확인
2. dashboard MollyMetrics 페이지에서 cache hit 비율 시계열 보임
3. incident PRD ("TVING 메인 페이지에 디자인시스템 컴포넌트 데모 섹션 추가") 한 번 더 — Sonnet 으로도 진짜 컴포넌트만 참조하는 plan 나오는지 확인

**운영 1주 후 측정:**
- cache_create vs cache_read 비율 — 1h TTL 효율 정량화
- verification_failed 비율 — Sonnet 다운 후 회귀 없는지
- 호출 빈도 — 1시간 1회 미만이면 5분 TTL 복귀 검토

---

## S1 — Compact manifest + constrained tool_choice (이후)

**근거 (R1, R5)**: full inject 458KB → compact ~10-20KB. plan-emitter LLM 호출에 `tool_choice: {type: 'tool', name: 'select_components'}` + `input_schema.components.items.enum: ['MCFormTextInput', ...]` 강제 → hallucinated 컴포넌트 이름 원천 차단. v0.dev / Lovable 의 "구조화된 compact inject" 변형.

**Task:**
- `design-system/scripts/generate-compact-manifest.mjs` — per-component `{name, category, importStatement, shortDescription, when_to_use[0], status}` 추출 → `dist/components.compact.json` (~30KB)
- plan-emitter 의 inject: full → compact 로 변경 (default)
- `select_components` tool 추가 (input_schema enum 으로 컴포넌트 이름 강제)
- LLM 응답에 `selected_components` array 받음 → 두 번째 패스에서 그 컴포넌트의 full spec 만 inject (옵션, S2 의 props 포함하면 더 좋음)

**비용**: full inject 대비 토큰 80%↓. enum schema 자체가 ~1-3K 토큰 추가지만 충분히 절감.

**조건부 진행**: S0 측정 후 Sonnet+1h 만으로 비용 충분히 낮으면 S1 후순위 / drop 가능.

---

## S2 — ts-morph props 매니페스트

**근거 (R2)**: react-docgen-typescript 는 styled-components v6 에서 props inference broken (issue #3813). ts-morph 100-150줄 스크립트로 MT*Props interface 이름 패턴 직접 쿼리 + generic/forwardRef/transient 처리, 70 컴포넌트 ~5초.

**Task:**
- `design-system/scripts/extract-props.mjs` (ts-morph 기반)
- 출력: `design-system/src/component-props.json`
- pre-commit hook + governance audit cron 두 곳에서 갱신
- plan-emitter SYSTEM_PROMPT 가이드 갱신 — "props 정확도는 D 책임" → "component-props.json 의 required props 는 plan 에 명시"
- D (typecheck verify) 는 안전망으로 유지

**검증**: 1d68d67a incident PRD 5종 회귀 케이스 → verification_failed = 0 확인.

---

## S3 — UX 폴리시 (3 surface 통일)

### S3.1 — `referencedComponents` / `unresolvedComponents` 분리

plan-emitter 응답에 추가:
```json
{
  "referencedComponents": [{"name": "MCFormTextInput", "importStatement": "...", "status": "active"}],
  "unresolvedComponents": [{"intent": "data table with grouped rows", "closestMatch": "MCTable", "reason": "no MCDataTable in DS"}]
}
```

### S3.2 — 3 surface 에서 surface

- **Slack**: plan blocks 에 컴포넌트 칩 + "DS 없음" 항목 강조
- **Playground JobCard**: 컴포넌트 배지 + design-system-site deep-link
- **Chrome ext sidepanel**: 동일 + Phase 2 Step 3+4 마무리 (task buttons / QA pass / Promote)

### S3.3 — graceful degradation UX (Builder.io 패턴)

`unresolvedComponents` 가 있으면 사용자에게:
- "이 요소는 DS에 없어 커스텀으로 생성합니다 — OK?"
- 옵션: ⓐ 그대로 진행, ⓑ closestMatch 사용, ⓒ 다른 컴포넌트로 수동 매핑

이 결정은 잡 메타데이터로 보존 → S5 사후분석 데이터.

### S3.4 — `report_missing_component` tool

LLM 이 `report_missing_component(intent, closest_match)` tool 호출 시 → `state/molly-missing-components.jsonl` append. governance watch_list 후보로 흐름 (S4 연결).

---

## S4 — react-scanner + governance auto-PR (사용 0 표시만, 삭제 X)

**사용자 결정 반영**: 사용 0 컴포넌트는 **삭제 안 함, 표시만**. 사후 분석 후 사람이 결정.

**Task:**
- `design-system/scripts/scan-usage.mjs` — react-scanner 로 codebase import 통계 → `dist/components-usage.json`
- `design-system/scripts/diff-governance.mjs` — components-usage.json vs governance.json 비교:
  - count = 0 → governance.json `removal_queue` 에 자동 추가 (사람 승인 PR)
  - components.json 에 없는 새 컴포넌트 → `promotion_queue` 후보 PR
  - state/molly-missing-components.jsonl 누적 → `watch_list` 후보 PR
- GitHub Actions cron — weekly `gh pr create` 자동
- **삭제는 사람이 PR merge 시에만**. 자동 삭제 X

**라벨**: `governance-auto`, 리뷰어: DS 팀 + 사용자.

---

## S5 — OTel + Memory MCP + GovernancePage 사후분석 (옵션 B 변형)

**사용자 결정 반영**:
- 사후 분석 페이지 = `design-system-site`의 기존 `GovernancePage` 확장 (새 페이지 X)
- Molly 서포트 + 사람 판단 (옵션 B)

### S5.1 — OTel GenAI spans 도입

**근거 (R4)**: OpenTelemetry GenAI Semantic Conventions (2025 emerging). 잡 lineage 자동 추적 표준.

`gen_ai.operation.name` (`emit_plan`, `decompose`, `verify_typecheck`, `agent_review`) + `trace_id` + `span_id` 를 Molly 잡 실행에 부착. JSON 으로 `state/molly-traces/{jobId}.json` 저장.

### S5.2 — Anthropic Memory Tool MCP

**근거 (R4)**: Memory Tool GA, MCP `modelcontextprotocol/memory`. file-based jsonl 대신 entities/relations 그래프.

`.molly/memory/` MCP 서버 구동. decomposer / plan-emitter 가 "최근 자주 실패한 패턴" 을 그래프 쿼리로 가져오게.

### S5.3 — Batch API + DeepEval G-Eval (사후 분석 자동화)

**근거 (R4)**: Batch API 50% + cache 90% = 95% 절감. binary judge (good/bad) + 3-point scale 가 1-10 보다 일관성 높음.

cron — 매일 야간:
- 오늘 완료 잡들의 trace 수집
- Batch API 로 LLM judge 호출 (`prompt: "이 잡의 plan 이 PRD 를 충실히 반영했는가? good/partial/bad"`)
- 결과 → `state/molly-eval-results.jsonl` append

### S5.4 — design-system-site GovernancePage 확장

**파일:** `design-system-site/src/pages/GovernancePage.tsx`

기존 GovernancePage 에 다음 섹션 추가:

1. **컴포넌트 사용 현황** (S4 의 components-usage.json)
   - 사용 0 컴포넌트 리스트 + 마지막 import 시점
   - 사용 빈도 top 20 (그래프)
   - 신규 후보 (governance.json watch_list 와 promotion_queue)

2. **Molly 사후 분석** (S5.3 의 eval-results.jsonl)
   - 최근 24 잡 trace + judge 결과 표
   - 실패 원인 카테고리 (verification_failed / scope_creep / wrong_component / ...)
   - 각 잡의 referenced/unresolved components (S3.1 데이터)

3. **사용자 액션**
   - 사용 0 컴포넌트별 [유지] [deprecation 후보] [수동 검토 필요] 라벨링
   - Molly 의 "이 컴포넌트는 X 잡에서 unresolved 로 X번 보고됨" 서포트 정보 표시
   - 라벨링 결과 → governance.json PR

### S5.5 — 24 잡 사후 분류 워크플로우

옵션 B (사용자 결정):
1. Molly 가 24 잡 trace 를 자동 분류 (Batch API / G-Eval)
2. 결과를 GovernancePage 의 "사후 분석" 섹션에 표시
3. **사람이 spot-check** (10% 무작위 + Molly 가 confidence 낮은 케이스)
4. 라벨링 결과 → 원칙 5-7개 도출 (수동, decomposer/plan-emitter prompt 자동 주입)

---

## 위험 / footguns

| Risk | Mitigation |
|------|-----------|
| Sonnet 4.6 다운으로 plan 정확도 회귀 | 운영 1주 verification_failed 비율 + plan accept rate 측정. 회귀 시 settings 1줄로 Opus 복귀 |
| 1h TTL 의 첫 호출 비용 60%↑ — 호출 빈도 낮으면 손해 | 운영 빈도 측정 후 5분 복귀 검토. metrics 시계열로 결정 |
| ts-morph TypeScript 7+ Go 전환 시 API 변경 | issue #1621 모니터링. 1년 lead time |
| react-scanner 가 dynamic import 못 잡음 | ts-morph 보완 스크립트 (re-export 체인 추적) |
| OTel GenAI semantic conventions experimental | stability 태그 확인 후 도입. 일부만 우선 |
| Memory Tool MCP staleness | TTL / pruning 정책 명시 (옵션 B 의 사람 spot-check 가 상시 검증) |
| 사용 0 자동 삭제 위험 | **plan 에서 명시 — 자동 삭제 X. PR merge 만 사람 승인** |
| GovernancePage 확장이 design-system-site 의 다른 페이지 깨뜨림 | 별도 commit, design-system-site 빌드 단독 검증 |

---

## 완료 기준 (S0)

- [x] cache_control 에 `ttl: '1h'` 명시 (molly-plan-emitter.js)
- [x] state/molly-settings.json 의 planModel = `claude-sonnet-4-6`
- [ ] dashboard MollyMetrics 에 cache hit ratio + verification_failed rate 시계열 (S0.3)
- [ ] orchestrator 재시작 후 첫 plan 호출 → 두 번째 호출 cache_read_input_tokens > 0 확인
- [ ] 운영 1주 측정 시작 — verification_failed 비율 / 호출 빈도

S1-S5 의 DoD 는 각 슬라이스 plan 문서로 분리 (이후 작성).

---

## 작업 순서 (S0)

1. ✅ Task S0.1 — molly-plan-emitter.js cache_control ttl 1h
2. ✅ Task S0.2 — molly-settings.json planModel sonnet
3. Task S0.3 — dashboard MollyMetrics 차트 추가 (별 commit)
4. 검증 (자동 + 수동)
5. 핸드오프 문서

S0.1 + S0.2 가 한 commit (5줄 변경). S0.3 별 commit. 핸드오프는 운영 1주 측정 결과 포함.

---

## References

**리서치 결과 (이 plan 의 근거):**
- R1: LLM context optimization — Anthropic prompt caching, tool-use vs RAG, v0/Lovable 패턴
- R2: React props extraction — ts-morph vs react-docgen-typescript (styled-components v6 broken)
- R3: DS governance automation — react-scanner + ts-morph + GH Actions stack
- R4: CAI / feedback loop — Cursor Composer 2 (arxiv 2603.24477), Memory Tool GA, Batch API + cache 95% 절감
- R5: DS-aware AI agents — Figma MCP + Storybook MCP de facto, Builder.io 시맨틱 매핑

**선행 plan / handoff:**
- `2026-05-07-plan-emitter-design-system-manifest.md` (C — components.json 주입)
- `2026-05-07-incident-burn-down.md` (D — typecheck verify + C)
- `2026-04-30-molly-feedback-loop.md` (Constitutional AI 1순위 권장)
- `2026-04-30-feedback-loop-decision-framework.md` (옵션 0 권장 — EDD 함정 경고)
