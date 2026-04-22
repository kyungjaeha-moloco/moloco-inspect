# Phase 3 — Canvas AI Pilot (TVING Moloco Ads)

**Status:** Approved 2026-04-18 — Step 1 in progress
**Created:** 2026-04-18
**Target pilot:** TVING Ad System → Moloco Ads 섹션 + 광고 소재 리뷰 메뉴 추가
**Target users:** SA, PM (프론트 코드 미작성)

---

## 1. 목표 (What success looks like)

PM이 Canvas를 열고:
1. Jira 티켓 URL + (선택) PRD URL 입력
2. AI가 문서를 읽고 **변경 계획(체크리스트)** 제안
3. PM이 계획 검토/수정 후 컨펌
4. AI가 **DS 패턴 기반으로 실제 제품 수준의 Before/After 화면** 생성
5. **Tweak 옵션** 으로 여러 베리에이션 비교
6. (선택) 승인 시 실제 코드 patch 생성 (기존 orchestrator 기능)

이 플로우가 **실제 TVING Moloco Ads 추가 프로젝트**에서 동작하면 파일럿 성공.

---

## 2. 방향 결정 사항 (직전 대화 합의)

| # | 결정 | 선택 |
|---|---|---|
| 1 | 고객 대면 vs 내부 기획 | 내부 기획 (Flow B) |
| 2 | PRD 도구 통합 대상 | Google Docs + Jira |
| 3 | Jira 통합 방식 | **입력측만 — 핀↔Jira 양방향 sync 없음** |
| 4 | AI 생성 fidelity | **DS 컴포넌트 기반 production-level** |
| 5 | DS 커버리지 전략 | 패턴 레벨 추가 + Canvas가 성장 견인 |
| 6 | Canvas와 Chrome Ext 관계 | **보완** (Canvas=탐색, Ext=정밀 수정) |
| 7 | 생성 백엔드 | **orchestrator 재사용** |

---

## 3. 기존 자산 활용 지도

이미 있는 것 (재사용):
- `orchestrator/server.js` (localhost:3847) — 아래 엔드포인트 전부 활용
  - `POST /api/prd/ingest` — PRD 파싱
  - `POST /api/analyze-request` — 요청 분석
  - `POST /api/change-request` — sandbox에서 Codex/Claude 실행 → 변경 + 스크린샷
  - `GET /api/events/:id` — SSE 진행 상태
  - `POST /api/approve/:id` — 실제 코드 적용
  - `POST /api/reject/:id` — 피드백 + 재시도
- `design-system/` 13 JSON (tokens, components, patterns, api-ui-contracts, pm-sa-request-schema, preview-verification, golden-example-states, ...)
- `design-system/mcp-server` — 8개 쿼리 도구
- `canvas-app/` — 무한 캔버스 + AI 브릿지 이미 작동
- `sandbox-manager` — Docker 기반 격리 실행
- `chrome-extension/` — 입력 UI 패턴 (intent/goal/criteria 참고)

---

## 4. 신규 작업 스코프

### 4.1 DS 추가 (Step 1)
**파일:** `design-system/src/patterns.json`

#### (a) `app-shell` 패턴 추가
- top bar + side nav + content 레이아웃 구조
- TVING Ad System nav 구조를 `preview_props` 로 인라인 포함
- `tweakable` 필드로 Tweak 차원 명시

#### (b) `list-page` 패턴에 `preview_props` + `tweakable` 추가
- `entity: "Creative"` 연결 (api-ui-contracts.json 참조)
- `tweakable: ["columns", "filters", "density", "emptyStateVariant"]`

#### (c) docs 재생성 + 스키마 업데이트
- `node generate.mjs`
- `schemas/patterns.schema.json` 업데이트

**완료 기준:** MCP 서버 `get_pattern("app-shell")` 호출 시 Moloco Ads 섹션이 추가된 nav 구조를 `preview_props` 에서 읽을 수 있어야 함.

---

### 4.2 Canvas ↔ Orchestrator 통합 (Step 2)

#### (a) Canvas에 "프로젝트 시작" 모달 신설
입력:
- Jira 티켓 URL (필수)
- PRD Google Docs URL (선택)
- 타겟 앱/URL (기본값: TVING Ad System 로컬)
- Intent (기본값: modify_page — pm-sa-request-schema 준수)

