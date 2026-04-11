<!-- AUTO-GENERATED — Do not edit directly. Edit src/patterns.json then run: node generate.mjs -->

# Patterns

> Common composition patterns for the MSM Portal.

---

## Basic Form Pattern

Standard Formik form with panels, field groups, and actions.

**When to use**: Any form that collects user input

```tsx
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import {
  MCFormPanel, MCFormPanelTitle, MCFormPanelBody,
  MCFormFieldGroup, MCFormActions,
} from '@msm-portal/common/component/form/shared';
import MCFormTextInput from '@msm-portal/common/component/form/v1/input/MCFormTextInput';
import { MCButton2 } from '@moloco/moloco-cloud-react-ui';

const schema = Yup.object({ name: Yup.string().required() });

export default function MyForm() {
  return (
    <Formik initialValues={{ name: '' }} validationSchema={schema} onSubmit={handleSubmit}>
      {({ isSubmitting }) => (
        <Form>
          <MCFormPanel>
            <MCFormPanelTitle>Basic Info</MCFormPanelTitle>
            <MCFormPanelBody>
              <MCFormFieldGroup>
                <MCFormTextInput name="name" fieldLabel="Name" required />
              </MCFormFieldGroup>
            </MCFormPanelBody>
          </MCFormPanel>
          <MCFormActions>
            <MCButton2 onClick={handleCancel}>Cancel</MCButton2>
            <MCButton2 variant="contained" type="submit" disabled={isSubmitting}>Save</MCButton2>
          </MCFormActions>
        </Form>
      )}
    </Formik>
  );
}
```

---

## Full-Page Form Pattern

Use MCFormLayout for full-screen form pages with header breadcrumbs and footer actions.

**When to use**: Creating or editing entities that need their own page (campaigns, ads, etc.)

```tsx
import MCFormLayout from '@msm-portal/common/component/form/layout/MCFormLayout';
import { MCFormActions } from '@msm-portal/common/component/form/shared';
import { MCButton2 } from '@moloco/moloco-cloud-react-ui';

export default function CreatePage() {
  return (
    <MCFormLayout
      breadCrumbs={[{ type: 'Campaign', title: 'Campaigns' }, { title: 'New Campaign' }]}
      onClose={() => navigate(-1)}
      footerContent={
        <MCFormActions>
          <MCButton2 onClick={() => navigate(-1)}>Cancel</MCButton2>
          <MCButton2 variant="contained" type="submit">Create</MCButton2>
        </MCFormActions>
      }
    >
      <Formik ...>
        <Form><MCFormPanel>...</MCFormPanel></Form>
      </Formik>
    </MCFormLayout>
  );
}
```

---

## Styled Component Pattern

Always use styled-components with theme tokens. Never hardcode values or use inline styles.

**Rules:**
- Always use SC prefix for internal styled components
- Use $ prefix on props that must NOT be forwarded to the DOM (transient props)
- Never hardcode color, spacing, or typography values
- Never use inline styles

```tsx
import styled from 'styled-components';

// ✅ Correct
const SCContainer = styled.div<{ $isActive: boolean }>`
  padding: ${(props) => props.theme.mcui.spacing(2)};
  background: ${
    (props) => props.$isActive
      ? props.theme.mcui.palette.background.tertiary
      : props.theme.mcui.palette.background.primary
  };
  color: ${(props) => props.theme.mcui.palette.content.primary};
`;

// ❌ Wrong
const SCContainer = styled.div`
  padding: 16px;
  background: #ffffff;
`;

// ❌ Wrong
<div style={{ padding: 16 }} />
```

---

## Action Button Pattern

Per-row actions in tables and lists using MCMoreActionsButton.

**When to use**: Table rows or list items need contextual actions

```tsx
import MCMoreActionsButton from '@msm-portal/common/component/button/MCMoreActionsButton';
import { MCIcon } from '@moloco/moloco-cloud-react-ui';

const actions = [
  { label: 'Edit',   icon: 'edit'  as MTIcon, onClick: () => navigate(`/edit/${id}`) },
  { label: 'Delete', icon: 'trash' as MTIcon, onClick: () => setDeleteOpen(true) },
];

<MCMoreActionsButton variant="text" noPadding moreActionItems={actions}>
  <MCIcon icon="ellipsis-v" width={16} height={16} />
</MCMoreActionsButton>
```

---

## Delete Confirmation Dialog Pattern

Standard confirmation dialog for destructive actions.

