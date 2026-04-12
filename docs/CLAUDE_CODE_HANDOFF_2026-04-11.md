# Claude Code Handoff

## 목적

이 문서는 Claude Code가 `moloco-inspect`를 바로 이어서 개선할 수 있도록,

- 현재 구조
- 왜 이런 구조를 택했는지
- 각 레이어를 어떻게 써야 하는지
- 무엇이 이미 안정화됐고 무엇이 아직 proposal 단계인지
- 다음 작업을 어디서부터 이어야 하는지

를 한 번에 설명하기 위한 실무 handoff 문서입니다.

## 한 줄 요약

`Moloco Inspect`는 PM/SA가 실제 화면을 보며 수정 요청을 만들면, 에이전트가 계획을 제안하고, 코드 수정 → validate/typecheck → preview → local apply → analytics 기록까지 이어주는 로컬 product-editing agent proposal입니다.

## 현재 작동하는 핵심 사용자 흐름

1. 사용자가 로컬 제품 페이지를 연다
2. 크롬 확장프로그램에서 요소를 inspect 하거나 영역을 캡처한다
3. 자연어 요청 또는 PRD 링크 기반 요청을 만든다
4. 에이전트가 요청을 해석하고 실행 계획을 제안한다
5. 사용자가 계획을 확인한다
6. orchestrator가 isolated worktree에서 코드를 수정한다
7. design-system validate / typecheck / 조건부 build/test / preview screenshot / preview page를 만든다
8. 사용자가 preview를 보고 approve 또는 request changes 한다
9. approve 시 local apply가 실행된다
10. 요청 이력과 운영 지표는 analytics ledger와 dashboard에 남는다

## Repo 구조

### proposal repo

- `/Users/kyungjae.ha/Documents/moloco-inspect`

이 repo는 proposal과 구조 정리를 위한 개인 repo입니다. 팀 repo에 바로 올리기 전, 전체 시스템을 설명 가능하게 만드는 목적도 함께 갖습니다.

### source workspace

- `/Users/kyungjae.ha/Documents/Agent-Design-System`

현재 실제 product target인 `msm-portal` 코드는 여기에 있습니다. proposal repo는 이 product repo를 완전히 복제하지 않고, 연결점과 adapter 계약을 통해 접근하는 방향을 택했습니다.

### product entry

- `/Users/kyungjae.ha/Documents/moloco-inspect/msm-portal`

proposal repo 루트의 `msm-portal` entry는 source workspace product repo를 가리키는 연결점입니다. dashboard/viewer/runtime alias는 이 entry를 기준으로 product 코드를 읽습니다.

## 현재 이관된 자산

- `/Users/kyungjae.ha/Documents/moloco-inspect/chrome-extension`
- `/Users/kyungjae.ha/Documents/moloco-inspect/orchestrator`
- `/Users/kyungjae.ha/Documents/moloco-inspect/dashboard`
- `/Users/kyungjae.ha/Documents/moloco-inspect/design-system`
- `/Users/kyungjae.ha/Documents/moloco-inspect/tooling/preview-kit`
- `/Users/kyungjae.ha/Documents/moloco-inspect/tooling/product-runner`
- `/Users/kyungjae.ha/Documents/moloco-inspect/tooling/product-execution`

즉 proposal repo는 더 이상 문서-only repo가 아니라, 실제 작동 구조를 부분적으로 품은 workspace입니다.

## 아키텍처 레이어

### 1. Chrome Extension

경로:
- `/Users/kyungjae.ha/Documents/moloco-inspect/chrome-extension`

역할:
- element inspect
- 영역 캡처
- 자연어 요청 입력
- 계획 확인
- preview review / approve / reject
- PRD 링크 ingest UI

중요 UX 의사결정:
- 사용자는 구조화 form을 직접 채우지 않음
- AI가 자연어를 해석하고, 애매하면 짧게 되묻고, 실행 계획을 사람말로 설명한 뒤 확인받음
- intent 분류를 과하게 규칙화하지 않고, LLM + 사용자 확인을 우선함

### 2. Orchestrator

경로:
- `/Users/kyungjae.ha/Documents/moloco-inspect/orchestrator/server.js`

역할:
- request lifecycle 관리
- worktree 기반 수정 파이프라인 실행
- validation / preview / apply orchestration
- analytics ledger 기록
- dashboard용 analytics API 제공

현재 orchestrator는 점점 얇아지는 방향입니다. product-specific preview/repo logic을 직접 구현하기보다 adapter layer를 호출합니다.

### 3. Design System

경로:
- `/Users/kyungjae.ha/Documents/moloco-inspect/design-system`

