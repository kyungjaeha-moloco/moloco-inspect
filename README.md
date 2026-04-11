# Moloco Inspect

Moloco Inspect는 라이브 페이지를 보며 요소를 선택하고, 자연어 또는 PRD 기반 요청을 보내고, 에이전트가 계획을 제안한 뒤 검증된 preview를 리뷰하고 로컬 코드에 적용할 수 있게 만드는 product-editing agent proposal workspace입니다.

## 현재 상태

이 repo는 proposal 전용 새 저장소로 막 생성된 상태입니다. 실제 구현 자산은 아직 아래 원본 workspace에 있습니다.

- `/Users/kyungjae.ha/Documents/Agent-Design-System`

현재 이 원본 workspace에는 아래가 이미 구현되어 있습니다.

- 크롬 확장프로그램 기반 click-to-inspect flow
- 로컬 orchestrator
- preview bootstrap route
- contract-first design system
- UX writing rulebook + validation
- 운영 analytics ledger + dashboard
- PRD 링크 ingest 1차 MVP

그리고 1차 이관으로 아래 자산은 이미 이 repo 안에 들어왔습니다.

- `dashboard/`
  - `design-system` 로컬 사본을 우선 읽는 proposal dashboard 이관본
- `orchestrator/`
  - source workspace를 참조하는 형태의 proposal orchestrator 이관본
- `chrome-extension/`
  - proposal repo 기준으로 로드 가능한 1차 extension 이관본
- `design-system/`
  - JSON source of truth와 검증/문서 생성 스크립트를 담은 1차 design system 이관본

이 repo의 다음 목표는 위 자산들을 proposal 기준으로 정리하고, 점진적으로 `moloco-inspect` 안으로 이관하는 것입니다.

## 핵심 경험

1. 사용자가 로컬 제품 페이지를 연다
2. 요소를 inspect 하거나 영역을 캡처한다
3. 자연어 또는 PRD 링크로 변경 요청을 만든다
4. 에이전트가 실행 계획을 제안한다
5. 사용자가 계획을 확인한다
6. 에이전트가 코드 수정, validate, typecheck, preview screenshot, preview page를 만든다
7. 사용자가 review 후 local apply 한다
8. 요청 이력과 운영 지표는 dashboard에 남는다

## 현재 원본 자산 위치

- Chrome extension: `/Users/kyungjae.ha/Documents/Agent-Design-System/chrome-extension`
- Orchestrator: `/Users/kyungjae.ha/Documents/Agent-Design-System/orchestrator`
- Design system: `/Users/kyungjae.ha/Documents/Agent-Design-System/design-system`
- Dashboard + docs: `/Users/kyungjae.ha/Documents/Agent-Design-System/contract-first-program/dashboard`
- Product target: `/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal`

현재는 아래 자산이 이 repo 안에도 존재합니다.

- `/Users/kyungjae.ha/Documents/moloco-inspect/dashboard`
- `/Users/kyungjae.ha/Documents/moloco-inspect/orchestrator`
- `/Users/kyungjae.ha/Documents/moloco-inspect/chrome-extension`
- `/Users/kyungjae.ha/Documents/moloco-inspect/design-system`

## 이 repo에서 먼저 할 일

1. proposal 문서와 handoff를 이 repo 기준으로 정리
2. 남은 source workspace 의존성을 식별
3. 최소 실행 단위를 정의
4. 이후 orchestrator/extension/dashboard/design-system의 독립성을 점진적으로 높이기

## 문서

- [Bootstrap Plan](./docs/BOOTSTRAP_PLAN.md)
- [Source Workspace Map](./docs/SOURCE_WORKSPACE_MAP.md)
- [Initial Handoff](./docs/INITIAL_HANDOFF.md)

## 제안 설명용 한 문장

Moloco Inspect는 PM/SA가 실제 화면을 보며 수정 요청을 만들면, 에이전트가 계획을 제안하고 코드 수정, 검증, preview, 적용까지 이어주는 로컬 product-editing agent proposal입니다.
