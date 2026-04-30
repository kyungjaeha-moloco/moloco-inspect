# MSM Portal multi-tenant onboarding — 리서치 + 설계 옵션

## TL;DR

현재 MSM Portal은 **빌드 타임 클라이언트 분기** 방식을 사용한다. `CLIENT` 환경변수 + Vite multi-mode build로 tving/shortmax/msm-default/onboard-demo 4개 앱을 각각 별도 번들로 생성하고, Firebase Hosting의 별개 사이트에 배포한다. 새 클라이언트를 추가하려면 `pnpm client-app generate` CLI로 기존 앱을 템플릿 삼아 파일을 복사하고, 라우트·feature-config·layout·appConfig·theme을 수동으로 커스터마이징해야 한다. 현재 테마/브랜딩 오버라이드가 코드상으로는 준비되어 있으나 **실제로 4개 클라이언트 모두 `customTheme: undefined`** — 즉 브랜딩 분기가 아직 구현되어 있지 않다. 장기적으로는 (1) 테마/브랜딩 런타임 주입, (2) feature flag 체계 외부화, (3) 온보딩 자동화 수준 향상이 핵심 결정 사항이다.

---

## 1. 현재 MSM Portal의 multi-tenant 구조

### 1-1. `src/apps/` 패턴

```
src/apps/
  tving/
    config/        ← appConfig, i18n, layout, route, theme, CustomProvider, CustomDevTools, dayjs
    feature-config/ ← test/staging/prod별 feature flag 목록
    page/          ← 클라이언트 전용 페이지 컴포넌트
    component/
    container/
    hook/
    model/
    permission/
    provider/
    asset/         ← 로고(SVG), 배경 이미지
    main.tsx       ← 진입점
    index.html
  shortmax/        ← 동일 구조
  msm-default/     ← 동일 구조
  onboard-demo/    ← 동일 구조
```

각 클라이언트는 `@msm-portal/builder` (= `src/app-builder/`) 위에서 `MTClientConfig` 객체를 조립하여 `createIndexElement(config)`를 호출한다. builder는 클라이언트를 모른다 — config 주입만 받는다.

실제 파일: `/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/apps/tving/main.tsx`

### 1-2. CLIENT 환경변수 흐름

```
pnpm build:tving:test
  → MODE=test CLIENT=tving vite build
  → vite.config.ts: root = src/apps/tving, outDir = dist/tving
  → .env.test (src/apps/tving/.env.test) 로드
  → dist/tving/ 로 번들 출력
  → firebase deploy --only hosting:tving
```

각 클라이언트는 `dist/{client}/` 디렉토리에 완전히 독립된 번들을 생성한다.

실제 파일: `/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/vite.config.ts`

### 1-3. 클라이언트별 차이점

| 구분 | tving | shortmax | msm-default | onboard-demo |
|---|---|---|---|---|
| 테마 | `customTheme: undefined` | `customTheme: undefined` | `customTheme: undefined` | `customTheme: undefined` |
| 로고/레이아웃 | `client_logo.svg`, 빨간 배경 | 별도 asset | 기본 | 데모용 |
| appConfig | TVING_OMS 워크플레이스 | `^MSM_SHORTMAX_` regexp | 기본 | 데모 |
| feature-config | 30+ 피처 플래그 목록 | 별도 목록 | 기본 | 기본 |
| route | 모든 페이지 포함 | 클라별 일부 제외 | 기본 | 기본 |
| i18n | `defaultLanguage: 'ko'` | 별도 | 기본 | 기본 |
| Firebase 사이트 | `msm-portal-tving-{env}` | 별도 | `moloco-msm-portal-{env}` | 별도 |

실제 파일: `/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/.firebaserc`

### 1-4. 새 클라이언트 추가 현재 단계