역할:
- JSON source of truth
- validation rules
- UX criteria
- visual inspection rules
- UX writing rulebook
- request schema / preview verification / golden states

중요 의사결정:
- UX writing도 design system의 일부로 포함
- preview verification 규칙도 machine-readable asset으로 관리
- PRD request schema, request contract, preview contract를 design system 자산과 연결

### 4. Dashboard

경로:
- `/Users/kyungjae.ha/Documents/moloco-inspect/dashboard`

역할:
- design system docs
- UX writing docs
- 운영 analytics dashboard
- request detail drill-down

중요 의사결정:
- dashboard는 단순 문서 사이트가 아니라 운영 관측 도구
- request history / approval rate / top routes / top files / hourly throughput를 본다
- request detail에는 preview/screenshot/lifecycle/execution metadata까지 보여준다

## 새로 분리한 execution 관련 3계층

이 proposal의 핵심 구조 정리 포인트는 아래 3계층입니다.

### preview-kit

경로:
- `/Users/kyungjae.ha/Documents/moloco-inspect/tooling/preview-kit`

역할:
- preview bootstrap route 계산
- runtime config
- screenshot capture wrapper
- route verification wrapper
- copy visibility verification wrapper

의사결정:
- preview/bootstrap/capture/verify는 orchestrator 안에 흩어놓지 않고 adapter contract 뒤로 숨긴다
- product별로 bootstrap route와 e2e helper 경로가 다를 수 있으므로 preview adapter로 분리한다

### product-runner

경로:
- `/Users/kyungjae.ha/Documents/moloco-inspect/tooling/product-runner`

역할:
- product repo root
- inspect worktree 생성/정리
- local change sync
- baseline commit
- typecheck/build/test 실행
- locale diff 계산
- local apply fallback

의사결정:
- repo/worktree/apply는 preview logic과 성격이 달라서 별도 runner로 분리
- orchestrator는 git/worktree 세부 구현을 직접 알지 않도록 줄이는 방향

### product-execution

경로:
- `/Users/kyungjae.ha/Documents/moloco-inspect/tooling/product-execution`

역할:
- preview-kit + product-runner 조합
- build/test policy
- copy namespace alignment
- copy visibility verification orchestration
- preview screenshot capture orchestration
- analytics용 execution metadata 제공

의사결정:
- orchestrator가 preview-kit과 product-runner를 각각 많이 아는 상태도 결국 product-specific helper가 남는다
- 그래서 product-aware helper를 한 번 더 묶는 execution layer를 둔다
- 결과적으로 orchestrator는 요청 조율과 상태 관리 쪽으로 더 가까워진다

## 현재 구조에서 orchestrator가 직접 하는 것

아직 orchestrator가 맡는 것:
- request normalization
- prompt building
- Codex 실행
- changed files 수집
- design-system validation 실행
- phase/status/log/analytics lifecycle 관리
- approve / reject / cleanup orchestration

즉 “실행 순서와 상태 전이”는 orchestrator 책임이고,

- preview
- repo/worktree
- product-aware helper

는 점점 외부 레이어로 이동 중입니다.

## 중요한 의사결정 요약

### 1. intent 분류는 너무 타이트하게 만들지 않는다

이유:
- 자연어 표현을 규칙으로 과도하게 묶으면 UX가 딱딱해진다
- 잘못 분류된 규칙 기반 intent보다, LLM이 읽고 사용자가 계획을 확인하는 구조가 더 자연스럽다

현재 원칙:
- LLM이 해석
- 애매하면 짧은 질문
- 실행 계획을 사람말로 설명
- 사용자 컨펌 후 진행

### 2. preview는 임시 복구가 아니라 bootstrap contract로 간다

이유:
- login/workplace 문제는 바깥에서 storage를 억지로 주입하는 방식으로는 흔들린다
- app 안의 공식 bootstrap route가 필요했다

현재 원칙:
- screenshot capture
- preview page open
- route verification

은 bootstrap contract 기준으로 맞춘다

### 3. analytics는 필수 자산이다

이유:
- 이 proposal은 “실제로 운영 가능한가?”를 설명해야 한다
- 요청 이력, 승인률, 소요 시간, no-change-needed 비율 같은 운영 지표가 필요하다

현재 원칙:
- request lifecycle을 ledger로 남긴다
- dashboard에서 운영 관측이 가능해야 한다

### 4. design system은 metadata + validation + writing까지 포함한다

이유:
- 컴포넌트 catalog만으로는 에이전트 품질을 설명하기 어렵다
- UX writing, preview verification, request schema까지 포함해야 request-to-preview loop가 안정된다

## Claude Code가 이 repo를 사용할 때 권장 읽기 순서

