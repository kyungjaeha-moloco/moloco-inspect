<!-- AUTO-GENERATED — Do not edit directly. Edit src/tokens.json then run: node generate.mjs -->

# Design Tokens

> MSM Portal design tokens. All accessed via theme.mcui.* in styled-components.
> **Source**: `@moloco/moloco-cloud-react-ui` | **Version**: 3.0.0
> **Access pattern**: `props.theme.mcui.{category}.{token}`

---

## Color System

Semantic color system for AI agents. Tokens are classified by tier and grouped with their state variants.

**Naming**: `color.[property].[role].[emphasis].[state]`

**Roles**: `neutral`, `brand`, `success`, `warning`, `danger`, `information`, `disabled`, `selected`, `input`

### Text

Text and foreground colors

| Name | Token | Hex | Role | Usage |
|------|-------|-----|------|-------|
| `text.neutral.default` | `theme.mcui.palette.content.primary` | `#212121` | neutral | Default body text, main content |
| `text.neutral.subtle` | `theme.mcui.palette.content.secondary` | `#5D5D5D` | neutral | Labels, hints, subdued text, form field labels |
| `text.brand` | `theme.mcui.palette.content.contentAccent` | `#346bea` | brand | Links, clickable text, brand actions |
| `text.danger.default` | `theme.mcui.palette.content.negative` | `#dd1f11` | danger | Error messages, destructive action text |
| `text.success.default` | `theme.mcui.palette.content.positive` | `#429746` | success | Success messages, positive status text |
| `text.warning.default` | `theme.mcui.palette.content.warning` | `#ffca28` | warning | Warning messages, caution text |
| `text.information.default` | `theme.mcui.palette.content.informative` | `#0288D1` | information | Informational messages, help text |
| `text.disabled` | `theme.mcui.palette.content.disabled` | `#9E9E9E` | disabled | Disabled text, placeholder text |
| `text.inverse` | `theme.mcui.palette.content.inversePrimary` | `#FFFFFF` | neutral | Text on dark/colored backgrounds |
| `text.neutral.grey` | `theme.mcui.palette.content.grey` | `#bababa` | neutral | Grey text for very subdued content |
| `text.neutral.blueGrey` | `theme.mcui.palette.content.blueGrey` | `#6c7581` | neutral | Blue-grey text for navigation and secondary UI |

### Background

Surface and background colors

| Name | Token | Hex | Role | Usage |
|------|-------|-----|------|-------|
| `bg.neutral` | `theme.mcui.palette.background.primary` | `#FFFFFF` | neutral | Main surface, panels, headers, popovers |
| `bg.neutral.subtle` | `theme.mcui.palette.background.secondary` | `#F8F8F8` | neutral | Elevated surfaces, secondary backgrounds |
| `bg.neutral.subtler` | `theme.mcui.palette.background.tertiary` | `#f8f9fd` | neutral | Hover states, guide messages, subtle fills |
| `bg.transparent` | `theme.mcui.palette.background.borderless` | `transparent` | neutral | Transparent backgrounds |
| `bg.brand` | `theme.mcui.palette.foundation.assent` | `#346bea` | brand | Brand/primary action backgrounds (contained buttons) |
| `bg.danger.default` | `theme.mcui.palette.background.negative` | `#ffeae9` | danger | Error/danger background, error banners |
| `bg.danger.bold` | `theme.mcui.palette.foundation.negative` | `#dd1f11` | danger | Bold danger background (destructive buttons) |
| `bg.success.default` | `theme.mcui.palette.background.positive` | `#E8F5E9` | success | Success background, success banners |
| `bg.success.bold` | `theme.mcui.palette.foundation.positive` | `#429746` | success | Bold success background |
| `bg.warning.default` | `theme.mcui.palette.background.warning` | `#ffebad` | warning | Warning background, warning banners |
| `bg.warning.bold` | `theme.mcui.palette.foundation.warning` | `#ffca28` | warning | Bold warning background |
| `bg.information.default` | `theme.mcui.palette.background.informative` | `#E1F5FE` | information | Info background, info banners |
| `bg.information.bold` | `theme.mcui.palette.foundation.informative` | `#0288D1` | information | Bold info background |
| `bg.information.subtle` | `theme.mcui.palette.background.info` | `#ebf0fd` | information | Subtle info background, tooltips, help sections |
| `bg.disabled` | `theme.mcui.palette.background.disabled` | `#F5F5F5` | disabled | Disabled element backgrounds |
| `bg.selected` | `theme.mcui.palette.background.selected` | `#E3F2FD` | selected | Selected item background |
| `bg.input` | `theme.mcui.palette.background.input` | `#FFFFFF` | input | Form input backgrounds |

