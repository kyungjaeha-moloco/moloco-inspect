# Plan — Screenshot 첨부 시 page 추론 실패 fix (Lane 2 Slice 1.4 follow-up)

**Date:** 2026-05-19
**Author:** kyungjae.ha (with Claude session)
**Status:** draft v3 — momus 1차 + 2차 리뷰 반영 (1차: B1, B2, M1-M4, m1, m2, m3, m4, m5, n2-n4. 2차: N1, N2, N3, N4, N5, N6)
**Parent:** `docs/superpowers/plans/2026-05-13-screenshot-to-llm.md` (Phase 1 Slices 1.1–1.3 shipped, 1.4 미측정)
**Predecessor handoff:** `docs/superpowers/handoffs/2026-05-19-screenshot-condensation-foundation-mcp.md` §7 #1

---

## 1. 관찰된 증상 (오늘 user-reported, n=1 negative)

- Chrome ext에서 region 캡처 (`Available / Draft / Archived` 탭이 보이는 부분) + chat 입력: "탭을 4개로 만들고 삭제 탭을 마지막에 추가해줘"
- Molly 응답: `🤔 Could you tell me which page or component contains these tabs (Available / Draft / Archived) so I can add the '삭제' tab there?`
- 즉 parent plan §6.1.4의 "before"와 동일 — Slice 1.1~1.3 shipped 후에도 사용자가 체감하는 동작 변화 0.

---

## 2. 코드 사실 재확인 (2026-05-19)

| Slice | 상태 (코드) | 검증 |
|-------|------------|------|
| 1.1 `image-attachment.js` 유틸 + plan-emitter image block | ✅ shipped | `orchestrator/lib/image-attachment.js` 존재, `molly-plan-emitter.js:129-133` ctx.attachment fallback |
| 1.2a intake → ctx.attachment | ✅ shipped | `server.js:3283-3288` ctx.attachment 주입 |
| 1.2b prd-analyzer image block | ✅ shipped | `molly-prd-analyzer.js:82-86` imageBlock push to userContent |
| 1.3 Chrome ext → /api/intake payload | ✅ shipped | `sidepanel.js:4515-4516` `selectionScreenshotDataUrl` / `selectionRect` |

**즉 image는 prd-analyzer LLM 호출까지 도달하고 있을 가능성이 높음.** 그런데도 ambiguous 분류 → clarifyingQuestion 발사.

---

## 3. 후보 root causes (3가지, 측정 필요)

### RC-A — image가 실제로 안 도달

검증 방법: orchestrator stderr/stdout에서 다음 로그 확인 (요청 시각 기준):
```
[prd-analyzer] http ... img_attached=1   # 실패 path (line 121)
recordEvent('lib_call', { ..., img_attached })  # 성공 path (line 174)
```

가능 원인:
- `selectedCapture`가 chat 전송 시점에 null (region 캡처가 다른 panel 이벤트로 clear됨)
- `maybePersistSelectionScreenshot()` 실패 → `payload.selectionScreenshotPath` undefined → `ctx.attachment=null` (server.js:1184-1205 path 변환 단계). disk write 에러, content-type mismatch 등.
- ~~enrichedCtx attachment 누락~~ (momus m5: 코드 path에 enrichedCtx 변수 없음, 삭제)

### RC-B — image는 도달했지만 모델이 페이지 식별 불가

prd-analyzer SYSTEM_PROMPT (molly-prd-analyzer.js:9-38) Clear 기준:
> "The target page / component / file is specified or can be inferred (e.g. 'TAS sidebar', 'MCMainLayoutHeader.tsx')"

스크린샷만으로 inferable한가:
- 시각: `Available / Draft / Archived` 탭 + `Add filter` 링크 — Campaign/Creative/Ad Group list 등 다수 페이지에 공통 패턴
- 파일/route 정보 없음 (URL, breadcrumb, 페이지 타이틀 안 보임)
- 결과: 모델이 신중하게 "어느 페이지인지 명시" 요청 — **모델 행동은 시스템 프롬프트에 충실**

이 경우 해결은 prd-analyzer가 아니라 **upstream에 route/client을 첨부**.

