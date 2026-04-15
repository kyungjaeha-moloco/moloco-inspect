---
id: BLOG-20
title: "macOS 리소스 포크 4,520개가 파이프라인을 멈춘 날"
url_placeholder: "{{BLOG_URL_20}}"
source_materials: [MAT-061, MAT-067, MAT-073, MAT-077]
---

# macOS 리소스 포크 4,520개가 파이프라인을 멈춘 날

## TL;DR

- Docker 컨테이너에 소스를 복사한 뒤 `git status`가 수천 개의 untracked 파일을 뱉었다. 범인은 macOS가 자동으로 만드는 `._` 파일들이었다.
- diff 수집 단계가 무한 대기에 걸렸다. `._` 파일들이 git 추적 대상이 되면서 diff 명령이 폭발했다.
- `pnpm install`이 30초 걸리던 게 1초로 줄었다. Docker 레이어 캐싱이 핵심이었다.

---

## 배경: 파이프라인이 중간에 멈췄다

Inspect의 파이프라인은 여러 단계를 거친다. 컨테이너 생성, 소스 동기화, 에이전트 실행, diff 수집, typecheck, 스크린샷 캡처.

어느 날 에이전트 실행까지는 잘 됐는데, diff 수집 단계에서 응답이 오지 않았다. 타임아웃도 없이 그냥 대기 상태. 오케스트레이터 로그에는 "Agent done"이 찍혀 있는데, 다음 로그가 나오지 않았다.

처음에는 에이전트 출력 파싱 문제라고 생각했다. diff 명령이 예상치 못한 출력을 뱉어서 파싱이 블록된 건 아닐까.

`docker exec`로 컨테이너 안에 들어가서 직접 확인했다.

```bash
docker exec -it inspect-3847xxxx bash
cd /workspace/msm-portal
git status
```

화면이 멈췄다. 출력이 끝없이 스크롤됐다.

```
Untracked files:
  (use "git add <file>..." to include in what will be committed)
        ._App.tsx
        ._Button.tsx
        ._index.ts
        ._routes.tsx
        ...
```

`._ `으로 시작하는 파일이 수천 개였다.

---

## 범인: macOS 리소스 포크

macOS는 파일을 복사할 때 리소스 포크(resource fork)라는 것을 만든다. Finder나 macOS 시스템 서비스가 파일의 메타데이터(아이콘 정보, 확장 속성 등)를 저장하는 방식이다. `._filename` 형태의 숨김 파일로 저장된다.

개발 환경에서는 `.gitignore`가 이 파일들을 걸러주기 때문에 보통 문제가 되지 않는다. 하지만 `docker cp`로 파일을 복사하면 상황이 달라진다.

소스 동기화 단계에서 이런 명령을 쓰고 있었다.

```bash
docker cp /path/to/msm-portal/. containerId:/workspace/msm-portal/
```

`docker cp`는 `.gitignore`를 모른다. `._ `파일을 포함해서 모든 파일을 그대로 복사한다. msm-portal 소스에는 수천 개의 TypeScript, TSX, JSON 파일이 있고, 각각에 대응하는 `._` 파일이 생긴다.

컨테이너 안의 git은 이 파일들을 모른다. `.gitignore`에도 없다. 그래서 전부 untracked로 잡힌다. `git status`가 4,520개의 파일을 나열하려고 하고, `git diff`는 그것들을 모두 확인하려다 블록된다.

파이프라인이 멈춘 이유가 여기 있었다.

---

## 해결: docker cp 후 즉시 삭제

해결책은 단순했다. 소스를 복사한 직후, git 베이스라인을 만들기 전에 `._` 파일들을 전부 지운다.

```javascript
await execInContainer({
  containerId: sandbox.containerId,
  command: 'find /workspace -name "._*" -delete 2>/dev/null || true',
  timeout: 10000
}).catch(() => {});
```

`find`로 workspace 전체에서 `._`로 시작하는 파일을 찾아 삭제한다. 이후 `git add -A && git commit`으로 베이스라인을 만들면, 에이전트가 수정한 파일만 diff에 잡힌다.

실행 후 `git status`는 깔끔하게 돌아왔다.

더 나은 방법은 애초에 `docker cp` 대신 `tar`를 쓰는 것이었다.

```bash
cd "${sourceDir}" && tar cf - \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.omc' \
  --exclude='._*' \       # ← macOS 리소스 포크 제외
  . | docker exec -i "${containerId}" tar xf - -C "${containerDir}/"
```

`tar`는 `--exclude` 옵션으로 패턴을 지정할 수 있다. `._*`를 exclude에 넣으면 복사 단계에서 아예 포함되지 않는다. `docker cp` 후 삭제하는 것보다 더 깔끔하다.

---

## 덤: pnpm install이 30초 → 1초로

같은 맥락에서 다른 병목도 발견했다.