1. `script/client-app/config/` 아래 YAML 파일 작성 (기존 템플릿 복사)
2. `pnpm client-app generate -c {yaml파일}` 실행 → 파일 복사 + import alias 치환
3. `vite.config.ts`에 새 alias 수동 추가
4. `tsconfig.app.json` paths 추가
5. `.firebaserc`, `firebase.json`에 새 hosting target 추가
6. `package.json` build/deploy 스크립트 추가
7. route, layout, appConfig, feature-config, asset 커스터마이징
8. 테마 파일 작성 (현재는 건너뜀 — `customTheme: undefined`)
9. CI/CD 파이프라인에 새 클라이언트 추가

**예상 소요: 개발자 1명 기준 1~3일** (파일 복사 자동화는 있으나 수동 설정 항목이 많음)

---

## 2. 외부 패턴 비교

### 패턴 A — 빌드타임 분기 (현재 MSM Portal 방식)

**핵심 메커니즘**: 클라이언트별 별도 Vite 빌드 → 별도 번들 → 별도 호스팅 사이트. 클라이언트 코드가 번들에서 완전히 제거된다.

**적용 가능성**: 현재 구조 그대로. 추가 공수 없음.

**트레이드오프**:
- 장점: 번들 크기 최소화, 클라이언트 코드 완전 격리, 보안상 타 클라이언트 코드 노출 없음
- 단점: 클라이언트 추가마다 CI 빌드 시간 선형 증가, 신규 온보딩에 설정 항목이 많음

