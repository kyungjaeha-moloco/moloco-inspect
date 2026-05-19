# Handoff — 2026-05-19: Plan-emitter V2 (description user-facing) + multi-surface UI cleanup + Playground lifecycle UI

**Date:** 2026-05-19 (저녁 세션, ~14:00-20:30)
**Author:** kyungjae.ha (with Claude session)
**Branch:** main
**Predecessor handoff:** `docs/superpowers/handoffs/2026-05-19-screenshot-page-inference-and-slack-ux.md`

---

## TL;DR

오전 세션 fix 위에 올라온 **저녁 세션 13건 변경**. 핵심은 **plan-emitter v2** (title + description 둘 다 user-facing job-style) + **3 surface UI cleanup** (`target_file` 노란박스 제거) + **Playground lifecycle UI** (Idle/Archive 메뉴). 사용자 reported 4건 issue 진단 + followup으로 기록.

**Shipped (코드 변경):**

1. ✅ **server.js `/api/intake` language 매핑 fix** — `payload.language` → `ctx.language` 누락 1줄 추가. 오전 `language_attached=0` 미스터리 해결. paired smoke `0 → 1` 확인.
2. ✅ **plan-emitter V1** — SYSTEM_PROMPT에 `## Item title rule (USER-FACING)` 섹션 + Language rule을 PRD 언어 매칭으로. paired smoke 4/5 PRD clean title (1건 warmup JSON truncate).
3. ✅ **plan-emitter V2 (description도 user-facing)** — V1 섹션을 `## Item style rule (USER-FACING — applies to title AND description)` 으로 확장. decomposer SYSTEM_PROMPT 룰 통합. "이 작업이 끝나면 ... 보입니다" + `(1)(2)(3)` 구조 강제. forbidden tokens (PascalCase identifier, file path, import, framework keyword, backtick) 모든 prose에서 제거. file/component refs는 `target_file`/`referenced_components`/`unresolved_components` 스키마 필드로 분리. paired smoke **5/5 PRD fully clean (0/27 title violations + 0/27 description violations + 5/5 dev refs schema preserved)**.
4. ✅ **max_tokens 증가** — `thinkingBudget + 4096` → `thinkingBudget + 14336` (즉 6144 → 16384). V1 적용 후 thinking 폭주로 JSON truncate / empty response 발생 → fix.
5. ✅ **debug logs** — empty response 시 `stop_reason` + content blocks dump, JSON parse 실패 시 raw + context 주변 120 chars dump (production-ready 진단 정보).
6. ✅ **Slack plan card `target_file` 노란박스 제거** (`molly.js:1644-1647`) — description 끝에 자동 표시되던 inline code 영구 제거.
7. ✅ **Chrome ext plan card `target_file` `<code>` block 제거** (`sidepanel.js:2591-2600`).
8. ✅ **Playground plan card `targetFile` 영역 제거** (`AIPanel.tsx:3163-3196`).
9. ✅ **LivePreview placeholder 친절 메시지 + spinner** (`LivePreview.tsx:399-415`) — "Vite port not assigned / Resume or restart required" → "Preview 준비 중… · 새 Playground 의 개발 서버가 시작되고 있어요. 보통 20–30초 정도 걸립니다. 준비가 끝나면 이 자리에 자동으로 미리보기 화면이 나타납니다." + 회전 spinner.
10. ✅ **PlaygroundList lifecycle 메뉴** (`PlaygroundList.tsx`) — 각 카드 우상단 `⋯` 버튼 → popup menu: `💤 Idle` / `▶ Resume` / `↻ Restart` / `📦 Archive` (status별 conditional). `useState`/`useRef` + click-outside + Esc close.
11. ✅ **PlaygroundDetail Header lifecycle 버튼** (`PlaygroundDetail.tsx`) — Promote 옆에 `💤 Idle` + `📦 Archive` (status='active'일 때). Archive는 `window.confirm` dialog 필수.
12. ✅ **Idle section collapsible** (`PlaygroundList.tsx`) — `<Section>` → `<CollapsibleSection>`. 14개 카드가 펼쳐져 있던 노이즈 해소.
13. ✅ **Language rule emphatic + worked examples 강화** — 모델이 `client=tving` signal로 한국어 결정하는 케이스 발견 후, SYSTEM_PROMPT의 Language rule을 step-by-step + 3 worked examples (Tving=Korean app 위에서 영어 PRD → 영어 응답)로 다시 강화. 사용자 검증 1건 pending.

