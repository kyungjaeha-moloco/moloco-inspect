---
id: BLOG-19
title: "Live Preview 인증 삽질기 — mock에서 실제 토큰까지의 여정"
url_placeholder: "{{BLOG_URL_19}}"
source_materials: [MAT-066, MAT-068, MAT-069, MAT-075]
---

# Live Preview 인증 삽질기 — mock에서 실제 토큰까지의 여정

## TL;DR

- AI가 코드를 수정한 결과를 Live Preview로 보여줘야 했는데, 계속 로그인 화면이 나왔다.
- `sed`로 `index.html`에 토큰을 주입했는데, 파일 경로가 틀렸다. Vite 프로젝트 구조를 오해했다.
- mock 토큰 → "Unknown User" → 실제 API 토큰 자동 발급 → AuthProvider 통째로 교체. 세 번의 접근 끝에 해결했다.

---

## 배경: PM이 프리뷰를 보려면 로그인을 해야 했다

Inspect의 파이프라인은 이렇게 생겼다. AI 에이전트가 Docker 샌드박스 안에서 코드를 수정한다. Vite 개발 서버가 샌드박스 안에서 뜬다. PM이 오케스트레이터를 통해 역프록시된 URL로 프리뷰를 본다.

이 흐름이 완성되면 PM은 "이 정도면 괜찮아"라고 판단하고 PR을 올리거나, "아니야, 다시 해줘"라고 거절할 수 있다.

문제는 프리뷰 URL에 접근하면 항상 Firebase 로그인 화면이 나온다는 것이었다. msm-portal은 Firebase Auth를 쓴다. 샌드박스 안의 Vite 서버는 실제 Firebase 인증을 요구한다. PM이 로그인을 매번 하게 만들 수는 없었다.

인증을 우회해야 했다.

---

## 시도 1: sed로 index.html에 토큰 주입

가장 단순한 접근이었다. Vite가 시작하기 전에, `index.html`의 `</head>` 태그 앞에 localStorage를 세팅하는 스크립트를 주입한다. 그러면 앱이 로드될 때 이미 인증 토큰이 있는 상태가 된다.

오케스트레이터에서 이런 명령을 만들었다.

```bash
cd /workspace/msm-portal/js/msm-portal-web && \
  sed -i 's|</head>|<script>...auth injection...</script>\n</head>|' index.html
```

실행했다. 프리뷰를 열었다. 여전히 로그인 화면이었다.

`docker exec`로 컨테이너에 들어가서 `index.html`을 확인했다. 파일이 수정되지 않았다. `sed`가 파일을 못 찾고 있었다.

이유가 뭔지 한참을 봤다. 그때 알아챘다. msm-portal은 멀티 앱 구조였다. `index.html`의 실제 경로는 `js/msm-portal-web/index.html`이 아니었다.

```
msm-portal/
  js/
    msm-portal-web/
      src/
        apps/
          tving/
            index.html    ← 여기
          other_client/
            index.html
```

클라이언트(tving, 다른 클라이언트 등)마다 별도의 `index.html`이 있었다. Vite의 `root` 설정이 `js/msm-portal-web`이 아니라 각 클라이언트 앱 폴더를 가리키고 있었다. 내가 수정하려 했던 경로에는 파일이 없었다.

올바른 경로를 계산해서 넣었다.

```javascript
const clientEnv = state.payload?.client || 'tving';
const indexHtmlPath = `src/apps/${clientEnv}/index.html`;
```

이번에는 파일이 수정됐다. 프리뷰를 열었다. 로그인 화면이 사라졌다. 대신 "Unknown User"가 화면에 떴다.

---

## 시도 2: mock 토큰 → Unknown User

진전이 있었다. 앱은 로드됐다. 그런데 사용자 정보가 없었다.

주입한 토큰이 mock이었다.

```javascript
const actualIdToken = idToken || 'mock-preview-token';
const actualWpToken = wpToken || `mock-workplace-token:${wpId}`;
```

MSM 앱의 인증 흐름을 확인해봤다. 앱이 시작할 때 localStorage에서 토큰을 읽고, 그 토큰으로 백엔드 API를 호출해서 사용자 정보를 가져온다. mock 토큰으로 실제 API를 호출하면 당연히 실패한다. 사용자 정보를 못 가져오니 "Unknown User"가 뜨는 것이었다.

두 가지 선택지가 있었다. mock 토큰을 써서 API 호출을 가로채는 방식을 만들거나, 실제 API 토큰을 발급받아서 주입하거나.

API 가로채기는 복잡했다. 서비스 워커나 프록시 레이어가 필요했다. 샌드박스 안에서 그걸 구성하는 건 또 다른 삽질이 될 것 같았다.

실제 토큰을 발급받는 쪽으로 갔다.

---

## 시도 3: 실제 API 토큰 자동 발급

오케스트레이터가 MSM API 서버에서 실제 토큰을 가져오는 로직을 추가했다.

```javascript
// MSM API에서 실제 토큰 발급
const idResp = await fetch(`${msmApiUrl}/auth/id-tokens`, { ... });
idToken = idData.token || '';

const wpResp = await fetch(`${msmApiUrl}/auth/tokens`, { ... });
wpToken = wpData.token || '';

// 상태에 저장
updateRequest(id, { authTokens: { idToken, wpToken, wpId } });
```