#### (b) 계획 단계 (조정: Canvas 자체 LLM 사용)
> **검증 결과:** orchestrator `/api/analyze-request`는 현재 스텁 (요청 내용 무시하고 캐너드 템플릿 반환). 파일럿에서는 Canvas가 직접 LLM을 호출해 계획 생성. 성공 후 로직을 orchestrator로 승격.

1. Canvas → `POST /api/prd/ingest` (PRD 있을 때만 — 이건 실제 작동)
2. Canvas → Claude/GPT API 직접 호출, 프롬프트에 다음 포함:
   - Jira 티켓 본문 + PRD 본문
   - `pm-sa-request-schema.json` 스키마 (구조화 요청 포맷)
   - `patterns.json` + `api-ui-contracts.json` (활용 가능 패턴·엔티티)
3. 응답: pm-sa-request-schema 준수 요청 + 변경 항목 체크리스트 + 관련 패턴 + 대상 파일
4. Canvas UI: 체크리스트 모달, PM이 항목 수정/스킵/추가

#### (c) 생성 단계
1. PM 컨펌 → Canvas → `POST /api/change-request`
2. Canvas SSE 구독 (`GET /api/events/:id`)
3. 완료 시: orchestrator 스크린샷 URL을 Canvas `ScreenshotNode` 로 렌더
4. Before/After 나란히 배치 (기존 AI 브릿지의 `nextTo` 파라미터 재사용)

#### (d) 결과 자동 배치
- Before 노드: 원본 캡처
- After 노드: 생성 결과
- 엣지: "AI Modified" 라벨

**완료 기준:** "Moloco Ads 섹션에 광고 소재 리뷰 메뉴 추가" 문장으로 생성 요청 → 30~60초 내 Before/After 화면이 캔버스에 자동 배치됨.

---

### 4.3 Tweak 옵션 (Step 3) — Claude Design 시스템 프롬프트 참고 반영

**핵심 원칙 (2026-04-20 업데이트):**
- **변형은 "별도 노드"가 아니라 "한 노드 + 사이클 토글"** — 단일 After 노드에 variants 배열을 붙이고 ◀ ▶ 로 순환. 별도 Before/After 노드 여러 개를 흩뿌리지 말 것 (PM이 비교 추적 어려움)
- **3개 이상 변형, "정석 + 창의" 믹스** — 변형1: DS 패턴 정석 / 변형2: 레이아웃 대안 / 변형3: 색다른 접근 (다른 정보 계층, 다른 플로우)
- **Tweak 패널은 "꺼져 있을 때 완전히 숨기기"** — 디자인이 최종처럼 보여야 함. 항상 떠 있는 floating panel 대신 토글 가능한 패널
- **Tweak 기본값은 파일 디스크에 영속화** — 페이지 새로고침 후에도 같은 상태. Claude Design의 `EDITMODE-BEGIN/END` JSON 마커 패턴 차용 가능
- **부모-자식 iframe postMessage 프로토콜** (After 노드가 iframe일 때):
  - 자식: listener 먼저 등록 → 부모에게 `__tweak_available` 보냄
  - 부모: `__activate_tweak` / `__deactivate_tweak` 보내 토글
  - 자식: 변경마다 `__tweak_set_keys`로 상태 통지 → 부모가 영속화


#### (a) After 노드에 "Tweak" 버튼
- 클릭 시 Tweak 패널 오픈
- 해당 패턴의 `tweakable` 필드 읽어 UI 자동 구성
  - `columns`: 체크박스 리스트 + 순서 변경
  - `filters`: 날짜/검색 on/off
  - `density`: slider (compact/comfortable/spacious)
  - `emptyStateVariant`: radio

#### (b) Tweak 적용
- 파라미터 변경 → `POST /api/change-request` (변형 프롬프트)
- 최대 3개 변형 동시 생성
- 캔버스에 3x1 그리드로 배치

#### (c) 변형 간 diff 하이라이트
- 세 개 After 중 서로 다른 영역을 시각적으로 표시
- PM이 원하는 하나 선택 → 나머지 삭제 + "메인 After" 승격

