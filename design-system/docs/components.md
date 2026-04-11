<!-- AUTO-GENERATED — Do not edit directly. Edit src/components.json then run: node generate.mjs -->

# Component Library

> MSM Portal component library. Portal wrappers add Formik integration and theme styling on top of @moloco/moloco-cloud-react-ui primitives.
> **Base path**: `src/common/component/`
> **Import alias**: `@msm-portal/common/component/`

---

## Form Inputs (v1)

All form components use Formik via useField(name). Must be used inside a <Formik> context.

### MCFormTextInput

**Path**: `form/v1/input/MCFormTextInput.tsx`

Text input with Formik integration. Shows error after touch.

> Requires Formik context (`useField(name)`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name |
| `fieldLabel` | `ReactNode` |  |  | Label above the input |
| `tooltip` | `string` |  |  | Markdown tooltip text shown on info icon |
| `hint` | `string | ReactNode` |  |  | Helper text below input |
| `required` | `boolean` |  |  | When false, shows (Optional) suffix on label |
| `readonly` | `boolean` |  |  | Renders as MCTextEllipsis instead of input |
| `showError` | `boolean` |  | true | Show Formik error message |
| `description` | `string | ReactNode` |  |  | Sub-description below label |
| `labelRightAccessory` | `ReactNode` |  |  | Node placed right of label |
| `$direction` | `'row' | 'column'` |  | 'column' | Field layout direction |
| `onChange` | `(value: string) => void` |  |  | Callback on value change |

- fullWidth is always set to true internally
- In readonly mode: renders prefix + MCTextEllipsis (no input element)
- Error state: red label + error message below input
- Focus state: label turns palette.foundation.assent color

```tsx
import MCFormTextInput from '@msm-portal/common/component/form/v1/input/MCFormTextInput';

<MCFormTextInput
  name="title"
  fieldLabel="Campaign Title"
  required
  tooltip="Max 100 characters"
  hint="Used as the display name"
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `hover` | Mouse over the component |
| `focus` | Keyboard focus via Tab |
| `disabled` | Cannot be interacted with |
| `error` | Validation error state |
| `readonly` | View-only, not editable |

**Do:**
- ✅ Always provide fieldLabel for accessibility
- ✅ Use hint prop for helper text below input
- ✅ Use tooltip for additional context on info icon

**Don't:**
- ❌ Don't hardcode placeholder text — use i18n
- ❌ Don't use MCSingleTextInput directly in forms — use this wrapper
- ❌ Don't set required=true without Yup validation schema

### MCFormTextArea

**Path**: `form/v1/input/MCFormTextArea.tsx`

Multi-line text input with Formik integration.

> Requires Formik context (`useField(name)`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name |
| `fieldLabel` | `ReactNode` |  |  | Label above the textarea |
| `tooltip` | `string` |  |  | Markdown tooltip text |
| `required` | `boolean` |  |  | Shows/hides (Optional) suffix |
| `showError` | `boolean` |  | true | Show Formik error |

```tsx
<MCFormTextArea name="description" fieldLabel="Description" required />
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `hover` | Mouse over the component |
| `focus` | Keyboard focus via Tab |
| `disabled` | Cannot be interacted with |
| `error` | Validation error state |

**Do:**
- ✅ Use for multi-line text input (descriptions, notes)
- ✅ Set rows prop for initial height

**Don't:**
- ❌ Don't use for single-line inputs — use MCFormTextInput

### MCFormNumberInput

**Path**: `form/v1/input/MCFormNumberInput.tsx`

Numeric input with Formik integration. Converts string to parseFloat internally.

> Requires Formik context (`useField(name)`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name |
| `fieldLabel` | `ReactNode` |  |  | Label |
| `required` | `boolean` |  |  | Shows/hides (Optional) suffix |
| `onChange` | `(value: number) => void` |  |  | Callback on change |

```tsx
<MCFormNumberInput name="budget" fieldLabel="Daily Budget" required />
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `hover` | Mouse over the component |
| `focus` | Keyboard focus via Tab |
| `disabled` | Cannot be interacted with |
| `error` | Validation error state |

**Do:**
- ✅ Use for numeric values (budget, count, percentage)

**Don't:**
- ❌ Don't use for phone numbers or zip codes — use MCFormTextInput

### MCFormCheckBox

**Path**: `form/v1/checkbox/MCFormCheckBox.tsx`

Checkbox with Formik integration.

> Requires Formik context (`useField(name)`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name |
| `fieldLabel` | `ReactNode` |  |  | Label next to checkbox |
| `tooltip` | `string` |  |  | Tooltip text |
| `required` | `boolean` |  |  | Shows/hides (Optional) suffix |
| `showError` | `boolean` |  | true | Show error |

```tsx
<MCFormCheckBox name="agreeToTerms" fieldLabel="I agree to terms" required />
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `hover` | Mouse over the component |
| `focus` | Keyboard focus via Tab |
| `disabled` | Cannot be interacted with |
| `error` | Validation error state |
| `checked` | Checkbox is selected |

**Do:**
- ✅ Use for boolean on/off choices
- ✅ Use for multi-select from a small set

**Don't:**
- ❌ Don't use for mutually exclusive options — use MCFormRadioGroup

### MCFormSwitchInput

**Path**: `form/v1/input/MCFormSwitchInput.tsx`

Toggle switch with Formik integration.

> Requires Formik context (`useField(name)`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name |
| `fieldLabel` | `ReactNode` |  |  | Label |

```tsx
<MCFormSwitchInput name="isEnabled" fieldLabel="Enable feature" />
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `hover` | Mouse over the component |
| `disabled` | Cannot be interacted with |
| `on` | Toggle is switched on |
| `off` | Toggle is switched off |

**Do:**
- ✅ Use for immediate toggle actions (enable/disable feature)

**Don't:**
- ❌ Don't use inside form submission flow — use MCFormCheckBox instead

### MCFormRadioGroup

**Path**: `form/v1/radio/MCFormRadioGroup.tsx`

Radio button group with Formik integration.

> Requires Formik context (`useField(name)`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name |
| `fieldLabel` | `ReactNode` |  |  | Label |
| `direction` | `'row' | 'column'` |  |  | Layout direction of radio options |
| `options` | `Array<{ label: string; value: string }>` | ✓ |  | Radio options |
| `onChange` | `(value: string) => void` |  |  | Callback on selection |

```tsx
<MCFormRadioGroup
  name="paymentType"
  fieldLabel="Payment Type"
  direction="row"
  options={[
    { label: 'CPC', value: 'cpc' },
    { label: 'CPM', value: 'cpm' },
  ]}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `hover` | Mouse over the component |
| `focus` | Keyboard focus via Tab |
| `disabled` | Cannot be interacted with |

**Variants:**

| Variant | Description |
|---------|-------------|
| `row` | Horizontal layout |
| `column` | Vertical layout |

**Do:**
- ✅ Use for mutually exclusive choices from 2-5 options

**Don't:**
- ❌ Don't use for more than 5 options — use MCFormSingleRichSelect
- ❌ Don't use for non-exclusive choices — use MCFormCheckBox

### MCFormSingleRichSelect

**Path**: `form/v1/select/MCFormSingleRichSelect.tsx`

Single-select dropdown with Formik integration. Generic over value type.

> Requires Formik context (`useField(name)`)

**Generic**: T — the value type

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name |
| `fieldLabel` | `ReactNode` |  |  | Label |
| `tooltip` | `string` |  |  | Tooltip |
| `required` | `boolean` |  |  | Shows/hides (Optional) suffix |
| `options` | `Array<{ label: string; value: T }>` | ✓ |  | Select options |
| `onChange` | `(value: T) => void` |  |  | Callback on selection |

```tsx
<MCFormSingleRichSelect<string>
  name="status"
  fieldLabel="Status"
  required
  options={statusOptions}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `hover` | Mouse over the component |
| `focus` | Keyboard focus via Tab |
| `disabled` | Cannot be interacted with |
| `error` | Validation error state |
| `open` | Dropdown menu is open |

**Do:**
- ✅ Use for single selection from 5+ options
- ✅ Provide clear option labels

**Don't:**
- ❌ Don't use for 2-3 options — use MCFormRadioGroup

### MCFormMultiRichSelect

**Path**: `form/v1/select/MCFormMultiRichSelect.tsx`

Multi-select dropdown with Formik integration. Generic over value type.

> Requires Formik context (`useField(name)`)

**Generic**: T — the value type

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name |
| `fieldLabel` | `ReactNode` |  |  | Label |
| `options` | `Array<{ label: string; value: T }>` | ✓ |  | Select options |
| `onChange` | `(values: T[]) => void` |  |  | Callback on selection |

```tsx
<MCFormMultiRichSelect<string>
  name="tags"
  fieldLabel="Tags"
  options={tagOptions}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `hover` | Mouse over the component |
| `focus` | Keyboard focus via Tab |
| `disabled` | Cannot be interacted with |
| `error` | Validation error state |
| `open` | Dropdown menu is open |

**Do:**
- ✅ Use for multiple selection from a large set

**Don't:**
- ❌ Don't use for single selection — use MCFormSingleRichSelect

### MCFormCardSelect

**Path**: `form/v1/select/MCFormCardSelect.tsx`

Card-based visual selector with Formik integration.

> Requires Formik context (`useField(name)`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name |
| `fieldLabel` | `ReactNode` |  |  | Label |
| `options` | `Array<{ label: string; value: string; description?: string; disabled?: boolean }>` | ✓ |  | Card options |

```tsx
<MCFormCardSelect
  name="planType"
  fieldLabel="Plan Type"
  options={[
    { label: 'Basic', value: 'basic', description: 'Entry level plan' },
  ]}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `hover` | Mouse over the component |
| `selected` | Card is selected |
| `disabled` | Cannot be interacted with |

**Do:**
- ✅ Use for visual selection with descriptions (plan type, template selection)

**Don't:**
- ❌ Don't use for simple text-only options — use MCFormRadioGroup

### MCFormInlineChipRichSelect

**Path**: `form/v1/select/MCFormInlineChipRichSelect.tsx`

Chip-style multi-select rendered inline. Selected values appear as removable chips.

> Requires Formik context (`useField(name)`)

**Generic**: T — the value type

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name |
| `fieldLabel` | `ReactNode` |  |  | Label above the input |
| `options` | `Array<{ label: string; value: T }>` | ✓ |  | Selectable options |
| `required` | `boolean` |  |  | Shows/hides (Optional) suffix |
| `tooltip` | `string` |  |  | Markdown tooltip text |
| `onChange` | `(values: T[]) => void` |  |  | Callback on selection change |

```tsx
<MCFormInlineChipRichSelect<string>
  name="targetCountries"
  fieldLabel="Target Countries"
  required
  options={countryOptions}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `hover` | Mouse over the component |
| `focus` | Keyboard focus via Tab |
| `disabled` | Cannot be interacted with |
| `error` | Validation error state |

**Do:**
- ✅ Use for multi-select where selected values should be visible as chips inline
- ✅ Use when space is limited and a dropdown would be too heavy

**Don't:**
- ❌ Don't use for single selection — use MCFormSingleRichSelect
- ❌ Don't use if more than 10 options — use MCFormMultiRichSelect with dropdown

### MCFormDateRangePicker

**Path**: `form/v1/input/MCFormDateRangePicker.tsx`

Date range picker with Formik integration.

> Requires Formik context (`useField(name)`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name |
| `fieldLabel` | `ReactNode` |  |  | Label |
| `required` | `boolean` |  |  | Shows/hides (Optional) suffix |

```tsx
<MCFormDateRangePicker name="campaignPeriod" fieldLabel="Campaign Period" required />
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `hover` | Mouse over the component |
| `focus` | Keyboard focus via Tab |
| `disabled` | Cannot be interacted with |
| `error` | Validation error state |

**Do:**
- ✅ Use for date range selection (campaign periods, report ranges)

**Don't:**
- ❌ Don't use for single date — check if single date picker exists

### MCFormDateTimeRangePicker

**Path**: `form/v1/input/MCFormDateTimeRangePicker.tsx`

Date + time range picker with Formik integration. Combines date and time selection for start/end range.

> Requires Formik context (`useField(name)`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name |
| `fieldLabel` | `ReactNode` |  |  | Label above the picker |
| `required` | `boolean` |  |  | Shows/hides (Optional) suffix |
| `tooltip` | `string` |  |  | Markdown tooltip text |
| `showError` | `boolean` |  | true | Show Formik error |

```tsx
<MCFormDateTimeRangePicker name="schedulePeriod" fieldLabel="Schedule Period" required />
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `hover` | Mouse over the component |
| `focus` | Keyboard focus via Tab |
| `disabled` | Cannot be interacted with |
| `error` | Validation error state |

**Do:**
- ✅ Use for scheduling with both date and time (campaign scheduling, event windows)
- ✅ Pair with Yup date validation for start < end

**Don't:**
- ❌ Don't use for date-only ranges — use MCFormDateRangePicker
- ❌ Don't use for single datetime — check if single picker exists

### MCFormColorInput

**Path**: `form/v1/input/MCFormColorInput.tsx`

Color picker with hex input and Formik integration. Shows a color swatch preview and accepts hex color codes.

> Requires Formik context (`useField(name)`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name |
| `fieldLabel` | `ReactNode` |  |  | Label above the input |
| `required` | `boolean` |  |  | Shows/hides (Optional) suffix |
| `tooltip` | `string` |  |  | Markdown tooltip text |

```tsx
<MCFormColorInput name="brandColor" fieldLabel="Brand Color" required />
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state with color swatch |
| `hover` | Mouse over the component |
| `focus` | Color picker popup is open |
| `disabled` | Cannot be interacted with |
| `error` | Validation error state (invalid hex) |

**Do:**
- ✅ Use for brand color configuration (theme customization)
- ✅ Validate hex format with Yup: matches(/^#[0-9A-Fa-f]{6}$/)

**Don't:**
- ❌ Don't use for predefined color selection — use MCFormSingleRichSelect with color swatches

### MCFormChipInput

**Path**: `form/v1/input/MCFormChipInput.tsx`

Text input that creates chips on Enter or comma. Formik integrated. Stores values as string array.

> Requires Formik context (`useField(name)`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name (stores string[]) |
| `fieldLabel` | `ReactNode` |  |  | Label above the input |
| `required` | `boolean` |  |  | Shows/hides (Optional) suffix |
| `tooltip` | `string` |  |  | Markdown tooltip text |
| `hint` | `string | ReactNode` |  |  | Helper text below input |
| `placeholder` | `string` |  |  | Input placeholder text |

```tsx
<MCFormChipInput
  name="keywords"
  fieldLabel="Keywords"
  hint="Press Enter or comma to add"
  placeholder="Type a keyword..."
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `hover` | Mouse over the component |
| `focus` | Input is focused, ready to type |
| `disabled` | Cannot be interacted with |
| `error` | Validation error state |

**Do:**
- ✅ Use for free-form tag/keyword input (tags, keywords, email lists)
- ✅ Show hint explaining the delimiter (Enter or comma)

**Don't:**
- ❌ Don't use for predefined option selection — use MCFormMultiRichSelect
- ❌ Don't use for single values — use MCFormTextInput

### MCFormWeeklyTimeTablePicker

**Path**: `form/v1/input/MCFormWeeklyTimeTablePicker.tsx`

Grid-based weekly schedule picker (day × hour slots). Formik integrated. Click or drag to select time slots.

> Requires Formik context (`useField(name)`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name (stores schedule matrix) |
| `fieldLabel` | `ReactNode` |  |  | Label above the picker |
| `required` | `boolean` |  |  | Shows/hides (Optional) suffix |
| `tooltip` | `string` |  |  | Markdown tooltip text |

```tsx
<MCFormWeeklyTimeTablePicker
  name="adSchedule"
  fieldLabel="Ad Schedule"
  tooltip="Select hours when ads should run"
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Grid with all slots unselected |
| `selecting` | User is dragging to select slots |
| `disabled` | Cannot be interacted with |
| `error` | Validation error state |

**Do:**
- ✅ Use for weekly ad scheduling (dayparting)
- ✅ Provide clear visual feedback for selected vs unselected slots

**Don't:**
- ❌ Don't use for single time slot — use a time picker
- ❌ Don't use for date-specific scheduling — use MCFormDateTimeRangePicker

### MCFormOptionalFrequencyInput

**Path**: `form/v1/input/MCFormOptionalFrequencyInput.tsx`

Frequency cap input with optional toggle. Formik integrated. Toggle enables/disables the frequency limit.

> Requires Formik context (`useField(name)`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name |
| `fieldLabel` | `ReactNode` |  |  | Label above the input |
| `required` | `boolean` |  |  | Shows/hides (Optional) suffix |
| `tooltip` | `string` |  |  | Markdown tooltip text |

```tsx
<MCFormOptionalFrequencyInput
  name="frequencyCap"
  fieldLabel="Frequency Cap"
  tooltip="Limit impressions per user per day"
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Toggle off, frequency input hidden |
| `enabled` | Toggle on, frequency input visible |
| `disabled` | Cannot be interacted with |
| `error` | Validation error on frequency value |

**Do:**
- ✅ Use for optional frequency capping (impression cap per user)
- ✅ Set sensible default when toggle is enabled

**Don't:**
- ❌ Don't use for required numeric input — use MCFormNumberInput

### MCFormSkippableVideoInput

**Path**: `form/v1/input/MCFormSkippableVideoInput.tsx`

Video URL input with skippable option toggle. Formik integrated. Combines URL text input with a skip toggle.

> Requires Formik context (`useField(name)`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name |
| `fieldLabel` | `ReactNode` |  |  | Label above the input |
| `required` | `boolean` |  |  | Shows/hides (Optional) suffix |
| `tooltip` | `string` |  |  | Markdown tooltip text |

```tsx
<MCFormSkippableVideoInput
  name="videoCreative"
  fieldLabel="Video Creative URL"
  required
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `hover` | Mouse over the component |
| `focus` | URL input is focused |
| `disabled` | Cannot be interacted with |
| `error` | Validation error (invalid URL) |

**Do:**
- ✅ Use for video ad creative inputs
- ✅ Validate URL format with Yup

**Don't:**
- ❌ Don't use for non-video URLs — use MCFormTextInput

---

## Standalone Inputs

Reusable input-like components that are not tied to Formik but are still part of the shared Portal contract.

### MCRadioGroup

**Path**: `form/v1/radio/MCRadioGroup.tsx`

Controlled radio group for non-Formik usage. Composes MCFormField, MCFormFieldLabel, and Moloco radio inputs.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `value` | `string` | ✓ |  | Currently selected option value |
| `options` | `Array<{ label: ReactNode; value: string; disabled?: boolean }>` | ✓ |  | Radio option definitions |
| `onChange` | `(value: string) => void` | ✓ |  | Called when the user selects a new option |
| `label` | `ReactNode` |  |  | Field label shown above the radio inputs |
| `error` | `ReactNode` |  |  | Inline error content rendered below the options |
| `tooltip` | `string` |  |  | Tooltip text shown from the label |
| `direction` | `'row' | 'column'` |  | 'row' | Layout direction for the option list |
| `required` | `boolean` |  |  | Marks the field as required in the label |
| `disabled` | `boolean` |  |  | Disables all radio options |

```tsx
<MCRadioGroup
  value={selectedStatus}
  options={[{ label: 'Active', value: 'active' }, { label: 'Paused', value: 'paused' }]}
  onChange={setSelectedStatus}
  label="Status"
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `selected` | One option is selected |
| `disabled` | Inputs are disabled |
| `error` | Error content is shown below the group |

**Do:**
- ✅ Use when a controlled screen needs MC-style radio layout without Formik

**Don't:**
- ❌ Don't duplicate this inside Formik wrappers — use MCFormRadioGroup instead

### MCColorPicker

**Path**: `color/MCColorPicker.tsx`

Popover-based RGBA color picker with swatch preview, hex display, and optional alpha control.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `color` | `MTRGBAColor | null` | ✓ |  | Currently selected RGBA color or null for empty state |
| `onChange` | `(color: MTRGBAColor) => void` |  |  | Called when the picker changes the selected color |
| `readonly` | `boolean` |  |  | Shows the value without opening the picker |
| `disabled` | `boolean` |  |  | Disables interaction and uses disabled styling |
| `colorPickerTitle` | `ReactNode` |  |  | Optional header content rendered above the sketch picker |
| `disableAlpha` | `boolean` |  |  | Hides alpha-channel controls and values |

```tsx
<MCColorPicker
  color={brandColor}
  onChange={setBrandColor}
  colorPickerTitle="Brand color"
/>
```

**States:**

| State | Description |
|-------|-------------|
| `empty` | No color selected yet |
| `selected` | Color swatch, hex, and channel values are shown |
| `open` | Popover is open |
| `readonly` | Selection is displayed but cannot be edited |
| `disabled` | Selection is displayed with disabled styling |

**Do:**
- ✅ Use text and swatch together so color is never the only signal

**Don't:**
- ❌ Don't hide the current color value when the color meaning matters

### MCI18nWeeklyTimeTablePicker

**Path**: `weekly-time-table-picker/MCI18nWeeklyTimeTablePicker.tsx`

I18n wrapper around Moloco's MCWeeklyTimeTablePicker. Injects localized weekday, legend, and preset labels from the common weeklyTimeTablePicker namespace.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `...props` | `ComponentProps<typeof MCWeeklyTimeTablePicker>` |  |  | All props supported by Moloco's weekly timetable picker, forwarded unchanged except for customLabel |

```tsx
<MCI18nWeeklyTimeTablePicker
  value={weeklySchedule}
  onChange={setWeeklySchedule}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Rendered with localized labels and current selection |
| `interactive` | User is selecting or deselecting timetable cells |

**Do:**
- ✅ Use the i18n wrapper instead of duplicating customLabel objects inline
- ✅ Pair with visible label text so the schedule purpose is clear

**Don't:**
- ❌ Don't bypass the wrapper and reimplement the same translations inline

---

## Form Shared

Shared building blocks used by form input components. Import from '@msm-portal/common/component/form/shared'.

**Import from**: `@msm-portal/common/component/form/shared`

### MCFormFieldLabel

**Path**: `form/shared/MCFormFieldLabel.tsx`

Form field label with optional/required state, tooltip, and description.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `htmlFor` | `string` |  |  | Associates label with input |
| `error` | `boolean` |  |  | Turns label red |
| `required` | `boolean` |  |  | When false, shows (Optional) suffix |
| `tooltip` | `string` |  |  | Markdown tooltip on info icon |
| `description` | `string | ReactNode` |  |  | Sub-label below main label |
| `rightAccessory` | `ReactNode` |  |  | Right-aligned accessory node |

- required=false shows (Optional) in placeholder color
- Focus-within on parent MCFormField: label turns palette.foundation.assent
- error=true: label turns palette.foundation.negative

### MCFormTooltip

**Path**: `form/shared/MCFormTooltip.tsx`

Info icon that shows a markdown tooltip on hover.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `markdownText` | `string` | ✓ |  | Markdown content for tooltip |

```tsx
<MCFormTooltip markdownText="**Bold** and _italic_ supported" />
```

### MCCollapsibleFormFieldGroup

**Path**: `form/collapsible-field/MCCollapsibleFormFieldGroup.tsx`

Collapsible wrapper for grouped form fields. Provides a clickable title row with an expand icon and animated body using MCCollapse.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `title` | `string` | ✓ |  | Clickable title shown in the summary row |
| `defaultExpanded` | `boolean` |  | true | Initial expanded/collapsed state |
| `onChange` | `() => void` |  |  | Called after the expanded state toggles |
| `children` | `ReactNode` | ✓ |  | Form fields rendered inside the collapsible body |

```tsx
<MCCollapsibleFormFieldGroup title="Advanced settings" defaultExpanded={false}>
  <MCFormTextInput name="campaignName" fieldLabel="Campaign name" />
</MCCollapsibleFormFieldGroup>
```

**States:**

| State | Description |
|-------|-------------|
| `expanded` | Form fields are visible |
| `collapsed` | Form fields are hidden behind the summary row |

**Do:**
- ✅ Use for advanced or optional form subsections
- ✅ Choose a clear title that explains what is hidden

**Don't:**
- ❌ Don't nest many collapsible groups inside each other

### MCFormAccordion

**Path**: `form/shared/MCFormAccordion.tsx`

Formik-aware accordion wrapper that combines MCAccordion with MCFormFieldLabel so summary text reflects form required/tooltip/error semantics.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | ✓ |  | Formik field name used to read touched/error state |
| `summary` | `string` | ✓ |  | Accordion title text rendered through MCFormFieldLabel |
| `required` | `boolean` |  |  | Marks the section label as required |
| `tooltip` | `string` |  |  | Tooltip content shown from the summary label |
| `...rest` | `MCAccordionProps` |  |  | Remaining MCAccordion props such as defaultExpanded and children |

```tsx
<MCFormAccordion name="targeting" summary="Targeting" tooltip="Audience filters" defaultExpanded>
  <MCFormTextInput name="campaignName" fieldLabel="Campaign name" />
</MCFormAccordion>
```

**States:**

| State | Description |
|-------|-------------|
| `collapsed` | Section body hidden |
| `expanded` | Section body visible |
| `error` | Summary label shows error styling when the bound field is touched and invalid |

**Do:**
- ✅ Use when a collapsible form section should mirror Formik error state in the header
- ✅ Keep the summary text short and descriptive

**Don't:**
- ❌ Don't use this as a shortcut for non-form accordions

### Styled Components

| Component | Props | Description |
|-----------|-------|-------------|
| `MCFormField` | $width?: MEFormFieldWidth, $direction?: 'row' | 'column' | Wrapper for a single field. Default direction: column. |
| `MCFormFieldError` | — | Red error message. Uses BODY_2_SPECIAL, content.negative. |
| `MCFormFieldGroup` | $direction?: 'row' | 'col', $spacing?: number | Groups multiple fields. Default spacing: spacing(2) row, spacing(4) col. |
| `MCFormPanel` | — | White card. padding: spacing(6), border: border.primary, border-radius: 2px. |
| `MCFormPanelTitle` | — | H_3 title inside panel. margin-bottom: spacing(3) when followed by body. |
| `MCFormPanelSubTitle` | — | BODY_2 secondary subtitle. color: content.secondary. |
| `MCFormPanelBody` | — | Body content wrapper inside a panel. |
| `MCFormBody` | — | Top-level form body wrapper. |
| `MCFormTitle` | — | H_3 form title placed outside panels. |
| `MCFormActions` | — | Right-aligned flex row for action buttons. padding-bottom: spacing(4). |
| `MCFormGuideMessage` | $marginTop?: number, $marginBottom?: number | Info box with background.tertiary fill. Uses BODY_2. |
| `MCFormBorderWrapper` | — | Border box with padding: spacing(1.5). |
| `MCFormHint` | — | Secondary hint text below inputs. BODY_2, content.secondary. |
| `MCFormDescription` | — | BODY_3 description text. |
| `MCFormDivider` | — | Horizontal border divider using border.primary. |

**MCFormField:**
- ✅ Wrap every form input in MCFormField for consistent spacing

**MCFormFieldGroup:**
- ✅ Use $direction='row' for side-by-side fields
- ✅ Use $direction='col' with $spacing for vertical stacking

**MCFormPanel:**
- ✅ Use as the primary container for form sections
- ✅ Add MCFormPanelTitle as the first child

### `MEFormFieldWidth`

| Key | Value | CSS Value |
|-----|-------|----------|
| `SMALL` | `'small'` | `40%` |
| `MEDIUM` | `'medium'` | `70%` |
| `FULL` | `'full'` | `100%` |
| `FIT_CONTENT` | `'fit-content'` | `fit-content` |
| `UNSET` | `'unset'` | `unset` |

---

## Form Scaffold

Structural components that compose the form page layout. Used in patterns.json form patterns. Must be used inside MCFormLayout.

### MCFormPanel

**Path**: `form/shared/index.ts`

Container panel for form sections with title and body

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `ReactNode` | ✓ |  | Panel content (typically MCFormPanelTitle + MCFormPanelBody) |

### MCFormPanelTitle

**Path**: `form/shared/index.ts`

Title component for MCFormPanel

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `ReactNode` | ✓ |  | Title text |

### MCFormPanelBody

**Path**: `form/shared/index.ts`

Body container inside MCFormPanel, holds field groups

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `ReactNode` | ✓ |  | Body content (MCFormFieldGroups) |

### MCFormFieldGroup

**Path**: `form/shared/index.ts`

Groups related form fields with optional title. Provides consistent spacing between fields.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `ReactNode` | ✓ |  | Form fields |
| `title` | `string` |  |  | Optional group title |

### MCFormField

**Path**: `form/shared/index.ts`

Wrapper for individual form fields. Provides label, error, and hint layout.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `ReactNode` | ✓ |  | Form input component |

### MCFormTitle

**Path**: `form/shared/index.ts`

Title component for the entire form page

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `ReactNode` | ✓ |  | Title text |

### MCFormBody

**Path**: `form/shared/index.ts`

Main body container for form content. Holds MCFormPanels.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `ReactNode` | ✓ |  | MCFormPanel components |

### MCFormActions

**Path**: `form/shared/index.ts`

Action bar at the bottom of a form with submit/cancel buttons

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `ReactNode` | ✓ |  | Action buttons |

### MCFormFieldError

**Path**: `form/shared/index.ts`

Inline error message display for form fields

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `ReactNode` | ✓ |  | Error message text |

### MCFormHint

**Path**: `form/shared/index.ts`

Helper text below a form field

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `ReactNode` | ✓ |  | Hint text |

### MCFormGuideMessage

**Path**: `form/shared/index.ts`

Informational guide message within a form panel

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `ReactNode` | ✓ |  | Guide message content |

### MCFormDescription

**Path**: `form/shared/index.ts`

Description text below a form field label

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `ReactNode` | ✓ |  | Description text |

### MCFormPortal

**Path**: `form/portal/MCFormPortal.tsx`

Portal helper that renders form content into the main layout body or root layout body for full-screen experiences.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `ReactNode` | ✓ |  | Portal content to render into the target layout body |
| `fullScreen` | `boolean` |  |  | When true, mount into the root layout body instead of the main body |

```tsx
<MCFormPortal fullScreen>
  <MCFormLayout>{content}</MCFormLayout>
</MCFormPortal>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Mounted in the main layout body |
| `fullScreen` | Mounted in the root layout body |

**Do:**
- ✅ Use when layout-level mounting is necessary for full-screen form surfaces

**Don't:**
- ❌ Don't treat this as a generic replacement for dialog or page layout components

---

## Form Layout

Full-page form layout with header, scrollable body, and footer.

### MCFormLayout

**Path**: `form/layout/MCFormLayout.tsx`

Full-page form layout. Header: 44px. Body: 860px centered. Footer: border-top.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `onClose` | `() => void` |  |  | Back/close button handler. Shows button when provided. |
| `noHeader` | `boolean` |  |  | Hides header when true |
| `headerRightAccessory` | `ReactNode` |  |  | Content in header right slot |
| `breadCrumbs` | `Array<{ type?: string; title: string }>` |  |  | Breadcrumb trail in header |
| `bodyWidth` | `string` |  | 860px | Width of scrollable body |
| `footerContent` | `ReactNode` |  |  | Footer content (centered) |
| `fullScreen` | `boolean` |  |  | Full screen mode |

**Layout**: Header(44px border-bottom) / Scrollable Body(centered 860px) / Footer(border-top)

**Do:**
- ✅ Use for full-page create/edit forms
- ✅ Always provide onClose handler
- ✅ Use footerContent for action buttons (Save/Cancel)

**Don't:**
- ❌ Don't use for list or detail pages — use MCContentLayout
- ❌ Don't place content outside the Form body area

---

## Buttons

Button components. MCButton2 comes from @moloco/moloco-cloud-react-ui.

### MCButton2

**Path**: `@moloco/moloco-cloud-react-ui`

Primary button. All portal buttons use MCButton2.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `variant` | `'basic' | 'text'` |  | 'basic' | Button style variant. 'basic' is the default filled/outlined style; 'text' is borderless. |
| `size` | `'default' | 'small' | 'large'` |  | 'default' | Button size |
| `color` | `'primary' | 'secondary' | 'tertiary' | 'error'` |  | 'primary' | Button color. When variant='text', only 'primary' is allowed. |
| `leftIcon` | `MTIcon | ReactNode` |  |  | Icon before label. Accepts an MTIcon string name or a ReactNode. |
| `rightIcon` | `MTIcon | ReactNode` |  |  | Icon after label. Accepts an MTIcon string name or a ReactNode. |
| `loading` | `boolean` |  |  | Shows loading spinner and disables interaction |
| `disabled` | `boolean` |  |  | Disabled state |
| `onClick` | `(event: React.MouseEvent<HTMLButtonElement>) => void` |  |  | Click handler |
| `type` | `'button' | 'submit' | 'reset'` |  |  | HTML button type |
| `testId` | `string` |  |  | Test ID for automated testing |

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `hover` | Mouse over the component |
| `active` | Being clicked/pressed |
| `focus` | Keyboard focus via Tab |
| `disabled` | Cannot be interacted with |
| `loading` | Async action in progress |

**Variants:**

| Variant | Description |
|---------|-------------|
| `basic` | Default filled button style. Color determines appearance (primary=brand fill, secondary=outlined, tertiary=subtle, error=red fill). Primary, secondary, and tertiary actions. |
| `text` | No background/border. Only 'primary' color is allowed. Low-priority actions, inline links. |

**Sizes:**

| Size | Description |
|------|-------------|
| `small` | Compact contexts, table rows |
| `default` | Default size for most actions |
| `large` | Hero actions, standalone prominent buttons |

**Do:**
- ✅ Use variant='basic' color='primary' for the single primary action per section
- ✅ Use variant='basic' color='secondary' for Cancel/Back actions
- ✅ Always add leftIcon for clarity when space allows

**Don't:**
- ❌ Don't use more than one primary-colored button in a button group
- ❌ Don't use inline styles to customize button colors
- ❌ Don't use text variant for destructive actions — use color='error' with variant='basic'

### MCMoreActionsButton

**Path**: `button/MCMoreActionsButton.tsx`

MCButton2 that opens a popover menu of actions on click.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `moreActionItems` | `MTMoreActionItem[]` | ✓ |  | Array of action items |
| `noPadding` | `boolean` |  |  | Removes button padding |

**`MTMoreActionItem`**: `{ label: ReactNode; icon?: MTIcon; onClick: () => void | Promise<void> }`

```tsx
<MCMoreActionsButton
  variant="text"
  noPadding
  moreActionItems={[
    { label: 'Edit', icon: 'edit', onClick: handleEdit },
    { label: 'Delete', icon: 'delete', onClick: handleDelete },
  ]}
>
  <MCIcon icon="more" width={16} height={16} />
</MCMoreActionsButton>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `hover` | Mouse over the component |
| `active` | Being clicked/pressed |
| `open` | Popover menu is open |

**Do:**
- ✅ Use for contextual actions in table rows or card headers
- ✅ Use MCIcon 'more' as trigger

**Don't:**
- ❌ Don't use for primary actions — use MCButton2 directly

### MCMoreActionGroupsButton

**Path**: `button/MCMoreActionGroupsButton.tsx`

MCButton2 with grouped actions separated by MCDivider.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `moreActionItemGroups` | `MTMoreActionItemGroup[]` | ✓ |  | Array of action groups |
| `noPadding` | `boolean` |  |  | Removes button padding |

**`MTMoreActionItemGroup`**: `{ label: ReactNode; icon?: MTIcon; actions: MTMoreActionItem[] }`

---

## Navigation

Primary navigation building blocks used for the app shell and route-level movement.

### MCCollapsibleNavbar

**Path**: `navbar/MCCollapsibleNavbar.tsx`

Collapsible sidebar navigation. Width: 260px when expanded, collapses to icon-only width.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `ReactNode` | ✓ |  | Navigation content (MCNavbarItems) |
| `defaultCollapsed` | `boolean` |  | false | Initial collapsed state |
| `footer` | `ReactNode` |  |  | Footer content below nav items |

- Toggle button uses angle-left / angle-right icons
- Width: 260px expanded, defined by NAV_BAR_WIDTH constant
- Collapse state persists via localStorage

```tsx
<MCCollapsibleNavbar>
  <MCNavbarItems sections={navSections} />
</MCCollapsibleNavbar>
```

**States:**

| State | Description |
|-------|-------------|
| `expanded` | Full width (260px) with labels visible |
| `collapsed` | Icon-only narrow width |

**Do:**
- ✅ Use as the primary app sidebar navigation
- ✅ Place MCNavbarItems as children

**Don't:**
- ❌ Don't nest inside MCContentLayout or MCFormLayout
- ❌ Don't add custom width overrides

### MCNavbarItems

**Path**: `navbar/MCNavbarItems.tsx`

Renders navigation sections with titles and items. Handles routing and active state highlighting.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `sections` | `Array<{ title?: string; items: Array<{ label: string; icon: MTIcon; route: MERouteKey; badge?: ReactNode }> }>` | ✓ |  | Navigation sections with grouped menu items |

```tsx
<MCNavbarItems
  sections={[
    {
      title: 'Campaign Management',
      items: [
        { label: 'Campaigns', icon: 'targeting', route: MERouteKey.CAMPAIGN_MAIN },
        { label: 'Creatives', icon: 'creative', route: MERouteKey.CREATIVE_MAIN },
      ],
    },
    {
      title: 'Reports',
      items: [
        { label: 'Performance', icon: 'chart', route: MERouteKey.REPORT_MAIN },
      ],
    },
  ]}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `active` | Current route matches item — highlighted with brand color |
| `hover` | Mouse over a nav item |

**Do:**
- ✅ Group related items under section titles
- ✅ Use MCIcon names for the icon prop
- ✅ Match route keys from MERouteKey enum

**Don't:**
- ❌ Don't use outside MCCollapsibleNavbar
- ❌ Don't add more than 3 sections to avoid scroll

### MCProfileButton

**Path**: `layout/header/user-popover/MCProfileButton.tsx`

Header account button that opens a localized user popover with profile summary, route shortcuts, custom section items, and sign-out action.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `user` | `{ name: string; lastName: string; email: string }` | ✓ |  | Current user identity displayed in the button and popover header |
| `sections` | `Array<{ displayLabelKey: MTLabelKey<'component.userPopover'>; items: Array<{ displayLabelKey: MTLabelKey<'component.userPopover'>; routeKey: MERouteKey } | { component: ReactNode }> }>` | ✓ |  | Popover menu sections containing route items or custom content |
| `userEditRouteKey` | `MERouteKey` | ✓ |  | Route opened when the edit icon in the popover header is clicked |
| `onClickRouteItem` | `(routeKey: MERouteKey) => void` | ✓ |  | Called when a route item or the edit shortcut is selected |
| `onSignOut` | `() => void` | ✓ |  | Called when the sign-out action is selected |

```tsx
<MCProfileButton
  user={user}
  sections={popoverSections}
  userEditRouteKey={MERouteKey.MY_PROFILE}
  onClickRouteItem={handleRoute}
  onSignOut={handleSignOut}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `closed` | Only the header button is visible |
| `open` | User popover is visible with sections and actions |

**Do:**
- ✅ Use translated section labels and menu item labels
- ✅ Keep account actions concise and clearly grouped

**Don't:**
- ❌ Don't overload the popover with unrelated navigation

### MCWorkplaceSelectorPopper

**Path**: `layout/header/workplace-selector/MCWorkplaceSelectorPopper.tsx`

Header workspace selector based on MCCustomRichSelect. Lets the user switch between workplaces from the app shell with searchable options and current selection display.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `isLoading` | `boolean` | ✓ |  | Shows loading state while workplace options are being prepared |
| `currentWorkplaceId` | `string` | ✓ |  | Currently active workplace id |
| `workplaces` | `Array<{ id: string; title: string; logoUrl: string }>` | ✓ |  | Available workplace options |
| `onSelectWorkplace` | `(workplaceId: string) => void` | ✓ |  | Called when a different workplace is selected |

```tsx
<MCWorkplaceSelectorPopper
  isLoading={isLoading}
  currentWorkplaceId={currentWorkplaceId}
  workplaces={workplaces}
  onSelectWorkplace={handleSelectWorkplace}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `loading` | Workplace options are loading |
| `ready` | Selector shows the current workplace and available options |
| `disabled` | Only one workplace exists, so switching is disabled |

**Do:**
- ✅ Use for header-level workplace switching
- ✅ Pass the current workplace id so the selected option is reflected correctly

**Don't:**
- ❌ Don't reuse this for unrelated entity selection

### MCWorkplaceSelector

**Path**: `auth/workplace-selector/MCWorkplaceSelector.tsx`

Dedicated searchable workplace selector for auth or pre-shell flows. Uses MCSearchBar, virtualized results, and loading/empty states.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `isLoading` | `boolean` | ✓ |  | Shows loader and disables search interactions while workplace data loads |
| `workplaces` | `Array<{ id: string; title: string; logoUrl: string }>` | ✓ |  | Available workplace options |
| `onSelectWorkplace` | `(workplaceId: string) => void` | ✓ |  | Called when the user selects a workplace row |

```tsx
<MCWorkplaceSelector
  isLoading={isLoading}
  workplaces={workplaces}
  onSelectWorkplace={handleSelectWorkplace}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `loading` | Circular loader fills the result area |
| `empty` | No workplaces match the search query |
| `ready` | Search bar and virtualized workplace rows are shown |

**Do:**
- ✅ Use for dedicated workplace-picking screens before entering the shell
- ✅ Keep the search placeholder and empty-state text translated

**Don't:**
- ❌ Don't reuse workplace-specific empty-state copy for unrelated selectors

---

## Feedback & Overlay

Dialogs, popovers, and loading feedback components that temporarily sit above page content.

### MCCommonDialog

**Path**: `dialog/common-dialog/MCCommonDialog.tsx`

Modal dialog with header, content area, and action buttons.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `open` | `boolean` | ✓ |  | Controls dialog visibility |
| `onClose` | `() => void` | ✓ |  | Close handler |
| `title` | `ReactNode` |  |  | Dialog title in header |
| `width` | `string` |  |  | Dialog width. Default: auto |
| `showDivider` | `boolean` |  |  | Divider between header and body |
| `depth` | `number` |  |  | Z-index offset for nested dialogs |
| `actions` | `ReactNode` |  |  | Action buttons in footer |

```tsx
<MCCommonDialog
  open={isOpen}
  onClose={() => setIsOpen(false)}
  title="Confirm Delete"
  showDivider
  actions={
    <>
      <MCButton2 onClick={() => setIsOpen(false)}>Cancel</MCButton2>
      <MCButton2 color="primary" onClick={handleConfirm}>Confirm</MCButton2>
    </>
  }
>
  Are you sure?
</MCCommonDialog>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `open` | Dialog is visible |
| `closing` | Dialog is animating closed |

**Do:**
- ✅ Use for confirmations, alerts, and small forms
- ✅ Always provide onClose handler
- ✅ Use showDivider for content-heavy dialogs

**Don't:**
- ❌ Don't use for full-page content — use MCFormLayout
- ❌ Don't nest dialogs more than 2 levels deep

### MCPopover

**Path**: `popover/MCPopover.tsx`

Styled popover. Paper: background.primary, no shadow, border.primary border.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `open` | `boolean` | ✓ |  | Controls visibility |
| `anchorEl` | `HTMLElement | null` | ✓ |  | Anchor element |
| `anchorOrigin` | `{ vertical, horizontal }` |  |  | Anchor point on trigger element |
| `transformOrigin` | `{ vertical, horizontal }` |  |  | Origin point on popover |
| `onClose` | `() => void` |  |  | Close handler |

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `open` | Popover is visible |

**Do:**
- ✅ Use for contextual menus and tooltips
- ✅ Set anchorOrigin and transformOrigin for correct positioning

**Don't:**
- ❌ Don't use for complex forms — use MCCommonDialog
- ❌ Don't leave popovers open without user interaction to dismiss

### MCLoader

**Path**: `loader/`

Loading spinner. Use while async data is being fetched.

```tsx
if (isLoading) return <MCLoader />;
```

**Do:**
- ✅ Use MCLoader for inline/section loading

**Don't:**
- ❌ Don't show loader for less than 300ms — use debounced loading state

---

## Display

Shared presentation components for showing content structure, separation, tabs, status, and progress.

### MCAccordion

**Path**: `accordion/MCAccordion.tsx`

Collapsible section with animated expand/collapse. Toggle icon: angle-down (rotates 180° when expanded).

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `summary` | `ReactNode` | ✓ |  | Always-visible header content |
| `defaultExpanded` | `boolean` |  |  | Initial expanded state |

```tsx
<MCAccordion summary={<MCFormPanelTitle>Advanced Settings</MCFormPanelTitle>} defaultExpanded={false}>
  {/* content */}
</MCAccordion>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `expanded` | Content is visible |
| `collapsed` | Content is hidden |

**Do:**
- ✅ Use for progressive disclosure of optional content
- ✅ Set defaultExpanded for the most important section

**Don't:**
- ❌ Don't nest accordions inside accordions

### MCBarTabs

**Path**: `tab/bar-tab/MCBarTabs.tsx`

Tab bar with bar indicator.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `tabs` | `Array<{ label: ReactNode; active: boolean; onClick: () => void }>` | ✓ |  | Tab definitions |

```tsx
<MCBarTabs
  tabs={[
    { label: 'Overview', active: activeTab === 'overview', onClick: () => setActiveTab('overview') },
    { label: 'Settings', active: activeTab === 'settings', onClick: () => setActiveTab('settings') },
  ]}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `active` | Currently selected tab |

**Do:**
- ✅ Use for content switching within a page
- ✅ Use useSearchParams to persist active tab in URL

**Don't:**
- ❌ Don't use for navigation between pages — use routing
- ❌ Don't use more than 6 tabs

### MCDivider

**Path**: `divider/MCDivider.tsx`

Horizontal or vertical divider using border.primary.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `$margin` | `number` |  |  | Margin override (px) |
| `direction` | `'row' | 'column'` |  |  | row = horizontal, column = vertical |

```tsx
<MCDivider />
<MCDivider $margin={0} />
<MCDivider direction="column" />
```

**Variants:**

| Variant | Description |
|---------|-------------|
| `horizontal` | Default, row direction |
| `vertical` | Column direction |

**Do:**
- ✅ Use to separate content sections
- ✅ Set $margin={0} to remove default margin

**Don't:**
- ❌ Don't use for decorative purposes — only for semantic separation

### MCStatus

**Path**: `status/MCStatus.tsx`

Status badge with icon and label. Color and icon are derived automatically.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `status` | `'active' | 'paused' | 'scheduled' | 'underReview' | 'rejected' | 'draft' | 'delivered' | 'archived'` | ✓ |  | Status type |

```tsx
<MCStatus status="active" />
```

**Variants:**

| Variant | Description |
|---------|-------------|
| `active` (`#2E7D32`) | Running/live entity |
| `paused` (`#ED6C02`) | Temporarily stopped |
| `scheduled` (`#0288D1`) | Pending start |
| `underReview` (`#ED6C02`) | Awaiting approval |
| `rejected` (`#D32F2F`) | Denied/failed |
| `draft` (`#757575`) | Not yet submitted |
| `delivered` (`#2E7D32`) | Completed delivery |
| `archived` (`#9E9E9E`) | No longer active |

**Do:**
- ✅ Use for entity lifecycle status display

**Don't:**
- ❌ Don't create custom status colors — use predefined variants

### MCStatusBadge

**Path**: `status-badge/MCStatusBadge.tsx`

Compact text-first status badge with semantic background and text colors. Unlike MCStatus, it does not add an icon or derive the label automatically.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `status` | `'active' | 'paused' | 'completed' | 'error' | 'draft'` | ✓ |  | Semantic status variant |
| `label` | `string` | ✓ |  | Visible text shown inside the badge |
| `$size` | `'small' | 'medium'` |  | 'medium' | Compact or standard pill size |

```tsx
<MCStatusBadge status="paused" label="Paused" $size="small" />
```

**Variants:**

| Variant | Description |
|---------|-------------|
| `active` | Positive/active state |
| `paused` | Temporarily stopped state |
| `completed` | Finished state |
| `error` | Failed or problem state |
| `draft` | Not yet finalized |

**Do:**
- ✅ Use short, clear labels such as Active, Paused, or Draft
- ✅ Prefer this compact badge when MCStatus would be visually too heavy

**Don't:**
- ❌ Don't use this as a generic category chip

### MCTimer

**Path**: `timer/MCTimer.tsx`

Lightweight countdown renderer that decreases remaining seconds on an interval and optionally delegates rendering to a decorator function.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `initSec` | `number` | ✓ |  | Initial remaining seconds |
| `updateIntervalSec` | `number` |  | 1 | Countdown decrement interval in seconds |
| `decorator` | `(remainingSec: number) => ReactNode` |  |  | Optional custom renderer for the remaining seconds |

```tsx
<MCTimer
  initSec={60}
  decorator={(remainingSec) => <span>Resend in {remainingSec}s</span>}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `counting` | Remaining seconds decrease on each interval |
| `completed` | Remaining seconds reached zero |

**Do:**
- ✅ Use decorator to format output like mm:ss or resend-in text
- ✅ Keep countdown purpose visible nearby

**Don't:**
- ❌ Don't rely on this component for authoritative server time

### MCStepper

**Path**: `@moloco/moloco-cloud-react-ui`

Step indicator for multi-step forms/flows. Uses a children-based pattern with MCStepper.Step sub-components.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `activeStep` | `number` | ✓ |  | 0-based active step index |
| `onActiveStepChange` | `(index: number) => void` | ✓ |  | Callback when user clicks a step to navigate |
| `children` | `ReactElement<MTStepProps> | ReactElement<MTStepProps>[]` | ✓ |  | MCStepper.Step elements as children |

```tsx
<MCStepper activeStep={currentStep} onActiveStepChange={setCurrentStep}>
  <MCStepper.Step title="Basic Info" />
  <MCStepper.Step title="Targeting" />
  <MCStepper.Step title="Creative" />
  <MCStepper.Step title="Review" />
</MCStepper>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `active` | Currently active step |
| `completed` | Step has been completed |
| `disabled` | Step is not clickable |

**Do:**
- ✅ Use for multi-step flows (wizards, onboarding)
- ✅ Show step count clearly
- ✅ Use MCStepper.Step children — do NOT pass steps as a string array

**Don't:**
- ❌ Don't use for more than 6 steps
- ❌ Don't pass steps: string[] prop — it does not exist; use MCStepper.Step children instead

---

## Shared Styled

Shared styled components. Import from '@msm-portal/common/component/styled'.

**Import from**: `@msm-portal/common/component/styled`

### SCBoldLabel

Bold label using H_5.fontWeight.

```tsx
<SCBoldLabel>Bold text</SCBoldLabel>
```

### SCClickableText

Clickable underlined text. Uses content.contentAccent color.

```tsx
<SCClickableText onClick={handleClick}>Click here</SCClickableText>
```

---

## Moloco UI Primitives

Used directly from @moloco/moloco-cloud-react-ui without portal wrapping.

**Import from**: `@moloco/moloco-cloud-react-ui`

### MCIcon

Core Moloco icon primitive used for rendering MTIcon-based icons across the portal.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `icon` | `MTIcon` | ✓ |  | Icon name from the MTIcon type |
| `width` | `number` |  | 24 | Icon width in px |
| `height` | `number` |  | 24 | Icon height in px |
| `inheritColor` | `boolean` |  |  | Inherit color from parent instead of using default |

### MCStack

Core Moloco flex layout helper for horizontal or vertical stacking with spacing.

### MCSingleTextInput

Raw single-line text input primitive intended for controlled usage outside Formik wrappers.

### MCSingleTextArea

Raw multi-line textarea primitive intended for controlled usage outside Formik wrappers.

### MCTextEllipsis

Single-line text truncation primitive that applies ellipsis when content overflows.

### MCMarkdownTooltip

Tooltip primitive that can render markdown-formatted content for richer help text.

### MCBarTab

Low-level bar-tab primitive used internally when composing custom tab bars.

### MCBarTabIndicator

Low-level visual indicator primitive paired with MCBarTab in custom tab bars.

---

## Table

Table and tabular-data display components used for reporting and dense list views.

### MCReportTable

**Path**: `report-table/`

Advanced data table with sorting, pagination, row actions, and typed cell renderers. Built on top of ag-grid or similar table engine.

**Generic**: T — the row data type

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `data` | `T[]` | ✓ |  | Array of row data objects |
| `columns` | `Array<MCReportTableColumn<T>>` | ✓ |  | Column definitions with field, header, cellRenderer, sortHandler |
| `isLoading` | `boolean` |  |  | Shows skeleton loading state |
| `emptyMessage` | `ReactNode` |  |  | Content shown when data is empty |
| `onRowClick` | `(row: T) => void` |  |  | Row click handler |
| `defaultSortField` | `string` |  |  | Initial sort column field name |
| `defaultSortDirection` | `'asc' | 'desc'` |  |  | Initial sort direction |
| `pagination` | `boolean` |  | true | Enable pagination controls |
| `pageSize` | `number` |  | 25 | Rows per page |

```tsx
import MCReportTable from '@msm-portal/common/component/report-table';
import { getActionsCellRenderer, getMoneyCellRenderer, getDateCellRenderer } from '@msm-portal/common/component/table/cell-renderer';
import { tableCaseInsensitiveSortHandler } from '@msm-portal/common/component/table/sort-handler';

const columns = [
  { field: 'name', header: t('column.name'), sortHandler: tableCaseInsensitiveSortHandler },
  { field: 'budget', header: t('column.budget'), cellRenderer: getMoneyCellRenderer('USD') },
  { field: 'createdAt', header: t('column.created'), cellRenderer: getDateCellRenderer('YYYY-MM-DD') },
  { field: 'actions', header: '', cellRenderer: getActionsCellRenderer(actionItems) },
];

<MCReportTable
  data={campaigns}
  columns={columns}
  isLoading={isFetching}
  onRowClick={(row) => navigateToDetail(row.id)}
  defaultSortField="createdAt"
  defaultSortDirection="desc"
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Table with data rows |
| `loading` | Skeleton rows shown |
| `empty` | No data — shows emptyMessage |
| `sorted` | Column sort applied |

**Do:**
- ✅ Use cell renderer functions from table/cell-renderer/ for consistent formatting
- ✅ Use sort handler functions from table/sort-handler/ for correct sorting
- ✅ Provide emptyMessage with a call to action (see EmptyState pattern)
- ✅ Use onRowClick for navigation to detail pages

**Don't:**
- ❌ Don't create custom cell renderers if a standard one exists
- ❌ Don't hardcode column widths — let the table auto-size
- ❌ Don't use for fewer than 3 rows — use a simple list instead

### MCI18nTable

**Path**: `table/i18n/MCI18nTable.tsx`

Localized wrapper around Moloco MCTable. Injects table labels from i18n so empty, pagination, and page indicator text stay translated consistently.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `data` | `D[]` | ✓ |  | Row data forwarded to the underlying MCTable |
| `columns` | `ComponentProps<typeof MCTable<D>>['columns']` | ✓ |  | Column definitions forwarded to the underlying MCTable |
| `isLoading` | `boolean` |  |  | Optional loading state handled by the underlying table |

```tsx
<MCI18nTable
  data={rows}
  columns={columns}
  isLoading={isLoading}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Table is rendered with translated labels |
| `loading` | Underlying table loading state |
| `empty` | Empty labels and try-fewer-filters copy come from i18n |

**Do:**
- ✅ Prefer this over raw MCTable when Portal-standard translations are desired

**Don't:**
- ❌ Don't duplicate custom pagination vocabulary in every screen

### MCTableActionBar

**Path**: `table/action-bar/MCTableActionBar.tsx`

Horizontal action row that separates left-aligned context controls from right-aligned page or table actions.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `leftComponent` | `ReactNode` |  |  | Content aligned to the left side of the bar |
| `rightComponent` | `ReactNode` |  |  | Content aligned to the right side of the bar |

```tsx
<MCTableActionBar
  leftComponent={<div>{totalCount} items</div>}
  rightComponent={<MCButton2 color="primary">Create</MCButton2>}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Both left and right regions can render content |
| `left-only` | Only the left region is populated |
| `right-only` | Only the right region is populated |

**Do:**
- ✅ Use it to keep table-region controls visually consistent across list pages

**Don't:**
- ❌ Don't use it as a substitute for the page header contract

### Cell Renderers

**Import from**: `src/common/component/table/cell-renderer/`

| Function | Usage |
|----------|-------|
| `getActionsCellRenderer` | Renders MCMoreActionsButton. Arg: action items array |
| `getStringWithClickCellRenderer` | Clickable string cell |
| `getTitleWithTooltipCellRenderer` | Title with info tooltip |
| `getMoneyCellRenderer` | Formatted currency. Arg: currency code |
| `getPercentageCellRenderer` | Formatted percentage |
| `getNumberCellRenderer` | Formatted number |
| `getDateCellRenderer` | Formatted date. Arg: format string |
| `getTimeIntervalCellRenderer` | Duration/interval |
| `getSwitchCellRenderer` | Toggle switch in cell |
| `getUserCellRenderer` | User avatar + name |
| `getFileSizeCellRenderer` | Human-readable file size |

### Sort Handlers

**Import from**: `src/common/component/table/sort-handler/`

| Function | Usage |
|----------|-------|
| `tableCaseInsensitiveSortHandler` | String sort (case insensitive) |
| `getTableTimestampSortHandler` | Date/timestamp sort |
| `getTableTimeRangeSortHandler` | Time range sort |

---

## Layout

Page-level layout components for structuring content areas.

### MCContentLayout

**Path**: `layout/content/MCContentLayout.tsx`

Standard page layout with breadcrumb, title, and optional right accessory. Used for list pages, detail pages, settings pages.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `title` | `ReactNode` | ✓ |  | Page title displayed in the header |
| `rightAccessory` | `ReactNode` |  |  | Content in the header right slot (e.g., create button) |
| `showBreadcrumb` | `boolean` |  |  | Shows MCBreadcrumb above the title |
| `useBodyStyle` | `boolean` |  | true | Applies default body padding styles |
| `fullHeight` | `boolean` |  |  | Makes wrapper take full height |

```tsx
import MCContentLayout from '@msm-portal/common/component/layout/content/MCContentLayout';
import { MCButton2 } from '@moloco/moloco-cloud-react-ui';

<MCContentLayout
  title={t('title')}
  rightAccessory={
    <MCButton2 color="primary" onClick={handleCreate} leftIcon="create">
      {t('create')}
    </MCButton2>
  }
  showBreadcrumb
>
  <MCBarTabs tabs={tabs} />
  {content}
</MCContentLayout>
```

**Do:**
- ✅ Use for all list/detail pages
- ✅ Always set showBreadcrumb for navigable pages
- ✅ Use rightAccessory for page-level primary action (Create button)

**Don't:**
- ❌ Don't use for form pages — use MCFormLayout instead
- ❌ Don't nest MCContentLayout inside MCFormLayout

### MCCircularLoader

**Path**: `@moloco/moloco-cloud-react-ui`

Full-page or inline circular loading spinner from Moloco UI.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `fillParent` | `boolean` |  |  | Centers loader in parent container, fills available space |

```tsx
import { MCCircularLoader } from '@moloco/moloco-cloud-react-ui';

// Full page loading
if (isLoading) return <MCCircularLoader fillParent />;

// Conditional rendering
return isFetching || !data
  ? <MCCircularLoader fillParent />
  : <EntityDetail entity={data} />;
```

**Do:**
- ✅ Use MCCircularLoader with fillParent for full-page loading

**Don't:**
- ❌ Don't show loader for less than 300ms — use debounced loading state

### MCConfirmDialog

**Path**: `@moloco/moloco-cloud-react-ui`

Confirmation dialog with customizable cancel and confirm buttons. Used for destructive action confirmations.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `isOpen` | `boolean` | ✓ |  | Controls dialog visibility |
| `title` | `ReactNode` | ✓ |  | Dialog title |
| `cancelButtonOptions` | `{ label: string; leftIcon?: ReactNode; onClick: () => void; disabled?: boolean }` | ✓ |  | Cancel button configuration |
| `confirmButtonOptions` | `{ label: string; color?: string; leftIcon?: ReactNode; onClick: () => void; disabled?: boolean }` | ✓ |  | Confirm button configuration |
| `onClose` | `() => void` | ✓ |  | Close handler |
| `disableCloseButton` | `boolean` |  |  | Disables the X close button |

```tsx
<MCConfirmDialog
  isOpen={confirmOpen}
  title={t('dialog.title')}
  cancelButtonOptions={{
    label: t('dialog.cancel'),
    leftIcon: <MCIcon icon="delete" inheritColor />,
    onClick: handleDiscard,
  }}
  confirmButtonOptions={{
    label: t('dialog.confirm'),
    color: 'primary',
    leftIcon: <MCIcon icon="check" inheritColor />,
    onClick: handleConfirm,
  }}
  onClose={() => setConfirmOpen(false)}
>
  {t('dialog.message')}
</MCConfirmDialog>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Normal resting state |
| `open` | Dialog is visible |

**Do:**
- ✅ Use for destructive action confirmations
- ✅ Make cancel the safe/default action
- ✅ Clearly describe consequences in body text

**Don't:**
- ❌ Don't use for non-destructive confirmations
- ❌ Don't make the destructive action the default/highlighted button

---

## Auth Flows

User authentication flow components such as sign-in, two-factor verification, and password recovery.

### MCSignInForm

**Path**: `auth/form/sign-in/MCSignInForm.tsx`

Formik-based sign-in form with email and password fields, async submit handling, forgot-password shortcut, and auth error messaging.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `onSubmit` | `(data: { email: string; password: string }) => Promise<unknown> | unknown` | ✓ |  | Called after local validation when the user submits credentials |
| `onClickForgotPassword` | `() => void` | ✓ |  | Called when the forgot-password text action is selected |
| `autoSignOutType` | `MEAutoSignOutType` |  |  | Optional reason shown when the user was automatically signed out |

```tsx
<MCSignInForm
  onSubmit={handleSignIn}
  onClickForgotPassword={goToForgotPassword}
  autoSignOutType={autoSignOutType}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `idle` | Empty or partially completed sign-in form |
| `submitting` | Submit button disabled while async login is in flight |
| `error` | Auth error banner shown below the fields |

**Do:**
- ✅ Use the built-in auth translations instead of recreating the form layout
- ✅ Keep submit handling async-safe and return meaningful auth errors

**Don't:**
- ❌ Don't reuse this form for non-auth credential flows

### MCTFAForm

**Path**: `auth/form/sign-in/MCTFAForm.tsx`

Formik-based two-factor authentication form for six-digit verification codes, with retry-account action and auth error handling.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `onSubmit` | `(code: string) => Promise<void>` | ✓ |  | Called with the 6-digit verification code |
| `onSignOut` | `() => void` | ✓ |  | Called when the user opts to try another account |

```tsx
<MCTFAForm onSubmit={handleVerifyCode} onSignOut={handleTryAnotherAccount} />
```

**States:**

| State | Description |
|-------|-------------|
| `idle` | Code field ready for input |
| `submitting` | Form actions disabled while verification is in flight |
| `error` | Error message shown below the code field |

**Do:**
- ✅ Use for the second-factor step only
- ✅ Keep alternate-account behavior wired to a safe recovery path

**Don't:**
- ❌ Don't use this form for generic confirmation codes without reviewing copy and validation

### MCForgotPasswordForm

**Path**: `auth/form/forgot-password/MCForgotPasswordForm.tsx`

Formik-based password-reset request form with email validation, auth-specific error mapping, and a sign-in shortcut.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `onSubmit` | `(data: { email: string }) => Promise<unknown> | unknown` | ✓ |  | Called after local email validation when the user requests reset instructions |
| `onClickSignIn` | `() => void` | ✓ |  | Called when the user chooses to return to sign-in |

```tsx
<MCForgotPasswordForm onSubmit={handleForgotPassword} onClickSignIn={goToSignIn} />
```

**States:**

| State | Description |
|-------|-------------|
| `idle` | Email field ready for input |
| `submitting` | Submit button disabled while the request is in flight |
| `error` | Mapped error message shown below the field |

**Do:**
- ✅ Use for email-based password reset request screens
- ✅ Keep the sign-in recovery path visible

**Don't:**
- ❌ Don't use this as a generic newsletter or invite form

### MCPostForgotPassword

**Path**: `auth/form/forgot-password/MCPostForgotPassword.tsx`

Follow-up confirmation screen shown after a password reset request. Reuses the auth layout and can optionally warn about expired password updates.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `disabled` | `boolean` | ✓ |  | Disables the re-request button |
| `onSubmit` | `() => void` | ✓ |  | Called when the user requests another reset email |
| `isExpiredPasswordUpdate` | `boolean` | ✓ |  | Shows the expired-password warning banner when true |

```tsx
<MCPostForgotPassword
  disabled={isSubmitting}
  onSubmit={handleResend}
  isExpiredPasswordUpdate={false}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Instructional confirmation content is shown |
| `expiredPasswordUpdate` | Warning banner is shown above the instructions |
| `disabled` | Re-request button is disabled |

**Do:**
- ✅ Use immediately after a successful forgot-password request
- ✅ Show the expired-password warning only when that flow is active

**Don't:**
- ❌ Don't present this as a generic success pattern outside auth recovery

---

## Ad Pacing Dashboard

Shared components used together to configure, customize, and render the ad pacing dashboard experience.

### MCAdPacingDashboardConfigurator

**Path**: `ad-pacing-dashboard/MCAdPacingDashboardConfigurator.tsx`

Configuration bar for the ad pacing dashboard. Combines last-updated timer text, date-range selection, and the column settings trigger.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `configuration` | `MTAdPacingDashboardConfiguration` | ✓ |  | Current dashboard configuration including the selected date range |
| `updateConfiguration` | `(newConfiguration: MTAdPacingDashboardConfiguration) => void` | ✓ |  | Called when the date range changes |
| `onClickColumnButton` | `() => void` | ✓ |  | Opens the column configurator |
| `updatedAt` | `number` | ✓ |  | Last refresh timestamp used to show the update message |
| `timezone` | `string` | ✓ |  | Timezone used to format the last-updated timestamp |
| `timerIntervalSec` | `number` | ✓ |  | Countdown interval until the next auto refresh |

```tsx
<MCAdPacingDashboardConfigurator
  configuration={configuration}
  updateConfiguration={setConfiguration}
  onClickColumnButton={() => setColumnDialogOpen(true)}
  updatedAt={updatedAt}
  timezone={timezone}
  timerIntervalSec={60}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `default` | Configuration controls are visible |
| `withTimer` | Last-updated message and countdown are shown when updatedAt is present |

**Do:**
- ✅ Use as the standard top control bar for pacing dashboard pages
- ✅ Keep the timezone aligned with the page's reporting context

**Don't:**
- ❌ Don't reuse this toolbar for unrelated report pages

### MCAdPacingDashboardColumnConfigurator

**Path**: `ad-pacing-dashboard/MCAdPacingDashboardColumnConfigurator.tsx`

Column-selection panel for the ad pacing dashboard. Lets the user toggle visible dashboard columns and apply the new selection.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `availableColumnKeys` | `Array<MTAdPacingDashboardColumnKey>` | ✓ |  | All selectable ad pacing dashboard column keys |
| `columnKeys` | `Array<MTAdPacingDashboardColumnKey>` | ✓ |  | Currently enabled column keys |
| `updateColumnKeys` | `(newColumnKeys: Array<MTAdPacingDashboardColumnKey>) => void` | ✓ |  | Called when the user applies a new column selection |
| `onClose` | `() => void` | ✓ |  | Called when the panel closes or the user cancels |

```tsx
<MCAdPacingDashboardColumnConfigurator
  availableColumnKeys={availableColumnKeys}
  columnKeys={columnKeys}
  updateColumnKeys={setColumnKeys}
  onClose={() => setOpen(false)}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `editing` | User is choosing which columns should be enabled |

**Do:**
- ✅ Use for ad pacing dashboard column customization only
- ✅ Keep apply/cancel actions visible at the bottom

**Don't:**
- ❌ Don't auto-apply changes on each checkbox toggle

### MCAdPacingDashboardTable

**Path**: `ad-pacing-dashboard/MCAdPacingDashboardTable.tsx`

Domain table for ad pacing data. Combines report-table sorting, filtering, CSV export, and pacing-specific columns/actions.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `data` | `Array<MTAdPacingData>` | ✓ |  | Raw ad pacing rows |
| `columnKeys` | `Array<MTAdPacingDashboardColumnKey>` | ✓ |  | Visible dashboard column keys |
| `columnKeysToExport` | `Array<MTAdPacingDashboardColumnKey>` | ✓ |  | Column keys included in CSV export |
| `timezone` | `string` | ✓ |  | Timezone used in CSV file naming |
| `currency` | `MECurrency` | ✓ |  | Currency used for monetary column rendering |
| `maximumPriority` | `number` | ✓ |  | Highest priority value available for priority controls |
| `keyLabelMap` | `MTAdPacingLabelMap` | ✓ |  | Translated or domain label map for pacing keys |
| `keyValueLabelMap` | `MTAdPacingKeyValueLabelMap` | ✓ |  | Value label map used by pacing columns |
| `onPriorityChange` | `(campaignId: string, newPriority: number) => Promise<void>` | ✓ |  | Called when a row priority is changed |
| `onClickOrderTitle` | `(row: MTAdPacingData) => void` | ✓ |  | Called when the order title cell is activated |
| `isFetching` | `boolean` |  |  | Disables filter/export actions and shows table loading state |

```tsx
<MCAdPacingDashboardTable
  data={rows}
  columnKeys={columnKeys}
  columnKeysToExport={columnKeysToExport}
  timezone={timezone}
  currency={currency}
  maximumPriority={maximumPriority}
  keyLabelMap={keyLabelMap}
  keyValueLabelMap={keyValueLabelMap}
  onPriorityChange={handlePriorityChange}
  onClickOrderTitle={handleOpenOrder}
  isFetching={isFetching}
/>
```

**States:**

| State | Description |
|-------|-------------|
| `loading` | Filter/export actions disabled and table loading shown |
| `ready` | Rows, filters, sorting, and export are available |

**Do:**
- ✅ Use when the full ad pacing dashboard table experience is needed
- ✅ Keep visible columns and export columns intentionally aligned

**Don't:**
- ❌ Don't reuse this as a generic reporting table

---

## Empty State

Patterns for when there is no data to display.

### EmptyState

Composition pattern for empty data views. Combine MCStack + MCIcon + text + MCButton2.

```tsx
import styled from 'styled-components';
import { MCStack, MCIcon, MCButton2 } from '@moloco/moloco-cloud-react-ui';

const SCEmptyStateWrapper = styled.div`
  padding: ${(props) => props.theme.mcui.spacing(8, 0)};
`;

const SCEmptyStateTitle = styled.div`
  font-size: ${(props) => props.theme.mcui.typography.H_4.size};
  font-weight: ${(props) => props.theme.mcui.typography.H_4.fontWeight};
  color: ${(props) => props.theme.mcui.palette.content.primary};
`;

const SCEmptyStateDescription = styled.div`
  font-size: ${(props) => props.theme.mcui.typography.BODY_2.size};
  color: ${(props) => props.theme.mcui.palette.content.secondary};
`;

<SCEmptyStateWrapper>
  <MCStack direction="column" alignItems="center" spacing={3}>
    <MCIcon icon="inbox" width={48} height={48} />
    <SCEmptyStateTitle>No campaigns yet</SCEmptyStateTitle>
    <SCEmptyStateDescription>Create your first campaign to get started.</SCEmptyStateDescription>
    <MCButton2 color="primary" leftIcon="create" onClick={handleCreate}>Create Campaign</MCButton2>
  </MCStack>
</SCEmptyStateWrapper>
```

**Do:**
- ✅ Show a clear message explaining why there's no data
- ✅ Provide a primary action to create/add the first item
- ✅ Use a relevant icon to reinforce the message

**Don't:**
- ❌ Don't show an empty table with just headers
- ❌ Don't leave the user without a next action

---

## Library Primitives

Additional components from @moloco/moloco-cloud-react-ui used directly without portal wrapping. Read type definitions for full API.

**Import from**: `@moloco/moloco-cloud-react-ui`

### MCButton

Legacy button component. Prefer MCButton2 for new code. Still used in some older portal areas.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `variant` | `'contained' | 'text' | 'icon'` |  |  | Button style variant |
| `size` | `'large' | 'default' | 'small'` |  |  | Button size |
| `color` | `'primary' | 'secondary' | 'danger' | 'default'` |  |  | Button color |
| `leftIcon` | `ReactNode` |  |  | Icon before label |
| `rightIcon` | `ReactNode` |  |  | Icon after label |
| `onClick` | `(event: React.MouseEvent<HTMLElement>) => void` |  |  | Click handler |
| `testId` | `string` |  |  | Test ID |

### MCBanner

Notification banner for page-level messages. Supports info, warning, and critical variants.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `variant` | `'info' | 'warning' | 'critical'` | ✓ |  | Banner type determining color and icon |
| `fill` | `boolean` |  |  | Full-width filled background style |
| `dense` | `boolean` |  |  | Compact padding for inline use |
| `singleLine` | `boolean` |  |  | Constrains content to a single line |
| `onClose` | `() => void` |  |  | Close/dismiss handler. Shows close button when provided. |
| `className` | `string` |  |  | Additional CSS class |

```tsx
<MCBanner variant="warning" onClose={handleDismiss}>
  This campaign has limited budget remaining.
</MCBanner>
```

### MCSearchBar

Search input with debounce support, loading indicator, and optional border/shadow styling.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `searchWord` | `string` | ✓ |  | Controlled search value |
| `setSearchWord` | `React.Dispatch<React.SetStateAction<string>>` | ✓ |  | State setter for search value |
| `placeholder` | `string` |  |  | Input placeholder text |
| `border` | `boolean` |  |  | Show border around input |
| `shadow` | `boolean` |  |  | Show box shadow |
| `highlightBorder` | `boolean` |  |  | Highlight border on focus |
| `isLoading` | `boolean` |  |  | Show loading spinner |
| `disabled` | `boolean` |  |  | Disabled state |
| `square` | `boolean` |  |  | Square corners instead of rounded |
| `debounceTimeout` | `number` |  |  | Debounce delay in ms |
| `onKeyDown` | `(event: React.KeyboardEvent<HTMLInputElement>) => void` |  |  | Key down handler |
| `testId` | `string` |  |  | Test ID |

```tsx
const [searchWord, setSearchWord] = useState('');

<MCSearchBar
  searchWord={searchWord}
  setSearchWord={setSearchWord}
  placeholder="Search campaigns..."
  border
  debounceTimeout={300}
/>
```

### MCTag

Styled inline tag/label for categorization. Fully customizable via style props.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `ReactNode` | ✓ |  | Tag content (text label) |
| `padding` | `CSSProperties['padding']` |  |  | Custom padding |
| `margin` | `CSSProperties['margin']` |  |  | Custom margin |
| `border` | `CSSProperties['border']` |  |  | Custom border |
| `borderRadius` | `CSSProperties['borderRadius']` |  |  | Custom border radius |
| `fontSize` | `CSSProperties['fontSize']` |  |  | Custom font size |
| `fontColor` | `CSSProperties['color']` |  |  | Text color |
| `fontWeight` | `CSSProperties['fontWeight']` |  |  | Font weight |
| `backgroundColor` | `CSSProperties['backgroundColor']` |  |  | Background color |

```tsx
<MCTag backgroundColor="#E3F2FD" fontColor="#1565C0" fontSize="12px" borderRadius="4px" padding="2px 8px">
  Beta
</MCTag>
```

### MCBoxTab

Box-style tab components for segmented tab navigation. Consists of MCBoxTabsWrapper, MCBoxTabs, MCBoxTab, and MCBoxTabIndicator styled components.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `$height (MCBoxTabsWrapper)` | `string` |  |  | Container height |
| `$underline (MCBoxTabsWrapper)` | `boolean` |  |  | Show underline on container |
| `$indent (MCBoxTabsWrapper)` | `string` |  |  | Left indent |
| `$fontSize (MCBoxTab)` | `string` |  |  | Tab font size |
| `$minWidth (MCBoxTab)` | `string` |  |  | Tab minimum width |
| `$active (MCBoxTab)` | `boolean` |  |  | Whether this tab is active |

```tsx
<MCBoxTabsWrapper $underline>
  <MCBoxTabs>
    <MCBoxTab $active={activeTab === 0} onClick={() => setActiveTab(0)}>Tab 1</MCBoxTab>
    <MCBoxTab $active={activeTab === 1} onClick={() => setActiveTab(1)}>Tab 2</MCBoxTab>
  </MCBoxTabs>
  <MCBoxTabIndicator />
</MCBoxTabsWrapper>
```

### MCCollapse

Animated collapse/expand wrapper. Re-exports Material UI Collapse component.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `in` | `boolean` | ✓ |  | Controls expanded/collapsed state |
| `timeout` | `number | 'auto' | { enter?: number; exit?: number }` |  |  | Animation duration in ms |
| `collapsedSize` | `string | number` |  | '0px' | Height when collapsed |
| `unmountOnExit` | `boolean` |  |  | Unmount children when collapsed |

```tsx
<MCCollapse in={isExpanded} timeout="auto" unmountOnExit>
  <div>Collapsible content here</div>
</MCCollapse>
```

### MCMarkdown

Renders markdown text as HTML using the Remarkable library.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `markdownText` | `string` | ✓ |  | Markdown string to render |
| `renderOption` | `Remarkable.Options` |  |  | Remarkable rendering options |

```tsx
<MCMarkdown markdownText="**Bold** and _italic_ text with [links](https://example.com)" />
```

### MCChip

Removable chip/tag component for displaying selected options with optional remove action.

**Generic**: OptionType — the option data type

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `option` | `OptionType` | ✓ |  | The option data to display (must have label property) |
| `disabled` | `boolean` |  |  | Disabled state |
| `onRemove` | `(option: OptionType) => void` |  |  | Remove handler. Shows remove button when provided. |
| `fullWidth` | `boolean` |  |  | Chip takes full container width |
| `readOnly` | `boolean` |  |  | Read-only state (no remove) |
| `isLost` | `boolean` |  |  | Visual indicator for lost/invalid option |
| `customLabelComponent` | `React.ComponentType<{ option: OptionType }>` |  |  | Custom label renderer |
| `testId` | `string` |  |  | Test ID |

```tsx
<MCChip
  option={{ value: 'us', label: 'United States', key: 'us' }}
  onRemove={(opt) => handleRemove(opt)}
/>
```

### MCDataTable

Virtualized data table with column reordering, resizing, frozen columns, and custom cell renderers. For high-performance tabular data.

**Generic**: Column data via MCDataTable.Column children

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `height` | `number` | ✓ |  | Table height in px |
| `rowHeight` | `number` | ✓ |  | Row height in px |
| `rowCount` | `number` | ✓ |  | Total number of rows |
| `columnWidths` | `number[]` | ✓ |  | Array of column widths in px |
| `children` | `ReactElement<MTDataTableColumnProps>[]` |  |  | MCDataTable.Column elements |
| `width` | `number` |  |  | Table width in px |
| `enableColumnReordering` | `boolean` |  |  | Allow column drag reordering |
| `enableColumnResizing` | `boolean` |  |  | Allow column width resizing |
| `enableSubHeader` | `boolean` |  |  | Enable sub-header row |
| `enableFooter` | `boolean` |  |  | Enable footer row |
| `frozenColumnCount` | `number` |  |  | Number of frozen left columns |
| `loading` | `boolean` |  |  | Loading state |
| `overscanCount` | `number` |  |  | Number of extra rows to render outside viewport |
| `onColumnWidthsChanges` | `(columnIndex: number, width: number) => void` |  |  | Column resize handler |
| `onColumnsReordered` | `(oldIndex: number, newIndex: number) => void` |  |  | Column reorder handler |
| `onHeaderColumnClick` | `(columnIndex: number) => void` |  |  | Header click handler (for sorting) |
| `testId` | `string` |  |  | Test ID |

### MCSelect

Standalone select dropdown (not Formik-integrated). Built on react-select.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `options` | `Array<{ label: string; value: any; extra?: any }>` | ✓ |  | Select options |
| `onChange` | `(value: any) => void` | ✓ |  | Change handler |
| `value` | `MTSelectOption | null` |  |  | Currently selected option |
| `name` | `string` |  |  | Input name attribute |
| `label` | `string` |  |  | Label text |
| `required` | `boolean` |  |  | Required indicator |
| `hint` | `string` |  |  | Hint text below select |
| `isSearchable` | `boolean` |  |  | Allow typing to search options |
| `isDisabled` | `boolean` |  |  | Disabled state |
| `width` | `'small' | 'medium' | 'full'` |  |  | Select width preset |
| `readOnly` | `boolean` |  |  | Read-only state |
| `testId` | `string` |  |  | Test ID |

```tsx
<MCSelect
  options={[{ label: 'Active', value: 'active' }, { label: 'Paused', value: 'paused' }]}
  value={selectedOption}
  onChange={setSelectedOption}
  label="Status"
/>
```

### MCDatePicker

Standalone date picker input. Not Formik-integrated.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `value` | `Date | null` | ✓ |  | Selected date value |
| `onChange` | `(newDate: Date | null) => void` | ✓ |  | Date change handler |
| `placeholder` | `string` |  |  | Input placeholder |
| `minDate` | `Date` |  |  | Minimum selectable date |
| `maxDate` | `Date` |  |  | Maximum selectable date |
| `timezone` | `string` |  |  | Timezone for date display |
| `disabled` | `boolean` |  |  | Disabled state |
| `isError` | `boolean` |  |  | Error state visual indicator |
| `inputWidth` | `string` |  |  | Input element width |
| `useResponsive` | `boolean` |  |  | Responsive layout mode |
| `datePickerPopperRef` | `React.RefObject<HTMLDivElement>` |  |  | Ref for the picker popper element |
| `testId` | `string` |  |  | Test ID |

```tsx
<MCDatePicker
  value={startDate}
  onChange={setStartDate}
  placeholder="Select date"
  minDate={new Date()}
/>
```

### MCTimePicker

Standalone time picker input. Not Formik-integrated.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `value` | `Date | null` | ✓ |  | Selected time value |
| `onChange` | `(newDate: Date) => void` | ✓ |  | Time change handler |
| `placeholder` | `string` |  |  | Input placeholder |
| `timezone` | `string` |  |  | Timezone for display |
| `disabled` | `boolean` |  |  | Disabled state |
| `isError` | `boolean` |  |  | Error state visual indicator |
| `inputWidth` | `string` |  |  | Input element width |
| `useResponsive` | `boolean` |  |  | Responsive layout mode |
| `testId` | `string` |  |  | Test ID |

```tsx
<MCTimePicker
  value={selectedTime}
  onChange={setSelectedTime}
  placeholder="Select time"
/>
```

### MCDynamicDropdown

Async multi-select dropdown with paginated option loading, search, and popper-based positioning.

**Generic**: ValueType — the option value type (default: string)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `loadOptions` | `(params: { cursor?: string; searchText?: string; limit?: number }) => Promise<{ options: Array<{ label: string; value: ValueType }>; cursor: string; totalCount: number }>` | ✓ |  | Async function to load options with pagination |
| `onChange` | `(newValues: Array<{ label: string; value: ValueType }>) => void` | ✓ |  | Selection change handler |
| `value` | `Array<{ label: string; value: ValueType }>` | ✓ |  | Currently selected options |
| `popperPlacement` | `PopperProps['placement']` |  |  | Popper position relative to trigger |
| `clearable` | `boolean` |  |  | Allow clearing all selections |
| `disabled` | `boolean` |  |  | Disabled state |
| `limit` | `number` |  |  | Page size for option loading |
| `threshold` | `number` |  |  | Scroll threshold to trigger next page load |
| `leftFooterContent` | `ReactNode` |  |  | Custom content in dropdown footer left |
| `selectPlaceholder` | `string` |  |  | Placeholder for the select trigger |
| `searchPlaceholder` | `string` |  |  | Placeholder for the search input |
| `noOptionFoundLabel` | `string` |  |  | Text when no options match search |
| `confirmLabel` | `string` |  |  | Confirm button label |
| `loadMoreValueLabel` | `string` |  |  | Load more button label |

```tsx
<MCDynamicDropdown<string>
  loadOptions={async ({ cursor, searchText, limit }) => {
    const result = await fetchOptions({ cursor, searchText, limit });
    return { options: result.items, cursor: result.nextCursor, totalCount: result.total };
  }}
  value={selectedOptions}
  onChange={setSelectedOptions}
  selectPlaceholder="Select items..."
/>
```

### MCFilter

Multi-dimension filter component supporting number, string, option, and single-option filter types with an apply button.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `dimensions` | `MTDimension[]` | ✓ |  | Available filter dimensions (fields). Each dimension defines its valueType (number/string/option/singleOption) and options. |
| `onChange` | `(newFilters: MTFilter[]) => void` |  |  | Filter change handler |
| `filters` | `MTFilter[]` |  |  | Controlled filter state |
| `dirty` | `boolean` |  |  | Whether filters have unapplied changes |
| `showApplyButton` | `boolean` |  |  | Show an Apply button for batch filter application |
| `onApplyButtonClick` | `() => void` |  |  | Apply button click handler |
| `disabled` | `boolean` |  |  | Disabled state |
| `loading` | `boolean` |  |  | Loading state |
| `singleFilterPerDimension` | `boolean` |  |  | Allow only one filter per dimension |
| `supportBetweenOperator` | `boolean` |  |  | Enable between/not-between operators for number filters |
| `disableIsNot` | `boolean` |  |  | Disable excludes/is-not operators |
| `onDimensionChange` | `(selectedDimension: string) => void` |  |  | Callback when a dimension is selected (useful for lazy-loading dimension options) |
| `isOptionsForDimensionLoading` | `boolean` |  |  | Loading state for dimension options |
| `customLabel` | `{ addFilter?: string; apply?: string }` |  |  | Custom button labels |
| `emptyOptionStringAllowed` | `boolean` |  |  | Allow empty string as a filter option value |
| `testId` | `string` |  |  | Test ID |

**`MTDimension`**: `{ id: string; displayName: string; valueType: 'number' | 'string' | 'option' | 'singleOption'; options?: MTFilterOption[]; metadata?: any }`

**`MTFilter`**: `MTFilterForNumber | MTFilterForString | MTFilterForOption | MTFilterForSingleOption`

**`MTFilterOption`**: `{ displayName: string; value: string }`

### MCModal

Low-level modal wrapper. Re-exports react-modal. For most use cases, prefer MCCommonDialog or MCConfirmDialog.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `isOpen` | `boolean` | ✓ |  | Controls modal visibility |
| `onRequestClose` | `() => void` |  |  | Close request handler (Escape/overlay click) |
| `style` | `MIModalStyles (react-modal Styles)` |  |  | Custom overlay and content styles |
| `ariaHideApp` | `boolean` |  |  | Whether to hide app from screen readers when open |

- This is a thin re-export of react-modal. See react-modal docs for full API.

### MCPopper

Low-level popper positioning component. Re-exports Material UI Popper.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `open` | `boolean` | ✓ |  | Controls visibility |
| `anchorEl` | `HTMLElement | null` | ✓ |  | Anchor element for positioning |
| `placement` | `PopperProps['placement']` |  |  | Popper placement relative to anchor |
| `modifiers` | `object` |  |  | Popper.js modifiers for fine-grained positioning |

- This is a thin re-export of @material-ui/core Popper. See MUI docs for full API.

### MCStateIcon

State-specific icon component for entity lifecycle states. Different from MCIcon — renders state-specific colored icons.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `icon` | `'active' | 'brand-new' | 'completed' | 'denied' | 'draft' | 'inactive' | 'new' | 'paused' | 'ready' | 'scheduled' | 'submitted'` | ✓ |  | State icon name |
| `width` | `number | string` |  |  | Icon width |
| `height` | `number | string` |  |  | Icon height |

```tsx
<MCStateIcon icon="active" width={16} height={16} />
```

### MCSingleNumberInput

Standalone number input with formatting, prefix/suffix, and validation messages. Uses react-number-format internally.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `value` | `string` |  |  | Input value (string for formatting) |
| `onValueChange` | `(value: NumberFormatValues) => void` |  |  | Value change handler with formatted/unformatted values |
| `name` | `string` |  |  | Input name attribute |
| `label` | `string` |  |  | Label text |
| `labelWidth` | `string` |  |  | Label width |
| `placeholder` | `string` |  |  | Placeholder text |
| `prefix` | `string` |  |  | Value prefix (e.g., '$') |
| `suffix` | `string` |  |  | Value suffix (e.g., '%') |
| `disabled` | `boolean` |  |  | Disabled state |
| `error` | `boolean` |  |  | Error state |
| `errorMsg` | `string` |  |  | Error message text |
| `warningMsg` | `string` |  |  | Warning message text |
| `guideMsg` | `string` |  |  | Guide/info message text |
| `fullWidth` | `boolean` |  |  | Full-width input |
| `width` | `string` |  |  | Custom input width |
| `allowLeadingZeros` | `boolean` |  |  | Allow leading zeros |
| `allowNegative` | `boolean` |  |  | Allow negative numbers |
| `isAllowed` | `(value: NumberFormatValues) => boolean` |  |  | Custom validation function |
| `onBlur` | `(event: React.FocusEvent<HTMLInputElement>) => void` |  |  | Blur handler |
| `onFocus` | `(event: React.FocusEvent<HTMLInputElement>) => void` |  |  | Focus handler |
| `testId` | `string` |  |  | Test ID |

```tsx
<MCSingleNumberInput
  value={budget}
  onValueChange={({ floatValue }) => setBudget(floatValue)}
  prefix="$"
  placeholder="Enter budget"
/>
```

### MCDebounceInput

Generic debounced input wrapper. Wraps any input element with debounce behavior.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `value` | `any` | ✓ |  | Input value |
| `element` | `any` | ✓ |  | The input or textarea element/component to wrap |
| `debounceTimeout` | `number` |  |  | Debounce delay in ms |
| `onChange` | `(event: React.ChangeEvent) => void` |  |  | Debounced change handler |

- Also accepts all standard input/textarea HTML attributes

---

