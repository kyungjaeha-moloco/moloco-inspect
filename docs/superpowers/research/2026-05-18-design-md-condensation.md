# DESIGN.md condensation & Foundation pattern

**Date range:** 2026-05-17 ~ 2026-05-18
**Author:** kyungjae.ha (with Claude session)
**Tracking plan:** `docs/superpowers/plans/2026-05-17-open-codesign-inspired-six-tracks-v2.md` Track 1 + S3 + foundation order
**Status:** shipped (3 commits: `fddf2ec`, `cdbd2c8`, `5e16f28`)
**Audience:** future-me / new teammates joining the DS knowledge layer work

> 본 문서는 DESIGN.md 작업의 **rationale + measurements + references** 를 한곳에 정리합니다. 미팅 자료가 아닙니다. 인용 가능한 numbers / decisions / trade-offs 모음.

---

## 1. 왜 이걸 했나 (motivation)

### 1.1 발견된 문제
- Molly의 plan-emitter는 매 호출마다 `components.json` (~500KB) 전체를 system block에 직렬화해 LLM에 전송.
- Anthropic Sonnet 4.6 cache_control 1h 부착에도 불구하고 5일간 11회 호출 중 절반 이상이 **cold start** — 호출 간 평균 11시간 간격 → ttl 1h 만료 잦음.
- 호출당 cache_create 평균 114K, 토큰 비용 호출당 약 $0.7 (Sonnet $3/MTok creation rate).

### 1.2 트리거된 경로
- 2026-05-16 사용자가 Chrome ext에서 region 캡처 + chat 입력 → Molly가 화면을 못 보고 되묻기 → Lane 2 (screenshot → LLM) 작업 → 그 과정에서 plan-emitter 흐름을 깊이 살펴봄 → 인접 비용 문제 발견.
- 사용자가 Open CoDesign (OpenCoworkAI/open-codesign) 레포 공유 → 6 track plan v2 작성 → momus 2회 리뷰 → 우선순위 🥇 Track 1 (DESIGN.md 응축) 결정.

---

## 2. 리서치 — 다른 시스템들은 어떻게 했나

리서치 출처 4건의 종합. **결론은 "wrapper 패턴은 어디에도 없음, foundation/always-on Layer 0 패턴이 일반"**.

### 2.1 Google Stitch DESIGN.md spec
- 6개 표준 섹션: Brand Identity, Color, Typography, Spacing, Component Guidelines, Do's and Don'ts
- "Be specific" / "Explain intent" / "Cover edge cases" / "Clean formatting" / "Version control 처럼 다루기" 원칙
- **단독 markdown 한 파일** — 다른 JSON contract 없음
- 출처: https://www.mindstudio.ai/blog/what-is-design-md-google-stitch

### 2.2 awesome-design-md (VoltAgent 컬렉션)
- 9개 표준 섹션: Visual Theme, Color Palette & Roles, Typography Rules, Component Stylings, Layout Principles, Depth & Elevation, Do's and Don'ts, Responsive Behavior, Agent Prompt Guide
- 73개 enterprise 브랜드의 DESIGN.md 모음 — 모두 **단독 파일**
- 출처: https://github.com/voltagent/awesome-design-md

### 2.3 Open CoDesign (AGENTS.md)
- "DESIGN.md follows the Google spec, can be both input and output"
- **Living document** — "preserve or repair, update as tokens emerge"
- "Brand values are data, not model memory"
- 출처: https://github.com/OpenCoworkAI/open-codesign/blob/main/AGENTS.md

### 2.4 Anthropic Claude Code memory docs
- **200 lines / 25KB 미만 권장** — adherence ↓ 방지
- Layered context architecture: Layer 0 CLAUDE.md always loaded ~800 tokens / Layer 1 CONTEXT.md on entry / Layer 2 stage CONTEXT.md per-task / Layer 3 reference selectively
- Markdown headers + bullets
- 구체성 ("Use 2-space indentation" > "Format properly")
- 출처: https://code.claude.com/docs/en/memory

### 2.5 2026 일반 best practices (검색 결과)
- **Progressive disclosure**: foundations (spacing/color/typography/radius) always-on, 나머지 on-demand
- Format strategy: JSON for component APIs/props (MCP), Markdown for instructions/rules
- "Preventing drift": closed token layer + automated auditing
- 출처: 다수 (UX Collective, Addy Osmani, IntoDesignSystems, Dev Genius)

