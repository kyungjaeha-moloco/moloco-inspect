# Handoff — multi-tenant v1 (baseTheme + CLI 자동화)

**Date:** 2026-04-30
**Author:** kyungjae.ha (with Claude)
**Plan:** `docs/superpowers/plans/2026-04-30-multi-tenant-v1.md`
**Repo:** `Agent-Design-System/msm-portal/` — branch `feature/multi-tenant-v1`

---

## TL;DR

> 신규 클라이언트 온보딩 시간 ~1-3 일 → ~반나절. yaml 한 파일 + `pnpm client-app generate` 한 번 → 빌드 + 배포 가능. 시각 회귀 0 (모든 클라 empty override 로 시작).

---

## 슬라이스 진행

`docs/superpowers/research/2026-04-30-multi-tenant-onboarding.md` 의 v1 권장 → `docs/superpowers/plans/2026-04-30-multi-tenant-v1.md` plan → subagent-driven 으로 4 task 실행. 별도 repo (`Agent-Design-System/msm-portal/`) branch `feature/multi-tenant-v1`.

## Commits (msm-portal repo)

```
6d5016e7 test(cli): multi-tenant v1 dry-run — onboard-trial 검증 완료
2a42c203 feat(cli): CLI 자동화 확장 — multi-tenant v1 step 2
a86d29d5 feat(theme): baseTheme + mergeTheme — multi-tenant v1 step 1
```

3 commit on top of `c336bed9`. moloco-inspect repo 는 별도 (이 handoff 만 추가).

## What shipped

### A. baseTheme + mergeTheme (Task 1)

**파일** (msm-portal repo):
- `js/msm-portal-web/src/common/config/types.ts` — `MTBaseTheme` / `MTCustomTheme` 타입
- `js/msm-portal-web/src/common/config/baseTheme.ts` — empty baseline
- `js/msm-portal-web/src/common/config/mergeTheme.ts` — deep-merge helper
- 4 client 마다 `src/apps/{client}/config/theme.ts` 추가, customTheme 빈 override
- 4 client 의 `main.tsx` 가 `mergeTheme(baseTheme, customTheme)` 호출

**효과**: 새 클라이언트는 `config/theme.ts` 한 파일만 채우면 브랜딩 분기 가능. 시각 회귀 0 (모든 클라가 빈 override 라 기존과 동일).

### B. CLI 자동화 확장 (Task 2)

**파일** (msm-portal repo `script/client-app/`):
- `config/types.ts` — yaml schema 확장: `brandColor?`, `firebaseSiteSuffix?`, `defaultPort?`, `automation` 블록
- `patch/vite-alias.ts` — `vite.config.ts` 의 alias + `PORT_DEFAULT_MAP` 자동 패치 (idempotent, ALIAS_MARKER 기반)
- `patch/package-scripts.ts` — `package.json` 의 `start:CLIENT:test` / `build:CLIENT:test` / `manual-deploy:CLIENT:test` 추가 (idempotent)
- `patch/firebaserc.ts` — `.firebaserc` 의 hosting target (test/staging/prod 3 environment) 추가 (idempotent)
- `generate-client.ts` — 위 3 patcher 통합. yaml `automation` 플래그로 제어
- `config/onboard-trial.yaml` — dry-run 샘플
- `config/template.yaml` — 신규 필드 + automation 블록 가이드
- `README.md` — v1 자동화 섹션 + 신규 클라 5 줄 가이드

**효과**: 신규 클라이언트 추가 시 4 파일 (vite.config.ts / package.json / .firebaserc / tsconfig.app.json) 수동 편집 → CLI 자동.

### C. dry-run 검증 (Task 3)

`onboard-trial.yaml` 로 가상 신규 클라이언트 end-to-end:
- `pnpm client-app generate --config onboard-trial.yaml` → 성공
- 4 patcher 자동 적용 + idempotent 동작 확인
- `tsc --noEmit` 통과
- `pnpm build:onboard-trial:test` → 성공 (dist 생성)
- 기존 4 클라 빌드 회귀 없음
- Rollback 완료 — `src/apps/onboard-trial/` 및 4 patch 원복. `script/client-app/history.md` 의 audit log 항목만 evidence 로 남김

