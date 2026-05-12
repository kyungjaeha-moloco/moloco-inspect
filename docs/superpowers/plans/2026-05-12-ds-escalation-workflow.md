# Plan — DS Escalation Workflow (자동 PR + 4-옵션 UX + Metric)

**Date:** 2026-05-12
**Author:** kyungjae.ha (with Claude)
**Status:** 리서치 완료 → 다음 주 2명 시범 운영 직전 진행
**Estimate:** ~5-7일 (5 슬라이스)
**연계 plan:**
- `2026-05-07-molly-ds-loop-v2-research-informed.md` (DS loop v2 S3 Phase F/G 와 통합)
- `2026-05-11-local-share-cloudflare-tunnel.md` (2명 시범 운영)
- `2026-05-12-ontology-evolution.md` (ontology Phase 0-2 와 연계)

---

## 배경

사용자 지적: DS에 없는 컴포넌트를 무조건 차단하면 사용자가 막힘. **escalation 흐름이 필요**. 다음 3 케이스 처리:

- **Case A**: DS에 진짜 없음, 신규 컴포넌트 필요 (예: `MCAdPacingHeatmap`)
- **Case B**: 기존 컴포넌트 살짝 변경 (variant 추가, prop 추가)
- **Case C**: 조합으로 가능한데 LLM 판단 미스

이미 우리 시스템에 있는 부분 (90%):
- `unresolved_components` 필드 (S3 Phase A 완료)
- `governance.json` watch_list / promotion_queue
- design-system-site GovernancePage (확장 예정)

5명 researcher 외부 리서치 결과 통합:
- R1 (Production 사례): Builder.io 수동 remap / Figma silent degradation / Primer 6단계 lifecycle / Carbon RFC / Atlassian Slack 게이팅 / Knapsack governance
- R2 (4-옵션 UX): Slack Block Kit 4 버튼 / Web 카드 2×2 / Chrome ext 라디오 / ⓐ default 강조
- R3 (Auto-PR): GitHub App (`molly-bot[bot]`) / peter-evans Action / 브랜치 네이밍 / dedup / Slack thread
- R4 (Metrics): 6 metric (Coverage / Request Frequency / Adoption / Watch Velocity / Deprecation / Resolution Time)
- R5 (RFC process): 3-level lightweight (Slack one-liner / GitHub Issue / Full RFC), 72h SLA, Federated 모델

---

## 핵심 결정 (사용자 + 리서치)

1. **다음 주 2명 시범 운영 직전 진행** — 실제 사용자 케이스가 plan을 검증
2. **RFC 는 5-10명 팀엔 over-engineering** — Carbon/Primer 패턴 차용 X. **GitHub Issue 경량 RFC + 주 1회 30분 triage** 권장
3. **우리 `unresolved_components` 명시 방식이 Figma silent degradation 보다 우수** — 유지 + 강화
4. **AI 자동 PR 은 "탐지·기록"까지만 안전** — 구현 PR 은 사람 (Renovate 패턴 차용)
5. **Lifecycle 라벨 도입** (Primer 패턴) — Experimental → Alpha → Beta → Stable
6. **GitHub App 권한** (`molly-bot[bot]`) — PAT 비추, 8h auto-rotation
7. **ⓐ closest_match 기본 강조** — engineer 대상이라 속도 우선
8. **임계값 3회** — 5-10명 팀엔 3회 요청 시 자동 watch_list 승격

---

## 목표 / 비-목표

**목표:**
- 다음 주 2명 시범 운영에서 "DS 없음" 차단 사고 0
- 4 케이스별 사용자 선택지 UI 통일 (3 surface)
- DS 신규 / 확장 요청이 자동으로 GitHub Issue 생성
- DS 팀 review SLA 72h
- GovernancePage 사후 분석 시각화 4개

**비-목표:**
- 외부 (Moloco 밖) 사용자 — 사내 도구만
- RFC 정식 process — Carbon/IBM 수준 X
- 자동 구현 PR (구현은 사람)
- SOC 2 audit log retention — 정식 운영 시 별 plan
- Full Figma Code Connect 통합 — 현재 sandbox 환경 한계

---

## 슬라이스 요약 (5개)

| # | 슬라이스 | 추정 | 효과 |
|---|---------|------|------|
| **A** | 4-옵션 UX (3 surface 통일) | 1.5-2일 | 사용자 차단 사고 0 |
| **B** | Auto-PR generation (GitHub App + peter-evans) | 1-1.5일 | DS 요청 자동 누적 |
| **C** | Metric + GovernancePage 시각화 (4개) | 1-1.5일 | 우선순위 결정 데이터 |
| **D** | Lifecycle 라벨 (governance.json) | 0.5일 | DS 카탈로그 진화 추적 |
| **E** | Triage workflow (주 1회 30분) | 0.5일 (문서) | DS 팀 부담 최소화 |
| **합계** | **5-6일 (한 사람)** | |

