# molly 코드/디자인 피드백 루프 — 리서치 + 설계 제안

**Date:** 2026-04-30
**Author:** kyungjae.ha (with Claude)
**Status:** 리서치 완료 → 사용자 결정 대기

---

## TL;DR

> molly 는 이미 풍부한 신호를 capture 중 (task review, agent_review verdict, 사용자 retry/accept/skip, redecompose 자유 피드백, chat). 누락은 (1) 액션 사유 미수집, (2) merge 후 prod 피드백, (3) 정성 디자인 평가, (4) job lineage.
>
> **⚠️ 추가 리서치 (2026-04-30) 후 권장 수정**: 짝 문서 `2026-04-30-feedback-loop-decision-framework.md` 의 5 framework 컨센서스에 따르면 이 문서의 옵션 A ("원칙 5-7 개 미리 정의") 는 **EDD 함정 위험**. 진짜 첫 액션 = **24 잡 trace 수동 분류 (옵션 0)** → 그 결과로 원칙 도출 → 그 후 옵션 A. 직진 옵션 D (multi-tenant 먼저) 도 합리적 — 사용량 누적 동안 옵션 0 만 병행.

---

## 1. molly 가 이미 capture 중인 신호 (장점)

### 자동
- **Task-level review** (`job-reviewer.js`) — 매 task 의 diff vs description 검증, `task.review = {verdict, notes}`. DS 컴포넌트 규칙 (`MCButton2` vs raw `<button>`), scope creep 등 명시적 체크.
- **agent_review QA** — Playwright 스크린샷 + 콘솔/페이지 에러 + cumulative diff 종합 → `qaAutoResult = {passed, notes, evidence: {httpStatus, finalUrl, consoleErrorCount, ...}}`. 합성 검증 (오늘 완료) 4/4 통과.
- **opencode RULE 8** (`prompt-builder.js`) — agent 가 finish 전 `tsc --noEmit` + `curl targetRoute` 자체 검증. 단 결과는 로그만, 구조화 저장 X.
- **decomposer risks_ko[]** — PRD 별 위험 요소 0-3 개 (generic 억제).

### 사용자
- **Plan 승인/재계획** — Slack 모달 / Playground 자유 텍스트 / Chrome ext window.prompt. redecompose feedback 은 **메모리만 (디스크 미저장)**.
- **Task 카드 [재시도] [그대로 통과] [건너뛰기]** — `acceptedByUser: true` flag 만 남김. 사유 미저장.
- **QA 카드 [통과] [재실행] [Promote]** — 단순 status flip. 정성 평가 미저장.
- **Cancel 신호** — `status='cancelled'` + updatedAt. 사유 미저장.
- **Chat 메시지** (chat-store) — jobId optional 로 약하게 연결.

### 시간순 trace
- ✓ task.attempt + review.ranAt + job.updatedAt 으로 가능
- ✗ user feedback 사유, 재계획 lineage, post-merge 결과 미보존

---

## 2. 누락 / 약한 곳

| 갭 | 영향 |
|---|---|
| 액션 사유 미수집 (retry/skip/cancel/accept) | 동일 패턴 반복 실패 학습 못 함 |
| Plan redecompose feedback 미저장 | 어떤 자유 피드백이 효과적이었는지 분석 불가 |
| Post-merge 피드백 (PR revert / 후속 픽스) | "auto-QA pass != 실제 quality" 갭 측정 불가 |
| 정성 디자인 평가 (visual quality, DS 토큰 준수율) | 디자이너/PM 정성 신호 없음 |
| Job 간 lineage (이전 잡 → 다음 잡) | 누적 학습 데이터화 못 함 |
| Retry 분류 (syntax vs logic vs scope) | 실패 원인 카테고리 안 보임 |

---

## 3. 외부 패턴 비교 (5 개)

### A. Cursor 의 Online RL (행동 신호 → 모델 가중치)
- 사용자 accept (+0.75) / reject (-0.25) → policy gradient → **1.5-5h 안에 새 체크포인트**
- molly: ML 인프라 없어 직접 RL 불가. 단 **신호 수집 구조** + **불만족 후속 메시지 감지** 패턴은 prompt 레이어 모방 가능
- 복잡도: 신호 수집 1주, RL 파이프라인 1개월+
- 적용: 🟡 Medium

