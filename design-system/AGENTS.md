# Design System — Agent Guide

## Agent Skills

For step-by-step workflows, see the `skills/` directory:

| Skill | When to use |
|-------|------------|
| `skills/create-component/` | Creating a new React component |
| `skills/create-form/` | Building a form page with Formik |
| `skills/create-page/` | Building list/detail/create/edit pages |
| `skills/review-component/` | Reviewing existing component code |
| `skills/update-design-system/` | Adding/updating design system documentation |

Each skill has:
- `SKILL.md` — Step-by-step workflow (what to do, in what order)
- `instruction.md` — Domain knowledge (how to think, how to decide)

Always read `instruction.md` before starting a skill workflow.

## How to Read the JSON Files

### tokens.json
- `color.{text|background|border|icon}.tokens[]` — each has `name`, `token` (full theme path), `hex`, `usage`
- `spacing.values[]` — each entry has `multiplier`, `px`, `usage`, `category`
- `typography.tokens[]` — each has `name`, `token`, `usage`; properties are `.size`, `.fontWeight`, `.lineHeight`
- `breakpoints.values[]` — each has `name`, `value` (min-width), `description`
- `animation.durations[]` — each has `name`, `value`, `usage`
- `animation.easings[]` — each has `name`, `value` (cubic-bezier), `usage`
- `animation.patterns` — preset CSS transition strings for common interactions
- `darkMode.tokens.{text|background|border|icon|elevation}[]` — light/dark hex pairs

### components.json
- `categories[]` — groups of related components
- Each component: `name`, `path`, `props[]`, `example`, `formikRequired`
- Each prop: `name`, `type`, `required`, `default`, `description`
- MCIcon has an `iconCatalog` with categorized icon names and size guide

### patterns.json
- `patterns[]` — each has `id`, `name`, `when`, `code`
- The `code` field contains a complete, copy-pasteable example
- Includes 17 patterns: form-basic, form-full-page, edit-page, list-page, detail-page, create-page, delete-confirm-dialog, etc.

### conventions.json
- `namingPrefixes[]`, `fileNaming[]`, `importAliases[]`, `importOrder[]`
- `styledComponentRules[]`, `formComponentRules[]`
- `directoryStructure` — where to put files

## Decision Trees

### Which layout component?
- Building a **list page** (table with tabs)? → Use `MCContentLayout` with `MCBarTabs` (pattern: `list-page`)
- Building a **create form**? → Use `MCFormLayout` with breadcrumbs and footer (pattern: `create-page`)
- Building an **edit form**? → Use `MCFormLayout` + fetch existing data (pattern: `edit-page`)
- Building a **detail page**? → Use component-specific layout or `MCContentLayout` (pattern: `detail-page`)

### Which form component?
- Text input → `MCFormTextInput`
- Number input → `MCFormNumberInput`
- Multi-line text → `MCFormTextArea`
- Dropdown (single) → `MCFormSingleRichSelect`
- Dropdown (multi) → `MCFormMultiRichSelect`
- Inline chip multi-select → `MCFormInlineChipRichSelect`
- Checkbox → `MCFormCheckBox`
- Toggle → `MCFormSwitchInput`
- Radio buttons → `MCFormRadioGroup`
- Date range → `MCFormDateRangePicker`
- Date + time range → `MCFormDateTimeRangePicker`
- Visual card selector → `MCFormCardSelect`
- Color picker → `MCFormColorInput`
- Tag/chip input → `MCFormChipInput`
- Weekly schedule → `MCFormWeeklyTimeTablePicker`
- Frequency cap → `MCFormOptionalFrequencyInput`
- Video URL + skip → `MCFormSkippableVideoInput`

### Which icon size?
- Inline with body text / button → `width={16} height={16}`
- Nav items / standalone → `width={20} height={20}`
- Page headers → `width={24} height={24}`
- Empty state hero → `width={48} height={48}`

### Which animation timing?
- Hover / color change → `100ms` with `easing.default`
- Expand / show-hide → `200ms` with `easing.default`
- Modal open/close → `300ms` with `easing.enter` / `easing.exit`

### MCFormTextInput vs MCSingleTextInput?
- **MCFormTextInput** — Use this. It wraps MCSingleTextInput with Formik integration, label, error display, tooltip.
- **MCSingleTextInput** — Only use directly if NOT in a Formik context (rare).

## Available Scripts

| Script | Purpose |
|--------|---------|
| `npm run generate` | Regenerate docs/*.md from src/*.json |
| `npm run validate` | Validate JSON files against schemas |
| `npm run sync-check` | Check components.json ↔ codebase sync |
| `npm run generate:css` | Generate dist/tokens.css with CSS variables |

## Self-Validation Checklist

Before considering your output complete, verify:

1. [ ] All colors use `theme.mcui.palette.*` — zero hex codes
2. [ ] All spacing uses `theme.mcui.spacing()` — zero hardcoded px (except border-radius: 2px/4px)
3. [ ] All typography uses `theme.mcui.typography.*` — zero hardcoded font sizes
4. [ ] All styled components use `SC` prefix
5. [ ] All transient props use `$` prefix
6. [ ] All form fields inside `<Formik>` context with `name` prop
7. [ ] Components follow `MC/MT/SC/ME/use` naming
8. [ ] Imports follow order: React → 3rd party → @moloco → @msm-portal → relative
9. [ ] No inline styles
10. [ ] Route registered in all 3 locations (MERouteKey + routeTemplate + route.tsx)
11. [ ] All user-facing strings use i18n (`useTranslation`)
12. [ ] Loading states use `MCCircularLoader fillParent` or `MCLoader`
13. [ ] Errors handled with `useInAppAlert().fireCollapsibleError()`
14. [ ] 3-layer architecture: Page → Container → Component
15. [ ] Animations use design system duration + easing tokens
16. [ ] `prefers-reduced-motion` respected for animations
