# Plan v2 — Open CoDesign-inspired 6 tracks

**Date:** 2026-05-17
**Author:** kyungjae.ha (with Claude session)
**Supersedes:** `docs/superpowers/plans/2026-05-16-open-codesign-inspired-six-tracks.md` (v1, REVISE 판정 받음 — momus 리뷰 2026-05-16)
**Status:** draft v2 — momus 재리뷰 대상
**Source inspiration:** [OpenCoworkAI/open-codesign](https://github.com/OpenCoworkAI/open-codesign) (Electron-based BYOK Claude Design alternative, Agentic Design v0.2.0)

---

## 0. v2에서 반영한 11개 항목 (momus 리뷰 2026-05-16)

| # | Severity | 항목 | v2 반영 위치 |
|---|----------|-----|------|
| A1 | blocker | selectionRect는 active server.js에 도달 안 함 (`server.legacy.js:1330`만 read) → T2.2 30min → 2h | Track 2 §, §6 측정 |
| A2 | blocker | Ontology Phase 2 enum 위치/스키마 미합의 → T6.0 추가 (0.5d) | Track 6 §, §의존 |
| A3 | blocker | molly-plan-emitter 직렬화 라인 정정 (177-188), `cache_control: ephemeral ttl 1h` 부착 위치 = component-props.json 마지막 블록 (line 186) | Track 1 §, §1.2 |
| A4 | high | "1.3" self-reference → Lane 2 plan slice 인용 | Track 2 §T2.0 |
| A5 | high | unresolved_components escalate 흐름 인용 | Track 1 §T1.4 |
| B | high | 우선순위 재배치: Track 1 → 2 → 6 → 5 → 4 → 3 | §2 우선순위 |
| C | high | 의존 그래프 내부 모순 해소 + Lane 2 → Track 6 화살 삭제 | §의존성 그래프 |
| D1 | high | typecheck pass rate baseline 측정 + n≥10 | §6 측정, §1.0 |
| D2 | high | retention 정책 구체화 (30일 / 100MB / cron) | Track 5 §T5.0 |
| D3 | high | PII redact whitelist 초안 5-10 패턴 | Track 6 §T6.0 |
| D4 | medium | selectionRect 좌표계 명시 (CSS px @ devicePixelRatio) | Track 2 §T2.0 |
| D5 | medium | skill activation trigger T4.0 1d 확장 + G1/G2/G3 게이트 | Track 4 §T4.0 |
| H | blocker | Lane 2 측정 게이트 (n=5 positive) → Track 2 시작 조건 명문화 | Track 2 §gate, §의존 |

**총 추정**: v1 8-13d → **v2 12-18d** (momus 권장 반영).

추가:
- v1에서 "의도적으로 제외" 명시 없던 항목 → §3-2 추가 (multi-model BYOK / voice input / prompt template UI)
- v1 Track 5 export bundle → §Track 5 T5.5로 추가 (momus 권장)

---

## 1. 6 Track 매트릭스 (v2 — 사실관계 정정)

| # | Track | 핵심 가치 | 우리 현 상태 (정정) | 의존성 |
|---|-------|----------|---------------------|--------|
| 1 | **DESIGN.md 응축본** | plan-emitter system block 비용 ↓, cache 안정성 ↑ | `orchestrator/lib/molly-plan-emitter.js:177-188` systemBlocks 배열. cache_control 부착 = **마지막 블록 component-props.json** (line 186) 에만 ttl 1h. components.json (line 182)는 캐시 prefix 안에 포함되지만 단독 cache 마커는 없음 | independent |
| 2 | **Region-targeted edit** | patch scope 좁힘 → typecheck/review pass rate ↑ | (정정) Chrome ext 페이로드에는 `selectionRect` 들어가지만 (`chrome-extension/sidepanel.js:4696`) active `orchestrator/server.js` 가 안 읽음. 유일 reader 는 `orchestrator/server.legacy.js:1330` (구버전). 이미지 LLM 흐름은 Lane 2 완료, **좌표는 미배선** | **Lane 2 측정 gate (n=5 positive)** |
| 3 | **Component variant 비교** | 컴포넌트 선택 정확도 ↑ | `design-system/src/components.json` 의 `functional_category` 메타 + Ontology Phase 0 ✅. DS site는 정적 view만 | Ontology Phase 0 ✅, DS site dynamic preview wrapper 추가 필요 |
| 4 | **Design skills 모듈화 (기획)** | grounding 정확도 ↑, 토큰 절약 | SYSTEM_PROMPT (~3KB) 한 덩어리 (plan-emitter.js:21-99) | — |
| 5 | **JSONL workspace session** | "왜 이렇게 됐지" 디버깅 + 시간여행 UX | git branch + state JSON + checkedOutSha (`orchestrator/lib/playground.js:523-1097`). 사용자 노출 부족 | independent (T5와 T6 통합) |
| 6 | **Tool-use audit log (회고적)** | 신뢰성 ↑, "agent가 뭐 했지" 사후 파악 | coder는 OpenCode SDK 사용. tool_use 외부 가시화 없음. Ontology Phase 2 enum 미합의 (handoffs/2026-05-12-three-lanes-summary.md:95에 1d 짜리로 등록만) | **Ontology Phase 2 enum 합의 (T6.0)** |

---

## 2. 우선순위 v2 (momus 권장 반영)

| 순위 | Track | 이유 | 추정 |
|------|-------|------|------|
| 🥇 1 | **Track 1 (DESIGN.md 응축)** | blocker 없음. 비용 즉시 측정 가능. Track 4 (skills) 의 토양 — 먼저 가야 함 | 2-2.5d |
| 🥈 2 | **Track 2 (region-targeted)** | **Lane 2 측정 게이트 통과 후** 진입. A1 정정으로 실제 배선 작업 포함 | 1.5-2.5d (gate 후) |
| 🥉 3 | **Track 6 (audit log)** | T6.0 (Ontology Phase 2 enum 합의) 선행 후 진입 | 1-1.5d |
| 4 | **Track 5 (JSONL session)** | Track 6과 같은 jsonl 파일에 통합 — Track 6 작업 후 자연 흡수 | 2-2.5d |
| 5 | **Track 4 (skills 기획+실행)** | T4.0 1d (3-gate) 기획 → T4.1+ 실행 2-3d | 3-4d |
| 6 | **Track 3 (component 비교)** | 큰 UI 변경. DS site dynamic preview wrapper 작업 포함 | 4-6d |

**총 추정 v2**: **12-18d** sequential. parallel 페어 검증:
- (1↔3) — Track 1은 system block 변경, Track 3은 DS site → 파일 disjoint, 가능 ✅
- ~~(1↔2)~~ — Track 1과 Track 2 둘 다 plan-emitter user/system 변경 → **parallel 부적합**, sequential 필수
- ~~(5↔6)~~ — momus 지적대로 두 track이 같은 jsonl 파일에 통합 → **parallel 아님 sequential (6 → 5)**

---

## 3. Track 상세

---

### Track 1 — DESIGN.md 응축본 *(🥇)*

**현재 사실관계 (정정):**
```js
// orchestrator/lib/molly-plan-emitter.js:177-188
const systemBlocks = [
  { type: 'text', text: SYSTEM_PROMPT },                                              // L178
  { type: 'text', text: `pm-sa-request-schema:\n${JSON.stringify(...)}` },             // L179
  { type: 'text', text: `patterns.json:\n${...}` },                                    // L180
  { type: 'text', text: `api-ui-contracts.json:\n${...}` },                            // L181
  { type: 'text', text: `components.json:\n${...}` },                                  // L182 — 가장 큰 블록 (~458KB)
  {
    type: 'text',
    text: `component-props.json:\n${...}`,
    cache_control: { type: 'ephemeral', ttl: '1h' },                                   // L186
  },
];
```

**Key fact:** `cache_control`은 마지막 블록 (component-props.json) **하나에만** 부착. Anthropic API는 이 블록까지의 prefix(=systemBlocks 전체)를 cache 시킴. components.json은 prefix 안에 있어서 cache_read에는 포함되지만 자체적으로 부착된 cache_control은 없음.

**아이디어:**
- 새 파일 `design-system/src/DESIGN.md` (5-15KB) — 응축본
- plan-emitter system block 재구성 (옵션 B 단계적 적용)

**슬라이스:**
- **T1.0 — 베이스라인 측정 (n≥10) — D1 + H1 반영** *(0.5d)*
  - 현 plan-emitter로 10건 PRD 실행
  - 메트릭: `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `referenced_components 항목 수`, `unresolved_components 항목 수`, plan_items의 typecheck pass rate (sandbox dry-run)
  - 산출: `docs/superpowers/research/2026-05-??-plan-emitter-baseline.md`
  - **임계값 (H1 통일):**
    - **(1) typecheck pass rate**: baseline 측정값을 N% 로 기록. 응축 후 (N − 10)%p 이상 **유지** 시 통과. (예: baseline 60% → 응축 후 ≥50% 유지)
    - **(2) input_tokens (non-cached 시점)**: 보조 지표 — cache hit 시 의미 약함 (smoke test 2026-05-17 측정에서 확인). primary 메트릭은 (3).
    - **(3) cache_creation_input_tokens**: 응축 후 baseline 대비 **−50% 이상 ↓** (실측 조정 2026-05-17 — 원안 −80% → 현실 −70% → 실측 후 −50%. T1+S3 paired 측정 결과 −52.6% 달성. −70% 도달은 patterns/api도 응축 필요 — grounding 핵심이라 별 Track으로 분리)
    - (1)은 회귀 가드. (3) 미달 시 응축 가치 없음 → 폐기 검토. **T1+S3 측정 결과 통과 (−52.6%)**.
- **T1.1 — `design-system/src/DESIGN.md` 작성** *(2-3h)*
  - 기존 components.json 분석 → 카테고리별 요약 + 핵심 컴포넌트 lookup index
  - visual_constraints / 토큰 표 / DS 원칙
  - 사용자 + designer 1차 리뷰
- **T1.2 — plan-emitter system block 옵션 B 적용 (cache_control 재설계 — A3 반영)** *(2-3h)*
  - 새 systemBlocks 배열:
    ```js
    [
      { type: 'text', text: SYSTEM_PROMPT },
      { type: 'text', text: `pm-sa-request-schema:\n...` },
      { type: 'text', text: `patterns.json:\n...` },
      { type: 'text', text: `api-ui-contracts.json:\n...` },
      { type: 'text', text: `DESIGN.md:\n...` },                                    // 신규 prefix
      { type: 'text', text: `components-index (name/category/status):\n...` },     // 요약본
      {
        type: 'text',
        text: `component-props.json:\n...`,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
    ]
    ```
  - components.json 전체 직렬화 제거. components-index 는 ~5-10KB (full body 의 1-2%)
  - **cache_control 위치 검토**: DESIGN.md를 마지막 블록으로 두는 옵션도 있음 — components-index가 자주 바뀌면 cache miss 잦으므로, DESIGN.md를 끝에 두면 cache prefix 가 더 안정. T1.3 측정에서 결정.
- **T1.3 — A/B 측정 (n≥10)** *(0.5d)*
  - 동일 PRD 10건에 대해 (full vs DESIGN.md) plan emit
  - 비교: input_tokens, cache_creation/read, referenced_components 정확도, latency, typecheck pass rate
  - 결과: `docs/superpowers/research/2026-05-??-plan-emitter-ab.md`
- **T1.4 — referenced_components fallback path** *(2-3h)*
  - plan-emitter가 hallucinated component name 을 만들면 → `orchestrator/lib/molly.js:1463 postMissingComponentCards()` + `orchestrator/lib/ds-escalation.js` 의 jsonl 흐름 (A5 인용)
  - `orchestrator/server.js:3195` `/api/missing-choice` 라우트가 이미 사용자 4-option UI 처리
  - 즉 응축 후 unresolved_components 증가 시 escalation 흐름이 자동 처리. 새 코드 없이 측정만 (escalate 비율 추이)

**T1 추정**: 2-2.5d (베이스라인 0.5d + DESIGN.md 0.5d + 적용 + A/B 0.5d + fallback 검증 0.5d)

---

### Track 2 — Region-targeted edit *(🥈, gate 필요)*

**시작 게이트 (H + B1 반영):**
> ⛔ **gate**: `docs/superpowers/plans/2026-05-13-screenshot-to-llm.md` 의 Slice 1.4 측정이 아래 **AND 3조건 모두 통과** 시 진입. 1개라도 fail 또는 inconclusive 면 Track 2 폐기 검토.
>
> **"positive" 정의:**
> 1. **kind 변환**: Lane 2 측정 케이스 n≥5건 중 ≥3건이 image 첨부 후 `intake_result.kind` 가 `code_change_ambiguous` → 다른 kind (`plan_emit`, `code_change_clear`) 로 전환
> 2. **closest_match 정확도**: 동일 케이스의 referenced_components 항목들에 대한 manual spot-check 정확도 ≥80%
> 3. **fallback_clear 비율**: image 첨부 전후 prd-analyzer 의 `fallback_clear` 증가 ≤5%p (이미지로 timeout 압박 X 확인)

**현재 사실관계 (A1 정정):**
- `chrome-extension/sidepanel.js:4696, 4515-4516` — selectionRect 페이로드 진입 ✅
- `orchestrator/server.legacy.js:1330` — selectionRect 유일 reader (구버전)
- `orchestrator/server.js` — selectionRect **0 hit** (active 서버는 무시)
- `orchestrator/lib/molly-plan-emitter.js` — selectionRect **0 hit**
- 즉 좌표 ↔ LLM 흐름은 미배선 상태

**좌표계 명시 (D4 반영):**
- `selectionRect`의 단위: **CSS pixels (devicePixelRatio 미적용)**
- `selectionScreenshotDataUrl`의 image: **devicePixelRatio 적용된 raw pixels** (browser captureVisibleTab 출력)
- prompt에 명시: "The rect is in CSS px @ DPR=1; the attached image is at device pixel resolution. Use the image as the visual ground truth; the rect numbers are for code-level scope identification."

**슬라이스:**
- **T2.0 — Lane 2 측정 게이트 통과 확인 (A4 반영)** *(0.5h)*
  - `docs/superpowers/plans/2026-05-13-screenshot-to-llm.md` Slice 1.4 측정 결과 확인
  - n≥5 positive 확인. 아니면 T2.x 중단
- **T2.1 — `/api/intake` 라우트 + ctx 흐름 (A1 정정)** *(1h)*
  - `orchestrator/server.js:3239+` intake route가 `payload.selectionRect` 를 ctx 로 전달
  - 이미 `payload.selectionScreenshotPath` / `selectionScreenshotMimeType` 가 ctx.attachment 로 흐르는 패턴 있음 — 그 옆에 `ctx.selectionRect` 추가
- **T2.2 — plan-emitter user prompt 에 selection scope 블록 (A1 + H3 반영 — 2h)** *(2h)*
  - `emitPlan(args, ctx)` 가 `ctx.selectionRect || args.selectionRect` 받음
  - **H3 가드 (필수)**: selection scope 블록 emit 조건 정책:
    ```
    if (selectionRect && imageBlock) {
      // 이미지 + 좌표 양쪽 다 있을 때만 visual ground truth 명시
      // → user prompt 마지막에 scope 블록 (좌표 + image reference) append
    } else if (selectionRect && !imageBlock) {
      // 좌표만 있을 때 — image reference 없이 좌표 기반 scope 블록만 append
      // (logging: `selection=coords_only`)
      console.warn('[plan-emitter] selectionRect without imageBlock — scope guidance is coordinate-only');
    } else {
      // selectionRect 없으면 scope 블록 미발행 (기존 동작 유지)
    }
    ```
  - selectionRect + image 시 prompt:
    ```
    ## Selection scope (user-specified)
    The user has selected a rectangular region of the page.
    - Coordinates (CSS px @ DPR=1): { x, y, w, h }
    - Visual reference: see the attached image (device-pixel resolution)
    - Constraint: limit changes to this region whenever possible.
      Plan items that target areas outside this region MUST justify why in the description.
    ```
  - selectionRect only 시 prompt: 위와 동일하되 "Visual reference" 줄 제거 + 마지막 줄에 "Coordinates are approximate — no visual ground truth available" 추가
  - logging: `selection=both | coords_only | none`
- **T2.3 — 측정 (A1 가설 검증)** *(2-3h)*
  - 같은 PRD + image attach 에 대해 (selectionRect 포함 vs 미포함) plan emit
  - n=5 spot-check, plan_items 의 in-scope/out-of-scope 분류
  - 결과: `docs/superpowers/research/2026-05-??-selection-scope-ab.md`
- **T2.4 (defer)** — coder adapter에 selection scope hint 전달 (별 plan 후보)

**T2 추정**: 1.5-2.5d (gate 후)

---

### Track 6 — Tool-use audit log (회고적) *(🥉)*

**v2 변경:**
- **T6.0 (Ontology Phase 2 enum 합의) 추가** — A2 반영
- 실행 시점 명시: **streaming X, 작업 완료 후 1회 batch fetch** — 사용자 합의 "회고적" 명문화

**슬라이스 (B2 반영 — T6.0 두 단계로 분할):**
- **T6.0a — OpenCode SDK tool_use emit 명세 조사 (1-2h)** *(B2 반영)*
  - SDK source/docs 조사: 어떤 도구 이름으로 tool_use 를 emit 하는가? payload schema 는?
  - 우리 coder는 OpenCode SDK 경유 (Lane 2 plan §229). 현 코드 `tool_use` / `toolUse` 0 hit → SDK 실제 emit 명세 unknown
  - SDK 가 trace API 를 expose 안 하면 SDK 로그 파싱 fallback path 도 검토
  - 산출: `docs/superpowers/research/2026-05-??-opencode-sdk-tool-use-trace.md` (짧은 ADR)
- **T6.0b — Ontology Phase 2 enum 최종 합의 (2-3h)**
  - T6.0a 결과 기반으로 enum 항목 확정 (Claude API 추측 11개에서 SDK 실제값으로 조정)
  - 초안 enum (T6.0a 후 정정 필요): `file_read`, `file_write`, `file_edit`, `bash`, `grep`, `find`, `ls`, `web_fetch`, `web_search`, `task_create`, `task_complete`
  - 각 항목의 input/output 스키마 (`input.path: string`, `input.command: string` 등)
  - jsonl 이벤트 포맷: `{ type: 'tool_use', tool: <enum>, input: <redacted_payload>, output: <redacted_payload>, ts, job_id, attempt_index }`
  - 산출물 위치: `orchestrator/lib/tool-use-schema.json` (T6.0a 결과로 변경 가능)
  - Ontology Phase 2 plan에 cross-link: `docs/superpowers/handoffs/2026-05-12-three-lanes-summary.md:95`
- **T6.1 — coder adapter에서 tool_use 추출** *(2-3h)*
  - OpenCode SDK가 작업 완료 후 tool_use trace 를 expose 하는지 확인 (streaming X)
  - 없으면 SDK 로그 파싱 fallback
- **T6.2 — PII redact whitelist (D3 반영)** *(1h)*
  - 초안 차단 패턴 (`orchestrator/lib/audit-redact.js`) — **H2 반영 16 패턴**:
    ```
    # Generic auth
    /API_?KEY[=:]\s*[\w-]+/gi                                    → [REDACTED:api_key]
    /BEARER\s+[\w.-]+/gi                                          → [REDACTED:bearer]
    /AUTHORIZATION:\s*[\w.-]+/gi                                  → [REDACTED:authz]
    /TOKEN[=:]\s*[\w.-]+/gi                                       → [REDACTED:token]

    # PASSWORD context-narrowed — shell command / env line만 매칭 (코드 라인 false-positive 회피)
    /(?:^|\s)(?:export\s+)?(?:[A-Z_]*PASSWORD|PASSWD|PWD)=\S+/gm  → [REDACTED:password]

    # Key blocks
    /-----BEGIN [\w ]*PRIVATE KEY-----[\s\S]*?-----END [\w ]*PRIVATE KEY-----/g    → [REDACTED:private_key]
    /-----BEGIN [\w ]*CERTIFICATE-----[\s\S]*?-----END [\w ]*CERTIFICATE-----/g    → [REDACTED:cert]

    # Provider-specific keys (H2 추가)
    /AKIA[0-9A-Z]{16}/g                                           → [REDACTED:aws_key]
    /sk-(?!ant-)[A-Za-z0-9]{20,}/g                                → [REDACTED:openai_key]
    /sk-ant-[A-Za-z0-9_-]+/g                                      → [REDACTED:anthropic_key]
    /AIza[0-9A-Za-z\-_]{35}/g                                     → [REDACTED:google_key]
    /ghp_[A-Za-z0-9]{36}/g                                        → [REDACTED:github_pat]
    /github_pat_[A-Za-z0-9_]{82}/g                                → [REDACTED:github_pat_fine]
    /xox[baprs]-[A-Za-z0-9-]+/g                                   → [REDACTED:slack_token]
    /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g       → [REDACTED:jwt]

    # PII (선택 — Tving end-user 데이터 가능성)
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g        → [REDACTED:email]
    ```
  - redact 함수는 input + output 양쪽에 적용. matched 부분을 `[REDACTED:type]` 으로 치환.
  - `type` 매핑 표는 위 화살표 옆에 표기 — UI 패널에서 hover 시 표시 가능 ("어떤 종류 비밀이 가려졌는지" 만 노출).
- **T6.3 — jsonl appender 통합** *(1h)*
  - Track 5의 jsonl 파일에 같이 append (T6 → T5 순서)
- **T6.4 — "Tool log" UI 패널** *(2-3h)*
  - dashboard 또는 Playground 사이드에 새 패널
  - 도구별 색상, 시간순/파일별 그룹화, redacted payload preview

**T6 추정**: 1-1.5d (T6.0 포함 시)

---

### Track 5 — JSONL workspace session *(우선순위 4)*

**v2 변경:**
- T5.0 retention 정책 (D2 반영) — 30일 / 100MB / cron
- T5.5 export bundle (momus 추천) — git diff + jsonl + state

**슬라이스:**
- **T5.0 — retention 정책 (D2 반영)** *(1h)*
  - 보관: 30일
  - 사이즈 캡: 100MB per playground (초과 시 가장 오래된 이벤트 GZ 압축 → cold storage `state/playgrounds/{id}/cold/` )
  - 실행 주체: cron (`orchestrator/scripts/jsonl-gc.mjs` — 매일 04:00 KST)
  - playground 종료 시 1회 즉시 GC도 실행
- **T5.1 — jsonl writer (T6.3 통합)** *(2-3h)*
  - 기존 event 5종 통합: `prd_text`, `plan_emit`, `plan_approve`, `coder_run`, `coder_diff`, `review_pass / fail`, `qa_screenshot`, `tool_use` (T6.2 합류)
- **T5.2 — dashboard "History" 탭** *(3-4h)*
- **T5.3 — 시점 복원 (read-only 우선)** *(2-3h)*
  - "이 시점 보기" 만. 실제 코드 복원은 별 슬라이스
- **T5.4 — JSONL download endpoint** *(30min)*
- **T5.5 — Export bundle (momus 추천)** *(1-1.5h)*
  - tar.gz: git diff (vs main) + history.jsonl + state.json + DESIGN.md snapshot
  - `/api/playground/:id/export` 다운로드

**T5 추정**: 2-2.5d

---

### Track 4 — Design skills 모듈화 (기획부터) *(우선순위 5)*

**v2 변경:**
- T4.0 0.5d → **1d** (D5 반영) + 3-gate (G1/G2/G3) 게이트

**T4.0 — 기획 (1d)**:
- **G1: skill 카테고리 final list** (markdown 1 page)
  - 잠정 10개: typography / layout / color / a11y / state / i18n / data display / form / navigation / feedback
  - 사용자 + designer 합의 도장
- **G2: trigger 메커니즘 결정** (1개 선택 + 근거)
  - 후보: auto (intent 기반) / user 선택 / hybrid
  - 권장: hybrid — 기본 auto, 사용자가 toggle 가능 (Settings page에 노출, runtime 가변)
- **G3: skill 1개 prototype 실행** (typography skill 실제 파일 + plan-emitter 통합 prototype)
  - 가치 검증 — A/B 측정 1회

**T4.0 산출:** `docs/superpowers/plans/2026-05-??-design-skills-modular.md`

**T4.1+ 실행 추정:** 2-3d (skill 작성 + system 변경 + 측정)

**T4 총 추정**: 3-4d

---

### Track 3 — Component variant 비교 패널 *(우선순위 6)*

**v2 변경:**
- T3.0 "비교 차원(dimensions) 정의" 추가 (#3 변형 합의 구체화)
- DS site dynamic preview wrapper 추정 명시 (1d 별도)

**슬라이스:**
- **T3.0 — 비교 차원 정의 (0.5d)** *(momus 권장)*
  - 비교 차원 합의 (택1 또는 다중):
    - props 타입 diff
    - anatomy slot diff (compound 컴포넌트)
    - a11y attribute diff
    - usage_stats 차이
  - 권장: 4개 다 (다중 탭으로 표시)
- **T3.1 — 비교 API + URL** *(0.5d)*
- **T3.2 — Side-by-side grid view (dynamic preview wrapper 포함)** *(1.5d)*
  - DS site에 dynamic preview 컴포넌트 새 wrapper 추가 (현재 정적 MDX 만)
- **T3.3 — Props/anatomy/a11y diff highlight** *(1d)*
- **T3.4 — Molly closest_match → compare deep-link** *(0.5d)*

**T3 추정**: 4-6d

---

## 3-2. 의도적으로 제외하는 항목 (v2 신규 — momus 권장)

| 항목 | 출처 | 제외 이유 |
|------|------|----------|
| Multi-model BYOK (OpenAI/Gemini fallback) | Open CoDesign | 우리는 Anthropic claude 고정. cache_control 등 vendor-specific 구조 다수. 별 plan으로 검토 권장 |
| Voice input | Open CoDesign | UX 변경 큼. 사용자 요청 없음 |
| Prompt template UI | Open CoDesign | Track 4 (skills) 가 부분 커버 |
| 분산 multi-user 동시 편집 | — | 다음 주 2명 Cloudflare Tunnel 시범에는 sequential 1 user 가정으로 충분 |

---

## 4. 의존성 그래프 v2 (C 정정)

```
Lane 2 (Phase 1, 미측정) ──gate(n=5 positive)──→ Track 2 (region-targeted)

Ontology Phase 0 ✅ ─→ Track 3 (compare)

Track 6 (audit log) ──T6.0──→ Ontology Phase 2 (enum 합의)
       ↓                       (cross-link만, 별 plan)
       jsonl integration
       ↓
Track 5 (JSONL session) ──→ Track 6.3 / T5.1 통합 (같은 파일)

Track 1 (DESIGN.md) ── 토양 ──→ Track 4 (skills 실행 T4.1+)

— independent ─ Track 1, Track 3, Track 4 (기획 T4.0)
```

**v1 의존 그래프 모순 제거**:
- ❌ "Lane 2 → Track 6 화살" 삭제 (audit log는 image input과 무관)
- ✅ "Track 5 ↔ Track 6 통합" 그래프와 본문 일치 (sequential 6 → 5)

---

## 5. 리스크 / 미해결 (v2)

| 항목 | severity | 대응 |
|------|---------|------|
| Track 1: DESIGN.md 응축으로 typecheck pass rate ↓ | high | T1.0 베이스라인 측정 (n≥10) → 임계값 = baseline N% − 10%p 유지 (절대값 기준). T1.0 §임계값에 3조건 (pass rate / input_tokens −70% / cache_creation −80%) 정의 |
| Track 2 시작 gate: Lane 2 측정 미완 | blocker | T2.0 gate (n=5 positive) 통과 후 진입 (H) |
| Track 2: selectionRect 좌표계 mismatch | medium | T2.0에 좌표계 명시 (CSS px @ DPR=1) + prompt 가이드 (D4) |
| Track 3: DS site dynamic preview wrapper 부재 | medium | T3.2 1.5d로 wrapper 작업 포함 (정정) |
| Track 4: T4.0 1d 안에 G1/G2/G3 통과 못할 가능성 | medium | G1/G2 합의 안 되면 G3 (typography prototype)만으로 부분 진입 |
| Track 5: JSONL 디스크 폭증 | high | T5.0 30일 / 100MB cap / cron GC (D2) |
| Track 6: tool_use payload PII / secret | high | T6.2 redact whitelist (D3) + raw payload 미저장 |
| Track 6: T6.0 enum 합의 무한정 늦어질 가능성 | medium | T6.0 timebox 0.5d. 합의 안 되면 enum minimal subset (read/write/bash 3개)으로 시작 |
| Ontology Phase 2 plan 미진행 시 Track 6 진행 막힘 | medium | T6.0이 enum 초안 직접 작성 — Ontology Phase 2 plan에 cross-link만 |

---

## 6. 측정 / 검증 (v2 — D1 반영)

| Track | 측정 슬라이스 | n | 임계값 |
|-------|------------|---|--------|
| 1 | T1.0 baseline (n≥10) → T1.3 A/B (n≥10) | 10 | (1) pass rate baseline (N) − 10%p 이상 유지 + (2) input_tokens −70% 이상 ↓ + (3) cache_creation −80% 이상 ↓ (T1.0 §임계값 참조) |
| 2 | T2.3 selection scope A/B | 5 | plan_items의 out-of-scope 비율 < before |
| 3 | (정성) Molly closest_match accuracy spot-check | 5 | — |
| 4 | T4.0 G3 prototype A/B (n≥5) → T4.1+ 전체 (n≥10) | 5/10 | skill 활성/비활성 별 typecheck pass rate |
| 5 | 사용 빈도 (운영 1주) | — | — |
| 6 | T6.4 UI 클릭률 (운영 1주) + 사용자 self-report | — | "agent 행동 이해도" subjective |

---

## 7. 추정 합계 v2

| Track | Plan 추정 |
|-------|----------|
| 1 | 2-2.5d |
| 2 | 1.5-2.5d (gate 후) |
| 3 | 4-6d |
| 4 | 3-4d (T4.0 1d 포함) |
| 5 | 2-2.5d |
| 6 | 1-1.5d (T6.0 0.5d 포함) |
| **합계** | **12-18d (sequential), parallel 가능 페어 (1↔3, 4↔5)** |

---

## 8. 다음 액션

1. **이 v2 momus 재리뷰** (background)
2. 통과 시 Track 1 (🥇) 부터 실행. T1.0 (baseline 측정) 으로 시작.
3. T1 진행 중 병렬로 Lane 2 (`2026-05-13-screenshot-to-llm.md`) Slice 1.4 측정 → T2 gate 평가
4. T4.0 (skills 기획) 은 다른 track 사이사이 진행 가능

---

*Plan v2 작성: 2026-05-17. v1의 11개 momus 지적 사항(5 blocker + 6 high + 2 medium) 모두 반영. 추정 12-18d로 갱신.*
