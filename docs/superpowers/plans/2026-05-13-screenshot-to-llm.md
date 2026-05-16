# Plan — Screenshot → LLM image input (Lane 2)

**Date:** 2026-05-13
**Author:** kyungjae.ha (with Claude session)
**Status:** draft — awaiting review
**Why now:** 사용자가 Chrome ext에서 region 캡처 + chat 입력했는데 Molly가 화면을 안 보고 "Which page or screen has the '보관' tab?" 라고 되묻는 사건. 캡처 이미지가 데이터 URL로 사이드패널에는 보이지만 LLM에 들어가지 않음.

---

## 1. 문제 진술 (one sentence)

Chrome 익스텐션이 캡처한 region 스크린샷은 사이드패널 UI에 표시되지만, **orchestrator의 어떤 LLM 호출에도 image content block으로 첨부되지 않는다**. 따라서 Molly는 사용자가 가리키는 화면을 못 보고 텍스트 + 메타데이터만으로 의도를 추정한다.

---

## 2. 현재 흐름 매핑 (사실관계)

### 2.1 Chrome ext → orchestrator 페이로드

| 흐름 | 코드 위치 | `selectionScreenshotDataUrl` 페이로드 | 결과 |
|------|----------|--------------------------------------|------|
| chat / intake | `chrome-extension/sidepanel.js:4506-4516` (POST `/api/intake`) | ❌ 필드 없음 | 이미지가 orchestrator에 도달 안 함 |
| Inspect Agent 사전분석 | `chrome-extension/sidepanel.js:790-808` (`fetchAiAnalysis` → POST `/api/analyze-request`) | ❌ 필드 없음 | 마찬가지 |
| Plan submit / execute | `chrome-extension/sidepanel.js:4695` (POST `/api/change-request`) | ✅ data URL 포함 | 도달하지만 LLM에 안 흐름 (아래 2.2) |

### 2.2 orchestrator 내부

- `orchestrator/server.js:1184-1209` `maybePersistSelectionScreenshot()` — data URL을 디스크(`attachments/selection-*.png`)에 저장하고 `selectionScreenshotPath` + `selectionScreenshotMimeType` 메타만 payload에 남김. data URL은 버림.
- `selectionScreenshotPath` 사용처 grep 결과:
  - `server.js:943-944` (메타 표시용)
  - `server.js:976-977` (state JSON 직렬화용)
  - **그 외 0건**. planner / coder / reviewer 어디서도 안 읽음.
- `orchestrator/lib/molly-plan-emitter.js:208-217`의 messages payload는 `[{role: 'user', content: userPrompt}]` 단일 텍스트. 시그니처도 `emitPlan(args, ctx)` 에서 `args`에 image 필드 없음.

### 2.3 이미 있는 reference 구현

`orchestrator/lib/qa-adapters/agent-review.js:263-272`이 정확히 우리가 필요한 패턴을 구현 중:

```js
if (evidence.screenshotBytes) {
  userContent.push({
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: evidence.screenshotBytes.toString('base64'),
    },
  });
}
```

→ 동일 패턴을 planner/intake로 확장하면 됨. 이미 운영 중인 코드 → 새 위험 적음.

### 2.4 LLM 호출 사이트 (13개 발견)

`orchestrator/lib/plan-emitter, classifier, prd-analyzer, chat, status, intake(재호출), job-decomposer, job-research, job-reviewer, job-qa-strategist, qa-adapters/agent-review` + `orchestrator/server.js × 3 (ad-hoc)`. agent-review만 image block을 만든다.

---

## 3. 목표 / 비목표

### 3.1 목표
- **G1** — Chrome ext에서 캡처한 이미지를 chat 흐름(`/api/intake`)으로 보낼 것.
- **G2** — orchestrator의 PRD 분석 + plan 생성 LLM 호출에 이미지가 user content block으로 첨부될 것.
- **G3** — 이미지 첨부의 측정 가능한 로그 (`usage.input_tokens` delta, attached/skipped count) 가 남을 것. 주의: Anthropic API의 `usage`는 `input_tokens` / `cache_creation_input_tokens` / `cache_read_input_tokens` 만 — image-only 토큰 분리 필드는 존재하지 않음. 이미지 토큰은 `input_tokens`에 합산되므로 "이미지 없을 때 vs 있을 때 input_tokens 차"를 비교.