### Border

Border colors

| Name | Token | Hex | Role | Usage |
|------|-------|-----|------|-------|
| `border.neutral.default` | `theme.mcui.palette.border.primary` | `#ececec` | neutral | Standard borders, dividers, panel borders |
| `border.neutral.subtle` | `theme.mcui.palette.border.secondary` | `#ebf0fd` | neutral | Subtle borders, section separators |
| `border.brand.default` | `theme.mcui.palette.foundation.assent` | `#346bea` | brand | Focus rings, active state borders, selected borders |
| `border.danger.default` | `theme.mcui.palette.foundation.negative` | `#dd1f11` | danger | Error state borders on inputs |
| `border.success.default` | `theme.mcui.palette.foundation.positive` | `#429746` | success | Success state borders |
| `border.warning.default` | `theme.mcui.palette.foundation.warning` | `#ffca28` | warning | Warning state borders |
| `border.warning.subtle` | `theme.mcui.palette.border.warning` | `#ffdd74` | warning | Warning container borders |
| `border.black` | `theme.mcui.palette.border.black` | `#000` | neutral | Pure black borders |
| `border.disabled` | `theme.mcui.palette.border.disabled` | `#E0E0E0` | disabled | Disabled element borders |
| `border.input` | `theme.mcui.palette.border.input` | `#ececec` | input | Form input borders |

### Icon

Icon colors

| Name | Token | Hex | Role | Usage |
|------|-------|-----|------|-------|
| `icon.neutral` | `theme.mcui.palette.icon.primary` | `#8891a7` | neutral | Default icon color |
| `icon.neutral.subtle` | `theme.mcui.palette.icon.secondary` | `#5d5d5d` | neutral | Subdued icons, secondary actions |
| `icon.brand` | `theme.mcui.palette.icon.accent` | `#346bea` | brand | Brand/accent icons, active/selected state icons |
| `icon.danger` | `theme.mcui.palette.icon.critical` | `#dd1f11` | danger | Critical/error icons |
| `icon.action` | `theme.mcui.palette.icon.actionIcon` | `#bababa` | neutral | Action icons, toolbar icons |
| `icon.draft` | `theme.mcui.palette.icon.draft` | `#c7c7c7` | neutral | Draft status icons |
| `icon.primaryNav` | `theme.mcui.palette.icon.primaryNav` | `#6c7581` | neutral | Primary navigation icons |
| `icon.black` | `theme.mcui.palette.icon.black` | `#000` | neutral | Pure black icons |
| `icon.success.default` | `theme.mcui.palette.icon.positive` | `#429746` | success | Success/positive icons |
| `icon.warning.default` | `theme.mcui.palette.icon.warning` | `#ffca28` | warning | Warning icons |
| `icon.information.default` | `theme.mcui.palette.icon.informative` | `#0288D1` | information | Info icons |
| `icon.disabled` | `theme.mcui.palette.icon.disabled` | `#d0d8ea` | disabled | Disabled icons |
| `icon.inverse` | `theme.mcui.palette.icon.inversePrimary` | `#FFFFFF` | neutral | Icons on dark/colored backgrounds |

---

## Elevation

Elevation system combining surfaces and shadows to create depth hierarchy.

Apply surface color as background-color and shadow as box-shadow. Higher elevation = closer to user.

| Level | Surface | Shadow | Z-Index | Usage |
|-------|---------|--------|---------|-------|
| **sunken** | `#F8F8F8` | `none` | 0 | Page backgrounds, sidebar backgrounds, recessed areas |
| **default** | `#FFFFFF` | `none` | 1 | Base content areas, cards at rest, panels |
| **raised** | `#FFFFFF` | `0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)` | 100 | MCFormPanel, hoverable cards, draggable items |
| **overlay** | `#FFFFFF` | `0 4px 16px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08)` | 1000 | Modals (MCCommonDialog), popovers (MCPopover), dropdown menus, tooltips |

---

## Spacing

Function-based spacing system. Base unit is 8px. Base unit: **8px**.

```tsx
theme.mcui.spacing(n) where n × 8px = value
theme.mcui.spacing(v, h) or spacing(t, r, b, l) like CSS shorthand
```

