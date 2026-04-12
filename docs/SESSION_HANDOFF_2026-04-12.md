# Session Handoff — 2026-04-12

## 이 세션에서 완료한 것

### 1. Docker Container Sandbox (완료, 동작함)
- Git worktree → Docker container 전환
- OpenCode server mode (HTTP API) 기반 agent 실행
- Claude Sonnet으로 실제 msm-portal 코드 수정 + diff 수집 검증됨
- `sandbox/` 디렉토리: Dockerfile, agents, scripts
- `tooling/sandbox-manager/`: container lifecycle, OpenCode client, prompt builder
- `orchestrator/server.js`: sandbox pipeline으로 전환 완료

### 2. Chrome Extension (완료, 대부분 만족)
- Codex → "Moloco Inspect" 리브랜딩
- 라이트/다크 테마 (CSS 변수 기반, localStorage 저장)
- Progress stepper (준비→코드수정→검증→완료) + 경과 시간
- AI 분석 plan 카드 (Sonnet이 요청을 분석해서 구체적 plan 생성)
- "바로 진행" 버튼 (clarification skip)
- 에러 메시지 한국어화
- Settings 패널: 한국어, 시스템 정보, 바로가기 링크
- Focus 스타일 수정

### 3. Dashboard & Design System 사이트 (불만족 — 다시 기획 필요)
- App.tsx 1800줄 → 페이지 분리 완료
- Ops Hub / Design System 탑 네비게이션 분리 완료
- CSS를 Nexus 스타일로 재작성 완료
- RequestListPage, ComponentDetailPage 신규 생성
- **하지만 사용자가 만족하지 않음** — "조금 나아진 정도"

---

## 사용자 피드백 요약

### Chrome Extension — 긍정적
- AI가 요청을 분석하는 카드: 방향은 맞지만 더 지능적이어야 함
- 테마 전환: 동작함
- Progress stepper: 좋음

### Dashboard & Design System — 불만족
- "엉성해", "전혀 안 바뀐 느낌", "구조적 문제가 많아"
- **핵심 문제**: CSS만 바꿔서는 안 됨. **기획부터 다시 해야 함**
- 구조, 데이터 표현, 사용성, 네비게이션 모두 재설계 필요

