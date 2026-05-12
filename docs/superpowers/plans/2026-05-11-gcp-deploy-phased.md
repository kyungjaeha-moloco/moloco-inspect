# Plan — GCP 정식 배포 (3 Phase, 단계적)

**Date:** 2026-05-11
**Author:** kyungjae.ha (with Claude)
**Status:** 리서치 완료 → 1-2주 로컬 시범 운영 후 시작
**Estimate:** ~10-16일 (한 사람 처음) / ~4-6일 (팀이 익숙해진 후)
**관련 plan:** `docs/superpowers/plans/2026-05-11-local-share-cloudflare-tunnel.md` (로컬 임시 운영)

---

## 배경

로컬 임시 운영 (2명 시범) 1-2주 후 본격 multi-user (5-20명) 로 확장. Moloco 사내 도구 — Google Workspace, Slack, 사내 GCP 사용.

5명 researcher 외부 리서치 결과:
- **Cloud Run nested Docker 불가** — sandbox 는 GKE / GCE 분리 필수
- **Slack Socket Mode** — Cloud Run `min/max-instances=1` 필수 (분산 시 누락/중복)
- **Postgres 권장** > Firestore (잡 FSM, 관계형 데이터, race condition 해결)
- **Cloud IAP + Google Workspace SSO** — 2-4시간 셋업
- **GKE Agent Sandbox (2026-05 Preview)** — Molly 같은 AI agent 에 최적화. GA 시 마이그레이션 후보
- **GitHub Actions + Workload Identity Federation** > Cloud Build (코드가 GitHub 에 있으니)

---

## 목표 / 비-목표

**목표:**
- 5-20명 팀이 안정적 사용 가능
- Moloco Google Workspace SSO
- 사용자별 격리 (잡, playground, LLM 비용)
- 자동 백업 / DR
- 운영 비용 가시화

**비-목표:**
- 외부 (Moloco 밖) 사용자 — 사내 도구만
- 50명+ 확장 — 그 시점에 SOC 2 / VPC SC 추가 별 plan
- Customer 데모 — 정식 prod 가 아닌 사내 도구

---

## 단계 요약

| Phase | 기간 (처음 / 익숙) | 효과 |
|-------|-------------------|------|
| **P1 MVP** | 2-4일 / 1-1.5일 | Cloud Run + 3 frontend + IAP + GCE worker 1대 → 5명 안정적 사용 |
| **P2 Sandbox 본격** | 3-5일 / 1.5-2일 | GKE Autopilot + KEDA → 10-20명 격리 / scale-to-zero |
| **P3 Hardening** | 5-7일 / 2-3일 | Postgres 마이그 + RLS + audit log + Cloud Billing alert |
| **합계** | **10-16일** / 4.5-6.5일 | 정식 운영 수준 |

---

## Phase 1 — MVP (2-4일)

목표: 5-10명이 Slack/web 접속 가능. Sandbox 는 단순 GCE VM 1대.

### Task 1.1 — Cloud Run 배포 (0.5일)
- **orchestrator** → Cloud Run service
  - `min-instances=1`, `max-instances=1` (Slack Socket Mode 단일성)
  - `instance-based billing` (Socket Mode 가 always-on)
  - 메모리 1-2GB, CPU request-based (LLM 호출은 I/O bound)
- **playground-app / dashboard / design-system-site** → Cloud Run (또는 Firebase Hosting — 더 단순)
- Cloud Run service URL 4개 발급

### Task 1.2 — Identity-Aware Proxy (IAP) + SSO (0.5일)
- HTTPS Load Balancer 4개 (각 surface) 또는 단일 LB + 경로 분기
- IAP 활성화 → OAuth 동의 화면 (Google Workspace admin 권한 필요)
- IAM 에 팀원 이메일 `roles/iap.httpsResourceAccessor` 부여
- 함정: WebSocket 은 IAP 통과 못 함 → Slack Socket Mode 는 IAP 우회 (service account)

### Task 1.3 — Secret Manager (0.25일)
```bash
# Anthropic / Slack / GitHub PAT 등록
gcloud secrets create anthropic-api-key --data-file=key.txt
gcloud secrets create slack-bot-token --data-file=token.txt

# Cloud Run service 에 주입
gcloud run services update orchestrator \
  --set-secrets=ANTHROPIC_API_KEY=anthropic-api-key:latest,SLACK_BOT_TOKEN=slack-bot-token:latest
```
- Workload Identity → service account 가 secret 자동 read

