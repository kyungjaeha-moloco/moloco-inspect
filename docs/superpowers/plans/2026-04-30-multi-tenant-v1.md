# multi-tenant v1 — baseTheme + CLI 자동화

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. 각 task 의 step 은 작업이 끝나면 `[x]` 로 마킹하고 verification 명령을 그대로 실행해 evidence 를 남길 것. 코드는 별도 repo (`Agent-Design-System/msm-portal/js/msm-portal-web/`) 에서 작업하며, plan 자체는 `moloco-inspect` 에 보관된다.

**Goal:** MSM Portal 의 첫 신규 클라이언트(=5번째 publisher) 를 반나절~1일 안에 온보딩할 수 있는 상태로 끌어올린다. 두 축으로 진행한다 — (1) `customTheme: undefined` 로 비어 있는 테마 레이어를 `baseTheme + perClientTheme deep-merge` 구조로 도입하고, (2) `pnpm client-app generate` 의 자동화 범위를 vite.config.ts alias / package.json 빌드 스크립트 / `.firebaserc` hosting target 까지 확장한다.

**Architecture:**
- 빌드타임 분기 유지 (`CLIENT` env → 별도 번들 → 별도 Firebase 사이트). research doc 의 "패턴 A 유지" 권장에 따른다.
- 테마는 `src/common/config/baseTheme.ts` 가 모든 클라의 공통 기본을 제공하고, `src/apps/{client}/config/theme.ts` 가 그 위에 client overrides 를 deep-merge 한다. 합성된 결과를 `MTClientConfig.customTheme` 으로 주입 → builder 의 `App.tsx:42` 에서 `createTheme(customTheme)` 가 처리한다 (`@moloco/moloco-cloud-react-ui`).
- CLI 는 zod schema (`script/client-app/config/types.ts`) 를 확장해 `destClient.brandColor` / `firebaseSiteSuffix` 같은 신규 필드를 받고, generate-client 가 추가로 vite.config.ts / package.json / .firebaserc 를 patch 한다.

**Tech Stack:**
- Frontend: React 18.3.1 + Vite 5.4.8 + TypeScript 5.5.3
- Theme primitive: `@moloco/moloco-cloud-react-ui` (`createTheme`, `MITheme`)
- Multi-mode build: Vite multi-mode (`MODE=test CLIENT=tving`)
- Hosting: Firebase Hosting multi-site (`.firebaserc` targets)
- CLI: tsx + commander + zod + yaml (`script/client-app/`)

**비범위 (v1 가 다루지 않음):**
- 런타임 CSS 변수 주입 (research doc 의 패턴 B). v2 영역.
- Admin UI / 외부 feature flag 서비스 (패턴 D, E). v2/v3 영역.
- 서브도메인 라우팅 (패턴 C). v3 영역.
- i18n namespace 분기, workplace 격리 검증.
- 4 클라(tving/shortmax/msm-default/onboard-demo) 의 실제 브랜드 색상 적용. v1 은 baseTheme 도입 + 구조 정합성만 보장하고, 첫 실제 색상 적용은 별도 task (Phase 2 first real theme) 로 분리.

## File Structure

신규 / 변경되는 파일 (전부 `Agent-Design-System/msm-portal/js/msm-portal-web/` 기준):

신규:
- `src/common/config/baseTheme.ts` — 모든 클라가 공유하는 base `MITheme` partial.
- `src/common/config/types.ts` — `BaseTheme`, `ClientThemeOverrides`, `mergeTheme()` helper signature.
- `src/common/config/mergeTheme.ts` — base + overrides deep-merge 구현.
- `src/apps/tving/config/theme.ts`
- `src/apps/shortmax/config/theme.ts`
- `src/apps/msm-default/config/theme.ts`
- `src/apps/onboard-demo/config/theme.ts`
- `script/client-app/patch/vite-alias.ts` — vite.config.ts AST/string patcher.
- `script/client-app/patch/package-scripts.ts` — package.json scripts patcher.
- `script/client-app/patch/firebaserc.ts` — `.firebaserc` hosting target patcher.
- `script/client-app/config/onboard-trial.yaml` — dry-run 용 신규 클라 샘플 yaml.

