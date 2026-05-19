# Plan — Slack Progress Message Progression (Lane 2 UX follow-up)

**Date:** 2026-05-19
**Author:** kyungjae.ha (with Claude session)
**Status:** draft v2 — momus 1차 리뷰 반영 (M1 line drift, m1 ambig path, m2 cold-cache, m3 observability)
**Trigger:** 2026-05-19 13:54 사용자가 Slack에서 `@molly 크리에이티브 리뷰 페이지에 삭제된 소재를 보여줄수 있도록 탭을 만들어줘` 요청 후, "🤔 One moment…" 만 보고 72초 동안 무반응 → "멈춘 것 같다" 라고 보고. 실제로는 plan-emitter (~72s) 가 정상 동작 중이었지만 UX 신호 부재.
**Parent:** 2026-05-13~19 screenshot/context fix thread (`docs/superpowers/handoffs/2026-05-19-screenshot-condensation-foundation-mcp.md`)

---

## 1. 문제 진술

Slack에서 molly가 `code_change` 분류 → `clarity=clear` → plan-emitter 호출 (60-90s) → plan card 발사 사이의 **60-90초 동안 단 1개의 메시지 ("🤔 One moment…")** 만 노출. 사용자는 "동작 중인지 멈춘 건지" 알 길 없음.

비교: Chrome ext / Playground는 자체 thinking indicator + 단계별 UI 변화로 사용자 안심.

---

## 2. 현재 흐름 매핑

### 코드 (`orchestrator/lib/molly.js:526-616`)

```
사용자 @molly 메시지
   ↓
[line 530] say({ text: '🤔 One moment…' }) → thinkingTs 저장
   ↓
[line 550-567] processIntake(text, ctx) ← 30-90s 블랙박스
       └─ classifier 호출 (2-3s)
       └─ prd-analyzer 호출 (3-15s, thinking on)
       └─ plan-emitter 호출 (30-72s with cache hit, longer cold)
   ↓
[line 599] kind=plan_emit 시
   ↓ thinkingTs 삭제 + postPlanItemsMessage()
```

**문제:** processIntake 내부 단계 전환 시 chat.update 발사 안 함.

---

## 3. 목표 / 비목표

### 3.1 목표
- **G1** — Slack 사용자가 60-90s 동안 진행 중임을 시각적으로 인지
- **G2** — 단계별 사실 정보 제공 (어느 단계 / 예상 시간) — 막연한 "스피너" 아님
- **G3** — 다른 surface (Chrome ext, Playground) 회귀 없음 — onProgress는 optional callback

### 3.2 비목표
- ~~지속 polling 또는 server-sent events~~ — chat.update만으로 충분, 인프라 변경 없음
- ~~classifier/prd-analyzer 내부에 progress 콜백 깊이 wiring~~ — 단계 경계 (각 LLM 호출 사이) 만으로 충분
- ~~다른 surface (Chrome ext, Playground) 에도 progress 추가~~ — 각 surface는 이미 자체 UI 신호 있음, scope creep
- ~~decomposer/coder 단계 progress~~ — plan 카드 발사 후는 user가 plan card UI에서 진행 추적 가능, 별 thread

---

## 4. 영향 받는 코드/기능

### 4.1 In-flight (이미 일부 적용됨)

오늘 세션의 탐색적 edit으로 `orchestrator/lib/molly-intake.js:113-119`에 `fireProgress(stage, info)` 헬퍼 추가 완료 (no-op callback wrapper). plan 승인 시 그대로 사용. plan 거부 시 revert.

### 4.2 변경 inventory

1. **`orchestrator/lib/molly-intake.js` `handleFirstTurn`** — 단계 전환에서 `fireProgress(stage)` 호출:
   - `classifier` 결과 받은 직후 (`cls.kind === 'code_change'` 분기 진입 시) → `fireProgress('analyzing_prd')`
   - `analyzePrdClarity` 가 `clear` 반환 후, `emitPlan` 호출 직전 → `fireProgress('drafting_plan')`

2. **`orchestrator/lib/molly.js`** (Slack handler) — `processIntake` 호출 시 `onProgress` 콜백 전달:
   - `thinkingTs` 메시지를 chat.update로 갱신
   - stage → 메시지 매핑:
     - `'analyzing_prd'` → `'📥 Got it — analyzing your request...'`
     - `'drafting_plan'` → `'📝 Drafting a plan... (this usually takes 30-90s)'`
   - chat.update 실패는 silent swallow (fire-and-forget)

3. **다른 surfaces** — 변경 0. `onProgress` 안 전달하면 `fireProgress`는 no-op.

---

## 5. 설계 결정 (Q&A)

### Q1 — chat.update 갱신 위치 (새 메시지 vs 갱신)

- (a) **갱신 (chat.update)** — `thinkingTs` 재사용, thread 늘어나지 않음
- (b) 매 단계마다 새 메시지 + 이전 삭제 — 동일 효과지만 API 호출 2배

**제안: (a).** thread 깔끔, Slack API 비용 절감.

### Q2 — 단계 세분화 정도

- (a) **2 단계** (analyzing → drafting) — 제안
- (b) 3 단계 (analyzing → drafting → emitting card)
- (c) 1 단계 (drafting만)

**제안: (a).** 2 단계가 사용자에게 충분한 인지 신호. 3단계는 noise. 1단계는 PRD 분석 단계 (3-15s) 동안 무반응 가능.

### Q3 — 예상 시간 노출 ("30-90s") 정직성

