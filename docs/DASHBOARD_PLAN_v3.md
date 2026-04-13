# Moloco Inspect — 사이트 재설계 기획안 v3

> 결정사항: Ops Hub와 Design System을 **완전 분리**된 두 개의 사이트로 구축
> 사용자: PM/SA + 개발자 모두
> 레퍼런스: Ops Hub → **Linear**, Design System → **Carbon Design (IBM)**

---

## 사이트 A: Ops Hub (Linear 스타일)

### 디자인 원칙
- **다크 모드 기본**, 미니멀, 정보 밀도 높음
- Inter 폰트, 13px 기본, 500 weight
- 사이드바 240px, 메인 컨텐츠 유동폭
- 행 높이 32px, 8px 그리드 시스템
- 색상: 다크 bg `#1a1a1e`, 액센트 `#5e6ad2`, 텍스트 `rgba(255,255,255,0.88)`

### 정보 아키텍처

```
OPS HUB
├── 📊 Overview (/)
│   핵심 질문: "지금 전체 진행률은? 주의가 필요한 건?"
│   ├── Progress bar (전체 완료율 — Done / Total)
│   ├── 상태별 카운트 (인라인: Backlog · In Progress · Done · Blocked)
│   ├── Blocked items 하이라이트 (빨간 배지, 즉시 눈에 띄게)
│   ├── 최근 활동 피드 (최근 완료/변경된 항목 5개)
│   └── Quick actions: 새 요청 생성, 요청 목록 보기
│
├── 📋 Tasks (/tasks)
│   핵심 질문: "각 작업의 상태는? 무엇을 먼저 해야 하지?"
│   ├── 리스트 뷰 (기본) — Linear 스타일 compact rows
│   │   컬럼: 상태 아이콘 | 제목 | 카테고리 라벨 | 우선순위 | 담당
│   ├── 보드 뷰 (토글) — 칸반 4열
│   ├── 필터바: 상태, 카테고리, 우선순위
│   ├── 정렬: 상태, 최근 업데이트, 우선순위
│   └── 키보드: ↑↓ 이동, Enter 상세, X 선택
│
├── 📨 Requests (/requests)
│   핵심 질문: "내 요청이 어디까지 됐지? 새 요청은 몇 개?"
│   ├── 요청 리스트 (Chrome Extension에서 들어온 요청)
│   │   컬럼: 상태 | 요청 텍스트 (truncated) | 생성일 | 처리 시간
│   ├── 상태 필터: 대기 · 분석중 · 완료 · 실패
│   ├── 요청 상세 (/requests/:id)
│   │   ├── 요청 원문
│   │   ├── AI 분석 결과 (plan)
│   │   ├── 실행 타임라인 (lifecycle events)
│   │   ├── 생성된 코드 diff (있으면)
│   │   └── 처리 시간, 모델, 토큰 사용량
│   └── 통계 요약: 총 요청수, 평균 처리시간, 성공률
│
└── ⚙️ Settings (/settings)
    ├── API 연결 상태 (Anthropic, OpenAI)
    ├── Docker Sandbox 상태
    └── 시스템 정보
```

### 페이지별 와이어프레임

