# Plan — Plan-emitter user-facing item titles (forbidden jargon rule)

**Date:** 2026-05-19
**Author:** kyungjae.ha (with Claude session)
**Status:** draft v2 — momus 1차 리뷰 반영 (B1 cache topology, M1 paired stats, M2 rubric, M3 decomposer verif, m1 count band, m2 KR/EN, m3 V0 scope)
**Trigger:** 2026-05-19 13:56 사용자 피드백: "슬렉에 플랜들이 단계별로 자세히 보기 버튼이 활성화 되는데 너무 길어서 그런걸까? 사용자가 개발적인 내용과 소스 위치 같은걸 알아야 할 필요가 있을까?"
**Parent:** 2026-05-13~19 screenshot/context fix thread

---

## 1. 문제 진술

`plan-emitter`가 발사하는 plan card의 **item 제목/요약이 엔지니어 용어 노출** ("Add 'Deleted' tab to MCCreativeReviewContainer", "Create MCDeletedCreativeReviewListContainer sub-container") + **본문은 import 문, 파일 경로, prop 이름** 등 dev detail 가득.

Slack은 mixed audience (PM/디자이너/개발자). 비개발자에겐 첫 페이지부터 overwhelming하고 의미 없음. "자세히 보기"로 접혀 있어 시각적으론 줄지만 **요약만 봐도 product behavior가 안 보여** 핵심 가치 전달 실패.

비교: `job-decomposer.js:32-33` SYSTEM_PROMPT는 이미 "Forbidden jargon" 룰 보유:
> route, scaffold, placeholder, fetching, mock, in-memory, wrapper, embed, MVP, API, hook, state, props, prop, scope, refactor, z-index, focus trap, render, component, DOM, ref. Avoid English code/library names too (useQuery, useState, etc.).

→ Plan-emitter는 이 룰 미적용. 일관성 결여.

---

## 2. 목표 / 비목표

### 2.1 목표
- **G1** — plan card 의 item *title/summary* 는 user-facing product behavior로 (어떤 결과가 보일지)
- **G2** — item *body (자세히 보기)* 는 dev detail OK — 개발자가 plan 검증 시 file path / import / prop 명세 확인 가능
- **G3** — fddf2ec 의 -52.6% cache 측정 회귀 없음 (paired ratio drop ≤ 10pp)
- **G4** — Decomposer 단계 작업 (decomposer가 dev task 생성) 에 영향 없음 — plan-emitter 출력 → decomposer 입력 contract 보존

### 2.2 비목표
- ~~plan-emitter 출력의 모든 dev detail 제거~~ — Item 6 같은 type definition은 본문에 살릴 만함, 제거 시 dev verification 어려워짐
- ~~한국어 강제 localization~~ — 영어 / 한국어는 client/language에 따라 모델이 결정. system prompt는 "user-facing" 만 지시.
- ~~Decomposer의 forbidden jargon rule 수정~~ — 이미 잘 작동, 건드리지 않음
- ~~item 개수 캡 (예: 최대 5)~~ — 별 plan. 분해 깊이는 PRD 복잡도에 따라
- ~~plan-emitter prompt re-architecture~~ — diff 최소

---

## 3. 영향 받는 코드/기능

### 3.1 변경 inventory (1 파일)

