---
id: BLOG-18
title: "5분마다 terminated — 타임아웃 원인을 찾기까지"
url_placeholder: "{{BLOG_URL_18}}"
source_materials: [MAT-063, MAT-064, MAT-065, MAT-098]
---

# 5분마다 terminated — 타임아웃 원인을 찾기까지

## TL;DR

- Docker 샌드박스 안에서 AI 에이전트가 정확히 5분마다 죽었다. 처음에는 네트워크 문제라고 생각했다.
- `config.toml`에 `timeout = false`를 넣었더니 `ProviderInitError`가 났다. TOML에서 숫자 필드에 boolean을 넣으면 파싱은 통과하지만 런타임에서 터진다.
- 해결은 `opencode.json`이었다. 같은 설정인데 포맷이 JSON이었고, 공식 문서에 나와 있었다.

---

## 증상: 정확히 5분

Inspect의 코어 파이프라인은 Docker 컨테이너 안에서 OpenCode 서버를 띄우고, 그 서버에 HTTP로 코딩 요청을 보내는 구조다. AI 에이전트가 msm-portal 코드를 수정하고, diff를 뱉고, 종료한다.

처음에는 짧은 요청만 테스트했다. "파일 맨 위에 주석 한 줄 추가해줘" 같은 것들. 잘 됐다.

그런데 실제 UI 변경 요청을 넣기 시작하면서 문제가 생겼다. 에이전트가 중간에 죽는다. 로그를 보면 이렇게 찍혀 있었다.

```
[2026-04-13T09:23:17Z] Running agent...
[2026-04-13T09:28:17Z] Agent terminated
```

타임스탬프를 계산해보면 정확히 5분. 300초. 너무 규칙적이었다. 랜덤한 오류가 아니라 어딘가에 하드코딩된 제한이 있다는 뜻이었다.

---

## 삽질 1: Docker 네트워크 제한을 의심했다

처음에는 Docker 네트워크 타임아웃을 의심했다. 회사 프록시(Zscaler)가 장기 연결을 끊어버리는 건 아닐까. 비슷한 사례를 검색했고, AWS NAT Gateway가 350초 유휴 연결을 끊는다는 글을 찾았다.

로컬 Docker Desktop 환경이라 NAT Gateway는 관계없었지만, 어쨌든 그 방향을 파보기로 했다. 오케스트레이터에서 컨테이너로 보내는 HTTP 요청에 keepalive 설정을 추가했다. 아무 효과가 없었다. 여전히 5분에 죽었다.

---

## 삽질 2: config.toml 수정

OpenCode 문서를 뒤졌다. 타임아웃 설정이 있었다. `config.toml` 파일에 설정하면 된다고 나와 있었다.

샌드박스 이미지에는 `/workspace/.opencode/config.toml`이 있었다. 여기에 타임아웃 비활성화 설정을 추가했다.

```toml
[provider.anthropic]
timeout = false
```

컨테이너를 다시 빌드하고 테스트했다. 에이전트가 시작되는 순간 바로 죽었다.

```
ProviderInitError: Invalid configuration
```

에러 메시지가 더 나빠졌다. 타임아웃 문제가 아니라 설정 파싱 문제가 생겼다.

원인을 찾아보니, TOML에서 `timeout` 필드는 숫자를 기대하는데 `false`라는 boolean을 넣으면 파싱은 통과하지만 OpenCode 내부에서 타입 검증을 할 때 터진다. `timeout = 0`이나 `timeout = 999999`를 넣으면 어떨까 싶어서 시도해봤다. 여전히 5분이었다. 설정이 반영이 안 되고 있었다.

---

## 삽질 3: 설정 파일을 찾고 있는 위치가 다르다

그때 깨달았다. OpenCode가 실제로 읽는 설정 파일이 `config.toml`이 아닐 수도 있다.

