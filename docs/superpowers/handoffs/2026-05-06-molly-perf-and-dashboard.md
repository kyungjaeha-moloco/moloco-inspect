# Handoff — 2026-05-06 molly 성능 개선 + 운영 대시보드

**Date:** 2026-05-06
**Author:** kyungjae.ha (with Claude)
**Branch:** main (clean)
**Prior handoffs:** `2026-04-30-history-aware-intake.md`, `2026-04-30-marathon-session.md`

---

## TL;DR

> **molly 성능 / UX / 운영 가시성 종합 패스.** 8 항목 매트릭스 (caching → fast-path → fallback) 모두 적용 + runtime settings UI + 9 지표 metrics 대시보드. 주요 효과: plan-emitter 71K 토큰 cache hit (~90% 비용 절감), chat 모델 Haiku (~67% 절감), lifecycle template 분리 (거짓 약속 위험 0).

이번 세션 commits 12+. UX 피드백 반영 (PRD wording / Playground vs Console URL / 사용자 버블 즉시 / Chrome ext history 영구 / 콘솔 디자인 톤).

---

## 이번 세션 commits

```
0cdc4bb style(dashboard): MollyMetricsPage 콘솔 디자인 톤 통일 (피드백)
257847f feat(molly): metrics 대시보드 — 9 지표 + Inspect Console UI
1b25289 feat(molly): runtime settings UI — Inspect Console Settings 탭
a3fb7fc perf(molly): fast-path heuristic + fallback 톤 + surface awareness #5 #6 #7 #8
6e06df5 feat(molly): lifecycle_action 카테고리 분리 + chat→Haiku #2 #3 #4
31a93cb perf(molly): prompt caching + usage 로깅 — 5 lib (#1)
5b096b9 fix(molly): chat system prompt — Playground vs Console URL 명시
1796eeb fix(molly): 사용자 노출 wording 의 'PRD' → '원하는 작업'
e7846c6 feat(chrome-ext): mollyChatHistory chrome.storage 영구 보존 (origin 별 분리)
43d4ab4 fix(ux): thinking phase wording — PRD 가정 제거
44ec25d fix(chrome-ext): 사용자 버블 즉시 렌더 (전송 인지)
21782b5 fix(chrome-ext): molly thinking indicator — phase 별 진행 안내
b09aebc fix(playground): TypingIndicator phase 별 진행 안내
```

---

## What shipped

### A. 8 항목 성능 / 안정성 매트릭스

| # | 항목 | 효과 |
|---|---|---|
| **#1** Caching | `cache_control: ephemeral` 5 lib 모두 + usage 로깅 | plan-emitter 71K 토큰 ~90% cost 절감 |
| **#2** Plan thinking | env `MOLLY_PLAN_THINKING` (default 0) | grounding 정확도 옵션 |
| **#3** Chat 모델 | Sonnet 4 → Haiku 4.5 | ~67% 비용 절감, 페르소나 유지 |
| **#4** Classifier 4 카테고리 | `lifecycle_action` 분리 + 신규 lib `molly-lifecycle.js` (template, LLM X) | 거짓 약속 위험 0, 응답 0초 |
| **#5** Fast-path | 인사 / lifecycle 키워드 LLM 우회 | classifier latency 150ms → 0ms |
| **#6** Status active 필터 | 활성 잡 우선 정렬 + surface hint | 답변 정확도 ↑ |
| **#7** Fallback 톤 | timeout / api-key / rate-limit / network 별 친화 메시지 | raw error 노출 X |
| **#8** Surface awareness | chat / status prompt 에 surface 주입 | "@molly" vs "사이드패널" 안내 정확 |

### B. Runtime settings UI (commit `1b25289`)

신규 lib `molly-settings.js` — env defaults + chrome.storage 영구. 5 lib refactor — module-level const → `getMollySettings()` runtime lookup.

신규 endpoints:
- `GET /api/molly/settings` → `{ models, defaults, current }`
- `POST /api/molly/settings` → 변경 + 즉시 반영 (재시작 X)

Inspect Console (port 4174) Settings 탭 신규 "Molly Settings" 섹션:
- 5 dropdown (Classifier / Chat / Status / PRD / Plan 모델)
- 2 slider (PRD/Plan thinking budget 0-4096, step 512)
- Save / Reset to env defaults / Reload

### C. Metrics 대시보드 (commit `257847f` + `0cdc4bb`)

신규 lib `molly-metrics.js` — `recordEvent` (메모리 ring 2000 + ndjson 일별 rotate).