---

## Slice A — 4-옵션 UX (3 surface 통일)

### 4 옵션 정의

| 옵션 | 설명 | 즉시 vs 2단계 |
|------|------|--------------|
| ⓐ closest_match 진행 | 가장 가까운 DS 컴포넌트 사용 | 즉시 + toast undo |
| ⓑ 커스텀 생성 | "DS 외" 라벨 자동 추가 | 즉시 + 라벨 |
| ⓒ DS 신규 제안 PR | GitHub Issue 자동 생성 | "초안 보기" 2단계 |
| ⓓ 기존 컴포넌트 확장 PR | variant/prop 추가 Issue | "초안 보기" 2단계 |

### A.1 Slack Block Kit (Slack 시범 사용자 1명)

```json
{
  "blocks": [
    { "type": "section", "text": { "type": "mrkdwn", "text": "🔍 \"RangeSlider\"는 DS에 없어요. 가장 가까운 건 *Slider*." } },
    { "type": "actions", "elements": [
      { "type": "button", "text": { "type": "plain_text", "text": "⭐ Slider로 진행" }, "style": "primary",
        "action_id": "molly:missing_component:closest_match", "value": "closest_match" },
      { "type": "button", "text": { "type": "plain_text", "text": "커스텀으로 생성" },
        "action_id": "molly:missing_component:custom_build", "value": "custom_build" },
      { "type": "button", "text": { "type": "plain_text", "text": "DS 신규 제안 PR" },
        "action_id": "molly:missing_component:propose_new", "value": "propose_new" },
      { "type": "button", "text": { "type": "plain_text", "text": "기존 확장 제안" },
        "action_id": "molly:missing_component:extend_existing", "value": "extend_existing" }
    ]},
    { "type": "context", "elements": [
      { "type": "mrkdwn", "text": "💡 \"Slider로 진행\"이 가장 빠른 방법이에요." }
    ]}
  ]
}
```

`response_type: ephemeral` 으로 본인만 보이게 → 선택 후 `in_channel` 로 update.

### A.2 Playground Web UI (사용자 본인)

카드 2×2:
- 왼쪽 위: ⭐ RECOMMENDED 카드 (`closest_match`, primary border)
- 오른쪽 위: 커스텀 생성 (DS 외 라벨)
- 왼쪽 아래: DS 신규 제안 (초안 보기)
- 오른쪽 아래: 기존 확장 제안 (초안 보기)

### A.3 Chrome Extension Sidepanel

라디오 (4 옵션) + 단일 "선택 후 진행하기" 버튼 (좁은 너비).

### A.4 Wording 가이드 (NN/g)

- ❌ "그래도 진행" (불안 자극)
- ✅ "Slider로 진행" (결과 명시)
- ✅ "DS 외 라벨 포함" (자동 라벨 명시)

### Slice A 작업

| Task | 시간 |
|------|------|
| `unresolved_components` 응답 schema 에 `closest_match` 보강 (현재는 추정 단계) | 0.5h |
| 3 surface 의 `missing_component_card` 렌더링 컴포넌트 신규 | 1d |
| Slack `action_id` handler 4개 + ephemeral message update | 4h |
| 선택 결과 telemetry (`state/molly-missing-choices.jsonl`) | 1h |
| 검증 (2명 시범 사용자 케이스) | 4h |

**Slice A DoD:**
- [ ] 3 surface 모두 4-옵션 카드 렌더링
- [ ] ⓐ/ⓑ 즉시 진행 + undo toast 작동
- [ ] ⓒ/ⓓ "초안 보기" 클릭 시 PR template 미리보기
- [ ] 사용자 선택이 jsonl 에 기록됨

---

## Slice B — Auto-PR Generation

### B.1 GitHub App 등록

- App name: `molly-bot`
- Repository permissions: `contents: write`, `pull-requests: write`, `metadata: read`
- design-system repo 에만 install
- `APP_ID` + `PRIVATE_KEY` → orchestrator 의 Secret Manager (GCP P1 plan과 연계, 현재는 .env)

### B.2 브랜치 / PR 생성 로직

```
브랜치: ds/request/MC{X}-{kebab-slug}
PR title: [DS request] MC{X} 신규 컴포넌트 제안
또는: [DS request] MC{Y} variant 추가
labels: ds-request, ai-generated, needs-ds-review
reviewers: DS 팀 GitHub handles (사용자 결정)
base: main
```