### RC-C — Chrome ext가 route/client 정보를 안 보냄 (intake-only 누락)

`sidepanel.js:4506-4517` `/api/intake` POST body 페이로드:
```js
{ text, surface, history, hasPendingPlan, pendingPlanSummary,
  selectionScreenshotDataUrl, selectionRect }
```

- `client` 없음
- `routeOrPage` 없음
- `language` 없음

**중요 (momus B1):** Chrome ext에는 이미 `getLivePageContext()` (정의: `sidepanel.js:1650`, 호출: `:510`, `:4615`) 및 capture/liveContext/currentElement 3-way 우선순위 resolver가 존재함 (`sidepanel.js:4615-4664`) — **plan-generation path (`/api/change-request`, `sidepanel.js:4680-4710`)는 이미 client/pagePath/language를 정상적으로 송신.** 또한 `selectedCapture.rect`는 client/language/pagePath를 carry (sidepanel.js:1548-1572), `content-script.js:473,651`은 hash 포함된 pagePath builder를 가지고 있음.

즉 인프라는 다 있고, **`/api/intake` call site에만 forwarding이 빠짐.** 새 헬퍼 만들 필요 없이 기존 resolver 재사용.

`client` semantics 보정 (momus m2): client는 페이지가 아니라 host/URL pattern 기반 product target (예: "msm-portal", "tving"). plan-emitter.js:122 `args?.client || ctx.client || 'msm-default'` — content-script가 host 패턴 매칭으로 결정.

---

## 4. RC 우선순위 + 관측 가능성 (momus B2 반영)

| RC | likelihood | impact | telemetry로 구분 가능? |
|----|-----------|--------|----------------------|
| A | low (코드 path 다 검증됨) | high (image 안 도달이면 전제 무너짐) | **yes** — `img_attached=0` 으로 확정 |
| B | medium-high (page inference는 본질적으로 hard) | medium | **no** — `img_attached=1` + `ambiguous`로 떨어지면 B/C 구분 불가 |
| C | **high** (intake site에 route/client forwarding 누락 명확) | **high** | **no** — 위와 동일 |

**핵심 인정 (momus B2):** F1 측정만으로 분리 가능한 건 RC-A 뿐. `img_attached=1` 인데 `ambiguous` 발사인 경우, 모델 입장에서 "image 봤지만 visual만으로 page 불명확" (RC-B) 인지 "image 봤고 route만 있으면 명확했을 텐데" (RC-C) 인지 telemetry로 분간 불가.

**전략 (cheapest-fix-first):**
- RC-C 수정 비용 < RC-B 수정 비용 (B는 system prompt 변경 + cache 회귀 위험).
- F1 → RC-A 배제 → F2 (RC-C 가설) → 측정. 잔존 ambiguous 있으면 → F3a (user msg prepend) → 측정. 그래도 잔존 → F3b (system prompt) → 측정.
- 각 단계 측정 = paired smoke. F4 게이트는 paired before/after 비교 (M2 반영, §7 참조).

---

## 5. 목표 / 비목표

### 5.1 목표
- **G1** — Chrome ext가 `/api/intake` POST body에 `client`, `routeOrPage` 송신
- **G2** — server.js intake route가 받아 `ctx.client` / `ctx.routeOrPage`로 흘려보냄 (이미 일부 흐름 존재, 검증)
- **G3** — prd-analyzer가 page context를 받으면 user message에 명시 + system prompt가 활용 가능하게 (RC-B 대응 보조)
- **G4** — Slice 1.4 측정 완료: n≥5 케이스 paired (region 캡처 + intake 송신) → `intake_result.kind` 분포 비교 + img_attached/route_attached 로그 검증

### 5.2 비목표
- ~~classifier에도 image 전달~~ — RC-C 해결 후에도 풀리지 않을 때 검토. 비용 증가.
- ~~screenshot OCR로 page 추론~~ — 모델 vision으로 충분, OCR 별도 lib 도입 과함
- ~~Slack 첨부에 route 정보~~ — Slack은 thread context가 다름, 별 plan
- ~~retroactive: 과거 미보낸 케이스 backfill~~ — 미래 요청에만 적용

---

## 6. 변경 inventory

