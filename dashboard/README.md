# Dashboard Migration Notes

이 디렉토리는 `Moloco Inspect` proposal repo로 가져온 1차 dashboard 이관본입니다.

## 현재 상태

- React 문서 사이트와 운영 대시보드가 이 repo 안으로 복사되었습니다.
- `pnpm build`가 통과합니다.
- 다만 아직 완전히 독립적인 상태는 아니고, 아래 원본 workspace를 참조합니다.

기본 source workspace root:

- `/Users/kyungjae.ha/Documents/Agent-Design-System`

## 무엇이 로컬로 들어왔는가

- dashboard 앱 소스
- analytics lazy-load 구조
- chart 구성
- local snapshot data
  - `data/site/foundations-colors.json`
  - `data/site/components-catalog.json`

## 무엇을 아직 원본 workspace에서 읽는가

- `design-system/src/*.json`
- `msm-portal/js/msm-portal-web/src/*`

즉 현재는 “proposal repo 안의 dashboard shell + source workspace reference” 구조입니다.

## 왜 이렇게 했는가

한 번에 완전 독립화하면 리스크가 큽니다. 그래서 1차는:

1. dashboard를 proposal repo 안으로 먼저 가져오고
2. source workspace alias로 실행 가능하게 만들고
3. 이후 design-system / runtime preview 의존성을 순차적으로 내부화하는 방식으로 진행합니다.

## 빌드

```bash
cd /Users/kyungjae.ha/Documents/moloco-inspect/dashboard
pnpm install
pnpm build
```

## source workspace 경로

`vite.config.ts`는 `SOURCE_WORKSPACE_ROOT` 환경변수를 읽고, 없으면 기본값으로 아래를 사용합니다.

- `/Users/kyungjae.ha/Documents/Agent-Design-System`

필요하면 실행 시 다른 경로로 바꿀 수 있습니다.

## 다음 단계

1. dashboard를 `design-system` JSON에 덜 의존하도록 정리
2. runtime preview 의존성을 분리
3. analytics API contract 문서화
4. 완전 독립 실행 가능 상태로 이동
