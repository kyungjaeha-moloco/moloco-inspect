# Playground M0 Spike — Feasibility Report

**Date:** 2026-04-22
**Goal:** v3 Section 14 — 5 experiments (E1~E5) to validate architectural assumptions before M1a.
**Test sandbox:** reused `inspect-23d7769f` (Vite on :51421, OpenCode on :51420) for E1/E2. Built new `moloco-inspect-sandbox:v3-test` image for E3.

## Summary

| # | Name | Status | Key measurement |
|---|---|---|---|
| E1 | Iframe HMR (WebSocket event) | **PASS** | connect 36ms / file-touch → WS `js-update` ≤ 2.8s |
| E2 | Mass Change via git checkout | **PASS (w/ caveat)** | checkout → WS update 1.7s. ⚠️ husky pre-commit adds 3-5s per commit |
| E3 | Supervisor + docker stop/start | **PASS (w/ caveats)** | opencode auto-resume ✓. vite needs explicit start (~8s). ⚠️ ephemeral ports change on restart |
| E4 | Fiber/Source/testId 수집률 | **STATIC ANALYSIS — plan revision needed** | testid 커버리지 **0.97%** (2158 중 21 파일). selector + fiber detection이 주, testid는 보조 |
| E5 | Rapid-fire change-requests | **SKIPPED** | 요구: persistent sandbox API (M1b). spike 스코프 외 |

### Go / No-Go

**GO** — M1a 착수 가능. 단, 아래 **plan v3 조정 사항 3개**를 v3.1 addendum으로 반영 후 진행.

---

## E1 — Iframe HMR (WebSocket)

**Setup**
- Sandbox: inspect-23d7769f, Vite on :51421
- Probe: `ws://localhost:51421/` (vite-hmr subprotocol) via Node 22 native WebSocket
- Trigger: `docker exec ... echo '// hmr-probe' >> MCOmsMainNavbarContainer.tsx` (2회)

**Results**
```
[hmr] open +36ms
[hmr] +37ms  {"type":"connected"}
[hmr] +2817ms {"type":"update","updates":[{"type":"js-update",...}]}   ← 1st edit
[hmr] +7891ms {"type":"update","updates":[{"type":"js-update",...}]}   ← 2nd edit
```

**Findings**
- WS 연결 ~36ms
- File write → `js-update` 이벤트 도달 **< 3초**. 실 HMR 반영(브라우저 렌더)은 여기에 +수백ms 추가 예상 → **총 체감 ≤ 3.5초** (v3 target "3초" 거의 충족, caveat 있음)
- `partial HMR` 달성 (js-update), full reload 아님
- acceptedPath가 수정 파일과 동일 → React fast-refresh 성립

**PASS**

---

## E2 — Mass Change via git checkout

**Setup**
- Sandbox: inspect-23d7769f (같은 인스턴스)
- Commit 2회 생성: sha1, sha2 (MCOmsMainNavbarContainer.tsx 수정)
- `git checkout sha1` → 이전 상태로 이동 → HMR WS 관측

**Results**
```
[hmr] +27ms    {"type":"connected"}
[hmr] +1761ms  {"type":"update",...}   ← 위 checkout 후
[hmr] +6914ms  {"type":"update",...}   ← 다음 checkout (tip 복귀) 후
```

**Findings**
- `git checkout <sha>` 후 Vite가 mtime 변경 감지 → WS update ~1.7s
- 여기서 "mass change"는 실제로 1 파일만이었으므로 full-scale 검증은 M1b에서 재수행 필요
- **husky + lint-staged + prettier + eslint** 가 commit 마다 3~5초 부가 (중요)
- `git push` 시도: `origin` 없음 → 실패 (synthetic repo라 예상된 결과)

**Plan impact**
- Commit-per-request 파이프라인은 **`git commit --no-verify`** 사용 필수. 아니면 request 당 ~5초 부가.
- Plan v3 Section 3.2 에 `--no-verify` 명시 추가

**PASS (with caveat)**

---

## E3 — Supervisor + docker stop/start

**Setup**
- 새 이미지 `moloco-inspect-sandbox:v3-test` 빌드 (베이스 + `supervisord` + `tini`)
- `supervisord.conf`: opencode autostart, vite autostart=false (orchestrator control)
- 시퀀스: run → opencode up → `supervisorctl start vite` → stop → start → verify

**Results**

```
# After docker run
opencode   RUNNING pid 8, uptime 0:00:03
vite       STOPPED Not started

# After supervisorctl start vite (8s)
opencode   RUNNING pid 8, uptime 0:00:17
vite       RUNNING pid 48, uptime 0:00:14
opencode /global/health → {"healthy":true,"version":"1.4.3"}

# After docker stop → docker start
stop took 1s
start returned 0s
(after 5s)
opencode   RUNNING pid 8, uptime 0:00:04    ← auto-restarted
vite       STOPPED Not started              ← needs orchestrator trigger

# supervisorctl start vite (again, 8s)
vite       RUNNING ✓
```

**Key additional finding (port drift)**