- `plan-emitter` latency 분포 (오늘 metrics): 12:18 chrome-ext = ~40s, 13:09 slack = ~72s. 평균은 60s대.
- "30-90s" 는 95th percentile 까지 커버, 정직.
- 다만 외부 요인 (Anthropic API slow day) 으로 90s 초과 시 사용자 "또 멈췄나?" 우려.

**제안:** "this usually takes 30-90s" 워딩으로 평균은 정직히 명시, "usually" 로 outlier 여지 남김.

### Q4 — chat.update 실패 처리

- Slack rate limit (chat.update는 burst 50/min per channel) 또는 channel offline 가능
- chat.update 실패 → 진행 자체엔 영향 없어야 함

**제안:** try/catch + console.warn, swallow. fire-and-forget.

### Q5 — non-code_change 경로

- `classifier`가 `chat` / `status_query` / `lifecycle_action` 으로 분류 → 빠른 응답 (3-7s 평균)
- progress 메시지 불필요

**제안:** 분기 후에만 `fireProgress` 호출. 즉 `cls.kind === 'code_change'` 가 확정된 시점부터 시작.

---

## 6. 슬라이스

### Slice P1 — molly-intake.js stage emission *(15-20min)*

- `fireProgress` 호출 추가 (line 번호 대신 anchor text로 위치 명시 — momus M1 drift 방지):
  - **Anchor 1**: `// code_change → PRD analyzer` 코멘트 바로 다음 줄 (`analyzePrdClarity` 호출 직전) → `await fireProgress('analyzing_prd')`
  - **Anchor 2**: `analysis.clarity === 'ambiguous'` 분기 빠진 직후, `// PRD is clear on the first turn — bundle emitPlan` 코멘트 시작점 → `await fireProgress('drafting_plan')`

### Slice P2 — molly.js Slack handler `onProgress` 콜백 *(20-30min)*

- `thinkingTs` 클로저로 캡처
- `onProgress(stage)` 함수 정의 + ctx에 주입
- stage→message 매핑 dict
- chat.update + fire-and-forget catch
- **Observability (momus m3)**: catch에서 `logger.warn('[molly] progress update failed: %s', err.message)` — silent swallow + log. prod 환경에서 chat.update 실패가 누적되는지 모니터 가능.

### Slice P3 — 수동 검증 *(30-45min)*

- Slack 새 thread에서 `@molly` 호출
- 단계 전환 시점에서 메시지 텍스트 변경 확인
- 분기 검증:
  - chat/status_query (빠른 응답) → progress 메시지 안 보임
  - plan_emit clear path → analyzing_prd → drafting_plan → plan card (3단계 흐름)
  - **ambiguous path (momus m1)** → analyzing_prd → clarifying question (drafting_plan 미발사 — "stuck on drafting" 오인 안 됨 확인)
- **Cold-cache 검증 (momus m2)**:
  - Anthropic prompt cache TTL은 1h (`ttl: '1h'` per plan-emitter line 173-174). 직전 plan-emitter 호출 후 1h 안에 다시 호출 시 warm hit.
  - Cold-path 시뮬레이션: 
    1. 1h 이상 plan-emitter 호출 없는 시점 또는
    2. SYSTEM_PROMPT/system block 변경 직후 (cache invalidated)
  - Cold latency 측정 (예상 90-120s) — "usually 30-90s" 워딩 신뢰성 검증
  - 90s 초과 시 워딩 보정 검토

### Slice P4 — 회귀 검증 *(15min)*

- Chrome ext에서 동일 요청 → 동작 변화 없음 확인
- Playground에서 동일 → 동작 변화 없음

---

## 7. 검증

- [ ] Slack 새 thread + code_change 요청 → 3단계 메시지 (One moment… → Got it — analyzing… → Drafting a plan…) 순차 갱신
- [ ] chat (e.g., "@molly hi") → 빠른 응답, progress 미발사
- [ ] plan 발사 후 thinkingTs 메시지 삭제됨 (기존 동작)
- [ ] Chrome ext 흐름 변화 없음
- [ ] chat.update API 한계 도달 시 fail silently

---

## 8. 리스크 / 미해결

| 리스크 | 영향 | 대응 |
|--------|------|------|
| chat.update rate limit (50/min/channel) | low | 한 thread당 최대 2-3회 update, 한계 멀음 |
| stage 전환 사이 0초 (예: cache hit으로 분석 즉시 끝) | low | 동작 자체엔 영향 없음, 살짝 어색해 보임 |
| 사용자가 30-90s 약속 보고도 100s+ 기다리면 신뢰 ↓ | medium | "usually" 워딩 + plan-emitter 최적화 별 thread |
| fireProgress가 async — 이전 호출 안 끝났는데 다음 stage 호출 시 race | low | 각 stage는 LLM 호출 사이의 순차 지점, race 없음 |
| 다국어 — Tving 한국어 사용자에게도 영어 메시지 OK? | low | "I18n" 메모리 원칙은 *product code*. tooling messaging은 영어 OK. 추후 KR localized 고려 별 thread |

---

## 9. 추정

| Slice | 추정 |
|-------|------|
| P1 stage emission | 15-20min |
| P2 Slack onProgress wiring | 20-30min |
| P3 수동 검증 (Slack) | 15min |
| P4 회귀 검증 (Chrome ext + Playground) | 15min |
| **합계** | **~1h-1h20min** |

---

## 10. 검토 후 진행 순서

1. v1 plan momus 리뷰 (P1+P2 plan-verbosity와 묶어 1회)
2. Plan 승인 → P1 → P2 → P3 → P4
3. Plan 거부 → fireProgress no-op edit revert

---

*Plan 작성: 2026-05-19 Claude session. user-reported "멈춘 것 같다" 피드백에서 직접 trigger.*