### 사용자가 보여준 레퍼런스 디자인
- **Nexus Dashboard** (이미지 #8): 다크 사이드바, 깔끔한 통계 카드, 도넛 차트, 컬러 배지
- "짜임새 있고 간결한 느낌"이 핵심 키워드
- Linear, Vercel, Stripe Dashboard 수준을 원함

---

## 분석 결과 (3개 agent 분석 완료)

### Dashboard UX 분석 결과 (`.sisyphus/plans/dashboard-viewer-improvement.md`)
- App.tsx 1800줄 단일 파일 → 분리 완료
- API URL 하드코딩 → 환경변수화 완료
- Analytics 1회 fetch → 30초 polling 완료
- 에러 재시도 버튼 → 완료

### Dashboard 구조 분석 결과 (`.sisyphus/plans/dashboard-restructure-v2.md`)
- 정보 아키텍처 문제 12가지 식별
- 사이드바 6곳에서 각각 다르게 정의 → navigation.ts 중앙화 완료
- Kanban 데이터 하드코딩
- `/components/:slug` 라우트 누락 → 추가 완료
- Analytics 목록 페이지 없음 → RequestListPage 추가 완료
- Ops/DS 혼재 → 탑 네비게이션 분리 완료

### Design System 분석 결과
- 22개 JSON 중 5개만 페이지 존재
- Agent가 22개 중 5개만 참조 → index.json task routing 추가 완료
- 스키마 4개만 존재 (22개 중)
- Validation 미통합 → validate.ts 연동 완료
- MCP 서버 4개 JSON만 노출

---

## 다음 세션에서 해야 할 것

### Dashboard & Design System 기획부터 다시

**현재 문제 (왜 만족스럽지 않은가):**
1. CSS만 바꿔서는 SaaS 수준이 안 됨 — 컴포넌트 구조 자체가 바뀌어야 함
2. 데이터 표현이 단순 나열 — 인사이트를 주는 시각화 필요
3. 네비게이션이 기계적 — 사용자 flow 기반으로 설계 필요
4. 페이지 콘텐츠가 빈약 — DesignSystemPage는 링크 모음 수준
5. 전체적으로 "만들어진" 느낌이지 "설계된" 느낌이 아님

**기획 시 고려할 점:**
1. **두 사용자 그룹의 User Journey 정의**: PM/SA (Ops) vs 개발자 (DS)
2. **각 페이지의 "핵심 질문"**: 이 페이지에서 사용자가 답을 얻어야 하는 질문은?
3. **데이터 시각화 전략**: 숫자만 나열 vs 트렌드/비교/분포
4. **인터랙션 패턴**: 필터, 정렬, 검색, drill-down
5. **레퍼런스 앱 벤치마킹**: Linear, Vercel, Stripe, Datadog 등에서 구체적으로 어떤 패턴을?

**접근 방식 제안:**
- Figma나 와이어프레임으로 먼저 레이아웃 설계
- 또는 사용자와 함께 "이 페이지에서 뭘 보고 싶은지" 인터뷰
- 페이지별로 mockup → 확인 → 구현 순서

---

## 현재 코드 상태

### 커밋 히스토리 (18개)
```
796d39d feat: add RequestListPage, ComponentDetailPage, fix bugs
6586b51 feat: restructure Dashboard with Ops Hub / Design System separation
8e720c4 feat: complete Dashboard CSS rewrite — Nexus-style
4767edc feat: redesign Dashboard CSS to SaaS-quality
ef735bc fix: remove double focus outline on input area
5a82b32 feat: settings gear icon, system info panel, quick links
1285736 fix: translate settings panel to Korean, fix theme icon toggle
d8f6640 fix: use Sonnet for request analysis, fix JSON parsing
407660c feat: AI-powered request analysis with thinking animation
e11b0fd feat: conversational AI execution plan card + dashboard link
27d5780 feat: add light/dark theme system with SaaS-quality design
c0ae9a3 feat: rebrand Chrome Extension from Codex to Moloco Inspect
c4d918d fix: add AnalyticsPanels.tsx with API base URL and auto-refresh
23d681b refactor: split Dashboard App.tsx into pages
f8d30cc feat: improve Chrome Extension UX and Design System agent intelligence
78761f1 fix: increase agent timeout, fix diff extraction and polling
1b40a93 refactor: migrate orchestrator to Docker sandbox
1f793ad feat: add Docker container sandbox execution environment
```

### 파일 구조 (핵심만)
```
moloco-inspect/
  sandbox/                    ← Docker sandbox (완료, 동작함)
  tooling/sandbox-manager/    ← container 관리 (완료)
  orchestrator/server.js      ← sandbox pipeline (완료)
  chrome-extension/           ← Moloco Inspect (완료, 만족)
  dashboard/                  ← 다시 기획 필요
    assets/site.css           ← Nexus 스타일 CSS (구조 변경 필요)
    src/
      App.tsx                 ← 라우트 (86줄, /ops/* /design/*)
      navigation.ts           ← 중앙 네비게이션
      components/DocsLayout.tsx ← 탑바 + 사이드바 + 메인
      pages/                  ← 8개 페이지
      analytics/AnalyticsPanels.tsx
  design-system/              ← JSON source of truth (개선 여지)
  docs/
    SANDBOX_ARCHITECTURE.md   ← 신규 아키텍처 문서
```

### Docker Sandbox 실행 방법
```bash
# 1. Docker Desktop 시작
# 2. Sandbox image 빌드 (최초 1회)
cp /etc/ssl/cert.pem sandbox/host-ca.pem
bash sandbox/build-image.sh

# 3. Orchestrator 시작
ANTHROPIC_API_KEY="..." node orchestrator/server.js

# 4. Chrome Extension 로드
# chrome://extensions → Load unpacked → chrome-extension/
```

### API Keys (이 세션에서 사용)
- Anthropic: `sk-ant-api03-xb9L...VTzxLwAA` (credit 충전 필요할 수 있음)
- OpenAI: `sk-proj-h58c...4A` (quota 확인 필요)
- **보안 주의**: 다음 세션에서 key rotation 권장

---

## 메모리에 저장할 것

1. 사용자는 "CSS만 바꾸는 것"에 만족하지 않음 — 기획/구조부터
2. 레퍼런스: Nexus Dashboard, Linear, Vercel
3. "짜임새 있고 간결한" 디자인을 원함
4. Dashboard와 Design System 분리도 고려 중
5. Docker sandbox + OpenCode 조합은 동작함
6. Chrome Extension은 현재 상태에 대체로 만족
