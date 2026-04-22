# Phase 4A — Project Layer (Local)

**Status:** Draft v3 — Codex review #1 applied, awaiting Codex review #2
**Created:** 2026-04-20
**Duration estimate:** 5 days (Codex split Day 4)
**Prerequisites:** Phase 3 Step 2.2 complete (chat UI + /api/chat endpoint)

---

## 1. Goal

Canvas 위에 **Project 계층**을 도입해서 PM이 여러 Jira 티켓/기획을 병렬로 관리하고, 각 프로젝트 안에 여러 캔버스(실험 공간)를 둘 수 있게 한다. 이 단계는 localStorage 기반 단일 사용자 — **Phase 4B에서 Supabase Docker로 백엔드화**하므로 **데이터 모델·저장소 API는 지금부터 4B 호환**으로 설계한다.

---

## 2. 확정된 결정 사항

| # | 결정 |
|---|---|
| 1 | AI 채팅은 **캔버스 레벨** (각 캔버스마다 fresh 시작) |
| 2 | 캔버스 **자동 네이밍** (`Canvas 1`, `Canvas 2`…) + 사용자 수정 가능 |
| 3 | 프로젝트 상태: `active / archived / done` |
| 4 | 공유/권한 필요 (Phase 4B에서 Supabase로 구현) |
| 5 | ~~마이그레이션 불필요~~ → **Codex 지적 수용: 기존 `moloco-canvas-default` 자동 이관** |

---

## 3. 데이터 모델 (v2 — 4B 호환)

```ts
// src/types.ts 확장
type TargetClient = 'msm-default' | 'tving' | 'shortmax' | 'onboard-demo';
type ProjectStatus = 'active' | 'archived' | 'done';

interface Project {
  id: string;                  // uuid
  schemaVersion: 2;
  name: string;
  description?: string;
  jiraUrl?: string;
  prdUrl?: string;
  defaultClient: TargetClient;
  status: ProjectStatus;
  ownerId: string | null;      // 4A: 'local-user' | 4B: supabase user id
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;           // ISO
  updatedAt: string;
  deletedAt: string | null;    // soft delete
}

interface CanvasMeta {
  id: string;
  schemaVersion: 2;
  projectId: string;           // FK
  name: string;
  order: number;               // deterministic ordering (before Supabase cursor)
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface CanvasSnapshot {
  id: string;                  // same as CanvasMeta.id
  schemaVersion: 2;
  projectId: string;
  viewport: { x: number; y: number; zoom: number };
  nodes, edges, components, comments,   // 기존 canvas-store
  chatMessages,                          // 기존 wizard-store
  updatedAt: string;
}
```

**빠진 필드가 있으면 Supabase 마이그레이션 때마다 대규모 리팩터 필요 → 지금 확정.**

### localStorage 키 구조 (v2 prefix)
```
moloco-canvas:v2:projects                      → Project[]
moloco-canvas:v2:project:{projId}:canvases     → CanvasMeta[]
moloco-canvas:v2:canvas:{canvasId}:snapshot    → CanvasSnapshot
moloco-canvas:v2:migrated                      → '1' (one-shot flag)
```

---

## 4. Storage API (async-first)

4B에서 Supabase adapter로 교체할 때 호출부를 전혀 건드리지 않기 위해 **지금부터 `Promise` 반환**.

```ts
// src/services/project-storage.ts
export interface ProjectStorage {
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(p: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'schemaVersion'>): Promise<Project>;
  updateProject(id: string, patch: Partial<Project>): Promise<Project>;
  softDeleteProject(id: string): Promise<void>;

  listCanvases(projectId: string): Promise<CanvasMeta[]>;
  createCanvas(projectId: string, name?: string): Promise<CanvasMeta>;
  updateCanvasMeta(id: string, patch: Partial<CanvasMeta>): Promise<CanvasMeta>;
  softDeleteCanvas(id: string): Promise<void>;

  loadSnapshot(canvasId: string): Promise<CanvasSnapshot | null>;
  saveSnapshot(snapshot: CanvasSnapshot): Promise<void>;
}

export const projectStorage: ProjectStorage = createLocalStorageAdapter();
```

