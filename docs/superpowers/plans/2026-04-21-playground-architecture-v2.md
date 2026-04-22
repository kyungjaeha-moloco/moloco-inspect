# Playground Architecture v2 — Iframe-Live 통합

**Status:** SUPERSEDED by `2026-04-22-playground-architecture-v3.md` (2026-04-22). Read v2 as the base contract; v3 overrides the specific sections it names. Do not act on v2 in isolation.

**Status (v2 original):** Draft v2 — awaiting review (2026-04-21)
**Author:** kyungjae.ha (with Claude)
**Supersedes:** `2026-04-21-playground-architecture.md` (v1, after critic review)
**Previous partials:** `2026-04-18-phase-3-canvas-ai-pilot.md`, `2026-04-20-phase-4a-project-layer-local.md`
**Migrates:** `canvas-app/` → `playground-app/`

---

## 0. v2 무엇이 바뀌었나 (vs v1)

v1을 Critic 리뷰한 결과 2개 블로커 + 5개 메이저가 나왔다. 사용자 결정을 거쳐 다음과 같이 재설계.

| # | v1 | v2 |
|---|---|---|
| B1 Cross-origin iframe | "dev 환경 same-origin 가정" (틀림) | **(a) Vite 플러그인 + postMessage RPC** 확정. Playground app(`:4180`)과 샌드박스(`:<vitePort>`)는 다른 origin. picker는 샌드박스 내부에서 동작 |
| B2 샌드박스 수명 | M1 1~2일에 pipeline 리팩터 포함 | M1을 **M1a(CRUD + state)** / **M1b(pipeline 역전)**로 분할 |
| 스크린샷 파이프라인 | Playwright + PNG 캡처 유지 | **전면 제거** — iframe에 Vite dev server 직접 렌더. HMR이 실시간 반영. Q3 (새 페이지 404) 문제 소멸 |
| Variant 모드 | MVP에 포함 (M6) | **feature-flag off**, 관련 코드 유지, MVP 제외 |
| Q3 새 페이지 라우트 | MVP 필수 해결 필요 | iframe-live로 소멸 — PM이 nav 눌러 이동하면 됨 |
| 정적 스크린샷 공유 | 필수 기능 | **OS 스크린샷으로 대체**. 필요 시 향후 "이 시점으로 돌아가기" 버튼으로 과거 상태 복원 → 직접 찍기 |
| ChangeRecord 상태 | `processing → preview → applied` | `processing → applied / reverted / error`. "preview" 단계 소멸 |
| Mutex/큐 | 언급 없음 | **M1b에 per-playground 요청 큐 필수** |
| migrate-v2-v3 | 한 줄 언급 | M2에 **명시적 태스크**, 규칙 정의 |
| 예산 | 8~11일 (우물) | 12~14일 (현실). 스크린샷 제거로 v1 수정본(15~17일)보다 줄어듦 |

---

## 1. Context & Goal (v1 유지)

### 왜 Playground인가

지난 3주간 3개 독립 제품으로 분기됨:
- **Chrome Extension** — 작은 수정 강함, "존재하지 않는 것" 못 만듦
- **Canvas (canvas-app)** — 무한 캔버스가 실제 작업 루틴과 어긋남 (오늘 드러남)
- **Dashboard (Inspect Hub)** — DS 문서·애널리틱스 참조 사이트

오늘 발견:
1. "작은 수정"은 Chrome Ext가 이미 잘 함
2. "PRD/Jira 기반 큰 수정"은 Ext로 풀리지 않음
3. 두 종류 모두 **지속적 작업 공간**이 있어야 PM 실제 루틴과 맞음
4. 작업은 **계획 → 실행 → 피드백 → 재실행**의 반복. 1회성 요청은 부적합

### Goal

> **Playground** = PM/SA가 에이전트와 함께 제품 변경을 시도하고, 피드백을 반복하고, 기록을 남기고, 완성되면 커밋하는 **지속적 작업 공간**.

