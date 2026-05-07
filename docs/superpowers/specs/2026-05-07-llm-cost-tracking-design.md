# LLM 비용 추적 + Dashboard Overview — Design Spec

**Date:** 2026-05-07
**Author:** kyungjae.ha (with Claude)
**Branch:** main
**Related:**
- 다음 슬라이스 (별 spec): D+ verification 자동 재시도 — `docs/superpowers/specs/2026-05-07-d-plus-verification-auto-retry-design.md`

---

## 1. 동기

운영 중인 Molly 의 LLM 비용이 가시화되지 않는다. molly lib 호출은 토큰만 기록하고 USD 환산 없음. dashboard 의 MollyMetricsPage 는 성능 (latency, cache hit) 만 표시. 곧 D+ 자동 재시도가 추가 비용 발생 → 사전에 cost 추적이 필요.

## 2. 목표 / 비-목표

**목표**
- molly lib + sandbox agent 호출의 USD 비용 가시화
- Dashboard Overview 에 KPI (오늘 / 7일 / 30일) + 시간별 추이 + 모델/소스별 분포
- 모델별 정확한 단가 (Anthropic 공식 2026-05-07 기준)
- 알 수 없는 모델 호출 감지 (silent miscalculation 방지)

**비-목표**
- 잡당 / 사용자당 drill-down (B 안만, C 는 추후)
- 사전 집계 daily rollup (30d 까지는 NDJSON 직접 read)
- 비용 cap / 알람 / 자동 차단
- Pricing 자동 fetch (수동 업데이트, 분기별 검토)
- 회계용 historical price freeze (운영 view 용 — 현재 단가 retroactive 적용)

## 3. 결정 사항

| 항목 | 결정 |
|---|---|
| 디테일 수준 | **B**: KPI 3 카드 + 시간별 차트 + 모델/소스별 분포 |
| 단가 출처 | molly-pricing.js (수동 버전 관리, 출처 URL + 확인 일자 주석) |
| Cost 계산 시점 | **read time** (events 는 토큰만 저장, USD 는 API 호출 시 계산) |
| 알 수 없는 모델 | 0 cost + 카운터 증가 + UI 경고 |
| Sandbox agent USD | opencode 가 USD 직접 제공 → 그 값 사용 (by_model 은 가능 시 정확도 ↑) |
| 데이터 소스 | molly-metrics ring buffer (recent) + NDJSON 파일 (older) |

## 4. Architecture

```
LLM 호출 → recordEvent('lib_call', {model, input/output/cache_create/cache_read tokens})
       → ring buffer + NDJSON (이미 있음)
       ↓
[신규] /api/molly/cost?window=24h|7d|30d
       ↓
[신규] molly-cost.js: getCostMetrics(window)
       events × molly-pricing.js → { total_usd, by_model, by_source, hourly_series }
       ↓
[신규] Dashboard Cost 섹션 (KPI / 차트 / 분포)
```

## 5. 변경 파일

| 파일 | 변경 |
|---|---|
| `orchestrator/lib/molly-pricing.js` | **신규** — 단가 테이블 + `getPricing(modelId)` |
| `orchestrator/lib/molly-cost.js` | **신규** — `getCostMetrics(window)` |
| `orchestrator/server.js` | `GET /api/molly/cost` endpoint 추가 |
| `dashboard/src/pages/MollyMetricsPage.tsx` | Cost 섹션 prepend (별 탭 X) |
| `dashboard/src/services/api.ts` (또는 동등) | `fetchCostMetrics(window)` |
| `orchestrator/lib/molly-metrics.js` | 변경 없음 (기존 token 기록 그대로) |
| 기존 5 lib (classifier/chat/status/PRD/plan-emitter) | 변경 없음 |

## 6. 핵심 인터페이스

```javascript
// molly-pricing.js
export const PRICING = {
  'claude-haiku-4-5-20251001':  { input: 1.00, output: 5.00,  cacheCreate: 1.25, cacheRead: 0.10 },
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00, cacheCreate: 3.75, cacheRead: 0.30 },
  'claude-sonnet-4-6':          { input: 3.00, output: 15.00, cacheCreate: 3.75, cacheRead: 0.30 },
  'claude-opus-4-5-20251101':   { input: 5.00, output: 25.00, cacheCreate: 6.25, cacheRead: 0.50 },
  'claude-opus-4-6':            { input: 5.00, output: 25.00, cacheCreate: 6.25, cacheRead: 0.50 },
  'claude-opus-4-7':            { input: 5.00, output: 25.00, cacheCreate: 6.25, cacheRead: 0.50 },
};
// USD per 1M tokens. Source: https://platform.claude.com/docs/en/about-claude/pricing
// Verified: 2026-05-07. Sonnet 4 (deprecated 2026-06-15) 의도적 제외.

export function getPricing(modelId) → { input, output, cacheCreate, cacheRead } | null

// molly-cost.js
export async function getCostMetrics(window: '24h'|'7d'|'30d') → {
  total_usd: number,
  by_model: Record<modelId, { calls, tokens, usd }>,
  by_source: Record<lib, { calls, usd }>,
  hourly_series: Array<{ hour: ISO8601, usd: number }>,
  unknown_model_calls: number
}
```