### 3.2 비목표 (이번 plan 범위 밖)
- ~~Slack 측 이미지 첨부~~ — Slack은 별도 첨부 모델. 별 plan.
- ~~Coder/reviewer/decomposer에 이미지 첨부~~ — Phase 3 후보로 두고 측정 후 결정. coder는 sandbox에서 별도 SDK(OpenCode)를 통해 LLM 호출하므로 통합 비용이 다름.
- ~~Multi-image 첨부~~ — 현재 캡처는 단일 region. 다중은 future.
- ~~이미지 파일 크기/해상도 정책~~ — Anthropic 한도 (5MB/이미지) 안에 들어가는 region 캡처라 일단 통과. 한도 초과 시 reject + 사용자 알림.

---

## 4. 영향 받는 코드/기능 (변경 inventory)

### 4.1 Chrome ext (3 파일)
1. `chrome-extension/sidepanel.js:4506-4516` — `/api/intake` POST body에 `selectionScreenshotDataUrl`, `selectionRect` 추가
2. `chrome-extension/sidepanel.js:790-808` `fetchAiAnalysis` — Phase 2에서 `/api/analyze-request` payload에도 추가 (Phase 1에서는 보류)
3. 기존 캡처 carriage 로직 (selectedCapture)은 그대로

### 4.2 orchestrator (5 파일)
1. **`orchestrator/server.js` `/api/intake` 라우트 (line 3239-3286)** — payload에서 `selectionScreenshotDataUrl` 받아 `maybePersistSelectionScreenshot()` 호출 → `selectionScreenshotPath` / `selectionScreenshotMimeType`을 `ctx`로 흘려보내기
2. **`orchestrator/server.js` `/api/analyze-request` 라우트** — Phase 2에서 동일 처리
3. **`orchestrator/lib/molly-intake.js`** — `processIntake(text, ctx)` 가 `ctx.attachment` 를 받아 그대로 `emitPlan(prd, enrichedCtx)` 으로 전달. 3개 emitPlan 호출(line 164, 219, 293) 다 통과시킴
4. **`orchestrator/lib/molly-plan-emitter.js`** —
   - `emitPlan(args, ctx)` args에 `attachment: { path, mediaType }` 추가
   - user message가 단일 string에서 `Array<ContentBlock>`으로 변경 (text + 이미지)
   - logging에 image attached / skipped 추가
   - **prompt cache 정책**: 이미지는 user 메시지에 들어가므로 system block의 cache_control은 영향 없음 (cache hit 유지). 이미지 자체는 매 요청마다 다르므로 cache_control 부착 X.
5. **`orchestrator/lib/molly-prd-analyzer.js`** (Phase 2) — 모호성 판단 정확도 ↑ 기대. 호출 시그니처 확장 + image block.

### 4.3 옵션: 공유 유틸 (1 파일)
- 새 파일 `orchestrator/lib/image-attachment.js` — `loadImageBlock({ path, mediaType }) → ContentBlock | null` 한 함수. 파일 없음 / 사이즈 초과 / fs 오류는 null 리턴 + 로그. agent-review는 in-memory bytes를 받으니 시그니처 약간 다름. 호환 가능한 두 진입점 제공.

### 4.4 측정 / 로깅
- `recordEvent('lib_call', { ..., attachment_attached: bool, attachment_skip_reason?: string })`
- usage.image_input_tokens 추출 (Anthropic API의 cache_creation_input_tokens 옆에 같이 노출)

---

## 5. 설계 결정 (Q&A)

### Q1 — emitPlan 시그니처 확장 방식

선택지:
- (a) `args.attachment = { path, mediaType }` 단일 필드 (제안 ←)
- (b) `args.attachments = [{path, mediaType}, ...]` 배열 (future-proof, 현재는 항상 길이 ≤ 1)
- (c) `args.imageBase64`, `args.imageMediaType` 두 필드 평면형

**제안: (a).** 단순함. 배열로 갈 필요는 multi-image 캡처 또는 다중 PRD 첨부 기능이 생겼을 때 한 번 마이그레이션 — 그때까지는 yagni. 다만 미래의 (b) 전환을 쉽게 하려고 이름은 `attachment` 단수.

### Q2 — 이미지 인코딩 위치