성공 기준:
- (a) PM이 Jira URL 하나로 Playground 시작 → 수 일간 에이전트와 핑퐁 → msm-portal PR까지
- (b) Chrome Ext 요청도 같은 Playground에 쌓여 작업 히스토리가 선형
- (c) 사내 호스팅 올라간 뒤 SA/PM이 같은 URL로 협업 (Phase 2+)

---

## 2. Core Decisions (2026-04-21 합의)

| # | 결정 | 근거 |
|---|---|---|
| 1 | **작업 단위 = Playground** | Canvas/Ext/Dashboard를 한 관점으로 수렴 |
| 2 | **샌드박스 수명 = Playground 수명**. MVP 로컬은 active 유지, idle 30분 후 `docker stop`(hibernate). Archive 시 `docker rm`+ 브랜치 bare repo 백업 | 연속된 작업 지원 |
| 3 | **Iframe-Live만 사용** (v2 신규). 샌드박스의 Vite dev server를 playground-app 안 iframe에 직접 로드. 스크린샷 파이프라인 전면 제거 | HMR로 실시간 반영, Q3 문제 소멸, 인프라 경량화 |
| 4 | **PR 커밋은 명시적**. 작업은 샌드박스 브랜치에만 누적, PM이 "커밋하기" 누를 때만 msm-portal로 promote | 실수로 prod 오염 방지 |
| 5 | **Variant 기본 OFF, feature-flag 뒤**. AI 자동 3-way variant는 MVP 제거. 필요 시 Phase 2+에서 재활성 | 복잡도·dead-code 축소 |
| 6 | **Canvas 자산 흡수**: 핀 댓글만. 무한 캔버스·DnD·공간 배치는 폐기 | 유저피드백 기반 |
| 7 | **Chrome Ext은 입력기**로 축소 — 독립 제품 아닌 Playground에 변경 요청 넣는 수단 | 책임 분리 |
| 8 | **Dashboard 분리 유지** — Playground에서 아웃바운드 링크로만 | DS 문서는 DS 팀 영역 |
| 9 | **Playground 내 요소 선택기** — Vite 플러그인 + postMessage RPC. Chrome Ext와 같은 context 수집 | B1 해결 |
| 10 | **"이 시점으로 돌아가기"** — 타임라인 항목별 `git checkout <sha>` 지원 (Phase 2에서 fine-tune) | 정적 스크린샷 대체 |

---

## 3. Architecture

### 3.1 Origin · 포트 지도 (B1 해결안 반영)

```
Browser
├─ localhost:4180  → playground-app (React, 부모 창)
│                    └─ <iframe src="http://localhost:<vitePort>/">
│                           ↑
│                    postMessage RPC (picker events, navigation sync)
│                           ↓
└─ localhost:<vitePort>  → 샌드박스 Vite dev server (iframe 내부 context)
                           ├─ Vite 플러그인: picker script 자동 주입
                           ├─ React fiber walker (원점 내부에서 동작)
                           └─ HMR WebSocket (같은 origin)
```

**Key point**: 부모 창은 iframe 내부 DOM에 접근할 수 없다 (cross-origin). Picker는 iframe 내부에서 실행되며, 선택 결과를 `window.postMessage(..., "http://localhost:4180")`로 부모에게 보낸다. 부모는 origin 화이트리스트로 검증 후 수신.

### 3.2 Component Map

