# Product Execution

`product-execution`은 `preview-kit`과 `product-runner`를 묶어 orchestrator가 product-specific preview/repo policy를 한 곳에서 호출하게 만드는 계층입니다.

## 역할

- preview context / runtime config 계산
- product file/source file 분류
- build/test 실행 policy
- copy namespace alignment / copy visibility 검증
- preview app 기동 및 screenshot capture
- repo/worktree/apply/typecheck/build/test 위임

## 현재 상태

초기 MSM Portal adapter가 들어가 있고, orchestrator는 점진적으로 이 계층을 통해 product-aware helper를 제거하는 중입니다.

## 관련 문서

- [PRODUCT_ADAPTER_CONTRACT.md](/Users/kyungjae.ha/Documents/moloco-inspect/docs/PRODUCT_ADAPTER_CONTRACT.md)
- [PRODUCT_RUNNER_CONTRACT.md](/Users/kyungjae.ha/Documents/moloco-inspect/docs/PRODUCT_RUNNER_CONTRACT.md)
- [/Users/kyungjae.ha/Documents/moloco-inspect/tooling/preview-kit/README.md](/Users/kyungjae.ha/Documents/moloco-inspect/tooling/preview-kit/README.md)
- [/Users/kyungjae.ha/Documents/moloco-inspect/tooling/product-runner/README.md](/Users/kyungjae.ha/Documents/moloco-inspect/tooling/product-runner/README.md)
