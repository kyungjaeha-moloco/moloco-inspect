# Product Adapter Contract

## 목적

`moloco-inspect`는 generic agent workspace로 유지하고, 실제 제품 앱과의 결합은 "product adapter" 계약을 통해 처리합니다.

이 문서는 `Moloco Inspect`가 MSM Portal 같은 실제 제품과 붙을 때, 어느 정보와 어느 실행 경로를 product adapter가 제공해야 하는지 정의합니다.

## 원칙

1. orchestrator, dashboard, extension은 product app 내부 구조를 최대한 직접 알지 않는다
2. product-specific route, auth bootstrap, preview readiness는 adapter가 책임진다
3. adapter는 "코드를 많이 복사"하는 대신 "계약을 만족하는 구현"으로 붙는다
4. 같은 interface를 만족하면 다른 product에도 재사용 가능해야 한다

## 계약 수준

product adapter는 아래 4개 capability를 제공해야 합니다.

### 1. Preview Bootstrap

역할:
- preview 페이지를 로그인/워크플레이스/언어 상태까지 포함해서 target route로 진입시킵니다

필수 입력:
- `targetPath`
- `client`
- `language`
- `workplaceId`

필수 출력:
- browser에서 열 수 있는 `bootstrapUrl`

예시:

```ts
type MTPreviewBootstrapInput = {
  targetPath: string;
  client?: string | null;
  language?: string | null;
  workplaceId?: string | null;
};

type MTPreviewBootstrapOutput = {
  bootstrapUrl: string;
};
```

### 2. Preview Verification

역할:
- 현재 열린 preview가 진짜 target page인지, auth/workplace/loading 화면이 아닌지 검증합니다

필수 입력:
- `url`
- `client`
- `language`
- `routeProfileId?`

필수 출력:
- `matchedProfileId`
- `isReady`
- `failures`

예시:

```ts
type MTPreviewVerificationResult = {
  matchedProfileId: string | null;
  isReady: boolean;
  failures: string[];
};
```

### 3. Screenshot Capture

역할:
- preview bootstrap을 포함한 안정적인 screenshot 캡처를 수행합니다

필수 입력:
- `url`
- `outputPath`
- `client`
- `language`

필수 출력:
- `outputPath`
- `verifiedRoute`
- `verifiedLanguage`

### 4. Route Metadata

역할:
- workspace/product route와 preview verification profile을 연결합니다

필수 정보:
- route format
- workplace id extraction rule
- forbidden auth path
- required text / selector

## adapter가 제공해야 하는 최소 interface

```ts
export type MTProductAdapter = {
  id: string;
  buildPreviewContext(input: MTPreviewBootstrapInput): MTPreviewContext;
  buildPreviewBootstrapRoute(input: MTPreviewBootstrapInput): string;
  extractWorkplaceId(targetUrl: string): string | null;
  verifyRoute(input: MTPreviewVerifyRouteInput): Promise<MTPreviewVerificationResult>;
  verifyCopyVisible(input: MTPreviewVerifyCopyInput): Promise<MTPreviewVerificationResult>;
  captureScreenshot(input: {
    url: string;
    outputPath: string;
    client?: string | null;
    language?: string | null;
  }): Promise<{
    outputPath: string;
    verifiedRoute: string;
    verifiedLanguage?: string | null;
  }>;
};
```

## 현재 MSM Portal adapter가 책임지는 영역

현재 source workspace 기준으로 MSM Portal adapter 성격을 가진 구현은 아래에 흩어져 있습니다.

- preview bootstrap:
  - [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/app-builder/route/template/page/MCCodexPreviewBootstrapPage.tsx`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/app-builder/route/template/page/MCCodexPreviewBootstrapPage.tsx)
  - [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/app-builder/route/template/routeTemplate.tsx`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/app-builder/route/template/routeTemplate.tsx)
- auth/workplace runtime:
  - [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/auth/AuthProvider.tsx`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/auth/AuthProvider.tsx)
  - [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/auth/token-cache/storage.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/auth/token-cache/storage.ts)
- preview verification / screenshot:
  - [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/screenshot-util.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/screenshot-util.ts)
  - [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/preview-route-profile-util.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/preview-route-profile-util.ts)
  - [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/preview-route-util.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/preview-route-util.ts)
  - [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/preview-text-util.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/preview-text-util.ts)

## moloco-inspect가 직접 알지 않아야 하는 것

아래는 adapter 내부 구현으로 남기고, orchestrator/extension은 몰라도 됩니다.

- React route tree 상세 구조
- AuthProvider 내부 state machine
- mock interceptor 내부의 전체 endpoint 구현
- workplace selector UI 구현 방식
- localStorage/sessionStorage key를 심는 세부 순서

## orchestrator가 adapter에 기대하는 것

orchestrator는 product adapter에게 아래만 기대하면 됩니다.

1. target route를 preview용 bootstrap URL로 바꿀 수 있다
2. preview screenshot을 안정적으로 캡처할 수 있다
3. target route가 실제로 맞는지 검증할 수 있다
4. auth/workplace 화면에 머물렀는지 실패 사유를 알려줄 수 있다

## extension이 adapter에 기대하는 것

extension은 직접 adapter를 호출하지 않더라도, backend를 통해 아래 일관성을 기대합니다.

- `실제 preview 페이지 열기`가 auth/workplace를 자동으로 통과한 URL을 연다
- screenshot과 실제 preview open이 같은 bootstrap contract를 쓴다
- client / language / workplace context가 일치한다

## 다음 구현 포인트

1. `tooling/preview-kit`에 generic interface와 MSM adapter entrypoint 정의
2. orchestrator에서 `msm-portal` 경로 직접 참조 대신 adapter 호출 경로 도입
3. preview verification JSON과 adapter implementation을 연결

현재 상태:

- [`/Users/kyungjae.ha/Documents/moloco-inspect/tooling/preview-kit/src/factory.js`](/Users/kyungjae.ha/Documents/moloco-inspect/tooling/preview-kit/src/factory.js)
- [`/Users/kyungjae.ha/Documents/moloco-inspect/tooling/preview-kit/src/adapters/msm-portal.js`](/Users/kyungjae.ha/Documents/moloco-inspect/tooling/preview-kit/src/adapters/msm-portal.js)
- [`/Users/kyungjae.ha/Documents/moloco-inspect/orchestrator/server.js`](/Users/kyungjae.ha/Documents/moloco-inspect/orchestrator/server.js)

까지는 연결된 상태입니다.

## 한 줄 요약

`moloco-inspect`는 product app 구현을 직접 끌어안지 않고, preview/auth/verification을 제공하는 product adapter를 통해 제품과 연결됩니다.
