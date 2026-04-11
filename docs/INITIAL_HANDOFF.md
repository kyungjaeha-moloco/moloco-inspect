# Initial Handoff

## 이 repo의 역할

이 저장소는 proposal 단계의 `Moloco Inspect`를 설명하고 발전시키기 위한 개인 작업 repo입니다.

## 현재 중요한 사실

- 실제 제품 앱 코드는 아직 원본 workspace에 있습니다
- proposal repo 안에는 이미 `dashboard`, `orchestrator`, `chrome-extension`, `design-system` 1차 이관본이 들어와 있습니다
- proposal repo 루트의 `msm-portal` entry는 source workspace product repo를 가리키는 연결점입니다
- `preview-kit`은 preview/auth/verification contract의 실행 레이어입니다
- `product-runner`는 repo/worktree/typecheck/apply fallback contract의 실행 레이어입니다
- 이후에는 source workspace 의존성을 줄이는 방향으로 운영합니다

## 이미 검증된 핵심 흐름

원본 workspace 기준으로 아래는 이미 작동 경험을 확인했습니다.

1. inspector로 요소 선택
2. 자연어 요청
3. 계획 확인
4. code change
5. validate / typecheck
6. preview screenshot
7. preview page
8. local apply
9. analytics 기록

## 현재 중요 의사결정

- proposal repo 이름은 `moloco-inspect`
- intent 분류는 과하게 규칙화하지 않고 LLM + 사용자 확인 중심
- preview는 extension의 임시 복구가 아니라 app bootstrap route 기준
- dashboard는 운영 관측을 위한 별도 1급 자산으로 유지
- UX writing은 디자인 시스템의 일부로 취급

## 다음 AI가 가장 먼저 읽을 것

1. `/Users/kyungjae.ha/Documents/moloco-inspect/README.md`
2. `/Users/kyungjae.ha/Documents/moloco-inspect/docs/BOOTSTRAP_PLAN.md`
3. `/Users/kyungjae.ha/Documents/moloco-inspect/docs/SOURCE_WORKSPACE_MAP.md`
4. `/Users/kyungjae.ha/Documents/moloco-inspect/docs/PRODUCT_INTEGRATION_EXTRACTION_PLAN_2026-04-11.md`
5. `/Users/kyungjae.ha/Documents/moloco-inspect/docs/PRODUCT_ADAPTER_CONTRACT.md`
6. `/Users/kyungjae.ha/Documents/moloco-inspect/docs/PRODUCT_RUNNER_CONTRACT.md`
7. `/Users/kyungjae.ha/Documents/moloco-inspect/docs/PREVIEW_BOOTSTRAP_CONTRACT.md`
8. 원본 workspace의 상세 handoff:
   - `/Users/kyungjae.ha/Documents/Agent-Design-System/contract-first-program/docs/CLAUDE_HANDOFF_2026-04-11.md`

## 다음 작업 추천

1. orchestrator가 local `design-system`을 기본 경로로 쓰게 유지
2. preview-kit을 product adapter contract의 실행 레이어로 계속 키우기
3. product-runner를 통해 orchestrator의 repo/worktree 책임을 더 줄이기
4. 이후 `msm-portal` extraction 단위를 페이지/preview bootstrap 기준으로 쪼개기