변경:
- `src/apps/{4 clients}/main.tsx` — `customTheme: undefined` 를 `customTheme: theme` 로 교체 (총 4 파일).
- `script/client-app/config/types.ts` — `CommonClientConfigSchema` 에 `brandColor?`, `firebaseSiteSuffix?` 추가.
- `script/client-app/generate-client.ts` — 파일 복사 후 patch 함수 3개 호출.
- `script/client-app/config/template.yaml` — 신규 필드 주석 포함 가이드 추가.
- `vite.config.ts` — patcher 가 idempotent 하게 alias 추가하도록 marker comment 보전.

미변경 (의도):
- `firebase.json` — hosting target 정의는 `.firebaserc` 에서 하고, deploy 명령은 `--only hosting:{target}` 으로 지정하므로 v1 에서는 건드리지 않는다.
- `tsconfig.app.json` — paths 는 vite alias 를 정확히 미러링하지 않는 상태이며, 현재 빌드/타입체크가 이미 통과한다. v1 에선 그대로 둔다.

---

## Task 1: baseTheme 도입 (타입 정의 + 4 클라 마이그레이션)

목표: `customTheme: undefined` 를 없애고, 모든 클라가 `baseTheme` 를 거치는 구조로 정렬한다. 첫 실제 색상 적용은 하지 않는다 (구조만).

### Step 1.1: base theme 타입 정의

- [ ] **Step**: `src/common/config/types.ts` 신규 파일 생성. `MITheme` 의 partial 형을 base 로 노출하고, client override 형 정의.

```ts
// src/common/config/types.ts
import { MITheme } from '@moloco/moloco-cloud-react-ui';

// base + overrides 모두 partial — createTheme 이 deep-merge 후 기본값을 채운다.
export type BaseTheme = Partial<MITheme>;
export type ClientThemeOverrides = Partial<MITheme>;
```

- [ ] **Verification**: `pnpm tsc -b` 가 통과.

### Step 1.2: empty baseTheme 작성

- [ ] **Step**: `src/common/config/baseTheme.ts` 신규 파일. 첫 단계는 빈 객체 — 4 클라 마이그레이션이 회귀 없이 끝났는지 확인하기 위함.

```ts
// src/common/config/baseTheme.ts
import { BaseTheme } from './types';

// v1 의 baseTheme 는 비어 있다. 모든 색상/스페이싱 기본값은
// @moloco/moloco-cloud-react-ui 의 createTheme() 내부 default 가 채운다.
// 향후 실제 token 을 여기로 끌어올린 뒤 client overrides 를 단순화한다.
export const baseTheme: BaseTheme = {};
```

- [ ] **Verification**: 파일이 존재하고 `pnpm tsc -b` 가 통과.

### Step 1.3: mergeTheme helper 작성

- [ ] **Step**: `src/common/config/mergeTheme.ts` 신규 파일. base + overrides 를 deep-merge 해서 `MITheme | undefined` 를 반환. 둘 다 비어 있으면 `undefined` 를 반환해서 builder 의 createTheme 이 완전히 default 만 쓰도록 한다.

```ts
// src/common/config/mergeTheme.ts
import { merge } from 'lodash-es';

import { MITheme } from '@moloco/moloco-cloud-react-ui';

import { BaseTheme, ClientThemeOverrides } from './types';

export function mergeTheme(
  base: BaseTheme,
  overrides: ClientThemeOverrides,
): MITheme | undefined {
  const composed = merge({}, base, overrides);
  return Object.keys(composed).length === 0 ? undefined : (composed as MITheme);
}
```

- [ ] **Verification**: `pnpm tsc -b` 통과. lodash-es 는 이미 dependency 에 존재 (package.json:61).

### Step 1.4: 4 클라이언트 theme.ts 생성 (empty overrides)

- [ ] **Step**: 4 클라 각각 `src/apps/{client}/config/theme.ts` 생성. 모두 빈 overrides 로 시작.

