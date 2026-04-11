# Orchestrator Migration Notes

이 디렉토리는 `Moloco Inspect` proposal repo로 가져온 1차 orchestrator 이관본입니다.

## 현재 상태

- server 코드와 smoke script는 이 repo 안에 들어왔습니다.
- analytics / attachments / screenshots 디렉토리는 비어 있는 상태로 시작합니다.
- 실제 제품 repo는 아직 원본 workspace를 참조합니다.
- design system은 기본적으로 이 repo 안의 `../design-system`을 우선 사용합니다.

기본 source workspace root:

- `/Users/kyungjae.ha/Documents/Agent-Design-System`

## 현재 구조

- `server.js`
- `scripts/smoke-test.mjs`
- `analytics/`
- `attachments/`
- `screenshots/`

## 중요한 동작

`server.js`는 아래 환경 변수를 읽습니다.

- `SOURCE_WORKSPACE_ROOT`
  - 기본값: `/Users/kyungjae.ha/Documents/Agent-Design-System`

이 값 기준으로:

- `msm-portal`

을 찾습니다.

추가로 아래 환경 변수도 사용할 수 있습니다.

- `DESIGN_SYSTEM_ROOT`
  - 기본값: `/Users/kyungjae.ha/Documents/moloco-inspect/design-system`

즉 현재는 proposal repo 안에 orchestrator 코드와 design system이 있고, 실제 제품 실행 대상만 원본 workspace를 참조하는 상태입니다.

## 실행

```bash
cd /Users/kyungjae.ha/Documents/moloco-inspect/orchestrator
pnpm install
pnpm start
```

필요하면 source workspace를 명시적으로 바꿔서 실행할 수 있습니다.

```bash
SOURCE_WORKSPACE_ROOT=/Users/kyungjae.ha/Documents/Agent-Design-System pnpm start

# 필요하면 design-system 경로도 명시적으로 바꿀 수 있습니다.
DESIGN_SYSTEM_ROOT=/Users/kyungjae.ha/Documents/moloco-inspect/design-system pnpm start
```

## 다음 단계

1. analytics API를 proposal repo dashboard와 직접 연결
2. smoke test를 proposal repo 기준으로 다시 점검
3. 차후 msm-portal 의존성도 순차적으로 내부화
