# Plan — 로컬 머신 임시 공유 (2명 시범 운영, Cloudflare Tunnel)

**Date:** 2026-05-11
**Author:** kyungjae.ha (with Claude)
**Status:** 리서치 완료 → 사용자 결정 대기
**Estimate:** ~5-6시간 (셋업 + 검증)
**관련 plan:** `docs/superpowers/plans/2026-05-11-gcp-deploy-phased.md` (정식 배포는 별 문서)

---

## 배경

다음 주부터 사용자 본인 + 팀원 1명 (총 2명) 이 Molly 시범 운영. 1-2주 후 사용 패턴 확인되면 GCP 정식 배포로 전환.

2명 규모라 M1 laptop 자원 (CPU/메모리) 한계 안 닿음 (M1 Pro 16GB → 6-8 컨테이너 가능). SPOF 위험 낮음 — 사용자 본인 환경이므로 신뢰 가능.

5명 researcher 외부 리서치 결과 종합:
- Cloudflare Tunnel + Cloudflare Access (Google SSO) 가 가장 권장. 무료 영구 도메인, 50 user 무료 layer.
- ngrok 무료 tier 는 인터스티셜 페이지 + 임시 URL → 부적합
- Tailscale 은 팀 VPN 메시 — 더 안전하지만 팀원 설치 부담
- macOS sleep/wake 시 Docker race — `caffeinate -s` + 자동 reconnect 로 완화

---

## 목표 / 비-목표

**목표:**
- 2명이 다음 주부터 Slack `@molly` + Playground UI + Dashboard 사용 가능
- 안전한 인증 (Moloco Google Workspace 도메인 화이트리스트)
- macOS sleep/wake 후 자동 복구
- 좀비 프로세스 누적 차단 (병행 fix)
- 1-2주 운영 후 GCP 전환 (별 plan 문서)

**비-목표:**
- 5명+ 확장 — 2명에 최적화, 확장은 GCP 로 가야 함
- 격리된 multi-tenant — 2명이라 신뢰 기반. Postgres RLS 같은 격리 X
- Slack listener 단일 인스턴스 보장 — Cloud Run min/max=1 같은 기능 없음. 사용자 본인이 인스턴스 1개만 띄움
- 24/7 SLA — laptop 켜져 있어야 작동

---

## 작업 — 4 슬라이스

### 슬라이스 A — 좀비 fix + dev script 정리 (≈1시간) 🟢 즉시

**문제**: 어제 발견 — `pnpm dev` 가 백그라운드 spawn 후 부모 shell detach 시 nodemon orphan 됨. 누적되면 EADDRINUSE 로 새 spawn 못 함.

**옵션 1 (Tier 1+옵션 1 조합)**:

`orchestrator/package.json`:
```json
"dev": "trap 'kill 0' EXIT INT TERM; lsof -ti :3847 | xargs kill -9 2>/dev/null; node --watch server.js"
```

`playground-app/package.json`:
```json
"dev": "trap 'kill 0' EXIT INT TERM; lsof -ti :4180 | xargs kill -9 2>/dev/null; vite"
```

`dashboard/package.json`:
```json
"dev": "trap 'kill 0' EXIT INT TERM; lsof -ti :4174 | xargs kill -9 2>/dev/null; vite"
```

**근거**: trap 으로 부모 죽으면 process group 전체 종료, 시작 시 좀비 청소. 1줄 변경 × 3 파일.

**한계**: 증상 청소이지 근본 해결 아님. 백그라운드 spawn detach 자체는 안 막음. 근본 fix (PM2 / launchd) 는 GCP plan 에서 다룸 — 어차피 GCP 배포 시 PM2 / Cloud Run 으로 대체됨.

### 슬라이스 B — Cloudflare Tunnel + Access 셋업 (≈3시간) 🟡 다음 주 시작 전

#### B.1 도메인 준비 (5분)
- Moloco 도메인 사용 또는 개인 도메인 사용 (예: `*.molly.your-domain.com`)
- Cloudflare 에서 DNS 관리 활성화