신규 endpoint `GET /api/molly/metrics?window=1h|24h|7d`:
- Cache hit ratio (plan-emitter)
- Chat latency (p50/p95/p99/mean)
- Classifier fast-path 비율
- Lifecycle 잡 매칭률
- PRD ambiguous 비율 + 시간 line chart
- Thinking ON vs OFF latency 비교
- Fallback 카테고리 분포
- plan_emit → job_dispatched 진행률
- Intake kind 분포

Inspect Console `/molly` 라우트 신규 페이지 — 콘솔 디자인 토큰 사용 (`.stat-card`, `.chart-panel`, `var(--accent)/--success/--danger`). window selector + 30s 자동 새로고침.

### D. UX 피드백 반영

- **PRD wording → "원하는 작업"** — jargon 제거, 누구나 이해
- **Playground (4180) vs Console (4174) URL 명확화** — molly 가 헷갈려서 잘못된 주소 안내했던 것 fix
- **사용자 버블 즉시 렌더** — Chrome ext sidepanel 에서 send 즉시 보임 (이전엔 fetch 응답 후)
- **Chrome ext history 영구 저장** — chrome.storage.local origin 별 분리. sidepanel reload 시 컨텍스트 복원
- **Thinking indicator 일반화** — "PRD 명확도 검토 중" → "맥락 분석 중" (입력 종류 무관)
- **Phase 별 진행 안내** — Chrome ext + Playground 둘 다 시간별 메시지 갱신

---

## Files changed

```
A  orchestrator/lib/molly-lifecycle.js   (#4 deterministic template)
A  orchestrator/lib/molly-settings.js    (runtime settings store)
A  orchestrator/lib/molly-metrics.js     (이벤트 수집 + 집계)
A  dashboard/src/pages/MollyMetricsPage.tsx
A  docs/superpowers/handoffs/2026-05-06-molly-perf-and-dashboard.md (이 문서)
M  orchestrator/lib/molly-classifier.js   (#1 caching, #4 카테고리 4종, #5 fast-path, settings, metrics)
M  orchestrator/lib/molly-chat.js         (#1 caching, #3 Haiku, #8 surface, settings, metrics)
M  orchestrator/lib/molly-status.js       (#1 caching, #6 active 우선, #8 surface, settings, metrics, lifecycle 절대 규칙 제거)
M  orchestrator/lib/molly-prd-analyzer.js (#1 caching, settings, metrics)
M  orchestrator/lib/molly-plan-emitter.js (#1 caching, #2 thinking opt, settings, metrics)
M  orchestrator/lib/molly-intake.js       (lifecycle_action dispatch)
M  orchestrator/server.js                 (settings/metrics endpoints, fallback 톤, intake events)
M  dashboard/src/pages/SettingsPage.tsx   (MollySettings 섹션)
M  dashboard/src/App.tsx                  (/molly 라우트)
M  dashboard/src/components/OpsLayout.tsx (metrics 아이콘)
M  dashboard/src/navigation.ts            (NAV_ITEMS 에 Metrics)
M  chrome-extension/sidepanel.js          (사용자 버블 즉시, history 영구, thinking phase, intake gate)
```

---

## 다음 세션 첫 5분

```bash
git status --short
git log --oneline -15  # 이번 세션 commits

# 서비스
curl -s -o /dev/null -w "orch :3847 → %{http_code}\n" http://localhost:3847/api/molly/settings

# Settings UI
open http://localhost:4174/settings

# Metrics 대시보드
open http://localhost:4174/molly

# orchestrator 재시작 권장
cd orchestrator && pnpm start

# Chrome ext reload (chrome://extensions/) — sidepanel 변경
# Playground 새로고침 — TypingIndicator 변경
```

---

## 검증 결과 요약

| | 결과 |
|---|---|
| plan-emitter cache | 1st `cache_create=71259`, 2nd `cache_read=71259` ✅ |
| chat 응답 (Haiku) | 페르소나 톤 / URL / 한계 안내 OK ✅ |
| classifier 4 종 | "이 잡 cancel" → lifecycle_action / "cancel 됐어?" → status_query 정확 ✅ |
| lifecycle template | 잡 식별 + surface 별 안내, 0 latency ✅ |
| Settings UI | GET/POST + 즉시 반영 ✅ |
| Metrics 페이지 | 9 카드 + 차트, 콘솔 톤 ✅ |
| Slack 실전 | surface awareness, lifecycle 거짓 약속 없음 ✅ |
| Playground 실전 | "여기 Playground에서..." surface 인지 ✅ (이번 세션 마지막 스크린샷) |

---

## 다음 세션 후보 (우선순위)