#### Overview (/)
```
┌─────────────────────────────────────────────────────┐
│ ◆ Moloco Inspect                          ⌘K  ⚙️   │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ Overview │  Program Progress                        │
│ ●        │  ████████████████░░░░░░  71% (12/17)    │
│          │                                          │
│ Tasks    │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│          │  │  3  │ │  3  │ │  9  │ │  2  │       │
│ Requests │  │Back │ │Prog │ │Done │ │Block│       │
│          │  └─────┘ └─────┘ └─────┘ └─────┘       │
│          │                                          │
│ Settings │  ⚠ Blocked Items                         │
│          │  ○ MCI18nTable 마이그레이션 — 의존성 문제│
│          │  ○ MCCustomRichSelect — 스펙 미확정      │
│          │                                          │
│          │  Recent Activity                         │
│          │  ✓ MCButton contract 검증 완료    2h ago │
│          │  → MCInput validation 추가중     30m ago │
│          │  ✓ Color token 문서화 완료        1d ago │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

#### Tasks (/tasks)
```
┌──────────┬──────────────────────────────────────────┐
│          │ Tasks                    List ◉ Board ○   │
│ Overview │ ┌─────────────────────────────────────┐   │
│          │ │ 🔍 Filter   Status ▾  Category ▾    │   │
│ Tasks ●  │ └─────────────────────────────────────┘   │
│          │                                           │
│ Requests │  Backlog ─────────────────────────── (3)  │
│          │  ◯ MCDatePicker 스펙 작성     Form   low  │
│ Settings │  ◯ MCTimePicker 스펙 작성     Form   low  │
│          │  ◯ Error pattern 통합         UX     med  │
│          │                                           │
│          │  In Progress ────────────────────── (3)   │
│          │  ◐ MCInput validation 규칙    Form   high │
│          │  ◐ Table column 계약서        Table  med  │
│          │  ◐ Spacing token 검증         Token  med  │
│          │                                           │
│          │  Done ──────────────────────────── (9)    │
│          │  ✓ MCButton contract 완료     Form   high │
│          │  ✓ Color token 문서화         Token  high │
│          │  ...                                      │
└──────────┴──────────────────────────────────────────┘
```

#### Requests (/requests)
```
┌──────────┬──────────────────────────────────────────┐
│          │ Requests            38 total  94% success │
│ Overview │                                           │
│          │ Status ▾  ┌─────────────────────────┐     │
│ Tasks    │           │ 🔍 Search requests...   │     │
│          │           └─────────────────────────┘     │
│Requests● │                                           │
│          │  ✓ "MCButton에 loading 상태 추..."  3.2s  │
│ Settings │  ✓ "Table header 정렬 아이콘..."    5.1s  │
│          │  ◐ "Form validation 에러 메시..."   ...   │
│          │  ✗ "커스텀 차트 컴포넌트 생성..."   12.3s │
│          │  ✓ "MCInput placeholder 색상..."    2.8s  │
│          │                                           │
└──────────┴──────────────────────────────────────────┘
```

---

## 사이트 B: Design System (Carbon 스타일)

### 디자인 원칙
- **라이트 모드 기본**, 문서 가독성 최우선
- IBM Plex Sans 또는 Inter 폰트, 14px(0.875rem) 기본
- 사이드바 256px, 컨텐츠 최대 66rem
- 색상: 흰색 bg `#ffffff`, 액센트 blue `#0f62fe`, 텍스트 `#161616`
- 코드 블록: 다크 bg `#161616`, 모노 폰트

### 정보 아키텍처

```
DESIGN SYSTEM
├── 🏠 Overview (/)
│   핵심 질문: "디자인 시스템의 건강 상태는? 무엇이 바뀌었나?"
│   ├── 시스템 요약 (컴포넌트 수, 토큰 수, 패턴 수)
│   ├── Governance 현황
│   │   ├── Promotion 대기 (5개) — DS 래퍼 필요
│   │   ├── Deprecation 대기 (5개) — 마이그레이션 필요
│   │   └── Removal 대기 (9개) — 사용처 0
│   ├── 최근 변경사항 (last audit: 2026-04-08)
│   └── Quick links: 컴포넌트 카탈로그, 토큰, 패턴
│
├── 🎨 Foundations
│   ├── Colors (/foundations/colors)
│   │   핵심 질문: "이 맥락에서 어떤 색상 토큰을 써야 하지?"
│   │   ├── 모드 토글 (Light / Dark)
│   │   ├── 카테고리별 토큰 테이블
│   │   │   섹션: Text · Background · Border · Icon · Semantic
│   │   │   행: 스와치 | 토큰명 | Hex | 용도 설명
│   │   └── 사용 가이드라인 (Do/Don't)
│   │
│   ├── Spacing (/foundations/spacing)
│   │   핵심 질문: "간격은 어떤 단위를 쓰지?"
│   │   ├── 8px 기반 스케일 시각화
│   │   ├── 토큰 테이블: 이름 | 값 | 시각적 바
│   │   └── 사용 예시
│   │
│   └── Typography (/foundations/typography)
│       핵심 질문: "텍스트 스타일은 어떻게 적용하지?"
│       ├── 타입 스케일 (실제 렌더링 + 스펙)
│       ├── 폰트 weight 가이드
│       └── 코드 예시
│
├── 🧩 Components (/components)
│   핵심 질문: "이 컴포넌트를 어떻게 쓰고, 뭘 조심해야 하지?"
│   ├── 카탈로그 (검색 + 카테고리 필터)
│   │   카드: 이름 | 카테고리 | Tier | 상태 배지
│   │
│   └── Component Detail (/components/:slug)
│       4개 탭 (Carbon 스타일):
│       ├── [Usage] 사용 가이드
│       │   ├── 설명 + 언제 쓰는지 / 피해야 할 때
│       │   ├── Do/Don't 카드 (녹색 ✓ / 빨간 ✗ 상단 보더)
│       │   └── 의존성 (Required providers, Must be inside)
│       ├── [Code] 코드 & API
│       │   ├── Import 경로
│       │   ├── Props 테이블 (Name | Type | Default | Description)
│       │   ├── 코드 예시 (다크 코드블록 + 복사 버튼)
│       │   └── Preview recipe
│       ├── [States] 상태 & 변형
│       │   ├── Golden states 목록
│       │   └── State machine (상태 전이 다이어그램)
│       └── [Notes] 구현 노트
│           ├── Implementation notes
│           └── Dependency notes
│
├── 📐 Patterns (/patterns)
│   핵심 질문: "이 UI를 만들려면 어떤 패턴을 따르지?"
│   ├── 패턴 카탈로그 (20+ 패턴)
│   │   카드: 이름 | 설명 | 레이어 구조
│   └── Pattern Detail (/patterns/:id)
│       ├── 레이어 구조 다이어그램
│       ├── 파일 체크리스트
│       ├── 검증 체크리스트
│       └── 코드 예시
│
├── ✍️ UX Writing (/ux-writing)
│   핵심 질문: "이 상황에서 어떤 문구를 써야 하지?"
│   ├── Voice Principles (3-column 카드)
│   ├── Surface Rules (버튼, 에러, 빈 상태 등)
│   ├── Before/After 예시 (4-column 비교)
│   └── Validation 규칙 (자동 체크 + 수동 체크리스트)
│
└── 📊 Governance (/governance)
    핵심 질문: "어떤 컴포넌트가 승격/폐기 대상이지?"
    ├── Promotion Queue (5) — DS 래퍼 필요 목록
    ├── Deprecation Queue (5) — 마이그레이션 안내
    ├── Removal Queue (9) — 사용처 0 확인
    ├── Watch List (5) — 모니터링 중
    └── Audit 히스토리 (다음 감사: 2026-07-08)
```

