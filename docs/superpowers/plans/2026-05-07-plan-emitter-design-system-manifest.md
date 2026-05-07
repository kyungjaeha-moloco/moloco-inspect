# Plan — plan-emitter 에 design system 매니페스트 주입 (C)

**Date:** 2026-05-07
**Author:** kyungjae.ha (with Claude)
**Predecessor:** `2026-05-07` D commit (`e5ee3a4`) — preview 노출 전 typecheck verify
**Estimate:** ~1d
**Branch:** main → 작업 가능 (clean)

---

## 배경 — 무엇이 일어났나

incident 2026-05-07 — Playground 의 plan 카드 승인으로 만든 "TVING 메인 페이지에 디자인시스템 컴포넌트 데모 섹션 추가" 잡이 commit 까지 갔으나 iframe 에 demo 섹션 안 보임. 분석 결과:

- `MCDesignSystemDemoSection.tsx(97,29): error TS2769` — `MCBarTabs` overload 불일치
- `MCDesignSystemDemoSection.tsx(99,14): error TS2741` — `MCSingleTextInput` 의 `name` prop 누락

두 에러 모두 plan-emitter LLM 이 컴포넌트 prop 시그니처를 정확히 모른 채 코드를 묘사했기 때문. **`MCFormPanel`/`MCFormPanelTitle`/`MCFormPanelBody`/`MCFormFieldGroup` 같은 진짜 존재하는 컴포넌트도 있었지만, prop 사용법이 부정확** → 잡이 만든 코드가 typecheck 실패.

D commit (preview 직전 typecheck verify) 가 이런 silent fail 을 detection layer 로 차단. 이번 슬라이스 C 는 prevention layer — **plan 단계에서 hallucination 자체를 줄임**.

---

## 현 상태 (코드 확인)

### plan-emitter 가 system prompt 에 주입하는 자료

`orchestrator/lib/molly-plan-emitter.js:107-117`:

```js
const systemBlocks = [
  { type: 'text', text: SYSTEM_PROMPT },
  { type: 'text', text: `pm-sa-request-schema:\n${...}` },
  { type: 'text', text: `patterns.json:\n${JSON.stringify(patterns, null, 2)}` },
  { type: 'text', text: `api-ui-contracts.json:\n${...}`,
    cache_control: { type: 'ephemeral' } },
];
```

들어가는 것 — **patterns / api-ui-contracts / pm-sa-request-schema**. 컴포넌트 매니페스트 (`components.json`) 는 **안 들어감**.

### design-system 에 이미 존재하는 자료

`design-system/src/`:
- `components.json` (458.5KB) — **112 컴포넌트, 16 카테고리**, per-component: `name / path / description / shortDescription / importPath / importStatement / when_to_use / do_not_use / antiPatterns / usage_stats / functional_category / status` (+ 추가 필드)
- `component-behaviors.json`
- `component-dependencies.json`
- `golden-example-states.json` — UI 상태 예시
- `conventions.json`

→ 매니페스트 자체는 **이미 있음**. plan-emitter 에 주입만 안 했을 뿐.

---

## 목표

plan-emitter LLM 이 `components.json` 의 진짜 컴포넌트 list + 각 컴포넌트의 import path + when_to_use / do_not_use 를 보고 plan 작성. hallucination 빈도 ↓, D 의 `verification_failed` 비율 ↓.

비-목표:
- props 시그니처 자동 추출 — `components.json` 에 없는 정보. 이번 슬라이스는 components.json 가 가진 정보만 사용. props 추출은 별 슬라이스 (TypeScript Compiler API 또는 typedoc 활용).
- `component-behaviors.json` / `component-dependencies.json` / `golden-example-states.json` 동시 주입 — 토큰 비용 폭발. 첫 슬라이스는 components.json 만.
- plan 의 verification 자동 retry — D 가 fail 만 검출. 자동 retry 는 별 슬라이스.

---

## 변경 사항

### Task 1 — components.json 주입 (full vs compact 결정 포함)

**파일:** `orchestrator/lib/molly-plan-emitter.js`

**옵션 A — full 주입** (~458KB ≈ ~110K tokens)
- 그대로 systemBlocks 에 추가
- cache_control: ephemeral 로 첫 호출만 비용. cache hit 시 90% 할인 → 두번째부터 ~$0.011/req (Sonnet) 또는 ~$0.055/req (Opus)
- 5분 TTL — 운영 빈도 (매 plan 호출) 충분히 cache hit

**옵션 B — compact manifest** (~30-50KB ≈ ~10K tokens)
- per-component: `name / shortDescription / importStatement / functional_category + when_to_use 첫 1줄` 만 추출
- `description` / `do_not_use` / `antiPatterns` / `usage_stats` 같은 부피 큰 필드 제외
- LLM 이 더 깊은 정보 필요하면 follow-up tool call 로 (별 인프라 필요 — 이번 슬라이스 비-목표)