출처: [Vite multi-mode build](https://vitejs.dev/config/#build-outdir)

### 패턴 B — 런타임 CSS 변수 주입 (Stripe Connect / Linear 방식)

**핵심 메커니즘**: 단일 번들 배포 후, 앱 부팅 시 `tenant_id`로 API 호출 → 브랜드 색상·로고 URL·폰트를 CSS custom property(`--color-brand`, `--logo-url`)로 주입. 컴포넌트는 CSS 변수만 참조.

**적용 가능성**: 테마/브랜딩에 한해서 즉시 적용 가능. MSM Portal의 `@moloco/moloco-cloud-react-ui`가 `createTheme()` deep-merge를 지원하므로 런타임 주입과 궁합이 좋다.

**트레이드오프**:
- 장점: 번들 1개, 브랜딩 업데이트 즉시 반영, 새 클라이언트 온보딩 시 코드 변경 불필요
- 단점: 기능(feature) 분기는 여전히 빌드타임 필요, 초기 로딩에 API 지연 발생 가능

출처: [White Label React App: Runtime and Build-Time Theming](https://corecotechnologies.com/development/white-label-react-app/), [A Palette for Every Tenant](https://medium.com/@pooja.akshantal/a-palette-for-every-tenant-6d75f9d88fd1)

### 패턴 C — 서브도메인 기반 라우팅 (Vercel Platforms 방식)

**핵심 메커니즘**: 와일드카드 DNS(`*.msm-portal.com`) + 미들웨어에서 서브도메인 추출 → tenant 식별 → 런타임 config 적용. 단일 배포, 무제한 테넌트.

**적용 가능성**: Firebase Hosting에서도 가능하나, Cloud Functions/Rewrites 설정 필요. 현재 구조 대비 인프라 변경 필요.

**트레이드오프**:
- 장점: 새 클라이언트에 DNS 추가만으로 온보딩, 코드 배포 불필요
- 단점: 인프라 복잡도 증가, Firebase Hosting의 서브도메인 동적 처리 제한

출처: [Vercel for Platforms — Multi-Tenant](https://vercel.com/docs/multi-tenant), [Vercel Platforms Starter Kit](https://github.com/vercel/platforms)

### 패턴 D — 외부 Feature Flag 서비스 (GrowthBook / LaunchDarkly)

**핵심 메커니즘**: 현재 `feature-config/test|staging|prod.feature.ts` 파일로 관리되는 feature flag를 외부 서비스로 이전. tenant_id + environment로 플래그 평가. Admin UI에서 실시간 토글 가능.

**적용 가능성**: 현재 `FEATURE_CONFIG.includes[]` 배열 구조는 GrowthBook의 feature 목록과 1:1 대응 가능. 마이그레이션 경로가 명확하다.

**트레이드오프**:
- 장점: 배포 없이 기능 On/Off, 클라이언트별 점진적 롤아웃 가능
- 단점: 외부 서비스 의존성, 네트워크 레이턴시, 비용

출처: [GrowthBook open-source feature flags](https://www.growthbook.io/), [WorkOS developers guide SaaS multi-tenant](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture)

### 패턴 E — Config-as-YAML + Admin 온보딩 UI (Metadata-driven)

**핵심 메커니즘**: 현재 `script/client-app/config/*.yaml` 방식을 발전시켜, 웹 기반 Admin UI에서 클라이언트 등록(로고, 색상, 기능 목록, workplace ID 등)하면 빌드/배포 파이프라인이 자동으로 트리거되는 방식.

**적용 가능성**: 현재 CLI(`pnpm client-app generate`) 기반 수동 온보딩을 Admin UI로 격상하는 자연스러운 진화 경로.

**트레이드오프**:
- 장점: 비개발자도 클라이언트 온보딩 가능, 오류 감소
- 단점: Admin UI 자체 개발 공수 필요 (~1-2개월)

출처: [Designing Metadata-Driven UI Customization for Multi-Tenant SaaS](https://sollybombe.medium.com/designing-metadata-driven-ui-customization-for-multi-tenant-saas-b13140221e5c), [Practical Multi-Tenant SaaS Provisioning and Automated Onboarding](https://kodekx-solutions.medium.com/practical-multi-tenant-saas-provisioning-and-automated-onboarding-3bb6fdd3e84f)

---

## 3. 영역별 결정 매트릭스

| 영역 | 옵션 A | 옵션 B | 옵션 C | 권장 |
|---|---|---|---|---|
| **도메인/라우팅** | 현재: 별도 Firebase 사이트 | 서브도메인 + 와일드카드 DNS | 커스텀 도메인 (tving.com/portal) | **A 유지** (변경 비용 大, 보안 격리 이점) |
| **테마/브랜딩** | 현재: 빌드타임 asset 교체만 | 런타임 CSS 변수 주입 (API) | createTheme() + YAML 설정 파일 | **C → B 단계적 전환** (YAML 먼저, 나중에 런타임) |
| **Feature flag** | 현재: 파일 기반 정적 목록 | 외부 서비스 (GrowthBook/LD) | 동일 파일, Admin UI로 편집 | **A → C** (단기 파일 유지, 중기 Admin UI) |
| **데이터 isolation** | 현재: workplace_id로 서버 분리 | 클라이언트별 API endpoint | row-level client_id | **A 유지** (서버가 이미 workplace 단위 격리) |
| **온보딩 자동화** | 현재: YAML CLI (반자동) | CI/CD 자동 트리거 | Admin UI (풀 자동화) | **A → B → C 단계적** |

---

## 4. 권장 아키텍처 (1 옵션 + 근거)

**"빌드타임 분기 유지 + 테마 런타임화 + 온보딩 CLI 강화"** 조합을 권장한다.

### 핵심 근거

1. **현재 아키텍처의 강점 유지**: 클라이언트별 번들 격리는 보안(타 클라이언트 코드 노출 없음)과 성능(불필요한 코드 제로) 면에서 실질적 이점이 있다. Firebase Hosting 다중 사이트는 이미 작동하는 인프라다.

2. **테마만 런타임화**: `customTheme: undefined`인 현재 상태에서, `src/common/config/baseTheme.ts` + 클라이언트별 `theme.ts`를 도입하는 것은 `research/12-multi-client-theme-strategy.md`에 이미 설계가 완료되어 있다. 여기에 더 나아가 색상/로고를 환경 변수 또는 API로 주입하면 새 클라이언트 브랜딩에 재빌드가 불필요해진다.

3. **온보딩 CLI 강화**: `pnpm client-app generate`는 이미 존재하는 좋은 도구다. 현재 수동인 vite.config.ts alias 추가, package.json 스크립트 추가, .firebaserc 업데이트를 CLI가 자동으로 처리하도록 확장하면 온보딩 시간을 1-3일 → 반나절 수준으로 단축 가능하다.

### 구체적 설계

```
신규 클라이언트 온보딩 흐름 (목표 상태):

1. client-config.yaml 작성 (alias, workplace, 브랜드 색상, 로고, 기능 목록)
2. pnpm client-app generate -c {yaml}
   → src/apps/{client}/ 파일 생성
   → vite.config.ts alias 자동 추가
   → package.json 빌드 스크립트 자동 추가
   → .firebaserc / firebase.json hosting target 자동 추가
   → theme.ts에 brandColor 주입
3. PR 생성 → CI 빌드 → Firebase 배포 자동화
```

---

## 5. 단계별 마이그레이션 계획

### v1: 새 클라이언트 1개를 받을 수 있는 수준 (~1-2주)

- [ ] `src/common/config/baseTheme.ts` 생성 (빈 base, `research/12-multi-client-theme-strategy.md` 기준)
- [ ] 기존 4개 클라이언트에 `src/apps/{client}/config/theme.ts` 생성 (현재는 baseTheme 그대로)
- [ ] tving 테마 파일에 실제 브랜드 색상(`#E41C38`) 적용 (Phase 2 first real theme)
- [ ] `pnpm client-app generate` CLI 확장: vite.config.ts alias / package.json 스크립트 / .firebaserc 자동 패치
- [ ] 온보딩 체크리스트 문서 작성 (신규 클라이언트 담당자용)
- [ ] `design-system/src/tokens.json`에 `clientThemes` 섹션 추가

**결과**: 개발자 1명이 반나절~1일 안에 새 클라이언트를 온보딩할 수 있는 상태

### v2: 자동화 + 브랜딩 런타임화 (~1-2개월)

- [ ] 브랜드 토큰(색상, 로고 URL, 폰트)을 환경변수 또는 경량 API(`/api/client-config`)로 외부화
- [ ] 앱 부팅 시 `VITE_CLIENT_NAME`으로 config fetch → CSS variables 주입
- [ ] Admin 내부 도구(간단한 웹 폼): 클라이언트 등록 → YAML 생성 → PR 자동 오픈
- [ ] CI/CD: 새 클라이언트 디렉토리 감지 → 자동 빌드/배포 파이프라인
- [ ] feature-config를 YAML/JSON으로 외부화 (파일은 유지, 형식 표준화)

**결과**: 비개발자(PM/디자이너)도 브랜딩 변경 가능, 개발자 온보딩 공수 최소화

### v3: 완전 SaaS 셀프 온보딩 (~분기 단위)

- [ ] 외부 feature flag 서비스(GrowthBook 등) 도입: 배포 없이 기능 On/Off
- [ ] Admin UI: 클라이언트별 기능 목록, 브랜드 설정, 배포 상태를 한 화면에서 관리
- [ ] 서브도메인 자동 프로비저닝 검토 (Firebase Hosting 커스텀 도메인 API 활용)
- [ ] 신규 클라이언트 온보딩 완전 셀프서비스 (코드 변경 없음)

**결과**: Moloco 내부 팀 없이 새 publisher가 스스로 포털을 설정할 수 있는 상태

---

## 6. 위험 / 함정

1. **테마 충돌 (Theme Conflict)**: `createTheme()` deep-merge가 예상과 다른 토큰에 영향을 줄 수 있다. `palette.foundation.assent` 변경이 버튼·링크·탭·체크박스 등 수십 개 토큰에 파급된다. 변경 전 영향 범위를 `derivedTokens`로 명시적으로 문서화할 것.

2. **기능 코드 노출**: 빌드타임 분기이므로 이론상 격리가 보장되지만, `src/common/`의 공통 코드에 클라이언트 조건문(`if CLIENT === 'tving'`)이 누적되면 번들에 모든 클라이언트 로직이 포함될 수 있다. feature-guard 패턴(`src/common/feature-guard/`)을 엄격히 준수해야 한다.

3. **온보딩 스크립트 drift**: `pnpm client-app generate`로 복사한 파일과 원본 tving 파일이 시간이 지나면서 달라진다. 정기적으로 `pnpm client-app analyze -a {client}`로 drift를 감지하는 프로세스 필요.

4. **Firebase Hosting 사이트 수 제한**: Firebase는 프로젝트당 Hosting 사이트 수에 제한이 있다(기본 36개). 클라이언트가 많아지면 사전 확인 필요.

5. **i18n 중복**: 현재 모든 클라이언트가 동일한 `src/i18n/assets/`를 공유하되, 클라이언트별 override 구조가 없다. 클라이언트별 용어 차이(예: tving의 한국어 특화 UX copy)가 생기면 i18n namespace 분기가 필요해진다.

6. **데이터 격리 착각**: Portal 레벨에서 `workplace_id`로 분리되지만, API 서버가 workplace 검증을 누락하면 data leakage가 발생한다. 클라이언트 추가 시 API 팀과 workplace 접근 권한 검토 필수.

---

## 7. 다음 단계 — 사용자 결정 필요한 항목

1. **테마 런타임화 시점**: v1에서 `theme.ts` 파일로 브랜드 색상을 하드코딩할지, 처음부터 환경변수/API 기반으로 갈지. (빠른 첫 번째 클라이언트 온보딩 vs 장기 확장성)

2. **신규 클라이언트의 기능 범위 결정 주체**: 기능 목록을 Moloco 엔지니어가 코드로 관리할지, PM이 YAML/Admin UI로 관리할지. (v1 vs v2 우선순위)

3. **도메인 전략**: 신규 클라이언트가 자체 도메인(`portal.tving.com`)을 원하는지 Moloco subdomain(`tving.msm.moloco.com`)을 쓸지. Firebase Custom Domain 설정 또는 서브도메인 라우팅 아키텍처 선택에 영향.

4. **온보딩 CLI 확장 범위**: `vite.config.ts` / `package.json` / `.firebaserc` 자동 패치를 v1에 포함할지. 포함하면 ~3일 작업이지만 이후 온보딩마다 시간이 절약된다.

5. **feature flag 외부화 우선순위**: 현재 파일 기반 feature-config로 충분한지, GrowthBook 같은 외부 서비스 도입을 v2에 포함할지. (운영 복잡도 vs 배포 없는 기능 토글)

---

## 8. 출처

### 내부 파일 (주요 참조)
- `/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/package.json` — 빌드/배포 스크립트 전체
- `/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/vite.config.ts` — multi-client Vite 설정
- `/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/apps/tving/main.tsx` — MTClientConfig 패턴
- `/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/apps/tving/config/` — layout, route, appConfig, i18n, feature-config
- `/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/.firebaserc` — Firebase Hosting 멀티 사이트 매핑
- `/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/script/client-app/` — 온보딩 CLI (generate-client.ts, README.md, template.yaml)
- `/Users/kyungjae.ha/Documents/Agent-Design-System/research/12-multi-client-theme-strategy.md` — 3-layer 테마 아키텍처 설계

### 외부 참조
- [White Label React App: Runtime and Build-Time Theming](https://corecotechnologies.com/development/white-label-react-app/)
- [Vercel for Platforms — Multi-Tenant](https://vercel.com/docs/multi-tenant)
- [vercel/platforms — Next.js Multi-Tenant Starter Kit](https://github.com/vercel/platforms)
- [WorkOS: The Developer's Guide to SaaS Multi-Tenant Architecture](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture)
- [Designing Metadata-Driven UI Customization for Multi-Tenant SaaS](https://sollybombe.medium.com/designing-metadata-driven-ui-customization-for-multi-tenant-saas-b13140221e5c)
- [Practical Multi-Tenant SaaS Provisioning and Automated Onboarding](https://kodekx-solutions.medium.com/practical-multi-tenant-saas-provisioning-and-automated-onboarding-3bb6fdd3e84f)
- [AWS: Tenant routing strategies for SaaS applications](https://aws.amazon.com/blogs/networking-and-content-delivery/tenant-routing-strategies-for-saas-applications-on-aws/)
- [A Palette for Every Tenant](https://medium.com/@pooja.akshantal/a-palette-for-every-tenant-6d75f9d88fd1)