```
┌─────────────────────────────────────────────────────────────┐
│                      playground-app (신규)                  │
│                                                             │
│  /playgrounds                   /p/:id                      │
│  ─ 목록                         ─ 대화 패널 (좌 320px)      │
│  ─ 상태·검색                    ─ 라이브 iframe (중·우 flex)│
│  ─ 신규 생성                    ─ 타임라인 (하단 접힘)      │
│    (PRD/Jira/빈칸)             ─ 핀 댓글                    │
│                                 ─ 커밋/PR 버튼              │
│                                 ─ Dashboard/DS 아웃링크    │
└─────────────┬───────────────────────────────────────────────┘
              │ /api/playground/* , /api/change-request (w/ playgroundId)
              ▼
┌─────────────────────────────────────────────────────────────┐
│             orchestrator/server.js (확장)                   │
│                                                             │
│  ─ Playground CRUD (`/api/playground`, `/resume`, …)        │
│  ─ 샌드박스 재사용 (per-request → per-playground)            │
│  ─ Per-playground 요청 큐 (동시성 보호)                      │
│  ─ State 영속화 (state/playground/<id>.json)                │
│  ─ Git branch bare repo (state/branches/<id>.git)            │
│  ─ 기존 /api/chat, /api/change-request 재활용 (수정)         │
│  ─ ❌ 스크린샷 파이프라인 제거 (Playwright, PNG 서빙)         │
└────────────┬────────────────────────────────────────────────┘
             │ docker + per-playground git branch
             ▼
┌────────────────────────────────────────────────────────────┐
│            moloco-inspect-sandbox:latest (경량화)           │
│  ─ OpenCode + msm-portal workspace                          │
│  ─ playground-<id> 브랜치에 변경 누적                        │
│  ─ Vite dev server (HMR 상시)                                │
│  ─ Vite 플러그인: picker-injector                            │
│  ─ ❌ Playwright/Chromium 제거                                │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│         chrome-extension (유지)                             │
│  ─ 실앱에서 요소 선택 (기존 content-script)                  │
│  ─ 사이드패널: Playground 선택기                             │
│  ─ /api/change-request + playgroundId + elementContext      │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│         dashboard/ (분리)                                   │
│  ─ DS 문서, 애널리틱스 (변경 없음)                           │
└────────────────────────────────────────────────────────────┘
```

---

## 4. Data Model

### 4.1 Types

```ts
interface Project {
  id: string;
  title: string;
  jiraUrl?: string;
  prdUrl?: string;
  createdAt: number;
  updatedAt: number;
  ownerEmail?: string;
}

interface Playground {
  id: string;                          // uuid
  projectId: string;
  title: string;
  status: 'active' | 'hibernated' | 'archived';

  // 샌드박스 연결 (active/hibernated 시 보존)
  sandboxContainerName: string;        // `playground-${id}`
  vitePort?: number;                   // active 시만
  opencodePort?: number;
  baseBranch: string;                  // 'main'
  workBranch: string;                  // `playground-${id}`

  // Archive 시 host bare repo 경로
  archivedBranchPath?: string;         // state/branches/<id>.git

  hibernatedAt?: number;
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number;
}

interface Message {
  id: string;
  playgroundId: string;
  role: 'user' | 'assistant';
  content: string;
  plan?: PlanMeta & { items: PlanItem[] };
  planResolved?: 'accepted' | 'rejected';
  /**
   * v2: 단수 유지 (variant가 MVP 제외되므로).
   * variant 재활성화 시 executions[]로 확장.
   */
  execution?: ExecutionState;
  elementContext?: ElementContext;
  timestamp: number;
}

interface ElementContext {              // Ext와 Playground picker 공통
  selector: string;
  tagName: string;
  componentName?: string;
  testId?: string;
  sourceFile?: string;
  sourceLine?: number;
  boundingRect: { x: number; y: number; w: number; h: number };
  screenshotDataUrl?: string;           // 요소 주변 잘라낸 썸네일 (OS 스크린샷과는 별개)
  url: string;
}

interface ChangeRecord {
  id: string;                           // change-request id
  playgroundId: string;
  messageId: string;
  status: 'processing' | 'applied' | 'reverted' | 'error';
  commitSha?: string;                   // 샌드박스 브랜치 내 커밋
  diff?: string;
  changedFiles: string[];
  /**
   * v2: 스크린샷 필드 완전 제거.
   * 과거 상태 확인은 `git checkout <commitSha>`로 iframe이 반영.
   */
  createdAt: number;
}

interface PinComment {
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
  | { kind: 'iframe'; url: string; selector: string; xRatio?: number; yRatio?: number }
  | { kind: 'changeRecord'; changeRecordId: string; note: string };
```

### 4.2 Persistence

**로컬 MVP**:

```
localStorage (playground-app):
  moloco-playground:v3:projects                 → Project[]
  moloco-playground:v3:project:<id>:playgrounds → Playground[]
  moloco-playground:v3:playground:<id>:messages → Message[]
  moloco-playground:v3:playground:<id>:changes  → ChangeRecord[]
  moloco-playground:v3:playground:<id>:pins     → PinComment[]

orchestrator/state/:
  playground/<id>.json                          → Playground + runtime (container id, ports)
  branches/<id>.git                             → Archive 시 bare repo
  <changeRequestId>.json                        → change-request 상태 (기존 그대로)
```

### 4.3 Migration v2→v3

**별도 파일 `playground-app/src/services/migrate-v2-to-v3.ts` 필수**.

규칙:

- `moloco-canvas:v2:projects` → 그대로 복사 후 `moloco-playground:v3:projects`
- `moloco-canvas:v2:project:<id>:canvases` → **폐기**. Canvas 객체는 Playground와 구조가 다르므로 매핑 불가.
- `moloco-canvas:v2:canvas:<id>:snapshot` → **폐기**.
- 고아 canvas comments (screenId 기반) → `playground-app/legacy-comments/<projectId>.json` 으로 **덤프**. PM이 필요 시 수동 참조. Playground 안엔 자동 import 안 함.
- 마이그레이션 UI: Playground 목록 첫 진입 시 "이전 Canvas 작업물을 `/legacy`로 내보냈습니다" 토스트 한 번.

---

## 5. API Surface

### 5.1 신규 엔드포인트

| Method | Path | 역할 |
|---|---|---|
| POST | `/api/playground` | 새 Playground 생성. Body: `{ projectId, title, baseBranch?, initialPrompt?, prdUrl?, jiraUrl? }`. 샌드박스 부팅, 브랜치 init |
| GET | `/api/playground/:id` | 상태 조회 |
| POST | `/api/playground/:id/resume` | `hibernated` → `active` (`docker start`) |
| POST | `/api/playground/:id/hibernate` | 능동 hibernate (`docker stop`) |
| POST | `/api/playground/:id/archive` | 영구 종료: `docker rm`, 브랜치를 `state/branches/<id>.git`로 push |
| POST | `/api/playground/:id/message` | 에이전트 핑퐁. 기존 `/api/chat` + playgroundId context. **요청 큐 경유** |
| GET | `/api/playground/:id/events` | Playground 레벨 SSE (Playground 상태·메시지·ChangeRecord 갱신 통합 스트림) |
| POST | `/api/playground/:id/checkout` | Body: `{ sha }`. 샌드박스 안에서 `git checkout <sha>`. iframe이 HMR로 반영 |
| POST | `/api/playground/:id/restore-head` | `git checkout <workBranch>` — 시점복원 취소 |
| POST | `/api/playground/:id/revert/:changeRecordId` | `git revert <sha>` (변경 기록으로 남김) |
| POST | `/api/playground/:id/promote` | 작업 브랜치를 **bare repo에 push + msm-portal 호스트 경로로 push + GitHub PR 생성** |

### 5.2 기존 엔드포인트 수정

| Endpoint | 변경 |
|---|---|
| `/api/change-request` | Body에 `playgroundId` 필수. 새 샌드박스 만들지 않고 playground 샌드박스 사용. **스크린샷 단계 제거**. 완료 상태는 `applied` (diff 수집 + 커밋까지) |
| `/api/events/:id` | per-change-request SSE. **`preview_ready` 단계 제거**. `applied` / `reverted` / `error` |
| `/api/chat` | 과도기 유지. 이후 playground message로 이관 deprecate |
| ❌ `/api/screenshot/:id` | 제거 |
| ❌ `/api/diff-view/:id` | 제거 (diff는 Playground UI 안에서 렌더) |

### 5.3 Per-Playground 요청 큐 (v2 신규)

**왜**: playground 하나에 Ext·UI 두 곳에서 동시에 change-request를 쏘면 샌드박스 내 `git status`가 꼬임.