1. `/Users/kyungjae.ha/Documents/moloco-inspect/README.md`
2. `/Users/kyungjae.ha/Documents/moloco-inspect/docs/INITIAL_HANDOFF.md`
3. `/Users/kyungjae.ha/Documents/moloco-inspect/docs/SOURCE_WORKSPACE_MAP.md`
4. `/Users/kyungjae.ha/Documents/moloco-inspect/docs/PRODUCT_ADAPTER_CONTRACT.md`
5. `/Users/kyungjae.ha/Documents/moloco-inspect/docs/PREVIEW_BOOTSTRAP_CONTRACT.md`
6. `/Users/kyungjae.ha/Documents/moloco-inspect/docs/PRODUCT_RUNNER_CONTRACT.md`
7. `/Users/kyungjae.ha/Documents/moloco-inspect/docs/PRODUCT_INTEGRATION_EXTRACTION_PLAN_2026-04-11.md`

그리고 더 깊은 역사/맥락이 필요하면 원본 workspace handoff도 읽습니다.
- `/Users/kyungjae.ha/Documents/Agent-Design-System/contract-first-program/docs/CLAUDE_HANDOFF_2026-04-11.md`

## Claude Code가 개선 작업을 시작할 때 권장 경로

### 구조 개선

읽을 파일:
- `/Users/kyungjae.ha/Documents/moloco-inspect/tooling/preview-kit`
- `/Users/kyungjae.ha/Documents/moloco-inspect/tooling/product-runner`
- `/Users/kyungjae.ha/Documents/moloco-inspect/tooling/product-execution`
- `/Users/kyungjae.ha/Documents/moloco-inspect/orchestrator/server.js`

추천 작업:
- contract 문서와 코드 구조를 더 1:1로 맞추기
- remaining orchestrator helper를 execution layer 쪽으로 더 이동
- product adapter별 확장 가능성 검토

### 제품 경험 개선

읽을 파일:
- `/Users/kyungjae.ha/Documents/moloco-inspect/chrome-extension`
- `/Users/kyungjae.ha/Documents/moloco-inspect/orchestrator/server.js`
- `/Users/kyungjae.ha/Documents/moloco-inspect/dashboard/src/analytics/AnalyticsPanels.tsx`

추천 작업:
- PRD flow 2단계: candidate 선택 -> plan 생성 API
- Chrome extension UX polish
- analytics detail 강화

### design system / docs 개선

읽을 파일:
- `/Users/kyungjae.ha/Documents/moloco-inspect/design-system/src`
- `/Users/kyungjae.ha/Documents/moloco-inspect/dashboard/src/App.tsx`

추천 작업:
- request schema / preview verification / golden states 확대
- UX writing docs와 component docs 연결 강화

## 지금도 자연스럽게 사용 가능한가?

네. 현재도 아래는 자연스럽게 사용 가능합니다.

- inspect / capture
- 자연어 요청
- 계획 확인
- background edit
- validate / typecheck / conditional build/test
- preview screenshot / preview page
- local apply
- analytics dashboard / request detail

즉 지금은 “작동하는 MVP + 설명 가능한 구조로 정리 중인 proposal” 상태입니다.

## 아직 proposal 단계로 남아 있는 부분

- product repo 전체를 proposal repo 안으로 완전히 독립시키지 않음
- `msm-portal`은 source workspace 연결점으로 참조
- extension browser E2E 일부는 여전히 flaky 가능성 존재
- PRD plan API는 1차 ingest까지만 완료, 2단계 planning은 다음 과제

## 다음 작업 추천

가장 자연스러운 다음 작업은 이 순서입니다.

1. `product-execution` contract 문서 추가
2. PRD flow 2단계: `candidate 선택 -> plan 생성 API`
3. analytics detail에 execution metadata 기반 추가 drill-down
4. remaining source workspace 의존 축소

## 사용 시 주의점

- proposal repo는 product code를 완전 소유하지 않습니다
- `msm-portal` entry와 source workspace product repo가 연결되어 있다는 점을 항상 염두에 둬야 합니다
- 구조 리팩터링 시 “실제로 지금 사용자 흐름이 유지되는지”를 우선 확인해야 합니다
- 구조를 예쁘게 만드는 것보다 request-to-preview loop가 깨지지 않는 것이 더 중요합니다

## 결론

Claude Code가 이 repo를 이어서 개선할 때 가장 중요한 관점은 이겁니다.

- orchestrator를 더 얇게 만들고
- product-specific logic을 contract 뒤로 계속 밀어넣고
- request → plan → preview → apply → analytics 흐름은 절대 깨지지 않게 유지한다

그 기준만 잡고 가면, 지금 구조는 충분히 확장 가능한 상태입니다.
