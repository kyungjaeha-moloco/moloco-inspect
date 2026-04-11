# Domain Knowledge: Create Form

## Core Rule: All Inputs Must Be Inside Formik

Every form input component (`MCFormTextInput`, `MCFormSingleRichSelect`, etc.) uses `useField(name)` internally.
If rendered outside a `<Formik>` context, they will throw a runtime error.

The `<Formik>` wrapper lives in the **form component** (not the container).
The container only provides `initialValues` and `onSubmit` as props.

## Form Component Selection

| Field type | Component |
|------------|-----------|
| Text | `MCFormTextInput` |
| Number | `MCFormNumberInput` |
| Multi-line text | `MCFormTextArea` |
| Single dropdown | `MCFormSingleRichSelect` |
| Multi dropdown | `MCFormMultiRichSelect` |
| Inline chip multi-select | `MCFormInlineChipRichSelect` |
| Checkbox | `MCFormCheckBox` |
| Toggle / switch | `MCFormSwitchInput` |
| Radio group | `MCFormRadioGroup` |
| Date range | `MCFormDateRangePicker` |
| Date + time range | `MCFormDateTimeRangePicker` |
| Visual card selector | `MCFormCardSelect` |
| Color picker | `MCFormColorInput` |
| Tag / chip input | `MCFormChipInput` |
| Weekly schedule | `MCFormWeeklyTimeTablePicker` |
| Frequency cap | `MCFormOptionalFrequencyInput` |
| Video URL + skip | `MCFormSkippableVideoInput` |

**Never** use `MCSingleTextInput` directly inside a form. Use `MCFormTextInput`.
`MCSingleTextInput` is for non-Formik contexts only (search bars, filters).

## Required vs Optional Fields

- `required={true}` — no label suffix (field is required)
- `required={false}` — shows `(Optional)` suffix on the label
- Omitting `required` — same as `required={false}`

Always pair `required={true}` with a Yup `.required()` call. Never one without the other.

## Field Layout Patterns

```tsx
// Vertical stack (default — use for most fields)
<MCFormFieldGroup>
  <MCFormTextInput name="name" fieldLabel="Name" required />
  <MCFormTextInput name="description" fieldLabel="Description" />
</MCFormFieldGroup>

// Horizontal row — use for logically paired fields (start/end dates, min/max values)
<MCFormFieldGroup $direction="row">
  <MCFormTextInput name="startDate" fieldLabel="Start Date" required />
  <MCFormTextInput name="endDate" fieldLabel="End Date" />
</MCFormFieldGroup>

// Constrained width — use when full-width is visually inappropriate (short codes, IDs)
<MCFormField $width={MEFormFieldWidth.MEDIUM}>
  <MCFormTextInput name="code" fieldLabel="Promo Code" />
</MCFormField>
```

## Create vs Edit Pattern

Use the **same form component** for both create and edit. Distinguish behavior via a `mode` prop.

```tsx
type MTProps = {
  mode: 'create' | 'edit';
  initialValues: MT{Entity}FormValues;
  onSubmit: MTFormikOnSubmit<MT{Entity}FormValues>;
};
```

The container handles the difference:
- Create container: `initialValues` from defaults, mutation = create API
- Edit container: `initialValues` mapped from fetched entity, mutation = update API

## Error and Success Feedback

Always use `useInAppAlert` from `@msm-portal/common/alert/useInAppAlert`.

```tsx
const { fireSuccess, fireCollapsibleError } = useInAppAlert();

// On mutation success
fireSuccess(t('message.create.success'));
navigate(generatePathForRoute(MERouteKey.{ENTITY}_MAIN, params));

// On mutation error (stay on page, show collapsible error bar)
fireCollapsibleError({ summary: t('message.create.error'), error });

// On query error (navigate away)
useEffect(() => {
  if (fetchError) {
    fireCollapsibleError({ summary: t('message.read.error'), error: fetchError });
    handleClose();
  }
}, [fetchError]);
```

Never use `alert()`, `console.error()`, or toast libraries directly.

## Submission Handler Type

Always type the `onSubmit` callback with `MTFormikOnSubmit`:

```tsx
import { MTFormikOnSubmit } from '@msm-portal/common/type/formik';

const handleSubmit: MTFormikOnSubmit<MT{Entity}FormValues> = async (values, { setSubmitting }) => {
  setSubmitting(true);
  try {
    await mutateAsync(values);
    fireSuccess(t('message.create.success'));
    handleClose();
  } catch (error) {
    fireCollapsibleError({ summary: t('message.create.error'), error });
  } finally {
    setSubmitting(false);
  }
};
```

Always call `setSubmitting(false)` in `finally` — Formik does not reset it automatically on error.

## Loading State During Dependency Fetch

When the form depends on remote data (e.g., dropdown options fetched from API):

```tsx
return (
  <MCFormLayout onClose={handleClose}>
    {isLoading ? (
      <MCCircularLoader fillParent />
    ) : (
      <MC{Entity}Form
        mode="create"
        initialValues={initialValues}
        onSubmit={handleSubmit}
        onCancel={handleClose}
        options={options}
      />
    )}
  </MCFormLayout>
);
```

Show the loader at the `MCFormLayout` level so the shell (breadcrumbs, close button) remains visible.

## i18n Namespace Conventions

| Location | Namespace |
|----------|-----------|
| Form component | `form.{entity}` |
| Create container | `container.{entity}.create` |
| Edit container | `container.{entity}.edit` |

Keep field labels and validation messages in `form.{entity}`.
Keep page-level messages (success/error toasts, page title) in the container namespace.

## Route Registration — 3 Locations, Always Together

Adding only 1 or 2 of the 3 locations causes a runtime error or missing route.

1. `MERouteKey` enum — defines the key constant
2. `routeTemplate.tsx` — defines the URL path and breadcrumb handle
3. `route.tsx` — maps the key to a page component and access roles

If you add a route key but forget `routeTemplate.tsx`, navigation will silently produce the wrong URL.
If you forget `route.tsx`, the page will render a 404.

## Breadcrumb Handle

Every route entry in `routeTemplate.tsx` needs a `handle.crumb` key.
The crumb value is an i18n key looked up under `route.breadcrumb.*`.

```ts
{ path: 'create', key: MERouteKey.{ENTITY}_CREATE, handle: { crumb: '{entity}.create' } }
```

Add the matching i18n key:
```json
{ "route": { "breadcrumb": { "{entity}": { "create": "New {Entity}" } } } }
```
