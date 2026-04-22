# Playground Architecture v3 — Codex·Critic 리뷰 후 최종 반영

**Status:** Ready (v3.1 with spike addendum, 2026-04-22) — M1a 착수 가능
**Spike report:** `docs/spikes/2026-04-22-playground-feasibility.md`
**Author:** kyungjae.ha (with Claude)
**Supersedes:** `2026-04-21-playground-architecture-v2.md` (v2를 베이스로 읽고, 이 v3의 **델타만 덮어서 해석**)
**Review history:** v1 → local critic reject → v2 → Codex review needs-revision → this v3

---

## 0. v3 = v2 + 다음 변경 (이 문서만 먼저 확정)

**형식**: v2 전체 본문은 베이스 계약서로 유효. 아래 항목은 v2 해당 섹션을 **덮어쓴다** (우선순위 v3 > v2).

### 0.1 사용자 결정 (2026-04-22)

| # | 항목 | 결정 |
|---|---|---|
| D1 | **git 모델** | MVP는 **Synthetic Patch 누적**. 샌드박스 git = 격리 스크래치. Promote 시 host 쪽 real msm-portal clone에 패치를 순차 적용해 PR. **Real clone 모드는 Phase 2+ (사내 호스팅 이후)** |
| D2 | **Vite resume 문제(B4)** | Claude가 알아서 해결 — entrypoint supervisor (tini+bash wrapper 또는 `supervisord`) 도입으로 OpenCode + Vite 함께 관리 |
| D3 | **Codex MAJOR 전부 반영** | commit-per-request / 큐 disk 영속화 / postMessage handshake nonce / browser migration은 localStorage+download / ops 필수 항목 |
| D4 | **MINOR 고침** | `pointerEvents` 의미 명확화 |
| D5 | **Codex 3대 권고 반영** | M0 Spike(1일) 추가 / git 모델 확정 (D1로 완료) / lifecycle 테스트 하네스 M1b에 포함 |

---

## 1. Synthetic Patch 모델 구체 (v2 Section 4.1, 5, 9 교체)

### 1.1 샌드박스 git이 하는 일

- 샌드박스 기동 시: 호스트 msm-portal **스냅샷 복사** → 컨테이너 내부에서 `git init` + `git add . && git commit -m "baseline"`. (**지금과 동일**)
- 각 change-request 끝날 때: 에이전트가 파일을 쓰면 → orchestrator가 `git add . && git commit -m "<user prompt>"` **실행 (v2 대비 신규)**. 결과 `commitSha`가 ChangeRecord에 저장됨.
- 타임라인 "이 시점으로 돌아가기" → `git checkout <sha>` (이제 실제 sha 존재)
- Revert → `git revert <sha>` (새 커밋 하나 더 생성)
- Promote → 다음 절차:

### 1.2 Promote (MVP Synthetic)

```
1. 샌드박스의 playground-<id> 브랜치에서 baseline 이후 모든 커밋의 patch 시퀀스 추출
   git format-patch baseline..HEAD → N개 .patch
2. 호스트 msm-portal (SOURCE_WORKSPACE_ROOT) 에서 현재 main fetch
3. 새 브랜치 `playground-<id>-<shortDate>` 생성 (from latest main)
4. git am <patches>  (실패 시 해당 patch 스킵 + 로그, MVP 정책)
5. git push origin <new branch>
6. gh pr create --base main --head <new branch>
7. PR URL을 Playground 상태에 저장
```

**Real Clone 모델 차이점 (Phase 2+에서만)**: 1~4 단계 대체 → 샌드박스가 이미 real clone으로 시작했으니 그냥 `git push`.

### 1.3 Playground 타입 업데이트