```tsx
import MCCommonDialog from '@msm-portal/common/component/dialog/common-dialog/MCCommonDialog';
import { MCButton2 } from '@moloco/moloco-cloud-react-ui';

const [deleteOpen, setDeleteOpen] = useState(false);

<MCCommonDialog
  open={deleteOpen}
  onClose={() => setDeleteOpen(false)}
  title="Delete Campaign"
  showDivider
  actions={
    <>
      <MCButton2 onClick={() => setDeleteOpen(false)}>Cancel</MCButton2>
      <MCButton2 variant="contained" onClick={handleDelete}>Delete</MCButton2>
    </>
  }
>
  Are you sure you want to delete "{name}"? This action cannot be undone.
</MCCommonDialog>
```

---

## Field Layout Pattern

Control field width and group direction.

```tsx
import { MCFormFieldGroup, MCFormField, MEFormFieldWidth } from '@msm-portal/common/component/form/shared';

// Vertical stack (default)
<MCFormFieldGroup>
  <MCFormTextInput name="firstName" fieldLabel="First Name" required />
  <MCFormTextInput name="lastName" fieldLabel="Last Name" required />
</MCFormFieldGroup>

// Horizontal row
<MCFormFieldGroup $direction="row">
  <MCFormTextInput name="startDate" fieldLabel="Start Date" required />
  <MCFormTextInput name="endDate" fieldLabel="End Date" />
</MCFormFieldGroup>

// Reduced width field
<MCFormField $width={MEFormFieldWidth.MEDIUM}>
  <MCFormTextInput name="code" fieldLabel="Promo Code" />
</MCFormField>
```

---

## Tab Navigation Pattern

Tab-based content switching within a page.

```tsx
import MCBarTabs from '@msm-portal/common/component/tab/bar-tab/MCBarTabs';

const [activeTab, setActiveTab] = useState('overview');

<MCBarTabs
  tabs={[
    { label: 'Overview', active: activeTab === 'overview', onClick: () => setActiveTab('overview') },
    { label: 'Analytics', active: activeTab === 'analytics', onClick: () => setActiveTab('analytics') },
  ]}
/>

{activeTab === 'overview' && <OverviewPanel />}
{activeTab === 'analytics' && <AnalyticsPanel />}
```

---

## tRPC Data Fetching Pattern

Type-safe data fetching with tRPC and TanStack React Query.

```tsx
import { trpc } from '@msm-portal/common/trpc/trpc';

// Query
const { data, isLoading } = trpc.campaign.list.useQuery({ status: 'active' });
if (isLoading) return <MCLoader />;

// Mutation
const createCampaign = trpc.campaign.create.useMutation({
  onSuccess: () => {
    queryClient.invalidateQueries(['campaign.list']);
    navigate('/campaigns');
  },
});
await createCampaign.mutateAsync({ name: 'My Campaign' });
```

---

## Provider Stack

Full provider hierarchy at app root. Order matters.

**Provider order:**
1. ReactQueryProvider
1. FeatureGuardProvider
1. AuthProvider
1. MCTRPCProvider
1. AppConfigProvider
1. MCI18nProvider
1. CustomProvider (client-specific)
1. ThemeProvider (styled-components)
1. MCGlobalStyle
1. MCInAppAlertProvider
1. MCRootLayout

---

## List Page Pattern

Standard list page with title, create button, tabs, and content area. Uses MCContentLayout.

**When to use**: Building a page that lists entities with tabs and a create button

```tsx
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { MCButton2 } from '@moloco/moloco-cloud-react-ui';

import MCContentLayout from '@msm-portal/common/component/layout/content/MCContentLayout';
import MCBarTabs, { MTBarTab } from '@msm-portal/common/component/tab/bar-tab/MCBarTabs';
import { MERouteKey } from '@msm-portal/route/types';
import useEntityParam from '@msm-portal/route/useEntityParam';
import { generatePathForRoute } from '@msm-portal/route/utils';

const MC{Entity}ListContainer = () => {
  const params = useEntityParam();
  const navigate = useNavigate();
  const { t } = useTranslation('container.{entity}.list');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'available';

  const tabs: Array<MTBarTab> = useMemo(() => [
    { label: t('tab.available'), active: activeTab === 'available', onClick: () => setSearchParams({ tab: 'available' }) },
    { label: t('tab.archived'), active: activeTab === 'archived', onClick: () => setSearchParams({ tab: 'archived' }) },
  ], [activeTab, setSearchParams, t]);

  const handleCreate = useCallback(() => {
    navigate(generatePathForRoute(MERouteKey.{ENTITY}_CREATE, params));
  }, [navigate, params]);

  const rightAccessory = useMemo(() => (
    <MCButton2 color="primary" onClick={handleCreate} leftIcon="create">{t('create')}</MCButton2>
  ), [handleCreate, t]);

  return (
    <MCContentLayout title={t('title')} rightAccessory={rightAccessory} showBreadcrumb>
      <MCBarTabs tabs={tabs} />
      {activeTab === 'available' && <MCAvailable{Entity}ListContainer />}
      {activeTab === 'archived' && <MCArchived{Entity}ListContainer />}
    </MCContentLayout>
  );
};

export default MC{Entity}ListContainer;
```

