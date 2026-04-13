# Session Handoff — 2026-04-13

## 이 세션에서 완료한 것

### 1. Ops Hub 재구축 (완료)
- `dashboard/` → Linear 스타일 다크 테마로 완전 재작성
- CSS 완전 재작성 (#18181b 다크, Inter 13px, 8px 그리드)
- 3개 페이지: Overview, Requests, Settings
- Overview: Analytics API 기반 파이프라인 요약, 시간대별 Bar+Line 차트, 상태 도넛 차트
- Requests: List/Pipeline 뷰 토글, 상태 필터, 30초 자동 갱신
- Request Detail: stat 카드, 2컬럼 상세, 실행 레이어, 타임라인
- Tasks 페이지 제거 (프로젝트 관리용 → 요청 파이프라인 중심으로 전환)

### 2. Design System 사이트 구축 (완료 + 고도화)
- `design-system-site/` 신규 Vite+React 프로젝트 (포트 4176)
- Carbon Design (IBM) 라이트 테마
- 7개 페이지: Overview, Tokens, Components, Patterns, UX Writing, Governance

#### 컴포넌트 상세 (7탭)
- Usage: When to use/Don't, Do/Don't 카드, Anti-patterns, Commonly paired, Anatomy 다이어그램
- Code: Import 경로, Props, 코드 예시, Recipe (모두 Copy-to-clipboard)
- Style: Dimensions, Padding, Spacing, Border 스펙 (tokens.json 데이터)
- States: State Machine 시각적 다이어그램, Golden States 컬러 도트
- Behavior: Semantic Actions, Data Flow 3열 카드
- Accessibility: ARIA role, 키보드 인터랙션 테이블, 스크린리더
- Notes: 구현 노트

#### 프리뷰 시스템
- 33개 컴포넌트 프리뷰 (16개 인터랙티브)
- Interactive Prop Controls (10개 컴포넌트): variant/size/disabled/loading 등 드롭다운/토글
- Anatomy 다이어그램 (4개 compound 패턴): Form, ContentLayout, Dialog, Table

#### Tokens 페이지
- Role 기반 시멘틱 컬러 카드 (9 roles: neutral, brand, danger, success 등)
- 각 카드: Text/Bg/Border/Icon 4색 스와치 + 상태 칩 + 실제 미리보기 + 컴포넌트 목록
- Color Palette 탭 (Light/Dark 토글)
- Spacing 탭 (시각적 바 차트)
- Typography 탭 (실제 렌더링 예시)

#### Patterns 페이지
- 5개 카테고리 탭: Page, Form, Architecture, UI, Cross-cutting
- 패턴 카드: Layer 다이어그램, File 체크리스트, Validation 체크리스트, 코드 예시

### 3. Design System 데이터 확장 (완료)

| 항목 | Before | After |
|------|--------|-------|
| 엔티티 API-UI 계약서 | 6/21 (29%) | **21/21 (100%)** |
| 태스크 타입 (index.json) | 12 (greenfield only) | **15** (+modify, debug, understand) |
| 완전 패턴 | 7/20 | **20/20** (모두 layers+files+validation) |
| PM 인텐트 | 7 (수정만) | **12** (+new_page, new_feature 등) |
| 라우트 프로필 | 4 (auth만) | **14** (+10개 주요 페이지) |

### 4. 리서치 & 분석
- Top 8 Design System 벤치마크 (shadcn/MUI/Ant/Mantine/Radix/Carbon/Primer/Chakra)
- DS ↔ msm-portal 간극 분석 (공유 컴포넌트 96%, 앱 도메인 0% → 100%)
- 메모리에 저장됨: reference_ds_research.md, project_ds_direction.md, project_ds_product_gap.md

---

## 다음 세션에서 해야 할 것

### Track A 남은 항목

#### A6. Blocks/Compositions 섹션 (shadcn 스타일)
- 전체 페이지 조합 예시: "목록 페이지는 이렇게 생겼다"
- 개별 컴포넌트가 어떻게 합쳐져서 실제 페이지가 되는지 보여줌
- patterns.json의 list-page, detail-page, create-page, edit-page를 시각적으로
- 코드 + 프리뷰 + 컴포넌트 하이라이트

#### A7. 검색 (⌘K)
- 사이트 전체 퍼지 검색
- 컴포넌트, 토큰, 패턴 모두 검색 가능

#### A8. 다크 모드 토글
- DS 사이트에 라이트/다크 모드 전환

### 개선 여지
- PatternsJson 타입 캐스팅 에러 (App.tsx) — 작동은 하지만 tsc 경고
- 프리뷰 커버리지: 33/99 커스텀 프리뷰 → 나머지 generic fallback
- Golden States: 15/99 → 나머지 컴포넌트 추가
- Anatomy: 4개 패턴 → 추가 compound 패턴 (MCAccordion, MCPopover 등)

---

## 실행 방법

```bash
# Ops Hub (Linear Dark)
cd /Users/kyungjae.ha/Documents/moloco-inspect/dashboard
pnpm dev  # → http://localhost:4174 (or 4175)

# Design System Site (Carbon Light)
cd /Users/kyungjae.ha/Documents/moloco-inspect/design-system-site
pnpm dev  # → http://localhost:4176
```

---

## 커밋 히스토리
```
93a1216 feat: add interactive prop controls + anatomy diagrams
32fad67 feat: add Style tab, complete all 21 entity contracts
0bf9766 feat: rebuild Ops Hub, create DS site, expand DS data
fbdaf15 docs: add session handoff for 2026-04-12
```

---

## 메모리에 저장된 것
- `reference_ds_research.md` — 8개 DS 벤치마크 분석 결과
- `project_ds_direction.md` — DS 사이트 개선 로드맵
- `project_ds_product_gap.md` — DS-제품 간극 분석 (이제 100% 엔티티 커버)
