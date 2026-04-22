# Moloco Canvas — Design Spec

> 무한 캔버스 기반 디자인 리뷰 도구. DS 컴포넌트로 구성된 서비스 화면을 캔버스에 배치하고, 팀 피드백을 수집하며, AI 에이전트로 화면을 편집한다.

## 1. 프로젝트 개요

### 목적
- 서비스 화면(풀 페이지)을 단계별/케이스별로 캔버스에 펼쳐 배치
- 팀원이 Figma 스타일로 피드백(핀 댓글, 리액션, 상태 추적)
- 사용자가 직접 컴포넌트 배치/프롭 수정 + AI 에이전트로 자연어 편집

### 사용자
- 개발자, 디자이너, PM — 서비스 화면을 리뷰하고 피드백하는 팀

### 프로젝트 위치
- `canvas-app/` — 새 Vite 프로젝트 (기존 `design-system-site`와 별도, 같은 모노레포 내)
- 기존 코드 재사용 방식:
  - `design-system/src/*.json` → Vite alias `@design-system` 으로 import (기존 DS 사이트와 동일 패턴)
  - `design-system-site/src/components/previews/*.tsx` → Vite alias `@ds-previews`로 import
  - 프리뷰 컴포넌트 소스 파일은 읽기 전용 (canvas-app에서 수정하지 않음). 런타임 프롭 값은 ScreenComponent.props에 저장되어 프리뷰 렌더러에 동적으로 전달됨.
- Vite 설정 (canvas-app/vite.config.ts에 생성):
  ```typescript
  resolve: {
    alias: {
      '@design-system': path.resolve(__dirname, '../design-system/src'),
      '@ds-previews': path.resolve(__dirname, '../design-system-site/src/components/previews'),
      '@canvas-data': path.resolve(__dirname, './data'),
    }
  }
  ```

---

## 2. 기술 스택

| 역할 | 기술 | 이유 |
|------|------|------|
| 캔버스 | `@xyflow/react` (React Flow v12+) | 줌/팬/드래그/선택/엣지/그룹 내장. MIT. 36k★ |
| 팔레트 DnD | HTML Drag & Drop API | React Flow 공식 권장 패턴. 이벤트 충돌 없음 |
| 상태관리 | Zustand + zundo | React Flow controlled mode 호환. undo/redo 지원 |
| 프레임워크 | React 18 + Vite | 기존 DS 사이트와 동일 |
| 백엔드 (Phase 2) | Supabase Docker → Cloud | 교체 가능한 어댑터 패턴 |
| AI (Phase 3) | MCP Server | 캔버스 읽기/쓰기 도구 |

---

## 3. 데이터 모델

### CanvasProject
```typescript
interface CanvasProject {
  id: string;
  name: string;               // "캠페인 관리 v2"
  viewport: { x: number; y: number; zoom: number };
  schemaVersion: number;       // 마이그레이션용
  createdBy: string;
  updatedAt: string;
}
```

### Section → React Flow Group Node
```typescript
// React Flow Node<SectionData> 형태로 저장
interface SectionData {
  name: string;                // "캠페인 생성 플로우"
  color: string;
}
// Node 레벨: id, type: "section", position, width, height
// parentId 없음 (최상위)
```

### Screen → React Flow Custom Node
```typescript
// React Flow Node<ScreenData> 형태로 저장
interface ScreenData {
  name: string;                // "Step 1: 캠페인 정보 입력"
  width: number;
  height: number;
  zIndex: number;
  locked: boolean;
}
// Node 레벨: id, type: "screen", position (부모 기준 상대좌표)
// parentId: Section ID (optional)
```

### ScreenComponent → Flat Map
```typescript
// Record<string, ScreenComponent>로 Zustand에 저장
interface ScreenComponent {
  id: string;
  screenId: string;            // 소속 Screen
  parentId: string | null;     // 부모 컴포넌트 (레이아웃 중첩용)
  childIds: string[];          // 자식 컴포넌트 ID 목록
  type: string;                // "MCButton2", "MCFormTextInput" 등
  props: Record<string, any>;  // { variant: "contained", size: "medium" }
  order: number;               // 형제 간 순서
  createdAt: string;
}
```

### Flow → React Flow Edge
```typescript
// React Flow Edge 네이티브 형태
interface FlowData {
  label: string;               // "다음", "에러", "취소"
}
// Edge 레벨: id, source, target, type: "flow"
```