그리고 이 토큰을 두 곳에 주입했다. `index.html`에 localStorage 초기화 스크립트로 넣고, 역프록시 레이어에서도 HTML 응답에 동적으로 주입했다.

프리뷰를 열었다. 이번에는 실제 사용자 이름이 떴다. 로그인 화면도 없었다.

그런데 새로운 문제가 생겼다. 스크린샷 캡처가 여전히 로그인 화면을 찍고 있었다.

---

## 스크린샷이 로그인 화면을 찍은 이유

Playwright로 스크린샷을 찍는 로직이 있었다. 컨테이너 안에서 headless Chromium이 `localhost:5173`에 접근하고 스크린샷을 찍는다.

코드를 보니 순서가 틀렸다.

```javascript
// 잘못된 순서
await page.goto('http://localhost:5173/');  // 1. 페이지 로드
await page.evaluate(/* localStorage 세팅 */);  // 2. 토큰 주입
await page.goto('http://localhost:5173' + pagePath);  // 3. 실제 페이지
```

페이지를 먼저 로드하고 나서 토큰을 주입하면 의미가 없다. 앱이 이미 "인증 없음" 상태로 초기화된 뒤에 토큰을 집어넣는 것이다.

순서를 바꿨다.

```javascript
// 올바른 순서
await page.goto('http://localhost:5173/');  // 1. blank 페이지로 이동 (도메인 설정용)
await page.evaluate(/* localStorage 세팅 */);  // 2. 먼저 토큰 주입
await page.goto('http://localhost:5173' + pagePath);  // 3. 실제 페이지 (토큰 이미 있음)
```

blank 페이지에서 localStorage를 세팅하면 같은 origin의 다음 페이지 로드에서 그 값이 살아있다. 그리고 앱이 초기화될 때 이미 토큰이 있으니 로그인 화면을 건너뛴다.

---

## 마지막: AuthProvider 통째로 교체

실제 환경에서 Firebase Auth는 토큰만 있다고 되는 게 아니었다. 앱이 Firebase SDK를 초기화하고, onAuthStateChanged 콜백을 기다리는 과정이 있었다. localStorage에 토큰이 있어도 Firebase가 자체 검증을 하면서 지연이 생겼다.

가장 과감한 접근을 택했다. AuthProvider 컴포넌트 자체를 교체한다.

```javascript
// 오케스트레이터가 샌드박스 안에 이 파일을 덮어씌운다
const authBypassProvider = `
import { FC, PropsWithChildren, useCallback } from 'react';

// ... auth context setup ...

const AuthProvider: FC<PropsWithChildren> = ({ children }) => {
  // Firebase 인증 없이 토큰을 직접 주입
  const user = {
    idToken: '${actualIdToken}',
    wpToken: '${actualWpToken}',
    workplaceId: '${wpId}',
  };
  
  return (
    <AuthContext.Provider value={user}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
`;
```

샌드박스 안의 `AuthProvider.tsx`를 이 파일로 덮어쓴다. Firebase SDK 자체를 건드리지 않고, Auth 레이어만 바이패스한다. Vite가 이 파일을 다시 컴파일하고, 프리뷰 서버에 반영된다.

이게 가장 안정적인 해결책이었다. 토큰 주입 타이밍 문제도 없고, Firebase SDK 초기화 지연도 없다.

---

## 핵심 인사이트

인증 우회는 토큰 문제가 아니었다. 타이밍 문제였다.

localStorage에 토큰을 넣는 것과, 앱이 그 토큰을 읽는 것 사이에 순서가 있다. 이 순서를 틀리면 아무리 올바른 토큰을 넣어도 앱은 로그인 화면을 보여준다.

`expiresAt` vs `expireTime` 같은 필드명 차이도 조심해야 한다. MSM 앱은 `expireTime`을 쓰는데, 내가 처음에 `expiresAt`을 넣었다. 앱이 토큰을 찾지 못하고 만료됐다고 판단해서 로그아웃 처리했다. 필드명 하나의 차이가 수십 분의 디버깅을 만들었다.

---

## 재현 가능한 패턴

샌드박스나 테스트 환경에서 인증을 우회할 때 이 순서로 접근한다.

첫째, 실제 파일 경로를 먼저 확인한다. 멀티 앱 구조나 Vite root 설정이 생각과 다를 수 있다. `docker exec`로 들어가서 직접 확인하는 게 가장 빠르다.

둘째, 토큰 주입은 페이지 로드보다 먼저 해야 한다. 페이지가 뜬 다음 토큰을 넣으면 앱이 이미 "미인증" 상태로 초기화됐다.

셋째, mock 토큰이 "Unknown User"를 만들면 실제 토큰을 발급받는 방향을 먼저 본다. API 가로채기는 복잡성이 크다. 실제 토큰은 복잡하지 않으면서 확실하다.

넷째, 문제가 계속되면 Auth 레이어 자체를 바이패스하는 것을 고려한다. 파일 하나를 교체하는 게 SDK 동작을 이해하려는 것보다 빠를 때가 있다.