1. **`orchestrator/lib/molly-plan-emitter.js`** — `SYSTEM_PROMPT`:
   - "Item title" 섹션 추가: "User-facing product behavior only. The reader is a PM / designer / dev — they should understand the outcome without knowing component/file/hook names."
   - **"Forbidden jargon in titles" 룰 (momus M2 — verbatim rubric)**:
     - 항목 1: PascalCase or camelCase identifier (예: `MCCreativeReviewContainer`, `MCBarTabs`, `MCI18nTable`, `MCStack`, `MCIcon`, `useSearchParams`, `useCreatives`, `getCreativeImageRenderer` 등)
     - 항목 2: file path (`src/`, `.tsx`, `.ts`, `.json` 확장자)
     - 항목 3: import statement (`import { X } from 'Y'`)
     - 항목 4: prop/hook keyword (`hook`, `state`, `props`, `prop`, `useState`, `useEffect`, `route`, `render`, `component`, `DOM`, `ref`, `z-index`)
     - 항목 5: code library name (`useQuery`, `useState`, `tRPC` 등)
   - "Item description (body)" 섹션 — 위 항목들 OK (자세히 보기에 표시되는 dev detail). 즉 룰은 *title only*.
   - "Language" 섹션 — 기존 "in English" 룰 수정: "Match the input PRD's primary language. Korean PRD → Korean title; English PRD → English title. Description language follows the same rule."
   - 예시 추가 (영어 + 한국어 paired):
     - ❌ "Add 'Deleted' tab to MCCreativeReviewContainer"
     - ✅ "Creative Review 페이지에 'Deleted' 탭 추가" (KR PRD) / "Add a 'Deleted' tab to the Creative Review page" (EN PRD)
     - ❌ "Create MCDeletedCreativeReviewListContainer sub-container"
     - ✅ "삭제된 소재 목록을 가져오는 데이터 영역 만들기" (KR PRD) / "Wire up data fetching for deleted creatives" (EN PRD)

### 3.2 metric 확장

`plan-emitter`의 `recordEvent('lib_call', ...)` 에는 이미 `cache_create`/`cache_read` 있음 (verified earlier in this session). 추가 필요 없음.

---

## 4. 설계 결정 (Q&A)

### Q1 — title 룰만 적용 vs body까지

- (a) **title/summary만 user-facing, body는 dev detail 살림** ← 제안
- (b) body까지 user-facing — 자세히 보기에서도 dev detail 안 보임
- (c) body 따로 두 필드 (`title_user_facing`, `description_dev`) — schema 변경 필요

**제안: (a).** 자세히 보기는 발견 시점에서 명시적으로 클릭한 사용자가 dev detail을 보고 싶어할 때만 노출. 개발자가 plan 승인 전 verification 가능.

### Q2 — language 선택 (한국어 vs 영어) — momus m2 모순 해결

**현재 모순:** plan-emitter SYSTEM_PROMPT line 24가 *"Title and description in English"* 강제 (verified). plan v1의 예시는 한국어 title 제안 ("Creative Review 페이지에 'Deleted' 탭 추가"). 직접 충돌.

**선택지:**
- (a) 기존 룰 유지 — title/description 영어. plan v1 한국어 예시는 폐기, "Creative Review page에 'Deleted' 탭 추가" 같은 영문 패턴만.
- (b) 룰 확장 — input PRD 언어와 일치. PRD가 한국어면 title 한국어, 영어면 영어. ctx.language 활용.
- (c) Bilingual — title 영어 + (parenthetical KR copy). 가독성 ↓.

**제안: (b).** 사용자 PRD 언어와 일치. F2 fix로 ctx.client/ctx.language 들어옴 — 모델이 활용. SYSTEM_PROMPT 언어 룰 수정 (영어 강제 → "Match the input PRD language"). 이건 별 변경이지만 본 plan과 묶음 (이 plan이 title을 user-facing으로 바꾸므로 language도 함께 사용자 친화로).

### Q3 — Item 6 "Add prop type definition" 같은 dev-only task는?

- Item 자체가 dev internal — 사용자에게 의미 없음
- 옵션:
  - (a) plan-emitter가 item으로 분리 안 함 — 다른 item 본문에 흡수
  - (b) item으로 두되 title은 user-facing 못 만들면 "(internal — type setup)" 같은 명시
  - (c) 그대로 두기, decomposer가 처리

**제안: (a)** SYSTEM_PROMPT에 "Each item must produce a user-observable change. Internal type/schema setup is a sub-step of the item that triggers it, not its own item." 강제. 즉 plan은 "what the user sees" 단위.

