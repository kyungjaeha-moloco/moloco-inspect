# Product Integration Extraction Plan

## 목적

`moloco-inspect` proposal repo가 현재 source workspace의 [`msm-portal`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal) 에 크게 의존하고 있는 부분을, 한 번에 통째로 복사하지 않고 실행 가능한 단위로 점진적으로 떼어내기 위한 계획입니다.

이 문서의 핵심은:

- 무엇을 먼저 추출할지
- 어떤 파일 묶음이 함께 움직여야 하는지
- 무엇이 blocker인지
- 어디까지가 proposal repo의 책임이고 어디부터가 product repo의 책임인지

를 분명하게 만드는 것입니다.

## 현재 경계

이미 `moloco-inspect` 안으로 들어온 자산:

- [`/Users/kyungjae.ha/Documents/moloco-inspect/dashboard`](/Users/kyungjae.ha/Documents/moloco-inspect/dashboard)
- [`/Users/kyungjae.ha/Documents/moloco-inspect/orchestrator`](/Users/kyungjae.ha/Documents/moloco-inspect/orchestrator)
- [`/Users/kyungjae.ha/Documents/moloco-inspect/chrome-extension`](/Users/kyungjae.ha/Documents/moloco-inspect/chrome-extension)
- [`/Users/kyungjae.ha/Documents/moloco-inspect/design-system`](/Users/kyungjae.ha/Documents/moloco-inspect/design-system)

아직 source workspace에 남아 있는 핵심 product integration:

