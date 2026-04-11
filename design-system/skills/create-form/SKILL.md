# Skill: Create Form

**Purpose**: Build a complete form page with Formik, validation, container, and route registration.
**Read first**: `instruction.md` in this directory.

---

## Steps

### Step 1 — Read form patterns
Read `design-system/src/patterns.json`.
Locate the `form-basic` and `form-full-page` pattern entries.
Determine which pattern applies:
- Embedded form within a page → `form-basic`
- Standalone full-screen form page → `form-full-page`

### Step 2 — Read available form components
Read `design-system/src/components.json`.
Scan the "Form Inputs (v1)" category.
Identify the exact component for each field type in your form (see the decision tree in `design-system/AGENTS.md`).

### Step 3 — Read conventions
Read `design-system/src/conventions.json`.
Note the `formComponentRules` array and `directoryStructure.formPattern`.

### Step 4 — Define the Yup validation schema
Write the schema before writing any JSX.
Every required field must have `.required()` with an i18n-compatible message key.
Every constrained field (max length, email format, URL) must have the matching Yup method.

```ts
const schema = Yup.object({
  name: Yup.string().required('form.entity.error.name.required').max(100),
  url:  Yup.string().url('form.entity.error.url.invalid').required(),
});
```

### Step 5 — Create the form component
Location: `src/apps/{client}/component/{entity}/form/MC{Entity}Form.tsx`

Structure:
```tsx
type MTProps = {
  mode: 'create' | 'edit';
  initialValues: MT{Entity}FormValues;
  onSubmit: MTFormikOnSubmit<MT{Entity}FormValues>;
  onCancel: () => void;
  // dependencies for dropdowns, etc.
};
```

Inside the component:
- Wrap everything in `<Formik initialValues={...} validationSchema={schema} onSubmit={onSubmit}>`
- Use `<MCFormPanel>` + `<MCFormPanelTitle>` + `<MCFormPanelBody>` for each section
- Use `<MCFormFieldGroup>` to group related fields
- Add `$direction="row"` on `MCFormFieldGroup` for side-by-side fields
- Use `<MCFormField $width={MEFormFieldWidth.MEDIUM}>` to constrain individual field widths
- Place `<MCFormActions>` at the bottom with Cancel and Submit buttons

### Step 6 — Create the container
For **create**: `src/apps/{client}/container/{entity}/create/MC{Entity}CreateContainer.tsx`
For **edit**: `src/apps/{client}/container/{entity}/edit/MC{Entity}EditContainer.tsx`

Container must:
1. Fetch any dependencies needed by the form (dropdowns, related entities)
2. Show `<MCCircularLoader fillParent />` while loading
3. Define `handleSubmit` with `MTFormikOnSubmit<MT{Entity}FormValues>` signature
4. Call `fireSuccess(t('message.create.success'))` on mutation success
5. Call `fireCollapsibleError({ summary: t('message.create.error'), error })` on failure
6. Navigate away on success via `generatePathForRoute`
7. For edit: fetch the existing entity and map it to `initialValues` in `useMemo`

### Step 7 — Create the page
Location: `src/apps/{client}/page/{entity}/{Entity}Create.tsx`

```tsx
import MC{Entity}CreateContainer from '@msm-portal/{client}/container/{entity}/create/MC{Entity}CreateContainer';
const {Entity}Create = () => <MC{Entity}CreateContainer />;
export default {Entity}Create;
```

No hooks. No logic. No props.

### Step 8 — Register the route (3 locations, all required)

**Location 1** — `src/route/types.ts`:
Add enum values to `MERouteKey`:
```ts
{ENTITY}_CREATE = '{ENTITY}_CREATE',
{ENTITY}_EDIT   = '{ENTITY}_EDIT',
```

**Location 2** — `src/app-builder/route/template/routeTemplate.tsx`:
Add route entries with `path`, `key`, and `handle.crumb`.

**Location 3** — `src/apps/{client}/config/route.tsx`:
Map the page component with `allowedRoles`.

### Step 9 — Add i18n keys
Open `src/i18n/assets/en/sot-resource.json` (and any other locale files).
Add keys under `form.{entity}`:
```json
{
  "form": {
    "{entity}": {
      "section.basicInfo": "Basic Information",
      "field.name": "Name",
      "field.name.hint": "Used as the display name",
      "message.create.success": "Created successfully.",
      "message.create.error": "Failed to create. Please try again.",
      "message.update.success": "Updated successfully.",
      "message.update.error": "Failed to update. Please try again.",
      "message.read.error": "Failed to load data."
    }
  }
}
```

### Step 10 — Self-validate
Run the 16-point checklist from `review-component/instruction.md`.
Confirm:
- All inputs are inside `<Formik>`
- All labels use i18n
- Route is registered in all 3 locations
- Error and success alerts use the correct hooks
