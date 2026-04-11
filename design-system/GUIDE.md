# MSM Portal Agent Design System — Guide

> 디자인 시스템의 구조, 각 파일의 역할, 에이전트가 참조하는 워크플로우를 설명합니다.
> 이 문서는 **사람과 에이전트 모두**를 위한 가이드입니다.

---

## Overview: 왜 에이전트 친화적 디자인 시스템인가?

일반적인 디자인 시스템은 **사람이 읽고 해석**합니다. 이 디자인 시스템은 **AI 에이전트가 직접 파싱**하여 코드를 생성할 수 있도록 설계되었습니다.

```
┌─────────────────────────────────────────────────────┐
│                   Design System                      │
│                                                      │
│  tokens.json ─── "어떤 색상/간격/폰트를 쓰는가?"     │
│       ↓                                              │
│  components.json ─── "어떤 컴포넌트가 있고 props는?"  │
│       ↓                                              │
│  patterns.json ─── "컴포넌트를 어떻게 조합하는가?"     │
│       ↓                                              │
│  conventions.json ─── "네이밍/파일 규칙은?"           │
│       ↓                                              │
│  api-ui-contracts.json ─── "API 데이터가 UI에        │
│                             어떻게 매핑되는가?"       │
└─────────────────────────────────────────────────────┘
```

---

## File Map: 각 파일의 역할

### Source Files (`src/`)

| 파일 | 역할 | 크기 | 언제 참조? |
|------|------|------|-----------|
| **tokens.json** | 색상, 타이포그래피, 스페이싱, 애니메이션, 엘리베이션, 브레이크포인트 | 54 색상, 9 타이포, 8 스페이싱 | 스타일링 코드 작성 시 |
| **components.json** | 48개 컴포넌트의 props, 접근성, 상태, do/don't | 1530 lines | 컴포넌트 선택/사용 시 |
| **patterns.json** | 20개 아키텍처/코딩 패턴 (리스트, 상세, 생성, 편집 등) | 197 lines | 새 페이지/기능 구현 시 |
| **conventions.json** | 네이밍(MC/MT/SC/ME), 파일구조, 임포트 순서 | 106 lines | 모든 코드 작성 시 |
| **api-ui-contracts.json** | 6개 엔티티의 proto→converter→model→UI 매핑 | 6 entities | API 연동 UI 작성 시 |

### Generated Files

| 파일 | 역할 | 생성 방법 |
|------|------|----------|
| `docs/*.md` | JSON의 사람 친화적 마크다운 버전 | `node generate.mjs` |
| `dist/tokens.css` | CSS Custom Properties | `npm run generate:css` |
| `dist/tokens-rgb-only.css` | RGB 변수만 | `npm run generate:css` |

### Tooling

| 파일 | 역할 |
|------|------|
| `schemas/*.schema.json` | JSON Schema로 src 파일 유효성 검증 |
| `scripts/validate-schemas.mjs` | 스키마 검증 실행 |
| `scripts/sync-check.mjs` | 디자인 시스템 ↔ 실제 코드베이스 동기화 확인 |
| `mcp-server/` | AI 코딩 도구에서 디자인 시스템을 쿼리하는 MCP 서버 |

### Planning & Tracking

| 파일 | 역할 |
|------|------|
| `AGENT_DESIGN_SYSTEM_ROADMAP.md` | 3-Phase 로드맵, 진행 추적, 기술적 결정 로그 |
| `GUIDE.md` | 이 문서. 구조와 워크플로우 설명 |

---

## 파일 간 관계도

```
사용자 요청: "주문 리스트 페이지에 필터 추가해줘"
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ 1. conventions.json                                      │
│    → 파일 위치 파악: src/apps/msm-default/container/     │
│    → 네이밍 규칙: MC*, MT*, SC* 프리픽스                  │
│    → 3-layer 아키텍처: Page → Container → Component      │
└───────────────────────┬─────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 2. api-ui-contracts.json                                 │
│    → Order 엔티티의 필드 매핑 확인                        │
│    → 테이블 컬럼 정의: filter 타입 확인                   │
│    → 사용하는 hooks: useOrders, usePublisherCurrency      │
│    → Container 파일 위치 확인                             │
└───────────────────────┬─────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 3. patterns.json                                         │
│    → "List Page Pattern" 참조                            │
│    → 필터 추가 시 useTableSearchBarAndFilter 사용         │
│    → Error Handling Pattern 적용                         │
└───────────────────────┬─────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 4. components.json                                       │
│    → MCTable 컴포넌트 filterConfig 확인                   │
│    → MCFormSingleRichSelect (필터 UI) props 확인          │
│    → 접근성 요구사항 확인                                 │
└───────────────────────┬─────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 5. tokens.json                                           │
│    → 스타일링에 사용할 색상/간격 토큰                      │
│    → theme.mcui.palette.* / theme.mcui.spacing()         │
└───────────────────────┬─────────────────────────────────┘
                        ▼
                   코드 생성 완료
```