4B에서는 `createLocalStorageAdapter()` → `createSupabaseAdapter(client)`로 교체.

---

## 5. 마이그레이션 (Codex 지적 반영)

현재 `moloco-canvas-default` 키로 저장된 기존 상태가 있으므로, 앱 부팅 시 1회만 실행되는 마이그레이션 로직:

```ts
// src/services/migrate-v1-to-v2.ts
async function migrate() {
  if (localStorage.getItem('moloco-canvas:v2:migrated')) return;

  const oldRaw = localStorage.getItem('moloco-canvas-default');
  if (oldRaw) {
    try {
      const old = JSON.parse(oldRaw);
      const project = await projectStorage.createProject({
        name: 'Project 1 (이전 작업)',
        status: 'active',
        defaultClient: 'tving',
        ownerId: 'local-user',
        createdBy: 'local-user',
        updatedBy: 'local-user',
        deletedAt: null,
      });
      const canvas = await projectStorage.createCanvas(project.id, 'Canvas 1');
      await projectStorage.saveSnapshot({
        id: canvas.id,
        schemaVersion: 2,
        projectId: project.id,
        viewport: old.project?.viewport ?? { x: 0, y: 0, zoom: 1 },
        nodes: old.nodes ?? [],
        edges: old.edges ?? [],
        components: old.components ?? [],
        comments: old.comments ?? [],
        chatMessages: [],
        updatedAt: new Date().toISOString(),
      });
      // 기존 키는 백업 차원에서 남겨두기 (삭제하지 않음)
    } catch (err) {
      console.warn('[migrate] v1→v2 failed, continuing with empty state', err);
    }
  }
  localStorage.setItem('moloco-canvas:v2:migrated', '1');
}
```

---

## 6. 라우팅 + Route-Scoped 세션

**Codex 지적: `ReactFlowProvider` 중첩 + `fitView` 매번 재실행 + `useEffect([])` hydrate 문제 해결.**

### 전략: `CanvasSession` 컴포넌트로 hydrate/save를 격리

```
/                            → ProjectListPage
/p/:projectId                → ProjectHomePage
/p/:projectId/c/:canvasId    → CanvasSession → CanvasView
                                └─ key={canvasId} 로 완전 remount 보장
                                └─ ReactFlowProvider 여기서 하나만
                                └─ hydrate / save debounce / guard 모두 이 안에
```

```tsx
// src/pages/CanvasSession.tsx
function CanvasSession() {
  const { canvasId } = useParams();
  const epochRef = useRef(0);
  const activeCanvasIdRef = useRef(canvasId);

  useEffect(() => {
    activeCanvasIdRef.current = canvasId;
    const epoch = ++epochRef.current;

    // 1) zundo temporal pause + snapshot inject + clear past/future + resume
    const temporal = useCanvasStore.temporal.getState();
    temporal.pause();
    useCanvasStore.setState(/* initial empty */);
    useWizardStore.getState().reset();
    useFeedbackStore.setState({ comments: [], activeThreadId: null });

    (async () => {
      const snap = await projectStorage.loadSnapshot(canvasId);
      if (epoch !== epochRef.current) return;  // stale load guard

      useCanvasStore.setState({ nodes: snap.nodes, edges: snap.edges, ... });
      useFeedbackStore.setState({ comments: snap.comments });
      useWizardStore.setState({ messages: snap.chatMessages ?? [] });

      temporal.clear();
      temporal.resume();
    })();

    return () => {
      epochRef.current++;  // stale = anything not === current
    };
  }, [canvasId]);

  // Debounced save with canvasId + epoch guard
  useEffect(() => {
    let timer: number;
    const unsub = useCanvasStore.subscribe(/* nodes/edges */ () => {
      clearTimeout(timer);
      const myEpoch = epochRef.current;
      timer = setTimeout(async () => {
        if (activeCanvasIdRef.current !== canvasId) return;
        if (epochRef.current !== myEpoch) return;
        // build snapshot from CURRENT stores, but verify canvasId match
        await projectStorage.saveSnapshot({ id: canvasId, ... });
      }, 800);
    });
    return () => { clearTimeout(timer); unsub(); };
  }, [canvasId]);

  return (
    <ReactFlowProvider>  {/* 유일 */}
      <CanvasView />
    </ReactFlowProvider>
  );
}
```

