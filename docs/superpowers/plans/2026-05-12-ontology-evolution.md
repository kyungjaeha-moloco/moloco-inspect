# Plan — Ontology Evolution (Lightweight Lightweight Knowledge Graph)

**Date:** 2026-05-12
**Author:** kyungjae.ha (with Claude)
**Status:** 리서치 완료 → DS escalation plan 과 연계 진행
**Estimate:** Phase 0-2 = ~2.5-3일 / Phase 3-5 = 옵션 (미래)
**연계 plan:**
- `2026-05-07-molly-ds-loop-v2-research-informed.md` (DS loop v2 S2/S3 와 통합)
- `2026-05-12-ds-escalation-workflow.md` (Phase 2 의 enum 강제 + escalation 연계)

---

## 배경

사용자 제기: "DS 에 ontology 개념 적용하면 더 나은 방향?". 5명 researcher 외부 리서치 결과:

### 핵심 발견

- **Full RDF/OWL 전환은 70 컴포넌트엔 overkill** — R2 (토큰 2-4배↑, 정확도 소폭↓) + R3 (학습 4-8주) + R1 (production 공개 사례 거의 없음)
- **Lightweight Bridge 패턴이 ROI 최고** — R5 (Wikidata 채택, caller 영향 0)
- **우리 DS 는 이미 implicit ontology** — R1 (Anthropic MCP Memory pattern 과 isomorphic: components + dependencies + behaviors)
- **In-memory adjacency list 충분** — R4 (Neo4j 는 70 컴포넌트엔 < 1ms 라 overkill)
- **가장 강한 hallucination 차단 = `tool_use` input_schema enum** — R2 (schema compliance 80-90%, 임상 QA hallucination 63% → 1.7%)

### 우리 DS 의 implicit ontology

```
components.json    → Entities (노드)
dependencies.json  → Relations (방향성 엣지)
behaviors.json     → Observations (entity 속성)
state-machines     → Temporal relations
```

→ 새 ontology 도입 X, **이미 있는 구조 명시화 + 활용도 ↑** 가 정답.

---

## 사용자 지적 반영 — Phase 1 정정

**원래 설계 (잘못)**: PRD entity extraction → adjacency list

**사용자 지적**: 사용자가 PRD 에 컴포넌트 이름 명시 안 함. "폼 만들어줘" 식.

**정정된 설계**: **plan emit 후처리** dependency expansion
- Molly LLM 이 plan_items 생성 후 → 후처리로 MC* 컴포넌트 추출 → adjacency list lookup → `dependency_hints` 자동 추가
- PRD 자체는 자연어 그대로

---

## 목표 / 비-목표

**목표:**
- 컴포넌트 간 관계 명시 (현재 implicit → explicit)
- plan 정확도 향상 (dependency 누락 차단)
- DS 진화 데이터 누적 (escalation plan 과 연계)

**비-목표:**
- Full RDF/OWL/SPARQL 전환 — overkill
- Neo4j 등 graph DB 인프라
- Schema.org custom vocabulary 정의 — 70 컴포넌트엔 작업량 과다
- SHACL CI 검증 — 150 컴포넌트+ 시점에

---

## 핵심 결정

1. **Lightweight 우선** — 5명 리서처 일관된 권장
2. **Phase 0-2 만 즉시 진행** — 가장 임팩트 큰 변경 3개. Phase 3-5 는 미래 옵션
3. **JSON 그대로 유지** — caller 영향 0
4. **JSON Schema constraint 이 가장 강한 evidence** — Phase 2 우선

---

## 6 Phase 진화 path

| Phase | 작업 | 시간 | 비유 |
|-------|------|------|------|
| **0** | cross-ref 필드 추가 | 0.5일 | 책마다 "관련 책" 라벨 |
| **1 정정** | plan emit 후처리 dependency expansion | 1일 | "이 책 보려면 저 책 필요" 자동 안내 |
| **2** | `tool_use` input_schema enum 강제 | 1일 | "이 책장 안 책만" 강제 |
| 3 (옵션) | JSON-LD `@context` 추가 | 2-3일 | 표준 분류 코드 라벨 |
| 4 (옵션) | Build-time RDF 생성 | 3-4일 | 야간 데이터베이스 자동 생성 |
| 5 (미래) | SHACL selective constraint | 3-5일 | 입고 규칙 강제 |