```
before stop/start: OC=55002 VITE=55003
after  stop/start: OC=55004 VITE=55005
❌ Ephemeral ports (-p 0:4096) CHANGE across docker stop/start
```

**Findings**
- ✅ supervisord 구조 유효. OpenCode PID 1에서 분리되어 관리됨
- ✅ `docker stop` (1s) + `docker start` (instant) 원활
- ✅ opencode autostart=true → resume 시 자동 부활
- ⚠️ Vite autostart=false 설계대로 — resume endpoint가 `supervisorctl start vite` 호출 필수 + ~8초 readiness 대기
- ❌ **포트가 restart 시 바뀜**: orchestrator는 매 resume 후 `docker port` 재조회해서 `vitePort/opencodePort` state 갱신 필요

**Plan impact**
- v3 Section 2.2 "resume endpoint" 에 명시:
  1. `docker start <container>`
  2. `docker exec <container> supervisorctl start vite`
  3. **`docker port <container>` 재조회** → playground state의 vitePort/opencodePort 갱신 ← v3.1 추가
  4. Vite `/` fetch 로 readiness 대기 (timeout 20s)
- Playground 영속 state 에 vitePort/opencodePort 는 **runtime-only** (resume마다 덮어씀), URL은 UI에서 매번 재요청

**PASS (with 3 caveats)**

---

## E4 — Element Picker data source coverage

**Setup**
- 정적 분석 (브라우저 없이). msm-portal-web src 내 `*.tsx` 파일 대상
- fiber detection은 브라우저·Playwright 필요 → spike 스코프 외
- testid만 grep 측정

**Results**
```
Total .tsx components:  2158
Files with data-testid:   21  (0.97%)
Total data-testid usages: 29
```

**Findings**
- **testid 커버리지 매우 낮음**. 전체의 1% 미만 파일만 보유
- 선택기의 1차 식별자는 **CSS selector + DOM path**여야 함. testid는 보조 hint.
- fiber detection (`__reactFiber$`) 과 `_debugSource` 는 dev-only React 내부 속성이므로 추가 측정 필요 — 이건 M3 구현 중 실 환경에서 수행

**Plan impact**
- v3 Section 12 (M3 Vite 플러그인) picker 식별 우선순위 순서 명확화:
  1. **`data-testid`** (있으면)
  2. **`__reactFiber$` → component displayName** (fiber walker)
  3. **CSS selector path** (nth-child 포함)
  4. `_debugSource` → sourceFile:line (best-effort, dev-only)
- 오늘의 Chrome Ext content-script는 이미 이 순서와 유사 — 재사용 가능

**STATIC ANALYSIS PASS — fiber 실측은 M3 구현 중 수행**

---

## E5 — Rapid-fire sequential change-requests

**Status:** SKIPPED.

Rapid-fire 테스트는 **persistent sandbox API**가 필요 (v3 M1b 산출물). Spike에서는 구현하지 않음.

대신 E2에서 간접 검증: 같은 sandbox에 2회 연속 commit → 상태 정합. MVP 수준 입증 완료.

---

## Plan v3 → v3.1 Addendum (이 스파이크 결과 반영)

아래 항목들은 v3를 v3.1로 갱신하며 편입:

### A1 — E2 caveat: commit-per-request
- Section 3.2 에 `git commit --no-verify` 명시
- Rationale: msm-portal에 husky+lint-staged가 걸려 있어 commit 당 3~5초 추가

### A2 — E3 caveat: resume 시 포트 재조회
- Section 2.2 resume 절차에 "4. `docker port` 재조회 후 state 갱신"
- Playground state의 `vitePort/opencodePort` 는 **휘발성 기록**이라고 명시
- UI (playground-app)는 매 페이지 로드 시 `/api/playground/:id` 재요청해 현재 포트 받음

### A3 — E3 caveat: Vite readiness wait
- Resume 엔드포인트는 `supervisorctl start vite` 호출 후 HTTP 200 응답 때까지 wait (polling 0.5s × 40회 = 20s timeout)
- 실패 시 `status='crashed'` + UI에 "Vite 시작 실패, 재시도"

### A4 — E4 impact: picker 식별 우선순위
- Section 12 Vite 플러그인 picker 순서:
  1. data-testid
  2. fiber displayName
  3. CSS selector path
  4. debugSource (fallback)

---

## 다음 작업

1. ✅ M0 Spike 완료 (이 문서)
2. 이 리포트 기반 v3.1 addendum 작성 (상단 A1~A4)
3. **M1a 착수** (Playground CRUD + state 영속화)

---

## Appendix — 가공하지 않은 로그

- `/tmp/e1-hmr.log` — E1 WS 이벤트 로그
- `/tmp/e2-hmr.log` — E2 WS 이벤트 로그
- `/tmp/e3-ctx/Dockerfile` — supervisor 테스트 이미지 빌드 정의
- `sandbox/supervisord.conf`, `sandbox/scripts/start-vite.sh` — 스파이크에서 작성한 실 설정 (M1b에 반영 예정)