**구현**:
- `orchestrator/lib/playground-queue.js` (신규, 작은 모듈)
- `enqueue(playgroundId, job)` → FIFO. 한 번에 하나만 실행
- 큐 깊이가 5 초과 → 503 응답
- Orchestrator 재기동 시 큐 초기화 (진행 중이던 job은 각자의 state 파일로 재진입)

### 5.4 Chrome Ext 변경

- **사이드패널 상단에 Playground 선택기** (드롭다운 + "새로 만들기")
- `chrome.storage.local.selectedPlaygroundId` 보관
- `/api/change-request` 호출 시 `{ playgroundId, elementContext, userPrompt }` 첨부
- Ext가 orchestrator에 `GET /api/playground` 물어서 목록 채움 (최초 구현 시 간단히)

---

## 6. UI — Playground Detail

### 6.1 레이아웃

```
┌─────────────────────────────────────────────────────────────┐
│ ⬅ TVING Moloco Ads / nav 섹션 추가                          │
│   [active] 🟢 running :57165    [📸 스크린샷 찍기] [🚀 커밋] │
│   🔗 Jira  🔗 PRD  🔗 DS 문서  🔗 Dashboard                 │
├──────────────┬──────────────────────────────────────────────┤
│  💬 대화     │                                              │
│  ─────────   │                                              │
│ [user] Moloco│       Live iframe                            │
│ Ads 섹션 추가│     ┌────────────────────────────┐           │
│              │     │ TVING 앱 HMR 실시간        │           │
│ [ai] 계획… ✓ │     │  ─ nav 클릭 이동 가능      │           │
│ [실행] →     │     │  ─ Pick 모드로 요소 선택   │           │
│              │     │  ─ Comment 모드로 핀 남김  │           │
│ [ai] applied │     └────────────────────────────┘           │
│ +2 files     │                                              │
│ ▸ diff 보기  │   ┌ 모드 ─────────────────────────┐         │
│              │   │ [🔒 View] [🖱 Pick] [📍 Pin]  │         │
│ [user] 대안…│   └───────────────────────────────┘         │
│              │                                              │
│              │   ┌ 변경 파일 (2) ────────────────┐         │
│              │   │ MCOmsMainNavbarContainer.tsx  │         │
│              │   │ tving-ko.json                 │         │
│              │   └─ 인라인 diff 보기 ─────────────┘         │
├──────────────┴──────────────────────────────────────────────┤
│  🕐 타임라인                                                 │
│  ● 14:22 playground 생성                                    │
│  ● 14:25 #deae645b v1 applied  [이 시점으로 돌아가기]       │
│  ● 14:30 #ed5e68f5 v2 applied  [🔄 현재]                    │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 상호작용 모드 (iframe 오버레이)

- **🔒 View**: `pointerEvents: none`. 드래그·스크롤 방해 없음. 기본.
- **🖱 Pick**: Vite 플러그인의 overlay 활성. 클릭 시 `postMessage` → 부모에 `ElementContext`. 다음 메시지에 첨부.
- **📍 Pin**: 클릭 위치에 PinComment 저장. iframe 좌표·selector·url 기록.

### 6.3 시점복원 ("이 시점으로 돌아가기")

타임라인 각 ChangeRecord 항목에 버튼. 누르면:

1. `POST /api/playground/:id/checkout` with `sha`
2. 샌드박스: `git checkout <sha>` (detached HEAD)
3. HMR이 iframe 반영 (~1~2초)
4. 타임라인 헤더: "🔍 과거 상태 열람 중 (v1) — [📸 스크린샷 찍기] [🔄 최신으로]"
5. PM이 OS 스크린샷 뜬 후 [🔄 최신으로] → `restore-head` 호출 → 복귀

### 6.4 Variant 모드 (feature-flag 뒤)

```ts
// playground-app/src/config.ts
export const ENABLE_VARIANTS = false;  // v2 MVP: false
```

UI 토글·코드는 **보존**하되 렌더링 안 함. 오늘 만든 variant 로직은 폐기하지 않음. Phase 2+에 재활성 결정 시 이 플래그만 `true`.

---

## 7. Migration — canvas-app → playground-app

### 7.1 디렉토리 이행 (M2)

**유지·이관**:
```
src/
  shared-ui/                (그대로)
  services/
    orchestrator-client.ts  (playground 엔드포인트 추가)
    project-storage.ts      (v3 키로 확장, 기존 v2 코드 유지)
    migrate-v1-to-v2.ts     (유지)
    migrate-v2-to-v3.ts     (신규 — 4.3 규칙)
  store/
    project-store.ts        (확장)
    playground-store.ts     (신규 — wizard-store + 일부 canvas-store 흡수)
    feedback-store.ts       (PinComment 구조로 리팩터)
  editor/                   → playground/
    AIPanel.tsx             (좌 패널로 이동, ChatBubble 등 shared-ui 활용)
    LivePreview.tsx         (신규 — iframe + 모드 토글 + postMessage 클라)
    PlaygroundHeader.tsx    (CanvasBreadcrumb 대체)
    Timeline.tsx            (신규)
  pages/
    PlaygroundList.tsx      (ProjectHome 확장)
    PlaygroundDetail.tsx    (신규 — 2-pane 레이아웃)
  types/
    project.ts              (Playground, Message, ChangeRecord, PinComment)