**핵심 가드:**
- `epochRef` — navigation 직후 도착한 async 결과 drop
- `activeCanvasIdRef` — debounce timer 만료 시점에 아직 이 캔버스인지 확인
- `<CanvasSession key={canvasId}>` — 라우트 파라미터 바뀌면 완전 remount

### AI chat 비동기 가드 (concrete)

`AIPanel.postChat()`도 같은 패턴. `CanvasSession`이 `canvasId`를 React Context로 노출하고, `AIPanel`이 그걸 읽어 요청마다 epoch 캡처:

```tsx
// src/pages/CanvasSession.tsx — Context 추가
const CanvasSessionCtx = createContext<{
  canvasId: string;
  epochRef: React.MutableRefObject<number>;
}>(null!);
export const useCanvasSession = () => useContext(CanvasSessionCtx);

// AIPanel.tsx — handleSend 교체
const { canvasId, epochRef } = useCanvasSession();

const handleSend = useCallback(async () => {
  const trimmed = input.trim();
  if (!trimmed || isSending) return;

  const sentCanvasId = canvasId;
  const sentEpoch = epochRef.current;

  addUserMessage(trimmed);
  setSending(true);
  try {
    const reply = await postChat(apiMessages);
    // Guard: canvas navigation happened while request was in flight
    if (sentCanvasId !== canvasId || sentEpoch !== epochRef.current) {
      console.debug('[AIPanel] drop reply — canvas changed');
      return;
    }
    if (reply.type === 'question') addAssistantMessage({ content: reply.content });
    else addAssistantMessage({ content: reply.content, plan: rawToPlan(reply.plan) });
  } catch (err) {
    if (sentCanvasId !== canvasId || sentEpoch !== epochRef.current) return;
    // ...existing error handling...
  } finally {
    if (sentCanvasId === canvasId && sentEpoch === epochRef.current) {
      setSending(false);
    }
  }
}, [...]);
```

이 패턴으로 `postChat`이 30초 뒤에 응답해도 이미 다른 캔버스로 이동한 상태면 **조용히 drop**. `setSending(false)`도 현재 캔버스일 때만 반영해 상태 오염 방지.

---

## 7. 컴포넌트 & 파일 구조

### 신규 파일
```
canvas-app/src/
├── router.tsx                          라우터 정의
├── pages/
│   ├── ProjectListPage.tsx             프로젝트 목록
│   ├── ProjectHomePage.tsx             프로젝트 대시보드 + 캔버스 목록
│   └── CanvasSession.tsx               route-scoped hydrate/save 세션 (중요)
├── editor/
│   ├── NewProjectModal.tsx
│   ├── ProjectMetaHeader.tsx
│   └── CanvasBreadcrumb.tsx
├── store/
│   └── project-store.ts                프로젝트/캔버스 메타 zustand
├── services/
│   ├── project-storage.ts              async 인터페이스 + localStorage adapter
│   └── migrate-v1-to-v2.ts             1회성 마이그레이션
└── types/project.ts                    Project / CanvasMeta / CanvasSnapshot
```

### 수정 파일
```
canvas-app/src/
├── App.tsx                              ReactFlowProvider 제거 + BrowserRouter만
├── main.tsx                             migrate() await 후 mount
├── canvas/CanvasView.tsx                ReactFlowProvider 제거 (CanvasSession이 담당)
├── services/local-adapter.ts            DEPRECATED (CanvasSession이 대체) — 제거 예정
└── package.json                         react-router-dom 추가
```

