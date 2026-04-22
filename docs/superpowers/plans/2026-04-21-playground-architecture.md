# Playground Architecture — 단일 작업 공간으로의 수렴 (v1, SUPERSEDED)

**Status:** SUPERSEDED by `2026-04-21-playground-architecture-v2.md` (critic review after v1 draft revealed blockers; major architectural changes landed in v2).
**Keep this file for history only. Do not act on v1.**

**Status (v1 original):** Draft — awaiting review (2026-04-21)
**Author:** kyungjae.ha (with Claude)
**Supersedes (partially):** `2026-04-18-phase-3-canvas-ai-pilot.md`, `2026-04-20-phase-4a-project-layer-local.md` (데이터 모델 일부 계승)
**Migrates:** `canvas-app/` → `playground-app/`

---

## 1. Context & Problem

### 지금까지

지난 3주간 3개 독립 제품으로 분기해 가면서 "PM이 실제 제품을 바꿔보는 경험"을 각각 다른 방향에서 풀었다.

| 제품 | 커버 영역 | 현실 |
|---|---|---|
| Chrome Extension | 실앱에서 요소 선택 → 외과적 변경 | 동작. 단, "존재하지 않는 페이지·네비" 같은 **생성형** 작업엔 부적합 |
| Canvas (canvas-app) | 무한 캔버스 + AI 대화 + 3 variant 비교 | 스크린샷 기반의 한계 드러남. "변경이 보이는 페이지" 예측 불가, 토글·모드 학습곡선 과다 |
| Dashboard (Inspect Hub) | DS 문서·애널리틱스 | 요청 관리 UI 없음 |

### 오늘 발견한 본질

- **"작은 수정"은 Chrome Ext가 이미 잘 함.** 실앱·로그인·데이터가 바로 손에 잡힘.
- **"PRD·Jira 기반 큰 수정"**(새 페이지, nav 추가, 여러 파일 변경)은 Ext로 풀리지 않음.
- 두 종류 작업이 **같은 시작점**을 공유해야 함 — 다만 시작점이 "실앱 위 요소 클릭"일 필요는 없음.
- 작업은 **한 번에 끝나지 않음** — 계획 → 실행 → 피드백 → 재실행을 반복. 지금 1회성 요청 모델은 이 루틴과 맞지 않음.

### 사용자가 내린 선언

1. 작업의 단위를 **Playground**로 통일한다.
2. **한 공간에서** 에이전트와 핑퐁, 히스토리, 피드백을 모두 수용한다.
3. 제품 코드는 **PM이 명시적으로 "커밋하겠다"**고 결정할 때만 움직인다 (그 전엔 Playground 안에서만 일이 일어남).

이 문서는 그 선언을 실현하는 설계다.

---

## 2. Goal

> **Playground** = PM/SA가 에이전트와 함께 실제 제품 변경을 시도하고, 피드백을 반복하고, 기록을 남기고, 완성되면 커밋하는 **지속적 작업 공간**.

성공 기준:

- (a) PM이 Jira 티켓 링크 하나로 Playground를 만들고, 수 일에 걸쳐 에이전트와 핑퐁하며 "TVING Moloco Ads 섹션 추가"를 완성한 뒤 msm-portal PR까지 낼 수 있다.
- (b) PM이 Ext로 요소 선택한 요청도 같은 Playground에 쌓여서, 작업 히스토리가 선형적으로 남는다.
- (c) SA/PM이 같은 Playground URL로 접근해서 결과를 보고 댓글을 단다 (phase 2 이후, 사내 호스팅 올라간 뒤).

---

## 3. Core Decisions (2026-04-21 합의)