### B. Claude Memory Tool / CLAUDE.md (파일 기반 메모리)
- 파일에 누적 저장, 다음 세션 prompt 에 주입. **+39% 성능 개선** 보고
- molly: `decomposer_risks` + `redecompose feedback` 이미 있음 → `.molly/patterns.json` 누적 → decomposer system prompt 에 "최근 자주 실패한 패턴 TOP 3" 자동 주입
- 복잡도: 1-5일 (인프라 없이 파일 read/write)
- 적용: 🟢 **High**

### C. RAG 과거 PR 검색 (Augment Code, Sourcegraph Cody)
- PR 히스토리 + 리뷰 코멘트 + merge 결과를 벡터 DB. 신규 PRD → 유사 과거 잡 few-shot
- molly: 초기 잡 수가 적어 검색 품질 낮음. **50 잡 누적 후 실용적**
- 복잡도: 1-2주 (pgvector 또는 simple embedding)
- 적용: 🟡 Medium (장기)

### D. LLM-as-Judge Eval Cycle (Anthropic Evals, DeepEval)
- 20-50 태스크로 시작. 결정론적 + LLM judge + 인간 spot-check (10%) 레이어
- molly: agent_review 가 이미 결정론적 + LLM judge 일부. **decomposition 적절성 / DS 토큰 준수율** judge 추가하면 완성
- 복잡도: 1-2주
- 적용: 🟢 High

### E. Constitutional AI Self-Critique (Anthropic CAI)
- 모델이 자기 출력을 ~10 개 원칙 (헌법) 에 따라 자체 비평. 인간 레이블 없이 AI feedback 루프
- molly: agent_review 가 이미 CAI 의 미완성 구현체. **원칙 목록 명시 + 구조화 JSON 평가** 만 추가하면 즉시 강화
- 원칙 예: "DS 토큰 직접 하드코딩 X", "PRD acceptance criteria 모두 충족", "접근성 속성 누락 X"
- 복잡도: 1-5일 (prompt 엔지니어링 수준)
- 적용: 🟢 **High** — 추천 1순위

---

## 4. molly 적합도 — 추천 2 개

### 🥇 1순위 — Constitutional AI 셀프크리틱 (E)

**이유:**
- agent_review 단계가 이미 존재 → 비구조적 텍스트 → 원칙별 pass/fail JSON 으로 전환만
- ML 인프라 / 벡터 DB / 추가 서비스 0
- 원칙 목록을 product team 이 직접 정의 가능 (DS 토큰, accessibility, scope)
- 실패 패턴 집계 → decomposer 개선으로 자연스러운 흐름

**결합:**
- agent_review verdict + task review notes → 원칙별 실패 카운터
- 상위 3 개 실패 원칙 → 다음 세션 system prompt 자동 주입

### 🥈 2순위 — 파일 기반 메모리 (B)

**이유:**
- Claude Code CLAUDE.md 가 검증한 패턴
- decomposer 가 매번 같은 실수 반복 가능 — 파일에 쌓아두면 prompt 변경 없이 무료 개선
- 저장할 데이터 (decomposer_risks, redecompose feedback) 가 이미 흐름에 있음

**결합:**
- retry 사유 + redecompose feedback → `.molly/patterns.jsonl`
- decomposer prompt 에 "과거 유사 요청에서 자주 실패한 패턴" 자동 포함

---

## 5. 즉시 시작 lightweight loop (1 주)

### Day 1-2: 구조화된 agent_review 전환

agent-review.js 의 `verdict + notes` (자유 텍스트) → 원칙별 JSON:

```json
{
  "verdict": "pass | fail | partial",
  "principles": {
    "ds_token_compliance": true,
    "acceptance_criteria_met": false,
    "no_hardcoded_values": true,
    "accessibility_attributes": true,
    "scope_within_prd": true
  },
  "failed_reasons": ["acceptance_criteria_met: 버튼 클릭 후 상태 변경 누락"],
  "confidence": 0.82
}
```

### Day 3: 액션 사유 capture

retry / skip / cancel / accept 엔드포인트에 optional `reason` 필드:
- enum: `syntax_error | logic_error | scope_creep | wrong_target | over_delivered | other`
- 또는 자유 텍스트 (UI 가 없으면 추가, 일단 prompt UI 만이라도)