### B.3 PR Body Template

```markdown
## [DS request] MC{X}: {컴포넌트명}

> **AI-generated** | Requested by: @{requester} | Confidence: {N}%
> Generated: {date} | Slack thread: {url}

### 요청 배경
{사용자 PRD 인용 — verbatim}

### 추정 Props 명세
| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
...

### 사용 케이스
1. {케이스 1}
2. {케이스 2}

### 유사 기존 컴포넌트 비교
- `MC{closest}` — 차이점: {X}

### DS 팀 액션 가이드
- [ ] Props 검토 및 수정
- [ ] 기존 컴포넌트와 중복 여부 확인
- [ ] 디자인 토큰 적용 계획 수립
- [ ] 구현 스프린트 배정 또는 `wont-implement` 라벨 부착

_🤖 이 PR 은 Molly orchestrator 가 자동 생성. 내용 오류는 PR comment 로 피드백._
```

### B.4 중복 감지 (dedup)

```js
const existing = await octokit.search.issuesAndPullRequests({
  q: `repo:moloco/design-system is:open label:ds-request "${componentName}" in:title`,
});
if (existing.data.total_count > 0) {
  // 기존 PR comment 추가 + 사용자에게 link 반환
  return existing.data.items[0].html_url;
}
```

### B.5 Slack 알림 (DS 팀 채널)

```json
{
  "blocks": [
    { "type": "header", "text": { "type": "plain_text", "text": "🆕 DS 컴포넌트 요청 접수" } },
    { "type": "section", "fields": [
      { "type": "mrkdwn", "text": "*컴포넌트:*\nMC{X} {이름}" },
      { "type": "mrkdwn", "text": "*요청자:*\n@{slack_handle}" },
      { "type": "mrkdwn", "text": "*Confidence:*\n{N}%" }
    ]},
    { "type": "actions", "elements": [
      { "type": "button", "text": { "type": "plain_text", "text": "PR 보기" }, "url": "{pr_url}", "style": "primary" }
    ]}
  ]
}
```

### B.6 PR webhook → 요청자 Slack DM

GitHub Actions webhook (`pull_request` event) → orchestrator endpoint:
- `opened` → "리뷰 중"
- `closed (merged)` → "MC{X} 제안이 승인되어 구현됨"
- `closed (not merged) + wont-implement label` → "반려: {label/comment}"

### Slice B 작업

| Task | 시간 |
|------|------|
| GitHub App 등록 + 권한 + private key 보관 | 0.5d |
| `gh CLI` 또는 `@octokit/rest` 로 PR 생성 + branch | 0.5d |
| Dedup 로직 (`gh search`) | 2h |
| PR template 생성 (Molly 의 `report_missing_component` tool 호출 시) | 4h |
| Slack 알림 (DS 팀 채널) | 4h |
| PR webhook → 요청자 DM | 4h |
| E2E 테스트 | 4h |

**Slice B DoD:**
- [ ] 사용자가 ⓒ 또는 ⓓ 선택 → GitHub Issue 자동 생성
- [ ] 중복 시 기존 Issue 에 comment + 사용자에게 link 반환
- [ ] DS 팀 채널 에 Slack 알림
- [ ] PR 상태 변경 시 요청자 Slack DM

---

## Slice C — Metric + GovernancePage 시각화

### C.1 6 Metric 정의 (governance.json + 신규 jsonl 데이터)

| # | Metric | Source | 주기 |
|---|--------|--------|------|
| 1 | DS Coverage Rate | `jobs/*.json` 의 referenced_components / 전체 컴포넌트 | 주간 |
| 2 | **Request Frequency** | `state/molly-missing-choices.jsonl` 의 ⓒ/ⓓ 선택 카운트 | 실시간 |
| 3 | Team Adoption Rate | 사용자별 DS 사용 (2명 시범 후 의미 X — 5+ 명에서) | 월간 |
| 4 | Watch List Velocity | governance.json watch_list → promotion_queue 승격 / 분기 | 분기 |
| 5 | Deprecation Completion Rate | governance.json removal_queue 실제 제거 / 전체 | 분기 |
| 6 | Unresolved Resolution Time | `unresolved` 첫 등록 → watch_list 진입 평균 일수 | 분기 |

### C.2 GovernancePage 시각화 4개 (구현 우선순위 순)

