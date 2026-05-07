# Plan — reattach race 로 인한 false-archive 방지

**Date:** 2026-05-06
**Author:** kyungjae.ha (with Claude)
**Predecessor:** 2026-05-06-sub-phase-c-finalize 직후 운영 중 발견된 사고
**Estimate:** ~0.5 day
**Branch:** main → 작업 가능 (clean)

---

## 배경 — 무엇이 일어났나

2026-05-06 18:00 경, 사용자가 archive 액션 한 적 없는데 8개 playground 가 모두 `archived` 상태로 마킹됨. UI 의 "보관" 섹션으로 모두 이동.

### 사고 추적

1. orchestrator 부팅 → `reattachOnStartup()` (`playground.js:919`) 가 8개 playground 각각에 대해 `docker inspect -f "{{.State.Running}}" ${name} 2>/dev/null || echo MISSING` 실행
2. **8건 모두 `MISSING` 판정** → status='archived' 마킹 → state JSON 저장
3. 그러나 사고 직후 동일 명령을 손으로 돌리면 **8개 모두 `false` 정상 응답** (stopped, exists)
4. 즉, 부팅 시점 docker daemon 또는 컨테이너 enumeration 이 응답 못 한 race window 가 존재

### 복구 절차 (이번에 수동 적용)

```bash
cd orchestrator/state/playground
for f in *.json; do cp "$f" "$f.bak"; done            # 백업
for f in *.json; do sed -i '' 's/"status": "archived"/"status": "hibernated"/' "$f"; done
# orchestrator 재시작 → reattach 가 stopped 인식 → hibernated 유지
```

---

## 문제 3 겹

### #1 reattach race window

**위치:** `orchestrator/lib/playground.js:923-927`

```js
const { stdout } = await execAsync(
  `docker inspect -f "{{.State.Running}}" ${pg.sandboxContainerName} 2>/dev/null || echo MISSING`,
  { timeout: 5_000 },
);
```

- macOS sleep/wake 직후 또는 Docker Desktop 부팅 직후 docker daemon 응답이 5s 안에 안 옴
- exec 가 `2>/dev/null || echo MISSING` 으로 silent fallback → `MISSING` 으로 잘못 판정
- 8개 동시 inspect 라 docker daemon 부담도 큼

### #2 자기치유 차단

**위치:** `orchestrator/lib/playground.js:922`

```js
if (pg.status === 'archived') continue;
```

- 일단 잘못 archived 마킹되면 **다음 부팅에서도 skip**
- "한 번 사고 → 영영 보관" → 사용자가 수동으로 state JSON 고치지 않으면 자기치유 불가
- 진짜 archive (`archivePlayground()` 가 명시적으로 호출, patches export, `archivedDiffPath` 세팅) 와 사고 archive 구분 안 됨

### #3 archive 출처 미기록

진짜 archive 와 reattach 사고 archive 가 같은 `status='archived'` — log 외엔 구분 불가.

---

## 변경 사항

### Task 1 — reattach inspect 견고화

**파일:** `orchestrator/lib/playground.js`

- timeout 5s → 15s
- MISSING 판정 시 즉시 archive 마킹하지 말고 **2회 재시도 (1.5s, 4s 간격)**:
  ```js
  async function inspectWithRetry(name, attempts = 3) {
    for (let i = 0; i < attempts; i++) {
      try {
        const { stdout } = await execAsync(
          `docker inspect -f "{{.State.Running}}" ${name} 2>/dev/null || echo MISSING`,
          { timeout: 15_000 },
        );
        const out = stdout.trim();
        if (out === 'true' || out === 'false') return out;
        // MISSING — 재시도
      } catch (err) {
        // exec timeout 도 재시도 대상
      }
      if (i < attempts - 1) await sleep([1500, 4000][i]);
    }
    return 'MISSING';  // 진짜로 3번 다 missing 이면 그제서야 인정
  }
  ```
- 8개 동시 inspect 가 daemon 에 부담 → 직렬 또는 parallelism=2 제한 (선택)

### Task 2 — archive 출처 분리 + 자기치유 가드

**파일:** `orchestrator/lib/playground.js`

- `Playground` 타입에 `archivedReason: 'user' | 'reattach-missing' | undefined` 필드 추가
- `archivePlayground()` (line 460) — `archivedReason='user'` 세팅
- reattach 가 MISSING 마킹 시 — `archivedReason='reattach-missing'` 세팅. **`archivedDiffPath` 는 세팅하지 않음** (진짜 archive 만 patches export)
- reattach skip 가드 (line 922) 강화:
  ```js
  // 진짜 user archive (patches 와 함께) 만 skip. reattach-missing 은 매 부팅 재검사.
  if (pg.status === 'archived' && pg.archivedReason === 'user') continue;
  ```