### Q4 — Cache regression 위험 (momus B1 재설계)

**Cache 토폴로지 재확인** (momus B1):
- `molly-plan-emitter.js` 의 systemBlocks 순서 (확인 필요, 통상): `[0]=SYSTEM_PROMPT, [1]=DESIGN.md (Foundation), [2]=schema/patterns/contracts, [3]=components-index, [4]=component-props (cache_control marker 위치)`.
- `cache_control: ephemeral` 는 *prefix-up-to-and-including-marked-block* 까지 caching. → block[0] (SYSTEM_PROMPT) 의 어떤 byte 변경도 downstream 전 block prefix hash 무효화.
- 따라서 SYSTEM_PROMPT **append든 prepend든 동일** — 전체 cache_create로 떨어짐 (1회).
- 다만 변경 *후 두 번째 호출부터* 새 prefix가 cache 되면 다시 hit. Cold→warm 한 번만 비용.

**선택지 (B1 해결):**
- (a) **One-time cold hit 수용** + post-warmup paired 측정 — V2에서 priming call N≥2 후 측정 시작
- (b) **룰을 SYSTEM_PROMPT 아닌 다른 위치로** — user message preamble 또는 cache_control marker 뒤 block. cache 손실 없음. 단 instruction 가시성 ↓ (system 보다 user 영향력 약함)
- (c) **하이브리드** — 짧은 trigger phrase만 SYSTEM_PROMPT 끝, 상세 룰 + 예시는 user message preamble

**제안: (a) + (c)의 부분 결합.**
- SYSTEM_PROMPT 끝에 1-line trigger ("Item titles must be user-facing per the forbidden-jargon list below.") + 핵심 forbidden token 5-10개 (verbatim, 짧게)
- 상세 예시 (한국어/영어 each)는 user message preamble (cache-safe, request마다 새로 들어가지만 토큰 비용 미미)
- 게이트는 (a) — V2에서 priming N≥2 후 paired 측정. cache_create 1회 비용은 수용 (5분 TTL 내 N+1번째 호출부터 다시 hit).

**측정 명세 (B1 게이트 재정의):**
- V2 진행: 각 PRD 호출 전 priming pass (warm-up) 1회 → 측정 pass (paired before/after)
- "Post-warmup paired ratio" 정의: `(after_cache_read / (after_cache_read + after_cache_create)) − (before_cache_read / (before_cache_read + before_cache_create))` per-PRD
- Pass gate: **median per-PRD drop ≥ −10pp AND no individual PRD drop > −20pp** (momus M1 명시)
- 절대 비율 (aggregate) 단독 사용 금지

### Q5 — Backward compatibility

- 기존 plan들 (decomposer 입력으로 들어간) 호환성?
- plan-emitter 출력 schema (plan_items[].title, plan_items[].description) 는 그대로
- 변경되는 건 *내용 스타일* 만
- decomposer는 plan_items[].description (dev detail) 읽음 — body 살리는 한 깨지지 않음

**제안:** schema 미변경, 내용만 변경.

---

## 5. 슬라이스

### Slice V0 — SYSTEM_PROMPT 현재 위치 확인 + 토큰 추정 *(15min, informational only — momus m3)*

- `orchestrator/lib/molly-plan-emitter.js`의 SYSTEM_PROMPT 라인 범위 확인 (현재 line 22-101 ≈ 6KB)
- 토큰 사이즈 추정 (1 token ≈ 4 chars english, 1.5-2 chars Korean) → ~1500 tokens 예상
- 추가 ~200-300 토큰 (rubric + 예시) 후 총량 → ~1700-1800 tokens
- **목적: sizing 정보 / 의사결정 보조용** (예: 추가 분량이 systemBlocks size 한계 안에 있는지). 게이트 결정에는 사용하지 않음 — 실측은 V2의 cache metrics 기반.

### Slice V1 — SYSTEM_PROMPT 규칙 추가 (드래프트) *(20-30min)*