### 2.6 핵심 발견
- **"Wrapper" 패턴 어디에도 없음.** 사용자 직관이 정당했지만 일반적이지 않음.
- **"Layer 0 / always-on foundation"이 정답.** CLAUDE.md + progressive disclosure 모두 이 패턴.
- 우리는 multi-file contract가 있는 특수 케이스 — Open CoDesign / Google Stitch의 "DESIGN.md 단독" 패턴과 다름. 그래서 **DESIGN.md = foundation + 다른 contract = derived slim view** 라는 hybrid 결정.

---

## 3. 무엇을 만들었나

### 3.1 새 파일: `design-system/src/DESIGN.md`
- 11.2KB / 207줄 (Anthropic 200-line 권장 살짝 초과, 25KB 한도 안)
- Markdown 표준 섹션:
  - **Brand Identity & Authority** — "Precise, trustworthy, dense data-display admin UI for ad operations" + authority hierarchy 5단계 (tokens.json > components.json > component-props.json > patterns.json > DESIGN.md self-reference)
  - **Meta** — 패키지 root, import alias, Tving primary client, tier 4단계 (Core / Composite / Domain / Internal)
  - **16 categories quick index** — name + 1줄 desc + 컴포넌트 list (총 112개)
  - **Design tokens summary** — color 네이밍 syntax, typography, spacing, elevation, radius, responsive
  - **Do's and Don'ts** — 8 do + 8 don't (구체적 anti-pattern)
  - **Component lookup workflow** — 카테고리 → 풀 catalog → unresolved_components 3단계 fallback
  - **Cross-references** — patterns / api-contracts / pm-sa-request-schema / component-props 위치

### 3.2 코드 변경 — `orchestrator/lib/molly-plan-emitter.js`
- 새 함수 `readDesignMdCached(filePath)` — mtime-aware cache, DESIGN.md 로딩
- 새 함수 `buildComponentsIndex(full)` — 풀 components.json에서 `{ name, importStatement, functional_category, status }` 만 추출. 컴포넌트 112개 → 22.8KB
- 새 함수 `buildComponentPropsSlim(full)` — per-component meta (path, sourceTypeName, sourceTypeKind, description) 제거 + ` | undefined` strip. 197KB → 100KB
- `SYSTEM_PROMPT` 수정:
  - "Read DESIGN.md first" framing directive 추가
  - components.json 언급 → DESIGN.md + components-index 언급
  - `when_to_use` / `do_not_use` / `antiPatterns` 는 system block에 **없음** 명시 + closest_match / unresolved_components fallback 흐름 안내
- `systemBlocks` 배열 재구성 (foundation order):
  ```js
  [
    SYSTEM_PROMPT,
    DESIGN.md,                       // Foundation (Layer 0)
    pm-sa-request-schema,
    patterns.json,
    api-ui-contracts.json,
    components-index.json,            // slim
    component-props.json (cache_control ttl 1h)  // slim
  ]
  ```

### 3.3 다이어그램 — `docs/images/ds-knowledge-layer.{mmd,svg,png}`
- 이전: Knowledge → Molly 단일 화살
- 이후: Knowledge → **★ Foundation (DESIGN.md)** + **Slim Contracts** 두 노드 분리
- Foundation은 "read first" 라벨, Slim은 "derived contracts" 라벨로 Molly에 흐름
- Site / Gov / MCP는 Knowledge에 직접 (full contract 접근)

### 3.4 영향 받은 다른 코드
- 없음 (다른 LLM caller — prd-analyzer, classifier, chat 등 — system block 구조 다름. 별 작업).
- Lane 2 (screenshot → LLM image content block) 와 같은 PR 묶음 — plan-emitter는 image block과 condensation 둘 다 다룸.

---

## 4. 측정 결과

### 4.1 Baseline (n=11 historical, 2026-05-06~12)
- 출처: `orchestrator/state/molly-metrics-2026-05-{06,07,11,12}.ndjson`
- 평균/중앙값:
  | 메트릭 | avg | median | min | max |
  |--------|-----|--------|-----|-----|
  | input_tokens (non-cached) | 178 | 170 | 121 | 285 |
  | cache_creation_input_tokens | **114,612** | 71,259 | 0 | 225,066 |
  | cache_read_input_tokens | 80,624 | **0** | 0 | 224,972 |
  | output_tokens | 2,826 | 2,468 | 1,216 | 5,346 |
  | latency_ms | 45,576 | 44,734 | 18,787 | 86,976 |
- 관찰: 절반 이상이 cold start (5분/1h ttl 만료) → 응축 효과는 cache_create에서 가장 큼

### 4.2 Paired smoke (2 PRDs, 2026-05-17)
- 같은 2 PRD로 응축 전 / 후 paired:
  - "예약형 주문 리스트의 보관 옆에 삭제 탭을 만들고 삭제된 주문들을 모아서 보여줘" (Tving OMS)
  - "TAS sidebar에 BETA 라벨을 추가해줘" (msm-default)