| Call | Value | Category | Use Case |
|------|-------|----------|----------|
| `spacing(0.5)` | 4px | inline | Tight gap between icon and text |
| `spacing(1)` | 8px | inline | Inner padding small, icon gaps |
| `spacing(1.5)` | 12px | inset | Form field gap, small padding |
| `spacing(2)` | 16px | inset | Standard padding, row gaps |
| `spacing(3)` | 24px | stack | Section margin-bottom |
| `spacing(4)` | 32px | stack | Large section gaps, form action padding |
| `spacing(5)` | 40px | layout | Form title margin |
| `spacing(6)` | 48px | layout | Panel padding (MCFormPanel) |
| `spacing(8)` | 64px | layout | Extra-large layout spacing |

### Spacing Categories

| Category | Range | Description |
|----------|-------|-------------|
| **inline** | 4–12px | Spacing within elements: icon-text gaps, button internal padding, input internal padding |
| **inset** | 12–16px | Container padding: card padding, input padding, section insets |
| **stack** | 24–32px | Vertical gaps between elements: form field gaps, section gaps, panel gaps |
| **layout** | 40–64px | Page-level spacing: section margins, page padding, large gaps |

---

## Typography

Typography scale. Each token has size, fontWeight, lineHeight properties.

```tsx
theme.mcui.typography.{NAME}.{size|fontWeight|lineHeight}
```

### Headings

| Name | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| `H_1` | 34px | 400 | null | Dashboard number. Largest display text. |
| `H_2` | 28px | 400 | null | Page title |
| `H_2_SPECIAL` | 28px | 500 | null | Overview page title |
| `H_3` | 18px | 500 | null | Section title, panel titles (MCFormPanelTitle), form titles |
| `H_4` | 16px | 500 | null | Sub-section headings |
| `H_4_SPECIAL` | 16px | 400 | null | Dialog text |
| `H_5` | 14px | 700 | null | Selected menu, dashboard small number, bold labels (SCBoldLabel) |

### Body

| Name | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| `BUTTON_DEFAULT` | 14px | 500 | null | Default button text |
| `BUTTON_LARGE` | 14px | 500 | 16px | Large button text |
| `BUTTON_SMALL` | 12px | 500 | 14px | Small button text |
| `BODY_1_BODY` | 14px | 400 | 16px | Standard body text, form field labels, readonly input text |
| `BODY_1_PARAGRAPH` | 14px | 400 | 22px | Paragraph body text with generous line height |
| `BODY_2` | 12px | 400 | 20px | Secondary text, hints (MCFormHint), descriptions, subtitles |
| `BODY_2_SPECIAL` | 12px | 400 | 14px | Table body, LNB, small button text, error messages (MCFormFieldError) |
| `BODY_3` | 12px | 500 | null | Small text, captions, group labels in action menus |
| `BODY_4` | 10px | 500 | null | Extra small text, micro labels |
| `BODY_5` | 9px | 500 | null | Smallest text, fine print |

### Guidelines

**Accessibility:**
- Use only one H_1 per page
- Do not skip heading levels (e.g., H_1 → H_3)
- Minimum body text size: BODY_2 (12px) for readability
- Ensure sufficient contrast: text on backgrounds must meet WCAG AA (4.5:1 ratio)

**Best Practices:**
- Use H_3 for panel/card titles within MCFormPanel
- Use BODY_1_BODY for form labels and standard content
- Use BODY_2 for hints, descriptions, and secondary information
- Use BODY_2_SPECIAL only for form validation error messages
- Use BODY_3 sparingly — only for captions and tertiary information

---

## Font Family

`theme.mcui.fontFamily.default` — Applied globally in MCGlobalStyle to html and body