### Comment → 화면 내 오버레이 (React Flow 노드 아님)
```typescript
interface Comment {
  id: string;
  screenId: string;
  xRatio: number;              // 0~1 (화면 width 기준 비율)
  yRatio: number;              // 0~1 (화면 height 기준 비율)
  text: string;
  author: { id: string; name: string; avatar?: string };
  status: "open" | "resolved" | "rejected";
  reactions: Record<string, string[]>;  // { "👍": ["user1", "user2"] }
  replies: Reply[];
  createdAt: string;
}

interface Reply {
  id: string;
  text: string;
  author: { id: string; name: string };
  createdAt: string;
}
```

---

## 4. 아키텍처

```
┌─ UI Layer ────────────────────────────────────────────┐
│  CanvasView        (@xyflow/react <ReactFlow>)        │
│  ├─ SectionNode    (Group Node, 섹션 경계)             │
│  ├─ ScreenNode     (Custom Node, DS 컴포넌트 렌더링)   │
│  ├─ FlowEdge      (Custom Edge, 플로우 화살표)         │
│  └─ CommentOverlay (화면 내 absolute div)              │
│                                                        │
│  Toolbar           (인터랙션 모드: select/pan/comment) │
│  ComponentPalette  (DS 컴포넌트 목록, HTML DnD)        │
│  PropPanel         (선택된 컴포넌트 프롭 편집)           │
│  FeedbackPanel     (전체 댓글 목록 + 상태 필터)         │
└────────────────────────────────────────────────────────┘
                          ↕
┌─ State Layer ─────────────────────────────────────────┐
│  canvas-store.ts   (Zustand + zundo)                  │
│  ├─ nodes: Node[]  (React Flow 네이티브)               │
│  ├─ edges: Edge[]                                     │
│  ├─ components: Record<string, ScreenComponent>       │
│  └─ interactionMode: "select" | "pan" | "comment"    │
│                                                        │
│  feedback-store.ts (Zustand)                          │
│  ├─ comments: Record<string, Comment>                 │
│  └─ activeThread: string | null                       │
└────────────────────────────────────────────────────────┘
                          ↕
┌─ Service Layer ───────────────────────────────────────┐
│  interfaces.ts                                        │
│  ├─ ProjectService  (CRUD projects)                   │
│  ├─ CanvasService   (save/load nodes, edges, comps)   │
│  ├─ CommentService  (CRUD comments, replies)          │
│  ├─ AuthService     (sign in/out, get user)           │
│  └─ RealtimeService (subscribe, broadcast)            │
│                                                        │
│  local-adapter.ts      (Phase 0: JSON 파일)           │
│  supabase-adapter.ts   (Phase 2: Docker → Cloud)      │
└────────────────────────────────────────────────────────┘
```

---

## 5. 인터랙션 모드

캔버스 도구의 이벤트 충돌을 방지하기 위해 명시적 모드 시스템 사용.

| 모드 | 마우스 클릭 | 마우스 드래그 | 단축키 |
|------|-----------|-------------|--------|
| **Select** (기본) | 노드 선택 | 노드 이동 | `V` |
| **Pan** | - | 캔버스 이동 | `H` 또는 Space+드래그 |
| **Comment** | 핀 찍기 | - | `C` |

---

## 6. 주요 기능 상세

### 6.1 캔버스 (Phase 0a)
- React Flow `<ReactFlow>` 컴포넌트로 무한 캔버스 구현
- ScreenNode: 커스텀 노드. 내부에 DS 컴포넌트들을 `DSComponentRenderer`로 렌더링. `React.memo` 필수.
- SectionNode: 그룹 노드. `expandParent: true`로 자식 추가시 자동 확장. 축소는 `onNodeDragStop`에서 `getNodesBounds()`로 수동 계산.
- FlowEdge: 커스텀 엣지. 라벨 표시, 곡선 화살표.
- 미니맵, 줌 컨트롤, 배경 그리드 기본 제공.

### 6.2 저장/Undo (Phase 0b)
- Zustand controlled mode: `nodes`, `edges` 를 Zustand에 저장. `onNodesChange` → `applyNodeChanges()`.
- zundo `temporal` 미들웨어:
  - `partialize`: nodes, edges, components만 추적 (viewport, interactionMode 제외)
  - `handleSet`: `throttle(handleSet, 100)` — 드래그 중 과도한 스냅샷 방지
  - 드래그 완료(`dragging: false`)시에만 히스토리 기록