| # | 결정 |
|---|---|
| 1 | **작업 단위 = Playground**. Canvas·Ext·Dashboard의 "한 번의 변경 경험"이 모두 이 안에 수렴. |
| 2 | **샌드박스 수명 = Playground 수명**. 로컬은 active 시 상시 유지, idle 30분 후 hibernate. 사내 호스팅 올라간 뒤 풀링·복원 본격화. |
| 3 | **Variant 기본 OFF**. AI가 의도 모호 플래그 주거나 사용자가 명시 요청할 때만 활성화. 단일 시도 + 피드백 반복이 기본 플로우. |
| 4 | **Canvas 자산 흡수**: 핀 댓글만 가져옴. 무한 캔버스·DnD·공간 배치는 폐기. |
| 5 | **Chrome Ext는 입력기**로 좁힘. 독립 제품이 아니라 Playground에 변경 요청을 넣는 수단. 기존 UX는 유지. |
| 6 | **Dashboard 분리 유지**. Playground에서 아웃바운드 링크로만 연결. DS 문서·애널리틱스는 Dashboard의 책임. |
| 7 | **Playground 자체에 요소 선택기 내장**. Live iframe 안에서 Ext와 동일한 수준의 컨텍스트 수집. |

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      playground-app (신규)                  │
│                                                             │
│  /playgrounds                   /p/:id                      │
│  ─ 목록                         ─ 대화 패널 (좌)            │
│  ─ 상태·검색                    ─ 라이브 iframe (중·우)     │
│  ─ 신규 생성 (PRD/Jira/빈칸)    ─ 요소 선택기 (iframe 내)  │
│                                 ─ 히스토리 타임라인         │
│                                 ─ 핀 댓글                    │
│                                 ─ 커밋/PR 버튼              │
│                                 ─ Dashboard/DS 링크         │
└────────────────────────────┬────────────────────────────────┘
                             │
                             │ /api/playground/*
                             │ /api/change-request (playgroundId 첨부)
                             │ /api/events/:id (SSE)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│             orchestrator/server.js (확장)                   │
│                                                             │
│  ─ Playground 수명 관리 (create/resume/hibernate/archive)   │
│  ─ 샌드박스 재사용 (per-request → per-playground)            │
│  ─ 기존 /api/chat, /api/change-request, /api/events 재활용  │
│  ─ Playground 단위 state 영속화 (JSON on disk)              │
└────────────┬────────────────────────────────────────────────┘
             │ docker + per-playground git branch
             ▼
┌────────────────────────────────────────────────────────────┐
│            moloco-inspect-sandbox:latest (변경 없음)        │
│  ─ 컨테이너 내부: OpenCode + msm-portal workspace          │
│  ─ playground-<id> 브랜치에 변경 누적                        │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│         chrome-extension (유지, 역할 재정의)                │
│                                                             │
│  ─ 실앱에서 요소 선택 (기존 UX)                              │
│  ─ 사이드패널에서 "어느 Playground로 보낼지" 선택            │
│  ─ /api/change-request 에 playgroundId + elementContext 첨부│
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│         dashboard/ (분리 유지)                              │
│  ─ DS 문서, 애널리틱스, 운영 메트릭                          │
│  ─ Playground 에서 링크로만 진입                             │
└────────────────────────────────────────────────────────────┘
```

---

## 5. Data Model

### 5.1 Types (client + orchestrator 공통)

```ts
interface Project {
  id: string;                          // v4a에서 이미 존재
  title: string;
  jiraUrl?: string;                    // 프로젝트 레벨 메타
  prdUrl?: string;
  createdAt: number;
  updatedAt: number;
  ownerEmail?: string;                 // 사내 호스팅 후
}

interface Playground {
  id: string;
  projectId: string;                   // 1 project → N playgrounds
  title: string;
  status: 'active' | 'idle' | 'archived';

  // 샌드박스 연결
  sandboxId?: string;                  // docker container id; idle/archived 시 null
  openCodePort?: number;
  vitePort?: number;
  baseBranch: string;                  // 보통 'main'
  workBranch: string;                  // 'playground-<id>'
  hibernatedAt?: number;

  // 메타
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number;
}

interface Message {                    // 대화 로그 (Wizard ChatMessage 계승)
  id: string;
  playgroundId: string;
  role: 'user' | 'assistant';
  content: string;
  plan?: PlanMeta & { items: PlanItem[] };
  planResolved?: 'accepted' | 'rejected';
  execution?: ExecutionState;          // 현재 wizard-store의 타입 재사용
  elementContext?: ElementContext;     // Ext 혹은 내장 picker가 붙인 컨텍스트
  timestamp: number;
}

interface ElementContext {             // Ext와 Playground 공통
  selector: string;                    // CSS selector
  tagName: string;
  componentName?: string;              // react devtools fiber detect
  testId?: string;
  sourceFile?: string;                 // Vite source map
  sourceLine?: number;
  boundingRect: { x; y; w; h };
  screenshotDataUrl?: string;          // 요소 주변 잘라낸 이미지
  url: string;                         // 현재 페이지 URL
}

interface ChangeRecord {               // 히스토리 아이템 (각 change-request 대응)
  id: string;                          // change-request id 그대로
  playgroundId: string;
  messageId: string;                   // 어느 메시지에서 트리거됐는지
  status: 'processing' | 'preview' | 'applied' | 'reverted' | 'error';
  commitSha?: string;                  // 샌드박스 브랜치 내 커밋
  diff?: string;
  changedFiles: string[];
  screenshotUrl?: string;
  livePreviewUrl?: string;
  variantId?: 'v1' | 'v2' | 'v3';      // variant 모드일 때만
  createdAt: number;
}

interface PinComment {                 // canvas feedback-store에서 이관
  id: string;
  playgroundId: string;
  target: PinTarget;
  text: string;
  author: string;
  status: 'open' | 'resolved';
  replies: PinReply[];
  createdAt: number;
}

type PinTarget =
  | { kind: 'iframe'; url: string; xRatio: number; yRatio: number }
  | { kind: 'changeRecord'; changeRecordId: string; xRatio: number; yRatio: number }
  | { kind: 'element'; selector: string; url: string };
```

### 5.2 Persistence

**Phase 1 (로컬)**: 기존 async storage 확장.

```
localStorage:
  moloco-canvas:v2:projects                → Project[]
  moloco-canvas:v2:project:<id>:playgrounds → Playground[]
  moloco-canvas:v2:playground:<id>:messages → Message[]
  moloco-canvas:v2:playground:<id>:changes  → ChangeRecord[]
  moloco-canvas:v2:playground:<id>:pins     → PinComment[]

orchestrator/state/:
  playground/<playgroundId>.json           → 서버측 playground 상태 (샌드박스 정보 포함)
  <changeRequestId>.json                   → 기존 그대로 (per-change 상태)
```

**Phase 3 (사내 호스팅)**: Supabase 등으로 이관. 여기선 로컬만 다룸.

### 5.3 From v4a로부터의 계승·변경

- `Canvas` → `Playground`로 **이름·의미 변경** (node 리스트 대신 sandbox + 대화 + 히스토리)
- 기존 `canvas-store.ts`는 폐기 (무한 캔버스 로직 사라짐)
- `project-store.ts`는 유지·확장 (playground 관리 추가)
- `wizard-store.ts`는 `playground-store.ts`로 이관·통합
- `feedback-store.ts`의 Comment 타입은 PinComment로 개명하고 `playgroundId` 기반 인덱싱

---

## 6. API Surface

### 6.1 신규 엔드포인트 (orchestrator)

| Method | Path | 역할 |
|---|---|---|
| POST | `/api/playground` | 새 Playground 생성 (샌드박스 부팅). body: `{ projectId, title, baseBranch?, initialPrompt?, prdUrl?, jiraUrl? }` |
| GET | `/api/playground/:id` | 상태 조회 |
| POST | `/api/playground/:id/resume` | hibernated → active 복원 |
| POST | `/api/playground/:id/hibernate` | 능동 hibernate (idle 타이머 수동 트리거) |
| POST | `/api/playground/:id/archive` | 영구 종료 (컨테이너 제거, 브랜치 보관) |
| POST | `/api/playground/:id/message` | 에이전트 핑퐁 (= 기존 `/api/chat` + playground 컨텍스트) |
| GET | `/api/playground/:id/events` | SSE: 대화/실행 이벤트 스트림 |
| POST | `/api/playground/:id/promote` | 작업 브랜치를 msm-portal PR로 승격 |
| POST | `/api/playground/:id/revert/:changeRecordId` | 특정 변경 되돌리기 |

### 6.2 기존 엔드포인트 수정

| Endpoint | 변경 |
|---|---|
| `/api/change-request` | 요청 body에 `playgroundId` 필수화. 새 샌드박스 안 만들고 기존 playground 샌드박스 사용 |
| `/api/events/:id` | 그대로 — playground 단위 SSE와는 별개 |
| `/api/chat` | 일정 기간 유지 (canvas-app 과도기). Playground 쪽 `/api/playground/:id/message`로 대체 후 deprecated |

### 6.3 Chrome Ext 변경

- 사이드패널에 **Playground 선택기** 추가:
  - "최근 Playground" 드롭다운 + "새 Playground 만들기" 옵션
  - 기본 URL: `localhost:4180/playgrounds` (에서 선택한 값을 chrome.storage.local에 기억)
- 요청 보낼 때 `{ playgroundId, elementContext, prompt }` 포맷으로 기존 `/api/change-request` 호출

---

## 7. Playground UI

### 7.1 목록 (`/playgrounds`)

```
Projects                                     [+ 새 Project]
 ─ TVING Moloco Ads 추가 (3 playgrounds)
     ├ [active]  nav 섹션 추가 실험    2h ago      ▶ 열기
     ├ [idle]    creative review 아이콘 작업  1d ago  ▶ 재개
     └ [archived] 반려된 시도           3d ago      —

 ─ shortmax 리포트 개선 (1 playground)
     └ [active]  ...
```

### 7.2 상세 (`/p/:id`)

```
┌──────────────────────────────────────────────────────────────┐
│ ⬅ TVING Moloco Ads 추가 / nav 섹션 추가 실험                  │
│   [active]  sandbox running on :57165   [🚀 커밋하기]         │
│   🔗 Jira  🔗 PRD  🔗 DS 문서  🔗 Dashboard                  │
├──────────────┬───────────────────────────────────────────────┤
│              │                                                │
│  대화        │           Live Preview (iframe)               │
│              │                                                │
│ [user] Moloco│  ┌─────────────────────────────────────┐      │
│ Ads 섹션 추가│  │ TVING 앱 (실제 로그인된 뷰)         │      │
│              │  │ [🖱 선택] 모드에서 요소 클릭 가능   │      │
│ [ai] 계획…   │  │                                     │      │
│   [실행] →   │  └─────────────────────────────────────┘      │
│              │                                                │
│ [ai] ✓ 완료  │  ┌ 변경 파일 (2) ─────────────────────┐      │
│ +2 files     │  │ MCOmsMainNavbarContainer.tsx       │      │
│              │  │ tving-ko.json                      │      │
│ [user] 조금  │  └─ diff 보기 → ─────────────────────┘       │
│ 다르게…      │                                                │
│              │  [🔒 View Only | 🖱 Pick | 📍 Comment]       │
├──────────────┴───────────────────────────────────────────────┤
│  타임라인 (접힘): #1 created → #2 v1 applied → #3 v1 revert  │
└──────────────────────────────────────────────────────────────┘
```

**주요 요소:**

- **좌 패널 (320-400px)**: 대화 로그. 각 메시지 아래 계획 카드·실행 카드 그대로. 입력창에 `@` 로 최근 changeRecord 참조 가능 (향후).
- **우 패널 (flex 1)**: Live iframe 중심. 하단에 변경 파일 목록·diff 링크. 모드 전환:
  - **View Only (기본)** — iframe `pointerEvents: none`. 캔버스/페이지 드래그·스크롤 방해 없음.
  - **Pick** — 요소 선택 모드. Ext의 content-script와 동일한 overlay 주입. 클릭하면 `elementContext`가 다음 메시지에 첨부됨.
  - **Comment** — iframe 클릭 위치에 PinComment 추가.
- **상단**: Playground 메타 + 외부 링크 + 최종 커밋 버튼.
- **타임라인 (접을 수 있음)**: ChangeRecord 연대순 나열. 각 아이템에 "이 시점으로 되돌리기" 액션.

### 7.3 Variant 활성화 UX

기본 플로우는 V1만 실행. 두 경로로 variant 모드 진입:

1. **AI 주도**: 계획 응답에 `ambiguous_intent: true` 있으면 UI에 "어느 방향이 맞을까요? 2~3가지로 시도해볼까요?" 배지 표시. 클릭하면 variant 모드.
2. **사용자 주도**: 입력창 옆 `+ variant` 토글. 토글 ON 상태에서 실행하면 V1 + V2/V3 병렬 실행.

Variant 모드일 땐 우 패널이 **3-up 그리드**로 바뀌고 각각의 Live iframe + 체크박스 ("이걸로 정하기"). 나머지는 자동 리버트.

---

## 8. Migration Plan

### 8.1 canvas-app → playground-app

**디렉토리 이름 바꾸기** — `canvas-app/` → `playground-app/`.

**유지할 파일:**

```
src/
  shared-ui/                 (그대로)
  services/
    orchestrator-client.ts   (playground 엔드포인트 추가)
    project-storage.ts       (async storage 재사용)
    migrate-v1-to-v2.ts      (유지)
  store/
    project-store.ts         (확장)
    feedback-store.ts        (PinComment로 리팩터)
  editor/
    AIPanel.tsx              (Playground 좌 패널로 이동·개명)
    ChatBubble etc.          (shared-ui에서)
  pages/
    PlaygroundList.tsx       (신규 — 기존 ProjectHome 확장)
    PlaygroundDetail.tsx     (신규 — 2-pane 레이아웃)
  types/
    project.ts               (Playground, Message, ChangeRecord, PinComment 추가)
```

**폐기할 파일:**

```
src/
  canvas/
    CanvasView.tsx           (React Flow 전체)
    nodes/IframeNode.tsx     (Live Preview 컴포넌트로 축소 이관)
    nodes/ScreenshotNode.tsx (Live Preview 컴포넌트로 축소 이관)
    ...모든 무한캔버스 의존 파일
  store/
    canvas-store.ts          (폐기)
    wizard-store.ts          (playground-store로 통합)
  editor/CanvasBreadcrumb.tsx (PlaygroundHeader로 교체)
package.json:
  @xyflow/react              (의존성 제거)
  zundo                      (되돌리기 범위 축소로 제거 여부 재검토)
```

**이관 로직:**

- **핀 댓글**: `feedback-store.ts`의 Comment → PinComment. 스키마 거의 동일. `screenId: string` → `target.changeRecordId` 로만 치환.
- **라이브 iframe 토글**: ScreenshotNode의 `viewMode` + `interactable` 로직을 `<LivePreview>` 컴포넌트로 추출.
- **AIPanel**: 거의 그대로. `executePlan`만 playground 컨텍스트 인식하도록 수정.

### 8.2 orchestrator 확장

**server.js 모듈화** (선택적):

지금 2500+ 줄 단일 파일. Playground 로직 추가하면 3500+ 줄. 이번 기회에:

```
orchestrator/
  server.js            (라우팅만)
  lib/
    playground.js      (수명 관리)
    change-request.js  (기존 pipeline)
    chat.js            (대화 LLM 호출)
    variations.js      (variant 생성)
    sandbox.js         (sandbox-manager 래퍼)
    state.js           (영속화)
```

규모가 커지니 단일 파일이 부담. 단 **이번 마일스톤의 일부는 아님** — 필요 시 별도 태스크.

### 8.3 Chrome Ext 변경 범위

- `sidepanel.html`: 상단에 Playground 선택기 영역 추가
- `sidepanel.js`: `chrome.storage.local`에 `selectedPlaygroundId` 보관, `/api/change-request` 호출 시 첨부
- `background.js`: 변경 없음
- `content-script.js`: 변경 없음 (실앱 내 요소 선택 로직 그대로)
- 신규: Ext가 orchestrator에 "현재 Playground 목록 달라"고 물어봐서 드롭다운 채움

---

## 9. Milestones

**편의 상 작업일 기준. 리뷰·대기 시간 제외.**

### M1 — Orchestrator Playground 수명 (1~2일)

- `Playground` 모델 + 영속화 (`orchestrator/state/playground/*.json`)
- `POST /api/playground` (docker run, git branch init)
- `POST /api/playground/:id/resume`, `/hibernate`, `/archive`
- `/api/change-request` 에 `playgroundId` 필수화
- 샌드박스 재사용 로직: 기존 sandbox-manager에 "기존 container 재사용 or 새로 만들기" 분기

**완료 기준:** curl 로 playground 만들고 여러 번 change-request 쏴도 같은 샌드박스·같은 브랜치에 누적됨.

### M2 — playground-app 리팩터 (2~3일)

- `canvas-app/` → `playground-app/` 디렉토리 이름 변경
- React Flow 완전 제거, 2-pane 레이아웃 도입
- `PlaygroundList`, `PlaygroundDetail` 페이지
- `AIPanel`을 좌 패널 고정, Live iframe이 우 패널
- 핀 댓글 로직 이관 (PinTarget.kind='changeRecord' 먼저 지원, 'iframe' 은 M3)

**완료 기준:** 브라우저에서 Playground 생성 → 에이전트 대화 → 변경 여러 번 → 각 변경의 preview 확인 → revert 가능.

### M3 — Live iframe 안 요소 선택기 (2일)

- `shared-ui/element-picker/` 공용 모듈
  - overlay 컴포넌트
  - fiber detection (React component name)
  - source file / testId 추출
- Playground Live iframe에 주입 (same-origin 제약 처리: dev 환경은 `http://127.0.0.1:<vitePort>` 로 주입 가능)
- Ext에서 같은 모듈 import하도록 리팩터

**완료 기준:** Playground Live iframe에서 요소 선택 → 다음 메시지에 컨텍스트 첨부 → 에이전트가 그 요소 정확히 바꿈.

### M4 — Chrome Ext ↔ Playground 통합 (1~2일)

- Ext 사이드패널에 Playground 선택기
- Ext 요청이 Playground 히스토리에 남음
- "Playground 열기" 딥링크

**완료 기준:** Ext로 요소 선택 → Playground에 기록됨. Playground 상세 열면 Ext 요청이 대화 타임라인에 나타남.

### M5 — 커밋 게이트 (1~2일)

- `POST /api/playground/:id/promote` 구현
- Playground 브랜치 → msm-portal 진짜 PR
- 커밋 UI: "변경 N개 중 선택", "PR 제목/본문 에이전트가 초안 작성"

**완료 기준:** Playground에서 [커밋하기] 누르면 msm-portal GitHub에 실제 PR 생성.

### M6 (Phase 3) — Variant 조건부 활성화 (1일)

- 기존 3-variant 로직을 "variant 모드" 뒤에 캡슐화
- Plan 스키마에 `ambiguous_intent` 필드
- UI: "여러 방향으로 시도" 배지 + `+variant` 토글

**완료 기준:** 모호한 요청에서 AI가 배지 제안. 사용자가 토글 켜고 실행하면 V2/V3 함께 실행.

### M7 (Phase 3+) — Hibernate/복원 정교화 (별도)

- idle 타이머 + 자동 hibernate
- 복원 시 git state 복구
- 다수 Playground 동시 관리 시 리소스 정책

**전체 MVP (M1~M5)**: 약 8~11일. 하루 풀 작업 기준.

---

## 10. Risks & Open Questions

### 10.1 Risks

| # | Risk | 완화 |
|---|---|---|
| R1 | 로컬 Docker 샌드박스 N개 상시 유지 시 M1 Mac 리소스 부족 | idle 타이머로 조기 hibernate. MVP는 "동시 3개" 가정 |
| R2 | Playground 브랜치가 main과 오래 떨어지면 rebase 지옥 | M5에서 "promote 직전 main rebase" 자동화. conflict 시 에이전트에게 해결 요청 |
| R3 | 같은 playground에 여러 변경 누적 → 나중에 돌리기 복잡 | ChangeRecord = 커밋 하나 정책. revert = `git revert <sha>` 단순 구현 |
| R4 | Live iframe 요소 선택기가 iframe cross-origin 벽에 막힘 | dev 환경 한정 — sandbox Vite는 `127.0.0.1`로 동일 브라우저 안 same-origin. production에선 postMessage RPC 필요 (별도 과제) |
| R5 | 기존 canvas-app 코드를 쓰고 있는 사용자 (=본인)가 M2 이행 중 작업 중단 | `canvas-app/` 유지하면서 `playground-app/` 를 별개 경로로 먼저 올린 후 canvas-app 폐기 |
| R6 | Ext의 기존 Native messaging 모드는 어떻게? | MVP는 HTTP 모드만 지원. Native는 유지되나 Playground 연결 안 됨 (별도 과제) |
| R7 | 3-variant 로직을 지금 막 완성했는데 조건부로 숨김 | 지금 코드 보존 (Variant 모드). 퇴보 아님 |

### 10.2 Open Questions

질문이 답보다 많은 영역:

1. **Playground 소유권** — 로컬은 "내 파일". 사내 호스팅 올라가면 "내 Playground vs 팀 Playground" 구분? auth scope?
2. **같은 Project 아래 여러 Playground 병행 시 브랜치 이름 충돌 방지** — `playground-<uuid>` 로 guaranteed unique, 단 짧은 별칭도 필요.
3. **에이전트가 playground 안에서 파일 **생성**만 하고 실행·검증 안 하는 케이스** — 지금 orchestrator는 preview까지 자동. 생성된 페이지 라우트가 없으면 preview URL이 404. 신규 페이지 플로우에서 UX 이슈.
4. **Dashboard와의 경계** — Playground 안에서 "이 DS 패턴이 뭐야?" 물어보면 Dashboard로 이동? 아니면 Playground 안에서 인라인으로 DS 카드 렌더? (MVP: 아웃바운드 링크만)
5. **PinComment의 target='element'** — Live iframe 안 요소 좌표 변동 대응. iframe 리로드되면 selector matching 실패 가능. "anchor drift" 문제.
6. **Chrome Ext가 실앱(회사 내부 URL)에서 작동할 때 요청을 playground에 보내려면, playground 샌드박스와 실앱이 격리돼 있음** — Ext가 찍은 요소 컨텍스트를 샌드박스에서 재현할 수 있나? 테스트 필요.
7. **"대화" vs "개별 change-request"의 관계** — 한 메시지에 여러 change-request가 생성될 수도 있음 (variant 모드). UI 상 대응.

---

## 11. Out of Scope (지금은 안 함)

- Supabase auth·공유·RLS
- 팀 공유 Playground
- Webhook/Slack 알림
- Ext native messaging 모드와의 Playground 연계
- 상용 제품 URL (TVING 사내 주소)에서 Ext 동작 보장
- 생성형 작업 중 자동 라우트 등록 보조 (M3 이후)
- Playground 간 diff 비교 (향후 reward)
- orchestrator server.js 모듈화 (선택, 별 과제)
- AI로 "커밋 메시지·PR 제목" 자동 작성의 세련화 (M5에선 최소 구현)

---

## 12. Success Metrics

MVP (M1~M5) 완료 후 측정:

- [ ] 본인 (kyungjae.ha)이 "TVING Moloco Ads 섹션 추가" 케이스를 **Playground 하나에서** 시작→PR까지 완주
- [ ] Chrome Ext로 요소 선택한 요청이 Playground 히스토리에 기록됨
- [ ] 한 Playground 내에서 5번 이상 에이전트와 핑퐁해도 상태·대화 유지
- [ ] Playground 브랜치 → 실제 msm-portal PR 생성 1회 이상
- [ ] Canvas 기반 테스트 케이스들을 Playground에서 재현, **기존과 동등하거나 더 쉬움** 주관 평가

---

## 13. Review Points

이 문서를 같이 읽으면서 특히 확인해야 할 것:

1. **4번 Architecture Overview의 플로우** — Ext가 Playground에 변경을 "덧붙이는" 구조가 실제 PM의 멘탈 모델과 맞나? (Ext 쓰는 동안 어떤 Playground에 넣을지 계속 의식해야 하는 부담)
2. **5번 Data Model** — Playground=샌드박스 1:1 고정이 맞나? 한 Playground가 여러 샌드박스(실험용)를 거느리는 편이 유연하진 않나?
3. **7번 UI** — 3-pane(대화/iframe/히스토리)이 화면에 한꺼번에 꽉 차서 복잡해질 위험. 타임라인을 별 탭으로 분리할지?
4. **8번 Migration** — `canvas-app/` 이름 바꾸는 순간 기존 localStorage 키 연속성. migrate-v2-to-v3 필요한가?
5. **9번 Milestones** — M1 완료 기준이 curl 테스트인데 M2 전에 실제 UI 없이 확신할 수 있나? M1에 아주 최소한의 UI 포함?
6. **10.1 R4 (cross-origin)** — 요소 선택기를 iframe 안에서 돌릴 때의 제약. dev 환경에서 same-origin 확인 필요.
7. **10.2 Q3 (신규 페이지 라우트 없음)** — 생성형 작업의 핵심 약점. 어떻게 풀 것인가?
8. **우선순위** — M1~M5 순서가 맞나? 혹시 M3 (요소 선택기)을 앞당기면 M2 UI 검증이 편해지는가?

---

## 14. 다음 스텝

이 문서를 리뷰 후:

- 미해결 질문 중 **차단적인 것 2~3개**만 먼저 결정
- 나머지는 M1 착수하면서 열어두기
- 결정 사항 반영한 v2 문서로 업데이트 → M1 실행

리뷰 후 수정할 구체 부분을 이 문서 내에 **diff annotation**으로 반영하고 다시 승인.