```ts
// src/apps/tving/config/theme.ts (shortmax/msm-default/onboard-demo 동일 형태)
import { baseTheme } from '@msm-portal/common/config/baseTheme';
import { mergeTheme } from '@msm-portal/common/config/mergeTheme';
import { ClientThemeOverrides } from '@msm-portal/common/config/types';

const overrides: ClientThemeOverrides = {
  // v1: empty — Phase 2 에서 brand color 진입.
};

export const theme = mergeTheme(baseTheme, overrides);
export default theme;
```

- [ ] **Verification**: 4 파일이 존재. `pnpm tsc -b` 통과.

### Step 1.5: 4 main.tsx 가 theme 사용하도록 교체

- [ ] **Step**: `src/apps/{tving,shortmax,msm-default,onboard-demo}/main.tsx` 4 파일에서 `customTheme: undefined` → `customTheme: theme` 으로 교체하고 import 추가.

```ts
// src/apps/tving/main.tsx (4 파일 동일 패턴)
import theme from '@msm-portal/tving/config/theme';
// ...
const config: MTClientConfig = {
  customTheme: theme,
  // ...rest unchanged
};
```

- [ ] **Verification**:
  - `pnpm build:tving:test`
  - `pnpm build:shortmax:test`
  - `pnpm build:msm-default:test`
  - `pnpm build:onboard-demo:test`
  - 4 build 모두 성공. `dist/{client}/` 산출물의 bundle hash 가 이전과 거의 동일 (empty overrides 라 런타임상 차이 없음 — `mergeTheme` 가 `undefined` 반환).

### Step 1.6: 회귀 확인

- [ ] **Step**: tving dev server 기동 후 메인 화면을 시각적으로 확인. 색상/스페이싱이 v1 도입 전과 동일해야 한다.
  - `pnpm start:tving:test` → http://localhost:8000
- [ ] **Verification**: 로그인 화면 + 대시보드 1개 페이지 스크린샷, 도입 전과 비교해 색상/폰트 차이 없음.

---

## Task 2: CLI 자동화 확장 (vite.config.ts / package.json / .firebaserc 패치)

목표: `pnpm client-app generate` 한 번으로 신규 클라이언트의 alias / build script / hosting target 까지 자동 등록되도록 확장. 현재는 파일 복사 + import alias 치환만 한다.

### Step 2.1: yaml 스키마 확장

- [ ] **Step**: `script/client-app/config/types.ts` 의 `CommonClientConfigSchema` 와 `YamlConfigSchema` 를 확장. neue 필드는 모두 optional 로 시작 (기존 yaml 파일 호환성 유지).

```ts
// script/client-app/config/types.ts (변경분 발췌)
const CommonClientConfigSchema = z.object({
  alias: z.string(),
  envClientValue: z.string(),
  // v1 신규:
  brandColor: z.string().optional(),
  firebaseSiteSuffix: z.string().optional(), // 미지정 시 alias 그대로 사용
  defaultPort: z.number().int().optional(),
});
```

- 추가로 yaml 최상위에 `automation` 블록을 새로 정의 — 어떤 patcher 를 켤지 boolean 으로 제어 (rollback 쉽게 하기 위해).

```ts
const AutomationSchema = z.object({
  patchViteAlias: z.boolean().default(true),
  patchPackageScripts: z.boolean().default(true),
  patchFirebaserc: z.boolean().default(true),
});

export const YamlConfigSchema = JobConfigSchema
  .merge(CliConfigSchema)
  .extend({ automation: AutomationSchema.default({}) });
```

- [ ] **Verification**: 기존 yaml 파일 (default/onboard-demo/shortmax) 이 schema 변경 후에도 그대로 parse 되는지 확인.
  - `pnpm tsx script/client-app/index.ts generate -c default/<existing>.yaml --dry-run` (다음 step 에서 dry-run 추가).

### Step 2.2: vite.config.ts patcher

- [ ] **Step**: `script/client-app/patch/vite-alias.ts` 신규. AST 가 아닌 string 기반 patch — alias 배열 끝 (`@msm-portal/i18n` entry 위) 에 새 entry 삽입. idempotent (이미 존재하면 skip).