### 6.1 Chrome ext (1 파일 — 새 헬퍼 만들지 않음, momus B1)
1. **`chrome-extension/sidepanel.js:4500-4518`** — `/api/intake` POST 직전에 기존 resolver 재사용:
   ```js
   // 이미 plan-generation path (sidepanel.js:4615-4664)가 쓰는 패턴 그대로
   const liveContext = await getLivePageContext();
   const { resolvedClient, resolvedPagePath, resolvedLanguage } =
     resolveCapturePageContext({ selectedCapture, currentElement, liveContext });
   // 위는 기존 함수 또는 inline precedence (capture > liveContext > currentElement)
   body: JSON.stringify({
     text, surface, history, hasPendingPlan, pendingPlanSummary,
     selectionScreenshotDataUrl, selectionRect,
     client: resolvedClient,
     routeOrPage: resolvedPagePath,
     language: resolvedLanguage,  // momus n4: Tving i18n 메모리 원칙
   })
   ```
2. **acceptance (momus N3 — mandate extraction)**: intake site의 resolution rule이 plan-generation site (`sidepanel.js:4615-4664`)와 동일한 우선순위 (capture > liveContext > currentElement). **drift 방지를 위해 공통 helper로 extract refactor 필수** (예: `resolveCapturePageContext({ selectedCapture, currentElement, liveContext })`) — 30+ 줄 branching이라 copy-paste는 미래 drift 보장.

### 6.2 orchestrator (1 파일)
1. **`server.js:3270-3272`** — 이미 `client`/`routeOrPage`를 ctx에 흘리는 코드 있음 (Sub-phase B.2 코멘트). payload에서 직접 받음. **검증 출력 (momus N6)**: F1 재현 시 stderr에 다음 로그 1줄 임시 추가 — `console.log('[intake] ctx client=', ctx.client, 'route=', ctx.routeOrPage, 'language=', ctx.language)` → 값이 expected 값과 일치하는지 1회 확인 후 line 제거. unit test 없이 manual 1회.

### 6.3 prd-analyzer (1 파일, **2 단계로 split** — momus M1)

**F3a — user message prepend (cache-safe)**:
1. **`molly-prd-analyzer.js` `buildPrdUserMessage(text, ctx)`** — ctx.client/routeOrPage/language 있으면 user message 첫 줄에 prepend:
   ```
   Context: client=msm-portal route=/campaigns/list language=ko
   PRD candidate: ...
   ```
   - **Truthiness rule (momus M3 + N1 반영)**: 다음 조건 통과 시에만 각 토큰을 prepend에 포함:
     - `route`: `typeof === 'string' && route.length > 0 && route !== '/'`
     - `client`: `typeof === 'string' && client.length > 0` (단순 string-presence; `'msm-default'` 제외 안 함 — intake-path는 sidepanel resolver에서 `null` 또는 real value만 송신하므로 sentinel 가드 불필요. plan-emitter의 `'msm-default'` fallback은 별 layer)
     - `language`: `typeof === 'string' && language.length > 0` (BCP-47 코드 통과)
   - 위 조건 만족 안 하면 해당 토큰만 prepend에서 누락 (Slack `null`/sandbox `/` 모두 noise 차단).
   - 모든 토큰이 다 falsy면 prepend 줄 자체 생략.
2. logging: `recordEvent('lib_call', { ..., route_attached: bool, language_attached: bool })`

**System prompt에는 변경 없음** (cache prefix 보존).

**F3b — system prompt 변경 (조건부, F3a로 안 풀릴 때만)**:

**Prerequisite (momus N2)**: prd-analyzer의 `recordEvent('lib_call', ...)` (molly-prd-analyzer.js:163-177)에 `cache_create`/`cache_read` 키 누락 — classifier (line 167-168), chat (line 136-137), plan-emitter (line 303-304)는 이미 persist 중. F3b 진입 전 prd-analyzer의 recordEvent에 2 keys 추가 (Anthropic API response의 `usage.cache_creation_input_tokens` / `usage.cache_read_input_tokens` 매핑). 추정 5-10min, F3b에서 measurable gate를 갖기 위한 필수 사전 작업.

