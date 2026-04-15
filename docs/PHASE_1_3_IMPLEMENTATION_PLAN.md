# Implementation Plan — Phase 1 & 3

> Durable Workflow + Container Reuse
> Author: Kyungjae Ha | Date: 2026-04-15
> Reviewed by: Codex (adversarial review feedback incorporated)

---

## Overview

| Phase | 이름 | 한 줄 요약 | 기간 |
|-------|------|-----------|------|
| 1 | Durable Workflow | 끊겨도 안 날아가게 | 3일 |
| 3 | Container Reuse | 다시 해달라고 할 때 처음부터 안 하게 | 1일 |
| | | **합계** | **4일** |

### 체감 효과

| 지금 | Phase 1 이후 | Phase 3 이후 |
|------|-------------|-------------|
| 탭 닫으면 진행 상태 사라짐 | 다시 열면 이어서 보임 | - |
| 서버 재시작하면 진행 중 요청 유실 | DB에서 복원 | - |
| Request Changes → 30초+ 대기 | - | ~1초 재시작 |

---

## Phase 1: Durable Workflow

### 목표

파이프라인의 모든 단계를 DB에 기록하고, 브라우저 재접속 시 이전 상태를 이어서 보여준다.

---

### Day 1: 파이프라인 단계 분리

#### 문제

`runPipeline()`(server.js:824)이 200줄짜리 하나의 async 함수. 중간에 실패하면 어디서 죽었는지 알 수 없고, 부분 재시도가 불가능하다.

#### 작업

**새 파일 생성:**

```
orchestrator/
├── pipeline/
│   ├── steps.js      ← 7개 단계 함수
│   └── runner.js     ← 단계별 실행기
```

**`orchestrator/pipeline/steps.js`** — 7개 독립 함수 추출:

| 함수 | 원래 위치 (server.js) | 하는 일 |
|------|---------------------|---------|
| `stepCreateSandbox()` | L824-860 | Docker 컨테이너 생성, 포트 할당 |
| `stepSyncSource()` | L897-910 | 소스 코드 tar 복사, git baseline |
| `stepRunAgent()` | L862-876 | AI 에이전트 실행, diff 생성 |
| `stepCollectDiff()` | L878-892 | git diff 추출, 변경 파일 목록 |
| `stepValidate()` | L919-925 | TypeScript 타입체크 |
| `stepSetupPreview()` | L927-1046 | 인증 주입, Vite 시작, 스크린샷 |
| `stepPreviewReady()` | L1100-1110 | 상태 업데이트, PM 리뷰 준비 |

각 함수의 인터페이스:

```javascript
// 모든 step은 동일한 시그니처
async function stepCreateSandbox(ctx) {
  // ctx = { requestId, state, db, appendLog }
  // 작업 수행
  // 결과 반환
  return { containerId, vitePort, openCodePort };
}
```

**`orchestrator/pipeline/runner.js`** — 단계별 실행기:

```javascript
const STEP_ORDER = [
  'create_sandbox',
  'sync_source',
  'run_agent',
  'collect_diff',
  'validate',
  'setup_preview',
  'preview_ready',
];

async function runFromStep(requestId, startStep = 'create_sandbox') {
  const startIdx = STEP_ORDER.indexOf(startStep);

  for (let i = startIdx; i < STEP_ORDER.length; i++) {
    const stepName = STEP_ORDER[i];
    const stepFn = STEP_FUNCTIONS[stepName];

    db.startStep(requestId, stepName);
    try {
      const result = await stepFn(ctx);
      db.completeStep(requestId, stepName, result);
    } catch (error) {
      db.failStep(requestId, stepName, error.message);
      throw error;
    }
  }
}
```

**`orchestrator/server.js` 변경:**

```javascript
// 변경 전
async function runPipeline(id) {
  // ... 200줄의 모놀리식 코드
}

// 변경 후
async function runPipeline(id) {
  await runFromStep(id, 'create_sandbox');
}
```

#### 검증

- 기존과 동일하게 파이프라인이 작동하는지 E2E 테스트
- 각 단계 사이에 로그가 찍히는지 확인

---

### Day 2: SQLite 저장소

#### 문제

상태가 JSON 파일(`orchestrator/state/*.json`)에 저장됨. 서버 재시작 시 sandbox 정보 유실, 검색/필터 불가.

#### 작업

**새 파일 생성:**

```
orchestrator/
├── db/
│   └── sqlite.js     ← SQLite 어댑터
```

**의존성 추가:**

```json
// orchestrator/package.json
"dependencies": {
  "better-sqlite3": "^9.0.0"
}
```