선택지:
- (a) base64 인코딩은 plan-emitter 안에서 fs.readFile → toString('base64'). 매 호출마다 새로 인코딩.
- (b) maybePersistSelectionScreenshot 시점에 이미 base64 → 디스크 저장 → 그러나 base64 형태로는 저장 안 함 (현재는 raw bytes). 캐싱하면 동일 request 안에서 N번 호출 시 절약.

**제안: (a).** 단순. 호출 빈도가 낮고 (request당 plan 1-2회) 파일 사이즈도 작아서 인코딩 비용 무시 가능.

### Q3 — chat 흐름과 plan submit 흐름의 이미지 ID 공유

intake가 이미지를 받아 디스크 저장하면, 같은 사용자가 곧이어 plan submit하면 `/api/change-request`가 같은 이미지를 또 받음 (Chrome ext가 양쪽에 보냄). 디스크 attachments에 중복 저장됨.

선택지:
- (a) 그대로 둠 — disk 한 장은 cheap, attachments는 분기점이 다른 별도 흐름. 정리는 retention 정책으로 별도 처리.
- (b) attachment ID를 만들어 첫 저장 후 ID만 전달 (chrome ext에 stateful 추가)

**제안: (a).** 단순함. (b)는 별 plan.

### Q4 — Phase 2 (prd-analyzer / analyze-request)에 이미지 첨부 우선순위

PRD 분석은 "PRD가 모호한가 / 명확한가" 판정. 사용자가 이미지를 첨부했다는 사실 자체가 "구체 의도 있음" 신호 — 이미지를 보지 못한 분석은 false-positive (모호 판정) 가능성.

**제안: Phase 1에서 prd-analyzer까지 같이 처리. analyze-request는 Phase 2로.** 이유: prd-analyzer는 intake 안에서 자동 호출되므로 분리하면 짝짝이 → 같은 PR로 묶음. analyze-request는 Chrome ext의 사전분석으로, plan 흐름과 독립적이라 분리 가능.

### Q5 — 이미지 LLM 토큰 비용 / 캐시 영향

- **Vision 토큰 산식은 모델별 다름.** Claude 3-series 가이드는 `(width × height) / 750`. Claude 4.5/4.6은 별도 확인 필요 — Phase 1 Slice 1.4 측정 시 실측. 사전 숫자는 박지 않음.
- **Prompt cache 영향 (두 호출자별로 다름):**
  - `plan-emitter.js:171-182` — system block의 마지막 블록에 `cache_control: { type: 'ephemeral', ttl: '1h' }`. 이미지는 user message에 들어가므로 system cache는 그대로 hit.
  - `molly-prd-analyzer.js:82` — system block에 `cache_control: { type: 'ephemeral' }` 만 (ttl 미지정 = **기본 5분**). 호출 빈도가 5분 안에 안 들어오면 cache가 거의 의미 없음. 이미지 도입이 prd-analyzer cache miss를 만들지는 않지만, 원래 hit율이 낮을 수 있음.
- **이미지 자체는 cache 안 됨** — 매 요청마다 다르고 user message에 있으므로. cache_control 부착 X.
- **비용 추정**: 사전 숫자 없음. Slice 1.4 실측 후 plan에 백필.

### Q6 — 이미지 없을 때 동작

대부분 사용자는 이미지 없이 chat. `attachment` 없으면 user content는 기존 단일 텍스트 그대로 (배열로 감싸지 않거나 `[{type:'text', text:...}]`만). 기존 모든 호출 흐름과 호환.

### Q7 — Slack 흐름

Slack은 `/api/intake` 또는 `/api/molly/respond` 호출 시 별도 surface. 현재 이미지 첨부 X. 이번 plan에서는 Slack은 attachment=null로 통과 (코드 변경 0). 향후 Slack files API 통합은 별 plan.

### Q8 — Failure modes

- 이미지 파일 missing (디스크 정리 후) → image block skip + 로그 + 계속 진행 (no throw)
- 이미지 사이즈 > 5MB → reject + 로그. region 캡처는 보통 < 500KB이므로 일어날 가능성 낮음.
- 이미지 모드 검증 (PNG/JPEG/GIF/WebP) — mimeType이 위 4개 중 하나가 아니면 skip.
- API 500: 기존 에러 핸들링 그대로.

### Q9 — 어디부터 시작?