---

## 8. 화면 설계

### ProjectListPage
```
┌─────────────────────────────────────────────┐
│ Moloco Canvas                [+ 새 프로젝트] │
├─────────────────────────────────────────────┤
│ [Active]  [Archived]  [Done]                │
│                                             │
│ ┌─ 색 스와치 ─┐  ┌──────────┐  ┌──────────┐ │
│ │ TVING       │  │ ...      │  │ ...      │ │
│ │ Moloco Ads  │  │          │  │          │ │
│ │ 🎟 CAS-141  │  │          │  │          │ │
│ │ 캔버스 3개   │  │          │  │          │ │
│ │ 2분 전      │  │          │  │          │ │
│ └────────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────┘
```

### ProjectHomePage
```
┌──────────────────────────────────────────────────────────┐
│ ← 프로젝트 목록       [상태 ▾]  [⋯]                       │
├──────────────────────────────────────────────────────────┤
│ TVING Ad System Moloco Ads 추가                          │
│ 🎟 CAS-141  📄 PRD  ·  owner: me  ·  2026-04-20          │
├──────────────────────────────────────────────────────────┤
│  캔버스 (3)                         [+ 새 캔버스]         │
│                                                          │
│  ┌─ 썸네일 ─┐  ┌──────────┐  ┌──────────┐               │
│  │ Canvas 1  │  │ Canvas 2 │  │ Canvas 3 │               │
│  │ 12개 노드 │  │ 4개 노드 │  │ 8개 노드 │               │
│  │ 2분 전   │  │ 1시간 전  │  │ 어제     │               │
│  └──────────┘  └──────────┘  └──────────┘               │
└──────────────────────────────────────────────────────────┘
```

### CanvasView (breadcrumb 추가)
```
┌──────────────────────────────────────────────────────────┐
│ ← TVING Moloco Ads  /  Canvas 1 [✎]                      │
├──────────────────────────────────────────────────────────┤
│ [Palette] │     [캔버스]            │  [AI Chat 패널]     │
└──────────────────────────────────────────────────────────┘
```

썸네일 4A 스코프: **색 + 이름 + 노드 개수 + 최근 수정 시간**만. (Codex: 진짜 썸네일은 4B scope creep — 별도 4C로 분리)

---

## 9. Day-by-Day 작업 (5일로 조정)

### Day 1 — 데이터 모델 + Storage API
- `src/types/project.ts` 작성 (Project, CanvasMeta, CanvasSnapshot — schemaVersion/ownerId/timestamps/deletedAt/viewport 포함)
- `src/services/project-storage.ts` — async interface + localStorage adapter
- `src/services/migrate-v1-to-v2.ts`
- `project-store.ts` (얇은 wrapper, 대부분 storage 직접 호출)
- 단위 테스트: CRUD round-trip, 마이그레이션

**DoD:** 테스트 GREEN, 기존 사용자의 v1 데이터가 "Project 1 > Canvas 1"로 이관됨

### Day 2 — 라우팅 + ProjectListPage
- `react-router-dom` 설치
- `main.tsx`에서 migrate() await → BrowserRouter
- `App.tsx`에서 `<ReactFlowProvider>` 제거
- `src/router.tsx` 정의
- `ProjectListPage.tsx` (탭: active/archived/done + 카드 + 빈 상태)
- `NewProjectModal.tsx` (이름/설명/Jira/PRD/defaultClient)
- 생성 후 원자적으로 Canvas 1 자동 생성 → `/p/:projectId/c/:canvasId` 이동

**DoD:** 새 프로젝트 생성 → 자동 생성된 Canvas 1 열림. 기존 사용자는 이관된 프로젝트 1개 목록에 보임.