---

## Detail Page Pattern

Entity detail page with dependent queries, loading/error states, and a presentation component.

**When to use**: Building a page that shows entity details fetched from API

```tsx
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { MCCircularLoader } from '@moloco/moloco-cloud-react-ui';

import useInAppAlert from '@msm-portal/common/alert/useInAppAlert';
import { MERouteKey } from '@msm-portal/route/types';
import useEntityParam from '@msm-portal/route/useEntityParam';
import { generatePathForRoute } from '@msm-portal/route/utils';

import MC{Entity}Detail from '@msm-portal/{client}/component/{entity}/detail/MC{Entity}Detail';
import use{Entity} from '@msm-portal/{client}/hook/{entity}/use{Entity}';

const MC{Entity}DetailContainer = () => {
  const navigate = useNavigate();
  const params = useEntityParam();
  const {entityId} = params.{entityId} ?? '';
  const { t } = useTranslation('container.{entity}.detail');
  const { fireCollapsibleError } = useInAppAlert();

  const {
    data: entity,
    query: { isFetching, error },
  } = use{Entity}({ {entityId} });

  const handleClose = useCallback(() => {
    navigate(generatePathForRoute(MERouteKey.{ENTITY}_MAIN, params));
  }, [navigate, params]);

  useEffect(() => {
    if (error) {
      fireCollapsibleError({ summary: t('message.read.error'), error });
      handleClose();
    }
  }, [error, fireCollapsibleError, handleClose, t]);

  return isFetching || !entity
    ? <MCCircularLoader fillParent />
    : <MC{Entity}Detail {entity}={entity} />;
};

export default MC{Entity}DetailContainer;
```

---

## Create Page Pattern

Entity creation form with MCFormLayout, Formik, mutation, navigation, and error handling.

**When to use**: Building a page to create a new entity

```tsx
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { MCCircularLoader } from '@moloco/moloco-cloud-react-ui';

import useInAppAlert from '@msm-portal/common/alert/useInAppAlert';
import msmAPI from '@msm-portal/common/api/msm';
import MCFormLayout from '@msm-portal/common/component/form/layout/MCFormLayout';
import { MTFormikOnSubmit } from '@msm-portal/common/type/formik';
import { MERouteKey } from '@msm-portal/route/types';
import useEntityParam from '@msm-portal/route/useEntityParam';
import { generatePathForRoute } from '@msm-portal/route/utils';

const MC{Entity}CreateContainer = () => {
  const { t } = useTranslation('form.{entity}');
  const params = useEntityParam();
  const navigate = useNavigate();
  const { fireSuccess, fireCollapsibleError } = useInAppAlert();

  // Data fetching for form dependencies
  const { data: deps, query: { isLoading, error } } = useDependencies();

  // Mutation
  const { mutateAsync: createEntity } = msmAPI.query.useCreate{Entity}();

  const initialValues = useMemo(() => ({
    // ... compute from deps
  }), [deps]);

  const handleClose = useCallback(() => {
    navigate(generatePathForRoute(MERouteKey.{ENTITY}_MAIN, params));
  }, [navigate, params]);

  const handleSubmit: MTFormikOnSubmit<MT{Entity}FormValues> = useCallback(
    async (values, { setSubmitting }) => {
      setSubmitting(true);
      try {
        await createEntity({ ...values });
        fireSuccess(t('message.create.success'));
        handleClose();
      } catch (error) {
        fireCollapsibleError({ summary: t('message.create.error'), error });
      } finally {
        setSubmitting(false);
      }
    },
    [createEntity, fireSuccess, fireCollapsibleError, handleClose, t],
  );

  useEffect(() => {
    if (error) {
      fireCollapsibleError({ summary: t('message.read.error'), error });
      handleClose();
    }
  }, [error, fireCollapsibleError, handleClose, t]);

  return (
    <MCFormLayout onClose={handleClose}>
      {isLoading ? (
        <MCCircularLoader fillParent />
      ) : (
        <MC{Entity}Form
          mode="create"
          initialValues={initialValues}
          onSubmit={handleSubmit}
        />
      )}
    </MCFormLayout>
  );
};

export default MC{Entity}CreateContainer;
```

