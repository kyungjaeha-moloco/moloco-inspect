# Preview Kit

`preview-kit`은 `moloco-inspect`가 product app의 preview/runtime 검증을 직접 끌어안지 않고, adapter contract를 통해 연결하도록 만들기 위한 초안 디렉토리입니다.

## 목표

- preview bootstrap URL 생성
- payload 기준 preview context 생성
- route profile 기반 readiness 검증
- screenshot capture orchestration
- product-specific implementation 분리

## 현재 상태

초기 scaffold와 MSM Portal preview adapter 초안이 들어가 있습니다.

다음 단계에서 아래를 추가할 예정입니다.

1. adapter별 runtime dependency를 더 분리
2. product-specific CLI 경로를 adapter config로 더 이동
3. 이후 다른 product adapter를 추가할 수 있게 확장

## 현재 들어간 파일

- `package.json`
- `src/types.js`
- `src/factory.js`
- `src/shared.js`
- `src/adapters/msm-portal.js`
- `src/verify.js`
- `src/capture.js`
- `src/route-verify.js`
- `src/index.js`

## 원칙

- generic logic은 `preview-kit`에 둔다
- product-specific logic은 adapter 디렉토리로 분리한다
- `orchestrator`는 가능한 한 `msm-portal` 경로를 직접 몰라야 한다

## 관련 문서

- [`/Users/kyungjae.ha/Documents/moloco-inspect/docs/PRODUCT_ADAPTER_CONTRACT.md`](/Users/kyungjae.ha/Documents/moloco-inspect/docs/PRODUCT_ADAPTER_CONTRACT.md)
- [`/Users/kyungjae.ha/Documents/moloco-inspect/docs/PREVIEW_BOOTSTRAP_CONTRACT.md`](/Users/kyungjae.ha/Documents/moloco-inspect/docs/PREVIEW_BOOTSTRAP_CONTRACT.md)
- [`/Users/kyungjae.ha/Documents/moloco-inspect/docs/PRODUCT_INTEGRATION_EXTRACTION_PLAN_2026-04-11.md`](/Users/kyungjae.ha/Documents/moloco-inspect/docs/PRODUCT_INTEGRATION_EXTRACTION_PLAN_2026-04-11.md)