1. **Request Frequency Bar** (수평 막대) — unresolved 컴포넌트 × 요청 횟수, 상위 10개, watch_list 임계선(3회) 점선
2. **Coverage Gauge** (도넛) — DS 매칭률 단일 숫자 + 추세
3. **Component Lifecycle Table** — `stable / experimental / deprecated / watch_list` 상태별 컴포넌트 수
4. **Quarterly Trend Line** — coverage + adoption (6개월치, 분기별)

### C.3 자동 watch_list 승격

```
일 1회 batch (orchestrator cron 또는 GitHub Actions):
  state/molly-missing-choices.jsonl 누적 집계
  ↓
  컴포넌트별 count >= 3 (90일 윈도)
  ↓
  GitHub Issue 자동 생성 (Slice B 의 PR 보다 가벼움)
  + governance.json watch_list 자동 append
  + Slack DS 팀 채널 알림
```

### Slice C 작업

| Task | 시간 |
|------|------|
| `state/molly-missing-choices.jsonl` append 로직 | 1h |
| 일 1회 batch cron 작성 (`scripts/governance-batch.mjs`) | 0.5d |
| GovernancePage 의 Request Frequency Bar (Recharts) | 0.5d |
| Coverage Gauge / Lifecycle Table / Trend Line | 0.5d |
| 검증 (시범 운영 데이터로) | 4h |

**Slice C DoD:**
- [ ] jsonl 데이터 누적
- [ ] 일 1회 batch → 3회 임계 시 watch_list 자동 append + Issue 생성
- [ ] GovernancePage 4 시각화 작동

---

## Slice D — Lifecycle 라벨 (Primer 패턴)

### D.1 governance.json 확장

```json
{
  "components": {
    "MCFormTextInput": { "lifecycle": "stable", "since": "2024-01" },
    "MCAdPacingHeatmap": { "lifecycle": "experimental", "since": "2026-05" },
    "MCRangeSlider": { "lifecycle": "watch_list", "request_count": 3, "first_seen": "2026-05-10" }
  }
}
```

### D.2 Lifecycle 단계 (Primer 6단계 단순화 → 4단계)

| Stage | 조건 |
|-------|------|
| `experimental` | proof-of-concept 존재 (PR open) |
| `alpha` | 1 production 사용 |
| `beta` | 2+ production 사용 + DS 디자이너 review |
| `stable` | 1개월 이상 API 변경 X |
| `deprecated` | 마이그레이션 경로 + 1개월 advance notice |
| `removed` | components.json 에서 삭제 |

### D.3 Molly 가 lifecycle 인식

plan-emitter SYSTEM_PROMPT 에 가이드 추가:
- `experimental` / `alpha` 컴포넌트 사용 시 plan_item description 에 "(experimental, may change)" 추가
- `deprecated` 컴포넌트 사용 자동 차단

### Slice D 작업

| Task | 시간 |
|------|------|
| governance.json schema 확장 (lifecycle, since 필드) | 1h |
| 4 단계 transition 로직 (수동 + 자동 일부) | 2h |
| plan-emitter SYSTEM_PROMPT 가이드 갱신 | 1h |
| GovernancePage Lifecycle Table 에 표시 | (Slice C 와 통합) |

**Slice D DoD:**
- [ ] governance.json 모든 컴포넌트에 lifecycle 필드
- [ ] plan-emitter 가 experimental/deprecated 인식

---

## Slice E — Triage Workflow (주 1회 30분)

### E.1 Triage 미팅 형태

- **빈도**: 주 1회 30분 (DS 팀 1-2명 + 사용자 본인)
- **장소**: Slack huddle 또는 Google Meet
- **자료**: GovernancePage Request Frequency Bar + 신규 PR/Issue 리스트

### E.2 결정 카테고리

| 결정 | GitHub 액션 |
|------|-----------|
| `accept` (구현 시작) | 라벨 추가 + 담당자 배정 + 스프린트 배정 |
| `needs-info` (정보 부족) | comment 로 추가 정보 요청 |
| `wont-implement` (거절) | 라벨 추가 + 거절 이유 comment + 사용자 DM (자동) |
| `defer` (보류) | watch_list 유지, 3개월 후 재검토 |

### E.3 72h SLA

- Issue 생성 후 72h 내 first response 보장 (라벨 또는 comment)
- 미응답 시 Slack DS 팀 채널 자동 알림

### E.4 RFC 옵션 (Level 3 — 큰 컴포넌트)

신규 컴포넌트가 복잡 (예: MCAdPacingHeatmap) 시:
- Issue → "needs Full RFC" 라벨
- 사용자에게 RFC template 제공 (problem / proposed API / alternatives / accessibility)
- DS 팀이 1주일 review