---

## Page → Container → Component Architecture

Mandatory 3-layer separation. Page is a thin wrapper, Container handles data/logic, Component is pure UI.

**When to use**: Every new feature MUST follow this pattern

**Rules:**
- Page: Only imports and renders the Container. No hooks, no logic, no props.
- Container: All hooks (data fetching, navigation, i18n, alerts). Computes props for Component.
- Component: Pure UI. Receives all data via props. No data fetching. No navigation.

```tsx
// ─── Page (src/apps/msm-default/page/auction-order/AuctionOrderList.tsx) ───
import MCAuctionOrderListContainer from '@msm-portal/msm-default/container/auction-order/list/MCAuctionOrderListContainer';

const AuctionOrderList = () => <MCAuctionOrderListContainer />;
export default AuctionOrderList;

// ─── Container (src/apps/msm-default/container/auction-order/list/MCAuctionOrderListContainer.tsx) ───
// All hooks, data fetching, state, callbacks here
const MCAuctionOrderListContainer = () => {
  const { data } = useAuctionOrders();
  const { t } = useTranslation('container.auctionOrder.list');
  // ... business logic
  return <MCContentLayout ...><MCBarTabs .../>{content}</MCContentLayout>;
};

// ─── Component (src/apps/msm-default/component/auction-order/detail/MCAuctionOrderDetail.tsx) ───
// Pure UI, all data via props
type MTProps = { auctionOrder: MTAuctionOrder };
const MCAuctionOrderDetail = ({ auctionOrder }: MTProps) => {
  return (
    <MCFormPanel>...</MCFormPanel>
  );
};
```

---

## Edit Page Pattern

Entity edit form that fetches existing data, pre-populates the form, and performs an update mutation.

**When to use**: Building a page to edit an existing entity

**Rules:**
- Always fetch entity data before rendering the form
- Show MCCircularLoader while data is loading
- Navigate to detail page on success (not list page, unlike create)
- Use 'message.update.success' / 'message.update.error' for i18n keys
- Reuse the same Form component as create with a mode='edit' prop
- Map entity API response to form initialValues in useMemo

```tsx
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { MCCircularLoader } from '@moloco/moloco-cloud-react-ui';

import useInAppAlert from '@msm-portal/common/alert/useInAppAlert';
import msmAPI from '@msm-portal/common/api/msm';
import MCFormLayout from '@msm-portal/common/component/form/layout/MCFormLayout';
import { MTFormikOnSubmit } from '@msm-portal/common/type/formik';
import { MERouteKey } from '@msm-portal/route/types';
import useEntityParam from '@msm-portal/route/useEntityParam';
import { generatePathForRoute } from '@msm-portal/route/utils';

import use{Entity} from '@msm-portal/{client}/hook/{entity}/use{Entity}';

const MC{Entity}EditContainer = () => {
  const { t } = useTranslation('form.{entity}');
  const params = useEntityParam();
  const {entityId} = params.{entityId} ?? '';
  const navigate = useNavigate();
  const { fireSuccess, fireCollapsibleError } = useInAppAlert();

  // Fetch existing entity data
  const {
    data: entity,
    query: { isLoading, error: fetchError },
  } = use{Entity}({ {entityId} });

  // Update mutation
  const { mutateAsync: updateEntity } = msmAPI.query.useUpdate{Entity}();

  // Convert fetched entity to form initial values
  const initialValues = useMemo(() => {
    if (!entity) return undefined;
    return {
      name: entity.name,
      // ... map entity fields to form values
    };
  }, [entity]);

  const handleClose = useCallback(() => {
    navigate(generatePathForRoute(MERouteKey.{ENTITY}_DETAIL, {
      ...params,
      {entityId},
    }));
  }, [navigate, params, {entityId}]);

  const handleSubmit: MTFormikOnSubmit<MT{Entity}FormValues> = useCallback(
    async (values, { setSubmitting }) => {
      setSubmitting(true);
      try {
        await updateEntity({ {entityId}, ...values });
        fireSuccess(t('message.update.success'));
        handleClose();
      } catch (error) {
        fireCollapsibleError({ summary: t('message.update.error'), error });
      } finally {
        setSubmitting(false);
      }
    },
    [updateEntity, {entityId}, fireSuccess, fireCollapsibleError, handleClose, t],
  );

  useEffect(() => {
    if (fetchError) {
      fireCollapsibleError({ summary: t('message.read.error'), error: fetchError });
      handleClose();
    }
  }, [fetchError, fireCollapsibleError, handleClose, t]);

  return (
    <MCFormLayout onClose={handleClose}>
      {isLoading || !initialValues ? (
        <MCCircularLoader fillParent />
      ) : (
        <MC{Entity}Form
          mode="edit"
          initialValues={initialValues}
          onSubmit={handleSubmit}
        />
      )}
    </MCFormLayout>
  );
};

export default MC{Entity}EditContainer;
```