## Files changed

```
msm-portal repo (Agent-Design-System/msm-portal):
A  js/msm-portal-web/src/common/config/types.ts
A  js/msm-portal-web/src/common/config/baseTheme.ts
A  js/msm-portal-web/src/common/config/mergeTheme.ts
A  js/msm-portal-web/src/apps/{msm-default,tving,shortmax,onboard-demo}/config/theme.ts
M  js/msm-portal-web/src/apps/{msm-default,tving,shortmax,onboard-demo}/main.tsx
A  js/msm-portal-web/script/client-app/patch/{vite-alias,package-scripts,firebaserc}.ts
M  js/msm-portal-web/script/client-app/{generate-client.ts,config/types.ts,README.md}
A  js/msm-portal-web/script/client-app/config/{onboard-trial.yaml,template.yaml updated}
M  js/msm-portal-web/script/client-app/history.md (audit log)

inspect repo (moloco-inspect):
A  docs/superpowers/handoffs/2026-04-30-multi-tenant-v1.md (this doc)
```

## 다음 세션 — v2 backlog

v1 (1-2 주) 끝. v2 후보 (1-2 개월):

### v2.1 — 첫 실제 색상 (별 plan 으로 분리)
4 클라 모두 empty override 로 두고 시각 회귀 0 보장. 첫 실제 색상은 별 plan:
- tving 의 brand color (`#E41C38`?) → `tving/config/theme.ts` 에 채움
- 같은 식으로 shortmax / onboard-demo 도 brand 적용
- 시각 회귀 테스트 (스크린샷) 필요

### v2.2 — 런타임 테마 주입
빌드타임 → 런타임. CSS 변수 / 동적 import. 한 빌드 결과물이 여러 클라 지원.

### v2.3 — Admin onboarding UI
yaml 파일 직접 수정 → 웹 UI 에서 입력. orchestrator 에 admin endpoint + 사이드바 page.

### v2.4 — i18n namespace 분기
client 별 i18n 키 분리. 현재는 strings.ko.json 단일 파일.

### v2.5 — 외부 feature flag (GrowthBook / LaunchDarkly)
client 별 기능 토글. 빌드 결과물 동일 + runtime 분기.

### v2.6 — 서브도메인 라우팅
`tving.msm-portal.com` / `shortmax.msm-portal.com`. 빌드타임 분리 → 단일 배포 + 도메인별 분기.

## v1 의 비범위 명시 (다시)

- 런타임 CSS 변수 주입
- Admin UI
- 외부 feature flag
- 서브도메인 라우팅
- i18n namespace 분기
- `tokens.json clientThemes`
- 4 클라 실제 색상

→ 모두 v2 이후로 미룸. v1 = baseline scaffolding 만.

## 주의사항

- **별도 repo branch**: `feature/multi-tenant-v1` 가 main 으로 머지되어야 새 클라 온보딩이 활성화. PR + review 필요.
- **Pre-commit hook 의 sync 스크립트**: tving → msm-default/onboard-demo/shortmax 자동 sync 가 .rej 파일 남길 수 있음. 정상 (수동 sync 시점에 정리).
- **dist/ 빌드 결과물**: `.gitignore` 에 있어 commit 안 됨.
- **한 클라이언트 추가 후 deployment**: PR merge 후 `manual-deploy:CLIENT:test` 실행 필요. 자동화는 v2 의 admin UI 가 다룸.

## How to start the next session

```
이전 세션 핸드오프:
  docs/superpowers/handoffs/2026-04-30-multi-tenant-v1.md

multi-tenant v1 작업은 별도 repo 의 branch:
  cd ~/Documents/Agent-Design-System/msm-portal
  git checkout feature/multi-tenant-v1
  git log --oneline -3 # 6d5016e7 / 2a42c203 / a86d29d5

다음 후보:
  1. PR + review + main 으로 머지 (사용자 협업)
  2. v2.1 — tving brand color 적용 (별 plan)
  3. moloco-inspect 쪽 다른 follow-up
```

---

*마지막 업데이트: 2026-04-30 저녁*
