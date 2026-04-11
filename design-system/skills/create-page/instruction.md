# Domain Knowledge: Create Page

## The 3-Layer Architecture — Why It Exists

Every feature uses exactly three layers. This is not optional.

| Layer | File location | Rule |
|-------|---------------|------|
| Page | `src/apps/{client}/page/{entity}/` | Thin wrapper only. Zero hooks, zero logic. |
| Container | `src/apps/{client}/container/{entity}/{action}/` | All data, state, and business logic. |
| Component | `src/apps/{client}/component/{entity}/` or `src/common/component/` | Pure UI. All data via props. |

**Why**: Separating concerns makes components testable in isolation, containers swappable, and pages trivially simple. Breaking this pattern creates tightly coupled code that is hard to test and hard to reuse.

## Page Layer Rules

```tsx
// Correct — the entire file
import MC{Entity}ListContainer from '@msm-portal/{client}/container/{entity}/list/MC{Entity}ListContainer';
const {Entity}List = () => <MC{Entity}ListContainer />;
export default {Entity}List;
```

Pages must never contain:
- `useState`, `useEffect`, or any other hook
- Props passed to the container
- Business logic or conditionals
- Direct data fetching

## Container Layer Rules

Containers own:
- `useTranslation` — all i18n
- `useNavigate` — all navigation
- `useEntityParam` — all route params
- `useSearchParams` — tab/filter state in URL
- `useInAppAlert` — all error and success feedback
- Data fetching hooks
- `useMemo` for derived/computed values
- `useCallback` for stable callback references

Containers must not contain:
- Styled components
- Direct DOM manipulation
- Inline JSX beyond layout shells (`MCContentLayout`, `MCFormLayout`)

## Component Layer Rules

Components are pure functions of their props. Given the same props, they render the same output.

They must not:
- Import `useNavigate`, `useTranslation`, or any context hook
- Fetch data
- Access route params
- Have side effects

All callbacks (edit button click, delete action, tab change) are passed as props from the container.

## List Page Layout

```tsx
// Container renders this shell; all data props come from hooks
<MCContentLayout title={t('title')} rightAccessory={rightAccessory} showBreadcrumb>
  <MCBarTabs tabs={tabs} />
  {isLoading
    ? <MCCircularLoader fillParent />
    : <MCReportTable columns={columns} rows={rows} />}
</MCContentLayout>
```

- `MCContentLayout` — always the outer shell for content pages
- `MCBarTabs` — tab navigation; active tab stored in `?tab=` search param
- `MCReportTable` — standard data table; columns defined with `useMemo` in container
- Create button lives in `rightAccessory` prop of `MCContentLayout`

## Detail Page Layout

Detail pages use `MCFormPanel` in readonly mode — the same panel components as forms, but with `readonly` prop on all inputs. This creates visual consistency between create/edit and detail views.

```tsx
// In the detail Component (pure UI)
<MCFormPanel>
  <MCFormPanelTitle>{t('section.basicInfo')}</MCFormPanelTitle>
  <MCFormPanelBody>
    <MCFormFieldGroup>
      <MCFormTextInput name="name" fieldLabel={t('field.name')} readonly />
      <MCFormTextInput name="status" fieldLabel={t('field.status')} readonly />
    </MCFormFieldGroup>
  </MCFormPanelBody>
</MCFormPanel>
```

Note: `readonly` inputs still need a `name` prop (used as the HTML `id`), but they do not need a `<Formik>` context because they only read, not write.

## Tab State in URL

Always persist active tab in the URL search params, not in component state:

```tsx
const [searchParams, setSearchParams] = useSearchParams();
const activeTab = searchParams.get('tab') ?? 'available';

const tabs = useMemo(() => [
  { label: t('tab.available'), active: activeTab === 'available', onClick: () => setSearchParams({ tab: 'available' }) },
  { label: t('tab.archived'),  active: activeTab === 'archived',  onClick: () => setSearchParams({ tab: 'archived' }) },
], [activeTab, setSearchParams, t]);
```

This allows browser back/forward and deep-linking to work correctly.

## Loading and Error States — Container Responsibility

The container decides what to render based on data state:

```tsx
// Loading
if (isFetching || !entity) return <MCCircularLoader fillParent />;

// Error (navigate away, show error)
useEffect(() => {
  if (error) {
    fireCollapsibleError({ summary: t('message.read.error'), error });
    navigate(generatePathForRoute(MERouteKey.{ENTITY}_MAIN, params));
  }
}, [error]);

// Success
return <MC{Entity}Detail entity={entity} />;
```

Never put loading spinners or error handling inside the Component layer.

## Navigation Utilities

Always use `generatePathForRoute` — never construct URL strings manually.

```tsx
import { generatePathForRoute } from '@msm-portal/route/utils';
import useEntityParam from '@msm-portal/route/useEntityParam';
import { MERouteKey } from '@msm-portal/route/types';

const params = useEntityParam();

// Navigate to list
navigate(generatePathForRoute(MERouteKey.{ENTITY}_MAIN, params));

// Navigate to detail (include the entity ID)
navigate(generatePathForRoute(MERouteKey.{ENTITY}_DETAIL, { ...params, entityId: entity.id }));
```

## Breadcrumb Configuration

Each route entry in `routeTemplate.tsx` specifies `handle.crumb`.
This crumb key is resolved to a display string via i18n at `route.breadcrumb.{crumb}`.

```ts
// routeTemplate.tsx
{ path: '{entity}', key: MERouteKey.{ENTITY}_MAIN, handle: { crumb: '{entity}.list' },
  children: [
    { path: 'create', key: MERouteKey.{ENTITY}_CREATE, handle: { crumb: '{entity}.create' } },
    { path: ':entityId', key: MERouteKey.{ENTITY}_DETAIL, handle: { crumb: '{entity}.detail' } },
  ]
}
```

```json
// sot-resource.json
{ "route": { "breadcrumb": { "{entity}": { "list": "{Entities}", "create": "New {Entity}", "detail": "{Entity} Detail" } } } }
```

## Multi-client Placement Rule

- Logic reusable across all clients → `src/common/`
- Logic specific to one client → `src/apps/{client}/`
- Default reference client → `msm-default`

When in doubt, start in `msm-default`. Extract to `common` only when a second client needs it.