### Slice E 작업

| Task | 시간 |
|------|------|
| Triage workflow 문서 (`docs/superpowers/triage-workflow.md`) | 2h |
| RFC template (`.github/ISSUE_TEMPLATE/ds-component-rfc.md`) | 1h |
| 72h SLA 자동 알림 (GitHub Actions) | 2h |
| 첫 triage 미팅 진행 | (시범 운영 후) |

**Slice E DoD:**
- [ ] Triage workflow 문서 + RFC template
- [ ] 72h SLA 알림 작동
- [ ] 첫 triage 미팅에서 실제 결정 (시범 운영 데이터로)

---

## 의존성 / 진행 순서

```
시범 운영 시작 (다음 주)
  ↓
Slice A (4-옵션 UX) — 가장 먼저 (사용자 차단 차단)
  ↓
Slice B (Auto-PR) + Slice C (Metric) — 병행 가능
  ↓
Slice D (Lifecycle) — Slice A/B/C 와 별개
  ↓
Slice E (Triage) — 시범 운영 1주 후 첫 미팅
```

**병행 가능**: A (UI) + B (backend PR) 는 다른 layer 라 병행

---

## 위험 / footguns

| Risk | Mitigation |
|------|-----------|
| GitHub App 권한 / 보안 | design-system repo 에만 install. 8h auto-rotation |
| 자동 PR 노이즈 (반복 요청) | Dedup (`gh search`) + 90일 stale-bot |
| DS 팀 review 부담 | 주 1회 30분 batch + 72h SLA + Federated 모델 |
| ⓒ/ⓓ "초안 보기" 우회 가능 | 즉시 PR 생성 안 함, 2단계 보장 |
| 사용자가 ⓐ만 계속 선택 → DS 진화 0 | telemetry 로 추적, ⓐ 비율 90%+ 면 closest_match 알고리즘 검토 |
| lifecycle `experimental` 사용 → 깨지는 코드 | plan-emitter 가 명시 경고 + typecheck 가 안전망 |
| 사내 DS 팀 미정 | 사용자 본인이 일단 DS 팀 역할 — 5명 확장 시 정식 |
| GitHub App private key 노출 | Secret Manager (GCP P1) 까지 .env 에 두지 말 것 |

---

## 작업 시간 추정 총계

| Slice | 처음 | 익숙 후 |
|-------|------|---------|
| A — 4-옵션 UX | 1.5-2일 | 1일 |
| B — Auto-PR | 1-1.5일 | 0.5일 |
| C — Metric + 시각화 | 1-1.5일 | 0.5일 |
| D — Lifecycle | 0.5일 | 0.25일 |
| E — Triage workflow | 0.5일 | 0.25일 |
| **합계** | **5-6일** | **2.5-3일** |

Momus 비판 (시간 1.5x 보정 권장) 고려 시: **처음 7-9일** 가정.

---

## 다음 단계

1. **plan review** (사용자) — 이 문서 검토 + 수정 요청
2. **다음 주 2명 시범 운영 시작** — Slice A 만 우선 (사용자 차단 차단)
3. **시범 운영 1주 후** — Slice B/C 진행 (실제 요청 데이터 기반)
4. **GCP 배포 시점** — Slice D/E 정식화 + GitHub App 권한 Secret Manager 이전

---

## References

리서치 결과 (5명 병렬):
- R1: DS escalation production 사례 — Builder.io, Figma MCP, Primer, Carbon, Atlassian, Knapsack
- R2: 4-옵션 UX 패턴 — Slack Block Kit, NN/g confirmation, Builder.io remapping
- R3: Auto-PR generation — GitHub App, peter-evans/create-pull-request, Dependabot
- R4: DS evolution metrics — 6 metric, 4 시각화, RICE, NL Design System
- R5: Component proposal RFC — Polaris, Atlassian, Carbon, Primer, EightShapes Federated

선행 plan:
- `2026-05-07-molly-ds-loop-v2-research-informed.md` (S3 Phase F/G 와 통합)
- `2026-05-11-local-share-cloudflare-tunnel.md` (2명 시범)
- `2026-05-11-gcp-deploy-phased.md` (GCP P1 Secret Manager 와 연계)

공식 문서:
- [peter-evans/create-pull-request](https://github.com/peter-evans/create-pull-request)
- [GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
- [Slack Block Kit](https://docs.slack.dev/block-kit/)
- [Primer Component Lifecycle](https://primer.github.io/contribute/component-lifecycle/)
- [NN/g Confirmation Dialogs](https://www.nngroup.com/articles/confirmation-dialog/)
