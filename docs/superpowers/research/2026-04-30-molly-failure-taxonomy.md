# molly 실패 유형 분류 (2026-04-30 기준)

> 분석 방법: 24개 잡 trace JSON 직접 정독 → open coding → 패턴 클러스터링  
> 대상 기간: createdAt 기준 2026-04-21 ~ 2026-04-30 (잡 생성 순)

---

## TL;DR

- **분석 잡 수**: 24개
- **상태 분포**: cancelled 19개 (79%) / complete 3개 (12.5%) / qa 1개 (4%) / paused 1개 (4%)
- **실제 task 실행 잡**: 18개 (나머지 6개는 task 전부 pending 상태에서 cancel)
- **발견된 실패 유형**: 10개 카테고리
- **가장 흔한 실패 TOP 3**
  1. `job_cancelled_mid_execution` — 8개 잡: 일부 task가 pass됐음에도 complete 없이 cancel됨
  2. `pre_execution_cancel` — 6개 잡: 동일 PRD 재시도로 인한 중복 잡 생성 후 실행 전 cancel
  3. `agent_retry` — 4개 잡: 동일 task 2회 이상 시도 (attempt ≥ 1)
- **시사점**: 실제 코드 품질 실패(empty_diff, scope_destruction, partial_implementation, ds_component_bypass)는 총 8건의 task에서 발생. QA 신호 신뢰도 문제(permission_guard_regression, qa_blind_pass)가 별도 패턴으로 식별됨.

---

## 잡별 raw 분석