3개 흐름 모두 영향 받지만, **사용자가 보고한 케이스(chat → 클래리피케이션 되묻기)는 정확히 `/api/intake` → `emitPlan` 흐름**. 그래서 Phase 1만 해도 사용자가 체감하는 문제 해결.

---

## 6. 슬라이스 (Phase / Slice)

### Phase 1 — chat 흐름의 plan 생성에 이미지 첨부 (필수, 사용자 보고 케이스 해결)

**Slice 1.1 — image-attachment.js 유틸 + plan-emitter 통합** *(1.5h)*
- 새 파일 `orchestrator/lib/image-attachment.js`:
  - `loadImageBlock({ path, mediaType }) → { type, source }|null`
  - 파일 read, mime 검증, size 가드 (5MB)
  - 실패 시 null + console.warn
- `molly-plan-emitter.js`:
  - `emitPlan` args에 `attachment` 추가
  - userContent를 배열로 (image block 옵션 push)
  - logging 라인에 `img_attached=1 size=NNkB` 추가
- 단위 동작 확인: 이미지 없을 때 기존 동작과 byte-identical 검증

**Slice 1.2a — intake 라우트 + molly-intake가 attachment를 흘려보냄 (plan-emitter만 적용)** *(1h)*
- `server.js:3239-3286` `/api/intake`:
  - **중요**: `maybePersistSelectionScreenshot()` 은 새 payload 객체를 반환 (mutate 아님, server.js:1203-1208 확인). 따라서 **반환값을 재할당해야 함**:
    ```js
    let payload = await parseBody(req);
    payload = maybePersistSelectionScreenshot(payload);  // re-assign
    const ctx = {
      ...
      attachment: payload.selectionScreenshotPath
        ? { path: payload.selectionScreenshotPath, mediaType: payload.selectionScreenshotMimeType }
        : null,
    };
    ```
- `molly-intake.js`:
  - `processIntake(text, ctx)` 가 `ctx.attachment` 를 받음
  - 3개 emitPlan 호출(line 165, 220, 294)에 `attachment: ctx.attachment` 전달

**Slice 1.2b — prd-analyzer가 이미지를 받아 image block 첨부** *(1.5h)*
- `molly-prd-analyzer.js`:
  - `analyzePrdClarity(text, ctx)` 시그니처에 `ctx.attachment` 흐름 추가
  - `buildPrdUserMessage()` 가 현재 string 리턴 (lib/molly-prd-analyzer.js:46-55) — Array<ContentBlock>으로 시그니처 변경 (text block + 옵션 image block)
  - LLM 호출 body의 messages content를 배열로
- 위 변경이 기존 PRD 모호성 판정 정확도에 영향 줄 수 있음 → Slice 1.4 측정 항목에 `analyzePrdClarity` fallback_clear 비율 before/after 추가

**Slice 1.3 — Chrome ext가 intake 호출 시 image 보냄** *(20min)*
- `sidepanel.js:4506-4516` `/api/intake` POST body에 추가:
  - `selectionScreenshotDataUrl: selectedCapture?.imageDataUrl ?? null`
  - `selectionRect: selectedCapture?.rect ?? null`
- region 캡처 후 즉시 chat 입력하는 시나리오 + region 없이 chat 입력하는 시나리오 둘 다 동작 확인

**Slice 1.4 — 실측** *(30min)*
- 같은 사용자 보고 케이스 재현: 캡처 + "보관 옆에 삭제 탭" 입력 → Molly가 화면 보고 plan 생성하는지 확인
- 다음 비교:
  - before: "Which page or screen has the '보관' tab?" 되묻기
  - after: plan_emit 즉시 또는 더 구체적인 후속 질문 (예: "OMS '예약형 주문 리스트' 페이지의 탭 영역에 '삭제' 탭을 추가하시겠어요?" — page 식별이 화면에서 됨)
- 로그 확인: `[plan-emitter] ... img_attached=1 size=NNkB usage: input=... image_input_tokens=...`
- 비용 측정: usage.input_tokens before/after delta. 100% 가설은 (이미지 ~300 tokens + system은 cache hit 유지)

### Phase 2 — analyze-request 흐름도 이미지 수용 (선택, 측정 후 결정)