#### B.2 cloudflared 설치 + 터널 생성 (30분)
```bash
brew install cloudflared

# 인증 (브라우저로 Cloudflare 로그인)
cloudflared tunnel login

# 터널 생성
cloudflared tunnel create molly-internal

# DNS route 등록 (3개 surface)
cloudflared tunnel route dns molly-internal orchestrator.molly.your-domain.com
cloudflared tunnel route dns molly-internal playground.molly.your-domain.com
cloudflared tunnel route dns molly-internal dashboard.molly.your-domain.com
```

#### B.3 config.yml (15분)
`~/.cloudflared/config.yml`:
```yaml
tunnel: molly-internal
credentials-file: ~/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: orchestrator.molly.your-domain.com
    service: http://localhost:3847
  - hostname: playground.molly.your-domain.com
    service: http://localhost:4180
    originRequest:
      noTLSVerify: true
  - hostname: dashboard.molly.your-domain.com
    service: http://localhost:4174
  - service: http_status:404
```

#### B.4 터널 실행 (10분)
```bash
# 일회성 실행 (테스트)
cloudflared tunnel run molly-internal

# 백그라운드 service 로 등록 (재부팅 후 자동 시작)
sudo cloudflared service install
```

#### B.5 Cloudflare Access (Google SSO) (1.5시간)
Cloudflare Zero Trust 대시보드 → Access → Applications:

1. **Add an application** → Self-hosted
2. **Application domain**: `*.molly.your-domain.com`
3. **Identity provider**: Google → Google Workspace 가 아닌 일반 Google OAuth (Workspace 그룹 동기화 안 함, 이메일 도메인만)
4. **Policies**:
   - Policy 1 (Allow): Email domain ends with `@moloco.com`
   - 그룹 sync 안 함 (overkill)
5. **Session duration**: 24h
6. **JWT TTL**: 기본 24h (퇴사 시 즉시 만료 안 됨 — 2명 시범 운영엔 무관)

**함정 (R1 리서치)**: Workspace 앱 자체를 Access 뒤에 두면 인증 루프. 우리는 사내 도구만 Access 적용 → 함정 회피.

### 슬라이스 C — macOS 절전 / Docker 안정성 (≈30분) 🟡

#### C.1 절전 방지
```bash
# AC 전원 연결 시 sleep 방지 (가장 안전)
caffeinate -s &

# 또는 GUI: Amphetamine 앱 설치 + 스케줄 (사무실 시간만 동작)
```

#### C.2 Docker race fix 확인
이미 적용됨 (commit `f43a9df` — reattach docker race + UI resume). 별 추가 작업 없음. sleep/wake 후 30초 정도 컨테이너 재연결 race 가능 — UI 의 [재개] 버튼으로 복구 가능.

#### C.3 Slack listener 단일 인스턴스 보장
2명 시범 운영이라 사용자 본인 머신에서 1개만 띄우면 됨. 만약 사용자가 실수로 2개 띄우면 → 슬라이스 A 의 `lsof | kill` 이 자동 차단.

### 슬라이스 D — 운영 가이드 + 사용자 onboarding (≈1시간) 🟢

#### D.1 팀원 1명 (시범 사용자) 안내 문서
`docs/superpowers/handoffs/2026-05-NN-team-pilot-onboarding.md`:

```markdown
## Molly 시범 운영 가이드 (2명)

### Slack 사용
1. #molly-pilot 채널 (또는 DM)
2. `@molly <PRD>` 형태로 멘션
3. 그 후 흐름은 Slack 안에서 (plan 승인 → 작업 → QA → Promote)

### Web UI 사용
1. https://playground.molly.your-domain.com → Google 로그인 (@moloco.com)
2. https://dashboard.molly.your-domain.com → Inspect Console

### 알려진 한계
- 사용자 머신이 sleep 되면 일시 중단 (laptop 켜져 있어야 함)
- 사용자 2명 = 신뢰 기반 격리 X (서로 잡 / playground 볼 수 있음)
- 다음 주 1-2주 운영 후 GCP 로 전환 예정
```

#### D.2 운영 모니터링
- `tail -f /tmp/moloco-orchestrator.log` — 사용자 본인 로그 watch
- LLM 비용 추적 (commit `d07101e`) — Dashboard Overview 에서 확인
- 좀비 프로세스 — 슬라이스 A 의 dev script 가 자동 차단

---

## 검증