### Task 1.4 — GCE worker VM (sandbox) (0.5일)
- e2-standard-4 (4 vCPU / 16GB) VM 1대
- Docker daemon 설치 + Docker socket 노출 (SSH 또는 internal API)
- orchestrator 의 `tooling/sandbox-manager/src/container.js` 를 GCE 에 SSH/API 호출하도록 변경
- 한계: VM 1대 = 동시 잡 ~6-8 개 (M1 laptop 과 동일 capacity). P2 에서 확장

### Task 1.5 — file-based state → GCS FUSE (0.25일)
- GCS bucket 생성: `gs://moloco-molly-state`
- Cloud Run service 에 GCS FUSE volume mount
- `state/` 경로를 그대로 GCS 에 mount → 코드 변경 없음
- 한계 (R3): race condition 미해결, latency ↑. **임시 방편**. P3 에서 Postgres 로 본격 마이그

### Task 1.6 — CI/CD (0.5일)
- GitHub Actions workflow:
  - `.github/workflows/deploy-orchestrator.yml` — push to main → Cloud Run deploy
  - `.github/workflows/deploy-frontends.yml` — matrix strategy로 3개 frontend 동시 빌드 / 배포
- Workload Identity Federation (service account key 없이 GCP 인증)

### Task 1.7 — 운영 검증 (0.5-1일)
- 팀원 5명 안내 → Slack `@molly` + Web UI 접속
- 1-2일 운영 → metric 수집 (잡 수 / LLM 비용 / cold start)
- 운영 issue 발견 시 fix

**P1 DoD:**
- [ ] 4개 Cloud Run service 실행 + HTTPS endpoint 발급
- [ ] IAP 활성화 + @moloco.com 도메인 화이트리스트
- [ ] Secret Manager 로 모든 secret 주입
- [ ] GCE worker VM 에서 sandbox spawn 작동
- [ ] GCS FUSE state mount 작동
- [ ] GitHub Actions CI/CD 4개 workflow 작동
- [ ] 팀원 5명이 1-2일 안정적 사용

---

## Phase 2 — Sandbox 본격 (3-5일)

목표: 10-20명 격리 + scale-to-zero (비용 절감).

### Task 2.1 — GKE Autopilot 클러스터 (0.5일)
```bash
gcloud container clusters create-auto molly-sandbox \
  --region=us-central1 \
  --workload-pool=PROJECT_ID.svc.id.goog
```
- Workload Identity 활성화
- Artifact Registry 연동 (sandbox image push 용)

### Task 2.2 — sandbox Dockerfile (0.5일)
- Vite + Node + pnpm + 의존성 사전 install
- Image Streaming 호환 (Artifact Registry 에 push)
- Cold start 수 초 (GKE Image Streaming)

### Task 2.3 — orchestrator → Kubernetes Job spawn (1-2일)
- `container.js` 의 `docker run` → `@kubernetes/client-node` Job API 로 교체
- 사용자별 namespace 분리 (NetworkPolicy + ResourceQuota)
- 작업 시간 추정: 50-100 call sites, 적절한 abstraction

### Task 2.4 — Networking (Vite HMR 포트 노출) (1일)
- 사용자별 Service + Ingress
- HMR WebSocket 포트 노출
- 사용자별 hostname (예: `pg-<userId>-<pgId>.playground.molly.your-domain.com`)

### Task 2.5 — KEDA scale-to-zero (0.5일)
- KEDA 설치 + Pub/Sub trigger
- 사용자 idle 시 → KEDA 가 Pod scale-to-zero
- 사용자 재접속 시 → cold start (Image Streaming 으로 수 초)

### Task 2.6 — Security 레이어 (0.5일)
- NetworkPolicy — default-deny, namespace 간 트래픽 차단
- ResourceQuota per namespace — CPU/memory cap
- Workload Identity per namespace — GCP API 격리

**P2 DoD:**
- [ ] GKE Autopilot 클러스터 운영
- [ ] orchestrator 가 K8s Job API 로 sandbox spawn
- [ ] 사용자별 namespace 격리
- [ ] KEDA scale-to-zero 작동
- [ ] 동시 사용자 10명+ 검증

**옵션 — GCE Spot VM Pool 대안 (저렴):**
- GKE Autopilot 대신 GCE Spot VM pool ($54/월 vs $100-200)
- 단점: preemption 핸들링 직접 구현
- 5-10명 규모면 GKE 가 더 깔끔

**옵션 — GKE Agent Sandbox (2026-05 Preview):**
- 2026 H2 GA 예상
- Molly 같은 AI agent 에 최적화 (gVisor + Kata Containers)
- 300 sandbox/sec, sub-second cold start
- GA 시 P2 끝나고 마이그레이션 검토