---

## Agent Workflow: 작업 유형별 참조 순서

### A. 새 페이지 생성

```
1. conventions.json  → 파일 위치, 네이밍, 3-layer 아키텍처
2. patterns.json     → 페이지 유형별 패턴 (list/detail/create/edit)
3. api-ui-contracts  → 엔티티의 proto→model→UI 매핑, API 엔드포인트
4. components.json   → 사용할 컴포넌트 선택, props 확인
5. tokens.json       → 스타일링 토큰 적용
```

### B. 기존 페이지 수정

```
1. api-ui-contracts  → 수정 대상 엔티티의 매핑 확인
2. conventions.json  → 수정할 파일 위치 파악 (container? component?)
3. components.json   → 변경/추가할 컴포넌트 props 확인
4. tokens.json       → 스타일 변경 시 토큰 참조
```

### C. 새 API 엔드포인트 연동

```
1. api-ui-contracts  → 유사 엔티티의 매핑 패턴 참조
2. patterns.json     → tRPC Data Fetching Pattern, Error Handling Pattern
3. conventions.json  → hook/converter 네이밍 규칙
4. components.json   → 데이터 표시할 컴포넌트 선택
```

### D. 스타일링/디자인 변경

```
1. tokens.json       → 사용 가능한 토큰 확인 (하드코딩 금지!)
2. components.json   → 컴포넌트 내장 스타일/상태 확인
3. conventions.json  → styled-component SC* 네이밍, $transient props
```

### E. 폼 개발

```
1. components.json   → MCForm* 컴포넌트 (17개) props 확인
2. patterns.json     → Form Pattern (Formik + panels + field groups)
3. api-ui-contracts  → 폼 필드 ↔ proto 필드 매핑 (formFields 섹션)
4. conventions.json  → Formik context 규칙, validation 패턴
```

---

## 각 파일 상세 구조

### tokens.json

```
{
  colors: {
    text: { ... 12 tokens },      ← props.theme.mcui.palette.content.*
    background: { ... 23 tokens }, ← props.theme.mcui.palette.background.*
    border: { ... 10 tokens },     ← props.theme.mcui.palette.border.*
    icon: { ... 9 tokens }         ← props.theme.mcui.palette.content.*
  },
  typography: { ... 9 scales },    ← props.theme.mcui.typography.*
  spacing: { ... 8 multipliers },  ← props.theme.mcui.spacing(n) → n × 8px
  animation: { durations, easings, patterns },
  elevation: { sunken, default, raised, overlay },
  borderRadius: { small, default, large, circle },
  breakpoints: { xs, sm, md, lg, xl }
}
```

### components.json

```
{
  categories: {
    "Form Inputs (v1)": [17 components],   ← MCForm* (Formik 필수)
    "Buttons": [3 components],              ← MCButton2, MCIconButton, MCMoreActionsButton
    "Navigation": [2 components],           ← MCBarTabs, MCBreadcrumb
    "Feedback & Overlay": [3 components],   ← MCCommonDialog, MCPopover, MCSnackbar
    "Display": [5 components],              ← MCTextEllipsis, MCLoader, MCBadge, ...
    "Table": [1 component],                 ← MCTable
    "Layout": [3 components],               ← MCContentLayout, MCRootLayout, MCSidebar
    ...
  }

  // 각 컴포넌트:
  {
    name, description, path,
    props: [{ name, type, required, default, description }],
    accessibility: { role, keyboard, aria, focusManagement },
    states: [default, hover, focus, disabled, error, ...],
    dos: [...], donts: [...],
    example: "코드 예시"
  }
}
```

### patterns.json