- Title 룰 + Body 룰 + 2-3 예시 (영어 + 한국어 mix)
- 변경 후 syntax check
- 정적 검토 — 룰이 decomposer의 "Forbidden jargon" 과 충돌 없는지

### Slice V2 — paired smoke (5 케이스) *(1.5-2h)*

- Before 측정: 현 시점에서 동일 PRD 5개 → plan-emitter 출력 저장 (JSON 그대로)
- After 측정 (priming-aware, momus B1):
  - SYSTEM_PROMPT 변경 deploy 후 첫 호출 1회 (priming, cache_create 1회 흡수)
  - 그 다음 동일 PRD 5개 → plan-emitter 출력 + metrics 저장
- 비교 항목:
  - **Title 채점 (momus M2 rubric — verbatim, automated)**: §3.1의 5개 항목 중 하나라도 매치 시 fail. 자동 regex 검사:
    - 항목 1 매치: `/\b(MC|use)[A-Z][a-zA-Z]+/` 또는 `/\bget[A-Z][a-zA-Z]+/`
    - 항목 2 매치: `/(\.tsx|\.ts|\.json|src\/)/`
    - 항목 3 매치: `/import\s+/`
    - 항목 4: 단어 목록 grep — hook/state/props/prop/route/render/component/DOM/ref/z-index/useState/useEffect
    - 항목 5: useQuery/tRPC 등
  - **Pass 기준**: 5/5 PRD 모두 titles 검사 통과. 4/5는 부분 통과 → V4 룰 정제
  - **Body 검증**: file path 또는 import 또는 component 이름 1개 이상 존재 (dev detail 보존 확인)
  - **Cache (momus M1)**: per-PRD paired delta `(after_cache_read_ratio − before_cache_read_ratio)`. Pass: median ≥ −10pp AND no individual PRD < −20pp
  - **Decomposer 파이프라인 (momus M3)**: 5 PRD 중 1개 (오늘 케이스) full 파이프라인 실행:
    - plan-emitter 출력 → decomposer 입력
    - decomposer 정상 task 생성하는가 (tasks ≥ 3) — body 보존이 contract 깨지지 않는지 검증
    - first task의 file/component refs가 plan-emitter body에서 유래하는지 확인
- PRD 5개:
  - 오늘 케이스 (creative review deleted tab) — **이 케이스로 decomposer pipeline 검증** (M3)
  - 캠페인 리스트 필터 추가
  - Creative Detail status dropdown
  - Audience export 버튼
  - Ad Group column visibility

### Slice V3 — Gate 평가 + 진행 결정 *(15min)*

- **통과 (둘 다 충족):**
  - Title: 5/5 PRD가 §3.1 rubric (항목 1-5) 자동 검사 통과 — 어떤 PRD든 1개라도 forbidden token 매치 시 fail
  - Cache: per-PRD paired delta median ≥ −10pp AND no individual PRD < −20pp
  - Body 보존: 5/5 PRD에서 dev detail (file path 또는 import 또는 component 이름 ≥1) 잔존
  - Decomposer 파이프라인 (오늘 케이스 1개): tasks ≥ 3 + file refs 보존
- **부분 통과**: title 4/5 통과 + cache OK → 룰 정제 (V4)
- **부분 통과**: title 5/5 + cache median ≥ −10pp 하지만 1개 PRD가 < −20pp → 그 PRD case 분석 후 룰 위치 조정 (V4 우회)
- **Cache 회귀**: per-PRD median < −10pp → revert + body/user-message 우회 (V4)
- **Decomposer 파이프라인 fail**: tasks < 3 OR refs 누락 → revert (G4 위반)

### Slice V4 (조건부) — 룰 정제 / 우회 *(1h)*

- V3 결과 따라:
  - Title 룰 강화 (예시 추가)
  - 또는 system prompt 대신 user message 첫 줄에 룰 prepend (cache-safe)

---

## 6. 검증