**완료 기준:** 하나의 변경 요청에 대해 3개의 의미 있는 베리에이션이 나란히 표시되고, PM이 한 클릭으로 선호 선택 가능.

---

### 4.4 엔드투엔드 파일럿 실행 (Step 4)

TVING Moloco Ads 프로젝트를 **처음부터** Canvas로 재현:

1. 실제 Jira 티켓 URL 입력
2. 실제 TVING Ad System 로컬 화면 import (Playwright 기존 파이프라인)
3. AI 계획 → PM 컨펌
4. Before/After 생성 → Tweak 3변형 → 하나 선택
5. 핀으로 요구사항 주석 (기존 Phase 2a 기능)
6. 화면 스크린샷 → Google Docs PRD에 복사
7. 캔버스 공유 링크를 PRD에 임베드
8. (선택) 승인 → orchestrator가 실제 msm-portal patch 생성

**기록:**
- 각 단계 소요 시간
- PM이 막힌 지점
- AI 결과 품질 체감
- 기존 워크플로우 대비 시간 절약 정도

---

## 5. 타임라인

| Step | 작업 | 예상 소요 | 담당 |
|---|---|---|---|
| 1 | DS 패턴 추가 (app-shell + preview_props) | 2~3일 | 사용자 정의 / Claude 구현 |
| 2 | Canvas ↔ Orchestrator 통합 | 4~5일 | Claude |
| 3 | Tweak 옵션 UI | 3일 | Claude |
| 4 | 엔드투엔드 파일럿 실행 + 기록 | 2일 | 같이 |
| **합계** | | **11~13일 (2~3주)** | |

---

## 6. 리스크 & 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| Orchestrator 생성 품질이 기대 이하 | 파일럿 실패 | 1일차에 간단한 요청으로 스모크 테스트 먼저 |
| Jira API 접근 권한 문제 | 입력측 막힘 | URL 파싱 실패 시 PM이 텍스트 수동 붙여넣기 fallback |
| DS 패턴이 실제 화면과 구조 안 맞음 | 생성물 부자연스러움 | 정확도 실망 시 보완 — 사용자가 동의한 접근 |
| Tweak이 "그냥 무작위 변형"이 돼서 의미 없음 | Tweak 가치 부족 | `tweakable` 필드의 차원을 실제 PM 결정 포인트로 한정 |
| 3~4개 신규 통합 포인트 (Canvas, orchestrator, MCP, DS) 동시 터짐 | 디버깅 지옥 | 단계별 스모크 테스트 강제, 다음 step 전 직전 step 통과 확인 |

---

## 7. Definition of Done (파일럿 성공 기준)

정성 기준 (3개 중 2개 이상 OK):
- [ ] PM이 디자이너 손 빌리지 않고 변경안을 팀에 시각적으로 공유 성공
- [ ] 리뷰 미팅에서 텍스트 PRD보다 Canvas 화면이 토론 중심이 됨
- [ ] 개발자가 캔버스 한 번 보고 "어디를 어떻게 바꿔야 하는지" 이해

정량 기준:
- [ ] Jira URL 입력 → 30~60초 내 초기 Before/After 배치
- [ ] 3개 Tweak 변형이 의미 있게 다름 (랜덤 노이즈 아님)
- [ ] 최소 1개의 실제 변경을 `POST /api/approve` 까지 태움

---

## 8. 리뷰 요청 포인트

이 계획에서 다음을 사용자가 확인해야 합니다:

1. **Step 순서** — DS 먼저 → 통합 → Tweak → 파일럿. 순서가 맞는가?
2. **Step 1 결과물 범위** — `app-shell` 1개 + `list-page` 확장만으로 충분한가? `nav-structure` 나 다른 패턴 더 필요한가?
3. **Step 2에서 orchestrator API 중 현재 동작 상태** — 실제로 `/api/analyze-request` 까지 구현돼 있는지, 아니면 일부는 스텁인지 사용자가 아는 바 있나요?
4. **Step 4 파일럿 실행자** — 제가 PM 역할로 시연? 아니면 실제 PM 한 분께 붙여서 관찰?
5. **Definition of Done** — 정성 기준 3개 중 2개 OK가 합리적인가? 더 엄격하게 원하나?

이 5가지에 답 주시면 이 계획을 확정하고 Step 1 착수하겠습니다.
