# AI 에이전트 피드백 루프 설계 — 결정 프레임워크 reference

**Date:** 2026-04-30
**Author:** kyungjae.ha (with Claude)
**Use as:** molly 또는 향후 다른 AI 에이전트의 피드백 루프 설계 시 결정 reference. 옵션 비교가 아니라 **어떻게 결정할지** 의 framework.

> 짝 문서: `2026-04-30-molly-feedback-loop.md` (옵션 비교 + molly 적용)

---

## TL;DR

5 개 framework (Hamel Husain / Shreya Shankar / Eugene Yan / Anthropic / Amit Kothari) 가 같은 흐름을 권장: **관찰 → 분류 → binary 기준 → assertion → LLM judge → A/B → fine-tune**. 단계 사이에 **명확한 prerequisite** 존재. 일찍 다음 단계로 점프하면 EDD 함정 / Generic 지표 / 미사용 데이터 / RLHF 조기 도입 5 가지 함정에 빠짐. **인프라보다 관찰이 먼저** 가 모든 framework 의 공통 권장.

---

## 1. 5 개 framework 비교

### A. Hamel Husain — 3-Level Eval 피라미드

출처: [Your AI Product Needs Evals](https://hamel.dev/blog/posts/evals/) + [Evals FAQ](https://hamel.dev/blog/posts/evals-faq/)

| Level | 유형 | 비용 | 실행 시점 |
|---|---|---|---|
| 1 | 코드 기반 unit test (assertion / regex) | 최저 | 매 코드 변경 |
| 2 | Human + LLM-as-Judge (trace 리뷰) | 중간 | 주기적 |
| 3 | A/B Testing (실 유저 비교) | 최고 | 트래픽 충분할 때만 |

**전환 기준**:
- L1 → L2: solid foundation 후. 50+ 실제 실패 케이스 수집 후.
- L2 → L3: "실 유저에게 보여줄 준비" — 명시 임계값 없고 판단 기반.
- 시작: **임계값 없음. 지금 가진 데이터로 당장 시작**.

---

### B. Shreya Shankar — Data Flywheel

출처: [Data Flywheels for LLM Applications](https://www.sh-reya.com/blog/ai-engineering-flywheel/)

```
Evaluation (지표 정의)
    ↓
Monitoring (지표 구현 + 로깅)
    ↓
Continual Improvement (루프 클로징)
    ↓ (반복)
Evaluation (새 실패 모드 반영)
```

**핵심 통찰**: **Likert 1-5 점이 아닌 binary pass/fail** 로 시작. 판단이 명확해지고 일관성 ↑.

**전환 기준**:
- Evaluation → Monitoring: 지표가 binary 가능한 수준
- Monitoring → CI: 패턴/클러스터 형태 저성능 사례가 로그에 보이기 시작
- CI → 재평가: 새 실패 모드가 기존 지표에 안 잡힘

---

### C. Eugene Yan — 과학적 방법론 + 패턴 dependency

출처: [LLM Patterns](https://eugeneyan.com/writing/llm-patterns/) + [Eval Process](https://eugeneyan.com/writing/eval-process/)

**사이클**: 관찰 → 어노테이션 → 가설 → 실험 → 측정 → 반복

**패턴 도입 순서 (명시 dependency graph)**:
```
[1] Evals (측정) ← 모든 것의 전제
    ↓
[2] RAG (지식 확장) ← 독립적이나 eval 있어야 효과 측정 가능
    ↓
[3] Guardrails (방어적 UX) ← 출력값 검증 가능해야
    ↓
[4] Fine-tuning / Caching ← 충분한 피드백 + 사용 패턴 후
```

**숫자 임계값**: Fine-tuning 은 InstructGPT 기준 **13k instruction-output samples for SFT, 33k for reward modeling**. 미만이면 시기상조.

---

### D. Anthropic — Agent Eval 성숙도 모델

출처: [Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

| 단계 | 명칭 | 특징 |
|---|---|---|
| 초기 | Manual + Dogfooding | 직관 + 수동 테스트 |
| 성장 | Capability Evals | **각 실패에서 뽑은 20-50 task**, 낮은 pass rate 목표 |
| 최적화 | Regression Suite | 높은 pass rate eval 들이 regression 으로 졸업 |
| 운영 | CI/CD 통합 | A/B + production monitoring |

**전환 기준**:
- 초기 → 성장: 실패 발생 시 즉시. **20-50 task** 가 출발점.
- 성장 → 최적화: eval saturation (기존이 새 실패 못 잡음).
- 최적화 → 운영: 실 트래픽 충분 시.

**소규모 팀 원칙**: 직접 인프라 X. LangSmith/Braintrust/Harbor 같은 기존 도구 활용.

---

### E. Amit Kothari — Agentic Feedback Loop 실전

출처: [Designing Agentic Feedback Loops](https://amitkoth.com/agentic-feedback-loops/)

```
Week 0:    에이전트 1개 + 툴 1개 + 루프 X
Week 1:    3회 재시도 + 토큰 모니터링
Week 2-4:  피드백 채널 3개 (Broken / Confused / Ideas)
Month 1:   패턴 분석, 반복 불만 우선순위
Ongoing:   모든 것 로깅, 48h 내 가시 응답
```

**임계값**:
- 같은 불만 **3 번 이상 반복** → 최우선 수정
- 토큰 비용 baseline **10 배 초과** → context explosion
- 피드백 응답 지연 **1 주 초과** → 신뢰 훼손

---

## 2. 공통 결정 원칙

### "어떤 신호를 먼저 잡을지" — Cheap-First 원칙

```
1순위: 수동 trace 리뷰 (시간만)
   → 50-100개 실제 출력 직접 읽음
   → 실패 유형 open coding 분류

2순위: Binary pass/fail assertion (코드)
   → regex / 구조 / 길이
   → CI 통합 가능

3순위: LLM-as-Judge (중간 비용)
   → 2 순위로 안 잡히는 주관적 품질만
   → 반드시 human calibration

4순위: A/B / RLHF (최고)
   → 실 유저 충분 시
   → 13k+ labeled 없으면 RLHF 시기상조
```

### 신호 수집 dependency

**지표 정의 → 모니터링 → 패턴 발견 → 가설 → 실험 → fine-tuning**.

각 단계가 다음 단계의 prerequisite. 건너뛰면 의미 없는 인프라 누적.

---

## 3. 흔한 함정 (이걸 피하면 90% 성공)

### 🔴 함정 1 — EDD (Eval-Driven Development) 맹신

TDD 처럼 "eval 을 먼저 정의" → 상상한 실패에 eval 만들고 **실제 실패 못 잡음**. LLM 은 실패 표면이 무한대.

**대안**: 실제 실패를 먼저 관찰 → 그 데이터로 eval 작성.

> **molly 적용**: 옵션 A 의 "원칙 5-7 개 미리 정의" 가 이 함정 위험. 24 잡 trace 분류 후 도출해야 함.

### 🔴 함정 2 — Generic 지표 사용

MMLU, BLEU, perplexity 같은 off-the-shelf 벤치마크 → 도메인과 무관한 추상 품질 측정.

**대안**: domain-specific task-specific eval 직접 구성.

### 🔴 함정 3 — 피드백 수집 → close 안 함

로그는 쌓이는데 아무도 리뷰 안 함. **"Feedback without action kills trust faster than no feedback at all"**.

**대안**: 수집 전에 **리뷰 담당자 + cadence 먼저 결정**.

### 🔴 함정 4 — 어노테이션 외주화

실패를 직접 안 보면 개선 방향 이해 못 함.

**대안**: 초기에는 반드시 내부에서 직접 trace 리뷰.

### 🔴 함정 5 — Path grading

에이전트가 예상 못 한 경로로 성공해도 실패로 찍음.

**대안**: 최종 output / outcome 기준 평가.

### 🔴 함정 6 — Fine-tuning / RLHF 조기

데이터 부족 상태에서 ML 인프라 투자. SFT 만 13k 샘플 필요.

**대안**: prompt engineering + RAG 로 한계까지.

### 🔴 함정 7 — 멀티에이전트 조기

4 개 초과 에이전트 → "telephone game hallucination". 복잡도가 정확도 개선 상쇄.

**대안**: 1 에이전트 + 1 툴부터 단계적 확장.

---

## 4. 보편 결정 알고리즘 (질문 트리)

```
Q1. 실제 실패 케이스 50+ 개 직접 읽었는가?
    NO  → 지금 당장 trace 수동 리뷰. 실패 유형 open coding 분류.
    YES → Q2

Q2. 각 실패 유형에 binary pass/fail 기준 문서화됐는가?
    NO  → 두 사람이 독립 합의 가능한 수준 작성.
    YES → Q3

Q3. 코드 assertion (Level 1) 존재?
    NO  → 구조/형식/필수 필드 검사 구축. CI 에 넣을 수준.
    YES → Q4

Q4. 실 유저 (non-self-test) 잡 주 10+ 건?
    NO  → 여기서 멈춤. Level 1 + 수동 리뷰 유지.
            🔴 premature optimization 위험 구간 — LLM judge 도입 X
    YES → Q5

Q5. 같은 실패 유형 3+ 회 반복 패턴?
    NO  → 계속 수동 리뷰 + Level 1.
    YES → LLM-as-Judge (Level 2) 정당화. Human calibration 포함.

Q6. Level 2 eval pass rate 안정 80%+?
    NO  → prompt engineering / RAG / 아키텍처 수정.
    YES → Regression suite 전환 + CI/CD 통합. A/B 는 트래픽 후.

Q7. 수천 건의 labeled 예시 (13k SFT 기준)?
    NO  → Fine-tuning / RLHF 선택지에서 제외.
    YES → Fine-tuning 검토 가능.
```

---

## 5. 사용량 임계값 cheatsheet

| 단계 | 권장 시점 | 임계값 |
|---|---|---|
| 수동 trace 리뷰 | 즉시 | 0+ jobs |
| Binary pass/fail 정의 | 50+ 실패 관찰 후 | ~50 jobs |
| Level 1 assertion | 분류 끝난 후 | ~50-100 jobs |
| LLM-as-Judge (Level 2) | 같은 실패 3+ 회 반복 | ~100-500 jobs |
| RAG | 지식 기반 명확히 필요할 때 | ~50+ examples |
| Eval suite | Level 2 saturation 후 | ~500+ jobs |
| A/B testing | 유의미한 트래픽 | (도메인별) |
| RLHF / Fine-tuning | SFT 13k+ samples | ~13,000+ labeled |

---

## 6. molly 현 위치 (2026-04-30 기준)

- 잡 수: **24** (대부분 self-test)
- 실패 유형 분류: **없음** (자유 텍스트 review notes 만)
- Binary pass/fail: agent_review 가 부분적으로 (passed bool, notes)
- Level 1 assertion: 없음
- Level 2 LLM judge: agent_review 가 일부 역할
- 실 유저: 거의 없음

**결정 알고리즘 결과**: Q1 ~ Q2 사이. **다음 액션 = 24 잡 trace 직접 읽기 + 실패 유형 분류**.

**아직 시기상조**: 옵션 A 의 "원칙 5-7 개 미리 정의" (EDD 함정), Level 2 LLM judge 정식 도입, RAG, fine-tuning, post-merge tracking, 정성 평가 (사용자 부족).

---

## 7. 출처

| Framework | URL |
|---|---|
| Hamel Husain - 3-Level Eval | https://hamel.dev/blog/posts/evals/ |
| Hamel Husain - Evals FAQ | https://hamel.dev/blog/posts/evals-faq/ |
| Shreya Shankar - Data Flywheel | https://www.sh-reya.com/blog/ai-engineering-flywheel/ |
| Eugene Yan - LLM Patterns | https://eugeneyan.com/writing/llm-patterns/ |
| Eugene Yan - Eval Process | https://eugeneyan.com/writing/eval-process/ |
| Anthropic - Agent Evals | https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents |
| Amit Kothari - Agentic Feedback Loops | https://amitkoth.com/agentic-feedback-loops/ |

---

## 8. 이 doc 의 활용

- 새 AI 에이전트 피드백 루프 설계할 때 → 섹션 4 의 질문 트리 따라가기
- 기존 인프라 검토할 때 → 섹션 3 의 함정 7 개 점검
- 다음 stage 진입 결정할 때 → 섹션 5 의 임계값 cheatsheet
- 동료 설득할 때 → 섹션 1 의 5 framework reference 인용