- JSON 저장: `canvas-app/data/` 폴더에 `{projectId}.json` 형태로 직렬화. Vite alias `@canvas-data`로 접근.

### 6.3 편집기 (Phase 1)
- ComponentPalette: DS 컴포넌트를 카테고리별로 표시. HTML `draggable` 속성 사용.
  - Phase 1 범위: 프리뷰 렌더러가 있는 15개 인터랙티브 + 23개 스태틱 컴포넌트만 팔레트에 표시.
  - 프리뷰 없는 컴포넌트는 점진적으로 추가. 팔레트에 "(프리뷰 준비중)" 표시.
- 캔버스 `onDrop`: `screenToFlowPosition({ x: event.clientX, y: event.clientY })`로 좌표 변환 후 노드 생성.
- PropPanel: 선택된 ScreenComponent의 props를 기존 `COMPONENT_CONTROLS` 맵 기반으로 편집 UI 생성.
  - 현재 10개 컴포넌트만 `COMPONENT_CONTROLS` 엔트리 보유 (MCButton2, MCFormTextInput, MCFormCheckBox, MCFormSwitchInput, MCFormRadioGroup, MCBarTabs, MCStatus, MCLoader, MCCommonDialog, MCBanner).
  - 엔트리 없는 컴포넌트 선택 시: PropPanel에 "편집 가능한 속성이 없습니다" 메시지 표시. 컨트롤 맵 확장은 점진적으로 진행.
- 화면 내 컴포넌트 순서 변경: 위/아래 이동 버튼 또는 DnD.

### 6.4 피드백 (Phase 2)
- Comment 모드에서 화면 클릭 → 핀 생성 (xRatio, yRatio 계산)
- 댓글 오버레이: ScreenNode 내부에 absolute positioned div로 렌더링 (React Flow 노드 아님)
- FeedbackPanel: 사이드바에 전체 댓글 목록. 상태별 필터 (open/resolved/rejected)
- 리액션: 댓글 아래 이모지 버튼. 클릭 시 토글.
- Supabase Docker 로컬 셋업 → Auth + Realtime + PostgreSQL

### 6.5 AI + 협업 (Phase 3)
- MCP Server: 캔버스 상태를 읽고/쓰는 도구 노출 (get_screens, update_screen, add_component, etc.)
- 자연어 → 캔버스 조작: "테이블 위에 필터바 추가해줘" → MCP 도구 호출
- Supabase Realtime으로 멀티플레이어 커서 + 동시 편집
- Auth: 이메일/비밀번호 또는 OAuth

---

## 7. 프로젝트 구조

```
canvas-app/
  src/
    canvas/                     ← React Flow 래퍼
      CanvasView.tsx            ← <ReactFlow> 메인 컴포넌트
      Toolbar.tsx               ← 인터랙션 모드 전환
      nodes/
        ScreenNode.tsx          ← 화면 프레임 커스텀 노드
        SectionNode.tsx         ← 섹션 그룹 노드
      edges/
        FlowEdge.tsx            ← 플로우 화살표
    editor/                     ← 화면 내부 편집
      ComponentPalette.tsx      ← DS 컴포넌트 팔레트
      PropPanel.tsx             ← 프롭 편집 패널
      ScreenEditor.tsx          ← 화면 내 컴포넌트 관리
    feedback/                   ← 피드백 시스템
      CommentOverlay.tsx        ← 화면 위 핀 댓글
      CommentThread.tsx         ← 댓글 스레드 + 답글
      ReactionBar.tsx           ← 이모지 리액션
      FeedbackPanel.tsx         ← 사이드바 피드백 목록
    ds-registry/                ← DS 컴포넌트 레지스트리
      registry.ts               ← 컴포넌트 이름 → 렌더러 맵
      DSComponentRenderer.tsx   ← 렌더링 디스패처
    services/                   ← 인터페이스 + 어댑터
      interfaces.ts             ← 서비스 계약
      local-adapter.ts          ← Phase 0: JSON 파일
      supabase-adapter.ts       ← Phase 2: Supabase
    store/                      ← 상태관리
      canvas-store.ts           ← 노드/엣지/컴포넌트 + undo
      feedback-store.ts         ← 댓글/리액션
    transforms/                 ← 도메인 ↔ React Flow 변환
      serialize.ts              ← 저장용 직렬화
      deserialize.ts            ← 로드용 역직렬화
    hooks/                      ← 커스텀 훅
      useCanvasDropHandler.ts   ← HTML DnD → 노드 생성
      useSectionAutoResize.ts   ← 섹션 자동 리사이즈
      useInteractionMode.ts     ← 모드 전환 + 단축키
    mcp/                        ← Phase 3: AI 에이전트 서버
    App.tsx
    main.tsx
  package.json
  vite.config.ts
```