### Day 4: 패턴 메모리 파일

job 완료 시 `.molly/job-outcomes.jsonl` append:
```json
{"job_id":"...","prd_keywords":["table","filter"],"retry_count":2,"failed_principles":["acceptance_criteria_met"],"final_verdict":"accept","redecompose_feedback":["3번을 둘로 쪼개고..."],"date":"2026-04-30"}
```

### Day 5: Decomposer prompt 자동 주입

job 시작 시 jsonl 에서 최근 30 건 읽어 실패 원칙 TOP 3 추출, decomposer system prompt 끝에 append:
```
## 최근 자주 실패한 패턴 (자동 생성, 30 건 기준)
- acceptance_criteria_met: table 컴포넌트에서 상태 변경 처리 누락 (7/30)
- ds_token_compliance: color 값 직접 하드코딩 (3/30)
```

저장 위치: `state/molly-feedback/` flat 파일. DB 불필요.

---

## 6. 장기 (1-3 개월)

### 1 개월차 — Post-merge prod 피드백

GitHub webhook → molly 가 만든 PR 의 merge 후 1 주 내:
- revert 발생?
- 후속 버그 픽스 PR 발생?
- 리뷰어 코멘트 수?

→ `post_merge_quality` 점수. "auto-QA pass != 실제 quality" 갭 측정.

### 2 개월차 — 정성 인간 평가

매주 완료 잡 3-5 개 무작위 샘플 → 디자이너/PM 에게 Slack 으로 1-5 점 평가 요청 (코드 품질 / 디자인 충실도 / PRD 반영도). 응답 → job-outcomes 기록.

### 3 개월차 — RAG 기반 과거 PR 검색 (패턴 C)

50 잡 누적 시점에 pgvector 로 PR diff 임베딩. 신규 PRD → 유사 과거 잡 top-3 → decomposer few-shot. "과거에 retry 없이 accept 된 유사 잡" 우선.

---

## 7. 사용자 결정 필요 — 어느 방향?

### 옵션 A (가장 가벼움, 1 주)
- agent_review JSON 전환 + 액션 사유 + 패턴 메모리 + decomposer 자동 주입
- 원칙 목록 5-7 개를 사용자가 직접 정의 (DS 토큰 / accessibility / scope / acceptance criteria / etc.)

### 옵션 B (중간, 2-3 주)
- A + LLM-as-judge eval suite (decomposition 품질 / DS 토큰 준수율 / 접근성 자동 채점)
- regression 탐지 시 Slack 알림

### 옵션 C (전체, 1-3 개월)
- A + B + post-merge tracking + 정성 평가 + RAG

### 옵션 D (미루기)
- 지금 슬라이스 작은 일들 (Chrome ext follow-up, multi-tenant 기획) 먼저 처리하고 나중에 돌아옴

### 옵션 E (다른 방향)
- 위 패턴 5 개 외에 사용자가 보고 싶은 별도 방향 추가

**다음 단계: 옵션 결정 → implementation plan 작성 (subagent-driven 으로 실행).**

---

## Sources

External research:
- [Cursor Tab Online RL](https://cursor.com/blog/tab-rl)
- [Cursor Composer Real-time RL](https://cursor.com/blog/real-time-rl-for-composer)
- [Anthropic Evals — Demystifying](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Claude API Memory Tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)
- [Constitutional AI](https://www.anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback)
- [Augment Code Context Engine](https://blog.codacy.com/ai-giants-how-augment-code-solved-the-large-codebase-problem)
- [Sourcegraph Cody Agentic RAG](https://sourcegraph.com/blog/how-cody-understands-your-codebase)

Internal evidence:
- `orchestrator/lib/job-reviewer.js` — task review structure
- `orchestrator/lib/qa-adapters/agent-review.js` — agent_review verdict
- `orchestrator/lib/job.js:305-495` — task action FSM (사유 미수집)
- `orchestrator/server.js:3610` — redecompose feedback (메모리만)
- `orchestrator/lib/chat-store.js` — chat persistence
- 합성 검증 결과: `orchestrator/scripts/verify-agent-review.mjs` (오늘 commit `472a1af`)