**DB 스키마** (Codex 피드백 반영 — 실행 상태 포함):

```sql
-- ═══════════════════════════════════════
-- requests: 요청 전체 상태
-- ═══════════════════════════════════════
CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  phase TEXT NOT NULL DEFAULT 'queued',
  payload JSON,

  -- 실행 상태 (Codex: "이것들이 없으면 진짜 재개 불가")
  container_id TEXT,
  vite_port INTEGER,
  opencode_port INTEGER,
  auth_tokens JSON,           -- {idToken, wpToken, wpId}
  screenshot_path TEXT,
  preview_url TEXT,
  live_preview_url TEXT,
  diff TEXT,
  changed_files JSON,
  pr_url TEXT,
  error TEXT,

  -- 메타
  iteration_count INTEGER DEFAULT 0,
  sandbox_expired BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════
-- steps: 파이프라인 단계별 결과
-- ═══════════════════════════════════════
CREATE TABLE steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed
  result JSON,
  error TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  FOREIGN KEY (request_id) REFERENCES requests(id)
);

CREATE INDEX idx_steps_request ON steps(request_id, step_name);

-- ═══════════════════════════════════════
-- sse_events: 재연결용 이벤트 로그
-- ═══════════════════════════════════════
CREATE TABLE sse_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  event_type TEXT,            -- log, phase_change, error, complete
  event_data JSON,
  seq INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sse_request_seq ON sse_events(request_id, seq);
```

**`orchestrator/db/sqlite.js` 주요 함수:**

```javascript
module.exports = {
  // 초기화
  init(),                              // 테이블 생성, WAL 모드

  // 요청 관리
  createRequest(id, payload),
  updateRequest(id, updates),
  getRequest(id),
  listRequests({ status, limit }),

  // 단계 관리
  startStep(requestId, stepName),
  completeStep(requestId, stepName, result),
  failStep(requestId, stepName, error),
  getCompletedSteps(requestId),
  getLastCompletedStep(requestId),

  // SSE 이벤트
  appendEvent(requestId, type, data),
  getEventsSince(requestId, cursor),

  // 마이그레이션 (기존 JSON → SQLite)
  migrateFromJsonFiles(stateDir),
};
```

**마이그레이션 전략 — 이중 저장:**

```javascript
// server.js의 updateRequest()에서:
function updateRequest(id, updates) {
  // 1. 기존 메모리 Map 업데이트 (현재 방식 유지)
  Object.assign(state, updates);

  // 2. SQLite에도 저장 (새로 추가)
  if (process.env.USE_SQLITE !== 'false') {
    db.updateRequest(id, updates);
  }

  // 3. JSON 파일도 저장 (안전망 — 나중에 제거)
  persistState(id);
}
```

**서버 시작 시 복원:**

```javascript
// 시작 순서:
// 1. SQLite에서 읽기 시도
// 2. 없으면 JSON 파일에서 읽기 (레거시)
// 3. JSON에서 읽은 데이터는 SQLite에 마이그레이션
```

#### 검증

- 서버 시작 → 요청 보내기 → 서버 재시작 → DB에서 요청 복원되는지
- `orchestrator/inspect.db` 파일 생성 확인
- 기존 JSON 파일도 여전히 생성되는지 (이중 저장)

---

### Day 3: SSE 재연결

#### 문제

`GET /api/events/:id`가 접속 시점 이후 이벤트만 전송. 탭 닫았다 열면 이전 진행 상태를 볼 수 없음.

#### 현재 SSE 핸들러 (server.js ~L1957):

```javascript
// 현재: 새 이벤트만 push
res.write(`data: ${event}\n\n`);
```

#### 변경:

```javascript
// GET /api/events/:id?cursor=0
//
// 1. cursor 이전 이벤트: DB에서 읽어서 즉시 전송 (replay)
// 2. cursor 이후: 실시간 push (기존 방식)

const cursor = parseInt(url.searchParams.get('cursor') || '0');

// Step 1: Replay — DB에서 이전 이벤트 전송
const pastEvents = db.getEventsSince(id, cursor);
for (const evt of pastEvents) {
  res.write(`id: ${evt.seq}\ndata: ${JSON.stringify(evt.event_data)}\n\n`);
}

// Step 2: Live — 새 이벤트 실시간 push
sseClients.get(id)?.add(res);
```

**클라이언트 변경 (Chrome Extension + Inspect Hub):**

```javascript
// EventSource 재연결 시 마지막 받은 seq 전달
const eventSource = new EventSource(`/api/events/${id}?cursor=${lastSeq}`);
eventSource.onmessage = (e) => {
  lastSeq = parseInt(e.lastEventId) || lastSeq + 1;
  // ... 이벤트 처리
};
```