---

## Phase 3 — Hardening (5-7일)

목표: 정식 운영 수준 — 데이터 격리, 백업, 비용 통제, audit.

### Task 3.1 — Postgres 마이그레이션 (7일)
R3 리서치 권장 — Cloud SQL Postgres `db-f1-micro`.

#### 3.1.1 Schema 설계 (0.5일)
- `jobs` (FSM ENUM, playground FK, user_id)
- `playgrounds` (Docker state, user_id)
- `requests`
- `chat_messages`
- `slack_thread_map`
- `audit_log`

#### 3.1.2 Repository layer (1.5일)
- `state/jobs.js`, `state/playgrounds.js`, `state/requests.js`, ...
- 인터페이스: `getX(id)`, `saveX(obj)`, `listX(filter)`
- Adapter pattern: `FileAdapter` (현재) ↔ `PostgresAdapter` (새)

#### 3.1.3 Call site 교체 (2일)
- 기존 `fs.readFileSync` / `fs.writeFileSync` → repository 호출
- 50-100 call sites, async/await 전환 포함

#### 3.1.4 Migration script (0.5일)
- 기존 GCS 의 JSON → Postgres INSERT

#### 3.1.5 Race condition 처리 (0.5일)
- FSM 상태 변경 시 `BEGIN ... SELECT FOR UPDATE ... UPDATE ... COMMIT`

#### 3.1.6 Dual-write bridge mode (0.5일)
- `DB_MODE=dual` → file + DB 동시 write (검증 기간)
- `DB_MODE=db` → DB only (cutover)
- env 변경만으로 즉시 rollback

#### 3.1.7 테스트 (1일)
- FSM correctness (상태 전이 단위 테스트)
- Concurrent write (Promise.all 동시 호출)
- Migration script 검증

#### 3.1.8 cutover (0.5일)
- `DB_MODE=dual` → `DB_MODE=db`
- GCS state 파일 백업 후 archive

### Task 3.2 — Postgres RLS (0.5일)
```sql
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobs_isolation ON jobs
  USING (
    user_id = current_setting('app.current_user_id')
    OR current_setting('app.role') = 'admin'
  );
```
- Cloud Run 이 IAP 의 `X-Goog-Authenticated-User-Email` header 받아서 `app.current_user_id` 설정
- 코드에서 빠뜨려도 DB 가 차단