- 결과:
  | | 응축 전 | T1 (DESIGN.md + components-index) | T1+S3 (+ slim props) | Foundation order (2026-05-18) |
  |---|---|---|---|---|
  | system block tokens (cold) | **237,078** | 121,851 | **112,338** | **112,399** |
  | reduction vs 응축 전 | — | −48.6% | **−52.6%** | −52.6% |
  | latency (Smoke 1) | 100.0s | 91.7s | 90.8s | 78–97s |
  | latency (Smoke 2) | 82.5s | 74.2s | 65.2s | 65–82s |
  | plan items (Smoke 1) | 5 | 6 | 5 | 7 |
  | referenced_components (Smoke 1) | 5 | 5 (same) | 7 (more) | 6 |
  | unresolved_components (Smoke 1) | 0 | 1 (more careful) | 1 | 1 |
  | hallucination | 0 | 0 (MCBetaTag verified) | 0 | 0 |

### 4.3 H1 임계값 사후 조정
- 원안 −80% → 현실 −70% → 실측 후 **−50%** (Plan v2 patch 2026-05-17)
- −80% 도달은 patterns.json / api-ui-contracts.json 도 응축해야 가능 — 그건 grounding 핵심이라 위험 큼. 별 Track으로 분리.

### 4.4 비용 임팩트
- 응축 전 cold start: cache_create 237K × $3/MTok = ~$0.71
- 응축 후 cold start: cache_create 112K × $3/MTok = ~$0.34
- **호출당 약 $0.35 절감**
- 호출 100건/day 가정 → 월 ~$1,050 절감

---

## 5. Trade-off & 결정

### 5.1 Wrapper vs Foundation (사용자 직관 검증)
- 사용자 직관: "DESIGN.md가 다른 contract를 wrap (감싸기)"
- 리서치 결과: **어디에도 없는 패턴**. Open CoDesign / Stitch / VoltAgent는 DESIGN.md 단독, CLAUDE.md는 Layer 0 / always-on foundation.
- 결정: **Foundation 패턴 채택** — DESIGN.md를 systemBlocks[1] 위치로 이동 + SYSTEM_PROMPT에 "Read DESIGN.md first" framing.
- 다이어그램에서는 "wrapper subgraph" 대신 "★ Foundation 별 표시" + "Knowledge → Foundation + Slim → Molly" 두 갈래 흐름으로 시각화.

### 5.2 응축 정책 — S1/S4 (공격적) vs S3 (균형) vs S2 (안전)
- S1/S4 (required props 풀 + optional names만): 추가 −18%p (T1 → −75%) 가능. **위험**: optional props type 정보 손실 → typecheck pass rate 회귀 위험.
- S3 (meta 제거 + type cleanup + `| undefined` strip): 추가 −4%p (T1 → −52.6%). **위험 낮음**: 모든 prop type 보존.
- S2 (description 제거만): 추가 −2%p. 변화 적음.
- **결정: S3** — type 정보 보존으로 typecheck 안전망 무관, 그러나 H1 −70% 임계값 도달 못 함 → 임계값 −50%로 재조정.

### 5.3 cache_control 위치
- 현재: 마지막 block (component-props.json) 에 `ephemeral ttl 1h` 부착 → 그 앞 prefix 전체가 cache
- 대안: DESIGN.md 에 부착 → DESIGN.md prefix만 cache (다른 blocks는 매번 다시)
- 결정: 현재 위치 유지 — prefix 전체 cache가 비용 절감 max. DESIGN.md 자체 mtime이 자주 안 바뀌어서 cache invalidation 위험 낮음.

### 5.4 components.json 풀 catalog 유지 여부
- DS site / governance console / MCP server는 풀 catalog (when_to_use / antiPatterns 등 포함) 필요 — **유지**
- plan-emitter만 slim view 사용 — **derived view**

### 5.5 Living document 정책
- DESIGN.md 자체에 "agent가 새 token 발견 시 PR로 update" 명시
- 실제 자동 update 흐름은 아직 없음 — future work (Track 4 design skills 또는 ontology Phase 2 연계 가능성)

---

## 6. 한 줄 비유 (설명용)

> **"비행기 짐"** — 이전: 매번 500KB 카탈로그 통째로 비행기에 싣고 감 (237K 토큰). 지금: 안내 책자 (DESIGN.md 11KB) + 책 목록 (components-index 22KB) + 슬림 작가별 페이지 (component-props 100KB) 만 들고 감 (112K 토큰). 짐 무게 절반.