```ts
interface Playground {
  id: string;
  projectId: string;
  title: string;
  status: 'active' | 'hibernated' | 'archived';

  // 샌드박스 연결
  sandboxContainerName: string;        // `playground-${id}`
  vitePort?: number;
  opencodePort?: number;

  // ── v3 변경 ──
  gitModel: 'synthetic' | 'real-clone';  // MVP: 'synthetic' 고정
  baselineCommitSha: string;             // 스냅샷 복사 후 baseline 커밋
  headCommitSha: string;                 // 현재 HEAD. 매 change-request마다 전진
  // ── v2의 workBranch는 유지 ('playground-<id>', synthetic 모델의 단일 브랜치) ──
  workBranch: string;
  baseBranch: string;                    // Phase 2에서 real-clone 쓸 때 의미 생김

  // ── v2 `archivedBranchPath` 는 Phase 2+로 이동 (synthetic은 archive 시 diff만 export) ──
  archivedDiffPath?: string;             // synthetic archive: patches 묶음

  hibernatedAt?: number;
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number;
}
```

### 1.4 ChangeRecord 타입 업데이트

```ts
interface ChangeRecord {
  id: string;
  playgroundId: string;
  messageId: string;
  status: 'processing' | 'applied' | 'reverted' | 'error';

  // ── v3: 실제 커밋 sha 기반 ──
  commitSha?: string;                    // 샌드박스 브랜치 내 커밋 (synthetic)
  parentCommitSha?: string;              // 이 커밋 바로 전 sha (revert UX)

  diff?: string;
  changedFiles: string[];
  createdAt: number;
}
```

---

## 2. Sandbox Image 변경 (v2 Section 7.2에 추가)

### 2.1 Entrypoint Supervisor (B4 해결)

`sandbox/Dockerfile` 변경:

```diff
- ENTRYPOINT []
- CMD ["opencode", "serve", "--port", "4096", "--hostname", "0.0.0.0"]
+ # tini for PID 1 signal handling, supervisord runs both services
+ RUN apk add --no-cache tini supervisor
+ COPY sandbox/supervisord.conf /etc/supervisord.conf
+ ENTRYPOINT ["/sbin/tini", "--"]
+ CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf", "-n"]
```

**`sandbox/supervisord.conf`** (신규):

```ini
[supervisord]
nodaemon=true
loglevel=info

[program:opencode]
command=opencode serve --port 4096 --hostname 0.0.0.0
autostart=true
autorestart=true
stdout_logfile=/var/log/opencode.log
stderr_logfile=/var/log/opencode.err.log

[program:vite]
command=/workspace/scripts/start-vite.sh
autostart=false
autorestart=true
stdout_logfile=/var/log/vite.log
stderr_logfile=/var/log/vite.err.log
startsecs=5
startretries=3
```

`start-vite.sh`는 `cd /workspace/msm-portal && exec npx vite --host 0.0.0.0 --port 5173 --strictPort`.

Orchestrator는 **Vite 기동 시점**에 `supervisorctl start vite` 호출 (기존 "docker exec … vite &" 패턴 제거).

### 2.2 Hibernate/Resume 동작

- Hibernate: `docker stop <container>` (SIGTERM → supervisord가 children 정리)
- Resume: `docker start <container>` → **supervisord가 OpenCode 자동 재기동**, Vite는 autostart=false이므로 orchestrator가 `/api/playground/:id/resume` 핸들러에서 `docker exec <container> supervisorctl start vite` 호출 + Vite readiness 대기 (port check + `/` fetch)
- Archive: `docker rm <container>`. synthetic 모델은 이 시점에 `git format-patch baseline..HEAD > state/playground-archived/<id>.patches` 저장.

### 2.3 이미지 핀닝

- Dockerfile에 `LABEL version=v3-YYYYMMDD` 추가
- 빌드 시 tag: `moloco-inspect-sandbox:v3-<date>`
- orchestrator/.env 에 `SANDBOX_IMAGE_TAG=v3-2026-04-22` 명시
- orchestrator 기동 로그에 digest 출력 (`docker inspect <tag> --format '{{.Id}}'`)

---

## 3. Commit-per-Request (v2 Section 5.2 / pipeline 변경)

### 3.1 현재 (v2까지)

```
agent writes → diff extract (staged) → reset → next request
```

문제: commit이 없으니 `commitSha` 비어있음. Timeline 시점복원 불가능.

