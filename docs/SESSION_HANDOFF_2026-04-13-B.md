# Session Handoff — 2026-04-13 (Session B)

## 이 세션에서 완료한 것

### 1. 코드 품질 개선 (19건)

#### Ops Hub (7건)
- 공유 모듈 추출 (`analytics/types.ts`, `helpers.ts`, `hooks.ts`) — 4개 파일 중복 제거
- `AnalyticsPanels.tsx` 585줄 레거시 삭제
- AbortController로 fetch 레이스 컨디션 해결
- `chrome://` 링크 → 텍스트 안내
- 버전 상수 통일 (`constants.ts`)
- 파이프라인 보드 768px 반응형
- 뷰 토글 `aria-pressed`

#### DS Site (12건)
- `any` 13곳+ → 4개 proper interface (`TokensJson`, `StateMachinesJson`, `ComponentBehaviorsJson`)
- ARIA 속성 9개 인터랙티브 프리뷰 전체
- `ComponentPreview.tsx` 734→271줄 (17개 파일 분할)
- `ComponentDetailPage.tsx` 764→245줄 (8개 탭 분할)
- 죽은 코드 삭제 (ColorsPage, _location)
- deprecated `execCommand` 제거, `lang="ko"`, React.memo, lazy loading

### 2. 새 기능 (Phase 1-2)
- **MCP 서버** — 9개 도구, 828줄, `design-system-mcp/`
- **llms.txt** — 80+ 컴포넌트 AI-readable, `design-system-site/public/llms.txt`
- **Shiki 구문 강조** — 5개 언어만 로드 (`CodeBlock.tsx`)
- **⌘K 글로벌 검색** — cmdk, 페이지+컴포넌트 퍼지 검색

### 3. DS 품질 감사 + 데이터 정리 (9건)
- `assent` 오타 `known_misspelling` 문서화
- Form 컴포넌트 12개 중복 → "Form Shared" 카테고리 제거
- Warning 텍스트 WCAG `wcag_note` 추가
- border 토큰 혼동 해소
- zero-usage/low-adoption 플래그
- `semantic-palette.json` 삭제 (중복)
- workflow JSON 7개 → `workflows/` 분리

### 4. Phase 3 구현
- **다크 모드** — CSS 변수 60곳+, 테마 토글, localStorage, Shiki 테마 전환
- **Blocks 페이지** — shadcn 스타일 (miniature page renders + diff viewer + live preview)
- **미사용 JSON 활용** — code-examples → Patterns, error-patterns/ux-criteria → Governance
- **토큰 네이밍 맵** — DS 시멘틱 ↔ 런타임 경로 매핑 테이블

### 5. Ops Hub 재설계
- **Overview 리서치 기반 재설계** — Helicone/Copilot/Vercel 패턴 적용
  - Pipeline Funnel → 삭제
  - Stat cards: Success Rate / Today's Requests / Avg Latency / Error Rate
  - 인프라 상태 1줄 strip
  - Daily Activity 차트 (Recharts, 7일 기본 + 날짜 피커)
  - Agent Performance (스택 바 + 칩)
  - Coverage (깔끔한 진행 바)
  - Recent Requests (Vercel 배포 카드 스타일)
- **Requests 테이블** — ID 컬럼 추가, CSS grid 수정
- **디자인 통일** — DS 사이트 Carbon 스타일로 Ops Hub + Chrome Extension 재디자인

### 6. Chrome Extension 개선
- **인프라 상태 표시** — 사이드패널 상단 (Orchestrator + Sandboxes + Model)
- **진행 카드 애니메이션** — step pulse, shimmer, progress bar, working dot
- **AI 분석 (Inspect Agent)** — Claude Sonnet 4.6이 실행 계획 생성
- **aiAnalysis 저장** — Chrome Extension → 오케스트레이터 → Request Detail 표시
- **content-script** — chrome.runtime 가드 추가

### 7. 프리뷰 아키텍처 재설계
- **Draft → Preview → Approve → PR** 흐름 구축
  - sandbox에만 변경사항 존재 (로컬 소스 안 건드림)
  - Diff Viewer (`/api/diff-view/:id`) — 구문 강조 diff + 스크린샷 + Approve/Reject
  - Live Preview — sandbox vite 서버 (pnpm install + vite 자동 시작)
  - Approve → `gh pr create` (git branch + commit + PR)
  - Reject → sandbox 삭제
- **프리뷰 프록시** — `/preview/:id/*` 역프록시 (오케스트레이터 경유)

### 8. 오케스트레이터 개선
- `/api/sandboxes` 엔드포인트 추가
- `/api/diff-view/:id` HTML diff viewer 엔드포인트
- AI 분석: `max_tokens: 800 → 1500`, 잘린 JSON 자동 복구
- Provider 자동 감지: `sk-ant-` → anthropic 우선
- OpenCode provider 지원 (fallback)
- 에러 로깅 강화

### 9. Codex 코드 리뷰 수정 (5건)
- tsconfig paths 누락 (dashboard + DS site)
- 레거시 파일 12개 삭제
- `reload` 타입 래퍼 추가
- dashboard `validation-runner.json` import 경로 수정

---

## 현재 상태

### 실행 중인 서버
```bash
# Ops Hub
cd dashboard && pnpm dev  # → http://localhost:4174

# Design System Site
cd design-system-site && pnpm dev  # → http://localhost:4176

# tving OMS (로컬)
cd msm-portal/js/msm-portal-web && pnpm start:tving:test  # → http://localhost:8000

# Orchestrator
cd orchestrator && SANDBOX_PROVIDER=anthropic SANDBOX_MODEL=claude-sonnet-4-6 node server.js  # → http://localhost:3847
```

### LLM 설정
| 용도 | 모델 | API |
|------|------|-----|
| AI 분석 (실행 계획) | claude-sonnet-4-6 | ANTHROPIC_API_KEY |
| 에이전트 (코드 수정) | claude-sonnet-4-6 | ANTHROPIC_API_KEY (sandbox) |
| Fallback | opencode/gpt-5-nano | OpenCode auth.json |

### GitHub npm 토큰
- `~/.npmrc` — 새 토큰으로 갱신됨 (2026-04-13)
- sandbox에서 `pnpm install` 정상 작동 확인

---

## 다음 세션에서 해야 할 것

### 우선순위 높음
1. **Live Preview 로그인 문제** — sandbox vite는 별도 origin이라 Firebase 로그인 필요. auth bypass 또는 test token 주입 방안 필요
2. **Approve → PR 생성 테스트** — `gh pr create` 플로우 실제 테스트
3. **Chrome Extension AI 분석 UI** — Claude가 생성한 steps/risks/verification을 풍부하게 표시

### 개선 여지
4. **DS Site Blocks** — 더 많은 패턴 프리뷰 추가 (form-basic, tab-navigation 등)
5. **Ops Hub 다크 모드 차트 색상** — Recharts 다크 모드 대응
6. **MCP 서버 Claude Code 연동** — `.claude/mcp_servers.json` 설정
7. **CLI 레지스트리** — `npx moloco-ds add MCButton2` (장기)

---

## 메모리에 저장된 것
- `reference_ds_research.md` — 8개 DS 벤치마크 분석
- `project_ds_direction.md` — DS 사이트 개선 로드맵
- `project_ds_product_gap.md` — DS-제품 간극 분석

---

## 커밋 히스토리 (미커밋 — 110개 파일 변경 대기 중)
```
git status: 110 files changed, 6905 insertions(+), 7985 deletions(-)
```
커밋 전 Codex 리뷰 완료됨. 다음 세션에서 리뷰 결과 확인 후 커밋 권장.