#### 변경할 파일

| 파일 | 변경 |
|------|------|
| `orchestrator/server.js` | SSE 핸들러에 cursor 파라미터 + DB replay |
| `chrome-extension/sidepanel.js` | EventSource에 cursor 전달 |
| `dashboard/src/pages/RequestDetailPage.tsx` | EventSource에 cursor 전달 |

#### 검증

1. 요청 보내기 → 파이프라인 진행 중 탭 닫기
2. 다시 열기 → 이전 로그 + 현재 상태 이어서 표시되는지
3. 서버 재시작 후 → 과거 요청의 로그를 DB에서 볼 수 있는지

---

## Phase 3: Container Reuse

### 목표

Request Changes 시 기존 컨테이너를 재사용하여 ~1초 만에 재시도.

---

### Day 4: handleReject 수정

#### 문제

`handleReject()`(server.js:1247)가 컨테이너를 삭제하고 처음부터 시작. 소스 복사 + pnpm install에 30초+.

#### 현재 흐름:

```
PM: "Request Changes" 클릭
  → cleanup(id)           // docker rm -f (컨테이너 삭제)
  → runPipeline(id)       // 처음부터: 컨테이너 생성 → 소스 복사 → pnpm install → ...
  (30초+)
```

#### 변경 흐름:

```
PM: "Request Changes" 클릭
  → resetSandbox()        // git checkout -- . && git clean -fd (코드만 리셋)
  → runFromStep(id, 'run_agent')  // agent부터 재시작
  (sandbox, Vite, 인증 이미 있음 → ~1초)
```

#### 변경할 파일

**`orchestrator/server.js` — `handleReject()` 수정:**

```javascript
// 변경 전
async function handleReject(id, feedback) {
  updateRequest(id, { status: 'rejected', phase: 'rejected' });
  state.analytics.iterationCount++;
  if (state.analytics.iterationCount >= 3) {
    appendLog(id, 'Maximum iterations reached');
    await cleanup(id);
    return;
  }
  await cleanup(id);       // ← 컨테이너 삭제
  runPipeline(id);          // ← 처음부터
}

// 변경 후
async function handleReject(id, feedback) {
  const state = requests.get(id);
  updateRequest(id, { status: 'processing', phase: 'retrying' });
  state.analytics.iterationCount++;

  if (state.analytics.iterationCount >= 3) {
    appendLog(id, 'Maximum iterations reached');
    await cleanup(id);
    return;
  }

  // 컨테이너가 살아있으면 재사용
  if (state.sandbox?.containerId) {
    try {
      appendLog(id, `Retrying (iteration ${state.analytics.iterationCount})...`);

      // 코드만 리셋 (컨테이너, Vite, 인증은 유지)
      await resetSandbox({ containerId: state.sandbox.containerId });

      // 피드백을 프롬프트에 포함
      state.payload.userPrompt += `\n\nPM Feedback: ${feedback}`;

      // agent 단계부터 재시작
      await runFromStep(id, 'run_agent');
    } catch (e) {
      // 컨테이너 문제 시 처음부터
      appendLog(id, 'Container reuse failed, starting fresh');
      await cleanup(id);
      runPipeline(id);
    }
  } else {
    // 컨테이너 없으면 처음부터 (expired 등)
    await cleanup(id);
    runPipeline(id);
  }
}
```

**`orchestrator/pipeline/runner.js` — `runFromStep` 재시도 지원:**

```javascript
// run_agent부터 시작할 때:
// - create_sandbox 스킵 (기존 containerId 사용)
// - sync_source 스킵 (코드는 resetSandbox에서 리셋됨)
// - run_agent → collect_diff → validate → setup_preview → preview_ready
```

**`orchestrator/pipeline/steps.js` — `stepSetupPreview` 재사용 최적화:**

```javascript
async function stepSetupPreview(ctx) {
  // Vite가 이미 돌고 있는지 확인
  const check = await execInContainer({
    containerId: ctx.containerId,
    command: 'curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/',
    timeout: 3000,
  }).catch(() => ({ stdout: '000' }));

  if (check.stdout.trim() === '200') {
    // Vite 이미 실행 중 → 스크린샷만 다시 캡처
    ctx.appendLog('Vite already running, recapturing screenshot...');
  } else {
    // Vite 시작 필요 (첫 실행 또는 컨테이너 재시작)
    // 기존 로직 실행
  }
}
```

#### 검증

