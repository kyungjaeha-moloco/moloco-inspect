# Playground Comment UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playground 의 코멘트 UX 를 5 phase 에 걸쳐 통합/개선 — 단축키 + 코멘트→iframe 활성화 + Molly 통합 + Chat inline + Stale archive + server-side 영구성/공유.

**Architecture:** 기존 pin-store (localStorage) + LivePreview / AIPanel 의 코멘트 분기를 phase 별로 점진 개선. Phase 1-4 는 client-side, Phase 5 에서 orchestrator API 추가로 server-side 영구성/공유.

**Tech Stack:** React + Zustand (pin-store), iframe bridge (LivePreview), Node.js orchestrator (Phase 5).

---

## Phase 분할

| Phase | 작업 | 추정 |
|---|---|---|
| 1 | 단축키 + 코멘트 클릭→iframe 활성화 + 답글 inline 정비 | 0.5d |
| 2 | 코멘트→Molly 작업 변환 | 0.5d |
| 3 | Chat 스트림 inline 코멘트 카드 | 0.5d |
| 4 | Stale 자동 archive | 0.25d |
| 5 | Server-side 영구성/공유 (localStorage → orchestrator API) | 1d |

**합계:** ~2.75d.

---

## 파일 변경 개요

| Phase | 파일 | 변경 |
|---|---|---|
| 1 | `playground-app/src/editor/LivePreview.tsx` | 'C' 단축키 → mode 토글. 코멘트 commit 후 자동 mode='interactive'. selectedPinId 받아 해당 pin 시각 강조 (펄스). |
| 1 | `playground-app/src/store/pin-store.ts` | `selectedPinId: string \| null` 신규 state + `selectPin(id)`. `activatePin(id)` 액션 — selectPin 후 LivePreview 가 picker 위치로 scroll. |
| 1 | `playground-app/src/editor/AIPanel.tsx` | CommentRow 클릭 → `activatePin(pin.id)` 호출 + route 다르면 iframe navigate. 답글 inline 입력 (현재 modal/expand 인지 확인 후). |
| 1 | `playground-app/src/services/iframe-bridge.ts` (또는 동등) | 'C' key 단축키 listener 추가 (window keydown). 기존 ESC 패턴 따라. |
| 2 | `AIPanel.tsx`: `CommentRow` | "🤖 Molly 에 작업 요청" 버튼 — 코멘트 텍스트 + 핀 위치 + element label 합쳐 chat 으로 sendPrompt. |
| 3 | `AIPanel.tsx`: `Chat` 렌더 | message stream 에 inline `CommentInlineCard` (pin 핵심 정보 요약 + 클릭 시 Comments 탭 전환 + activatePin). 시간순 mix. |
| 4 | `AIPanel.tsx`: `CommentsList` | 분류: active / archived (stale & resolved old). Archive 섹션 collapse 가능. |
| 4 | `pin-store.ts` | `isStaleAndOld(pin, headSha)` derived selector — sha 다르고 createdAt 7일 이상 → archived. |
| 5 | `orchestrator/lib/pins.js` (신규) | server-side pin store (in-memory + JSON file). CRUD: list / create / update / delete / addReply / updateReply / deleteReply. |
| 5 | `orchestrator/server.js` | `/api/playground/:id/pins` (GET/POST), `/api/playground/:id/pins/:pinId` (PATCH/DELETE), `/api/playground/:id/pins/:pinId/replies` (POST), `/api/playground/:id/pins/:pinId/replies/:replyId` (PATCH/DELETE) |
| 5 | `playground-app/src/services/orchestrator-client.ts` | `pinClient` — fetch CRUD wrappers. |
| 5 | `pin-store.ts` | localStorage → orchestrator API. Optimistic update + server sync + reconcile. |

---

## Phase 1 — 단축키 + iframe 활성화 + 답글 정비

### Task 1.1: pin-store 에 selectedPinId state

**Files:**
- Modify: `playground-app/src/store/pin-store.ts`

- [ ] **Step 1: state + actions 추가**

기존 store interface 에 추가:

```typescript
// pin-store.ts 의 PinStore interface 안
selectedPinId: string | null;
selectPin(id: string | null): void;
```

initial state 에 `selectedPinId: null`. setter 에:

```typescript
selectPin: (id) => set({ selectedPinId: id }),
```