**Fallback**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`

---

## Border Radius

Border radius tokens for consistent corner rounding.

| Name | Value | Use Case |
|------|-------|----------|
| `radius.small` | `2px` | Panels (MCFormPanel), guide messages, subtle rounding |
| `radius.default` | `4px` | Buttons, inputs, popovers, cards, action items |
| `radius.large` | `8px` | Dialogs, large cards, modals |
| `radius.circle` | `50%` | Avatars, status dots, round buttons |

---

## Border Width

Border width tokens.

| Name | Value | Use Case |
|------|-------|----------|
| `border.width.default` | `1px` | Standard borders for panels, inputs, dividers |
| `border.width.bold` | `2px` | Focus rings, active tab indicator, emphasis borders |

---

## Layout Constants

Hardcoded layout constants defined in component files (not theme tokens)

| Constant | Value | File |
|----------|-------|------|
| `FORM_HEADER_HEIGHT` | `44px` | `form/layout/styledComponents.tsx` |
| `FORM_BODY_WIDTH` | `860px` | `form/layout/styledComponents.tsx` |
| `NAV_BAR_WIDTH` | `260px` | `navbar/SharedComponents.tsx` |

---

## Breakpoints

Responsive breakpoint system. Mobile-first: apply base styles, then override at larger breakpoints.

Use @media (min-width: {value}) for mobile-first responsive design.

| Name | Min Width | Description | Max Content Width |
|------|-----------|-------------|-------------------|
| `xs` | 0px | Mobile portrait and up (default base styles) | 100% |
| `sm` | 600px | Mobile landscape, small tablets | 600px |
| `md` | 900px | Tablets, small laptops | 900px |
| `lg` | 1200px | Desktops, laptops — primary MSM Portal target | 1200px |
| `xl` | 1536px | Large desktops, wide monitors | 1536px |

### Example

```tsx
const SCResponsiveContainer = styled.div`
  padding: ${(props) => props.theme.mcui.spacing(2)};

  @media (min-width: 900px) {
    padding: ${(props) => props.theme.mcui.spacing(4)};
  }

  @media (min-width: 1200px) {
    padding: ${(props) => props.theme.mcui.spacing(6)};
  }
`;
```

### Guidelines

- MSM Portal is primarily a desktop app — design for lg (1200px) first
- Use breakpoints for layout shifts (column count, sidebar visibility), not for minor spacing tweaks
- Always test at lg and xl breakpoints as these are the most common screen sizes
- Navbar collapses below md breakpoint

---

## Animation & Motion

Motion and animation tokens for consistent transitions and micro-interactions.

### Durations

| Name | Value | Usage |
|------|-------|-------|
| `duration.instant` | 0ms | No animation, immediate state change |
| `duration.fast` | 100ms | Hover states, color changes, opacity transitions |
| `duration.normal` | 200ms | Standard transitions: expand/collapse, show/hide, slide |
| `duration.slow` | 300ms | Complex animations: modal open/close, page transitions |
| `duration.slower` | 500ms | Emphasis animations: skeleton loading pulse, progress bars |

### Easings

| Name | Value | Usage |
|------|-------|-------|
| `easing.default` | `cubic-bezier(0.4, 0, 0.2, 1)` | Standard easing for most transitions (Material ease-in-out) |
| `easing.enter` | `cubic-bezier(0.0, 0, 0.2, 1)` | Elements entering the screen (decelerate) |
| `easing.exit` | `cubic-bezier(0.4, 0, 1, 1)` | Elements leaving the screen (accelerate) |
| `easing.sharp` | `cubic-bezier(0.4, 0, 0.6, 1)` | Elements that may return (temporary changes) |

### Common Patterns

| Pattern | CSS |
|---------|-----|
| `hover` | `transition: background-color 100ms cubic-bezier(0.4, 0, 0.2, 1)` |
| `expand` | `transition: height 200ms cubic-bezier(0.4, 0, 0.2, 1)` |
| `fadeIn` | `transition: opacity 200ms cubic-bezier(0.0, 0, 0.2, 1)` |
| `fadeOut` | `transition: opacity 150ms cubic-bezier(0.4, 0, 1, 1)` |
| `modalOpen` | `transition: transform 300ms cubic-bezier(0.0, 0, 0.2, 1), opacity 300ms cubic-bezier(0.0, 0, 0.2, 1)` |
| `slideIn` | `transition: transform 200ms cubic-bezier(0.0, 0, 0.2, 1)` |

### Guidelines

- Always use named duration + easing tokens instead of arbitrary values
- Respect prefers-reduced-motion: wrap animations in @media (prefers-reduced-motion: no-preference)
- Hover transitions should be fast (100ms) to feel responsive
- Modal/dialog animations should be slow (300ms) to feel intentional
- Never animate layout properties (width, height, top, left) — use transform instead

---

## Dark Mode

Dark mode semantic token mapping. Maps each light mode semantic token to its dark mode equivalent hex value.

> Dark mode is not yet active in MSM Portal. These mappings are prepared for future implementation.

**Activation**: Will use styled-components ThemeProvider to swap theme objects based on user preference.

### Text

| Name | Light | Dark |
|------|-------|------|
| `text.neutral.default` | `#212121` | `#E0E0E0` |
| `text.neutral.subtle` | `#5d5d5d` | `#9E9E9E` |
| `text.brand.default` | `#346bea` | `#608cf0` |
| `text.brand.hovered` | `#0260C9` | `#64B5F6` |
| `text.brand.pressed` | `#014599` | `#90CAF9` |
| `text.danger.default` | `#dd1f11` | `#fa786e` |
| `text.success.default` | `#429746` | `#6ed871` |
| `text.warning.default` | `#ffca28` | `#ffd452` |
| `text.information.default` | `#0288D1` | `#29B6F6` |
| `text.disabled` | `#9E9E9E` | `#616161` |
| `text.inverse` | `#FFFFFF` | `#212121` |
| `text.link.default` | `#346bea` | `#608cf0` |
| `text.link.hovered` | `#0260C9` | `#64B5F6` |
| `text.link.pressed` | `#014599` | `#90CAF9` |

