# Plan — Open CoDesign-inspired 6 tracks

**Date:** 2026-05-16
**Author:** kyungjae.ha (with Claude session)
**Status:** ⚠️ **DEPRECATED 2026-05-17** — momus 리뷰에서 5 blocker + 6 high 받음. 후속 v2: `docs/superpowers/plans/2026-05-17-open-codesign-inspired-six-tracks-v2.md` 참조
**Source inspiration:** [OpenCoworkAI/open-codesign](https://github.com/OpenCoworkAI/open-codesign) (Electron-based BYOK Claude Design alternative, Agentic Design v0.2.0)
**Why now:** Open CoDesign의 6개 디자인 결정이 우리 Playground / Molly / DS site에 다음 단계로 자연스럽게 들어맞음. 사용자 1~6 다 적용 의향. 단, #3/#4/#6은 변형 반영.

---

## 0. 사용자 합의 변형 (2026-05-16)

| Track | 원래 Open CoDesign 패턴 | 사용자 합의 변형 |
|-------|------------------------|------------------|
| 3 | 컬러/폰트 슬라이더 (parameter tweaks) | **컴포넌트 variant 비교 패널** — 사용성 비슷한 컴포넌트 side-by-side, 구조적 UI/UX 비교 |
| 4 | 12개 design skill 모듈 | **기획 단계 먼저** (separate sub-plan) → 합의 후 실행 |
| 6 | UI 권한 다이얼로그 (interrupt) | **회고적 audit log** — interrupt X, 사용자가 사후 파악 |

---

## 1. Track 매트릭스

| # | Track | 핵심 가치 | 우리 현 상태 | 의존성 |
|---|-------|----------|------------|--------|
| 1 | **DESIGN.md 응축본** | plan-emitter system block 비용 ↓, cache 안정성 ↑ | `components.json` (~458KB) + `component-props.json` 매번 전체 직렬화 (cache 1h ttl) | independent |
| 2 | **Region-targeted edit** | patch scope 좁힘 → typecheck/review pass rate ↑ | selectionRect 페이로드 도달 + (Lane 2로) 이미지 LLM 전달 | Lane 2 ✅ |
| 3 | **Component variant 비교** | 컴포넌트 선택 정확도 ↑, "이거 vs 저거" UI 의사결정 빠름 | DS site에 단일 컴포넌트 view만. functional_category 메타는 있음 (Ontology Phase 0 ✅) | Ontology Phase 0 ✅ |
| 4 | **Design skills 모듈화 (기획)** | grounding 정확도 ↑, 토큰 절약, 사용자별 customization 가능 | SYSTEM_PROMPT (~3KB) 한 덩어리 | — (기획 산출물 의존) |
| 5 | **JSONL workspace session** | "왜 이렇게 됐지" 디버깅 + 시간여행 UX | git branch + state JSON 있음 (절반). 사용자 노출 부족 | independent |
| 6 | **Tool-use audit log** | 신뢰성 ↑, "agent가 뭐 했지" 사후 파악 | sandbox tool calls은 SDK 안에서 일어남. 추적 없음 | Ontology Phase 2 시너지 |

---

## 2. 우선순위 (실행 순서 제안)

| 순위 | Track | 이유 | 추정 |
|------|-------|------|------|
| 🥇 1 | **Track 2 (region-targeted edit)** | Lane 2 작업의 자연 후속. selectionRect 이미 페이로드에 있어 prompt 한 줄 + plan-emitter logic 추가로 시작 가능 | 1-2d |
| 🥈 2 | **Track 1 (DESIGN.md 응축)** | 비용 즉시 측정 가능. cache_creation 비용 큰 폭 감소 가설. n=1+ 측정으로 generalize | 1-1.5d |
| 🥉 3 | **Track 6 (audit log — 회고적)** | 짧고 부작용 적음. 사용자 신뢰도 즉시 ↑. Ontology Phase 2와 합치면 더 자연스러움 | 0.5-1d |
| 4 | **Track 5 (JSONL session)** | git이 절반 해결. 시간여행 UI는 디버깅에 강력 | 1-1.5d |
| 5 | **Track 4 (skills 기획)** | 기획 sub-plan부터. 합의 후 실행 | 기획 0.5d + 실행 2-3d |
| 6 | **Track 3 (component 비교 패널)** | 새 UI 화면 추가, DS site 확장. 우선순위 ↓는 큰 변경이라 마지막 | 2-4d |

**총 추정**: 8-13d (sequential), **parallel 가능 페어**: (1↔2), (5↔6) — 파일 disjoint.

---

## 3. Track 상세

---

### Track 1 — DESIGN.md 응축본 *(🥈)*

**현재 문제:**
- `orchestrator/lib/molly-plan-emitter.js:160-182` — components.json (~458KB) + component-props.json 전체를 system block에 직렬화
- cache_control 1h ttl 부착되지만 첫 호출 + 1h 만료마다 `cache_creation_input_tokens` ~150K
- design-system 파일 변경마다 cache 무효화 (mtime-aware 캐시는 있지만 cache_creation 비용 ↑)

**아이디어:**
- 새 파일 `design-system/src/DESIGN.md` (5-15KB) — 응축본
  - 컴포넌트 카테고리 / 핵심 사용 가이드 / 디자인 원칙 / 색-spacing 토큰 요약
  - components.json의 functional_category + status + 일부 핵심 컴포넌트 lookup 가능
- plan-emitter system block은 DESIGN.md만 prefix로 inject. components.json은 별도 옵션 — "필요 시 grep" 도구로 빼거나 plan-emitter가 referenced_components 후처리 시 read.
- 옵션 A: 완전 대체 (components.json system block 제거)
- 옵션 B: 단계적 — DESIGN.md만 system에, components.json은 referenced_components에 등장한 항목만 detail 추가

**슬라이스:**
- **T1.1** — `design-system/src/DESIGN.md` 작성 + 검증 *(2-3h)*
  - 기존 components.json 분석 → 카테고리별 요약
  - 디자인 원칙 (visual_constraints 의 영어판)
  - 핵심 토큰 표
  - 사용자 + designer 1차 리뷰
- **T1.2** — plan-emitter system block 옵션 B 적용 *(2h)*
  - system blocks 재구성: DESIGN.md + patterns.json + api-ui-contracts.json + 요약된 components index (이름 + category + status만)
  - components.json 전체 직렬화 제거 또는 옵션화 (`includeFullComponentsJson` flag)
- **T1.3** — A/B 측정 *(2h)*
  - 동일 PRD 5건에 대해 (full vs DESIGN.md) plan emit
  - 비교 지표: `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `referenced_components 정확도`, latency
- **T1.4** — referenced_components fallback path *(2-3h)*
  - plan-emitter가 referenced_components 항목을 봤을 때 해당 항목만 components.json에서 hot-load + 다음 step (decomposer / coder) 에 첨부
  - 위험: hallucinated component name → fallback에서 missing → unresolved_components로 자동 escalate (이미 있는 흐름 사용)

**리스크:**
- DESIGN.md 응축으로 grounding accuracy ↓ → typecheck pass rate ↓ → review 비용 ↑
- 측정 후 옵션 A vs B 결정

---

### Track 2 — Region-targeted edit *(🥇)*

**현재 상태:**
- Chrome ext의 region 캡처 → `selectionRect` (좌표) + `selectionScreenshotDataUrl` (이미지) 페이로드 도달 ✅
- Lane 2로 plan-emitter / prd-analyzer 가 image 받음 ✅
- 빠진 것: **모델에게 "이 region만 건드려" 라는 명시적 grounding instruction**

**아이디어:**
- selectionRect 가 있으면 plan-emitter 의 user prompt 마지막에 추가:
  ```
  ## Selection scope (user-specified)
  The user has selected a rectangular region of the page.
  - Coordinates: { x, y, w, h } in viewport pixels
  - Visual reference: see the attached image
  - **Constraint**: limit changes to this region whenever possible. Plan items that target areas outside this region MUST justify why in the description.
  ```
- 측정: selection 있을 때 plan_items 중 "out-of-scope" 비율, 사용자 만족도 spot-check
- Phase 1 확장: coder adapter에도 "edit scope = selection" 메타 전달 (별 plan)

**슬라이스:**
- **T2.1** — plan-emitter user prompt에 selection scope 블록 *(1h)*
  - `emitPlan` args에 `selectionRect` 도입 (또는 ctx)
  - selectionRect 있으면 user prompt 끝에 scope 블록 append
- **T2.2** — server.js `/api/intake` 가 selectionRect → ctx 흘려보냄 *(30min)*
  - 이미 `payload.selectionRect`가 페이로드에 들어있음 (sidepanel.js:4696, 1.3에서 추가)
  - ctx에 `selectionRect` 추가 (attachment 옆에)
- **T2.3** — 측정 *(2-3h)*
  - 같은 캡처에 대해 (selectionRect 포함 vs 미포함) plan 비교
  - n=5 케이스 spot-check + plan_items 의 scope 적합도 평가
- **T2.4** *(optional, Phase 2)* — coder adapter에 selection scope hint 전달
  - 별도 슬라이스. 우선순위 측정 결과에 따라.

**리스크:**
- selectionRect만으로는 어떤 *컴포넌트*를 가리키는지 불명. 이미 selectedElements (component/file/line) 가 페이로드에 있어서 보완 가능.
- "region 안에 시각적으로 보이지만 코드는 멀리 있는" 컴포넌트는 자동 매핑 어려움. coder adapter가 따로 grep해야.

---

### Track 3 — Component variant 비교 패널 *(우선순위 6)*

**사용자 의도 (2026-05-16):**
> "컴포넌트들간에 비슷한 사용성을 가진걸 비교하거나, 구조적으로 비교가 필요한 UI/UX가 있다면 트윅 패널로 비교하면 좋을것 같아."

**현 상태:**
- `design-system-site` 의 컴포넌트 페이지는 단일 컴포넌트 view
- `components.json` 에 `functional_category` 필드 있음 (Ontology Phase 0 결과)
- usage_stats / closest_match / referenced 등 메타 풍부

**아이디어:**
- DS site에 새 view: `/compare/:category` 또는 `/compare?ids=A,B,C`
  - functional_category 같은 컴포넌트들 (예: Button 계열, Input 계열, Table 계열) side-by-side
  - 각 컴포넌트의 anatomy / props / a11y 표 / usage_stats / 예시 미리보기 grid
  - "구조 비교 모드": props 차이 highlight, anatomy 차이 표시
- Molly가 unresolved_components 의 closest_match를 제시할 때 사용자가 "compare with X" 버튼 클릭 → 이 패널로 진입

**슬라이스 (개요):**
- **T3.1** — 비교 API + URL *(0.5d)*
- **T3.2** — Side-by-side grid view (컴포넌트 카드 + 미리보기) *(1d)*
- **T3.3** — Props/anatomy diff highlight *(0.5-1d)*
- **T3.4** — Molly closest_match → compare deep-link *(0.5d)*

**리스크:**
- 컴포넌트 카드를 어떻게 미리보기 — DS site는 static. 컴포넌트 실 렌더링은 별도 wrapper 필요
- 비교는 정량적 (props diff) + 정성적 (anatomy 차이) 둘 다 → UI 복잡도 ↑

---

### Track 4 — Design skills 모듈화 (기획부터) *(우선순위 5)*

**사용자 의도 (2026-05-16):** "기획을 먼저하고 진행하자"

**기획 sub-plan 산출물 (T4.0):**
1. 현재 SYSTEM_PROMPT의 규칙을 카테고리로 분류
2. Open CoDesign의 12 skill 목록 분석
3. 우리 case에 맞는 skill 목록 (잠정):
   - typography
   - layout (grid / spacing)
   - color (tokens / themes)
   - accessibility
   - state (loading / error / empty)
   - i18n (KR / EN copy)
   - data display (table / list / chart)
   - form (input / validation)
   - navigation (nav / breadcrumb / tabs)
   - feedback (toast / dialog / banner)
4. skill 활성화 trigger — 자동 (intent 기반) vs 사용자 선택 vs 둘 다
5. skill 파일 포맷 — Markdown? JSON? hybrid?
6. system block 어디에 끼울지 — DESIGN.md 옆? base SYSTEM 뒤?
7. 기존 visual_constraints / grounding rules 와 매핑

**기획 산출물 산출 위치:** `docs/superpowers/plans/2026-05-??-design-skills-modular.md` (T4.0 완료 후)

**T4.0 추정:** 0.5d (기획 + 사용자 합의)
**T4.1+ 실행 추정:** 2-3d (skill 작성 + system 변경 + 측정)

---

### Track 5 — JSONL workspace session + 시간여행 *(우선순위 4)*

**현 상태:**
- Playground = git branch + `orchestrator/state/{playgroundId}.json`
- checkedOutSha 메커니즘으로 일부 시간여행 가능 (server.js:1219, 4067)
- dashboard에 일부 event log 있지만 사용자가 "Y 시점으로 돌아가서 다시 plan" 흐름은 어려움

**아이디어:**
- 각 playground에 `state/playgrounds/{id}/history.jsonl` 누적 (한 줄 = 한 이벤트)
  - 이벤트 타입: `prd_text`, `plan_emit`, `plan_approve`, `coder_run`, `coder_diff`, `review_pass / fail`, `qa_screenshot`, ...
- dashboard 또는 Playground side에 "history" 탭:
  - 시간순 카드 리스트
  - 각 카드에 "이 시점으로 돌아가기" 버튼 → checkedOutSha + state JSON 복원
- JSONL 다운로드 가능 (디버깅 / 보고)

**슬라이스:**
- **T5.1** — jsonl writer (한 함수) + 기존 event 5종 통합 *(2-3h)*
- **T5.2** — dashboard "History" 탭 (시간순 카드) *(3-4h)*
- **T5.3** — 시점 복원 (revert to commit + state cherry-pick) — 위험 ↑ → 옵션화 *(2-3h)*
- **T5.4** — JSONL download endpoint *(30min)*

**리스크:**
- JSONL 크기 — 1 playground 당 수십 MB 가능 (특히 coder run / review screenshots). retention 정책 필요
- 시점 복원은 git 안전성 검증 필요. 우선 read-only 시간여행만 제공

---

### Track 6 — Tool-use audit log (회고적) *(🥉)*

**사용자 의도 (2026-05-16):** "물어보는건 지금 우리 UX에서는 적절하지 않고, 기록으로 남겨서 사용자가 파악할 수 있게만"

**현 상태:**
- coder는 sandbox 안에서 OpenCode SDK 경유 → tool_use가 일어남
- 외부에서는 diff와 일부 progress event만 노출
- "어떤 도구를 어떤 순서로 썼는지" 가시화 없음

**아이디어:**
- coder adapter가 tool_use 이벤트를 fetch (SDK가 streaming 시 provide)
- 각 tool_use 를 jsonl에 append (Track 5와 자연 통합)
- dashboard / playground 사이드에 "Tool log" 패널:
  - read / write / edit / bash / grep / find / ls 등 도구별 색상
  - 시간순 + 파일별 그룹화
  - 클릭하면 해당 도구 호출의 input / output (truncated)

**슬라이스:**
- **T6.1** — coder adapter에서 tool_use 이벤트 추출 *(2-3h)*
- **T6.2** — jsonl appender 통합 (Track 5와 같은 파일) *(1h)*
- **T6.3** — "Tool log" UI 패널 *(2-3h)*

**의존성:** Ontology Phase 2 (tool_use enum) 와 합치면 더 자연스러움 → 사전 합의:
- 어디서 enum 정의? `orchestrator/lib/tool-use-schema.json` 같은 곳
- 합치는 시점에 Ontology Phase 2 plan 업데이트

**리스크:**
- coder SDK가 streaming tool_use 이벤트를 stable하게 제공하는지 확인 필요
- 너무 verbose하면 사용자가 안 봄 → UI에서 그룹화 / 필터 필수
- 보안: tool_use의 input/output에 PII / secret 들어갈 가능성. redact 필요

---

## 4. 의존성 그래프

```
Lane 2 (Phase 1, 완료) ──┐
                         ├─→ Track 2 (region-targeted) ──┐
                         └─→ Track 6 (audit log)  ──────┤
                                                         ├─→ Track 3 (compare panel, optional re-use)
Ontology Phase 0 (완료) ─→ Track 3 (compare)  ─────────┘

Track 1 (DESIGN.md) ─────────────────── (independent)
Track 4 (skills planning + execution) ── (independent)
Track 5 (JSONL session) ─────── (independent, but Track 6은 통합 권장)

Ontology Phase 2 (예정) ◄── Track 6 시너지
```

---

## 5. 측정 / 검증 (track별)

| Track | 핵심 측정 |
|-------|----------|
| 1 | `input_tokens` / `cache_creation_input_tokens` before/after, referenced_components 정확도 spot-check (≥5건) |
| 2 | plan_items 중 selection 외 영역 비율 before/after (≥5건) |
| 3 | 컴포넌트 선택 confidence (Molly closest_match accuracy + user manual override 비율) |
| 4 | skill 활성화/비활성화 별 typecheck pass rate, 토큰 비용 |
| 5 | 시간여행 사용 빈도, 디버깅 평균 시간 단축 |
| 6 | tool_use 패널 클릭률, 사용자가 "agent 행동 이해도" self-report |

---

## 6. 리스크 / 미해결

| 항목 | severity | 대응 |
|------|---------|------|
| Track 1: DESIGN.md 응축으로 typecheck pass rate ↓ | high | T1.3 A/B 측정에서 -10%p 이하 유지 임계값 |
| Track 2: selectionRect만으로 컴포넌트 식별 한계 | medium | selectedElements 메타 + screenshot image 같이 사용 |
| Track 3: DS site 미리보기 인프라 부재 | medium | Phase 1은 정적 표 비교만, dynamic preview는 Phase 2 |
| Track 4: skill 모듈화 후 plan 품질 회귀 | medium | 기획 sub-plan에서 측정 기준 사전 합의 |
| Track 5: JSONL 디스크 폭증 | medium | retention 30-90일 + size cap |
| Track 6: tool_use 페이로드의 PII / secret | high | redact whitelist + raw payload 미저장 |

---

## 7. 다음 액션 (제안)

1. **이 plan momus 리뷰** (background)
2. 사용자 합의 후 우선순위 (🥇 Track 2 → 🥈 Track 1 → 🥉 Track 6) 순서로 실행
3. Track 4 기획 (T4.0) 은 다른 track 진행과 병렬로 사이사이에 진행 가능 (0.5d 짜리)
4. Track 3 (compare panel) 은 마지막 — DS site 작업이 큼

---

*Plan 작성: 2026-05-16. Open CoDesign 영감 + 사용자 합의 변형 (#3/#4/#6) 반영. Lane 2 (screenshot → LLM) 완료 후 자연 후속.*
