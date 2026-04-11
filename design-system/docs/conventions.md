<!-- AUTO-GENERATED — Do not edit directly. Edit src/conventions.json then run: node generate.mjs -->

# Conventions

> Naming conventions, file structure rules, and code style for the MSM Portal.

---

## Naming Prefixes

| Prefix | Type | Description | Examples |
|--------|------|-------------|----------|
| `MC` | Component | Public/exported React component | `MCFormTextInput`, `MCButton2`, `MCFormPanel` |
| `MT` | Type/Interface | TypeScript type or interface | `MTFormFieldRef`, `MTMoreActionItem`, `MTFormLayout` |
| `SC` | Styled Component | Internal styled-component (not exported) | `SCFormBody`, `SCNavBarWrapper`, `SCMoreActionsButton` |
| `ME` | Enum | TypeScript enum | `MEFormFieldWidth` |
| `use` | Hook | Custom React hook | `useAuthState`, `useFeatureGuard` |

---

## File Naming

| Pattern | Use Case | Examples |
|---------|----------|----------|
| `PascalCase.tsx` | React components | `MCFormTextInput.tsx` |
| `PascalCase.ts` | TypeScript utilities, types | `MCFormFieldLabel.ts` |
| `camelCase.ts` | Config, constants, utilities | `const.ts`, `utils.ts` |
| `styledComponents.tsx` | Styled component files | `styledComponents.tsx` |
| `index.ts` | Barrel exports | `index.ts` |
| `types.ts` | Type definitions | `types.ts` |

---

## Import Aliases

| Alias | Resolves To |
|-------|-------------|
| `@msm-portal/builder/` | `src/app-builder/` |
| `@msm-portal/common/` | `src/common/` |
| `@msm-portal/route/` | `src/route/` |
| `@msm-portal/i18n/` | `src/i18n/` |
| `@msm-portal/msm-default/` | `src/apps/msm-default/` |
| `@msm-portal/tving/` | `src/apps/tving/` |
| `@msm-portal/shortmax/` | `src/apps/shortmax/` |
| `@msm-portal/onboard-demo/` | `src/apps/onboard-demo/` |

---

## Import Order

1. React and React-related (react, react-router-dom)

2. Third-party libraries (styled-components, formik, etc.)

3. Moloco UI library (@moloco/moloco-cloud-react-ui)

4. Internal portal imports (@msm-portal/...)

5. Relative imports (./, ../)

---

## Styled Component Rules

- Always use SC prefix for styled components defined within a file
- Use $ prefix on props that should NOT be forwarded to the DOM (transient props)
- Never hardcode color, spacing, or typography values — always use theme tokens
- Co-locate styled components in a styledComponents.tsx file if there are more than 3
- Do not export styled components unless shared across multiple components
- Shared styled components go in src/common/component/styled/

---

## Form Component Rules

- Must be inside <Formik> context
- Use useField(name) for Formik integration
- Always require the name prop — it's the Formik field name
- Show errors only after meta.touched is true
- required={false} shows (Optional) suffix — required={true} shows no suffix
- Use readonly prop for view-only states instead of disabling

---

## Directory Structure

**Component pattern**: `Each component lives in: src/common/component/{component-name}/{ComponentName}.tsx + styledComponents.tsx + types.ts + const.ts + index.ts`

**Form pattern**: `src/common/component/form/shared/ (shared), form/layout/ (full-page layout), form/v1/ (versioned inputs)`

**App pattern**: `src/apps/{client}/index.html + main.tsx + .env.{test,staging,prod} + components/ + pages/`

---

## Architecture

Mandatory 3-layer architecture for all features

| Layer | Location | Naming | Responsibility |
|-------|----------|--------|---------------|
| **Page** | `src/apps/{client}/page/{entity}/` | `{EntityAction}.tsx (e.g., AuctionOrderList.tsx)` | Thin wrapper. Only imports and renders the Container. No hooks, no logic. |
| **Container** | `src/apps/{client}/container/{entity}/{action}/` | `MC{Entity}{Action}Container.tsx (e.g., MCAuctionOrderListContainer.tsx)` | All hooks (data fetching, navigation, i18n, alerts). Computes props for Component. |
| **Component** | `src/apps/{client}/component/{entity}/ or src/common/component/` | `MC{Entity}{View}.tsx (e.g., MCAuctionOrderDetail.tsx)` | Pure UI. Receives all data via props. No data fetching. No navigation. |

---

## Container Naming

**Pattern**: `MC{Entity}{Action}Container.tsx`

**Actions**: List, Create, Edit, Detail

**Examples**: `MCAuctionOrderListContainer.tsx`, `MCAuctionOrderCreateContainer.tsx`, `MCAuctionOrderEditContainer.tsx`, `MCAuctionOrderDetailContainer.tsx`

---

## Build Commands

```bash
# dev
pnpm start:{client}:{env}  (e.g. pnpm start:tving:test)

# build
pnpm build:{client}:{env}  (e.g. pnpm build:msm-default:prod)

# lint
pnpm lint

# format
pnpm format

# typecheck
pnpm typecheck

```

---

## Environment Variables

- **Prefix**: `VITE_`
- **Access**: `import.meta.env.VITE_*`
- **Files**: `.env.test`, `.env.staging`, `.env.prod`
- Each client has separate env files per environment

---

## Supported Clients

- `tving`
- `msm-default`
- `shortmax`
- `onboard-demo`