```ts
// script/client-app/patch/vite-alias.ts
import fs from 'fs';

const ALIAS_MARKER = `find: '@msm-portal/i18n'`;

export function patchViteAlias(viteConfigPath: string, alias: string) {
  const src = fs.readFileSync(viteConfigPath, 'utf8');
  const findStr = `find: '@msm-portal/${alias}'`;
  if (src.includes(findStr)) {
    console.log(`  vite.config.ts: alias '@msm-portal/${alias}' already present, skipping.`);
    return;
  }

  const insertion = `        {
          find: '@msm-portal/${alias}',
          replacement: path.resolve(__dirname, 'src/apps/${alias}'),
        },
        `;

  const idx = src.indexOf(ALIAS_MARKER);
  if (idx === -1) {
    throw new Error('vite.config.ts: ALIAS_MARKER not found — abort patch');
  }
  // Insert before the marker line's leading `{`
  const insertionPoint = src.lastIndexOf('{', idx);
  const next = src.slice(0, insertionPoint) + insertion + src.slice(insertionPoint);
  fs.writeFileSync(viteConfigPath, next, 'utf8');
  console.log(`  vite.config.ts: added alias '@msm-portal/${alias}'.`);
}
```

- [ ] **Step**: 동일 파일에서 `PORT_DEFAULT_MAP` 에 entry 추가하는 `patchVitePortMap(alias, port)` 도 함께 export.
- [ ] **Verification**:
  - 기존 alias (tving) 로 호출 → 변경 없음.
  - 가상의 `mock-trial` 로 호출 → diff 에 alias entry 1개 + port entry 1개 추가.

### Step 2.3: package.json scripts patcher

- [ ] **Step**: `script/client-app/patch/package-scripts.ts` 신규. JSON 으로 read → 객체에 4 entry 추가 → write. 기존 entry 가 있으면 skip.

```ts
// script/client-app/patch/package-scripts.ts
import fs from 'fs';

export function patchPackageScripts(packageJsonPath: string, alias: string) {
  const raw = fs.readFileSync(packageJsonPath, 'utf8');
  const pkg = JSON.parse(raw);
  const entries: Record<string, string> = {
    [`start:${alias}:test`]: `MODE=test CLIENT=${alias} pnpm start`,
    [`build:${alias}:test`]: `MODE=test CLIENT=${alias} pnpm build`,
    [`manual-deploy:${alias}:test`]: `pnpm install && pnpm build:${alias}:test && pnpm pnpm firebase -P test deploy --only hosting:${alias}`,
  };
  let added = 0;
  for (const [key, value] of Object.entries(entries)) {
    if (pkg.scripts[key]) continue;
    pkg.scripts[key] = value;
    added += 1;
  }
  // alphabetical-ish ordering 은 무시 — prettier 가 정리하지 않음. 변경 최소화.
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`  package.json: added ${added} scripts for '${alias}'.`);
}
```

- [ ] **Verification**: tving 으로 호출 → 변경 없음 (이미 존재). `mock-trial` 호출 → diff 에 3 entry 추가.

### Step 2.4: .firebaserc patcher

- [ ] **Step**: `script/client-app/patch/firebaserc.ts` 신규. JSON 으로 read → 3 environment 각각의 `targets[<project>].hosting` 에 entry 추가.

```ts
// script/client-app/patch/firebaserc.ts
import fs from 'fs';

const ENV_PROJECT_MAP: Record<string, string> = {
  test: 'moloco-msm-portal-test',
  staging: 'moloco-msm-portal-staging',
  prod: 'moloco-msm-portal-prod',
};

export function patchFirebaserc(
  firebasercPath: string,
  alias: string,
  siteSuffix: string,
) {
  const raw = fs.readFileSync(firebasercPath, 'utf8');
  const config = JSON.parse(raw);
  let added = 0;

  for (const [envName, projectName] of Object.entries(ENV_PROJECT_MAP)) {
    const hosting = config.targets[projectName].hosting;
    if (hosting[alias]) continue;
    hosting[alias] = [`msm-portal-${siteSuffix}-${envName}`];
    added += 1;
  }
  fs.writeFileSync(firebasercPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log(`  .firebaserc: added ${added} hosting targets for '${alias}'.`);
}
```

- [ ] **Verification**: tving 으로 호출 → 변경 없음. `mock-trial` (siteSuffix=`mock-trial`) → 3 environment 각각 entry 추가, site 명 `msm-portal-mock-trial-{test|staging|prod}` 형식.

### Step 2.5: generate-client 통합

- [ ] **Step**: `script/client-app/generate-client.ts` 의 `generateClientApplicationFiles` 가 파일 복사 후 `automation` 플래그에 따라 patcher 3개를 호출. 모든 patch 는 try/catch 로 감싸 각각 실패 시 다른 patch 는 진행 (사용자가 수동 보완).

```ts
// script/client-app/generate-client.ts (변경분 발췌)
import path from 'path';

import { patchViteAlias, patchVitePortMap } from './patch/vite-alias';
import { patchPackageScripts } from './patch/package-scripts';
import { patchFirebaserc } from './patch/firebaserc';

// ... existing copy logic ...

export function generateClientApplicationFiles(configFile: string) {
  const yamlConfig = loadYamlConfig(path.join(CONFIG_FILE_BASE_PATH, configFile));
  generateClientFiles(yamlConfig);

  const repoRoot = path.resolve(__dirname, '../../');
  const { automation, destClient } = yamlConfig;

  if (automation.patchViteAlias) {
    try {
      patchViteAlias(path.join(repoRoot, 'vite.config.ts'), destClient.alias);
      if (destClient.defaultPort) {
        patchVitePortMap(path.join(repoRoot, 'vite.config.ts'), destClient.alias, destClient.defaultPort);
      }
    } catch (e) {
      console.error('  vite alias patch failed:', e);
    }
  }
  if (automation.patchPackageScripts) {
    try {
      patchPackageScripts(path.join(repoRoot, 'package.json'), destClient.alias);
    } catch (e) {
      console.error('  package.json patch failed:', e);
    }
  }
  if (automation.patchFirebaserc) {
    try {
      patchFirebaserc(
        path.join(repoRoot, '.firebaserc'),
        destClient.alias,
        destClient.firebaseSiteSuffix ?? destClient.alias,
      );
    } catch (e) {
      console.error('  .firebaserc patch failed:', e);
    }
  }

  updateHistory(yamlConfig, configFile);
}
```

- [ ] **Verification**: tving 입력으로 호출 → 4 patcher 모두 "skip" 로그. 변경 파일 0.

### Step 2.6: README + template.yaml 업데이트

- [ ] **Step**: `script/client-app/README.md` 와 `config/template.yaml` 에 신규 필드 (`brandColor`, `firebaseSiteSuffix`, `defaultPort`, `automation.*`) 설명 추가. 사용자가 yaml 작성 시 어떤 필드가 자동화에 영향을 주는지 분명히.
- [ ] **Verification**: README 에 v1 변경 사항 한 단원 추가, template.yaml 의 신규 필드는 주석으로 의미 설명.

---

## Task 3: 신규 클라 추가 dry run + 검증

목표: 실제 publisher 가 아닌 가상의 `onboard-trial` 을 추가하면서 v1 의 모든 path 를 한 번 굴린다. 끝나면 rollback.

### Step 3.1: onboard-trial yaml 작성

- [ ] **Step**: `script/client-app/config/onboard-trial.yaml` 작성. srcClient 를 `onboard-demo` 로 두고, destClient 를 `onboard-trial` 로 둔다.

```yaml
jobName: "v1 dry-run — onboard-trial"
description: "Validates baseTheme + CLI automation v1 end-to-end."
type: "Create"

root: "src/apps"

srcClient:
  alias: "onboard-demo"
  envClientValue: "onboard-demo"
  targetFolders: []
  targetFiles: []

destClient:
  alias: "onboard-trial"
  envClientValue: "onboard-trial"
  brandColor: "#3F51B5"
  firebaseSiteSuffix: "onboard-trial"
  defaultPort: 9002

copyOption:
  isOverwriteDir: true
  isOverwriteFile: true
  excludeFolders: []
  excludeFiles: []

automation:
  patchViteAlias: true
  patchPackageScripts: true
  patchFirebaserc: true
```

- [ ] **Verification**: yaml 이 zod schema 로 parse 됨 (`pnpm tsx -e "..."` 또는 generate 호출 시 에러 없음).

### Step 3.2: generate 실행 + diff 확인

- [ ] **Step**: `pnpm client-app generate -c onboard-trial.yaml`
- [ ] **Verification**: `git status` 에 다음 변경이 모두 보여야 함.
  - `src/apps/onboard-trial/**` 신규 (config, feature-config, page, etc.)
  - `vite.config.ts` 에 alias entry + port entry 추가
  - `package.json` 에 3 script 추가
  - `.firebaserc` 에 3 hosting target 추가

### Step 3.3: build 검증

- [ ] **Step**: `pnpm build:onboard-trial:test`
- [ ] **Verification**: build 성공, `dist/onboard-trial/index.html` 생성. 기존 4 클라 build 도 회귀 없는지 1개 (msm-default) sample 로 확인.
  - `pnpm build:msm-default:test` 도 정상.

### Step 3.4: 신규 클라 theme.ts 가 자동 생성됐는지 확인

- [ ] **Step**: generate-client 의 파일 복사가 onboard-demo 의 theme.ts 를 함께 복사했는지 확인. 만약 누락이라면 이는 Task 1 의 onboard-demo theme.ts 가 만들어진 직후 generate 하기 때문에 자동 포함이 자연스러움.
- [ ] **Verification**: `src/apps/onboard-trial/config/theme.ts` 존재. import path 가 `@msm-portal/onboard-trial/...` 으로 치환되어 있음 (현재 generate-client.ts:55-58 의 정규식이 처리).

### Step 3.5: rollback

- [ ] **Step**: dry-run 검증이 끝났으므로 `git restore` + 신규 디렉토리 제거.
  - `git restore vite.config.ts package.json .firebaserc`
  - `rm -rf src/apps/onboard-trial`
  - `rm script/client-app/config/onboard-trial.yaml`
  - `git restore script/client-app/history.md` (history 가 자동 갱신되었을 것)
- [ ] **Verification**: `git status` 에 onboard-trial 흔적이 남지 않음. v1 task 1/2 의 변경만 남아 있어야 함.

---

## Task 4: handoff + 다음 단계 (v2 — 런타임 주입 + Admin UI)

목표: v1 종료 시점에 다음 세션이 곧장 v2 로 진입할 수 있도록 handoff 문서와 follow-up 항목을 정리한다.

### Step 4.1: handoff 노트 작성

- [ ] **Step**: `docs/superpowers/handoffs/2026-04-30-multi-tenant-v1-done.md` 신규 작성 (moloco-inspect repo, plan 과 동일 슬라이스).
  - 어떤 파일이 추가/변경됐는지 요약.
  - dry-run 결과 (build 성공 여부, 발견된 함정).
  - "다음 publisher 가 들어오면 어떤 yaml 만 작성하면 되는가" 5줄 가이드.
- [ ] **Verification**: 파일 존재. plan 의 Task 1~3 작업 결과를 한 페이지로 요약.

### Step 4.2: tving 실제 브랜드 색상 적용 plan 분리

- [ ] **Step**: research doc 의 "Phase 2 first real theme" (`tving #E41C38`) 는 v1 본 plan 에 포함하지 않는다. 별도 plan 으로 분리해서 다음 세션이 작은 risk 로 시도 가능하게 둔다.
  - 위치: `docs/superpowers/plans/2026-05-XX-tving-real-theme.md` (placeholder, 실제 작성은 v1 종료 후).
- [ ] **Verification**: v1 plan 의 Task 1 결과로 `tving/config/theme.ts` 가 빈 overrides 인 상태가 보존된다. Phase 2 plan 이 이 파일만 수정하면 되는 구조.

### Step 4.3: v2 backlog 정리

- [ ] **Step**: research doc § 5 의 v2 항목을 plan-level TODO 로 옮긴다 (`docs/superpowers/plans/2026-05-XX-multi-tenant-v2.md` placeholder).
  - 환경변수/`/api/client-config` 기반 런타임 토큰 주입.
  - Admin 내부 도구 (yaml 자동 생성 + PR open).
  - CI/CD 자동 빌드/배포 (새 디렉토리 감지).
  - feature-config 외부화 (YAML/JSON 표준화).
- [ ] **Verification**: 4 항목이 backlog 로 적혀 있고, 각 항목마다 v1 의 어떤 산출물 위에 쌓이는지 (연결고리) 1줄 설명.

---

## Self-Review

### v1 범위 적정성
- [x] research doc § 5 의 v1 권장 5 항목 중 3 개를 본 plan 이 처리: `baseTheme.ts` + 4 클라 `theme.ts` (Task 1) / CLI 확장 (Task 2). 남은 2 개 — `tving 실제 색상` / `tokens.json clientThemes` — 는 Task 4 에서 명시적으로 v1 외로 분리해 risk 를 낮췄다.
- [x] research doc § 7 의 사용자 결정 항목 중 #1 (테마 런타임화 시점) / #4 (CLI 자동화 범위) 가 본 plan 의 default 로 결정됨 — "v1 은 빌드타임, CLI 자동화 포함" 입장.

### Bite-sized step 검토
- [x] Task 1 은 6 step (타입 → base → merge → 4 client → main.tsx → 회귀). 각 step 2-5 분.
- [x] Task 2 는 6 step (schema → 3 patcher → 통합 → README). 패치 하나가 5-10 분 단위, generate 통합은 한 번에 끝.
- [x] Task 3 은 5 step. dry-run 자체가 검증 step 의 모음.
- [x] Task 4 는 3 step, 모두 docs 작성으로 step 당 5 분.

### 리스크
- [x] **vite.config.ts string patch**: AST 대신 marker comment 기반이라 예기치 않은 포맷 변경에 깨질 수 있음. ALIAS_MARKER 가 사라지면 throw — 즉시 발견 가능. 첫 dry-run (Task 3) 이 이를 잡는 안전망.
- [x] **generate-client 의 import alias 치환이 baseTheme/mergeTheme 경로도 영향**: 현재 정규식 (`'@msm-portal/${srcAlias}/`) 은 dest 에 src alias 를 그대로 둘 위험이 없음 — `@msm-portal/common/` 은 srcAlias 와 다르므로 치환 대상 아님. 안전.
- [x] **package.json 변경이 prettier/lint-staged 와 충돌**: lint-staged 는 commit 시점에 prettier 를 돌리므로 patch 직후 prettier 가 정렬을 다시 잡을 수 있음. 사용자 입장에서 noise 일 수 있어 README 에 "patch 후 `pnpm prettier` 한 번 실행" 가이드 추가 필요 (Task 2.6).
- [x] **테마 회귀**: Task 1 은 모든 overrides 가 비어 있어 `mergeTheme` 가 `undefined` 반환. App.tsx:42 의 `createTheme(undefined)` 동작은 도입 전과 동일. 시각적 회귀 가능성 거의 없음. Step 1.6 의 스크린샷 대비로 보수적으로 잡음.
- [x] **firebase deploy 실수**: Task 3 의 dry-run 은 build 까지만 확인하고 deploy 는 하지 않음 — `manual-deploy:onboard-trial:test` 는 절대 실행하지 않음 (rollback 단계에서 제거). 명시적으로 plan 본문에서 deploy 금지를 표기.

### 검증 가능성
- [x] 각 Task 가 완료됐는지 객관 평가 가능: build 통과 / git diff / 파일 존재 / yaml parse.
- [x] dry-run (Task 3) 가 v1 의 end-to-end 통합 테스트 역할.

### 시간 추정
- Task 1: ~2 시간 (4 클라 마이그 + 빌드 검증).
- Task 2: ~4 시간 (3 patcher + 통합 + README).
- Task 3: ~1 시간 (dry-run + rollback).
- Task 4: ~30 분 (docs).
- **총 ~7-8 시간 = 1 영업일** (research doc 의 v1 "1-2주" 추정 안에 안전하게 들어옴 — 1-2주는 PR 리뷰/QA/배포 일정 포함).