### Task 3.3 — Audit log (0.5일)
```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_id TEXT,
  llm_cost_usd DECIMAL(10,6),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
- 잡 생성/취소/Promote, plan emit, qa, LLM 호출 (이미 `d07101e` commit 의 비용 데이터)

### Task 3.4 — Cloud Billing Budget Alert (0.25일)
- GCP 전체 / Anthropic API 별 / 사용자별 budget
- 50% / 90% / 100% 임계 → Slack 알림
- 사용자별 일일 token soft limit (앱 레이어)

### Task 3.5 — Backup / DR (0.5일)
- Cloud SQL PITR (Enterprise edition 기본 7일)
- GCS state archive (P1 GCS FUSE 데이터 보존)
- DR 절차 문서 — Cloud SQL 인스턴스 손실 시 복구 단계

### Task 3.6 — Observability (0.5일)
- OpenTelemetry GenAI Semantic Conventions
  - `gen_ai.request.model` / `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens`
  - `user.id` custom attribute
- Cloud Logging → BigQuery export → 사용자별 LLM 비용 대시보드

### Task 3.7 — HTTP Events API 검토 (옵션, 0.5일)
- Slack Socket Mode → HTTP Events API
- Cloud Run scale-to-zero 가능
- 단점: 인터넷 노출 endpoint, IAP 와 충돌 (Slack 서버는 Google 인증 안 됨)
- 결정: 50명+ 확장 시 검토. P3 에선 Socket Mode 유지

**P3 DoD:**
- [ ] Postgres 마이그레이션 완료, dual-write → cutover
- [ ] RLS 활성화, admin / member role
- [ ] Audit log 모든 액션 기록
- [ ] Cloud Billing Budget Alert 설정
- [ ] Cloud SQL PITR 활성화
- [ ] OTel GenAI 메트릭 수집 + 대시보드

---

## 비용 (월간 추정)

| Phase | GCP 비용 | Anthropic API |
|-------|---------|--------------|
| P1 MVP (5명) | $50-100 | 별도 |
| P2 +GKE (10명) | $100-200 | 별도 |
| P3 +Cloud SQL (20명) | $150-300 | 별도 |

상세:
- Cloud Run `min=1` orchestrator: ~$15-25/월
- 3 frontend Cloud Run: ~$10-20/월
- GCE e2-standard-4 worker (P1) 또는 GKE Autopilot (P2): $50-150/월
- Cloud SQL db-f1-micro: $10-30/월
- Cloud Storage / Logging: $5-10/월
- Load Balancer + IAP: $20-30/월

---

## 위험 / footguns

| Risk | Mitigation |
|------|-----------|
| Cloud Run min=1 의 always-on 비용 | Socket Mode 의 본질적 한계. Sonnet 모델 다운으로 LLM 비용 더 큰 절감 |
| GCS FUSE race condition | P1 만 임시. P3 의 Postgres cutover 가 본격 해결 |
| IAP + WebSocket 미지원 | Slack Socket Mode 는 IAP 우회 (service account). Web frontend 만 IAP |
| K8s Job 마이그레이션 학습 곡선 | 1인 처음 = 3-5일, 익숙 = 1.5일. 단계적 도입 |
| Cloud SQL 마이그레이션 cutover risk | Dual-write bridge mode 1주 → 검증 후 cutover |
| Anthropic API key 단일 사용 → rate limit | 사용자별 key 발급 (Console 1분) + 앱 레이어 분리 |
| GKE Agent Sandbox 미 GA | P2 는 GKE Autopilot 으로 시작 → GA 시 마이그레이션 |
| Postgres FSM 동시 update | `SELECT FOR UPDATE` 트랜잭션 + 단위 테스트 |
| 백업 누락 | Cloud SQL 자동 PITR + 수동 export → GCS 주간 |

---

## 결정 framework

### Phase 1 시작 시점
- 로컬 시범 운영 1-2주 통과 후
- 일일 잡 수 충분히 누적 (~수십 잡)
- 사용 패턴 명확화 (peak 시간, 컨테이너 동시 수)

### Phase 2 시작 시점
- P1 운영 1-2주 통과
- 동시 사용자가 P1 의 GCE VM 1대 capacity 초과 (peak 6-8 컨테이너)
- 또는 10명+ 확장 결정

### Phase 3 시작 시점
- P2 운영 1-2주 통과
- GCS FUSE race condition 사고 발생 (또는 발생 우려)
- Compliance 요구 (audit log 추적 필요)
- 사용자 20명+ 또는 외부 데이터 격리 필수

---

## 추천 path 변형

### 최소 path (5-10명, 단순)
- P1 만 진행 → GCS FUSE state, GCE worker VM
- P2 / P3 는 사용자 수 증가 시 진행
- 총 시간: **2-4일**

### 권장 path (10-20명, 정식 운영)
- P1 → P2 → P3 순차
- 총 시간: **10-16일** (한 사람 처음)

### 최단 path (절대 빨리, 단 비용 큼)
- P1 + P3 직접 (P2 건너뛰고 GCE worker pool 큰 VM 으로)
- Postgres 마이그 같이 진행
- 총 시간: **7-10일**

---

## 다음 단계

1. 로컬 시범 운영 (`2026-05-11-local-share-cloudflare-tunnel.md`) 시작
2. 1-2주 운영 → 사용 패턴 측정
3. P1 시작 결정 — measurement 결과로 GCE VM size / IAP 정책 / sandbox concurrency 정확화
4. P1 진행 → 5명 운영
5. 사용자 수 증가 따라 P2 → P3

---

## References

리서치 결과:
- R1 (로컬 vs GCP 비교): 5-10명에 로컬 SPOF 위험, M1 16GB 6-8 컨테이너 한계
- R2 (GCP 배포 패턴): Cloud Run nested Docker 불가, Slack Socket Mode min=1 필수
- R3 (state migration): Postgres 권장 (7일), GCS FUSE 는 임시
- R4 (sandbox 격리): GKE Autopilot + KEDA 권장, GKE Agent Sandbox Preview
- R5 (multi-tenant): Cloud IAP + RLS + audit log 파일럿부터

선행 plan:
- `2026-05-11-local-share-cloudflare-tunnel.md` (로컬 2명 시범)
- `2026-05-07-molly-ds-loop-v2-research-informed.md` (DS 루프 v2 — S0/S2 진행 중)

GCP 공식 문서:
- Cloud Run, Cloud IAP, GKE Autopilot, Cloud SQL PITR, GCS FUSE, KEDA, Workload Identity
- GKE Agent Sandbox (2026-05 Preview)
- OpenTelemetry GenAI Semantic Conventions