---

## Phase 0 — Cross-ref 필드 추가 (0.5일)

### 0.1 components.json 확장

```json
{
  "name": "MCFormTextInput",
  "props": [...],
  "when_to_use": "...",
  // 신규 필드 (cross-ref)
  "usedInPatterns": ["form-basic", "create-page", "edit-page"],
  "relatedComponents": ["MCFormPanel", "MCFormFieldGroup", "MCFormFieldError"],
  "requiredProviders": ["Formik", "ThemeProvider"]
}
```

### 0.2 자동 추출 가능 부분

- `usedInPatterns` → `patterns.json` 의 code 블록에서 컴포넌트 이름 grep
- `requiredProviders` → `component-dependencies.json` 의 `requires` 필드 재사용
- `relatedComponents` → 수동 (또는 같은 폴더 컴포넌트 자동)

### 0.3 작업

| Task | 시간 |
|------|------|
| `design-system/scripts/extract-cross-refs.mjs` 신규 (ts-morph 기반) | 2h |
| 자동 추출 → components.json 갱신 | 1h |
| 수동 보강 (`relatedComponents` 일부) | 1h |
| 검증 | 30m |

**Phase 0 DoD:**
- [ ] components.json 70+ 컴포넌트에 3 필드 모두 채워짐
- [ ] plan-emitter 가 이 필드들을 system prompt 에 inject (자동 — 기존 components.json 통째로 inject 라 추가 변경 없음)

---

## Phase 1 — Plan Emit 후처리 Dependency Expansion (1일) — 정정됨

### 1.1 In-memory adjacency list

orchestrator 시작 시:
```js
// orchestrator/lib/ds-graph.js (신규)
import componentsJson from '../../design-system/src/components.json' assert { type: 'json' };

const adjacency = new Map();
for (const category of componentsJson.categories ?? []) {
  for (const comp of category.components ?? []) {
    adjacency.set(comp.name, {
      relatedComponents: comp.relatedComponents ?? [],
      requiredProviders: comp.requiredProviders ?? [],
      usedInPatterns: comp.usedInPatterns ?? [],
    });
  }
}

export function getTransitiveDeps(componentName, visited = new Set()) {
  // BFS, < 1ms for 70 nodes
}
```

### 1.2 plan-emitter 후처리

```js
// orchestrator/lib/molly-plan-emitter.js
import { getTransitiveDeps } from './ds-graph.js';

export async function emitPlan(...) {
  const plan = ...; // LLM 호출 결과
  
  // 후처리: plan_items 의 MC* 컴포넌트 → transitive deps inject
  const mentioned = new Set();
  for (const item of plan.plan_items ?? []) {
    const matches = (item.description ?? '').match(/\bMC[A-Z]\w+/g) ?? [];
    matches.forEach(c => mentioned.add(c));
  }
  
  const dependencyHints = [];
  for (const comp of mentioned) {
    const deps = getTransitiveDeps(comp);
    if (deps.length > 0) {
      dependencyHints.push({ component: comp, requires: deps });
    }
  }
  
  return { ...plan, dependency_hints: dependencyHints };
}
```

### 1.3 SYSTEM_PROMPT 가이드 갱신

```
## Dependency hints (S3 + Ontology Phase 1)
The plan response will be post-processed to add a `dependency_hints` field
listing transitive dependencies of every component you reference in plan_items.
You don't need to enumerate these manually — focus on choosing the right
components, the post-processor will fill in providers, related components, etc.
```

### 1.4 검증

incident PRD ("TVING 메인 페이지에 디자인시스템 데모 섹션 추가") 재시도:
- plan_items 에 `MCFormPanel`, `MCFormTextInput` 등장
- post-processor 가 `Formik`, `ThemeProvider` 자동 추가
- `dependency_hints` 필드에 반영

### Phase 1 작업

| Task | 시간 |
|------|------|
| `ds-graph.js` (in-memory adjacency + BFS) | 3h |
| plan-emitter 후처리 hook | 2h |
| SYSTEM_PROMPT 가이드 갱신 | 30m |
| 검증 (incident PRD 회귀) | 1h |

**Phase 1 DoD:**
- [ ] `dependency_hints` 필드 정상 추가
- [ ] BFS < 1ms 검증
- [ ] 회귀 케이스 5개 통과