- [ ] **Step 2: TS check**

```bash
cd playground-app && pnpm tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: commit**

```bash
git add playground-app/src/store/pin-store.ts
git commit -m "feat(pin-store): selectedPinId state — comment row 와 iframe 핀 연결"
```

### Task 1.2: LivePreview — selectedPinId 시각 강조

**Files:**
- Modify: `playground-app/src/editor/LivePreview.tsx`

- [ ] **Step 1: store 에서 selectedPinId 구독**

LivePreview 의 store hook 호출 부근 (line ~126 의 `lastPickedElement` 옆) 에:

```typescript
const selectedPinId = usePinStore((s) => s.selectedPinId);
const selectPin = usePinStore((s) => s.selectPin);
```

- [ ] **Step 2: 핀 렌더링에 active 표시**

핀 렌더 부분 (line 491 부근 PinComment 컴포넌트). 해당 컴포넌트에 `isActive: boolean` prop 추가 + 받아서 시각 강조:

```typescript
// PinComment 컴포넌트 props 확장 + style 분기
{isActive && (
  <div
    style={{
      position: 'absolute',
      inset: -6,
      borderRadius: '50%',
      border: '2px solid var(--accent)',
      animation: 'pin-pulse 1.2s ease-in-out 2',
    }}
  />
)}
```

CSS keyframes 정의 (CSS module / global style 어디든 — 기존 패턴 따라):

```css
@keyframes pin-pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.15); }
}
```

LivePreview 의 핀 map 에서 각 핀에 `isActive={pin.id === selectedPinId}` 전달.

- [ ] **Step 3: 자동 선택 해제 — Escape 또는 일정 시간 후**

```typescript
// LivePreview 안 useEffect
useEffect(() => {
  if (!selectedPinId) return;
  // 4초 후 자동 deselect (펄스 끝나고 highlight 유지하다 떨어짐)
  const timer = setTimeout(() => selectPin(null), 4000);
  return () => clearTimeout(timer);
}, [selectedPinId, selectPin]);
```

- [ ] **Step 4: TS check + commit**

```bash
cd playground-app && pnpm tsc --noEmit && cd .. && \
git add playground-app/src/editor/LivePreview.tsx && \
git commit -m "feat(playground): selectedPinId 시각 강조 — 펄스 애니메이션 + 자동 해제"
```

### Task 1.3: CommentRow 클릭 → activatePin + iframe navigate

**Files:**
- Modify: `playground-app/src/editor/AIPanel.tsx`

- [ ] **Step 1: CommentRow 에 onClick + activatePin 호출**

CommentRow 컴포넌트 (line 1684+) 의 root div 에 `onClick`:

```typescript
const selectPin = usePinStore((s) => s.selectPin);
const requestIframeNav = /* 기존 함수 — JobCard 에서 사용 중. 동일하게 import 또는 전역 */;
// ...
<div
  style={{ ...existingStyle, cursor: 'pointer' }}
  onClick={() => {
    // 1) iframe 이 다른 route 면 nav
    if (pin.route && pin.route !== currentRoute) {
      requestIframeNav(pin.route);
    }
    // 2) pin 시각 강조 트리거 (자동 4s 후 해제)
    selectPin(pin.id);
  }}