---

## 8. 에러 처리 & 제한사항

### 컴포넌트 렌더링 에러
- `DSComponentRenderer`를 React Error Boundary로 감싼다. 프리뷰 렌더링이 실패하면 컴포넌트 이름과 "렌더링 실패" 메시지를 표시하는 폴백 UI 노출. 캔버스 전체가 크래시되지 않도록 격리.

### 저장/로드 실패
- JSON 파일 저장 실패: 토스트 알림 + 1회 재시도. 실패 시 dirty 상태 유지, 사용자에게 수동 저장 안내.
- JSON 파일 로드 실패(파일 없음/손상): 빈 프로젝트로 시작. 에러 메시지 표시.

### 캔버스 성능 제한
- 권장 소프트 리밋: 화면(Screen) 50개, 컴포넌트 총 500개. React Flow 뷰포트 가상화가 있지만 DOM 노드가 많아지면 성능 저하.
- 리밋 초과 시 경고 토스트 표시 (차단하지 않음).

### Undo 히스토리
- 최대 50개 스냅샷 유지. 초과 시 가장 오래된 스냅샷 폐기.

### 자동 저장
- Phase 0: 없음. 수동 저장(Ctrl+S).
- Phase 2+: Supabase 연동 후 30초 간격 자동 저장 + 브라우저 `beforeunload` 이벤트에서 미저장 변경사항 경고.

---

## 9. 구현 페이즈

### Phase 0a — 캔버스 기본 + DS 렌더링 (~1-2주)
- Vite 프로젝트 셋업, @xyflow/react 설치
- ScreenNode, SectionNode, FlowEdge 커스텀 타입
- DS 컴포넌트 레지스트리 (기존 프리뷰 재사용)
- Zustand 스토어 (controlled mode)
- 인터랙션 모드 (select/pan)
- 미니맵, 줌 컨트롤, 배경 그리드
- 샘플 데이터로 동작하는 데모

**완료 기준:**
- 캔버스에서 줌/팬/미니맵이 동작한다
- 최소 3개 ScreenNode가 DS 컴포넌트를 렌더링한다
- 최소 1개 SectionNode가 여러 Screen을 그룹핑한다
- Select 모드: 노드 클릭 시 하이라이트, 드래그로 이동
- FlowEdge가 화면 간 화살표를 라벨과 함께 표시한다

### Phase 0b — 저장 + Undo + 키보드 (~1-2주)
- JSON 파일 저장/로드 (local-adapter)
- zundo undo/redo (partialize + throttle)
- 키보드 단축키 (Delete, Ctrl+Z/Y, V/H/C 모드)
- NodeResizer로 화면 리사이즈
- 섹션 자동 리사이즈 (getNodesBounds)
- 노드 잠금 (locked)

**완료 기준:**
- Ctrl+S로 저장 후 새로고침하면 동일한 캔버스 상태가 복원된다
- Ctrl+Z/Y로 노드 이동, 삭제, 프롭 변경을 되돌릴 수 있다
- V/H/C 키로 인터랙션 모드가 전환된다
- 노드 테두리 드래그로 리사이즈가 동작한다

### Phase 1 — 편집기 (~2-3주)
- ComponentPalette (카테고리별 DS 컴포넌트)
- HTML DnD → screenToFlowPosition → 노드/컴포넌트 생성
- PropPanel (COMPONENT_CONTROLS 기반)
- 화면 내 컴포넌트 순서 변경
- 새 화면/섹션/플로우 생성 UI
- 컴포넌트 라이브러리 뷰 (개별 컴포넌트 모아보기)