```

**폐기**:
```
src/
  canvas/                   (전체 디렉토리 삭제)
    CanvasView.tsx
    nodes/IframeNode.tsx    (LivePreview로 축소 이관)
    nodes/ScreenshotNode.tsx (LivePreview로 축소 이관)
    ...모든 React Flow 의존
  store/
    canvas-store.ts         (전체 폐기)
    wizard-store.ts         (playground-store로 통합)
  editor/CanvasBreadcrumb.tsx
package.json:
  @xyflow/react             (의존성 제거)
  zundo                     (Playground에선 불필요 — 되돌리기는 git revert)
```

### 7.2 Vite 플러그인 (M3)

**신규 패키지**: `sandbox/vite-plugin-playground-picker/`

내부적으로:
- 샌드박스 Vite 빌드에 자동 주입되는 클라이언트 스크립트
- `Cmd+Shift+E` (또는 부모의 postMessage "enter-pick-mode") 으로 활성
- 오버레이 DOM 주입, hover highlight, click capture
- React fiber 감지 (component name, test id) — 기존 Chrome Ext content-script 로직 포팅
- 선택 결과를 `window.parent.postMessage({ type: 'picker.selection', ...data }, PARENT_ORIGIN)`

**빌드 방식**:
- `sandbox/Dockerfile`에서 playground 빌드 시 Vite config에 플러그인 추가
- 또는 런타임에 오케스트레이터가 `docker exec … node inject-picker.js` 식으로 주입 (선택)

**Chrome Ext과 공유**:
- 선택기 핵심 로직을 `packages/element-picker-core/` (신규 workspace 패키지)로 분리
- Vite 플러그인과 Ext content-script가 이 코어를 import

### 7.3 Orchestrator 리팩터 (M1a/M1b)

- **M1a (CRUD only)**: server.js에 playground 엔드포인트 추가, state/playground/ 영속화. **pipeline 건드리지 않음** — change-request는 여전히 새 샌드박스 만듦. 관찰 가능한 기능 0. 단지 기반.
- **M1b (pipeline 역전)**:
  - `runPipeline` 분기: `playgroundId` 있으면 기존 컨테이너 재사용
  - `cleanup(id)`를 `cleanup(id, { removeSandbox: bool })` 로 분리. change-request 종료는 **컨테이너 유지**, Playground archive 시에만 실제 제거
  - Playground 큐 도입 (5.3)
  - 기존 non-playground 경로는 호환 유지 (Ext가 아직 playgroundId 안 쓰는 경우 대비, M4까지)

---

## 8. Milestones (v2 재산정)

| M | 작업 | 소요 | 완료 기준 |
|---|---|---|---|
| **M1a** | Playground CRUD + state 영속화. 기존 파이프라인 건드리지 않음 | **1~1.5일** | curl: playground create / list / get. state 파일 생성 확인 |
| **M1b** | Pipeline 재사용 + 큐 + checkout/revert/promote 엔드포인트 (promote는 skeleton) | **2.5~3일** | curl: playground 생성 → change-request 3회 → 모두 같은 컨테이너·브랜치 누적. 동시 2개 쏘면 큐잉 확인 |
| **M2** | canvas-app → playground-app 리팩터. 2-pane UI. 핀 댓글 이관. migrate-v2-to-v3 | **3~4일** | 브라우저: playground 생성, 에이전트 핑퐁 5회, 각 ChangeRecord 타임라인 노출, 핀 댓글 추가 |
| **M3** | Vite 플러그인 picker + postMessage. Chrome Ext과 core 공유 | **2~3일** | Playground iframe 안 요소 클릭 → 다음 메시지에 context 첨부. Ext도 같은 picker 로직 사용 확인 |
| **M4** | Chrome Ext ↔ Playground 통합. Ext 사이드패널에 playground 선택기 | **1~1.5일** | Ext 요청이 Playground 히스토리에 나타남 |
| **M5** | 시점복원 버튼 + promote/PR (실 동작) | **2~2.5일** | Timeline에서 과거 시점 복원, OS 스크린샷 뜸. `[커밋]` 누르면 msm-portal GitHub PR 생성 |
| **M6** | (선택) orchestrator server.js 모듈 분리 — 누적 부담 해소 | **1일** | 라우팅만 남기고 `lib/playground.js`, `lib/change-request.js`, `lib/chat.js` 분리 |

**Total MVP (M1a~M5)**: **12~15일 작업일**. 리뷰·대기 포함 **3주 calendar**.
스크린샷 파이프라인 제거가 총 1~2일 절약해줌 (M2에서 ScreenshotNode, Playwright invocation, PNG 서빙 코드 삭제).

---

## 9. Risks (v2 정리)

| # | Risk | 완화 |
|---|---|---|
| R1 | 로컬 Docker 동시 N개 | MVP 동시 3개 가정. idle 30분 → `docker stop` |
| R2 | 브랜치 지속성 | Active/hibernated: 컨테이너 FS가 보관. Archived: bare repo push. M1b 완료 기준에 "재기동 후 resume 시 브랜치·커밋 유지" 포함 |
| R3 | 브랜치와 main divergence | MVP는 base branch를 Playground 생성 시점에 freeze. `promote` 시 자동 rebase 시도, conflict 나면 에이전트 재실행 |
| R4 | ~~Cross-origin iframe~~ | **해결**: Vite 플러그인 + postMessage (B1 option a) |
| R5 | 기존 canvas-app 데이터 | migrate-v2-to-v3 규칙으로 보존·덤프 (4.3) |
| R6 | Ext Native messaging 모드 | MVP 지원 안 함. HTTP 모드만 playground 연결 |
| R7 | ~~Variant 복잡도~~ | **해결**: feature-flag off |
| R8 | 동시 요청 꼬임 | per-playground 큐 (5.3) |
| R9 | Vite HMR이 iframe 내부에서 안 될 수 있음 | M1b에 smoke test: iframe에서 파일 수정 → HMR 확인. 실패 시 full reload 폴백 |
| R10 | Git `checkout <sha>` 중 PM이 대화 쏘면 detached HEAD에서 커밋 — 데이터 유실 | checkout 상태일 땐 큐가 신규 change-request 거부 ("먼저 최신으로 돌아가세요") |
| R11 | orchestrator 재기동 시 running 컨테이너 재연결 | M1b 완료 기준에 "orchestrator 재기동 후 state/playground/*.json 읽어 live 컨테이너 re-attach" 포함 |
| R12 | Playground picker가 HMR을 방해 | Vite 플러그인이 HMR update 이벤트 수신 시 picker overlay도 재바인딩. smoke test 포함 |

---

## 10. Open Questions (결정 필요 시점 명시)

| # | 질문 | 결정 시점 |
|---|---|---|
| Q1 | Playground 소유권 (사내 호스팅 후) | Phase 2 시작 전 |
| Q2 | Promote 시 main rebase 실패 handling | M5 구현 중 |
| Q3 | ~~새 페이지 라우트 404~~ | **해결**: iframe-live로 소멸 |
| Q4 | PinTarget 좌표 drift (리사이즈·리로드) | M2 구현 중. selector+xRatio 조합으로 근사 |
| Q5 | 사내 TVING URL에서 Ext 동작 | Phase 2+ |
| Q6 | 대화-변경 relation | M2에서 "한 메시지 → 단수 execution" 확정 (variant off) |
| Q7 | ~~Variant 스코프~~ | **해결**: feature-flag off |
| Q8 | `docker stop` 중 Vite dev server 상태 | 실험으로 확인. 문제 있으면 `docker pause`로 변경 |
| Q9 | Playground URL 단축 형식 | M2에서 `/p/<shortid>` 결정 |

---

## 11. Out of Scope (지금은 안 함)

- Supabase auth·공유·RLS
- 팀 공유 Playground
- Slack/Webhook 알림
- Ext Native messaging과 Playground 연계
- 상용 제품 URL에서 Ext 동작 보장
- Variant 3-way 비교 UI (feature-flag 뒤)
- 정적 스크린샷 자동 캡처 (Playwright 완전 제거)
- Playground 간 diff 비교
- "이 시점으로 돌아가기"의 고급 UX (merge-conflict 회피, 중간 시점 부분 revert 등)
- AI 커밋 메시지·PR 본문 세련화

---

## 12. Success Metrics (MVP 완료 시)

- [ ] kyungjae.ha 가 "TVING Moloco Ads 섹션 추가"를 playground 하나에서 시작 → PR 까지 완주
- [ ] Chrome Ext 요청이 playground 히스토리에 기록됨
- [ ] 한 playground 에서 5회 이상 에이전트 핑퐁, 상태 유지
- [ ] orchestrator 재기동 후에도 active playground 가 resume 가능
- [ ] 타임라인에서 과거 시점 복원 → iframe 반영 → OS 스크린샷 → 최신 복귀 사이클 작동
- [ ] `promote` 한 번 성공 (msm-portal 실제 PR)
- [ ] Canvas 기반 기존 흐름들 Playground 에서 동등 이상 재현

---

## 13. Review Points — v2에 대해

이 문서(v2)를 다시 리뷰할 때 특히 볼 것:

1. **3.1 origin 지도** — 실제로 iframe 안 Vite HMR WS가 부모의 pan/zoom을 방해하지 않는지 (dev 환경에서 prototype)
2. **4.2 migrate-v2-v3 규칙** — 고아 comments를 legacy 덤프로 버리는 결정, 사용자가 동의하는지 확인
3. **5.3 큐** — 큐 깊이 5, 503 정책이 합리적인지
4. **6.3 시점복원 UX** — checkout 중엔 신규 요청 거부(R10)가 PM 체감에 너무 엄격한지
5. **7.2 Vite 플러그인** — 빌드-타임 주입 vs 런타임 주입 중 어느 쪽?
6. **8. Milestones 순서** — M3 (picker) 전에 M2 (UI) 완료 필요? 아니면 병렬 가능?
7. **R9/R12 (HMR·picker 충돌)** — prototype으로 검증해야 할지
8. **Q8 (docker stop vs pause)** — Vite dev server가 `docker stop` SIGTERM 후 재시작 시 올바르게 복구되는가

---

## 14. 다음 스텝

1. 이 v2를 사용자 리뷰
2. **미해결 / 쟁점 항목 2~3개**만 추가 결정
3. 결정 반영된 v3 라벨은 필요 시에만
4. **M1a 착수** (CRUD + state 영속화, 가장 무해한 첫 걸음)

M1a가 끝나면 M1b 착수 전 한 번 더 체크 — pipeline 역전은 리스크 높은 부분이라 중간 검증 포인트로.