또는 도서관 비유:
> **"풀 contract = 도서관 전체 / DESIGN.md = 도서관 안내 책자 + 권위 규칙 / Slim = 책 인덱스 + 핵심 정보 카드"** — 모든 책을 가지고 다닐 필요 없음. 핵심만 들고 가고, 디테일 필요하면 풀 catalog로 lookup.

---

## 7. 위험 / 미해결

| 항목 | severity | 대응 |
|------|---------|------|
| typecheck pass rate baseline 절대값 미측정 | medium | paired delta로 검증 (T1.3 측정). 절대값은 Track 4 (skills) 시점에 함께 측정. |
| `when_to_use` / `do_not_use` / `antiPatterns` 손실로 plan 품질 회귀 | medium | Smoke test에서 referenced_components 5→7 더 풍부, unresolved 1 추가 — 부정적 영향 안 보임. n=2 small sample. |
| Living document 자동 update 부재 | low | 현재 사람이 수동으로 DESIGN.md update. 자동화는 future work. |
| DESIGN.md를 누가 유지? | medium | 디자인 팀이 작성, governance console에서 anomaly 알림 — 다만 DESIGN.md anomaly 검출은 아직 미구현. |
| n=2 smoke test 일반화 한계 | medium | T1.3 측정 단계에서 n≥10으로 확장 권장 (Plan v2 §6 측정 표). |

---

## 8. 후속 작업

- **Track 1.6 (별 Track)**: patterns.json + api-ui-contracts.json도 응축 검토 — H1 −70% 달성 가능. 위험: grounding 핵심.
- **Track 4 (Plan v2 §3.4)**: Design skills 모듈화 — DESIGN.md를 skill 단위로 더 쪼개기. T4.0 기획 sub-plan 먼저.
- **Track 6 (audit log)**: tool_use 가시화 — DESIGN.md authority hierarchy 검증 데이터 확보.
- **Ontology Phase 2 cross-link**: DESIGN.md의 "Brand values are data" 원칙이 ontology evolution과 자연 결합. 별 plan 필요.

---

## 9. 인용 가능한 numbers

| Fact | Number |
|------|--------|
| components.json 풀 사이즈 | ~500KB |
| DESIGN.md 사이즈 | 11.2KB / 207줄 |
| components-index 사이즈 | 22.8KB / 112 entries |
| component-props.json 응축 전 | 197.6KB |
| component-props.json 응축 후 | 100.8KB (S3 시뮬레이션) / 측정 105KB |
| system block 응축 전 cold | 237K tokens |
| system block 응축 후 cold | 112K tokens |
| Reduction | **−52.6%** |
| Cost saving per cold start | ~$0.35 (Sonnet $3/MTok) |
| Plan 품질 (referenced_components Smoke 1) | 5 → 7 (richer) |
| Plan 품질 (unresolved Smoke 1) | 0 → 1 (escalation more careful) |
| Latency Smoke 1 | 100s → 78–97s |
| Latency Smoke 2 | 82s → 65–82s |
| Hallucination | 0 |

---

## 10. 관련 파일

- 작성한 코드:
  - `design-system/src/DESIGN.md` — new
  - `orchestrator/lib/molly-plan-emitter.js` — systemBlocks reorder + builders + SYSTEM_PROMPT
  - `scripts/smoke-plan-emitter.mjs` — paired measurement harness
- 작성한 plan / research:
  - `docs/superpowers/plans/2026-05-16-open-codesign-inspired-six-tracks.md` (v1, DEPRECATED)
  - `docs/superpowers/plans/2026-05-17-open-codesign-inspired-six-tracks-v2.md` (v2)
  - `docs/superpowers/research/2026-05-17-plan-emitter-baseline.md` (baseline)
  - `docs/superpowers/research/2026-05-18-design-md-condensation.md` (본 문서)
- 갱신된 overview:
  - `docs/2026-05-13-inspect-overview.md` §3 + §4 + mermaid
  - `docs/2026-05-13-inspect-overview-ko.md` §3 + §4 + mermaid
  - `docs/images/ds-knowledge-layer.{mmd,svg,png}`
  - `docs/2026-05-13-inspect-overview-ds-knowledge.png`
- 관련 commits:
  - `7ebe162` feat(chrome-ext): widen inspectable URLs + capture preview lightbox
  - `fddf2ec` feat(plan-emitter): screenshot input + condensed system block (-52.6% tokens)
  - `cdbd2c8` docs(superpowers): plans + baseline research for screenshot/DS work
  - `5e16f28` refactor(plan-emitter): place DESIGN.md as Layer 0 foundation + overview docs

---

*문서 작성: 2026-05-18 Claude session. Open CoDesign 영감 + 4 리서치 출처 + paired smoke 측정 결과를 한곳에 정리.*
