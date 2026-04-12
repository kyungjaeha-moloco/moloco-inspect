# Sandbox Architecture

## 개요

Moloco Inspect는 Docker container를 사용하여 agent 실행 환경을 격리합니다.
기존의 git worktree 기반 실행 환경을 대체하며, Ramp Inspector의 sandboxed VM 패턴을 참고했습니다.

## 아키텍처

```
Orchestrator (host:3847)
  │
  │  HTTP API (Chrome Extension, Dashboard)
  │
  ├─ sandbox-manager
  │    ├─ container.js     Docker container lifecycle
  │    ├─ port-manager.js  동적 port 할당
  │    └─ opencode-client.js  OpenCode HTTP API 통신
  │
  │  docker run -p {oc}:4096 -p {vite}:5173
  │
  ▼
Sandbox Container (per request)
  ├─ OpenCode serve :4096    Agent server (HTTP API)
  ├─ msm-portal + deps       Product code (image 또는 docker cp)
  ├─ design-system            Validation rules
  ├─ .opencode/agents/        Custom agent definitions
  ├─ Chromium                 Screenshot capture
  └─ Vite :5173               Preview server

```

## 통신 프로토콜

### Orchestrator → Container (OpenCode HTTP API)

```
POST /session              세션 생성
POST /session/:id/message  Agent prompt 전송
GET  /global/health        서버 상태 확인
GET  /session/:id          세션 조회
```

### 결과 수집

```
docker exec {id} git diff          Diff 수집
docker cp {id}:/path host/path     파일 추출 (screenshot 등)
```

## Pipeline Flow

```
1. creating_sandbox    Container 생성 + port 매핑
2. syncing_source      msm-portal 코드를 container에 복사 + git baseline
3. starting_agent      OpenCode server ready 대기
4. running_agent       Agent가 코드 수정 (OpenAI/Anthropic 모델)
5. collecting_diff     git diff로 변경 사항 수집
6. validating          Typecheck (container 내부)
7. capturing_screenshot  Screenshot (Playwright, container 내부)
8. preview_ready       PM review 대기
```

## Reject/Retry 흐름

- 1-2회: `git checkout -- . && git clean -fd`로 container 내부 reset
- 3회+: container destroy + recreate (깨끗한 시작)

## Approve → Local Apply

Container의 diff를 host의 product repo에 `git apply`로 적용:
1. `git apply --whitespace=nowarn` (직접 적용)
2. `git apply --3way` (3-way merge fallback)

## 환경 요구사항

- Docker Desktop (macOS) or Docker Engine (Linux)
- CPU 4+, Memory 8GB+
- 회사 네트워크: `sandbox/host-ca.pem`에 CA 번들 필요

## Cloud 이식 (추후)

현재 `docker run`을 사용하지만, container 생성 로직을 교체하면 다음으로 이식 가능:
- Modal (Ramp 방식)
- Fly.io Machines
- Google Cloud Run
- AWS ECS/Fargate