### Day 3 — ProjectHomePage
- `ProjectHomePage.tsx` + `ProjectMetaHeader.tsx`
- 캔버스 카드 그리드 (placeholder 썸네일 + 이름 + 노드 개수 + 최근 수정 시간)
- 캔버스 이름 인라인 편집
- "+ 새 캔버스"
- 캔버스 soft-delete (confirm)
- 프로젝트 상태 토글 (active/archived/done)

**DoD:** 프로젝트 홈에서 캔버스 여러 개 관리 — 생성·이름변경·삭제·상태토글 전부 동작

### Day 4 — Route/Hydrate/Reset (Codex 분리)
- `CanvasSession.tsx` 작성 — hydrate + store reset 전부
- `CanvasBreadcrumb.tsx` 마운트
- `<CanvasSession key={canvasId}>` 로 완전 remount 보장
- zundo temporal pause/clear/resume 시퀀스
- wizard-store·feedback-store reset + hydrate from snapshot.chatMessages
- 스모크: 캔버스 전환 시 상태 혼입 없음 (수동 테스트 포함)

**DoD:** 프로젝트 2개 × 캔버스 2개씩 — 전환해도 각 캔버스가 자기 상태 유지, undo 히스토리 누수 없음

### Day 5 — Save/Race/Tests
- Debounced save (800ms) with `epoch` + `activeCanvasIdRef` guard
- AIPanel async chat response guard (epoch가 다르면 drop)
- Edge cases: invalid URL, 삭제된 project/canvas, corrupted snapshot
- 단위 테스트 (fake timers): 
  - 캔버스 빠르게 전환 시 save가 올바른 키에만 기록
  - postChat pending 중 canvas 전환 시 응답이 drop
- localStorage quota 초과 시 경고 토스트

**DoD:** 빠른 캔버스 전환·빠른 AI 전송·삭제 후 URL 직접 접근 등 엣지케이스 테스트 PASS

---

## 10. 검증 시나리오 (5일 끝)

1. 기존 사용자 v1 데이터 → 자동으로 "Project 1" 하나 생기고 이전 작업 그대로
2. 새 프로젝트 "TVING Moloco Ads" 생성 → Canvas 1 자동 열림 → AI 대화
3. Canvas 2 생성 → 독립된 채팅·노드
4. Canvas 1 ↔ 2 빠르게 전환해도 각자 상태 유지, undo 히스토리 오염 없음
5. AI chat 중 canvas 전환 → 이전 응답이 새 canvas에 안 꽂힘
6. 다른 프로젝트 생성 → 완전 격리
7. 프로젝트 상태 done 처리 → "Done" 탭에만 표시
8. 새로고침 → 전체 상태 복원

---

## 11. 결정 사항 (Locked — Codex v1 반영)

1. 파일 구조 `pages/` + `editor/` 분리
2. 라우팅 `/p/:projectId/c/:canvasId`
3. 썸네일은 4A에서 placeholder (색·이름·메타만). 진짜 썸네일은 **4C 별도 단계** (4B scope가 아님)
4. 프로젝트 생성 시 Canvas 1 자동 생성 — **원자적** (실패 시 project 생성도 rollback)
5. 삭제는 soft-delete (`deletedAt`) 필드로 기록. UX는 `window.confirm()`

---

## 12. 리스크 & 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| 라우터 도입으로 기존 동작 깨짐 | 높음 | Day 2 끝에 스모크 필수 |
| 캔버스 전환 시 상태 누수 (zundo + wizard + feedback) | 높음 | `CanvasSession` 패턴 + Day 4 전용 |
| Auto-save race | 높음 | epoch + activeCanvasIdRef 가드 (Day 5) |
| AI chat async landing on wrong canvas | 중간 | epoch 가드 (Day 5) |
| localStorage quota 초과 | 중간 | 경고 토스트, 4B에서 해결 |
| 4B 이행 시 데이터 모델 확장 부담 | 낮음 | schemaVersion + ownerId 등 지금부터 포함 |

---

## 13. 다음 단계

1. Codex 리뷰 #2 — v3 수정분 확인
2. 반영 후 Day 1 착수