>
```

CommentRow 에 prop `currentRoute: string | null` 추가하고 부모 CommentsList 가 전달.

- [ ] **Step 2: 답글 inline 입력 (이미 inline 이면 skip)**

기존 답글 UX 가 modal 인지 inline 인지 확인:
```bash
grep -n "addReply\|onAddReply\|composeOpen\|Reply" playground-app/src/editor/AIPanel.tsx | head -10
```
inline 이면 Enter 로 submit + placeholder 명확. modal 이면 inline 으로 전환 (textarea 항상 표시).

- [ ] **Step 3: TS check + commit**

```bash
cd playground-app && pnpm tsc --noEmit && cd .. && \
git add playground-app/src/editor/AIPanel.tsx && \
git commit -m "feat(playground): 코멘트 row 클릭 → iframe activate (nav + pin 강조)"
```

### Task 1.4: 'C' 단축키 + 자동 interactive 복귀

**Files:**
- Modify: `playground-app/src/editor/LivePreview.tsx`

- [ ] **Step 1: 'C' keydown listener — comment mode 토글**

LivePreview 안 useEffect (또는 PlaygroundDetail 같은 상위) 에 추가:

```typescript
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'c' && e.key !== 'C') return;
    // 입력 필드 안에서는 skip (텍스트 입력 자유)
    const t = e.target as HTMLElement | null;
    if (t?.tagName === 'TEXTAREA' || t?.tagName === 'INPUT' || t?.isContentEditable) return;
    e.preventDefault();
    setMode(mode === 'comment' ? 'interactive' : 'comment');
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [mode, setMode]);
```

`setMode` / `mode` 는 LivePreview 의 mode store hook 따라.

- [ ] **Step 2: 코멘트 commit 후 자동 interactive 복귀**

pin 생성 (PinComment 작성 후 Save / Enter) 콜백 안에서:

```typescript
// pin add 후 즉시
setMode('interactive');
```

위치 — 기존 pin 작성 폼의 onSubmit / onSave 부근. grep 으로 찾기:
```bash
grep -n "addPin\|createPin\|onSave.*pin\|composeOpen" playground-app/src/editor/LivePreview.tsx | head
```

- [ ] **Step 3: 단축키 안내 — Pin 모드 진입 시 toast / hint**

LivePreview 의 mode='comment' 진입 시 small hint banner:
```typescript
{mode === 'comment' && (
  <div style={{position:'absolute', top:8, left:8, fontSize:11, padding:'4px 8px', background:'var(--bg-elevated)', borderRadius:4, color:'var(--text-secondary)'}}>
    📍 Comment mode — C / ESC 키로 종료
  </div>
)}
```

- [ ] **Step 4: TS check + commit**

```bash
cd playground-app && pnpm tsc --noEmit && cd .. && \
git add playground-app/src/editor/LivePreview.tsx && \
git commit -m "feat(playground): 'C' 단축키 코멘트 모드 토글 + commit 후 자동 interactive 복귀"
```

---

## Phase 2 — 코멘트 → Molly 작업 변환

### Task 2.1: CommentRow 에 "Molly 에 작업 요청" 버튼

**Files:**
- Modify: `playground-app/src/editor/AIPanel.tsx`

- [ ] **Step 1: 버튼 추가 + onClick**

CommentRow footer 에 추가:

```typescript
const sendPrompt = /* AIPanel 의 sendPrompt — props 로 받거나 store hook */;
// ...
<button
  type="button"
  onClick={(e) => {
    e.stopPropagation(); // row onClick (activatePin) 과 충돌 방지
    const prdLines = [
      pin.text ? `요청: ${pin.text}` : '코멘트 내용 없음',
      pin.element?.label ? `대상: ${pin.element.label}` : '',
      pin.route ? `Route: ${pin.route}` : '',
      pin.element?.file ? `파일: ${pin.element.file}` : '',
    ].filter(Boolean);
    const prd = prdLines.join('\n');
    void sendPrompt(prd);
  }}
  style={secondaryBtnSmallStyle}
  title="이 코멘트를 PRD 로 변환해 Molly 에게 작업 요청"
>
  🤖 Molly 에 작업 요청
