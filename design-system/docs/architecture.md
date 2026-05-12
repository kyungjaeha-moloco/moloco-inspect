# Component Architecture

> MSM Portal UI is built from 3 layers. Anyone modifying code or creating a new component must understand this structure.

---

## Layer structure

```
Layer 1: @moloco/moloco-cloud-react-ui (v0.0.123)
         GitHub: moloco/moloco-cloud-react-library
         └── UI primitives (MCButton, MCSingleTextInput, MCSelect, MCDatePicker...)
             No Formik. Built on styled-components + theme.

Layer 2: @msm-portal/common/component/*
         GitHub: moloco/msm-portal → js/msm-portal-web/src/common/component/
         └── Wraps Layer 1 with Formik (MCFormTextInput, MCFormPanel, MCFormLayout...)
             Adds error handling, layout, and label automation.

Layer 3: Service pages (apps/tving/, apps/onboard-demo/, apps/msm-default/)
         └── Composes Layer 2 components into real screens.
```

### Layer responsibilities

| Layer | Package | Role | Example |
|-------|---------|------|---------|
| **1 — Library** | `@moloco/moloco-cloud-react-ui` | UI primitives, theme, icons | MCButton2, MCSingleTextInput, MCIcon |
| **2 — Wrapper** | `@msm-portal/common/component/*` | Formik integration, form layout, shared patterns | MCFormTextInput, MCFormPanel, MCFormLayout |
| **3 — App** | `apps/tving/`, `apps/onboard-demo/` | Business logic, page composition | Campaign creation, report viewing |

---

## Layer 1 — React Library

### Package layout (monorepo)

| Package | npm name | Role |
|---------|----------|------|
| `packages/ui` | `@moloco/moloco-cloud-react-ui` | UI components + theme |
| `packages/hooks` | `@moloco/moloco-cloud-react-hooks` | React hook utilities |
| `packages/configuration` | `@moloco/moloco-cloud-react-configuration` | Configuration (Firebase) |
| `packages/imageGenerator` | `@moloco/moloco-cloud-image-generator` | Image generation |

### Component inventory (28 categories)

**Input**: MCSingleTextInput, MCSingleTextArea, MCRadioInput, MCCheckBoxInput, MCChipInput, MCSingleNumberInput, MCDebounceInput
**Select**: MCSelect, MCSingleRichSelect, MCMultiRichSelect, MCCardSelect, MCInlineChipRichSelect
**Button**: MCButton (legacy), MCButton2 (current standard)
**Date**: MCDatePicker, MCDateRangePicker, MCTimePicker
**Data**: MCDataTable (react-table based, react-window virtualization)
**Feedback**: MCBanner, MCLoader, MCCircularLoader
**Overlay**: MCModal, MCDialog, MCPopper, MCPopover, MCTooltip
**Other**: MCCollapse, MCChip, MCTag, MCMarkdown, MCSearchBar, MCFilter, MCStepper, MCSwitch, MCTab, MCIcon, MCStack, MCTextEllipsis, MCWeeklyTimeTablePicker

### Theme system

```typescript
// Create the library's default theme
import { createTheme } from '@moloco/moloco-cloud-react-ui';
const theme = createTheme(undefined); // MSM Portal has no custom overrides

// Access it from styled-components
const SCComponent = styled.div`
  color: ${(props) => getTheme(props).palette.content.primary};
  font-size: ${(props) => getTheme(props).typography.BODY_1_BODY.size};
  padding: ${(props) => getTheme(props).spacing(2)};
`;
```

**The `getTheme()` utility**: the core pattern used by every styled-component.
```typescript
import { getTheme } from '@moloco/moloco-cloud-react-ui';

// Returns theme.mcui. Falls back to the default theme if no ThemeProvider is mounted.
const theme = getTheme(props); // → theme.mcui
```

### Color primitives (900–50 scale)

| Name | 500 value | Usage |
|------|-----------|-------|
| **BLUE** | `#346bea` | Brand, primary actions |
| **BLUE_GREY** | — | Navigation, secondary UI |
| **GREY** | `#9E9E9E` | Text, borders, disabled |
| **RED** | `#e53935` | Error, danger |
| **ORANGE** | — | Warning accents |
| **YELLOW** | `#ffca28` | Warning |
| **GREEN** | `#429746` | Success |

---

## Layer 2 — Portal Wrapper pattern

### Formik wrapping pattern

Every MCForm* component wraps a Library primitive using the same pattern:

```typescript
// MCFormTextInput internals (simplified)
const MCFormTextInput = ({ name, fieldLabel, required, hint, showError = true, onChange, readonly, ...rest }) => {
  // 1. Pull state from Formik's useField
  const [field, meta, helper] = useField<string>(name);
  const error = !!(meta.touched && meta.error);

  // 2. onChange receives the value directly (not the event)
  const handleChange = (event) => {
    helper.setValue(event.target.value);
    onChange?.(event.target.value); // optional callback
  };

  // 3. Unified layout via the MCFormField container
  return (
    <MCFormField>
      {fieldLabel && <MCFormFieldLabel label={fieldLabel} required={required} />}
      {readonly ? (
        <MCTextEllipsis>{meta.value}</MCTextEllipsis>  // readonly mode
      ) : (
        <>
          <MCSingleTextInput {...field} {...rest} error={error} onChange={handleChange} fullWidth />
          {hint && <MCFormHint>{hint}</MCFormHint>}
          {showError && error && <MCFormFieldError>{meta.error}</MCFormFieldError>}
        </>
      )}
    </MCFormField>
  );
};
```