1. 요청 보내기 → Preview Ready
2. "Request Changes" + 피드백 입력
3. ~1초 내에 agent 재실행 확인
4. 새로운 diff + 스크린샷 생성 확인
5. 3회 초과 시 "Maximum iterations reached" 확인

---

## 파일 변경 총정리

### 새로 만드는 파일 (4개)

| 파일 | Phase | 역할 |
|------|-------|------|
| `orchestrator/db/sqlite.js` | 1 | SQLite DB 어댑터 |
| `orchestrator/pipeline/steps.js` | 1 | 7개 단계 함수 |
| `orchestrator/pipeline/runner.js` | 1 | 단계별 실행기 |
| `orchestrator/db/migrations/001_initial.sql` | 1 | DDL |

### 수정하는 파일 (4개)

| 파일 | Phase | 변경 |
|------|-------|------|
| `orchestrator/server.js` | 1, 3 | runPipeline → runner, SSE replay, handleReject 재사용 |
| `orchestrator/package.json` | 1 | better-sqlite3 의존성 추가 |
| `chrome-extension/sidepanel.js` | 1 | SSE cursor 파라미터 |
| `dashboard/src/pages/RequestDetailPage.tsx` | 1 | SSE cursor 파라미터 |

### 의존성 (1개)

```
better-sqlite3@^9.0.0  — 네이티브 SQLite 바인딩, 동기식, zero-config
```

---

## 일별 실행 계획

### Day 1 — 파이프라인 단계 분리

```
09:00  steps.js 생성 — runPipeline()에서 7개 함수 추출
11:00  runner.js 생성 — runFromStep() 구현
13:00  server.js에서 runPipeline() → runner 호출로 교체
15:00  E2E 테스트 — 기존과 동일하게 작동하는지 확인
17:00  커밋
```

**완료 기준:** 파이프라인이 이전과 동일하게 동작. 로그에 step 시작/완료 표시.

### Day 2 — SQLite 저장소

```
09:00  pnpm add better-sqlite3 && db/sqlite.js 생성
11:00  스키마 적용 (requests, steps, sse_events)
13:00  server.js에 이중 저장 적용 (Map + SQLite + JSON)
15:00  서버 시작 시 SQLite → JSON fallback 복원 로직
17:00  테스트: 서버 재시작 후 요청 복원 확인. 커밋
```

**완료 기준:** `orchestrator/inspect.db` 생성됨. 서버 재시작 후 요청 목록 유지.

### Day 3 — SSE 재연결

```
09:00  SSE 핸들러에 cursor 파라미터 추가
11:00  appendLog/appendEvent에서 DB에 이벤트 저장
13:00  Chrome Extension EventSource에 cursor 전달
14:00  Inspect Hub EventSource에 cursor 전달
16:00  테스트: 탭 닫기 → 다시 열기 → 이전 로그 표시 확인. 커밋
```

**완료 기준:** 브라우저 탭 닫았다 열면 이전 진행 상태 + 새 이벤트 이어서 표시.

### Day 4 — Container Reuse

```
09:00  handleReject() 수정 — 컨테이너 삭제 대신 resetSandbox()
11:00  runFromStep('run_agent') 재시도 경로 구현
13:00  stepSetupPreview()에서 Vite 이미 실행 중이면 스킵
15:00  테스트: Request Changes → ~1초 재시작 확인. 커밋
17:00  전체 E2E: 요청 → Preview → Reject → 재시도 → 새 Preview
```

**완료 기준:** Request Changes 후 ~1초 내 agent 재실행. 3회 초과 시 종료.

---

## 롤백 전략

| 상황 | 롤백 방법 |
|------|----------|
| SQLite가 문제 | `USE_SQLITE=false` → JSON 파일 방식 복귀 |
| 단계 분리가 문제 | runner.js에서 모든 step을 순서대로 실행 (현재와 동일) |
| SSE 재연결 문제 | cursor 파라미터 무시 → 기존 방식으로 동작 |
| 컨테이너 재사용 문제 | catch에서 `cleanup() + runPipeline()` (처음부터) |

**모든 변경은 기존 동작을 깨뜨리지 않는 방향으로 추가됨.**

---

## 성공 지표

| 지표 | 현재 | 목표 |
|------|------|------|
| 탭 닫고 다시 열 때 | 상태 유실 | 이전 상태 + 이어서 표시 |
| 서버 재시작 후 | sandbox expired, 데이터 일부 유실 | DB에서 100% 복원 |
| Request Changes 소요 시간 | 30초+ | ~1초 |
| Request Changes 후 상태 | 처음부터 재시작 | agent만 재실행 |
