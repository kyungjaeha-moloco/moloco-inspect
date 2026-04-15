# Architecture Upgrade Plan — Inspect v2

> Inspired by [Vercel Open Agents](https://vercel.com/templates/template/open-agents)
> Author: Kyungjae Ha | Date: 2026-04-15

---

## Executive Summary

Inspect v1은 18일 만에 동작하는 MVP를 만들었다. v2는 안정성과 확장성을 높이는 4단계 아키텍처 업그레이드다.

| Phase | 핵심 | 체감 효과 | 복잡도 |
|-------|------|----------|--------|
| 1 | Durable Workflow | 탭 닫아도 안 날아감, 재시도 빨라짐 | M |
| 2 | Agent Outside Sandbox | 5분 타임아웃 완전 해결 | L |
| 3 | Docker Snapshots | Request Changes 즉시 재시도 | S |
| 4 | PostgreSQL | 검색/분석/안정성 | M |

**예상 소요: ~11일** (Phase 1: 3일, Phase 2: 5일, Phase 3: 1일, Phase 4: 2일)

---

## 현재 아키텍처 (v1)

```
[Chrome Extension] ──HTTP──▶ [Orchestrator (Node.js)]
                                    │
                              ┌─────▼──────────────────┐
                              │  Docker Container       │
                              │  ├── OpenCode Server    │ ← Agent가 여기서 실행
                              │  ├── Vite Dev Server    │
                              │  └── msm-portal 소스    │
                              └────────────────────────┘
                                    │
                              orchestrator/state/*.json  ← JSON 파일 저장
```

### 현재 문제점

1. **Agent가 sandbox 안에서 실행** → OpenCode 프로바이더 5분 타임아웃
2. **JSON 파일 상태 저장** → 서버 재시작 시 유실, 검색/필터 불가
3. **SSE 비재연결** → 탭 닫으면 진행 상태 못 봄
4. **스냅샷 없음** → Request Changes 시 cold start (소스 복사 + pnpm install)

---

## 목표 아키텍처 (v2)

```
[Chrome Extension] ──HTTP──▶ [Orchestrator (Node.js)]
                                    │
                              ┌─────▼──────────────────┐
                              │  Agent (직접 LLM 호출)  │ ← Agent가 여기서 실행
                              │  ├── Claude/GPT API     │
                              │  └── Tool: docker exec  │───▶ [Container: 파일 + 런타임만]
                              └────────────────────────┘
                                    │
                              ┌─────▼──────────────────┐
                              │  SQLite / PostgreSQL    │ ← 영구 저장
                              │  ├── requests           │
                              │  ├── steps              │
                              │  ├── sse_events         │
                              │  └── analytics_events   │
                              └────────────────────────┘
```

---

## Phase 1: Durable Workflow (영구 실행 + 재연결)

**복잡도: M | 선행조건: 없음 | 예상: ~3일**

### 문제

`runPipeline()`(server.js:824)이 하나의 긴 async 함수. 중간에 서버 죽으면 전부 유실. SSE 끊기면 재연결 불가. 탭 닫으면 진행 상태 못 봄.

### 변경 구조

```
현재:
  runPipeline() ─── 하나의 async 함수 ─── JSON 파일 저장

변경:
  stepCreateSandbox() → DB 저장 ✓
  stepSyncSource()    → DB 저장 ✓
  stepRunAgent()      → DB 저장 ✓
  stepCollectDiff()   → DB 저장 ✓
  stepValidate()      → DB 저장 ✓
  stepScreenshot()    → DB 저장 ✓
  stepPreviewReady()  → DB 저장 ✓
  ...매 단계 결과를 DB에 영구 저장
```

### 새로 만들 파일

| 파일 | 역할 |
|------|------|
| `orchestrator/db/sqlite.js` | SQLite DB 어댑터 |
| `orchestrator/pipeline/steps.js` | 파이프라인 단계별 함수 분리 |
| `orchestrator/pipeline/runner.js` | `runFromStep(id, startStep)` — 중단점에서 재개 |

### DB 스키마

```sql
-- requests: 요청 상태
CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  phase TEXT NOT NULL,
  payload JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- steps: 파이프라인 단계별 결과
CREATE TABLE steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  result JSON,
  logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id)
);

-- sse_events: 재연결용 이벤트 로그
CREATE TABLE sse_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  event JSON,
  seq INTEGER,
  logged_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 수정할 파일

**`orchestrator/server.js`**
- `persistState()` → `db.saveStep()` 호출로 교체
- SSE 핸들러: cursor 기반 replay 모델로 변경 (재연결 시 DB에서 이전 이벤트 재생)
- `handleReject()`: 처음부터가 아닌 `running_agent` 단계부터 재시작

### 의존성

```json
"better-sqlite3": "^9.x"
```

### 마이그레이션 전략

1. JSON + SQLite 이중 저장 (한 릴리즈 동안)
2. `restoreAllState()`: SQLite 먼저 읽고, 없으면 JSON fallback
3. 안정화 후 JSON 저장 제거

### 롤백

`USE_SQLITE=false` 환경변수로 기존 JSON 방식 유지

---

## Phase 2: Agent Outside Sandbox

**복잡도: L | 선행조건: Phase 1 | 예상: ~5일**

### 문제

`runAgentPrompt()`(opencode-client.js:107)가 컨테이너 안의 OpenCode 서버에 HTTP 요청. OpenCode가 자체 5분 타임아웃 적용. 중간 상태 볼 수 없음 (블랙박스).

### 변경 구조

```
현재:
  Orchestrator → HTTP → [Container: OpenCode Server → LLM → 파일수정]
  (5분 타임아웃, 블랙박스)

변경:
  Orchestrator → Claude API → Tool 호출 → docker exec → [Container: 파일만]
  (타임아웃 없음, 매 단계 로그 표시)
```

**Agent 도구 정의:**
```
read_file(path)    → docker exec cat /workspace/msm-portal/{path}
write_file(path, content) → docker exec sh -c 'cat > /workspace/msm-portal/{path}'
run_shell(cmd)     → docker exec sh -c '{cmd}'
```

### 새로 만들 파일

| 파일 | 역할 |
|------|------|
| `orchestrator/agent/direct-agent.js` | Claude/GPT API 직접 호출 + tool-use 루프 |
| `orchestrator/agent/tools.js` | `readFile()`, `writeFile()`, `runShell()` — docker exec 기반 |

### `direct-agent.js` 핵심 로직

```javascript
async function runDirectAgent({ containerId, prompt, model, onStep }) {
  const messages = [{ role: 'user', content: prompt }];

  while (true) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      tools: [readFileTool, writeFileTool, runShellTool],
      messages,
    });

    // Tool 호출 처리
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        onStep(`도구 호출: ${block.name}(${block.input.path || block.input.cmd})`);
        const result = await executeTool(containerId, block);
        messages.push({ role: 'tool', content: result });
      }
    }

    // 종료 조건: AI가 더 이상 도구를 호출하지 않음
    if (response.stop_reason === 'end_turn') break;
  }
}
```

### 수정할 파일

**`tooling/sandbox-manager/src/container.js`**
- `createSandbox()`에서 `openCodePort` 파라미터 제거
- `docker run`에서 `-p ${openCodePort}:4096` 제거
- `execInContainerStream()` 추가 (실시간 stdout 스트리밍)

**`orchestrator/server.js`**
- `createSandboxClient / waitForServerReady / runAgentPrompt` 블록 제거 (L863-876)
- `direct-agent.js`의 `runDirectAgent()` 호출로 교체
- `onStep` 콜백으로 매 도구 호출마다 `appendLog()` 실행

### 의존성

```json
"@anthropic-ai/sdk": "^0.x"
```

### Dockerfile 변경

```dockerfile
# 제거 가능 (더 이상 필요 없음):
# CMD ["opencode", "serve", "--port", "4096", "--hostname", "0.0.0.0"]