### 페이지별 와이어프레임

#### Overview (/)
```
┌──────────────────────────────────────────────────────┐
│  Moloco Design System                                │
├────────────┬─────────────────────────────────────────┤
│            │                                         │
│ Overview ● │  Design System Overview                 │
│            │                                         │
│ Foundations │  ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  ├ Colors  │  │    79    │ │    52    │ │   20   │  │
│  ├ Spacing │  │Components│ │  Tokens  │ │Patterns│  │
│  └ Typo    │  └──────────┘ └──────────┘ └────────┘  │
│            │                                         │
│ Components │  Governance                             │
│            │  ┌─────────────────────────────────┐    │
│ Patterns   │  │ 🟢 Promotion    5 components    │    │
│            │  │ 🟡 Deprecation  5 components    │    │
│ UX Writing │  │ 🔴 Removal     9 components    │    │
│            │  │ 👁 Watch List   5 components    │    │
│ Governance │  └─────────────────────────────────┘    │
│            │                                         │
│            │  Last audit: 2026-04-08                  │
│            │  Next audit: 2026-07-08                  │
│            │                                         │
└────────────┴─────────────────────────────────────────┘
```

#### Component Detail (/components/mc-button)
```
┌────────────┬─────────────────────────────────────────┐
│            │  Components / MCButton                   │
│ Overview   │  Form Inputs v1 · Core · Active          │
│            │                                          │
│ Foundations│  ┌───────┬───────┬────────┬───────┐      │
│            │  │ Usage │ Code  │ States │ Notes │      │
│ Components●│  └───────┴───────┴────────┴───────┘      │
│  ├ MCButton│                                          │
│  ├ MCInput │  When to use                             │
│  ├ MCSelect│  ✓ Primary actions in forms              │
│  └ ...     │  ✓ Submit, cancel, navigation triggers   │
│            │                                          │
│ Patterns   │  When NOT to use                         │
│            │  ✗ Inline text links                     │
│ UX Writing │  ✗ Navigation-only actions               │
│            │                                          │
│ Governance │  ┌─────────────────┬─────────────────┐   │
│            │  │ ✓ Do            │ ✗ Don't          │   │
│            │  │ ┌─────────────┐ │ ┌─────────────┐ │   │
│            │  │ │  [Button]   │ │ │  [btn][btn] │ │   │
│            │  │ │ 명확한 라벨 │ │ │ 모호한 라벨 │ │   │
│            │  │ └─────────────┘ │ └─────────────┘ │   │
│            │  └─────────────────┴─────────────────┘   │
│            │                                          │
│            │  Dependencies                            │
│            │  Required: ThemeProvider, Formik          │
│            │  Must be inside: <Form> context           │
│            │                                          │
└────────────┴──────────────────────────────────────────┘
```