1. SYSTEM_PROMPT (현재 line 9-38)에 Clear 기준 보강:
   > "If a screenshot is attached AND a route/client is provided in Context, treat the visible UI on that route as the target — do not re-ask which page."
2. **회귀 위험 (momus M1)**: commit `fddf2ec`의 -52.6% cache reduction은 plan-emitter system block 응축으로 측정. prd-analyzer SYSTEM_PROMPT는 별도지만 `cache_control: ephemeral` (line 91-95) + ~700 tokens borderline. 변경 시 5분 TTL 안의 cache prefix 무효화 + threshold crossing 위험.
3. **F3b 게이트**: prereq 적용 후 paired 5-run 측정에서 `cache_read / (cache_read + cache_create)` ratio drop > 10pp 시 **revert + 다른 levers 검토** (예: 사용자 message에 강한 instruction 넣기).

### 6.4 측정 (Slice 1.4 본체)
- intake_result.kind 카운터: before(8fe3287)~after window
- `img_attached` × `route_attached` 매트릭스로 group by

---

## 7. 슬라이스

### Slice F1 — RC-A 측정 (배제 또는 확정) *(15min)*
- orchestrator 재실행 후 user-reported 케이스 재현
- **Stopping rule (momus N4)**: n=1 1회 재현으로 충분 (`img_attached` 값은 deterministic — code path가 고정). 단 첫 시도에서 reproduce 자체가 실패하면 (예: chat 첫 응답이 plan_emit 등 정상 동작) 최대 3회까지 재시도. 3회 후에도 reproduce 안 되면 "the issue is intermittent — re-investigate trigger" 라고 결론.
- 체크리스트:
  - [ ] orchestrator stderr/stdout에서 `img_attached` 값 (성공 path: `recordEvent('lib_call', ..., img_attached=1)`; 실패 path: `[prd-analyzer] http ... img_attached=N`)
  - [ ] `attachments/selection-*.png` 디스크 파일 생성 여부 (momus m1 — maybePersistSelectionScreenshot 단계 검증)
  - [ ] `payload.selectionScreenshotPath` 값이 ctx 빌드 시점에 존재했는지 (server.js:3283-3288 path)
- **Outcome tree (momus B2 명시):**
  - `img_attached=0` 또는 file 없음 → **RC-A 확정** → image 송신/persist path 추적, 다른 slice 진입 보류
  - `img_attached=1` + file 있음 → **RC-A 배제**. RC-B/C 분간 불가 (telemetry 한계 인정) → cheapest-fix-first 원칙으로 F2 진입

### Slice F2 — Chrome ext → route/client/language 송신 (momus B1) *(30-45min)*
- 기존 `getLivePageContext()` + 3-way resolver (sidepanel.js:4615-4664) 재사용. **새 helper 만들지 않음.**
- intake POST body 확장 (§6.1 참조)
- 가능 시 plan-generation/intake 공통 헬퍼로 extract — drift 방지
- 검증:
  - DevTools Network panel: `/api/intake` payload에 `client`, `routeOrPage`, `language` 포함
  - orchestrator 로그에서 ctx.client / ctx.routeOrPage 값 출력
- 단위 시나리오:
  - 캡처 + chat (capture context wins): selectedCapture.rect.{client,language,pagePath} 우선
  - 캡처 없이 chat: liveContext에서 resolve
  - Slack/sandbox default: null/`'/'` 값 — F3a truthiness 규칙으로 prepend 차단 확인

### Slice F3a — prd-analyzer user message prepend (cache-safe) *(30-45min)*
- `buildPrdUserMessage(text, ctx)` 만 수정 — system prompt 손대지 않음
- Truthiness rule 적용 (§6.3 참조)
- 단위 검증: paired smoke (parent plan §6의 smoke 1 케이스 재실행, n=5 paired)
- 게이트: F4-F3a 측정 결과로 결정 (아래)