# 변경:
CMD ["tail", "-f", "/dev/null"]  # 컨테이너를 살려두기만
```

### 마이그레이션 전략

`AGENT_MODE=direct` (새 방식) / `AGENT_MODE=opencode` (기존 방식) 환경변수로 분기. 점진적 전환.

### 롤백

`AGENT_MODE=opencode`로 기존 OpenCode 서버 방식 복귀

---

## Phase 3: Docker Snapshots

**복잡도: S | 선행조건: Phase 2 | 예상: ~1일**

### 문제

`handleReject()`(server.js:1247)가 `resetSandbox()` → `copyFilesIn()` → `pnpm install` 전체를 다시 실행. Request Changes 시 30초+ 소요.

### 변경 구조

```
현재:
  Reject → resetSandbox() → copyFilesIn() → pnpm install → agent 재실행
  (30초+)

변경:
  Agent 완료 시 → docker commit (스냅샷 저장)
  Reject → docker run (스냅샷에서 시작) → agent 재실행
  (즉시)
```

### 수정할 파일

**`tooling/sandbox-manager/src/container.js`**
```javascript
// 새 함수 추가
export async function commitSnapshot(containerId, tag) {
  await execAsync(`docker commit ${containerId} ${tag}`, { timeout: 30_000 });
}