</button>
```

`sendPrompt` 가 CommentRow 까지 prop drilling 필요 — CommentsList → CommentRow → button. AIPanel 의 sendPrompt 를 CommentsList prop 으로 전달.

- [ ] **Step 2: 자동 Chat 탭 전환 + element 컨텍스트 연결**

sendPrompt 호출 직전:
```typescript
setActiveTab('chat'); // 사용자가 Chat 탭으로 가서 결과 봄
if (pin.element) {
  setLastPickedElement(pin.element); // 핀 element 가 있으면 자동으로 SELECTED ELEMENT 로 세팅
}
```

- [ ] **Step 3: TS check + commit**

```bash
cd playground-app && pnpm tsc --noEmit && cd .. && \
git add playground-app/src/editor/AIPanel.tsx && \
git commit -m "feat(playground): 코멘트 → Molly 작업 요청 — PRD 변환 + Chat 탭 자동 전환"
```

---

## Phase 3 — Chat 스트림 inline 코멘트 카드

### Task 3.1: CommentInlineCard 컴포넌트 + chat stream 통합

**Files:**
- Modify: `playground-app/src/editor/AIPanel.tsx`

- [ ] **Step 1: CommentInlineCard 컴포넌트 추가**

CommentRow 옆에 mini 버전. AIPanel.tsx 안:

```typescript
function CommentInlineCard({
  pin,
  onActivate,
  onSendToMolly,
}: {
  pin: PinComment;
  onActivate: () => void;
  onSendToMolly: () => void;
}) {
  return (
    <div
      style={{
        padding: '8px 10px',
        background: 'var(--bg-secondary)',
        borderLeft: '3px solid var(--accent)',
        borderRadius: 4,
        fontSize: 12,
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        cursor: 'pointer',
      }}
      onClick={onActivate}
      title="클릭해서 iframe 에서 위치 확인"
    >
      <span style={{ fontSize: 14 }}>💬</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>
          {pin.text || '(내용 없음)'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
          {pin.element?.label || pin.route || `(${pin.x}, ${pin.y})`} · {formatWhen(pin.createdAt)}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onSendToMolly(); }}
        style={{ fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}
        title="Molly 에 작업 요청"
      >
        🤖
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Chat 스트림 빌더에 핀 mix-in**

messages render 부분 (line 950 근처) 에서 messages 와 pins 를 시간순 mix:

```typescript
// Chat 탭 활성 시 — messages + pins 를 createdAt 기준 정렬 후 mix
const pinsForThread = usePinStore((s) => s.pins.filter(p => p.playgroundId === playgroundId));
const stream = useMemo(() => {
  const items: Array<
    | { kind: 'message'; createdAt: number; data: ChatMessage }
    | { kind: 'pin'; createdAt: number; data: PinComment }
  > = [
    ...messages.map((m) => ({ kind: 'message' as const, createdAt: m.createdAt ?? 0, data: m })),
    ...pinsForThread.map((p) => ({ kind: 'pin' as const, createdAt: p.createdAt, data: p })),
  ];
  items.sort((a, b) => a.createdAt - b.createdAt);
  return items;
}, [messages, pinsForThread, playgroundId]);
```

render switch:
```jsx
{stream.map((item) => item.kind === 'message' ? (
  <MessageRow key={item.data.id} message={item.data} ... />
) : (
  <CommentInlineCard key={item.data.id} pin={item.data}
    onActivate={() => { selectPin(item.data.id); }}
    onSendToMolly={() => { /* 동일 Phase 2 로직 */ }}
  />
))}
```

- [ ] **Step 3: TS check + commit**

```bash
cd playground-app && pnpm tsc --noEmit && cd .. && \
git add playground-app/src/editor/AIPanel.tsx && \
git commit -m "feat(playground): Chat 스트림에 코멘트 inline 카드 mix-in (시간순)"
```

---

## Phase 4 — Stale 자동 archive

### Task 4.1: pin-store 의 stale 분류 + CommentsList archive 섹션

**Files:**
- Modify: `playground-app/src/store/pin-store.ts`
- Modify: `playground-app/src/editor/AIPanel.tsx`

- [ ] **Step 1: pin-store 에 stale 판정 helper**

```typescript
// pin-store.ts
const STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7일
export function isPinStale(pin: PinComment, headSha: string | null): boolean {
  if (!pin.commitSha || !headSha) return false;
  if (pin.commitSha === headSha) return false;
  const age = Date.now() - pin.createdAt;
  return age > STALE_AGE_MS;
}
```

- [ ] **Step 2: CommentsList 분류 + archive 섹션**

CommentsList 안:
```typescript
const { active, archived } = useMemo(() => {
  const out = { active: [] as PinComment[], archived: [] as PinComment[] };
  for (const p of pins) {
    if (isPinStale(p, headCommitSha) || (!!p.resolvedAt && (Date.now() - p.resolvedAt) > STALE_AGE_MS)) {
      out.archived.push(p);
    } else {
      out.active.push(p);
    }
  }
  return out;
}, [pins, headCommitSha]);

const [archivedOpen, setArchivedOpen] = useState(false);
```

render:
```jsx
{active.map(...)}
{archived.length > 0 && (
  <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 8 }}>
    <button
      onClick={() => setArchivedOpen((v) => !v)}
      style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
    >
      {archivedOpen ? '▾' : '▸'} Archived ({archived.length})
    </button>
    {archivedOpen && archived.map(...)}
  </div>
)}
```

- [ ] **Step 3: TS check + commit**

```bash
cd playground-app && pnpm tsc --noEmit && cd .. && \
git add playground-app/src/store/pin-store.ts playground-app/src/editor/AIPanel.tsx && \
git commit -m "feat(playground): stale 코멘트 자동 archive 섹션 — sha 다르고 7일 경과"
```

---

## Phase 5 — Server-side 영구성/공유

### Task 5.1: orchestrator pins.js 모듈

**Files:**
- Create: `orchestrator/lib/pins.js`

- [ ] **Step 1: 모듈 생성**

```javascript
// orchestrator/lib/pins.js
// Pin (comment) CRUD store. In-memory + JSON file 영구화.
// 파일 경로: orchestrator/state/pins-<playgroundId>.json
// 모든 작업이 동기 (read on demand, write on mutate).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(__dirname, '..', 'state');

function fileFor(playgroundId) {
  return path.join(STATE_DIR, `pins-${playgroundId}.json`);
}

function load(playgroundId) {
  try {
    const raw = fs.readFileSync(fileFor(playgroundId), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(playgroundId, pins) {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(fileFor(playgroundId), JSON.stringify(pins, null, 2));
  } catch (err) {
    console.warn(`[pins] save failed for ${playgroundId}: ${err.message}`);
  }
}

export function listPins(playgroundId) {
  return load(playgroundId);
}

export function createPin(playgroundId, pin) {
  const pins = load(playgroundId);
  pins.push(pin);
  save(playgroundId, pins);
  return pin;
}

export function updatePin(playgroundId, pinId, patch) {
  const pins = load(playgroundId);
  const idx = pins.findIndex((p) => p.id === pinId);
  if (idx === -1) return null;
  pins[idx] = { ...pins[idx], ...patch, updatedAt: Date.now() };
  save(playgroundId, pins);
  return pins[idx];
}

export function deletePin(playgroundId, pinId) {
  const pins = load(playgroundId).filter((p) => p.id !== pinId);
  save(playgroundId, pins);
}

export function addReply(playgroundId, pinId, reply) {
  const pins = load(playgroundId);
  const pin = pins.find((p) => p.id === pinId);
  if (!pin) return null;
  pin.replies = pin.replies || [];
  pin.replies.push(reply);
  pin.updatedAt = Date.now();
  save(playgroundId, pins);
  return reply;
}

export function updateReply(playgroundId, pinId, replyId, patch) {
  const pins = load(playgroundId);
  const pin = pins.find((p) => p.id === pinId);
  if (!pin?.replies) return null;
  const idx = pin.replies.findIndex((r) => r.id === replyId);
  if (idx === -1) return null;
  pin.replies[idx] = { ...pin.replies[idx], ...patch, updatedAt: Date.now() };
  pin.updatedAt = Date.now();
  save(playgroundId, pins);
  return pin.replies[idx];
}

export function deleteReply(playgroundId, pinId, replyId) {
  const pins = load(playgroundId);
  const pin = pins.find((p) => p.id === pinId);
  if (!pin?.replies) return;
  pin.replies = pin.replies.filter((r) => r.id !== replyId);
  pin.updatedAt = Date.now();
  save(playgroundId, pins);
}
```

- [ ] **Step 2: node check**

```bash
node --check orchestrator/lib/pins.js
```
Expected: exit 0.

- [ ] **Step 3: commit**

```bash
git add orchestrator/lib/pins.js
git commit -m "feat(pins): server-side pin store — JSON 영구화 + CRUD"
```

### Task 5.2: server.js endpoint 추가

**Files:**
- Modify: `orchestrator/server.js`

- [ ] **Step 1: REST endpoint 추가**

기존 endpoint 패턴 (예: /api/molly/cost) 근처에 추가:

```javascript
// Pin (comment) CRUD — Playground 의 코멘트 영구화 + 다중 사용자 공유
if (pathname.match(/^\/api\/playground\/[^/]+\/pins$/) && req.method === 'GET') {
  const playgroundId = pathname.split('/')[3];
  const { listPins } = await import('./lib/pins.js');
  return json(res, 200, { ok: true, pins: listPins(playgroundId) });
}
if (pathname.match(/^\/api\/playground\/[^/]+\/pins$/) && req.method === 'POST') {
  const playgroundId = pathname.split('/')[3];
  const payload = await parseBody(req);
  const { createPin } = await import('./lib/pins.js');
  return json(res, 200, { ok: true, pin: createPin(playgroundId, payload) });
}
if (pathname.match(/^\/api\/playground\/[^/]+\/pins\/[^/]+$/) && req.method === 'PATCH') {
  const [, , , playgroundId, , pinId] = pathname.split('/');
  const payload = await parseBody(req);
  const { updatePin } = await import('./lib/pins.js');
  const pin = updatePin(playgroundId, pinId, payload);
  if (!pin) return json(res, 404, { ok: false, error: 'pin not found' });
  return json(res, 200, { ok: true, pin });
}
if (pathname.match(/^\/api\/playground\/[^/]+\/pins\/[^/]+$/) && req.method === 'DELETE') {
  const [, , , playgroundId, , pinId] = pathname.split('/');
  const { deletePin } = await import('./lib/pins.js');
  deletePin(playgroundId, pinId);
  return json(res, 200, { ok: true });
}
if (pathname.match(/^\/api\/playground\/[^/]+\/pins\/[^/]+\/replies$/) && req.method === 'POST') {
  const [, , , playgroundId, , pinId] = pathname.split('/');
  const payload = await parseBody(req);
  const { addReply } = await import('./lib/pins.js');
  const reply = addReply(playgroundId, pinId, payload);
  if (!reply) return json(res, 404, { ok: false, error: 'pin not found' });
  return json(res, 200, { ok: true, reply });
}
if (pathname.match(/^\/api\/playground\/[^/]+\/pins\/[^/]+\/replies\/[^/]+$/) && req.method === 'PATCH') {
  const [, , , playgroundId, , pinId, , replyId] = pathname.split('/');
  const payload = await parseBody(req);
  const { updateReply } = await import('./lib/pins.js');
  const reply = updateReply(playgroundId, pinId, replyId, payload);
  if (!reply) return json(res, 404, { ok: false, error: 'reply not found' });
  return json(res, 200, { ok: true, reply });
}
if (pathname.match(/^\/api\/playground\/[^/]+\/pins\/[^/]+\/replies\/[^/]+$/) && req.method === 'DELETE') {
  const [, , , playgroundId, , pinId, , replyId] = pathname.split('/');
  const { deleteReply } = await import('./lib/pins.js');
  deleteReply(playgroundId, pinId, replyId);
  return json(res, 200, { ok: true });
}
```

- [ ] **Step 2: smoke test**

```bash
curl -s 'http://localhost:3847/api/playground/test-pg/pins' | python3 -m json.tool
```
Expected: `{"ok": true, "pins": []}`.

```bash
curl -s -X POST 'http://localhost:3847/api/playground/test-pg/pins' \
  -H 'Content-Type: application/json' \
  -d '{"id":"smoke-1","text":"hi","x":50,"y":50,"createdAt":1735000000000}' | python3 -m json.tool
```
Expected: `{"ok": true, "pin": {...}}`.

- [ ] **Step 3: commit**

```bash
git add orchestrator/server.js
git commit -m "feat(pins): /api/playground/:id/pins endpoint — CRUD + replies"
```

### Task 5.3: orchestrator-client + pin-store 통합

**Files:**
- Modify: `playground-app/src/services/orchestrator-client.ts`
- Modify: `playground-app/src/store/pin-store.ts`

- [ ] **Step 1: pinClient fetch helpers**

orchestrator-client.ts 에 추가:

```typescript
export const pinClient = {
  list: async (playgroundId: string) => {
    const r = await fetch(`${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/pins`);
    const body = await r.json();
    return Array.isArray(body?.pins) ? (body.pins as PinComment[]) : [];
  },
  create: async (playgroundId: string, pin: PinComment) => {
    const r = await fetch(`${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/pins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pin),
    });
    const body = await r.json();
    if (!r.ok || body.ok === false) throw new Error(body.error || `HTTP ${r.status}`);
    return body.pin as PinComment;
  },
  update: async (playgroundId: string, pinId: string, patch: Partial<PinComment>) => {
    const r = await fetch(`${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/pins/${encodeURIComponent(pinId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const body = await r.json();
    if (!r.ok || body.ok === false) throw new Error(body.error || `HTTP ${r.status}`);
    return body.pin as PinComment;
  },
  delete: async (playgroundId: string, pinId: string) => {
    const r = await fetch(`${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/pins/${encodeURIComponent(pinId)}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  },
  addReply: async (playgroundId: string, pinId: string, reply: Reply) => {
    const r = await fetch(`${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/pins/${encodeURIComponent(pinId)}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reply),
    });
    const body = await r.json();
    if (!r.ok || body.ok === false) throw new Error(body.error || `HTTP ${r.status}`);
    return body.reply as Reply;
  },
  updateReply: async (playgroundId: string, pinId: string, replyId: string, patch: Partial<Reply>) => {
    const r = await fetch(`${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/pins/${encodeURIComponent(pinId)}/replies/${encodeURIComponent(replyId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const body = await r.json();
    if (!r.ok || body.ok === false) throw new Error(body.error || `HTTP ${r.status}`);
    return body.reply as Reply;
  },
  deleteReply: async (playgroundId: string, pinId: string, replyId: string) => {
    const r = await fetch(`${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/pins/${encodeURIComponent(pinId)}/replies/${encodeURIComponent(replyId)}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  },
};
```

- [ ] **Step 2: pin-store 가 server 와 sync**

pin-store.ts 의 모든 mutating action (addPin / updatePinText / deletePin / addReply / updateReplyText / deleteReply / toggleResolved):
- optimistic update (local state 변경)
- pinClient 호출 (background)
- 실패 시 console.warn (UX 는 계속 — 잠시 후 sync 가 정정)

추가로 component mount 시 (또는 playgroundId 변경 시) `pinClient.list(playgroundId)` 로 server 와 sync:
```typescript
// pin-store 또는 CommentsList 안 useEffect
useEffect(() => {
  if (!playgroundId) return;
  pinClient.list(playgroundId).then((serverPins) => {
    // server 값으로 local state 치환 (localStorage 는 fallback)
    set({ pins: serverPins });
  }).catch((err) => console.warn('[pin-store] server sync failed', err));
}, [playgroundId]);
```

- [ ] **Step 3: TS check + smoke**

```bash
cd playground-app && pnpm tsc --noEmit
```

수동 smoke: 코멘트 작성 → orchestrator restart → 코멘트 그대로 보임 (server 영구화 확인).

- [ ] **Step 4: commit**

```bash
git add playground-app/src/services/orchestrator-client.ts playground-app/src/store/pin-store.ts && \
git commit -m "feat(pins): pin-store server-side sync — localStorage fallback + optimistic update"
```

---

## 검증 (Phase 전체 끝난 후 수동)

1. **단축키**: 'C' → comment mode → click → 텍스트 저장 → 자동 interactive ✓
2. **코멘트 클릭 → iframe**: 다른 route 면 nav, 같은 route 면 pin 위치로 pulse highlight ✓
3. **Molly 통합**: comment row 의 🤖 버튼 → Chat 탭 전환 + PRD 자동 입력 ✓
4. **Chat inline**: chat 스트림에 시간순 mix ✓
5. **Stale archive**: HEAD sha 다르고 7일 경과 → archived 섹션 collapse ✓
6. **Server-side**: orchestrator 재시작 → 코멘트 그대로, 다른 브라우저에서 동시 보기 ✓

## 알려진 한계

- **server-side migration**: 기존 localStorage 핀들은 자동 migration 안 함 — 새 작성부터만 server 에 저장. (간단함, 회귀 위험 X)
- **Multi-user concurrent edit**: 두 사용자 동시 edit 시 last-write-wins (CRDT / OT 아님). 운영 충돌 빈도 측정 후 결정.
- **답글 inline UX**: 정비 정도. 큰 디자인 변경은 별 슬라이스.
- **Iframe navigate**: requestIframeNav 가 cross-origin 일 때 동작 안 할 수 있음 (LivePreview 의 iframe bridge 가 same-origin 보장 시만).

## Backout

- 각 Phase 독립 — phase 별 commit revert 가능.
- Phase 5 (server) 만 backout 시: pin-store 다시 localStorage 만. orchestrator endpoint 남겨둬도 무해.

---

**개정 이력**: 초판 2026-05-11.