| jobId | status | PRD 앞 60자 | 분류된 실패 유형 | 핵심 노트 |
|-------|--------|------------|----------------|---------|
| `128a4821` | cancelled | TAS 사이드바 도움말 메뉴 추가하고 /help 페이지로 이동 | `pre_execution_cancel` | tasks 2개 전부 pending |
| `1edccbc2` | cancelled | Post Creative Review (Executive Summary: Perf Bottleneck… | `pre_execution_cancel` | tasks 5개 전부 pending |
| `29a3c0e3` | cancelled | Post Creative Review (Executive Summary: Perf Bottleneck… | `ds_component_bypass`, `agent_retry`, `job_cancelled_mid_execution` | t4 fail: raw `<img>` 사용, attempt=1 |
| `2b8ba370` | cancelled | 만들어진 도움말 페이지에 리스트 페이지를 만들어서 실제 도 | `job_cancelled_mid_execution` | t5 running 중 cancel |
| `3baae1b3` | cancelled | Post Creative Review (Executive Summary: Perf Bottleneck… | `agent_retry`, `job_cancelled_mid_execution` | 12개 task 전부 pass인데 cancelled (complete 아님) |
| `4bbe16fc` | cancelled | Post Creative Review (Executive Summary: Perf Bottleneck… | `agent_retry`, `job_cancelled_mid_execution` | t2 attempt=1, t1 running 중 cancel |
| `4e84576f` | complete | 헤더에 작은 베타 배지를 추가해줘 | `qa_blind_pass` | 정상 완료. QA human_only passed (UI 미확인) |
| `5f41d16d` | cancelled | Post Creative Review (Executive Summary: Perf Bottleneck… | `agent_retry`, `qa_blind_pass` | t8 attempt=1, 전체 pass. QA human_only |
| `6c6a52f3` | cancelled | Post Creative Review (Executive Summary: Perf Bottleneck… | `job_cancelled_mid_execution` | t2 running 중 cancel |
| `7a55cf2d` | cancelled | Post Creative Review (Executive Summary: Perf Bottleneck… | `scope_destruction`, `accepted_by_user_on_fail`, `job_cancelled_mid_execution` | t1: 기존 라우트 전체 삭제 버그, acceptedByUser |
| `88a27157` | complete | 상단 헤더 영역에 있는 TVING Ad System 옆에 있는 BETA 뱃지 | `permission_guard_regression`, `qa_blind_pass` | QA: /sign-in 리다이렉트인데 agent passed |
| `8d577f58` | cancelled | Post Creative Review (Executive Summary: Perf Bottleneck… | `pre_execution_cancel` | tasks 9개 전부 pending |
| `8e4d7e57` | cancelled | Post Creative Review (Executive Summary: Perf Bottleneck… | `partial_implementation` | t3: search 로직만 수정, 테이블 컬럼 전혀 미구현 |
| `9119980e` | complete | Post Creative Review (Executive Summary: Perf Bottleneck… | `partial_implementation` | t2 skipped(fail): 컨테이너+i18n만 있고 테이블 컴포넌트 없음 |
| `9754ec6d` | cancelled | TAS 사이드바 도움말 메뉴 추가하고 /help 페이지로 이동 | `job_cancelled_mid_execution` | t2 running_agent 중 cancel |
| `a658fef6` | qa | TAS 사이드바 도움말 메뉴 추가하고 /help 페이지로 이동 | `qa_blind_pass` | 전체 pass, QA human_only |
| `b987ba65` | cancelled | TAS 사이드바 도움말 메뉴 추가하고 /help 페이지로 이동 | `pre_execution_cancel` | tasks 전부 pending |
| `bf022300` | cancelled | Post Creative Review (Executive Summary: Perf Bottleneck… | `job_cancelled_mid_execution` | t2 running 중 cancel |
| `c06b61dc` | cancelled | 헤더에 작은 베타 배지를 추가해줘 | `scope_destruction` | BETA 배지 추가하면서 기존 Creative Review 기능 전체 삭제 |
| `c33f468e` | cancelled | 헤더에 작은 베타 배지를 추가해줘 | `empty_diff` | 코드 변경 없는 빈 diff 제출 |
| `cfaf5af1` | cancelled | TAS 사이드바 도움말 메뉴 추가하고 /help 페이지로 이동 | `empty_diff`, `accepted_by_user_on_fail`, `permission_guard_regression` | t1+t2 모두 empty diff, 사용자 accept 후 QA도 실패 |
| `d1b2e30a` | cancelled | Post Creative Review (Executive Summary: Perf Bottleneck… | `pre_execution_cancel` | tasks 전부 pending |
| `d903463b` | cancelled | TAS 사이드바 도움말 메뉴 추가하고 /help 페이지로 이동 | `pre_execution_cancel` | tasks 전부 pending |
| `dc1c2ccc` | paused | 광고 소재 -> 광고 소재 리스트 로 변경 (컨텍스트: /v1/p/T | `empty_diff` | empty diff로 paused. pausedReason 명시됨 |

---

## 실패 유형 카테고리 (open coding 도출)

### 1. `empty_diff`

**정의**: 에이전트가 실행됐으나 실제 코드 변경이 없는 빈 diff를 제출함. 리뷰어가 "Empty diff — the task produced no code changes."를 반환함.

**발생 잡**: `c33f468e`, `cfaf5af1` (t1+t2), `dc1c2ccc`

**빈도**: 3개 잡 / 4개 task 인스턴스

**예시 review notes 인용**:
- `c33f468e` t1: *"Empty diff — the task produced no code changes."*
- `cfaf5af1` t1: *"Empty diff — the task produced no code changes."* (acceptedByUser=true)
- `dc1c2ccc` t1: *"Empty diff — the task produced no code changes."* → job paused

**특징**: `dc1c2ccc`는 Chrome extension이 클릭 컨텍스트(testId: pageTitle, 선택 요소)를 제공했음에도 발생. i18n 키 공유 위험(risksKo에 명시)이 에이전트를 위축시켰을 가능성 있음.

---

### 2. `scope_destruction`

**정의**: PRD가 요청한 작업을 완료하면서 동시에 기존에 존재하는 관련 없는 기능(라우트, 컴포넌트, 피처)을 삭제하거나 되돌림.

**발생 잡**: `c06b61dc`, `7a55cf2d`

**빈도**: 2개 잡 / 2개 task 인스턴스

**예시 review notes 인용**:
- `c06b61dc` t1: *"Diff adds the BETA badge correctly but also deletes unrelated TAS Post Creative Review feature and reverts publisher creative review functionality, far outside task scope."*
- `7a55cf2d` t1: *"Diff removes the TAS Post Creative Review menu/route/page entirely instead of adding a new 'Creative Review' entry; task asked to add a menu, not remove."*

**특징**: 두 케이스 모두 동일 파일 영역(헤더/사이드바/라우트)에서 새 기능 추가 시 기존 코드를 실수로 덮어쓰거나 삭제. `7a55cf2d`는 사용자가 acceptedByUser=true로 진행 허용.

---

### 3. `ds_component_bypass`

**정의**: 코드베이스의 공유 컴포넌트(cell-renderer, DS 패턴)를 사용해야 하는 곳에 raw HTML 태그나 직접 스타일링으로 구현함.

**발생 잡**: `29a3c0e3`

**빈도**: 1개 잡 / 1개 task 인스턴스

**예시 review notes 인용**:
- `29a3c0e3` t4: *"Thumbnail cell uses a raw styled `<img>` instead of a shared thumbnail/cell-renderer component; landing URL also bypasses the table cell-renderer pattern under `common/component/table`."*

**특징**: 동일 PRD로 복수의 잡이 실행됐는데, 해당 codebase 패턴을 제대로 탐색하지 않은 채 빠른 구현을 선택한 경우. pass된 다른 잡(예: `3baae1b3` t3)은 "thumbnail/landing URL renderers added" 언급이 있어, 에이전트마다 결과가 다름.

---

### 4. `partial_implementation`

**정의**: task description에 명시된 요구사항 목록(컬럼, 필터, 상태 처리 등) 중 일부만 구현하고 나머지를 누락한 채 제출함.

**발생 잡**: `8e4d7e57`, `9119980e`

**빈도**: 2개 잡 / 2개 task 인스턴스 (두 건 모두 skipped 처리)

**예시 review notes 인용**:
- `8e4d7e57` t3: *"Diff only tweaks search-override date logic; does not implement table columns, filters, sorting, or loading/empty/error states required by the task."*
- `9119980e` t2: *"Diff only shows container + i18n changes; the referenced MCPublisherCreativeReviewTable component and PublisherCreativeReview model that render the required columns are not included in the diff."*

**특징**: 두 케이스 모두 "대형 task"(테이블 전체 구현 등 복잡도 높은 단일 태스크)에서 발생. 에이전트가 task 범위를 좁게 해석하거나 기존 컴포넌트를 참조하는 방식으로 우회 시도.

---

### 5. `permission_guard_regression`

**정의**: 구현 완료 후 QA 시 대상 라우트가 인증 게이트에 막혀 `/sign-in`으로 리다이렉트됨. PRD 결과(UI)를 직접 확인할 수 없는 상태.

**발생 잡**: `cfaf5af1`, `88a27157`

**빈도**: 2개 잡 / 2개 QA 인스턴스

**예시 QA notes 인용**:
- `cfaf5af1` QA: *"/help 접근 시 /sign-in으로 리다이렉트되어 도움말 페이지가 노출되지 않습니다. 권한 게이트 회귀로 PRD 결과를 확인할 수 없습니다."* → passed=false
- `88a27157` QA evidence: `finalUrl: "http://127.0.0.1:60982/sign-in"`, consoleErrorCount=1 → agent가 *"변경 범위가 PRD에 부합함"*으로 passed=true 판정

**특징**: `cfaf5af1`은 올바르게 fail 판정했으나, `88a27157`은 동일한 /sign-in 리다이렉트 상황에서 agent가 코드 diff 분석만으로 passed=true를 냄. QA 신호 신뢰도 문제.

---

### 6. `agent_retry`

**정의**: 동일 task에서 attempt가 2회 이상 발생. 첫 시도(attempt=0) 실패 또는 불완전 후 재시도.

**발생 잡**: `3baae1b3`, `5f41d16d`, `4bbe16fc`, `29a3c0e3`

**빈도**: 4개 잡 / 4개 task 인스턴스

**예시 review notes 인용**:
- `3baae1b3` t6: attempt=2, 상태 뱃지(Allowed/Blocked 색상) 구현 2번 만에 pass
- `5f41d16d` t8: attempt=1, 썸네일 미리보기 확대 재시도 후 pass
- `29a3c0e3` t4: attempt=1, ds_component_bypass로 fail

**특징**: retry 후 pass된 케이스(3건)가 있어, retry 자체가 효과적임. 단, retry 횟수가 증가하면 agent_loop 위험이 있음. 현재 데이터에서 2회 이상 retry 사례는 없음.

---

### 7. `job_cancelled_mid_execution`

**정의**: 일부 task가 reviewed/pass 상태로 완료됐음에도 잡이 최종 complete 상태로 전환되지 않고 cancelled됨. running 또는 pending 상태 task가 남은 채 종료.

**발생 잡**: `2b8ba370`, `3baae1b3`, `4bbe16fc`, `6c6a52f3`, `7a55cf2d`, `9754ec6d`, `bf022300`, `29a3c0e3`

**빈도**: 8개 잡 (실행된 잡 18개 중 44%)

**예시**:
- `3baae1b3`: 12개 task 모두 reviewed/pass 완료 → status: "cancelled" (complete 아님)
- `2b8ba370`: t5 status="running" 상태에서 cancelled
- `9754ec6d`: t2 currentPhase="running_agent"에서 cancelled

**특징**: `3baae1b3`는 가장 이상한 케이스 — 모든 task가 성공했는데 cancelled. 사용자가 더 나은 구현을 위해 다른 잡을 새로 시작했거나, job 완료 transition 로직 버그일 수 있음. running 중 cancel은 사용자가 중도 포기한 케이스.

---

### 8. `pre_execution_cancel`

**정의**: 잡이 생성됐으나 어떤 task도 실행되지 않은 채(전부 pending 상태) cancelled됨. 동일 PRD를 여러 번 제출하면서 이전 잡이 중복으로 생성된 경우.

**발생 잡**: `128a4821`, `1edccbc2`, `8d577f58`, `b987ba65`, `d1b2e30a`, `d903463b`

**빈도**: 6개 잡 (전체 24개 중 25%)

**예시 패턴**:
- `b987ba65` → `d903463b` → `128a4821`: 동일 PRD(도움말 메뉴 + /help) 3번 재시도, 앞 두 개는 pending cancel
- `d1b2e30a` → `8d577f58`: Post Creative Review 동일 PRD 연속 생성

**특징**: 사용자가 계획 분해 방식이 마음에 들지 않거나 새 playground에서 재시작을 원할 때 발생. 실제 실패라기보다 UX 패턴 — 단 중복 잡은 추적 노이즈를 만듦.

---

### 9. `qa_blind_pass`

**정의**: QA 전략이 `human_only` 또는 `agent_review`인데, 실제 UI를 확인할 수 없는 상황에서도 pass로 판정하거나 코드 diff 분석만으로 통과 처리함.

**발생 잡**: `88a27157`, `4e84576f`, `5f41d16d`, `a658fef6`

**빈도**: 4개 잡

**예시 QA notes 인용**:
- `88a27157`: *"layout.tsx에서 showBetaBadge를 false로 변경하여 BETA 뱃지 제거 의도가 diff에 명확히 반영됨. 결과 페이지가 sign-in이라 헤더는 직접 보이지 않지만 변경 범위가 PRD에 부합함."* (finalUrl=/sign-in인데 passed=true)
- `4e84576f`, `5f41d16d`, `a658fef6`: *"사람이 직접 확인하는 전략입니다"* — 실제 확인 여부 불명

**특징**: human_only는 자동 검증을 포기한 전략. agent_review는 스크린샷을 가져오지만 /sign-in 리다이렉트 상황에서 일관성 없는 판정. Level 1 assertion(라우트 200 OK + 대상 요소 존재)이 없으면 QA 신뢰도 보장 불가.

---

### 10. `accepted_by_user_on_fail`

**정의**: 리뷰 verdict가 fail임에도 사용자가 `acceptedByUser=true`로 진행을 허용. 결과물의 결함을 인지한 채 다음 task로 진행.

**발생 잡**: `7a55cf2d`, `cfaf5af1`

**빈도**: 2개 잡 / 3개 task 인스턴스

**예시 review notes 인용**:
- `7a55cf2d` t1: verdict=fail (기존 라우트 삭제), acceptedByUser=true → 이후 running 중 cancel
- `cfaf5af1` t1+t2: verdict=fail (empty diff 2건 연속), acceptedByUser=true → QA도 sign-in redirect로 fail

**특징**: 사용자가 fail을 인지하고 진행한 것이므로 "에이전트 실패"가 아닌 "사용자 의사결정 패턴". 단, 결함 누적으로 인해 최종 QA도 실패하는 경향. eval suite에서는 acceptedByUser 케이스를 별도 레이블로 분리해야 함.

---

## 미분류 / 모호 케이스

### `3baae1b3` — 모든 task pass 후 cancelled
12개 task 전부 reviewed/pass 완료 후에도 status="cancelled". 이것이 시스템 버그(job complete transition 미발생)인지, 사용자가 다른 잡으로 전환한 것인지 불명확. cancelled 잡에서 "전부 성공" 패턴이므로 실패 유형이라기보다 상태 관리 이슈일 수 있음.

### `5f41d16d` — complete인데 qaAutoResult 기준 시점 불일치
status="cancelled"인데 qaAutoResult가 존재하고 passed=true. QA가 실행된 후 cancel된 것인지, 상태 전환 순서 문제인지 모호. 이런 경우 QA 결과를 신뢰할 수 있는지 불명확.

### `4bbe16fc` — t1 running + t2 reviewed 순서 이상
t1이 status="running"인데 t2는 이미 reviewed/pass. 의존관계(t2 dependsOn=[])가 없는 태스크들이 병렬 실행되다가 t1이 멈춘 케이스로 보임. 실제 병렬 실행 버그인지 단순 cancel인지 불명확.

---

## 시사점 — 다음 단계

### 1. Constitutional 원칙 도출 (옵션 A 진행 시)

데이터에서 귀납적으로 도출 가능한 원칙 후보:

| 우선순위 | 원칙 후보 | 근거 카테고리 |
|---------|----------|-------------|
| P1 | 변경은 PRD가 명시한 범위 안에서만 — 기존 기능 삭제/수정 금지 | `scope_destruction` (2건) |
| P2 | 코드베이스의 공유 컴포넌트를 우선 탐색하고 재사용 — raw 구현 금지 | `ds_component_bypass` (1건) |
| P3 | task description의 모든 요구사항을 체크리스트로 처리 — 부분 구현 금지 | `partial_implementation` (2건) |
| P4 | 변경이 없으면 제출하지 않음 — 반드시 실제 diff가 있어야 함 | `empty_diff` (4건) |
| P5 | 기존 코드를 삭제/덮어쓰기 전에 해당 코드의 용도를 확인 | `scope_destruction` (2건) |

### 2. Level 1 Assertion 후보 (자동 검증 가능)

```
# 코드로 자동 검증 가능한 assertion 목록
assert diff.changed_lines > 0                          # empty_diff 방지
assert not any(file in diff.deleted for file in existing_routes)  # scope_destruction 방지
assert target_route in diff.affected_routes            # 대상 라우트 변경 확인
assert qa.final_url == target_route                    # permission_guard 감지
assert qa.final_url != "/sign-in"                      # sign-in redirect 감지
assert all(required_columns in rendered_table)         # partial_implementation 감지 (컬럼 수 체크)
```

### 3. Eval Suite 케이스 후보

| eval 케이스 | 대상 실패 유형 | 검증 방법 |
|------------|-------------|---------|
| 사이드바 메뉴 추가 (단순) | `empty_diff`, `scope_destruction` | diff.changed_lines > 0, 기존 메뉴 항목 삭제 없음 |
| 헤더 뱃지 추가 | `scope_destruction` | 기존 Creative Review 라우트 유지 확인 |
| 테이블 컬럼 전체 구현 | `partial_implementation` | 12개 컬럼 모두 렌더링 확인 |
| 썸네일 셀 구현 | `ds_component_bypass` | raw `<img>` 미사용, cell-renderer 사용 확인 |
| /help 라우트 QA | `permission_guard_regression` | finalUrl != /sign-in |
| i18n 키 변경 | `empty_diff` | 실제 텍스트 변경 확인 |

### 4. 데이터 보강 우선순위

현재 데이터에서 포착되지 않는 신호들:

- **파일 단위 변경 범위**: 어떤 파일을 수정했는지 diff summary가 없어 scope_destruction 패턴을 사전에 감지하기 어려움
- **에이전트 thinking/reasoning**: empty_diff가 왜 발생했는지 내부 사고 과정이 없음
- **실패 후 사용자 액션 타임스탬프**: acceptedByUser 결정까지 걸린 시간, 사용자 피드백 텍스트 없음
- **task complexity 지표**: 단일 task에 요구사항이 몇 개인지 (partial_implementation 예측)

---

## 한계

- **24개 전부 self-test**: 실제 다양한 사용자 요청이 아닌 반복적인 Post Creative Review PRD(동일 PRD 다수 잡) 위주. 실제 사용자 PRD 분포와 다를 수 있음.
- **동일 PRD 과대 대표**: Post Creative Review PRD가 14개 잡 차지 (58%). 이 PRD 특성에 편향된 분류일 수 있음.
- **cancelled 잡의 실패 원인 불명확**: 19개 cancelled 중 사용자 의도(재시작) vs. 에이전트 오류 vs. 시스템 오류를 구분하는 신호가 부족.
- **QA 결과의 신뢰도**: human_only QA는 실제 확인 여부를 추적할 수 없음. agent_review QA도 /sign-in 케이스에서 일관성 없는 판정.
- **review notes의 깊이 편차**: 일부 pass 판정 notes는 충분한 근거 없이 "per requirements", "as specified" 수준으로 짧아서 품질 분석 한계.