### Background

| Name | Light | Dark |
|------|-------|------|
| `bg.neutral.default` | `#FFFFFF` | `#121212` |
| `bg.neutral.subtle` | `#f8f8f8` | `#1E1E1E` |
| `bg.neutral.subtler` | `#f8f9fd` | `#2C2C2C` |
| `bg.neutral.hovered` | `#EEEEEE` | `#333333` |
| `bg.neutral.pressed` | `#E0E0E0` | `#3D3D3D` |
| `bg.transparent` | `transparent` | `transparent` |
| `bg.brand.default` | `#346bea` | `#1e49aa` |
| `bg.brand.hovered` | `#0260C9` | `#1976D2` |
| `bg.brand.pressed` | `#014599` | `#1E88E5` |
| `bg.danger.default` | `#ffeae9` | `#3E1A1A` |
| `bg.danger.bold` | `#dd1f11` | `#c31818` |
| `bg.danger.bold.hovered` | `#c31818` | `#a11010` |
| `bg.danger.bold.pressed` | `#a11010` | `#8a0c0c` |
| `bg.success.default` | `#E8F5E9` | `#1B3D1E` |
| `bg.success.bold` | `#429746` | `#368139` |
| `bg.warning.default` | `#ffebad` | `#3E2C14` |
| `bg.warning.bold` | `#ffca28` | `#d8a509` |
| `bg.information.default` | `#E1F5FE` | `#0D2940` |
| `bg.information.bold` | `#0288D1` | `#0277BD` |
| `bg.disabled` | `#F5F5F5` | `#2C2C2C` |
| `bg.selected.default` | `#E3F2FD` | `#0D2940` |
| `bg.selected.hovered` | `#BBDEFB` | `#1A3D5C` |
| `bg.selected.bold` | `#346bea` | `#1e49aa` |
| `bg.input.default` | `#FFFFFF` | `#1E1E1E` |
| `bg.input.hovered` | `#FAFAFA` | `#252525` |
| `bg.input.disabled` | `#F5F5F5` | `#2C2C2C` |

### Border

| Name | Light | Dark |
|------|-------|------|
| `border.neutral.default` | `#ececec` | `#3D3D3D` |
| `border.neutral.subtle` | `#ebf0fd` | `#2C2C2C` |
| `border.brand.default` | `#346bea` | `#608cf0` |
| `border.danger.default` | `#dd1f11` | `#fa786e` |
| `border.success.default` | `#429746` | `#6ed871` |
| `border.warning.default` | `#ffca28` | `#ffd452` |
| `border.disabled` | `#E0E0E0` | `#3D3D3D` |
| `border.input.default` | `#ececec` | `#4D4D4D` |
| `border.input.focused` | `#346bea` | `#608cf0` |
| `border.input.error` | `#dd1f11` | `#fa786e` |

### Icon

| Name | Light | Dark |
|------|-------|------|
| `icon.neutral.default` | `#8891a7` | `#a6b1cc` |
| `icon.neutral.subtle` | `#5d5d5d` | `#9E9E9E` |
| `icon.brand.default` | `#346bea` | `#608cf0` |
| `icon.brand.hovered` | `#0260C9` | `#42A5F5` |
| `icon.danger.default` | `#dd1f11` | `#fa786e` |
| `icon.success.default` | `#429746` | `#6ed871` |
| `icon.warning.default` | `#ffca28` | `#ffd452` |
| `icon.information.default` | `#0288D1` | `#29B6F6` |
| `icon.disabled` | `#d0d8ea` | `#383d43` |
| `icon.inverse` | `#FFFFFF` | `#212121` |

### Elevation

| Name | Light Surface | Dark Surface |
|------|--------------|-------------|
| `sunken` | `#F8F8F8` | `#0A0A0A` |
| `default` | `#FFFFFF` | `#121212` |
| `raised` | `#FFFFFF` | `#1E1E1E` |
| `overlay` | `#FFFFFF` | `#2C2C2C` |

---

