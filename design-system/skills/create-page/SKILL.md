# Skill: Create Page

**Purpose**: Build a complete page following the Page → Container → Component architecture.
**Read first**: `instruction.md` in this directory.

---

## Page Type Workflows

Choose the workflow matching the page type you are building:
- [List page](#list-page)
- [Detail page](#detail-page)
- [Create page](#create-page) — see `create-form/SKILL.md`
- [Edit page](#edit-page) — see `create-form/SKILL.md`

---

## List Page

### Step 1 — Read the list-page pattern
Read `design-system/src/patterns.json`, locate the `list-page` entry.
Copy the pattern as your starting point.

### Step 2 — Create the Component
Location: `src/apps/{client}/component/{entity}/list/MC{Entity}List.tsx`

Props the component receives from the container:
- `items: MT{Entity}[]`
- `isLoading: boolean`
- `tabs: MTBarTab[]`
- `rightAccessory: ReactNode`
- `title: string`
- Column definitions for `MCReportTable`

The component renders:
```tsx
<MCContentLayout title={title} rightAccessory={rightAccessory} showBreadcrumb>
  <MCBarTabs tabs={tabs} />
  {isLoading ? <MCCircularLoader fillParent /> : <MCReportTable ... />}
</MCContentLayout>
```

### Step 3 — Create the Container
Location: `src/apps/{client}/container/{entity}/list/MC{Entity}ListContainer.tsx`

Container handles:
- `useTranslation` for all labels
- `useEntityParam` for route params
- `useNavigate` for the create button
- `useSearchParams` for active tab state
- Data fetching hook call
- `useMemo` for column definitions
- `useCallback` for action handlers
- Renders `<MC{Entity}List>` with all computed props

### Step 4 — Create the Page
Location: `src/apps/{client}/page/{entity}/{Entity}List.tsx`

```tsx
import MC{Entity}ListContainer from '@msm-portal/{client}/container/{entity}/list/MC{Entity}ListContainer';
const {Entity}List = () => <MC{Entity}ListContainer />;
export default {Entity}List;
```

### Step 5 — Register the route
Add to all 3 route locations (see `create-form/SKILL.md` Step 8 for the 3-location pattern).
Add `{ENTITY}_MAIN` to `MERouteKey`.

### Step 6 — Add i18n keys
```json
{
  "container": {
    "{entity}": {
      "list": {
        "title": "{Entity} List",
        "create": "Create {Entity}",
        "tab": { "available": "Available", "archived": "Archived" },
        "column": { "name": "Name", "status": "Status", "createdAt": "Created" },
        "message": { "read.error": "Failed to load {entity} list." }
      }
    }
  }
}
```

---

## Detail Page

### Step 1 — Read the detail-page pattern
Read `design-system/src/patterns.json`, locate the `detail-page` entry.

### Step 2 — Create the Component
Location: `src/apps/{client}/component/{entity}/detail/MC{Entity}Detail.tsx`

Props: the full entity object as a single typed prop.
Render with `MCFormPanel` sections in readonly mode:
```tsx
<MCFormPanel>
  <MCFormPanelTitle>Basic Information</MCFormPanelTitle>
  <MCFormPanelBody>
    <MCFormFieldGroup>
      <MCFormTextInput name="name" fieldLabel="Name" readonly />
    </MCFormFieldGroup>
  </MCFormPanelBody>
</MCFormPanel>
```

### Step 3 — Create the Container
Location: `src/apps/{client}/container/{entity}/detail/MC{Entity}DetailContainer.tsx`

Container must:
1. Extract `{entityId}` from `useEntityParam()`
2. Call the data-fetching hook
3. Handle `error` with `fireCollapsibleError` + `navigate(-1)` in `useEffect`
4. Show `<MCCircularLoader fillParent />` while `isFetching || !entity`
5. Render `<MC{Entity}Detail {entity}={entity} />` when data is ready

### Step 4 — Create the Page
Location: `src/apps/{client}/page/{entity}/{Entity}Detail.tsx`

```tsx
import MC{Entity}DetailContainer from '@msm-portal/{client}/container/{entity}/detail/MC{Entity}DetailContainer';
const {Entity}Detail = () => <MC{Entity}DetailContainer />;
export default {Entity}Detail;
```

### Step 5 — Register the route
Add `{ENTITY}_DETAIL` to `MERouteKey`.
Add `:entityId` child route in `routeTemplate.tsx`.
Map page in `route.tsx`.

### Step 6 — Add i18n keys
```json
{
  "container": {
    "{entity}": {
      "detail": {
        "title": "{Entity} Detail",
        "message": { "read.error": "Failed to load {entity} details." }
      }
    }
  }
}
```

---

## Create / Edit Pages

For create and edit pages, follow `create-form/SKILL.md` in its entirety.
The page layer for create/edit is a thin wrapper — same pattern as list and detail.