---

## Phase 2 — tool_use input_schema Enum 강제 (1일)

### 2.1 plan-emitter 의 LLM 호출 변경

현재: `response_format` 없음, JSON 응답 LLM 자율

변경: `tool_use` 강제 + input_schema 에 컴포넌트 enum

```js
const COMPONENT_NAMES = extractAllComponentNames(componentsJson); // 70+ 이름

const tools = [{
  name: 'emit_plan',
  description: 'Emit a structured plan for the user PRD',
  input_schema: {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: [...] },
      target_entity: { type: 'string', enum: [...] },
      summary: { type: 'string' },
      plan_items: { type: 'array', items: {...} },
      referenced_components: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', enum: COMPONENT_NAMES }, // ← enum 강제
            importStatement: { type: 'string' },
            status: { type: 'string', enum: ['active', 'deprecated', 'experimental'] }
          }
        }
      },
      unresolved_components: {...}
    }
  }
}];

const response = await anthropic.messages.create({
  ...,
  tools,
  tool_choice: { type: 'tool', name: 'emit_plan' }
});
```

### 2.2 효과

- LLM 이 70개 enum 밖 컴포넌트 발명 못 함 (구조적 차단)
- DS escalation plan 의 ⓒ/ⓓ 옵션과 연계 — `unresolved_components` 에 fallback
- R2 evidence: schema compliance 80-90%, hallucination 63% → 1.7%

### 2.3 토큰 비용

- enum schema 자체가 ~1-3K tokens 추가
- 그러나 hallucination 0 에 가깝게 차단 → 회귀 비용 절감

### Phase 2 작업

| Task | 시간 |
|------|------|
| `extractAllComponentNames` helper | 1h |
| plan-emitter 의 messages.create → tool_use 전환 | 3h |
| response parsing 변경 (tool_use response shape) | 2h |
| 검증 (불가능한 컴포넌트 이름 PRD 로 회귀 테스트) | 2h |

**Phase 2 DoD:**
- [ ] `tool_use` 호출 정상 작동
- [ ] enum 외 컴포넌트 출력 시도 → 자동 `unresolved_components` 로 fallback
- [ ] DS escalation plan Slice A 의 ⓒ/ⓓ 옵션 트리거 정확도 ↑

---

## Phase 3 (옵션) — JSON-LD @context 추가 (2-3일)

**왜 미루나**: caller 영향 0 이지만 LLM 성능 향상 측정 못 함. Phase 0-2 효과 본 다음 비교 가능.

### 3.1 `ds-context.jsonld` 신규

```json
{
  "@context": {
    "@vocab": "https://ds.moloco.com/vocab#",
    "ds": "https://ds.moloco.com/vocab#",
    "Component": "ds:Component",
    "name": "ds:name",
    "props": "ds:hasProperty",
    "relatedComponents": "ds:relatedTo",
    "requiredProviders": "ds:requires"
  }
}
```

### 3.2 components.json 에 `@context` 추가

```json
{
  "@context": "./ds-context.jsonld",
  "categories": [...]
}
```

→ JSON-LD parser 가 인식, 기존 caller (jsonld unaware) 는 무시.

### 3.3 효과 측정

- Phase 0-2 적용 후 hallucination 비율과 Phase 3 적용 후 비교
- 토큰 비용 변화 측정
- 양호 시 Phase 3 유지, 아니면 revert

---

## Phase 4 (옵션) — Build-time RDF 생성 (3-4일)

**언제 검토**: SPARQL 쿼리 요구 발생 시 (컴포넌트 150+ 시점)

### 4.1 Build script

```js
// design-system/scripts/build-rdf.mjs
import jsonld from 'jsonld';
import fs from 'fs';

const componentsJson = JSON.parse(fs.readFileSync('src/components.json'));
const nquads = await jsonld.toRDF(componentsJson, { format: 'application/n-quads' });
fs.writeFileSync('dist/components.nq', nquads);
```

### 4.2 GovernancePage 활용

- D3 force graph 로 컴포넌트 의존성 그래프 시각화
- SPARQL query 예시: "MCFormTextInput 이 사용하는 모든 token"

---

## Phase 5 (미래) — SHACL Selective Constraint (3-5일)