---

## Error Handling Pattern

Standard error handling with useInAppAlert for both query errors and mutation errors.

**When to use**: Any container that fetches data or performs mutations

```tsx
import useInAppAlert from '@msm-portal/common/alert/useInAppAlert';

const { fireSuccess, fireCollapsibleError } = useInAppAlert();

// ── Query error (navigate away) ──
useEffect(() => {
  if (fetchError) {
    fireCollapsibleError({
      summary: t('message.read.error'),
      error: fetchError,
    });
    handleClose();
  }
}, [fetchError, fireCollapsibleError, handleClose, t]);

// ── Mutation success ──
fireSuccess(t('message.create.success'));

// ── Mutation error (stay on page) ──
try {
  await mutateAsync(data);
} catch (error) {
  fireCollapsibleError({ summary: t('message.create.error'), error });
}
```

---

## Loading State Pattern

Standard loading indicators for different contexts.

**When to use**: Any async data fetching

```tsx
import { MCCircularLoader } from '@moloco/moloco-cloud-react-ui';
import MCLoader from '@msm-portal/common/component/loader/MCLoader';

// Full-page loading (containers)
if (isLoading) return <MCCircularLoader fillParent />;

// Inline loading (within a section)
if (isLoading) return <MCLoader />;

// Conditional rendering pattern
return isFetching || !data
  ? <MCCircularLoader fillParent />
  : <MC{Entity}Detail {entity}={data} />;
```

---

## Route Registration Pattern

3-step process to register a new route. All three files MUST be updated together.

**When to use**: Adding any new page to the application

**Rules:**
- Step 1: Add enum value to MERouteKey in src/route/types.ts
- Step 2: Add route entry in src/app-builder/route/template/routeTemplate.tsx with path and handle (breadcrumb)
- Step 3: Map component in src/apps/{client}/config/route.tsx with allowedRoles

```tsx
// ─── Step 1: src/route/types.ts ───
export enum MERouteKey {
  // ... existing keys
  {ENTITY}_MAIN = '{ENTITY}_MAIN',
  {ENTITY}_CREATE = '{ENTITY}_CREATE',
  {ENTITY}_DETAIL = '{ENTITY}_DETAIL',
  {ENTITY}_EDIT = '{ENTITY}_EDIT',
}

// ─── Step 2: src/app-builder/route/template/routeTemplate.tsx ───
// Add route with path and breadcrumb handle
{
  path: '{entity}',
  key: MERouteKey.{ENTITY}_MAIN,
  handle: { crumb: '{entity}.list' },
  children: [
    { path: 'create', key: MERouteKey.{ENTITY}_CREATE, handle: { crumb: '{entity}.create' } },
    { path: ':entityId', key: MERouteKey.{ENTITY}_DETAIL, handle: { crumb: '{entity}.detail' } },
    { path: ':entityId/edit', key: MERouteKey.{ENTITY}_EDIT, handle: { crumb: '{entity}.edit' } },
  ],
}

// ─── Step 3: src/apps/msm-default/config/route.tsx ───
import {Entity}List from '@msm-portal/msm-default/page/{entity}/{Entity}List';
import {Entity}Create from '@msm-portal/msm-default/page/{entity}/{Entity}Create';
import {Entity}Detail from '@msm-portal/msm-default/page/{entity}/{Entity}Detail';
import {Entity}Edit from '@msm-portal/msm-default/page/{entity}/{Entity}Edit';

// In the route map:
{ key: MERouteKey.{ENTITY}_MAIN, element: <{Entity}List />, allowedRoles: [MEUserRoleType.AD_OPS] },
{ key: MERouteKey.{ENTITY}_CREATE, element: <{Entity}Create />, allowedRoles: [MEUserRoleType.AD_OPS] },
{ key: MERouteKey.{ENTITY}_DETAIL, element: <{Entity}Detail />, allowedRoles: [MEUserRoleType.AD_OPS] },
{ key: MERouteKey.{ENTITY}_EDIT, element: <{Entity}Edit />, allowedRoles: [MEUserRoleType.AD_OPS] },
```