### 자동
- 좀비 fix: `pkill -f "server.js" && pnpm dev` 두 번 연속 — 두 번째도 정상 시작
- Tunnel: `curl https://orchestrator.molly.your-domain.com/api/health` — 200 응답
- SSO: 다른 브라우저 (시크릿 모드) 에서 접속 → Google 로그인 강제 → 비 Moloco 계정 거부

### 수동
- 팀원 1명이 Slack 에서 `@molly` 멘션 → plan 받음 → 승인 → 잡 commit
- 팀원이 Playground UI 접속 → 본인 잡 카드 확인 가능
- laptop sleep 시뮬레이션 (Apple > Sleep) → 깨운 후 5분 내 자동 복구 확인

---

## 위험 / footguns

| Risk | 발생 가능성 | Mitigation |
|------|------------|-----------|
| laptop sleep / 셧다운 | 매일 | `caffeinate -s` + AC 전원 항상 연결 |
| 사무실 ↔ 집 이동 시 IP / 네트워크 변경 | 매일 | Cloudflare Tunnel 자동 reconnect (수 초 내) |
| Docker race (sleep/wake) | 매 sleep | 이미 fix 됨 (`f43a9df`). UI 재개 버튼 |
| 2명 사이 잡 격리 X | 항상 | 2명 신뢰 기반. GCP 전환 시 user_id 격리 도입 |
| Anthropic API rate limit | 운영 빈도 따라 | 사용자별 API key 분리 (Anthropic Console 에서 1분) |
| Slack listener 중복 | 사용자 실수 | `lsof | kill` 이 자동 차단 |
| 본인 laptop 고장 | 드물지만 치명적 | state 가 git untracked — 손실 가능. GCP 전환 시 해결 |
| JWT TTL 24h (Cloudflare Access) | 2명 운영 무관 | 50명+ 확장 시 검토 |

---

## 완료 기준 (DoD)

- [ ] 슬라이스 A — 3개 package.json `dev` 스크립트 trap + lsof 추가, 검증 통과
- [ ] 슬라이스 B — `*.molly.your-domain.com` 3개 surface 접근 가능, Google SSO 작동, @moloco.com 만 허용
- [ ] 슬라이스 C — `caffeinate -s` 자동 시작, Docker race 복구 검증
- [ ] 슬라이스 D — 팀원 1명 onboarding 문서 + Slack 시도 성공
- [ ] 다음 주 1주 운영 — 큰 incident 없이 통과
- [ ] 1-2주 운영 후 GCP 전환 plan 활성화 (`2026-05-11-gcp-deploy-phased.md`)

---

## 1-2주 운영 후 measurement

GCP 전환 전 측정할 것:
- 일일 잡 생성 수 (2명 합산)
- 평균 잡 lifecycle 시간 (PRD → Promote)
- LLM 비용 / 일 (commit `d07101e` 데이터)
- laptop sleep 으로 인한 다운타임 시간
- 컨테이너 동시 spawn 수 — 2명 운영에서 실제 peak

→ GCP Phase 1 MVP 의 instance size / sandbox 옵션 결정 입력

---

## 작업 순서 (권장)

1. 슬라이스 A 먼저 (1시간) — 좀비 fix
2. 슬라이스 C (30분) — 절전 방지
3. 슬라이스 B (3시간) — Cloudflare Tunnel + Access
4. 슬라이스 D (1시간) — 팀원 onboarding
5. 24h 운영 검증 — 사용자 본인이 다음날 동일 환경에서 작동 확인
6. 팀원 1명 시작 → 1-2주 운영

총 시간: **~5-6시간** (한 번 완성). 그 후 매일 운영 비용은 거의 0.

---

## References

리서치 결과:
- R1: Cloudflare Tunnel vs ngrok vs Tailscale — Cloudflare 무료 영구 도메인, 50 user 무료
- macOS sleep/wake Docker race — 이미 fix (`f43a9df`)
- M1 Pro 16GB Docker 한계 — 6-8 컨테이너 (2명에 충분)
- Cloudflare Access Google OAuth — 인증 루프 함정 회피 (사내 도구만 Access)

선행 plan / handoff:
- `2026-05-07-molly-ds-loop-v2-research-informed.md` (S0-S5 진행 중)
- `2026-05-06-reattach-archive-race-fix.md` (Docker race fix)
- `2026-04-30-multi-tenant-v1.md` (multi-tenant 초기 — 2명은 격리 안 함)