비용 계산:
```
event_usd = (input/1e6)×p.input + (output/1e6)×p.output
          + (cache_create/1e6)×p.cacheCreate + (cache_read/1e6)×p.cacheRead
```

API 응답 schema (위 시그니처 그대로 wrap): `{ ok: true, window, ...metrics }`

## 7. UX (Dashboard)

MollyMetricsPage 위쪽에 prepend:
1. **KPI 카드 3개** — 오늘 / 7일 / 30일 누적 USD (큰 숫자)
2. **시간별 추이 차트** (24h, AreaChart) — Recharts (이미 사용 중인지 plan 에서 확인)
3. **모델별 분포** (horizontal bar) — Opus / Sonnet / Haiku 누적 USD + %
4. **소스별 분포** (horizontal bar) — agent / plan-emitter / classifier / chat / status / PRD
5. **경고** — "지원 안 되는 모델 호출 N 건" (N>0 일 때만 빨강)

윈도우 토글 (24h / 7d / 30d) — KPI 외 차트/분포에 적용.

## 8. 에러 / 경계 케이스

| 케이스 | 처리 |
|---|---|
| 알 수 없는 모델 ID | event 0 cost + counter 증가 + UI 경고 |
| Pricing 변경 | molly-pricing.js 수동 업데이트 (분기별 검토). historical events 는 새 단가로 재계산 (운영 view) |
| Agent USD (opencode 직접 제공) | molly-pricing 우회, agent_done 이벤트의 cost 필드 그대로. by_source='agent' tag |
| Ring buffer 만료 | 24h+ 는 NDJSON 파일 (`molly-metrics-YYYY-MM-DD.ndjson`) 읽기 |
| 30d window IO 부담 | 일별 NDJSON 30개 read, 응답 ~수백 ms 허용. 추후 daily rollup (비-목표) |
| NDJSON 파일 부재 | 0 으로 처리 |

## 9. 검증

자동:
- pricing.js 단위 (단가 일치)
- cost.js 단위 — fixture events × pricing → 예상 USD
- API smoke (`curl /api/molly/cost?window=24h`)
- `pnpm tsc --noEmit` (dashboard)

수동:
1. Dashboard cost 섹션 렌더 확인
2. plan emit 1회 → 24h 카드 값 증가 확인
3. window 토글 → 값 변화
4. 인위적 unknown model 호출 → 경고 카드 표시

## 10. 알려진 한계

- 과거 events cost 가 **현재 단가로 retroactive 계산** — 회계 X, 운영 view ✓
- Sandbox agent 의 by_model 정확도 — opencode `agentResult.tokens` 캡처 가능 시 ↑
- 30d window IO 부담 — daily rollup 도입 후보 (비-목표)
- Recharts 의존성 — dashboard 에 있는지 plan 단계 확인. 없으면 추가
- Pricing 자동 알림 없음 — 분기별 수동 검토 권장

## 11. Backout

- `/api/molly/cost` endpoint 제거 + Cost 섹션 import 제거 → 즉시 backout
- molly-pricing.js / molly-cost.js 는 별 모듈, 다른 코드 영향 없음

## 12. 추정 작업량

- molly-pricing.js: 30 줄
- molly-cost.js: 80-100 줄
- server.js endpoint: 10 줄
- Dashboard cost 섹션: 100-150 줄
- API client / types: 20 줄
- 합계: ~250 줄, **0.5d**

## 13. 다음 단계

1. 본 spec 사용자 리뷰 → 확정
2. `superpowers:writing-plans` 로 implementation plan 작성 (또는 user 가 직접 구현 진행 지시)
3. 구현 + 자동 테스트 + 사용자 수동 smoke
4. 운영 1주 후 cost 데이터 확인 → daily rollup / drill-down 확장 여부 결정
5. 분기별 pricing 검토 task 등록

---

**개정 이력**: 초판 2026-05-07.