### 1. Sub-phase C 마무리 (1주 슬라이스 #6 의 남은 부분, ~1d)
이전 handoff (2026-04-30-history-aware-intake) 의 미완성:
- `job_dispatched` 가 실제 `createJob` 트리거
- message store 에 `kind` 필드 추가
- `MOLLY_HISTORY_AWARE` flag default ON 전환

### 2. 50 잡 누적 후 측정 분석 (운영 1-2주 후)
이번 세션의 metrics 페이지로 데이터 확보:
- Cache hit ratio 80%+ 인지
- chat Haiku 회귀 (사용자 피드백)
- fast-path miss 빈도
- ambiguous 비율 (너무 높/낮 아닌지)
- thinking ON vs OFF 효과 측정 (PRD analyzer thinking budget 토글하며 비교)
- fallback 카테고리 (timeout/rate-limit/network) 빈도

### 3. 자연어 액션 — 4번째 카테고리 `action` 의 *진짜* 구현 (~1주, plan 필요)
지금 lifecycle_action 은 안내만. "이 잡 cancel" 진짜 cancel 실행하려면:
- Confirmation flow (실수 방지)
- Audit log
- jobId 매칭 후 `cancelJob` 호출

### 4. Slack message metadata 박기 (~0.5d)
buildSlackHistory 의 휴리스틱 ("🤔" 접두사) 정확도 ↑. message metadata API 또는 reaction.

### 5. Sub-phase B.4 잔여 — Decomposer
큰 PRD 자동 분해 (size/scope 분석). prd-analyzer 다음 단계.

### 6. multi-tenant v1 PR + merge (별도 repo, 사용자 협업)

---

## 알려진 한계 / footguns

- **Caching threshold 미달 lib** — classifier (~1000), status (~1500), prd-analyzer (~860) 토큰. Sonnet 1024 / Haiku 2048 임계 미달. 마커는 둠 (prompt 확장 시 자동 활성).
- **Plan thinking default OFF** — 켜면 latency +5-10s. 50잡 측정 후 정책 결정.
- **Slack history kind metadata 부재** — 휴리스틱만. Phase 4 후속.
- **Playground messages store kind 필드 없음** — postIntake history 의 assistant.kind 추정 (m.plan ? plan_emit : chat). 후속 슬라이스에서 store schema 확장 필요.
- **Metrics ndjson 누적** — 일별 rotate 됐지만 30일 후 cleanup 정책 X. 별 슬라이스에서 prune.
- **Chat 응답 latency** — Haiku 로 갔지만 output token 길어 ~3-5s. 더 짧게 답변하라는 prompt 조정 검토.
- **prd-analyzer thinking 의 효과 측정 데이터 부족** — 50잡 후 ON vs OFF 직접 비교 필요.
- **Pre-existing Inspect Console TS 에러** — Recharts 타입, RequestDetailPage diff/log 필드 등.

---

## How to start the next session

```
이전 세션 핸드오프 3 개 읽고 종합:
docs/superpowers/handoffs/2026-04-30-marathon-session.md
docs/superpowers/handoffs/2026-04-30-history-aware-intake.md
docs/superpowers/handoffs/2026-05-06-molly-perf-and-dashboard.md (이 문서)

main 깨끗. 13 commits 이번 세션. molly 성능 / UX / 운영 가시성 종합 패스.

핵심 변화:
- prompt caching (plan-emitter 71K 토큰 cache hit)
- chat 모델 Haiku 다운그레이드 (~67% 비용)
- lifecycle_action 분리 (거짓 약속 위험 0)
- runtime settings UI (Inspect Console)
- 9 지표 metrics 대시보드 (/molly)
- 콘솔 디자인 토큰 통일

다음 슬라이스 후보 (우선순위 순):
  1. Sub-phase C 마무리 (1주 슬라이스 #6 잔여, 1d)
  2. 50잡 측정 (metrics 데이터 보고 분석)
  3. 자연어 액션 진짜 구현 (1주, plan 필요)
  4. Slack metadata 박기 (0.5d)
  5. Decomposer
  6. multi-tenant v1 PR

서비스: orchestrator :3847 / playground-app :4180 / dashboard :4174
orchestrator restart 권장 (settings 시작 시 file load).
Chrome ext reload + Playground refresh + dashboard 새로고침.

새 페이지: http://localhost:4174/molly (Metrics)
새 endpoints: /api/molly/settings, /api/molly/metrics
```

---

*마지막 업데이트: 2026-05-06 molly 성능 개선 + 운영 대시보드 세션 종료 시점*