```
{
  patterns: [
    "Basic Form Pattern",           ← Formik + MCFormPanel + MCFormFieldGroup
    "Full-Page Form Pattern",       ← MCFormLayout with breadcrumbs/footer
    "List Page Pattern",            ← tabs + MCContentLayout + MCTable
    "Detail Page Pattern",          ← dependent queries + error handling
    "Create Page Pattern",          ← form + mutation + navigation
    "Edit Page Pattern",            ← fetch + pre-populate + update
    "Page→Container→Component",     ← 3-layer 필수 아키텍처
    "Styled Component Pattern",     ← SC prefix, transient $props, theme tokens
    "tRPC Data Fetching Pattern",   ← React Query hooks
    "Error Handling Pattern",       ← useInAppAlert
    "i18n Usage Pattern",           ← react-i18next namespacing
    "Route Registration Pattern",   ← enum → template → config 3-step
    ...20개 total
  ]
}
```

### conventions.json

```
{
  naming: {
    MC → Component,    MT → Type,
    SC → Styled,       ME → Enum,
    use → Hook
  },
  fileNaming: {
    PascalCase.tsx → React component,
    camelCase.ts → config/utils,
    index.ts → barrel export
  },
  importOrder: "React → 3rd party → Moloco UI → Internal → Relative",
  architecture: "Page (thin) → Container (logic) → Component (pure UI)"
}
```

### api-ui-contracts.json

```
{
  entities: {
    "Order": {
      proto: { type, file, apiEndpoints },
      converter: { file, functions },
      model: { type, file },
      fieldMappings: [
        { proto → model → ui → renderer }   ← 각 필드의 전체 체인
      ],
      tableColumns: [...],                    ← 테이블 컬럼 정의
      containers: { list, detail, create },   ← 관련 파일 위치
      hooks: [...]                            ← 사용하는 hooks
    },
    "AuctionOrder": { ... },
    "Creative": { ... },
    "Advertiser": { ... },
    "Product": { ... },
    "PublisherTarget": { ... }
  },
  commonPatterns: { ... },                    ← micro currency, timestamp 등 공통 규칙
  cellRenderers: { ... }                      ← 테이블 셀 렌더러 카탈로그
}
```

---

## Strict Rules (에이전트/사람 모두)

이 규칙은 `CLAUDE.md`에도 정의되어 있으며, 디자인 시스템 사용 시 반드시 준수:

| 규칙 | 이유 |
|------|------|
| 색상 하드코딩 금지 → `theme.mcui.palette.*` | 다크모드/테마 대응 |
| 간격 하드코딩 금지 → `theme.mcui.spacing(n)` | 일관된 레이아웃 |
| 폰트 하드코딩 금지 → `theme.mcui.typography.*` | 타이포 시스템 유지 |
| inline style 금지 → styled-components | 성능 + 일관성 |
| Form input은 Formik 내부 필수 | 폼 상태 관리 통일 |
| 비HTML prop → `$` prefix (transient) | DOM 경고 방지 |
| 모든 문자열 → `useTranslation` | i18n 대응 |

---

## MCP Server: 프로그래밍 방식으로 쿼리

JSON 파일을 직접 읽는 대신, MCP 서버를 통해 필요한 정보만 쿼리할 수 있습니다:

```bash
# MCP 서버 등록
claude mcp add msm-design-system -- npx ts-node design-system/mcp-server/src/index.ts
```

```
사용 가능한 도구:
├── list_components      → 전체 컴포넌트 목록
├── get_component        → 특정 컴포넌트 상세 (props, 예시)
├── list_tokens          → 토큰 카테고리별 목록
├── get_tokens           → 특정 토큰 값 조회
├── list_patterns        → 패턴 목록
├── get_pattern          → 특정 패턴 상세
├── get_conventions      → 컨벤션 조회
└── get_icon_catalog     → 아이콘 목록
```

---

## 향후 계획

자세한 로드맵은 `AGENT_DESIGN_SYSTEM_ROADMAP.md` 참조.

**Phase 1 (현재):** 디자인 시스템 강화
- [x] api-ui-contracts.json
- [ ] Component Semantic Actions
- [ ] Page Blueprints
- [ ] Component State Machines

**Phase 2:** 에이전트 도구 구축 (Figma 연동, 스크린샷 검증)

**Phase 3:** 완전한 자율 루프 (Sandbox, Self-healing)

최종 목표: **Ramp Inspect처럼 에이전트가 PR의 30%를 자율 생성**