**완료 기준:**
- 팔레트에서 컴포넌트를 드래그하여 화면에 배치할 수 있다
- 배치된 컴포넌트 선택 시 PropPanel에서 프롭을 변경하면 즉시 반영된다
- 새 화면/섹션을 생성하고 화살표로 연결할 수 있다

### Phase 2 — 피드백 + 백엔드 (~2-3주)
- Comment 모드 + 핀 댓글 (ratio 기반)
- 댓글 스레드, 답글, 리액션
- 상태 추적 (open/resolved/rejected)
- FeedbackPanel 사이드바
- Supabase Docker 로컬 셋업
- 서비스 어댑터 연동 (Auth + DB + Realtime)

**완료 기준:**
- Comment 모드에서 화면 클릭 시 핀 댓글을 생성할 수 있다
- 댓글에 답글, 리액션을 달 수 있고 상태(open/resolved/rejected)를 변경할 수 있다
- Supabase Docker에서 로그인 후 저장된 프로젝트를 불러올 수 있다

### Phase 3 — AI + 협업 (~3-4주)
- MCP Server (캔버스 도구 정의)
- AI 자연어 → 캔버스 조작
- 멀티플레이어 커서 (Supabase Realtime)
- 동시 편집 (last-write-wins 기본. 같은 노드 동시 수정 시 Supabase Realtime broadcast로 최신 상태 브로드캐스트. 충돌 빈도가 높아지면 CRDT(Yjs) 도입 검토.)
- 활동 트래킹
- 서버 배포 (Supabase Cloud 또는 자체 인프라)

**완료 기준:**
- AI에게 "버튼 추가해줘"라고 요청하면 MCP를 통해 캔버스에 컴포넌트가 추가된다
- 2명의 사용자가 동시에 캔버스를 보면서 실시간 커서가 표시된다
- 로그인/로그아웃이 동작하고, 사용자별 활동 로그가 기록된다

---

## 10. 테스트 전략

| 영역 | 방법 | 시기 |
|------|------|------|
| Store 로직 (canvas-store, feedback-store) | Vitest 단위 테스트 | Phase 0a부터 |
| Transforms (serialize/deserialize) | Vitest 단위 테스트 | Phase 0b부터 |
| 캔버스 인터랙션 (줌/팬/드래그/DnD) | 수동 테스트 | 매 Phase |
| 서비스 어댑터 | Vitest 통합 테스트 | Phase 2부터 |
| E2E (전체 플로우) | Playwright (도입 검토) | Phase 2+ |

### 접근성 (Accessibility)
- 캔버스 기반 도구의 특성상 완전한 스크린 리더 지원은 어려움. 알려진 한계로 문서화.
- 키보드 네비게이션: 단축키(V/H/C, Delete, Ctrl+Z/Y/S)는 Phase 0b에서 구현.
- ComponentPalette, PropPanel, FeedbackPanel: 표준 HTML 폼 요소 사용으로 기본 접근성 확보.

---

## 11. 검증된 기술적 결정

| 결정 | 근거 |
|------|------|
| React Flow (not react-zoom-pan-pinch) | react-zoom-pan-pinch는 이미지 뷰어용. 캔버스 에디터에 필요한 선택/드래그/엣지/좌표변환 없음. 이 조합으로 만든 프로덕션 프로젝트 0건. |
| HTML DnD API (not @dnd-kit) | @dnd-kit은 CSS transform 컨테이너 안에서 좌표 버그 (GitHub #250, #50, #398, #1411). React Flow 공식 DnD 예제가 HTML DnD 사용. |
| ScreenComponent flat map (not recursive tree) | O(1) 조회, 더 가벼운 undo 스냅샷, 간단한 immutable 업데이트 |
| 댓글 ratio 좌표 (not absolute) | 화면 리사이즈 시 댓글 위치 유지 |
| 댓글 = DOM 오버레이 (not React Flow 노드) | 노드로 만들면 선택/드래그/fitView 등에 간섭 |
| zundo partialize + throttle | 드래그 중 초당 수백 개 false 스냅샷 방지 |
| 인터랙션 모드 시스템 | 팬/드래그/댓글 이벤트 충돌 원천 차단. Figma/Miro 동일 패턴 |
| 서비스 어댑터 패턴 | 백엔드 교체 가능 (Supabase → Firebase → 자체 API) |
