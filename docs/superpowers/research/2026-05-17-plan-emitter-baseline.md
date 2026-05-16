# Plan-emitter baseline (T1.0)

**Date:** 2026-05-17
**Source:** `orchestrator/state/molly-metrics-*.ndjson` (period 2026-05-06 ~ 2026-05-12)
**Tracking plan:** `docs/superpowers/plans/2026-05-17-open-codesign-inspired-six-tracks-v2.md` (T1.0)
**Decision:** A-1 — historical 토큰 baseline 확보 + 응축 후 paired 측정 (typecheck/refs 절대값은 T1.3 시점에 같이 측정)

---

## 1. Sample

- **n = 11** plan-emitter 호출 (목표 n≥10 도달 ✅)
- 기간: 2026-05-07T03:52Z ~ 2026-05-12T01:57Z (5일간)
- Model 분포:
  - `claude-opus-4-7`: 5건
  - `claude-sonnet-4-6`: 6건 (2026-05-07 이후 디폴트 전환)
- Surface 분포: `playground` 2, `slack` 1, `smoke*` 3, `unknown` 5
  - ⚠️ 절반 (5건) 은 historical noise (smoke 테스트 + surface tag 누락). 응축 후 paired 측정은 동일 surface(playground) 일관성 유지 권장.

---

## 2. 토큰 메트릭 (raw)

| 메트릭 | n | avg | median | min | max | std |
|--------|---|-----|--------|-----|-----|-----|
| `input_tokens` (non-cached part) | 11 | 178 | 170 | 121 | 285 | 49 |
| `cache_creation_input_tokens` | 11 | **114,612** | 71,259 | 0 | 225,066 | 102,591 |
| `cache_read_input_tokens` | 11 | 80,624 | **0** | 0 | 224,972 | 106,674 |
| `output_tokens` | 11 | 2,826 | 2,468 | 1,216 | 5,346 | 1,317 |
| `latency_ms` | 11 | 45,576 | 44,734 | 18,787 | 86,976 | 20,626 |
| `n_items` (plan 항목 수) | 11 | 5 | 5 | 4 | 7 | 1 |

---

## 3. 핵심 관찰

### 3.1 Cache hit ratio 가 양극단
- `cache_create` median 71K vs `cache_read` median **0** → **절반 이상의 호출이 cold cache** (5분/1h ttl 만료 후 첫 호출).
- 5일간 11건 → 평균 호출 간격 ≈ 11시간 → ttl 1h 만료가 매우 흔함.
- **함의**: 응축 효과는 cold start (cache_create) 에서 가장 크게 나타남.

### 3.2 input_tokens 는 작지만 신뢰도 낮음
- avg 178 / median 170 — 모두 user message + non-cache prefix 합산.
- system block(~150K)이 cache prefix 안에 포함되므로 input_tokens에 안 잡힘.
- **함의**: H1 임계값 "input_tokens −70%" 는 의미가 약함. **cache_creation −80% 임계값이 훨씬 더 강력 evidence.**

### 3.3 Latency 가 큼 (avg 45.6s)
- 모든 호출에서 thinking 켜져있음 (`thinking_budget` > 0).
- max 86s — 응축이 latency 개선에도 기여 가능 (system 토큰 ↓ → 처리 시간 ↓).

---

## 4. 빠진 데이터 (T1.3 paired 측정에서 확보 예정)

- ❌ `typecheck pass rate` — plan body가 어디에도 보존되지 않음. sandbox dry-run 데이터 0.
- ❌ `referenced_components 정확도` — 동일.
- ❌ PRD 텍스트 — metric에 PRD 본문 미저장. **동일 PRD로 응축 전/후 paired 측정 불가**. 새 10건 PRD 셋 만들어서 paired baseline 필요.

---

## 5. T1.3 paired 측정 설계 (A-1 결정)

응축 적용 후 (T1.2 완료 시점):
1. **고정 10건 PRD 셋** 만들기 (다양한 클라이언트 / route / change_intent / 복잡도)
2. 응축 **전** plan-emitter 로 10건 plan emit → baseline 절대값 측정 (typecheck pass rate, referenced_components 정확도, 토큰 메트릭 다)
3. 응축 **후** plan-emitter 로 같은 10건 plan emit → 측정
4. paired delta 비교 (Wilcoxon signed-rank 또는 단순 평균 비교)

**임계값** (v2 plan T1.0 §H1 통일):
- (1) typecheck pass rate: 응축 전 N% → 응축 후 ≥ (N − 10)%p
- (2) input_tokens: −70% 이상 ↓ (NOTE: 의미 약함 — cache_creation을 primary metric으로)
- (3) cache_creation_input_tokens: −80% 이상 ↓ (**primary metric**)

예상 비용: 10건 × 2 (전/후) × ~45s × thinking = 약 30-40분 시간 + LLM 호출 비용 **$10-15** 추정.

---

## 6. 결론

- T1.0 baseline = 토큰 메트릭 historical (n=11). typecheck/refs는 미확보.
- A-1 결정: 응축 후 T1.3 시점에 동일 10건 PRD로 paired 측정 — baseline 절대값과 delta 동시 측정.
- T1.1 (DESIGN.md 작성) 으로 다음 단계 진행.

---

*Baseline by Claude session 2026-05-17. metrics ndjson 4개 파일 (2026-05-06/07/11/12) 에서 추출.*