### 3.2 v3

```
agent writes → git add . → git commit -m "<user prompt first 72 chars>" → commitSha 기록 → ChangeRecord 저장
```

수정 지점: `orchestrator/server.js` `runPipeline` 의 `extractDiff` 호출 직후.

**revert**: `git revert --no-edit <sha>` → 새 커밋 자동 생성 → ChangeRecord 2개 (원본 + revert).

**에러 경로**: 에이전트 에러 발생 시 커밋 안 함. `git reset --hard HEAD` 으로 워킹트리 정리.

---

## 4. Queue Disk Persistence (v2 Section 5.3 교체)

### 4.1 지금 v2

```ts
// in-memory Map<playgroundId, Job[]>
```

### 4.2 v3

**`orchestrator/state/playground-queue/<playgroundId>.json`** (playground별 1 파일):

```json
{
  "items": [
    {
      "id": "job-xxx",
      "state": "queued" | "running" | "completed" | "failed",
      "changeRequestId": "<id>",
      "queuedAt": 1234567890,
      "startedAt": 1234567900,
      "leaseUntil": 1234568000,
      "error": null
    }
  ]
}
```

### 4.3 Orchestrator 재기동 시

1. 모든 `state/playground-queue/*.json` 스캔
2. `state=running` 인 아이템: 컨테이너 alive 확인
   - 컨테이너 살아있고 OpenCode `/session/:id` GET 하면 아직 busy → 계속 관찰
   - 컨테이너 없거나 OpenCode idle → `state=failed, error="orchestrator restart during execution"` + UI에 "상태 확인 필요"
3. `state=queued` 인 아이템: FIFO 재개

### 4.4 Lease / Deadlock 방지

- Running job은 60초마다 `leaseUntil` 갱신
- 60초 이상 갱신 안 되면 worker가 죽은 것으로 간주 → failed 처리

---

## 5. postMessage Handshake with Nonce (v2 Section 7.2 교체)

### 5.1 왜

v2의 `window.parent.postMessage(..., "http://localhost:4180")` 고정은:
- 127.0.0.1 vs localhost 혼용 시 실패
- LAN IP, 다른 포트, preview 호스트에서 실패
- Parent 수신측이 포트만 느슨하게 검증하면 sandbox 포트 spoof 공격 가능

### 5.2 v3 handshake

```
Parent (playground-app):
  1. Playground 오픈 시 random nonce 생성 (crypto.randomUUID())
  2. <iframe src="http://127.0.0.1:<vitePort>/?__playground_nonce=<nonce>&__playground_origin=<parent_origin>">
  3. iframe 로드 후 parent.postMessage({ type: 'playground.ready', nonce }, "*") ← 초기 1회
     ※ 첫 메시지는 unknown origin이므로 targetOrigin="*" 허용, 단 child가 검증

Child (Vite plugin picker in sandbox):
  1. 페이지 로드 시 URL query 에서 __playground_nonce, __playground_origin 읽어 저장
  2. parent 에서 'playground.ready' 받으면 nonce 대조 → 일치하면 parent origin을 신뢰 (학습)
  3. 이후 모든 picker selection 메시지: window.parent.postMessage({ ..., nonce }, learnedParentOrigin)

Parent recv 검증:
  - event.origin ∈ { `http://127.0.0.1:*`, `http://localhost:*` } (LAN 필요 시 확장)
  - event.data.nonce === 현재 playground 의 nonce