**Paired smoke tooling (재사용 가능):**
- `orchestrator/scripts/plan-emitter-paired-smoke.mjs` — 5 PRD + warmup, output + metrics 자동 저장 (`docs/measurements/plan-emitter-paired-{label}-{date}.json`).
- `orchestrator/scripts/plan-emitter-paired-evaluate.mjs` — title/description forbidden tokens 자동 검사 + dev refs schema 보존 검증 + per-PRD pass/fail.

---

## 1. Trigger + 흐름

### 1.1 사용자 reported issue 5건 (오늘 저녁)
1. **Slack plan card에 코드 식별자 가득** — `MCCreativeReviewContainer.tsx`, `MCBarTabs`, `useSearchParams` 등이 description에 노란색 inline code로 노출 (스크린샷 #20). plan v2 §3.1 G2 비목표 ("body는 dev detail OK") 결정의 reverse 신호.
2. **"Playground 수준으로 동일하게"** — Playground UI는 backtick 안 render → plain text. Slack은 inline code render. 사용자 의도 = description 자체에서 dev token 제거 + Playground 수준 깔끔.
3. **Job 직접 사용 시점에는 description이 깔끔** (스크린샷 #23) — Job task의 `"이 작업이 끝나면 ... 보입니다"` + `(1)(2)(3)` 구조가 사용자 기준 모델. plan-emitter도 동일 style로.
4. **영어 PRD인데 한국어로 답함** (스크린샷 #28) — V1의 "ctx.language signal 우선" 룰이 PRD body 영어를 override. → language rule 재정의.
5. **Slack progress messages 정상 작동** (오전 §1.3, P3 사용자 검증 완료) — 핸드오프 carryover.

### 1.2 Playground UX 진단 5건 (병렬)
- iframe 안 뜬다 (스크린샷 #21) → 의도된 boot waiting state, but no feedback to user → LivePreview placeholder 친절 메시지.
- 새 Playground 생성 시 비어 보임 → 같은 위 문제. spinner + 안내 메시지 추가.
- Resume 안 됨 (81d56268, 스크린샷 #29) → 14개 container 동시 운영으로 vite/esbuild 반복 crash + opencode SIGKILL → 잔재 stuck. system 리소스 정리 후 호전.
- Verifying types stuck (8bac9303, 스크린샷 #30) → orchestrator의 task pipeline event drop. backend는 complete, UI만 spinner stuck. fresh fetch도 같음 = backend state stuck. **followup item.**
- Review fail "DS component 미사용" (스크린샷 #32) → 코딩 agent가 hand-rolled `<button>` 만들었는데 review agent가 strict DS 강제로 fail. 사용자 의도 "새 페이지/컴포넌트 만드는 중이라 strict 약화 원함" → **followup item (plan v4).**

---

## 2. Shipped 변경 inventory

### 2.1 orchestrator (3 파일)

| 파일 | 변경 |
|---|---|
| `orchestrator/server.js` | `/api/intake` ctx에 `language: payload?.language` 1줄 추가 (3271-3273) |
| `orchestrator/lib/molly-plan-emitter.js` | (a) `max_tokens: thinkingBudget + 14336` (b) Language rule 3회 진화 (PRD 매칭 → emphatic + examples) (c) USER-FACING title 섹션 → title+description 통합 섹션 (decomposer 룰 + "이 작업이 끝나면" + (1)(2)(3) + forbidden tokens + dev refs schema 분리 가이드) (d) userPrompt에 짧은 스타일 reminder (e) empty/JSON-parse 실패 시 debug dump |
| `orchestrator/lib/molly.js` | Slack plan card render 시 `target_file` `\\\`...\\\`` 인라인 출력 제거 (1644 → 삭제, 1647 텍스트 템플릿에서 `${file}` 제외) |

### 2.2 chrome-extension (1 파일)

| 파일 | 변경 |
|---|---|
| `chrome-extension/sidepanel.js` | plan card render에서 `target_file` `<code>` block 영역 제거 (2591-2600) |

### 2.3 playground-app (4 파일)

| 파일 | 변경 |
|---|---|
| `playground-app/src/editor/AIPanel.tsx` | `📄 src/...` `targetFile` segment 영역 제거 (3163-3196) |
| `playground-app/src/editor/LivePreview.tsx` | `vitePort=null` placeholder를 spinner + 친절 메시지로 교체 (399-415) |
| `playground-app/src/pages/PlaygroundList.tsx` | (a) `hibernatePlayground` / `archivePlayground` / `resumePlayground` import (b) `handleLifecycle` handler (archive 시 `window.confirm`) (c) 3 CardGrid 호출에 `onLifecycle` props (d) `CardGrid` → `PlaygroundCard` → 우상단 `CardActionMenu` (⋯ 버튼 + dropdown, click-outside, Esc close) — status별 conditional items: active=[💤 Idle, 📦 Archive] / hibernated=[▶ Resume, 📦 Archive] / crashed=[↻ Restart, 📦 Archive] (e) Idle section `<Section>` → `<CollapsibleSection>` |
| `playground-app/src/pages/PlaygroundDetail.tsx` | (a) `hibernatePlayground` / `archivePlayground` import (b) `handleHibernate` / `handleArchive` handlers (Archive는 confirm) (c) Header에 `onHibernate` / `onArchive` props (d) Header render: status='active'일 때만 Promote 옆에 `💤 Idle` + `📦 Archive` 버튼 (secondary/danger style) |

### 2.4 측정 tooling (2 신규 파일)

| 파일 | 역할 |
|---|---|
| `orchestrator/scripts/plan-emitter-paired-smoke.mjs` | 5 PRD + warmup, emitPlan 직접 호출 (별 node process), output JSON 저장 + metrics ndjson 자동 기록. `before` / `after` label 인자 |
| `orchestrator/scripts/plan-emitter-paired-evaluate.mjs` | smoke 결과 JSON 입력, title/description forbidden tokens 자동 regex 검사 (PascalCase identifier, file path, import, framework keyword, backtick code), dev refs schema 보존 검증, per-PRD pass/fail summary |

### 2.5 paired smoke result (V2 after, 5 PRD)

| PRD id | dt_ms | items | refs/unresolved | title violations | description violations |
|---|---|---|---|---|---|
| `creative-review-deleted` | 162858 | 5 | 7/1 | 0 | 0 |
| `campaign-list-filter` | 93437 | 6 | 7/2 | 0 | 0 |
| `creative-detail-status` | 128759 | 6 | 7/1 | 0 | 0 |
| `audience-export` | 87616 | 4 | 3/0 | 0 | 0 |
| `adgroup-column` | 88133 | 6 | 6/1 | 0 | 0 |
| **Total** | — | **27** | — | **0** | **0** |

V3 gate: title clean 5/5, description clean 5/5, dev refs schema 5/5 PRD, per-PRD fully clean 5/5.

Output 저장: `docs/measurements/plan-emitter-paired-after-2026-05-19.json`.

### 2.6 baseline cache ratio (V1 deploy 전 plan-emitter records, `state/molly-metrics-2026-05-19.ndjson`)

5건 호출, aggregate cache_read_ratio = 0.600 (2건 cold, 3건 hit). V2 after pass 4건 hit (cache_read=112825, cache_create=0) — cache topology 안 망가짐 확인.

---

## 3. Plan 문서 (carryover)

| 파일 | 상태 |
|---|---|
| `docs/superpowers/plans/2026-05-19-plan-emitter-user-facing-titles.md` (v2) | **DEPRECATED** — V2 update가 이 plan 범위(title only)를 description까지 확장하면서 사실상 superseded. 다음 세션에서 v3로 메모 추가 또는 archive. |
| `docs/superpowers/plans/2026-05-19-ds-missing-ai-judge-governance.md` (v3) | **APPROVED, 실행 대기** (오전 §3.3 그대로). |

---

## 4. 측정 데이터

### 4.1 Language fix (오전 paired)
| | Before | After |
|---|---|---|
| `language_attached` | 0 | **1** ✅ |
| Server fix location | (없음) | `server.js:3273` |

### 4.2 V2 plan-emitter (5 PRD after pass)
- Title rubric violations: **0/27**
- Description rubric violations: **0/27**
- Schema dev refs (referenced_components + unresolved_components) 보존: 5/5 PRD
- Cache hit ratio after warmup: 4/4 PRD `cache_read=112825 cache_create=0`
- First-attempt success rate: 5/5 (V1에서 1건 JSON truncate 있던 게 max_tokens 16384 + V2 prose 단순화로 사라짐)
- 평균 latency: 87-163s (큰 PRD 일수록 길어짐)

### 4.3 Surface UI fix (3건)
- Slack `target_file` 노란 박스: 사용자 검증 1회 완료 (Plan card 결과 깔끔)
- Chrome ext: Chrome ext reload 필요 (사용자 액션, 검증 pending)
- Playground: vite HMR 자동 반영 (사용자 검증 pending — 페이지에서 확인 가능)

### 4.4 Language rule v3 (emphatic + worked examples)
- 사용자 보고: client=tving 일 때 영어 PRD → 한국어 응답 case 발견 (스크린샷 #28, #31)
- Fix: SYSTEM_PROMPT의 Language rule을 step-by-step + 3 worked examples로 재강화
- 검증 pending: 사용자 다음 영어 PRD test 결과

---

## 5. Followup items (다음 세션 우선순위)

### 5.0 Process principle — confusion-free user flow first (2026-05-19 저녁 사용자 결정)

> "다음 세션에서 이런 과정들을 사용자가 혼란스럽지 않게 우선 진행하고, 이후에 평가나 피드백을 통해서 지속적으로 개선하는 프로세스로 가면 좋겠어"

→ 모든 stuck / skip / review-fail / resume 경로의 UX (사용자가 무엇이 일어났고 다음에 무엇을 해야 하는지 한눈에 이해 가능) 를 **먼저 안정화**, 그 후에 짧은 평가/피드백 loop로 점진 개선. 즉 다음 세션은 *기능 추가*보다 *흐름 명료화* 우선. plan v4 (review strict 약화), Skip cascade UX, ExecutionCard event drop 세 가지가 그 부분.

### 5.1 우선순위 표

| 순위 | 항목 | 추정 | 근거 |
|---|---|---|---|
| 🥇 1 | **Skip → BLOCKED cascade UX (Plan v4와 묶음, confusion-free 우선)** — (a) Resume 버튼이 모든 next task가 blocked일 때 disabled + tooltip ("모든 다음 task가 blocked — skip 결과 직접 처리 필요") (b) Skip 클릭 시 confirm dialog: "이 task를 skip하면 N개 dependent task가 blocked됩니다. 계속?" (c) force-unblock 또는 "Mark as done with empty output" 옵션 (d) silently-paused 후 toast/banner로 사용자에게 결과 피드백 | 2-3h | 오늘 사용자 직접 hit (job 7e3c57f9 case) |
| 🥇 1b | **원본 PRD 표시 UI (Job/Playground 페이지)** — 사용자가 보낸 원본 PRD text가 `job.prdText` 필드에 저장되지만 어디에도 노출 안 됨. plan_items / chat history 와 별도로 collapsible section ("📝 Original PRD") 추가. Slack thread / Chrome ext / Playground 3 surface 모두 적용. confusion-free 그룹 — "내가 무엇을 보냈더라?" 확인 가능해야 다음 액션 결정 가능 | 1-2h | 오늘 사용자 직접 발견 (마지막 메시지) |
| 🥈 2 | **Review fail "new build" badge & strict 약화 (Plan v4 core)** — plan_items에 `is_new_build: true` flag 또는 lifecycle status "BUILDING_NEW" + review agent prompt에 "new component 도입 task 는 hand-roll 수용" 룰 추가 | 1h plan + 2-4h 실행 | §1.2 issue #5 사용자 의도 명시 |
| 🥉 3 | **Language rule v3 검증** — 영어 PRD/Tving client에서 영어 응답 확인. 여전히 한국어면 ctx 격리 (system prompt에서 client/language 분리, 또는 user message로만 격리) | 30min | §4.4 |
| 4 | **ExecutionCard completion event drop fix** — verification step polling completion miss 시 spinner 영구화 (8bac9303 #70e37cd6 case). backend 데이터에 stuck state 영구 저장 → orchestrator task pipeline의 update event drop 또는 frontend polling 보강 | 1-2h | §1.2 issue #4 |
| 5 | **plan v2 (user-facing titles) plan 문서 정리** — DEPRECATED 표시 + V2 내용으로 update 또는 별 plan v3 새로 작성 | 30min | §3 |
| 6 | **F4 paired smoke 5-case (page-inference, 오전 carryover)** | 1.5h | 어제 §5 #3 |
| 7 | **Plan 3 (DS AI judge + governance) 실행** | 10.5-15h | 별 세션 권장 |
| 8 | **Pre-plan clarification 메커니즘** — 사용자 더 고민 중 | TBD | 어제 §6 #1 |

순위는 §5.0 원칙을 따름 — **사용자 confusion 줄이는 항목 (1, 2, 3, 4) 먼저**, 그 후 인프라/측정 (5, 6), 마지막 큰 신규 plan (7, 8). 각 단계 이후 짧은 평가 (사용자 직접 한두 case 발사 + 결과 review) → 다음 항목 진입.

---

## 6. 미해결 결정 / decision points

| # | 항목 | 위치 |
|---|---|---|
| 1 | Language rule v3가 충분한가 — 아니면 ctx.client/language를 system prompt에서 제거하고 user message로만 격리할 것인가 | §4.4 검증 결과 따라 결정 |
| 2 | Review fail 약화 모델 — plan v4의 (A) plan_items에 `is_new_build` flag vs (B) lifecycle status "BUILDING_NEW" badge | 별 plan v4 작성 시 |
| 3 | ExecutionCard event drop fix — orchestrator 변경 vs frontend polling-with-timeout-recovery | followup §5 #3 |
| 4 | plan v2 문서 → DEPRECATED vs update | §3 |
| 5 | 12 day+ container 정리 후 시스템 안정성 — 사용자가 일부 hibernate 했음. 추가 정리 필요 여부 다음 세션에 다시 평가 | docker ps 상태 |

---

## 7. Service ports + verification (2026-05-19 저녁 종료 시점)

- orchestrator `:3847` ✅ listening (PID 84673 추정, 마지막 PID 25105 → 자동 reload 후 변경)
- design-system-site `:4176` ✅ (이전 핸드오프 같음)
- playground-app `:4180` ✅ (PID 10939)
- dashboard `:4174` ✅ (가정 — 미검증)
- docker containers: 사용자가 일부 hibernate 처리. 정확한 active count는 다음 세션 시 `docker ps` 로 확인.

---

## 8. Memory 갱신 권장

| 메모리 항목 | 갱신 내용 |
|---|---|
| `project_canvas_app.md` | V2 plan-emitter (description user-facing) ship 완료 표시. surface UI cleanup 3건 적용. Playground lifecycle UI 추가. |
| `project_ds_direction.md` | (변화 없음 — plan 3 DS AI judge 실행 안 함) |
| `project_molly_ds_loop.md` | Plan-emitter v2 → decomposer 파이프라인 검증 1건 (creative-review-deleted) 통과. follow-up: 5-case full pipeline. |
| 새 메모리 `project_review_strict_vs_explore.md` (follow-up §5 #2 진행 시) | Review agent strict DS 강제 vs 새 컴포넌트 도입 흐름 trade-off + UX 모델 결정 기록 |

---

## 9. 관련 파일 인덱스

### 코드 변경 (8 파일)
- `orchestrator/server.js` — language 매핑 fix
- `orchestrator/lib/molly-plan-emitter.js` — V1 → V2 → language rule emphatic
- `orchestrator/lib/molly.js` — Slack target_file 제거
- `chrome-extension/sidepanel.js` — Chrome ext target_file 제거
- `playground-app/src/editor/AIPanel.tsx` — Playground target_file 제거
- `playground-app/src/editor/LivePreview.tsx` — placeholder 친절 메시지
- `playground-app/src/pages/PlaygroundList.tsx` — lifecycle 메뉴 + Idle collapsible
- `playground-app/src/pages/PlaygroundDetail.tsx` — Header lifecycle 버튼

### 새 파일 (2)
- `orchestrator/scripts/plan-emitter-paired-smoke.mjs`
- `orchestrator/scripts/plan-emitter-paired-evaluate.mjs`

### 측정 출력 (1)
- `docs/measurements/plan-emitter-paired-after-2026-05-19.json`

### 핸드오프
- 본: `docs/superpowers/handoffs/2026-05-19-plan-emitter-v2-user-facing-and-ui-cleanup.md`
- 오전 같은 날: `docs/superpowers/handoffs/2026-05-19-screenshot-page-inference-and-slack-ux.md`

---

*Handoff 작성: 2026-05-19 저녁 Claude session. 13 코드 변경 + 2 측정 도구 + V2 paired smoke 5/5 PRD pass + 5건 사용자 reported issue 4건 해결 + 2건 followup. 다음 세션은 language rule v3 검증 → plan v4 (review strict 약화) 가 우선.*