### 6.1 기능 검증 (V2 paired smoke)
- [ ] Title에 component/file/hook/import 이름 미포함 (5/5)
- [ ] Body에 file path / component import / hook 이름 등 dev detail 보존
- [ ] Title language가 PRD 언어와 일치 (Tving KR PRD → KR title)
- [ ] 분해 깊이 변화 within **±2** (momus m1: absorption(Q3-a)으로 dev-only item 흡수 시 1-2개 줄어드는 게 의도된 동작이므로 ±1는 too tight). 단 ≥3 감소 시 작업 누락 의심 → V4 재검토
- [ ] decomposer 입력으로 들어가 정상 동작

### 6.2 회귀 측정 (V3 게이트, momus M1 paired-per-PRD)
- [ ] per-PRD paired delta `(after_ratio − before_ratio)` median ≥ −10pp
- [ ] per-PRD paired delta no individual PRD < −20pp
- [ ] priming pass N≥2 후 측정 (B1: cold-hit 1회 흡수)
- [ ] paired 5-run `input_tokens` 평균 변화 ≤ +5%
- [ ] paired 5-run latency P50 변화 ≤ +10%

### 6.3 manual UX 검토
- [ ] PM 시각: 첫 페이지 (요약) 보고 무엇이 만들어질지 이해 가능
- [ ] Dev 시각: 자세히 보기 후 file path / import 확인하고 plan 검증 가능

---

## 7. 리스크 / 미해결

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Cache 회귀 (fddf2ec -52.6% 무효화 가능성) | **high** | V3 게이트 + V4 우회 |
| 모델이 룰 무시하고 title에 component 이름 계속 노출 | medium | V2 manual reviewer 채점, fail 시 V4 룰 강화 |
| 한국어 title 품질 부족 (모델이 KR translation 어색) | medium | V2 spot-check, fail 시 예시 추가 |
| dev이 plan 검증 시 file path 없으면 잘못된 plan 통과 가능 | medium | Body 보존 강제 (V2 검증 항목) |
| Item 6 같은 dev-internal item 흡수 결과 plan 크기 줄어 → 작업 누락 | medium | V2 paired에서 분해 깊이 변화 ±2 이내 + ≥3 감소 시 V4 재검토 |
| plan-emitter 변경이 chrome-ext / playground 까지 영향 (surface-agnostic) | low | 의도된 효과. surface별 별 처리 안 함 |

**미해결 (defer):**
- 카드 본문 줄임/펼침 UX 자체 (Slack expand-on-click) — Slack native 기능, 우리 코드 변경 X
- Slack `자세히 보기` 자동 펼침 옵션 — Slack 측 제약
- 한국어 외 다른 locale (일본어, 베트남어 등) 지원

---

## 8. 추정

| Slice | 추정 |
|-------|------|
| V0 SYSTEM_PROMPT 토큰 측정 | 15min |
| V1 룰 + 예시 추가 | 20-30min |
| V2 paired smoke (5 cases) | 1-1.5h |
| V3 게이트 평가 | 15min |
| **합계 (V4 제외)** | **~2-2.5h** |
| V4 (조건부) 룰 정제 또는 우회 | +1h |

---

## 9. 검토 후 진행 순서

1. v1 plan momus 리뷰 (progress-messages plan과 묶어 1회 momus)
2. Plan 승인 → V0 → V1 → V2 → V3 분기 결정
3. Cache 회귀 시 V4 우회 → 그래도 fail이면 revert

---

## 10. 메모리/핸드오프 업데이트 영향

- 새 핸드오프 (V3 완료 후) — title/body 분리 결과 + cache 측정 + paired sample 5개 출력
- `project_canvas_app.md` — plan card UX 개선 이슈 닫힘 표시

---

*Plan 작성: 2026-05-19 Claude session. 13:56 user-reported "사용자가 개발적인 내용과 소스 위치를 알아야 할 필요가 있을까?" 피드백에서 직접 trigger.*
