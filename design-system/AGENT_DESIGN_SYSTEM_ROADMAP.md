# Agent-Friendly Design System Roadmap

> MSM Portal 디자인 시스템을 에이전트가 자율적으로 제품을 개선할 수 있는 수준으로 발전시키기 위한 로드맵
>
> Inspired by: [Ramp Inspect](https://builders.ramp.com/post/why-we-built-our-background-agent)
>
> Created: 2026-04-03
> Last Updated: 2026-04-03

---

## Vision

```
현재: 에이전트가 디자인 시스템 JSON을 "읽고" 코드를 "생성" (단방향)
목표: 에이전트가 제품을 "실행"하고, UI를 "관찰"하고, 변경을 "검증"하는 완전한 루프 (양방향)

문서 ↔ 코드 ↔ 실행 ↔ 검증
```

---

## Current State (Baseline)

### 디자인 시스템 파일 구성
| 파일 | 내용 | 상태 |
|------|------|------|
| `tokens.json` | 색상 54개, 타이포 9개, 스페이싱, 애니메이션, 엘리베이션 | ✅ 완성 |
| `components.json` | 48개 컴포넌트, props, 접근성, 상태 | ✅ 완성 |
| `patterns.json` | 20개 아키텍처/코딩 패턴 | ✅ 완성 |
| `conventions.json` | 네이밍, 파일구조, 임포트 규칙 | ✅ 완성 |

### 강점
- 포괄적인 토큰 시스템 (색상, 타이포, 스페이싱, 애니메이션)
- 48개 컴포넌트 문서화 (props, 접근성, 상태, dos/donts)
- 20개 패턴으로 아키텍처 가이드 (Page → Container → Component)
- 명확한 네이밍 컨벤션 (MC, MT, SC, ME 프리픽스)

### 한계 (에이전트 관점)
- 컴포넌트의 **시맨틱 액션**(무엇을 할 수 있는지)이 없음
- **API ↔ UI 매핑**이 없음 (proto 필드 → UI 렌더링 연결)
- **상태 머신**이 없음 (상태 전이 규칙)
- **페이지 블루프린트**가 없음 (새 페이지 생성 시 참조할 완전한 스캐폴딩)
- **시각적 검증 기준**이 없음 (정상 상태 정의)

---

## Phase 1: 디자인 시스템 강화 (Foundation)

> 에이전트가 "무엇을 만들어야 하는지" 완전히 이해할 수 있도록

### 1.1 Component Semantic Actions
**목표:** 각 컴포넌트가 "어떤 사용자 인터랙션을 지원하는지" 명세

```json
{
  "MCFormTextInput": {
    "semantic_actions": [
      { "action": "user_inputs_text", "triggers": "onChange → formik.setFieldValue" },
      { "action": "validation_error", "triggers": "onBlur → meta.touched + meta.error" },
      { "action": "clear_input", "triggers": "resetForm() or setFieldValue(name, '')" }
    ],
    "data_flow": {
      "input": "formik.values[name]",
      "output": "formik.handleChange → parent container callback",
      "side_effects": ["form dirty state", "validation trigger"]
    }
  }
}
```

- [x] `component-behaviors.json` 생성 — 42개 컴포넌트의 semantic_actions + data_flow (2026-04-03)
- [x] 별도 파일로 분리 (components.json 1530줄 파일 안정성 보장) (2026-04-03)

### 1.2 Page Blueprints
**목표:** 각 페이지 유형의 완전한 구조 청사진

```json
{
  "page_type": "entity_list",
  "blueprint": {
    "required_apis": ["list{Entity}", "listAll{Entity}"],
    "required_hooks": ["use{Entity}s", "useEntityParam", "useInAppAlert"],
    "ui_structure": [
      "MCContentLayout > MCTableActionBar + MCI18nTable",
      "Tab navigation: available | draft | archived"
    ],
    "state_management": ["React Query cache", "table filter state", "search state"],
    "error_handling": "useEffect → fireCollapsibleError on query error"
  }
}
```

- [x] `patterns.json`에 `page_blueprints` 섹션 추가 (2026-04-03)
- [x] 페이지 유형별 블루프린트: list, detail, create, edit, settings (2026-04-03)

### 1.3 API ↔ UI Contract Map (새 파일)
**목표:** proto 필드가 어떤 UI 컴포넌트의 어떤 prop으로 변환되는지 추적

```json
{
  "MIOrderProto": {
    "converter": "orderConverter (src/apps/msm-default/model/order/converter.ts)",
    "ui_mappings": [
      {
        "proto": "main_order.order_detail.title",
        "model": "order.orderDetail.title",
        "ui": "MCTable column 'title'",
        "renderer": "getTitleWithSubTitleRenderer"
      },
      {
        "proto": "main_order.status",
        "model": "order.orderStatus",
        "ui": "MCTable column 'status'",
        "renderer": "getOrderStatusRenderer → MCBadge"
      }
    ]
  }
}
```

- [x] `design-system/src/api-ui-contracts.json` 생성 (2026-04-03)
- [x] 주요 엔티티 매핑: Order, AuctionOrder, Creative, Advertiser, Product, PublisherTarget (2026-04-03)
- [x] CLAUDE.md에 새 파일 참조 추가 (2026-04-03)

### 1.4 Component State Machines (새 파일)
**목표:** 컴포넌트 상태 전이 규칙을 구조화

```json
{
  "MCFormTextInput": {
    "states": {
      "idle": { "transitions": { "focus": "focused", "disable": "disabled" } },
      "focused": { "transitions": { "blur_valid": "idle", "blur_invalid": "error" } },
      "error": { "transitions": { "focus": "focused", "fix_value": "idle" } },
      "disabled": { "transitions": { "enable": "idle" } }
    }
  }
}
```

- [x] `design-system/src/state-machines.json` 생성 (2026-04-03)
- [x] Form 컴포넌트 상태 머신 (17개) (2026-04-03)
- [x] Interactive 컴포넌트 상태 머신 (Dialog, Popover, MCTable, MCBarTabs, MCSnackbar) (2026-04-03)

---

## Phase 2: 에이전트 도구 구축 (Tooling)

> 에이전트가 "코드 생성 → 실행 → 검증"을 자율적으로 수행할 수 있도록

### 2.1 로컬 Mock 환경 완성
**목표:** 에이전트가 백엔드 없이 전체 UI를 실행/확인 가능

- [x] Mock interceptor 구축 (`mock-interceptor.ts`)
- [x] 주요 API mock 데이터 (주문, 경매주문, 소재, 타겟, 사용자, 앱&픽셀)
- [x] 비동기 mock 응답으로 React 무한루프 해결
- [ ] 모든 상세 페이지 mock 완성 (현재 일부 401 발생)
- [ ] Mock 데이터 시나리오 다양화 (빈 상태, 에러 상태, 대량 데이터)

### 2.2 Figma MCP 연동 강화
**목표:** 디자인 변경사항을 에이전트가 직접 읽고 코드에 반영

- [ ] Figma 디자인 토큰 → `tokens.json` 자동 동기화 파이프라인
- [ ] 컴포넌트 디자인 스펙 → `components.json` 자동 업데이트
- [ ] 디자인 변경 감지 → 에이전트가 코드 변경 PR 생성

### 2.3 React DevTools 연동
**목표:** 런타임 컴포넌트 트리를 에이전트가 탐색 (Ramp Chrome Extension 접근법)

- [ ] React 컴포넌트 트리 추출 도구 구축
- [ ] DOM이 아닌 React 내부 구조로 UI 이해
- [ ] 선택 영역 → 컴포넌트 + props + state 추출

### 2.4 스크린샷 검증 파이프라인
**목표:** 변경 전/후 비교 자동화

- [ ] Playwright/Cypress 기반 스크린샷 캡처
- [ ] 컴포넌트별 Visual Regression 기준 이미지
- [ ] 에이전트가 PR 생성 시 before/after 스크린샷 첨부

### 2.5 CLAUDE.md 워크플로우 인코딩
**목표:** 에이전트가 디자인 시스템을 자동 참조하는 프로세스

- [x] 기본 Quick Reference 테이블
- [x] 에이전트 워크플로우: "UI 변경 시 → tokens → components → patterns → api-contracts 순서로 참조" (2026-04-03)
- [x] 검증 체크리스트: "토큰 하드코딩 없음, i18n 적용, 접근성 확인" (2026-04-03)

---

## Phase 3: 완전한 자율 루프 (Autonomy)

> Ramp Inspect처럼 "요청 → PR → 검증 → 머지"까지 자율 수행

### 3.1 Sandbox 개발 환경
**목표:** 격리된 환경에서 에이전트가 코드 작성 + 실행 + 테스트

- [ ] Git worktree 기반 격리 환경 자동 생성
- [ ] Vite dev server + Mock API 자동 구동
- [ ] 테스트 스위트 자동 실행
- [ ] 에이전트가 빌드 에러를 스스로 수정

### 3.2 시각적 회귀 테스트 자동화
**목표:** 모든 UI 변경에 대한 시각적 검증

- [ ] 주요 페이지별 기준 스크린샷 저장소
- [ ] PR마다 자동 스크린샷 diff 생성
- [ ] 의도하지 않은 시각적 변경 자동 감지

### 3.3 멀티플레이어 인터페이스
**목표:** 비엔지니어도 에이전트에게 UI 변경 요청 가능

- [ ] Slack 연동: "주문 리스트에 필터 추가해줘" → 에이전트 PR 생성
- [ ] Figma 코멘트 → 에이전트 작업 트리거
- [ ] PR 리뷰 중 실시간 수정 요청

### 3.4 Self-Healing
**목표:** 프로덕션 에러를 에이전트가 자동 감지/수정

- [ ] Sentry 에러 → 에이전트 자동 분석
- [ ] 자동 수정 PR 생성 + 테스트
- [ ] DataDog 메트릭 이상 감지 → UI 성능 최적화 PR

---

## Tracking

### Progress Summary
| Phase | 진행률 | 상태 |
|-------|--------|------|
| Phase 1: 디자인 시스템 강화 | 100% | ✅ Complete |
| Phase 2: 에이전트 도구 구축 | 20% | 🟡 In Progress (Mock 환경) |
| Phase 3: 완전한 자율 루프 | 0% | ⬜ Planned |

### Key Metrics (목표)
- **에이전트 PR 비율:** 현재 0% → 목표 30% (Ramp 수준)
- **디자인 시스템 커버리지:** 현재 7 파일 ✅ (tokens, components, patterns, conventions, api-ui-contracts, component-behaviors, state-machines)
- **Mock API 커버리지:** 현재 ~70% → 목표 100%
- **시각적 검증 자동화:** 현재 0% → 목표 주요 페이지 100%

### Decision Log
| 날짜 | 결정 | 이유 |
|------|------|------|
| 2026-04-03 | 개별 API mock 방식 채택 (interceptor X) | axios interceptor/proxy 방식이 React Query와 충돌하여 무한루프 발생 |
| 2026-04-03 | mock 응답에 setTimeout(0) 추가 | 동기 Promise.resolve가 React render cycle 내에서 state update를 트리거하여 Maximum update depth 에러 |
| 2026-04-03 | MCRouteErrorElement dev 모드 수정 | moloco-cloud-react-ui 에러 화면이 자체 무한루프 버그 보유 |

---

## References

- [Ramp: Why We Built Our Background Agent](https://builders.ramp.com/post/why-we-built-our-background-agent)
- [React Grab](https://github.com/nicholasgriffintn/react-grab) — React 컴포넌트 트리 추출 (Ramp 추천)
- [OpenCode](https://github.com/nicholasgriffintn/opencode) — 에이전트 프레임워크 (Ramp 사용)
- Design System Source: `design-system/src/` (tokens, components, patterns, conventions)