- [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/app-builder/route/template/page/MCCodexPreviewBootstrapPage.tsx`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/app-builder/route/template/page/MCCodexPreviewBootstrapPage.tsx)
- [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/app-builder/route/template/routeTemplate.tsx`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/app-builder/route/template/routeTemplate.tsx)
- [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/auth/AuthProvider.tsx`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/auth/AuthProvider.tsx)
- [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/auth/AuthContext.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/auth/AuthContext.ts)
- [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/auth/token-cache/storage.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/auth/token-cache/storage.ts)
- [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/api/msm/axios/mock-interceptor.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/api/msm/axios/mock-interceptor.ts)
- [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/api/msm/api/token/index.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/api/msm/api/token/index.ts)
- [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/auth/utils.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/auth/utils.ts)
- [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/screenshot-util.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/screenshot-util.ts)
- [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/preview-route-profile-util.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/preview-route-profile-util.ts)
- [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/preview-route-util.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/preview-route-util.ts)
- [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/preview-text-util.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/preview-text-util.ts)

## 큰 원칙

1. `msm-portal` 전체를 proposal repo로 가져오지 않는다
2. preview / auth bootstrap / route verification / mock auth-workplace flow를 각각 독립 가능한 묶음으로 본다
3. orchestrator와 extension은 product repo를 직접 아는 대신, 가능한 한 adapter contract를 통해 연결한다
4. 추출 단위는 "동작하는 최소 세트" 기준으로 자른다

## 추출 단위

### Cluster A — Preview Bootstrap Contract

목적:
- preview가 로그인/워크플레이스 단계에서 흔들리지 않도록, 앱 쪽에 공식 bootstrap 진입점을 유지하고 계약을 명확히 하는 것

핵심 파일:
- [`MCCodexPreviewBootstrapPage.tsx`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/app-builder/route/template/page/MCCodexPreviewBootstrapPage.tsx)
- [`routeTemplate.tsx`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/app-builder/route/template/routeTemplate.tsx)
- [`AuthProvider.tsx`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/auth/AuthProvider.tsx)
- [`AuthContext.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/auth/AuthContext.ts)
- [`token-cache/storage.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/auth/token-cache/storage.ts)

권장 방향:
- 이 코드를 proposal repo로 옮기기보다, product adapter contract로 명세화
- `moloco-inspect`는 bootstrap URL shape와 required query만 안다
- 실제 bootstrap page 구현은 product repo 소유로 남긴다

이유:
- auth provider와 route template은 product app의 core runtime에 강하게 붙어 있다
- 이 묶음을 proposal repo로 가져오면 사실상 mini app fork가 된다

### Cluster B — Preview Verification Toolkit

목적:
- preview/screenshot이 진짜 target route에 도달했는지 기계적으로 확인하는 유틸을 분리하는 것

핵심 파일:
- [`screenshot-util.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/screenshot-util.ts)
- [`preview-route-profile-util.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/preview-route-profile-util.ts)
- [`preview-route-util.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/preview-route-util.ts)
- [`preview-text-util.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/preview-text-util.ts)
- [`/Users/kyungjae.ha/Documents/moloco-inspect/design-system/src/preview-verification.json`](/Users/kyungjae.ha/Documents/moloco-inspect/design-system/src/preview-verification.json)

권장 방향:
- 이 묶음은 proposal repo로 가장 먼저 추출할 가치가 큼
- 단, `preview-verification.json` 은 이미 `moloco-inspect` 안에 있으므로
  - TS 유틸만 `tooling/preview-kit` 같은 새 디렉토리로 옮기고
  - product app에 의존하는 부분을 adapter로 분리하는 것이 좋다

성공 기준:
- orchestrator가 `msm-portal/js/msm-portal-web/e2e/*`를 직접 몰라도 preview 검증을 호출할 수 있다

### Cluster C — Mock Auth / Workplace Fixture Layer

목적:
- preview에서 필요한 최소 인증/워크플레이스 mock을 제품 코드에서 분리 가능한지 확인하는 것

핵심 파일:
- [`mock-interceptor.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/api/msm/axios/mock-interceptor.ts)
- [`token/index.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/api/msm/api/token/index.ts)
- [`auth/utils.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/auth/utils.ts)

권장 방향:
- 이 레이어는 당장 추출하지 않는다
- 대신 "preview에 필요한 mock contract"만 문서화한다
- 예:
  - mock id token shape
  - mock workplace token shape
  - persisted workplace selection key
  - required auth endpoints

이유:
- mock-interceptor는 product API surface 전체를 많이 품고 있어 proposal repo로 옮기면 덩치가 너무 커진다

### Cluster D — Product Adapter Contract

목적:
- `moloco-inspect`가 product app과 어떤 최소 계약으로 붙는지 명확히 만드는 것

필수 계약:
- preview bootstrap path
- target route URL format
- language query param
- workplace id extraction rule
- preview ready selectors / texts
- screenshot CLI contract

권장 산출물:
- `docs/PRODUCT_ADAPTER_CONTRACT.md`
- `docs/PREVIEW_BOOTSTRAP_CONTRACT.md`
- 이후 필요 시 `packages/product-adapter-msm/` 같은 형태로 분리

## 권장 실행 순서

### Step 1

문서 계약 정리

- preview bootstrap contract
- screenshot/preview verification contract
- mock auth/workplace contract

왜 먼저 하냐면:
- 실제 코드 추출 전에 경계가 먼저 정리돼야 proposal repo가 product fork가 되지 않는다

### Step 2

Preview Verification Toolkit 추출

이때 가져올 것:
- `preview-route-profile-util.ts`
- `preview-route-util.ts`
- `preview-text-util.ts`
- `screenshot-util.ts`의 product-specific 부분을 adapter로 분리한 버전

### Step 3

Orchestrator adapter 연결

해야 할 일:
- [`/Users/kyungjae.ha/Documents/moloco-inspect/orchestrator/server.js`](/Users/kyungjae.ha/Documents/moloco-inspect/orchestrator/server.js) 가 product path를 하드코딩하는 대신
- product adapter에서:
  - preview capture
  - route verification
  - screenshot capture
  를 호출하도록 정리

### Step 4

Product-specific mock/auth bootstrap 계약 고정

이 단계까지 오면:
- `moloco-inspect`는 generic orchestrator/extension/dashboard/design-system
- product repo는 preview bootstrap + auth/workplace + route config

역할 분리가 생긴다

## 무엇을 지금 당장 하지 않을 것인가

- `msm-portal/js/msm-portal-web/src` 전체 복사
- AuthProvider/routeTemplate를 proposal repo 안에서 재구현
- mock-interceptor 전체를 통째로 복사
- 팀 repo와 무관한 별도 app fork 만들기

## 현재 가장 큰 blocker

1. preview bootstrap이 product auth/runtime에 깊게 붙어 있음
2. mock workplace/auth 흐름이 product mock API surface와 강결합
3. screenshot util이 현재는 product app 경로를 직접 안다

이 blocker 때문에, 다음 단계는 "추출"보다 먼저 "계약화"가 더 중요합니다.

## 다음 액션 제안

1. `PRODUCT_ADAPTER_CONTRACT.md` 작성
2. `PREVIEW_BOOTSTRAP_CONTRACT.md` 작성
3. `tooling/preview-kit` 초안 디렉토리 생성
4. orchestrator에서 preview util 호출 경로를 adapter-friendly 하게 리팩터링

현재 상태:

- [`/Users/kyungjae.ha/Documents/moloco-inspect/docs/PRODUCT_ADAPTER_CONTRACT.md`](/Users/kyungjae.ha/Documents/moloco-inspect/docs/PRODUCT_ADAPTER_CONTRACT.md)
- [`/Users/kyungjae.ha/Documents/moloco-inspect/docs/PREVIEW_BOOTSTRAP_CONTRACT.md`](/Users/kyungjae.ha/Documents/moloco-inspect/docs/PREVIEW_BOOTSTRAP_CONTRACT.md)
- [`/Users/kyungjae.ha/Documents/moloco-inspect/tooling/preview-kit/README.md`](/Users/kyungjae.ha/Documents/moloco-inspect/tooling/preview-kit/README.md)

위 3개까지는 준비된 상태입니다.

## 한 줄 결론

`moloco-inspect`가 다음 단계로 가려면, `msm-portal`을 많이 복사하는 것이 아니라 preview/auth/mock 흐름을 product adapter 계약으로 바꾸는 것이 먼저입니다.
