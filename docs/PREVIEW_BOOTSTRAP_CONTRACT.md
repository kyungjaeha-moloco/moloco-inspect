# Preview Bootstrap Contract

## 목적

preview는 "페이지를 열었다"가 아니라, 아래 조건을 만족해야 합니다.

- target route에 도달했다
- 언어가 맞다
- workplace context가 맞다
- 로그인/워크플레이스 선택/loading shell이 아니다

이 문서는 그 진입 contract를 고정합니다.

## bootstrap path

현재 MSM Portal 기준 canonical path:

- `"/__codex/preview-bootstrap"`

이 path는 product app 안에 존재해야 하며, preview 전용 진입점 역할을 합니다.

## query contract

필수 query:

- `target`
  - preview가 최종적으로 도달해야 할 내부 route

선택 query:

- `workplaceId`
- `lng`
- `client`

예시:

```txt
/__codex/preview-bootstrap?target=%2Fv1%2Fp%2FTVING_OMS%2Foms%2Forder%3Ftype%3Davailable%26lng%3Dko&workplaceId=TVING_OMS&lng=ko&client=tving
```

## bootstrap page의 책임

bootstrap page는 아래를 책임집니다.

1. auth cache seed
2. workplace cache seed
3. language seed
4. user sign-in cache bootstrap
5. workplace enter
6. target route redirect
7. 실패 시 auth route fallback

## bootstrap page가 사용해야 하는 최소 캐시 키

현재 MSM Portal 기준:

- `MSM_AUTH`
- `MSM_AUTH_WORKPLACE`
- `i18nextLng`

이 키 이름은 product-specific 구현에 속하지만, bootstrap contract에서는 "preview bootstrap이 이 정도 상태를 심어야 한다"는 점만 보장합니다.

## 성공 조건

bootstrap 이후 preview는 아래를 만족해야 합니다.

1. URL이 bootstrap path가 아니다
2. `/sign-in`이 아니다
3. `/workplace` 계열 path가 아니다
4. target route profile에 맞는 selector/text가 보인다

## 실패 조건

아래 경우는 preview ready로 간주하지 않습니다.

- sign-in 화면에 머무름
- workplace selector/loading에 머무름
- expected language 불일치
- target route profile mismatch
- required text/selector 없음

## screenshot과 open-preview의 일관성

아래 두 흐름은 반드시 같은 bootstrap contract를 써야 합니다.

1. preview screenshot capture
2. "실제 preview 페이지 열기"

이 둘이 다른 bootstrap 방식을 쓰면, 한쪽은 로그인되고 한쪽은 sign-in으로 떨어지는 문제가 다시 생깁니다.

## MSM Portal 현재 구현 위치

- bootstrap page:
  - [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/app-builder/route/template/page/MCCodexPreviewBootstrapPage.tsx`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/app-builder/route/template/page/MCCodexPreviewBootstrapPage.tsx)
- route binding:
  - [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/app-builder/route/template/routeTemplate.tsx`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/app-builder/route/template/routeTemplate.tsx)
- screenshot path:
  - [`/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/screenshot-util.ts`](/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/e2e/screenshot-util.ts)

## moloco-inspect에서 필요한 보장

`moloco-inspect`는 bootstrap 내부 구현을 몰라도 되지만, 아래는 보장받아야 합니다.

- given target route → bootstrap URL 생성 가능
- bootstrap 후 target route verification 가능
- bootstrap 실패 시 사람이 읽을 수 있는 이유를 받을 수 있음

## 다음 구현 포인트

1. orchestrator helper를 `buildPreviewBootstrapUrl()` 중심으로 정리
2. preview-kit에서 bootstrap success/failure를 표준화
3. route profile validation을 bootstrap success 판정과 연결

## 한 줄 요약

preview bootstrap은 단순 redirect가 아니라, preview를 reviewable state로 올리는 product-owned runtime contract입니다.