**Slice 2.1 — server.js /api/analyze-request 라우트 + 사이드패널 fetchAiAnalysis** *(1h)*
- payload field 추가
- analyze-request의 LLM 호출에 image block 첨부
- *이전 케이스가 Phase 1로 해결되면 우선순위 ↓*

### Phase 3 — coder / reviewer (deferred)

- coder는 OpenCode SDK 경유. 별도 통합 검토 필요.
- reviewer (job-reviewer.js)는 이미지 보면 PR review 정확도 ↑ 가능성. 측정 기반 결정.

---

## 7. 검증 / 측정

### 7.1 기능 검증 (Phase 1 완료 기준)
- [ ] `/api/intake` POST body에 `selectionScreenshotDataUrl` 넣어 curl 호출 → orchestrator 로그에 `img_attached=1` 출력
- [ ] 이미지 없이 호출 → `img_attached=0`, 기존 동작 byte-identical
- [ ] 5MB 초과 더미 이미지 → skip + 로그
- [ ] 잘못된 mimeType → skip + 로그
- [ ] Chrome ext에서 캡처 후 chat 입력 → 사이드패널 logs에서 image 포함된 payload 확인

### 7.2 품질 측정 (Phase 1 후 1주)
- intake_result.kind 비율 변화: `code_change_ambiguous` ↓ 가설 (이미지로 화면 식별되면 ambiguous 감소)
- plan_emit 케이스의 plan_items 수 / referenced_components 정확도 — manual spot-check 5-10건

### 7.3 비용 / latency 측정
- `usage.input_tokens` 평균 before vs after (이미지 + 시스템 cache hit 유지)
- 호출당 latency P50 / P95 — 이미지 인코딩 + 전송으로 100-300ms 증가 예상

---

## 8. 리스크 / 미해결 질문

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Anthropic image input 토큰 한도 (200K 이내) | low — region 캡처는 작음 | size 가드 (5MB) |
| 사용자가 민감 화면 캡처 → orchestrator 디스크에 PII 저장 | medium | attachments retention 정책 (별 plan), 일단 dev 환경만 |
| 이미지 첨부가 plan 품질 오히려 떨어뜨림 (over-grounding) | low-medium | Phase 1 측정 후 A/B 검토 |
| Image block이 thinking 토큰 budget을 잠식 | low | thinking_budget은 별 채널. 다만 명문화 안 됨 → Slice 1.4 측정으로 확인 |
| prd-analyzer가 이미지 보고 false-positive "명확함" → 오히려 잘못된 plan | medium | Slice 1.4 측정에서 ambiguous율 모니터 |
| **prd-analyzer 타임아웃 압박** — 현재 15s timeout (molly-prd-analyzer.js:98). 이미지 인코딩+업로드로 +0.5-2s 추가 가능 → timeout 초과 → fallback "clear" 처리됨 (line 104-107) → 잘못된 plan 트리거 | **high** | Slice 1.4 측정에 fallback_clear 비율 before/after 추가. 초과 빈도 > 5% 시 timeout 25s로 상향 검토 |

**미해결 (defer):**
- Slack 첨부
- Multi-image 캡처
- attachment ID 공유 (chat → plan submit 흐름)
- attachment retention 정책 (현재 무한 누적)
- coder/reviewer 통합 시점

---

## 9. 추정

| Slice | 추정 |
|-------|------|
| 1.1 plan-emitter + util | 1.5h |
| 1.2a intake + server.js route (plan-emitter만) | 1h |
| 1.2b prd-analyzer 이미지 첨부 | 1.5h |
| 1.3 Chrome ext | 20-45min |
| 1.4 측정 (≥5 케이스, fallback_clear/intake_kind 카운터) | 1h |
| **Phase 1 합계** | **~5-6h** |
| Phase 2 | +1h |
| Phase 3 | TBD |

---

## 10. 검토 후 진행 순서

1. 이 plan을 **사용자 + critic (momus) 리뷰**
2. Slice 1.1 → 1.2 → 1.3 → 1.4 순서
3. Phase 1 결과 보고 후 Phase 2 / 3 결정

---

*Plan 작성: 2026-05-13 Claude session. Lane 1 (UI 작게 + lightbox) 은 별도 lane으로 이미 완료 (chrome-extension/sidepanel.{css,html,js} 변경됨, 사용자가 chrome://extensions reload 후 검증 예정).*