**권장 — A 로 시작**, cache hit 비율 + cost 측정 후 B 로 줄일지 결정. 옵션 B 는 정보 손실 위험 (when_to_use 첫 줄만으로 LLM 이 잘못 결정 가능).

**구현:**
```js
const componentsPath = path.join(dsRoot, 'src', 'components.json');
const components = readJsonSafe(componentsPath, {});

const systemBlocks = [
  { type: 'text', text: SYSTEM_PROMPT },
  { type: 'text', text: `pm-sa-request-schema:\n${...}` },
  { type: 'text', text: `patterns.json:\n${...}` },
  { type: 'text', text: `components.json:\n${JSON.stringify(components, null, 2)}` },
  { type: 'text', text: `api-ui-contracts.json:\n${...}`,
    cache_control: { type: 'ephemeral' } },
];
```

cache_control 은 마지막 블록에 — 누적 prefix 가 cache 됨 (Anthropic prompt cache 동작).

### Task 2 — SYSTEM_PROMPT 가이드 추가

**파일:** `orchestrator/lib/molly-plan-emitter.js`

기존 prompt 가 patterns 만 강조 (line 31-34). components.json 도 같은 강도로 강조:

추가 가이드:
```
- ONLY reference components that exist in components.json. Never invent component names. If a desired functionality has no matching component, say so explicitly in the plan rather than guessing.
- Use the `importStatement` field verbatim — don't reconstruct import paths from memory.
- Honor `when_to_use` / `do_not_use` / `antiPatterns` — if a component matches the goal but its `do_not_use` rule applies, pick a different one.
- For prop usage, the plan can describe intent ("text input with placeholder") but should NOT specify exact prop names unless the component's docs explicitly support it. The job runner has type-check verification (D, 2026-05-07) that catches prop mismatches.
```

마지막 줄이 중요 — D 와의 분업 명시. plan 은 "어떤 컴포넌트, 어떤 의도" 까지만 책임. props 정확도는 D 가 잡음. 이렇게 분리해야 plan emitter 가 props hallucinate 안 하고 LLM 의 책임 범위가 좁아져 정확도 ↑.

### Task 3 — manifest staleness 자동 감지

**파일:** `orchestrator/lib/molly-plan-emitter.js`

design-system 변경 시 매니페스트 갱신 흐름 — 3 옵션:

(a) **mtime 기반 reload** — 매 호출마다 components.json mtime 확인, 변경됐으면 reload + cache 무효화. 단순. (현재 patterns.json / api-ui-contracts.json 도 mtime 확인 안 함 — 부팅 후 영원히 stale 가능).

(b) **부팅 시 한 번** — orchestrator 시작 시 read, 이후 영원히 메모리. 가장 단순. design-system 변경 시 orchestrator 재시작 필요.

(c) **fs.watch** — 변경 즉시 reload. 가장 freshhness 높지만 인프라 ↑.

**권장 — (a)**. molly-settings.js 의 mtime 기반 cache 패턴 (이번 세션 commit `7a6473c` 에 추가) 과 일관. 매 호출 stat 1회 (~수 ms) 부담 미미.

이번 슬라이스에선 components.json 만 (a) 적용. patterns / api-ui-contracts 도 같은 패턴 권장이지만 별 슬라이스로 분리.

### Task 4 — 검증

수동 시나리오:
1. orchestrator 재시작 → plan-emitter system prompt size 확인 (로그 또는 token 카운트)
2. **Same incident 재현** — 1d68d67a 의 PRD ("TVING 메인 페이지에 디자인시스템 컴포넌트 데모 섹션 추가") 다시 보내고 plan 의 component 참조 정확도 비교
3. cache hit 검증 — 두번째 plan 호출의 cache_read_input_tokens 확인 (90% 할인 적용)
4. mtime 기반 reload — components.json touch 후 새 plan 호출 시 reload 로그 확인

자동:
- D 의 `verification_failed` 분석 이벤트 카운트를 운영 1주 추적. C 적용 전후 비교 — 비율 감소 기대.

---

## 작업 순서

1. Task 1 — components.json 읽기 + systemBlocks 에 추가 (옵션 A, full)
2. Task 2 — SYSTEM_PROMPT 에 가이드 추가
3. Task 3 — mtime 기반 reload (cache 패턴)
4. Task 4 — 검증 수동 + 운영 시작
5. 핸드오프 문서

각 commit 독립 권장 — Task 1+2 함께 (하나의 prompt 변경), Task 3 별, Task 4 는 commit 없음.