---

## i18n Usage Pattern

Internationalization with react-i18next. All user-facing strings MUST use i18n.

**When to use**: Any component or container with user-facing text

**Rules:**
- Namespace convention: 'container.{entity}.{action}' for containers, 'form.{entity}' for forms
- Resource files: src/i18n/assets/{lang}/sot-resource.json
- Client-specific resources: src/i18n/assets/{lang}/{client}.json
- Use t() for simple strings, <Trans> for JSX interpolation
- Breadcrumb i18n key: route.breadcrumb.{crumb}

```tsx
import { useTranslation } from 'react-i18next';
import { Trans } from 'react-i18next';

// Basic usage
const { t } = useTranslation('container.auctionOrder.list');
<h1>{t('title')}</h1>
<MCButton2>{t('create')}</MCButton2>

// With interpolation
{t('message.deleteConfirm', { name: entity.name })}

// JSX interpolation
<Trans i18nKey="container.entity.richText" t={t}>
  Click <SCClickableText>here</SCClickableText> to continue.
</Trans>

// Resource file structure (sot-resource.json):
// {
//   "container": {
//     "auctionOrder": {
//       "list": {
//         "title": "Auction Orders",
//         "create": "Create Auction Order",
//         "tab": { "available": "Available", "draft": "Draft", "archived": "Archived" }
//       }
//     }
//   }
// }
```

---

## Accessibility Pattern

Standard accessibility practices for MSM Portal. All interactive components must be keyboard accessible and screen reader compatible.

**When to use**: Every component and page must follow these practices

**Rules:**
- All interactive elements must be reachable via Tab key
- All actions must be triggerable via keyboard (Enter/Space for buttons, Arrow keys for lists)
- Focus must be visible — never remove outline without providing alternative focus indicator
- Dialogs must trap focus and return focus to trigger on close
- Form fields must have associated labels via htmlFor or aria-label
- Error messages must be linked via aria-describedby
- Dynamic content updates must use aria-live regions
- Color must not be the only way to convey information
- All images and icons must have alt text or aria-hidden if decorative
- Touch targets must be at least 44×44px (WCAG 2.5.8)

```tsx
// ── Focus Management in Dialogs ──
import { useRef, useEffect } from 'react';

const dialogRef = useRef<HTMLDivElement>(null);
const triggerRef = useRef<HTMLButtonElement>(null);

// Trap focus inside dialog
useEffect(() => {
  if (open && dialogRef.current) {
    const focusable = dialogRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length) (focusable[0] as HTMLElement).focus();
  }
  // Return focus on close
  return () => {
    if (!open && triggerRef.current) triggerRef.current.focus();
  };
}, [open]);

// ── Error announcement ──
<MCFormField>
  <MCFormTextInput
    name="email"
    fieldLabel="Email"
    required
    // Error linked via aria-describedby automatically by MCFormFieldError
  />
  {/* MCFormFieldError renders with role='alert' for screen reader announcement */}
</MCFormField>

// ── Skip link ──
<a href="#main-content" className="sr-only focus:not-sr-only">
  Skip to main content
</a>
```

---

## Navigation Pattern

Route navigation using generatePathForRoute and useEntityParam.

**When to use**: Navigating between pages

```tsx
import { useNavigate } from 'react-router-dom';
import { MERouteKey } from '@msm-portal/route/types';
import useEntityParam from '@msm-portal/route/useEntityParam';
import { generatePathForRoute } from '@msm-portal/route/utils';

const navigate = useNavigate();
const params = useEntityParam();

// Navigate to a route
const path = generatePathForRoute(MERouteKey.{ENTITY}_DETAIL, {
  ...params,
  entityId: entity.id,
});
navigate(path);

// Navigate back
navigate(-1);

// Navigate with query params
const listPath = generatePathForRoute(MERouteKey.{ENTITY}_MAIN, params);
navigate(`${listPath}?tab=draft`);
```

---