- `archivedReason==='reattach-missing'` 인 playground 는 다음 reattach 에서 inspect 다시 시도 → 컨테이너 살아 있으면 자동 복구 (`hibernated`/`active`)

### Task 3 — UI 출처 표시 (선택)

**파일:** `playground-app/src/pages/PlaygroundList.tsx`

- `archivedReason==='reattach-missing'` 인 항목엔 "복구 가능" 또는 "재연결 시도 중" 같은 라벨
- 사용자가 진짜 보관과 사고 보관을 구분 가능
- 비-목표면 skip — 코드 fix 만으로도 충분

### Task 4 — 운영 알림 (선택)

reattach 가 MISSING 으로 판정한 항목 N 개 이상이면 stdout 에 `[playground] WARN: N items missing on reattach — possible docker daemon race` 같은 명시 경고 로그.

### Task 5 — 검증

1. orchestrator 정상 부팅 후 8개 playground 다 `hibernated` 유지 확인
2. macOS sleep → wake 시뮬레이션 (또는 Docker Desktop quit/start) 직후 orchestrator 재시작 — false-archive 0 건
3. 진짜 archive (`POST /api/playground/:id/archive`) 시 `archivedReason='user'` 기록 확인
4. state JSON 직접 status='archived', archivedReason 빈 값으로 만든 뒤 orchestrator 재시작 — reattach 가 다시 inspect 해서 컨테이너 살아 있으면 hibernated 로 자동 복구 확인

---

## 작업 순서

1. Task 1 (inspect retry + timeout) — 단독 commit
2. Task 2 (archivedReason + 자기치유 가드) — 단독 commit
3. Task 3 (UI, 선택) — 단독 commit
4. Task 4 (운영 알림, 선택) — 단독 commit
5. Task 5 검증 (수동)

---

## 위험 / footguns

- **inspect retry timing** — 1.5s + 4s + 15s timeout = 최악 ~20s/playground × 8 = 직렬이면 부팅 ~3분 지연. parallelism=2 + 직렬 fallback 권장. 또는 첫 시도만 short timeout(2s), 재시도부터 long timeout.
- **archivedReason 마이그레이션** — 기존 archived 8개 (이번에 hibernated 로 복구한 것들) 는 `archivedReason` 필드 없음. 새 코드가 `pg.archivedReason === 'user'` 체크면 undefined 라 false → 다시 reattach 검사 → 컨테이너 살아 있으면 자동 복구. 일관성 OK.
- **archivePlayground 호출자** — server.js 의 `/api/playground/:id/archive` route, slack 핸들러, hibernate-then-archive 자동 흐름 모두 `archivedReason='user'` 세팅하는지 확인 필요.
- **patches export 와 archivedReason** — 진짜 archive 는 `archivedDiffPath` + `archivedReason='user'` 세트. 한쪽만 세팅되는 코드 경로 없는지 grep.

---

## 완료 기준 (DoD)

- [ ] reattach inspect 가 retry + 긴 timeout 적용
- [ ] `Playground.archivedReason` 필드 추가, `archivePlayground()` 가 `'user'` 세팅
- [ ] reattach MISSING 시 `archivedReason='reattach-missing'` 세팅
- [ ] reattach skip 가드 — `archivedReason==='user'` 일 때만 skip
- [ ] reattach 재실행 시 `reattach-missing` 항목 자동 복구 동작 확인
- [ ] (선택) UI 라벨 / 운영 알림

---

## 비-목표

- archive 액션 자체의 destructive 동작 변경 (현행 유지)
- 컨테이너 lifecycle (start/stop/kill) 코드 변경
- multi-host docker daemon 지원
- 기존 8개 archived state JSON 마이그레이션 — 이미 수동 복구 완료. 신규 발생 케이스만 다룸

---

## 메모 — 사고 당시 데이터 (참고)

**state JSON 백업 위치:** `orchestrator/state/playground/*.json.bak` (8개, 검증 끝나면 정리)

**사고 시점 reattach 로그:**
```
[playground] reattach 1d68d67a: container missing → archived
[playground] reattach 52fd083e: container missing → archived
... (8건 동일)
[playground] reattach: reconciled 8 playgrounds
```

**같은 시점 손으로 docker inspect 결과:**
```
inspect-pg-1d68d67a → false  (stopped, exists)
... (8개 모두 동일)
```

→ docker daemon race 임이 명백.