### Slice F3b — prd-analyzer system prompt 보강 (조건부, F4-F3a fail 시) *(45min-1h)*
- F4-F3a 측정에서 ambiguous 잔존 시에만 진입
- SYSTEM_PROMPT line 19 영역에 1줄 추가
- **2중 게이트**:
  - 기능: paired ambiguous 비율 감소
  - 회귀 방지: paired `cache_read_input_tokens / (cache_read + cache_create)` ratio drop ≤ 10pp
  - drop 초과 시 revert + 사용자 message에서 강한 instruction으로 우회

### Slice F4 — 측정 (Slice 1.4 본체, paired-only — momus M2/M4) *(1.5h)*
- **5 케이스 paired smoke** (before/after 동일 입력):
  - "예약형 주문 리스트 보관 옆 삭제 탭" (오늘 케이스 재현)
  - "캠페인 리스트 옆에 internal 필터 추가"
  - "Creative Detail의 status 칸을 dropdown으로"
  - "Audience 페이지에서 검색창 우측에 export 버튼"
  - "Ad Group 리스트의 column visibility 토글"
- F2 적용 후 1회, F3a 추가 적용 후 1회, (필요 시) F3b 추가 적용 후 1회
- **Primary 메트릭 (M4 — Real Screens Priority):**
  - 각 case의 `plan_emit` 도달 시 `referenced_components` 정확도 — manual reviewer 평가:
    - 모든 component file path가 disk에 존재하는가
    - "이 페이지/컴포넌트를 실제로 수정할 텐가" 라는 질문에 reviewer가 yes/no 판정
- **Secondary 메트릭:**
  - intake_result.kind 분포 (paired before/after): `code_change_ambiguous` 발사 빈도, `plan_emit` 발사 빈도
  - plan_items 수 평균
- **n=5 paired 통계 언어 (M2):**
  - 게이트는 절대 비율이 아니라 **paired before/after delta**. 5/5 → 5/5 이면 fix 무효. 5/5 → 2/5 이면 n=5에서도 강한 시사. 단일 case라도 paired flip이면 partial-positive.
  - 절대 비율 게이트 (`≤ 2/5`) 폐기

### Slice F5 (조건부) — classifier image 전달 *(1.5h)*
- F4 모든 단계 (F2 + F3a + F3b) 다 적용했는데 잔존 ambiguous 비율 unchanged 시
- molly-classifier.js에 attachment 전달 + image block 첨부
- 비용 영향 측정 (classifier 호출은 모든 intake에 1회 — 토큰 비용 base 증가)

---

## 8. 검증 / 측정

### 8.1 기능 검증 (F2~F3)
- [ ] Chrome ext intake payload에 `client`, `routeOrPage` 포함 확인 (DevTools Network panel)
- [ ] orchestrator 로그에 ctx.client / ctx.routeOrPage 값 출력
- [ ] prd-analyzer LLM 호출의 user message 첫 줄에 `Context: client=... route=...` prepend 확인
- [ ] image 없이 chat → route만 송신, prd-analyzer는 image block 없이 동작 그대로
- [ ] image 있고 route 없음 (예: Slack) → 기존 동작 그대로 (regression 없음)

### 8.1+ Truthiness rule 검증 (momus M3 추가)
- [ ] `route='/'` → prepend 생략
- [ ] `route=''` 또는 `route=null` → prepend 생략
- [ ] `client='msm-default'` → client 부분 생략 (route는 유효하면 살림)
- [ ] intake site / plan-generation site 의 resolved 값 drift 없음 확인

### 8.2 품질 측정 (F4 — paired-only, momus M2)
- 5 케이스 paired smoke (각 case 동일 입력 + 동일 region)
- **Primary 메트릭 (momus M4 — Real Screens Priority):**
  - `plan_emit` 도달 시 `referenced_components` 정확도 — manual reviewer 채점:
    - component file path가 disk에 존재 (yes/no)
    - "이 페이지의 실제 컴포넌트를 수정할 텐가" reviewer 판단 (yes/no/partial)
- **Secondary 메트릭:**
  - paired before/after kind 분포 변화 (5/5 → N/5)
  - plan_items 수 평균
- **통계 언어 (momus M2):**
  - "≤ X/5" 같은 절대 비율 게이트 사용 안 함
  - paired flip 수만 보고 (5건 중 N건 ambiguous→plan_emit)

