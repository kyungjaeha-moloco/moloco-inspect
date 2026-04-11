# MSM Portal Background Agent — 전략 설계 문서

> Ramp Inspect 모델을 MSM Portal에 적용하기 위한 리서치 기반 전략
>
> Created: 2026-04-07
> References: [Ramp Inspect](https://builders.ramp.com/post/why-we-built-our-background-agent), [Open-Inspect](https://github.com/ColeMurray/background-agents)

---

## 1. Ramp Inspect에서 배운 핵심 교훈

### Ramp이 성공한 이유
| 요소 | Ramp의 접근 | 우리에게 의미하는 것 |
|------|------------|-------------------|
| **Design System as Agent Input** | React internals + DOM 트리를 에이전트가 읽음 (스크린샷 아님) | JSON 디자인 시스템 → 에이전트가 이해하는 구조화된 입력 |
| **Full Dev Environment** | Vite + Postgres + Temporal이 샌드박스 안에서 실행 | Mock API + Vite dev server가 에이전트용 환경 |
| **Visual Verification** | Chrome Extension으로 before/after 스크린샷 | Playwright 기반 스크린샷 + 디자인 시스템 기준 비교 |
| **Background Execution** | 30분마다 이미지 리빌드, 즉시 시작 샌드박스 | Git worktree + mock 환경으로 격리 실행 |
| **Key Metric** | PR의 ~30%를 에이전트가 작성 | 측정 가능한 목표 설정 |

### Ramp vs MSM Portal 차이점
| | Ramp | MSM Portal |
|---|---|---|
| 규모 | 수백 명 엔지니어, 다수 레포 | CAS 팀, 단일 모노레포 |
| 인프라 | Modal + Cloudflare (커스텀) | Claude Code + Git worktree (기존 도구) |
| 디자인 시스템 | React internals 직접 접근 | JSON 기반 구조화된 디자인 시스템 (이미 구축) |
| 백엔드 | 실제 서버 환경 | Mock API (백엔드 없이 실행) |

**핵심 인사이트**: Ramp은 커스텀 인프라를 구축했지만, 우리는 **Claude Code + 기존 도구**로 동일한 루프를 구현할 수 있다. 우리의 강점은 **이미 구조화된 디자인 시스템**이 있다는 것.

---

## 2. 필요한 디자인 시스템

### 현재 상태 (13개 JSON 파일)
```
✅ 완성된 것:
tokens.json          — 색상, 스페이싱, 타이포, 애니메이션
components.json      — 67개 컴포넌트, props, 접근성
patterns.json        — 7개 페이지 블루프린트
conventions.json     — 네이밍, 파일구조, 임포트 규칙
api-ui-contracts.json — proto → model → UI 매핑
component-behaviors.json — semantic actions + data flow
state-machines.json  — 상태 전이 규칙
index.json           — 에이전트 로딩 가이드
generation-protocol.json — 5-phase 생성 프로토콜
validation-runner.json   — 29개 검증 체크
ux-criteria.json     — 19개 UX 기준
visual-inspection.json   — 21개 시각 검증 기준
auto-fix-loop.json   — 14개 자동 수정 전략
```

### 추가로 필요한 것

#### A. Visual Reference Database (신규)
에이전트가 "정상"이 어떤 모습인지 알아야 함
```json
{
  "page_type": "entity_list",
  "reference_screenshots": {
    "desktop": "refs/entity-list-desktop.png",
    "empty_state": "refs/entity-list-empty.png",
    "loading": "refs/entity-list-loading.png",
    "error": "refs/entity-list-error.png"
  },
  "visual_invariants": [
    "header height = 56px",
    "sidebar width = 220px",
    "table row height = 48px",
    "primary action button is always top-right"
  ]
}
```

#### B. Code Examples Database (신규)
각 패턴의 실제 코드 예시 (에이전트가 복사해서 수정)
```json
{
  "pattern": "entity_list",
  "example_entity": "order",
  "files": {
    "page": "src/apps/msm-default/page/order/OrderListPage.tsx",
    "container": "src/apps/msm-default/container/order/list/OrderListContainer.tsx",
    "component": "src/apps/msm-default/component/order/OrderListComponent.tsx"
  },
  "key_patterns": [
    "useQuery for data fetching",
    "MCTableActionBar for filters",
    "MCI18nTable for list rendering"
  ]
}
```

#### C. Error Pattern Database (신규)
에이전트가 자주 만드는 실수와 수정 방법
```json
{
  "error": "Maximum update depth exceeded",
  "cause": "Formik form input outside Formik context",
  "fix": "Wrap form inputs in <Formik> provider",
  "detection": "grep for MCForm* without Formik ancestor"
}
```

#### D. Component Dependency Graph (신규)
어떤 컴포넌트가 어떤 Provider/Context를 필요로 하는지
```json
{
  "MCFormTextInput": {
    "requires": ["Formik", "ThemeProvider", "I18nextProvider"],
    "optional": ["MCFormPanel (layout)"]
  },
  "MCContentLayout": {
    "requires": ["ThemeProvider", "ReactRouter"],
    "optional": ["MCBreadcrumb (showBreadcrumb=true)"]
  }
}
```

---

## 3. 필요한 에이전트

Ramp의 단일 에이전트가 아닌, **역할 분리된 에이전트 파이프라인** 설계.

### Agent Pipeline Architecture
```
[요청] → [Planner] → [Coder] → [Runner] → [Verifier] → [PR]
              ↑                      ↓           ↓
         디자인 시스템           Mock 환경     스크린샷
              ↑                      ↓           ↓
         patterns.json          Vite dev     Playwright
```

### 에이전트 역할 정의

| 에이전트 | 역할 | 입력 | 출력 |
|---------|------|------|------|
| **Planner** | 요청을 분석하고 실행 계획 수립 | 자연어 요청 + 디자인 시스템 JSON | 파일 목록, 변경 계획, 사용할 패턴 |
| **Coder** | 코드 생성/수정 | 계획 + 디자인 시스템 + 코드베이스 | 변경된 파일들 |
| **Runner** | 코드 실행 및 빌드 검증 | 변경된 코드 | 빌드 성공/실패, 런타임 에러 |
| **Verifier** | 시각적 + 구조적 검증 | 스크린샷 + validation-runner.json | 통과/실패 보고서 |
| **Fixer** | 검증 실패 시 자동 수정 | 에러 보고서 + auto-fix-loop.json | 수정된 코드 |

### 에이전트별 도구 (Tools)

#### Planner Agent
```
- read: design-system/src/*.json (특히 index.json, patterns.json)
- search: codebase 검색 (기존 구현 참조)
- plan: 실행 계획 생성
```

#### Coder Agent
```
- read: components.json, api-ui-contracts.json, conventions.json
- write: 파일 생성/수정
- validate: validation-runner.json 기반 정적 검증
```

#### Runner Agent
```
- exec: pnpm typecheck (타입 체크)
- exec: pnpm lint (린트)
- exec: vitest run (테스트)
- exec: vite build (빌드)
- mock: Mock API 환경 구동
```

#### Verifier Agent
```
- screenshot: Playwright로 페이지 캡처
- compare: visual-inspection.json 기반 검증
- evaluate: ux-criteria.json 기반 UX 평가
```

---

## 4. 필요한 테스트 과정

### Ramp의 검증 모델
```
Backend: 테스트 실행 → 텔레메트리 확인 → 피처 플래그 체크
Frontend: 스크린샷 → before/after 비교 → React 트리 검사
```

### MSM Portal 검증 파이프라인 (5단계)

#### Stage 1: Static Analysis (자동, 즉시)
```bash
# 이미 있음
pnpm typecheck        # TypeScript 타입 체크
pnpm lint             # ESLint 규칙
# 추가 필요
validation-runner     # 디자인 시스템 규칙 (하드코딩 색상, i18n 등)
```

#### Stage 2: Unit/Component Tests (자동, ~30초)
```bash
vitest run --changed  # 변경된 파일 관련 테스트만
```

#### Stage 3: Visual Regression (자동, ~1분)
```
1. Mock 환경으로 Vite dev server 시작
2. Playwright로 대상 페이지 스크린샷
3. 기준 이미지와 pixel diff 비교
4. 임계값 초과 시 실패
```

#### Stage 4: UX Evaluation (에이전트, ~30초)
```
1. 스크린샷을 에이전트에게 전달
2. ux-criteria.json 기반 19개 기준 평가
3. visual-inspection.json 기반 21개 시각 검증
4. 점수 + 구체적 피드백 반환
```

#### Stage 5: Human Review (수동)
```
1. PR 생성 with before/after 스크린샷
2. 변경 요약 + 검증 결과 첨부
3. 사람이 최종 승인
```

### 필요한 테스트 인프라

| 도구 | 용도 | 상태 |
|------|------|------|
| Vitest | 유닛/통합 테스트 | ✅ 설정됨 (121개 테스트) |
| Playwright | E2E + 스크린샷 | ❌ 미설치 |
| Mock API | 백엔드 없이 UI 실행 | 🟡 부분 완성 (~70%) |
| Visual Regression | 기준 이미지 비교 | ❌ 미구축 |
| Validation Runner | 디자인 시스템 규칙 검증 | ✅ JSON 정의됨, 실행기 미구축 |

---

## 5. 현재 디자인 시스템 개선 계획

### 우선순위 1: 에이전트 실행 환경 완성 (1-2주)

현재 에이전트는 코드를 "생성"만 할 수 있고 "실행+검증"은 불가능.

| 작업 | 설명 | 의존성 |
|------|------|--------|
| **Mock API 100% 완성** | 모든 페이지가 Mock으로 렌더링 가능 | 현재 ~70% |
| **Playwright 설치 + 기본 스크린샷** | 주요 페이지 캡처 가능 | Mock API |
| **Validation Runner 실행기** | JSON 규칙을 실제로 검증하는 CLI | 없음 |

### 우선순위 2: 시각적 검증 루프 (2-3주)

에이전트가 "변경 → 확인 → 수정"을 반복할 수 있도록.

| 작업 | 설명 | 의존성 |
|------|------|--------|
| **기준 스크린샷 저장소** | 주요 페이지/상태별 기준 이미지 | Playwright + Mock API |
| **Visual Diff 파이프라인** | pixelmatch 기반 이미지 비교 | 기준 스크린샷 |
| **Visual Reference Database** | 에이전트가 참조할 "정상 상태" 정의 | 기준 스크린샷 |

### 우선순위 3: 코드 예시 데이터베이스 (1주)

에이전트가 새 페이지를 만들 때 참조할 실제 코드 예시.

| 작업 | 설명 | 의존성 |
|------|------|--------|
| **Example Extractor** | 기존 코드에서 패턴별 예시 추출 | patterns.json |
| **Code Examples JSON** | 패턴 → 파일 경로 → 핵심 코드 스니펫 | Example Extractor |

### 우선순위 4: 디자인 시스템 뷰어 (보류)

Storybook/Vite React 뷰어는 **에이전트에게 필수가 아님**.
에이전트는 JSON을 직접 읽으므로, 뷰어는 **사람의 리뷰 도구**.
→ 에이전트 실행 환경이 완성된 후 재개.

---

## 6. 구현 로드맵

### Phase 2A: Agent Execution Loop (다음 단계)
```
목표: 에이전트가 "코드 작성 → 빌드 → 스크린샷 → 검증"을 1회 수행

1. Mock API 커버리지 100% 달성
2. Playwright 설치 + 스크린샷 캡처 스크립트
3. validation-runner.json → CLI 도구 구현
4. 에이전트가 위 도구들을 사용하도록 CLAUDE.md에 워크플로우 인코딩
```

### Phase 2B: Visual Verification (그 다음)
```
목표: 에이전트가 변경 전/후를 시각적으로 비교

1. 주요 페이지 기준 스크린샷 수집 (10개 페이지 × 4개 상태)
2. pixelmatch 기반 diff 도구 구현
3. PR에 before/after 스크린샷 자동 첨부
```

### Phase 2C: Autonomous PR Creation
```
목표: Ramp처럼 "요청 → PR" 자동화

1. Git worktree 기반 격리 환경
2. 전체 파이프라인 통합: Plan → Code → Build → Screenshot → Verify → PR
3. Slack/GitHub Issue → 에이전트 트리거
```

---

## 7. 성공 지표

| 지표 | 현재 | 6개월 목표 | Ramp 수준 |
|------|------|-----------|----------|
| 에이전트 PR 비율 | 0% | 10% | 30% |
| 디자인 시스템 커버리지 | 13 JSON 파일 | +4 (visual refs, examples, errors, deps) | N/A |
| Mock API 커버리지 | ~70% | 100% | N/A |
| Visual Regression 커버리지 | 0% | 주요 10페이지 | 전체 |
| 에이전트 빌드 성공률 | 측정 불가 | >80% | >90% |

---

## 8. 핵심 결정 사항

### 결정 1: 커스텀 인프라 vs 기존 도구
**→ 기존 도구 (Claude Code + Git worktree + Playwright)**
- Ramp은 Modal + Cloudflare로 커스텀 인프라를 구축했지만, 우리 규모에서는 과도
- Claude Code가 이미 코드 생성 + 실행을 지원
- Git worktree로 격리 환경 대체 가능

### 결정 2: 스크린샷 vs React 트리 검사
**→ 스크린샷 우선, React 트리는 나중에**
- Ramp은 Chrome Extension으로 React internals에 접근
- 우리는 Playwright 스크린샷 + visual-inspection.json으로 시작
- React DevTools 연동은 Phase 3에서 검토

### 결정 3: 디자인 시스템 뷰어
**→ 보류. 에이전트 실행 환경이 먼저**
- Vite React 뷰어는 의존성 해석 문제로 복잡
- 에이전트는 JSON을 직접 읽으므로 뷰어 불필요
- 기존 static HTML 뷰어를 사람 리뷰용으로 유지

### 결정 4: Background Agent 아키텍처
**→ Claude Code 기반 + Cron/Trigger**
- Open-Inspect처럼 별도 인프라 대신 Claude Code의 기존 기능 활용
- `/schedule` (cron trigger)로 정기 작업 실행
- Slack 연동은 MCP를 통해 구현