OpenCode GitHub 레포를 열고 소스를 훑었다. 설정 로딩 코드를 찾아보니 `opencode.json`을 먼저 찾고, 없으면 `config.toml`을 본다는 로직이 있었다. 그리고 공식 문서에는 `opencode.json` 형식의 예시가 버젓이 나와 있었다.

나는 계속 `config.toml`을 수정하고 있었는데, OpenCode는 `opencode.json`을 보고 있었던 것이다. `config.toml`은 읽히긴 했지만 타임아웃 설정이 지원되는 포맷이 아니었다.

---

## 해결: opencode.json

`sandbox/opencode.json`을 새로 만들었다.

```json
{
  "provider": {
    "opencode": {
      "options": {
        "timeout": 1200000,
        "chunkTimeout": 120000
      }
    },
    "openai": {
      "options": {
        "timeout": 1200000,
        "chunkTimeout": 120000
      }
    },
    "anthropic": {
      "options": {
        "timeout": 1200000,
        "chunkTimeout": 120000
      }
    }
  }
}
```

밀리초 단위다. `1200000`은 20분이다. `chunkTimeout: 120000`은 스트리밍 응답에서 청크 사이의 최대 대기 시간.

컨테이너를 다시 빌드하고 테스트했다. 에이전트가 5분을 넘겼다. 10분도 넘겼다. 실제 UI 변경 요청이 완료됐다.

그리고 `config.toml`은 내용을 비웠다. 주석만 남겼다.

```toml
# OpenCode project configuration
# Keep minimal to avoid ProviderInitError
```

---

## 왜 이렇게 됐는가

OpenCode는 TOML과 JSON 두 가지 설정 파일 포맷을 지원하는데, 지원하는 기능 범위가 다르다. 타임아웃 같은 provider-level 옵션은 JSON에서만 지원됐다. TOML은 기본 설정용이었다.

이게 문서 어딘가에 명시됐을 것이다. 나는 처음에 문서를 깊게 읽지 않고 TOML 파일부터 손댔다. 개발자의 흔한 실수다. "이전에 쓰던 방식으로 일단 해보자."

더 뼈아픈 건, 에러 메시지가 도움이 안 됐다는 것이다. `ProviderInitError: Invalid configuration`은 무엇이 잘못됐는지 알려주지 않는다. 타입 미스매치인지, 파일을 못 찾는 건지, 포맷이 틀린 건지. 그래서 원인을 찾는 시간이 길어졌다.

---

## 핵심 인사이트

설정 파일 포맷이 이렇게 중요할 줄 몰랐다.

기능적으로 같아 보이는 두 파일(`config.toml` vs `opencode.json`)이 완전히 다른 기능 범위를 가진다. 이건 라이브러리를 쓰기 전에 공식 문서에서 "어떤 포맷이 어떤 기능을 지원하는가"를 먼저 확인해야 한다는 교훈이다.

타임아웃이 정확히 5분이었다는 것도 단서였다. 랜덤하게 죽으면 인프라 불안정이다. 규칙적으로 죽으면 설정 문제다. 이 패턴을 더 빨리 알아챘다면 2시간을 아꼈을 것이다.

---

## 재현 가능한 패턴

비슷한 문제를 만났을 때 이렇게 접근한다.

첫째, 타임아웃이 규칙적인지 확인한다. 정확히 같은 시간에 죽으면 하드코딩된 제한이다. 랜덤하면 다른 원인을 찾는다.

둘째, 설정 파일을 찾기 전에 공식 문서에서 "지원하는 설정 포맷"을 먼저 확인한다. 여러 포맷이 있으면 각각의 기능 범위가 다를 수 있다.

셋째, 설정을 변경할 때마다 실제로 적용됐는지 확인하는 방법을 먼저 찾는다. 로그에서 "loaded config from X"라는 메시지를 찾거나, 설정 값을 덤프하는 엔드포인트를 확인하거나. 설정이 반영 안 된 채 삽질하는 건 가장 비효율적인 디버깅이다.