#### Component Detail — Code 탭
```
┌────────────┬─────────────────────────────────────────┐
│            │  Components / MCButton                   │
│            │                                          │
│            │  ┌───────┬───────┬────────┬───────┐      │
│            │  │ Usage │ Code ●│ States │ Notes │      │
│            │  └───────┴───────┴────────┴───────┘      │
│            │                                          │
│            │  Import                                  │
│            │  ┌──────────────────────────────── 📋 ┐  │
│            │  │ import { MCButton }              │  │
│            │  │   from '@moloco/mcui';           │  │
│            │  └─────────────────────────────────────┘ │
│            │                                          │
│            │  Props                                   │
│            │  ┌──────┬────────┬─────────┬──────────┐  │
│            │  │ Name │ Type   │ Default │ Desc     │  │
│            │  ├──────┼────────┼─────────┼──────────┤  │
│            │  │label │string  │ —       │버튼 텍스트│  │
│            │  │variant│enum   │'primary'│스타일     │  │
│            │  │disabled│bool  │ false   │비활성화   │  │
│            │  │loading│bool   │ false   │로딩 상태  │  │
│            │  └──────┴────────┴─────────┴──────────┘  │
│            │                                          │
│            │  Example                                 │
│            │  ┌──────────────────────────────── 📋 ┐  │
│            │  │ <MCButton                        │  │
│            │  │   label="저장"                    │  │
│            │  │   variant="primary"              │  │
│            │  │   onClick={handleSubmit}         │  │
│            │  │ />                               │  │
│            │  └─────────────────────────────────────┘ │
└────────────┴──────────────────────────────────────────┘
```

---

## 기술 구현 계획

### 프로젝트 구조 변경
```
moloco-inspect/
  dashboard/          → ops-hub/        (리네이밍)
  (신규)              → design-system-site/  (신규)
```

### Ops Hub 기술 스택
- React + React Router (기존 유지)
- CSS: 완전 재작성 (Linear 다크 테마)
- 데이터: 기존 analytics API + 칸반 데이터 동적화

### Design System Site 기술 스택
- React + React Router (신규)
- CSS: Carbon 스타일 라이트 테마
- 데이터: design-system/ JSON 직접 import
- 코드 블록: Prism.js 또는 Shiki 문법 하이라이팅

### 구현 순서
1. **Phase 1**: Ops Hub 재구축 (Overview → Tasks → Requests)
2. **Phase 2**: DS Site 구축 (Overview → Components → Foundations)
3. **Phase 3**: DS Patterns, UX Writing, Governance 페이지
4. **Phase 4**: 키보드 네비, 커맨드 팔레트, 검색 고도화

---

## CSS 디자인 토큰 (두 사이트)

### Ops Hub (Linear Dark)
```css
:root {
  --bg-primary: #1a1a1e;
  --bg-secondary: #222226;
  --bg-elevated: #2a2a2e;
  --bg-hover: rgba(255,255,255,0.05);
  --accent: #5e6ad2;
  --accent-muted: rgba(94,106,210,0.15);
  --text-primary: rgba(255,255,255,0.88);
  --text-secondary: rgba(255,255,255,0.56);
  --text-muted: rgba(255,255,255,0.40);
  --border: rgba(255,255,255,0.08);
  --success: #5cb85c;
  --warning: #f59e0b;
  --danger: #ef4444;
  --font: "Inter", -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", monospace;
  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.8125rem;  /* 13px — 기본 */
  --text-md: 0.9375rem;  /* 15px */
  --text-lg: 1rem;       /* 16px */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --sidebar-width: 240px;
}
```

### Design System Site (Carbon Light)
```css
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f4f4f4;
  --bg-code: #161616;
  --accent: #0f62fe;
  --accent-hover: #0043ce;
  --text-primary: #161616;
  --text-secondary: #525252;
  --text-helper: #6f6f6f;
  --border-subtle: #e0e0e0;
  --border-strong: #8d8d8d;
  --success: #24a148;
  --danger: #da1e28;
  --font: "Inter", "IBM Plex Sans", -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", "IBM Plex Mono", monospace;
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;   /* 14px — 기본 */
  --text-md: 1rem;
  --text-lg: 1.25rem;
  --text-xl: 1.5rem;
  --text-2xl: 2rem;
  --radius-sm: 0;        /* Carbon은 sharp edges */
  --radius-md: 4px;
  --sidebar-width: 256px;
  --content-max: 66rem;
}
```