**언제 검토**: 컴포넌트 사용 위반 (예: "MCForm 없이 form 필드 렌더") 사고 빈발 시

### 5.1 linkml YAML 1개로 SHACL + JSON Schema 동시 생성

```yaml
classes:
  MCFormTextInput:
    is_a: Component
    slots:
      - name
    slot_usage:
      name:
        required: true
        pattern: "^[a-z][a-zA-Z0-9]*$"
```

### 5.2 CI 통합

- pre-commit hook 에 `pySHACL` 실행
- 위반 시 commit 차단

---

## 의존성 / 진행 순서

```
Phase 0 (cross-ref 필드)
  ↓
Phase 1 (plan emit 후처리) + Phase 2 (enum) — 병행 가능
  ↓
운영 1주 측정 (hallucination 비율 / 토큰 비용 / verification_failed)
  ↓
Phase 3 (JSON-LD) 검토 (성능 vs 비용)
  ↓
Phase 4 / 5 — 미래 (트리거 조건 충족 시)
```

---

## 위험 / footguns

| Risk | Mitigation |
|------|-----------|
| `usedInPatterns` 자동 추출 누락 | patterns.json grep 정확도 1차 검증, 수동 보강 |
| in-memory adjacency 갱신 X (orchestrator 재시작 필요) | components.json mtime cache 패턴 재사용 (이미 plan-emitter 에 있음) |
| Phase 2 enum schema 가 토큰 1-3K 추가 | Sonnet + 1h cache (S0) 로 흡수. 첫 호출만 비용 |
| `tool_use` parse 변경으로 caller break | 응답 shape 변경 (text → tool_use). server.js / molly.js 갱신 필요 |
| `dependency_hints` 가 plan_items 와 모순 가능 | 단순 정보 제공 (decision 권한 없음). LLM 이 무시해도 OK |
| Phase 2 enum 강제 → 사용자 차단 위험 | DS escalation plan 의 ⓒ/ⓓ 자동 트리거로 escalation |
| component-props.json (S2) 와 다른 추출 도구 | ts-morph 같이 쓰면 일관성 유지 |

---

## 작업 시간 추정

| Phase | 처음 | 익숙 후 |
|-------|------|---------|
| 0 — cross-ref | 0.5일 | 0.25일 |
| 1 — plan 후처리 | 1일 | 0.5일 |
| 2 — enum 강제 | 1일 | 0.5일 |
| **Phase 0-2 합계** | **2.5일** | **1.25일** |
| 3 (옵션) — JSON-LD | 2-3일 | 1일 |
| 4 (옵션) — Build RDF | 3-4일 | 1.5일 |
| 5 (미래) — SHACL | 3-5일 | 2일 |

---

## 다음 단계

1. plan review (사용자)
2. **다음 주 시범 운영과 병행** Phase 0 진행 (cross-ref 필드 자동 추출)
3. 시범 운영 1주 후 Phase 1+2 진행 (실제 사용 패턴 데이터로 검증)
4. 운영 1-2주 후 Phase 3 검토 (성능 측정)

---

## References

리서치 결과 (5명 병렬, 2026-05-12):
- R1: DS + ontology production 사례 — Backstage, Knapsack, Supernova, Anthropic MCP Memory pattern
- R2: RDF vs JSON for LLM — KG-LLM-Bench NAACL 2025, schema compliance evidence
- R3: 70 컴포넌트에 적합한 layer — Layer 2 (JSON-LD) + Layer 3 선택 적용 권장
- R4: KG + RAG for plan-emitter — in-memory adjacency 충분, Neo4j overkill
- R5: 마이그레이션 비용 + bridge — Wikidata 패턴, JSON-LD `@context` 만 caller 영향 0

연계 plan:
- `2026-05-07-molly-ds-loop-v2-research-informed.md` — S2 ts-morph props (Phase 2 의 component-props.json 과 통합)
- `2026-05-12-ds-escalation-workflow.md` — Phase 2 enum 강제 시 ⓒ/ⓓ 자동 트리거 연계

도구 / 라이브러리:
- [jsonld npm](https://www.npmjs.com/package/jsonld) — JSON-LD → RDF (Phase 4)
- [linkml](https://linkml.io/) — SHACL + JSON Schema 동시 생성 (Phase 5)
- [Anthropic MCP Memory](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) — 우리 구조와 isomorphic
