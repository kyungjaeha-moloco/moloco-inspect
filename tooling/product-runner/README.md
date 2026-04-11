# Product Runner

`product-runner`는 `moloco-inspect`가 실제 product repo를 다루는 실행 레이어입니다.

## 역할

- product repo root를 안다
- inspect worktree를 만든다
- 로컬 미커밋 변경을 worktree에 동기화한다
- baseline commit을 만든다
- product typecheck / build / test를 실행한다
- locale asset의 source/worktree string diff를 계산한다
- local apply와 fallback file sync를 수행한다
- repo 밖 경로로 빠지지 않게 막는다

## 현재 상태

초기 MSM Portal runner scaffold가 들어가 있고, orchestrator는 점진적으로 이 runner를 통해 worktree/apply 책임을 넘기는 중입니다.

기본 contract test는 아래로 실행할 수 있습니다.

```bash
cd /Users/kyungjae.ha/Documents/moloco-inspect/tooling/product-runner
pnpm test
```

## 관련 문서

- [PRODUCT_RUNNER_CONTRACT.md](/Users/kyungjae.ha/Documents/moloco-inspect/docs/PRODUCT_RUNNER_CONTRACT.md)
- [PRODUCT_ADAPTER_CONTRACT.md](/Users/kyungjae.ha/Documents/moloco-inspect/docs/PRODUCT_ADAPTER_CONTRACT.md)