```

### 5.3 Nonce 수명

- Playground iframe 세션 단위 (iframe reload 시 새로 발급)
- Playground 상태에는 저장 안 함 (휘발성)

---

## 6. Browser-side Migrate 수정 (v2 Section 4.3 교체)

### 6.1 v2 오해

"고아 canvas comments → `playground-app/legacy-comments/<id>.json` 덤프" — **브라우저에서 파일시스템 쓰기 불가능**.

### 6.2 v3 방안

- localStorage 에 신규 키 `moloco-playground:v3:legacy-comments:<projectId>` 로 기록 (서버 왕복 없음)
- Playground 목록 첫 진입 시 **토스트** + "legacy JSON 다운로드" 버튼
- 버튼 클릭 시 `Blob` + `URL.createObjectURL` 로 JSON 파일 다운로드 트리거
- 마이그레이션 플래그: `migrationState: 'pending' | 'partial' | 'complete'` (부분 성공 재시도 가능)

---

## 7. MINOR 고침 — View 모드 pointerEvents (v2 Section 6.2 교체)

### 7.1 이전 오해

"View 모드 = `pointerEvents: none` = 드래그·스크롤 방해 없음" → 틀렸음. `none` 이면 iframe 내부 **스크롤·클릭 전부** 막힘.

### 7.2 v3 사양

- **View 모드 (기본)**: iframe `pointerEvents: auto`, **단 부모 창이 iframe 위에 투명 오버레이**(`pointerEvents: auto`)를 띄워 **클릭 이벤트를 가로채고 무시**. 이렇게 하면:
  - 부모 캔버스 드래그는 overlay 위에서 처리
  - iframe 내부 스크롤은 `wheel` 이벤트를 오버레이가 capture해서 iframe에 redispatch (또는 오버레이를 `pointer-events: none`으로 두고 클릭만 disable하는 CSS 기법)
- **Pick 모드**: overlay 제거, iframe `pointerEvents: auto`, Vite plugin picker가 overlay 주입하여 하이라이트·클릭 처리
- **Pin 모드**: overlay `pointerEvents: auto`, 클릭 좌표 저장 (iframe 내부엔 전달 안 함)

구현 힌트: 오버레이에 `overflow: hidden` + `onWheel={(e) => iframeRef.current.contentWindow.scrollBy(0, e.deltaY)}` 식으로 스크롤 프록시. 실제 Vite HMR·JS에는 영향 없음.

---

## 8. Operational Basics (v2에 누락, v3 신규 — v2 Section 11 Out of Scope 에서 일부 이동)

### 8.1 Container Health 모니터링

- Orchestrator가 각 active playground 컨테이너를 30초마다 `docker inspect` 확인
- `State.Running === false` 또는 `State.ExitCode !== 0` 이면:
  - Playground status → `'crashed'`
  - `/api/playground/:id/events` 로 crash 이벤트 broadcast
  - UI에 "샌드박스 비정상 종료 — [재시작]" 버튼
- `supervisorctl status` 로 내부 프로세스 상태도 확인 (Vite 죽었는지 등)

### 8.2 Disk Pressure

- Orchestrator 기동 시 + 매 1시간마다 `docker system df` 실행
- `docker system df` 결과에서 **Images + Containers + Volumes 합계 > 20 GiB** 이면 UI 배너 경고
- Archive 시 `docker rm -v` 로 볼륨까지 정리

### 8.3 Container Logs

- `GET /api/playground/:id/logs?lines=200&service=opencode|vite|all` 엔드포인트 신설
- `docker exec <container> tail -n <lines> /var/log/<service>.log` 결과 반환
- Playground UI에 "🔧 로그" 탭 (접힘) 추가

### 8.4 Image Version Pinning

- `orchestrator/.env`: `SANDBOX_IMAGE_TAG=v3-2026-04-22`
- orchestrator 기동 로그에 이미지 digest 출력
- Playground 생성 시 state에 `imageTag` 기록 → resume 시 동일 이미지 보장

### 8.5 Test Harness (Codex 권고 #3)

**`orchestrator/test/lifecycle.test.js`** (신규):

```
beforeAll: 오케스트레이터 기동
test 1: playground create → sandbox 기동 → Vite ready
test 2: change-request 3회 sequential → 각 커밋 기록 → HEAD 전진
test 3: 동시 2개 change-request → 큐 확인, 두 번째 실행 대기
test 4: orchestrator kill + restart → playground resume 성공 → 4번째 change-request 성공
test 5: git checkout <sha> → HEAD 이동 → restore-head 로 복귀
test 6: revert <sha> → revert 커밋 추가
test 7: archive → patches 디렉토리 생성 → 컨테이너 제거
teardown: 모든 playground archive
```

Node `--test` 러너, 실제 Docker 필요 (CI는 Phase 2에서 정비).

### 8.6 Quota / GC

- Playground 당 `archivedAt + 30일` 지난 archive 는 auto-delete (patches 포함)
- Active playground 최대 10개 (로컬 MVP; 초과 시 거부 + 안내)

---

## 9. Milestones (v2 Section 8 전면 교체 — M0 추가 + 시간 재산정)

| M | 작업 | 소요 | 완료 기준 |
|---|---|---|---|
| **M0 Spike** | HMR 성능·checkout mass-change·docker stop/start·supervisor·fiber detection rate 실측 | **1일** | 스파이크 리포트 `docs/spikes/2026-04-22-playground-feasibility.md` — 각 실험별 pass/fail + 측정치 |
| **M1a** | Playground CRUD + state 영속화. 기존 파이프라인 건드리지 않음 | **1~1.5일** | curl로 playground create/list/get. state 파일 생성 |
| **M1b** | Pipeline 재사용 + commit-per-request + 큐 (disk) + checkout/revert/promote skeleton + supervisor image + lifecycle test 1~5 통과 | **3.5~4일** | 스파이크 기반 설계 반영. lifecycle test 5까지 통과 |
| **M2** | canvas-app → playground-app 리팩터. 2-pane UI. 핀 댓글 이관. migrate-v2-to-v3 (localStorage + download). pointerEvents proxy | **3~4일** | 브라우저에서 playground 생성 → 핑퐁 5회 → timeline → 핀. legacy 댓글 다운로드 |
| **M3** | Vite 플러그인 picker + handshake nonce. element-picker-core 패키지. Ext와 공유 | **3일** | Playground·Ext 둘 다 같은 picker 사용. fiber/testId 수집률 M0 기준치 충족 |
| **M4** | Chrome Ext ↔ Playground 통합. 사이드패널에 playground 선택기 | **1.5일** | Ext 요청이 Playground 히스토리에 나타남 |
| **M5** | 시점복원 + promote (synthetic patch-apply) + PR 생성 | **2.5~3일** | Timeline 과거 복원 → OS 스크린샷 → 최신 복귀. `[커밋]` 으로 msm-portal PR 생성 |
| **M6 (선택)** | orchestrator server.js 모듈 분리 | **1일** | lib/* 로 로직 이동 |

**Total MVP (M0 ~ M5)**: **15.5~18일 작업일 / 약 3.5주 calendar**.

v2 추정 12~15일 대비 +3일. 대부분 M0 스파이크(1일) + commit-per-request·supervisor·큐 disk 추가 비용.

---

## 10. Risks 갱신 (v2 Section 9에 추가)

| # | Risk | 완화 |
|---|---|---|
| R1~R7 | v2 그대로 | |
| R8 | 동시 요청 | 큐 + lease (v3 Section 4) |
| R9 | HMR iframe | **M0 Spike로 검증** — 실패 시 iframe hard reload 폴백 (`iframe.src += '?'`) |
| R10 | checkout 중 요청 | 큐가 거부 + "먼저 최신으로 돌아가기" 배너 |
| R11 | orchestrator 재기동 | v3 Section 4.3 복구 로직 |
| R12 | HMR·picker 충돌 | **M0 Spike로 검증** — plugin 에서 `import.meta.hot.on('vite:beforeUpdate', rebindOverlay)` |
| R13 (신규) | Supervisor complexity | 최소 2 프로세스만 관리. 로그는 stdout 분리. supervisord 기본 설정 신뢰 |
| R14 (신규) | commit-per-request 비용 | `git commit` 은 ms 단위. 100개 쌓여도 문제 없음 |
| R15 (신규) | fiber/sourceFile 수집률 낮음 | M0 Spike에서 실측 → 기준치 미달 시 selector+testId fallback 우선 정책으로 수정 |
| R16 (신규) | Disk 압박 | Section 8.2 경고 + auto GC |
| R17 (신규) | postMessage nonce 유출 | 유출돼도 피해 범위 = 하나의 playground 세션. 심각도 낮음 |

---

## 11. Open Questions 갱신 (v2 Section 10 에서 살아남은 것만 + 신규)

| # | 질문 | 시점 |
|---|---|---|
| Q1 | Playground 소유권 (사내 호스팅 후) | Phase 2 |
| Q2 (재정의) | Promote 시 `git am` 실패 — 어떻게 복구? | M5 구현 중. MVP: "이 patch는 건너뜀 + PR 본문에 경고" |
| Q4 | PinTarget 좌표 drift | M2 구현 중 |
| Q5 | 사내 TVING URL Ext | Phase 2+ |
| Q8 (닫힘) | ~~docker stop vs pause~~ | **해결**: supervisor + docker stop (v3 Section 2.2) |
| Q10 (신규) | Playground 안 iframe 원점이 `127.0.0.1` 이면 쿠키 격리로 msm-portal 로그인 매번? | M0 Spike에서 실앱 기반으로 확인 |

---

## 12. Out of Scope 갱신

v2 기존 + 추가:
- **Real clone git 모델** (Phase 2+)
- **archive 후 bare repo 재활용** (v2 의 bare repo 아이디어 드롭)
- **CI 통합** — lifecycle test 는 로컬 수동 실행 (Phase 2 에서 CI)

---

## 13. Success Metrics 갱신

v2 기존 + 추가:
- [ ] 3개 playground 동시 active 상태에서 전체 Docker 용량 **≤ 12 GiB**
- [ ] Playground resume (stop → start) 내 Vite·HMR 재연결 **≤ 10초**
- [ ] lifecycle test 1~7 모두 green
- [ ] M0 Spike 리포트 commit

---

## 14. M0 Spike 상세 (즉시 실행)

**`docs/spikes/2026-04-22-playground-feasibility.md`** 로 결과 쌓음.

실험 목록:

### E1. Iframe HMR 기본
- playground-app 프로토타입이 샌드박스 Vite 를 iframe 으로 embed
- msm-portal 소스 파일 하나 수정 → iframe 갱신 시간 측정 (3회)
- **Pass 조건**: 3회 평균 ≤ 3초, full reload 없이 partial HMR

### E2. Mass Change via git checkout
- Agent 시뮬레이션: `git checkout <older_sha>` 실행
- iframe 재렌더·에러 여부 확인
- **Pass**: 5초 안에 안정화, Vite 에러 오버레이 없음 혹은 있어도 자동 복구

### E3. Supervisor + docker stop/start
- Dockerfile 에 supervisord 추가한 test 이미지 빌드
- opencode + vite 기동 → `docker stop` → `docker start` → supervisord 가 opencode 재기동 + `supervisorctl start vite`
- **Pass**: 둘 다 port bind 성공, HMR 재연결 10초 이내

### E4. Fiber/Source 수집률
- msm-portal 주요 페이지 100 elements 무작위 샘플링
- `__reactFiber$` key 존재율, `_debugSource` 존재율, testId 존재율
- **Pass 판단**: sourceFile 50%+ 이면 이상적, 미만이면 selector+testId 우선 전략으로 M3 수정

### E5. Rapid-fire change-requests on persistent sandbox
- 수동 스크립트로 3회 연속 `/api/change-request` (mock agent — 단순 파일 수정)
- 모두 성공·커밋 생성·timeline 정확히 누적
- **Pass**: 3/3 성공, commit history 기대대로

---

## 15. 다음 스텝 순서

1. **지금**: 이 v3를 사용자 최종 승인
2. **M0 Spike (1일)**: Claude 실행, 결과 리포트
3. **Spike 실패 항목 대응**: v3 조정 (예: HMR 느리면 M2에 hard-reload 폴백 우선 추가)
4. **M1a 착수**

---

## 15.5 Spike Addendum (v3.1 — 2026-04-22 M0 결과 반영)

**Source**: `docs/spikes/2026-04-22-playground-feasibility.md` (E1~E4 실행 결과)

다음 4개 항목이 본문을 override 또는 보강:

### A1. Commit-per-request은 `--no-verify`로
- **Override Section 3.2** — `git commit -m "<prompt>"` → `git commit --no-verify -m "<prompt>"`
- **Why**: msm-portal에 husky + lint-staged + prettier + eslint가 걸려 있어 commit마다 3~5초 추가. request 체감 지연 악화

### A2. Resume 시 포트 재조회 필수
- **Override Section 2.2** — resume 절차:
  1. `docker start <container>`
  2. `docker exec <container> supervisorctl start vite`
  3. **`docker port <container>` 재조회 → Playground state의 `vitePort`/`opencodePort` 갱신**
  4. Vite `/` HTTP 200 대기 (0.5s × 40회 polling, 20s timeout)
- **Why**: E3 실측 결과 ephemeral ports (`-p 0:4096`)가 `docker stop/start` 후 변경됨 (55002→55004 등)
- **Playground state**: `vitePort`/`opencodePort`는 runtime-only 휘발 필드라고 명시. UI는 매 로드 시 `/api/playground/:id`로 현재 포트 조회

### A3. Vite readiness wait
- **New Section in 2.2** — `/api/playground/:id/resume` 엔드포인트 응답 시점 = Vite HTTP 200 응답 확인 후
- 실패 시 `status='crashed'` + UI에 "Vite 시작 실패, 재시도" 버튼
- E3에서 측정: Vite 기동 ~8초 → 20초 timeout으로 여유

### A4. Picker 식별자 우선순위 (E4 반영)
- **Override Section 12 (M3 Vite 플러그인)** — picker가 수집하는 식별자 우선순위:
  1. `data-testid` (있으면 — msm-portal 전체의 ~1% 파일만 보유, 귀중한 힌트)
  2. React fiber `displayName` (`__reactFiber$` walker)
  3. CSS selector path (nth-child 포함)
  4. `_debugSource` → sourceFile:line (dev-only, best-effort)
- ElementContext 타입은 모두 optional로 유지, 유효한 것만 채움

### A5. M1b 체크리스트 추가 항목 (spike 기반)
- 샌드박스 이미지를 **v3 supervisor 기반**으로 교체 (spike에서 만든 이미지 + 설정 = `sandbox/supervisord.conf`, `sandbox/scripts/start-vite.sh`는 이미 저장됨)
- container.js 의 "vite를 nohup으로 띄우던" 기존 패턴 → `docker exec <container> supervisorctl start vite` 로 교체
- Playground resume 구현 시 A2 4단계 절차 필수

---

## 16. Appendix — v1 → v2 → v3 변경 요약 한 장

```
v1:  critic reject
      ├─ cross-origin 잘못 이해
      ├─ sandbox lifecycle collision
      └─ 스크린샷 유지

v2:  Codex needs-revision
      ├─ cross-origin 해결 (Vite plugin + postMessage)
      ├─ sandbox lifecycle 분리 (M1a/M1b)
      ├─ 스크린샷 제거 → iframe-live
      ├─ variant feature-flag
      └─ 미해결:
          ├─ git 모델 (실제 msm-portal 연결 없음)
          ├─ Vite resume (docker stop 후 안 살아남)
          ├─ commit-per-request 빠짐
          ├─ 큐 disk 영속 빠짐
          ├─ postMessage nonce 없음
          ├─ browser migrate 파일 덤프 불가
          ├─ ops (crash/disk/logs/pinning/test)
          └─ MINOR: pointerEvents 의미 오해

v3:  사용자 결정 + 위 모두 반영
      ├─ git: synthetic for MVP, real-clone Phase 2+
      ├─ Vite: supervisor entrypoint
      ├─ commit-per-request 도입
      ├─ 큐: state/playground-queue/*.json 영속
      ├─ postMessage: nonce handshake
      ├─ migrate: localStorage + download
      ├─ ops: health/disk/logs/pinning/tests 전부 추가
      ├─ pointerEvents: overlay 프록시 방식
      └─ M0 Spike 필수
```