### 8.3 비용 / latency / cache
- F2: route prepend ~20 tokens (system block 미터치 → 무시 가능)
- **F3b 진입 시 (momus M1):**
  - paired `cache_read_input_tokens / (cache_read + cache_create)` ratio 측정 ≥ 5 runs
  - drop > 10pp 시 revert
- F3a/F3b 후 prd-analyzer latency P50 — 큰 변화 없음 가설

---

## 9. 리스크 / 미해결 질문

| 리스크 | 영향 | 대응 |
|--------|------|------|
| RC가 실제로 B (visual 추론 한계)였다면 F2/F3a로 안 풀림 — RC-B/C 분리 불가 인정 (B2) | medium | F4 paired 측정 → F3b → F5 단계적 분기 |
| F3b가 fddf2ec cache 측정 회귀 — `cache_read / (read+create)` ratio drop > 10pp | **high** (M1) | F3b 게이트에서 측정 → 초과 시 revert + 다른 levers |
| route prepend로 prd-analyzer가 false-positive "clear" — 잘못된 페이지 추정 | low-medium | F4 manual reviewer spot-check (M4 primary 메트릭) |
| Chrome ext에서 route가 SPA hash route 또는 search params 포함 — `content-script.js:473` 이미 hash 포함 builder (n2 해결) | low | F2 sample URL 5개 확인 후 처리 |
| Multi-tab — sidepanel 열어둔 채 다른 탭 캡처 — intake site는 plan-gen site의 precedence rule 복제 필요 | **medium** (m4 상향) | F2에서 `selectedCapture.rect.client` 우선 + acceptance check로 강제 |
| Truthiness rule 잘못 정해 truly-empty route를 valid로 흘려보냄 (M3) | medium | §8.1+ 4건 명시 검증 |
| `referenced_components` 정확도 측정에 manual reviewer overhead | low | F4 1.5h 추정에 포함 |

**미해결 (defer):**
- 캡처 시점 vs intake 시점 사이 탭 전환 — race
- BFCache / 동일 탭 SPA navigation에서 route 갱신 누락
- classifier image 전달 (F5 조건부)
- Slack에 route 등가물 (channel/thread → page mapping) 의 의미

---

## 10. 추정

| Slice | 추정 (coding only) |
|-------|------|
| F1 RC-A 측정 | 15min |
| F2 Chrome ext route/client/language 송신 (기존 resolver 재사용) | 30-45min |
| F3a prd-analyzer user message prepend (cache-safe) | 30-45min |
| F3b prd-analyzer system prompt 보강 (조건부) — prereq recordEvent 확장 5-10min 포함 | 1-1.5h |
| F4 Slice 1.4 paired 측정 (manual reviewer 포함) | 1.5h |
| **Coding 합계 (F3b 제외)** | **~3-3.5h** |
| **Coding + ceremony 합계 (m3)** | **~5-6h** — ceremony: critic 리뷰, ext reload, paired runs ~5-10min/each |
| F3b (조건부) | +45min-1h |
| F5 (조건부) | +1.5h |

---

## 11. 검토 후 진행 순서

1. v2 plan을 **2차 momus 리뷰** (B1-B2-M1-M4 반영 확인)
2. F1 (15min, 측정만, 무위험) → outcome tree 따라 분기:
   - RC-A 확정 → image 송신/persist path fix
   - RC-A 배제 → F2 진입
3. F2 → F4(F2) → 잔존 ambiguous 있으면 F3a → F4(F3a) → 잔존 있으면 F3b → F4(F3b)
4. F3b 진입 시 cache-hit ratio gate 통과 필수
5. 모든 단계 후 잔존 시 F5 (classifier image) 또는 Track 2 (region-targeted edit) 분기

---

## 12. 메모리/핸드오프 업데이트 영향

- `project_canvas_app.md` — Lane 2 Slice 1.4 측정 시작 + 결과
- 새 핸드오프 (F4 완료 후) — Slice 1.4 결과 + 잔존 ambiguous 분류 (있다면)

---

*Plan 작성: 2026-05-19 Claude session. parent plan 의 Slice 1.4 게이트가 미달 상태에서 user-reported n=1 negative 발생 → 즉시 fix 분기.*