컨테이너가 새로 생성될 때마다 `pnpm install`이 실행됐다. msm-portal은 의존성이 많다. 빈 컨테이너에서 `pnpm install`을 실행하면 30초에서 90초가 걸렸다. 회사 프록시(Zscaler)를 통해 npm 레지스트리에 접근하는 시간까지 더해지면 더 길었다.

요청이 들어올 때마다 1분 이상을 패키지 설치에 쓰는 건 용납할 수 없었다.

Docker 이미지 빌드 시점에 `node_modules`를 미리 구워 넣는 방식을 고려했다. 하지만 이건 이미지 크기가 폭발한다. msm-portal의 `node_modules`는 수백 MB다. 컨테이너마다 그걸 pull하는 게 더 느릴 수 있다.

실제로 효과가 있었던 건 Docker 레이어 캐싱이었다.

`package.json`과 `pnpm-lock.yaml`은 코드 변경과 무관하게 자주 바뀌지 않는다. 이 파일들을 COPY하는 레이어와 `pnpm install`을 실행하는 레이어를 분리해서 Dockerfile에 배치하면, 패키지가 바뀌지 않는 한 캐시된 레이어가 재사용된다.

```dockerfile
# 패키지 파일 먼저 복사 → pnpm install → 캐시 레이어
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 소스 코드는 나중에 → 코드 변경해도 위 레이어는 캐시됨
COPY . .
```

이미지가 한 번 빌드된 이후에는 `pnpm install` 단계가 캐시에서 바로 나온다. 실제 컨테이너 시작 시간이 30초에서 1초 수준으로 줄었다.

---

## pagePath 정규화 삽질

이 과정에서 또 다른 버그가 드러났다. diff를 수집한 뒤 스크린샷을 찍을 때 pagePath를 넘기는데, 이 경로가 이상하게 처리됐다.

msm-portal의 실제 라우트는 `/v1/p/{workplaceId}/orders` 같은 형태다. 오케스트레이터가 이 경로를 받아서 스크린샷 타겟으로 넘길 때, prefix를 한 번 벗기고 다시 붙이는 로직이 있었는데 순서가 꼬였다.

```javascript
// 잘못된 처리
const pageLabel = pagePath
  .replace(/^\/v1\/p\/[^/]+\//, '')  // prefix 제거
  // → 'orders' (prefix가 없음)

// 나중에 다시 붙이려니 workplaceId를 모름
```

로그 메시지용으로 만든 "벗기기" 코드가 실제 경로 계산에도 영향을 줬다. 스크린샷 Playwright 스크립트가 `/orders` 대신 `orders`(슬래시 없음)로 navigate를 시도하다가 404가 났다.

수정은 간단했다. 로그 레이블용 변수와 실제 경로용 변수를 분리했다.

```javascript
const pageLabel = pagePath.replace(/^\/v1\/p\/[^/]+\//, '').replace(/\?.*$/, '') || 'page';
// → 로그에만 사용

const actualPagePath = pagePath; // 원본 그대로
// → Playwright navigate에 사용
```

같은 값을 두 목적으로 쓰다가 생긴 전형적인 버그였다.

---

## 핵심 인사이트

문제의 80%는 보이지 않는 파일에서 온다.

`._` 파일은 평소에 존재를 모른다. `.gitignore`가 숨겨주고, Finder에서도 기본적으로 숨겨진다. 그런데 `docker cp`라는 문맥이 바뀌는 순간, 이 파일들이 파이프라인 전체를 멈춘다.

새로운 실행 환경을 만들 때마다 "이 환경에서는 무엇이 다르게 동작하는가"를 먼저 확인해야 한다. macOS에서 `docker cp`를 쓴다면 리소스 포크를 반드시 고려한다. `tar`를 쓴다면 exclude 패턴을 점검한다.

눈에 보이지 않는 것이 문제일 때, 로그만 봐서는 원인을 못 찾는다. `docker exec`로 직접 들어가서 눈으로 확인하는 것이 가장 빠른 방법이었다.

---

## 재현 가능한 패턴

macOS에서 Docker 컨테이너로 소스를 옮길 때 이 패턴을 쓴다.

`docker cp` 대신 `tar` 파이프를 쓰고 `--exclude='._*'`를 반드시 포함한다. 이미 `docker cp`를 쓰고 있다면 복사 직후 `find /workspace -name "._*" -delete`를 실행한다.

`pnpm install`이 느리다면 Dockerfile에서 `package.json` COPY → install → source COPY 순서로 레이어를 분리한다. 패키지가 바뀌지 않으면 install이 캐시에서 나온다.

파이프라인이 특정 단계에서 무한 대기하면 그 단계를 직접 컨테이너 안에서 실행해본다. 자동화 맥락에서 숨겨진 것이 수동 실행에서는 보인다.