export async function startFromSnapshot(tag, requestId, vitePort) {
  const containerName = `inspect-${requestId}`;
  await execAsync(`docker rm -f ${containerName} 2>/dev/null || true`);
  await execFileAsync('docker', [
    'run', '-d', '--name', containerName,
    '-p', `${vitePort}:5173`, '--shm-size=2gb',
    tag,
  ]);
  return { containerId: containerName, vitePort };
}

export async function pruneSnapshots(requestId, keepLast = 3) {
  // inspect-snap-{requestId}-iter* 이미지 중 오래된 것 제거
}
```

**`orchestrator/pipeline/steps.js`** (Phase 1에서 생성)
- `stepCollectDiff`: diff 저장 후 `commitSnapshot(containerId, tag)` 호출
- `stepRunAgent` (재시도): steps 테이블에서 스냅샷 tag 읽어서 `startFromSnapshot()` 호출

### 의존성

없음 (`docker commit`은 기본 명령)

### 롤백

`ENABLE_SNAPSHOTS=false`로 비활성화

---

## Phase 4: PostgreSQL Migration

**복잡도: M | 선행조건: Phase 1 | 예상: ~2일**

### 문제

JSON 파일 + NDJSON → 검색/필터 불가, 동시 접근 위험. 대시보드 분석이 매번 전체 스캔.

### 변경 구조

```
현재:
  orchestrator/state/*.json
  analytics/request-history.ndjson

변경:
  PostgreSQL (docker-compose로 실행)
  ├── requests        (요청 상태)
  ├── steps           (파이프라인 단계)
  ├── sse_events      (재연결용 이벤트)
  └── analytics_events (분석 데이터)
```

### 새로 만들 파일

| 파일 | 역할 |
|------|------|
| `orchestrator/db/postgres.js` | PostgreSQL 어댑터 (SQLite와 동일 인터페이스) |
| `orchestrator/db/index.js` | `DATABASE_URL` 기반 라우터 |
| `orchestrator/db/migrations/001_initial.sql` | 테이블 DDL |
| `orchestrator/docker-compose.yml` | postgres + orchestrator |

### docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: inspect
      POSTGRES_USER: inspect
      POSTGRES_PASSWORD: inspect
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]

  orchestrator:
    build: .
    environment:
      DATABASE_URL: "postgres://inspect:inspect@postgres:5432/inspect"
    depends_on: [postgres]

volumes:
  pgdata:
```

### DB 라우터 패턴

```javascript
// orchestrator/db/index.js
const url = process.env.DATABASE_URL;
if (url?.startsWith('postgres://')) {
  module.exports = require('./postgres');
} else {
  module.exports = require('./sqlite');
}
```

### 의존성

```json
"postgres": "^3.x"
```

### 마이그레이션 전략

1. `db/migrate-sqlite-to-pg.js` 스크립트로 SQLite → PostgreSQL 일괄 이관
2. `DATABASE_URL` 설정만으로 전환
3. SQLite는 fallback으로 유지

### 롤백

`DATABASE_URL` 제거 → 자동으로 SQLite 사용

---

## 실행 타임라인

```
Week 1:
  Day 1-3  ██████████  Phase 1: Durable Workflow (SQLite + 단계 분리 + 재연결 SSE)

Week 2:
  Day 4-8  ██████████████████  Phase 2: Agent Outside Sandbox (direct-agent + tools)

Week 3:
  Day 9    ████  Phase 3: Docker Snapshots
  Day 10-11 ██████  Phase 4: PostgreSQL (선택적)
```

## 리스크 & 롤백 매트릭스

| Phase | 핵심 리스크 | 롤백 | 영향 범위 |
|-------|-----------|------|----------|
| 1 | 스키마 설계 실수 | `USE_SQLITE=false` → JSON fallback | server.js |
| 2 | Tool-use 루프 수렴 안 함 | `AGENT_MODE=opencode` → 기존 방식 | agent/, server.js |
| 3 | docker commit 디스크 압박 | `ENABLE_SNAPSHOTS=false` | container.js |
| 4 | Migration 데이터 유실 | SQLite fallback via `DATABASE_URL` 제거 | db/ |

모든 Phase는 환경변수 플래그로 기존 방식과 새 방식을 전환 가능. 한번에 전환하지 않고 점진적으로 이동.

---

## Appendix: Vercel Open Agents 참고 사항

- [Vercel Open Agents Template](https://vercel.com/templates/template/open-agents)
- [GitHub: vercel-labs/open-agents](https://github.com/vercel-labs/open-agents)
- 핵심 인사이트: "The agent does not run inside the VM. It runs outside the sandbox and interacts with it through tools."
- Vercel Sandbox 대신 Docker 유지 (기업 환경, private registry, Zscaler 호환성)