---

## 위험 / footguns

- **토큰 비용** — 458KB ≈ 110K tokens 가 첫 호출에 추가. cache_control 로 완화하지만 첫 호출과 5분 TTL 만료 후 재 cache 시는 full 비용. 운영 1주 후 측정해서 옵션 B 로 compact 화 결정.
- **components.json staleness** — design-system 의 components.json 갱신 흐름이 명확치 않음 (`generate.mjs` ?) — Task 3 의 mtime reload 가 sandbox 적용. 단 components.json 자체가 stale 이면 의미 없음. 별 운영 영역.
- **patterns.json 과 충돌** — patterns.json 도 component 언급 가능. 두 source 가 불일치하면 LLM 헷갈림. 이번 슬라이스는 그대로 두고, 운영 후 hallucination 케이스 보면서 정리.
- **prop 정확도는 D 의 책임** — 이번 슬라이스가 prop hallucination 까지 보장 안 함. SYSTEM_PROMPT 가이드 마지막 줄로 명시. 동시에 D 가 안전망.
- **cache_control 위치** — 마지막 systemBlocks 항목에 둠. 만약 다른 블록 순서 바꾸면 prefix 가 변경되어 cache miss 발생 가능. 일반적인 함정.
- **모델 변경 시 cache 무효** — settings 에서 planModel 바꾸면 cache 무효. 별 함정 아님 (Anthropic 동작).
- **components.json 형식 변경 risk** — schema 변경 시 SYSTEM_PROMPT 의 가이드 ("importStatement 필드 verbatim 사용") 도 같이 갱신 필요. design-system 별 슬라이스로 schema 안정화 권장 (이미 `$schema` 필드 있음).

---

## 완료 기준 (DoD)

- [ ] components.json 가 plan-emitter system prompt 에 주입 (옵션 A — full)
- [ ] SYSTEM_PROMPT 에 components 우선 가이드 추가 ("ONLY reference components that exist", "importStatement verbatim", do_not_use 존중, props 는 D 책임)
- [ ] mtime 기반 reload — components.json 변경 시 다음 호출에 새 내용 적용
- [ ] 수동 검증 — incident 재현 PRD 로 plan 호출 시 진짜 컴포넌트만 참조하는지 확인
- [ ] cache hit 검증 — 두번째 호출 cache_read_input_tokens > 0
- [ ] 핸드오프 문서 — 이번 변경 + 운영 1주 후 측정 항목

---

## 다음 슬라이스 후보 (이번 끝나고)

- **C+ — props 시그니처 매니페스트** (~1d, plan 필요) — TypeScript Compiler API 로 각 컴포넌트의 props interface 추출. 프롬프트에 `MCSingleTextInput { name: string (required); value?: string; ...}` 같은 form 으로. plan emitter 가 prop 정확도까지 책임 가능 → D 가 verify 만으로 안전망 → 거의 완전한 hallucination 차단.
- **D+ — verification_failed 자동 retry** (~0.5d) — D fail 시 LLM 에 에러 메시지 피드백 + plan 다시 emit. 사용자 재시도 부담 ↓.
- **patterns.json / api-ui-contracts.json 도 mtime reload 통일** (~0.25d) — 현재 부팅 후 stale.
- **components.json compact manifest 옵션** (~0.5d) — 운영 1주 후 cost 측정해서 결정.
- **C 의 효과 측정 dashboard** (~0.5d) — verification_failed 이벤트 시계열 차트 (Inspect Console / molly metrics 페이지).

---

## 메모 — Incident 데이터 (참고)

**1d68d67a 의 type 에러 (D 가 잡은 것):**
```
src/apps/tving/component/ad-pacing-dashboard/demo/MCDesignSystemDemoSection.tsx(97,29): error TS2769: No overload matches this call.
src/apps/tving/component/ad-pacing-dashboard/demo/MCDesignSystemDemoSection.tsx(99,14): error TS2741: Property 'name' is missing in type ... but required in type 'MTSingleTextInputProps'.
```

**Plan 이 hallucinate 한 것:**
- `MCBarTabs` overload (97,29) — props 가정 실패
- `MCSingleTextInput` 의 `name` 필수 props 누락 (99,14)

**진짜 존재 (plan 이 정확히 짚은 것):**
- `MCFormPanel`, `MCFormPanelTitle`, `MCFormPanelBody`, `MCFormFieldGroup` from `@msm-portal/common/component/form/shared` ← `MCFormStyledComponents.tsx` 에 존재

→ 컴포넌트 이름은 거의 정확. **prop 시그니처가 hallucination 의 큰 비율** → C+ (props manifest) 가 후속 슬라이스로 더 큰 효과 가능.