### What the wrapper adds

| Feature | Description |
|---------|-------------|
| **Formik integration** | `useField(name)` — auto-managed value, error, touched |
| **Error display** | Errors only show after `touched` (i.e. after user interaction) |
| **Label automation** | `required=false` auto-renders "(Optional)"; tooltip icon support |
| **Readonly mode** | `readonly=true` renders MCTextEllipsis instead of an input |
| **Hint / description** | `hint`, `description` props render text below the field |
| **Width control** | `MEFormFieldWidth` enum (SMALL=40%, MEDIUM=70%, FULL=100%, FIT_CONTENT) |
| **Direction control** | `$direction='row'\|'column'` — label / input layout |
| **onChange transform** | Event → direct value: `(value: string) => void` |
| **Forced fullWidth** | Internally always sets `fullWidth=true` |
| **Auto testId** | Field name automatically applied as testId |

### MEFormFieldWidth enum

```typescript
enum MEFormFieldWidth {
  SMALL = '40%',
  MEDIUM = '70%',
  FULL = '100%',     // default
  FIT_CONTENT = 'fit-content',
  UNSET = 'unset',
}
```

### Form scaffold components

| Component | Role | Style |
|-----------|------|-------|
| `MCFormField` | Field container | flex; direction control; width enum |
| `MCFormFieldLabel` | Field label | `required=false` shows "(Optional)"; tooltip support |
| `MCFormFieldError` | Error message | BODY_2_SPECIAL; `negative` color |
| `MCFormFieldGroup` | Field group | row/column; theme spacing |
| `MCFormPanel` | Section container | 6 unit padding, 1.5 unit margin, border + rounded |
| `MCFormPanelTitle` | Section title | H_3; 3 unit margin-bottom |
| `MCFormActions` | Action button area | flex; gap 1 unit; right-aligned; 4 unit padding |
| `MCFormHint` | Helper text | BODY_2; `secondary` color |
| `MCFormGuideMessage` | Guide box | `tertiary` background; 1.5 unit padding |
| `MCFormDescription` | Field description | BODY_3; `primary` color |
| `MCFormDivider` | Divider line | top border |

### MCFormLayout

Full-page form layout:

```
┌─────────────────────────────────────────┐
│ Header (44px): [X] Breadcrumbs  [Right] │
├─────────────────────────────────────────┤
│                                         │
│   Scrollable Body (width: 860px)        │
│                                         │
│   ┌─── MCFormPanel ──────────────────┐  │
│   │ Title                            │  │
│   │ MCFormFieldGroup                 │  │
│   │   MCFormTextInput                │  │
│   │   MCFormNumberInput              │  │
│   └──────────────────────────────────┘  │
│                                         │
├─────────────────────────────────────────┤
│ Footer (sticky): [Cancel]  [Save]       │
└─────────────────────────────────────────┘
```

Props:
- `onClose` — close-button callback
- `breadCrumbs` — navigation path
- `bodyWidth` — body width (default 860px)
- `footerContent` — footer slot
- `fullScreen` — portal render mode
- `noHeader` — hide the header

---

## Provider stack

Provider wrapping order at the app root (order matters):

```typescript
// App.tsx
<ReactQueryProvider>
  <BrowserRouter>
    <I18nextProvider i18n={i18n}>
      <ThemeProvider theme={createTheme(undefined)}>
        <MCGlobalStyle />
        <MCInAppAlertProvider>
          {/* Page routes */}
        </MCInAppAlertProvider>
      </ThemeProvider>
    </I18nextProvider>
  </BrowserRouter>
</ReactQueryProvider>
```

### Minimum providers (for previews)

| Use case | Providers required |
|----------|--------------------|
| **UI render only** | ThemeProvider + MCGlobalStyle |
| **Form preview** | ThemeProvider + MCGlobalStyle + Formik |
| **Full app** | Entire stack above |

---

## Notes (for agents and developers)

1. **Never use Layer 1 components directly in forms** — always use the Layer 2 wrappers (MCForm*). Without Formik state, error handling and validation will not work.
2. **Watch the onChange signature** — Layer 1 is `(event) => void`, Layer 2 is `(value) => void`. Mixing them causes runtime errors.
3. **No theme customization today** — every app uses `createTheme(undefined)`. Color changes have to happen at the library level.
4. **Use MCButton2** — not the legacy MCButton. `variant` is `basic` (not `contained`); `color` is `error` (not `danger`).
5. **fullWidth is automatic** — the wrapper internally sets `fullWidth=true`; you don't need to specify it.
