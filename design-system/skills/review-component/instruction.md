# Domain Knowledge: Review Component

## The 16-Point Self-Validation Checklist

This is the authoritative compliance list. Every item is a hard requirement unless noted.

1. **Colors** — All colors use `theme.mcui.palette.*`. Zero hex codes in styled components or JSX.
2. **Spacing** — All spacing uses `theme.mcui.spacing()`. Zero hardcoded px values (exception: `border-radius: 2px` or `4px`).
3. **Typography** — All typography uses `theme.mcui.typography.*`. Zero hardcoded font sizes or font weights.
4. **SC prefix** — All styled components defined within a file use the `SC` prefix.
5. **Transient props** — All styled-component props that must not reach the DOM use `$` prefix.
6. **Formik context** — All form field components are inside `<Formik>` context and have the `name` prop.
7. **Naming prefixes** — Components use `MC`, types use `MT`, styled use `SC`, enums use `ME`, hooks use `use`.
8. **Import order** — React → 3rd party → @moloco → @msm-portal → relative.
9. **No inline styles** — Zero `style={{}}` attributes anywhere in the component tree.
10. **Route registration** — All 3 locations updated together (MERouteKey + routeTemplate + route.tsx).
11. **i18n** — All user-facing strings use `useTranslation`. Zero string literals in JSX output.
12. **Loading states** — `MCCircularLoader fillParent` for full-page, `MCLoader` for inline.
13. **Error handling** — `useInAppAlert().fireCollapsibleError()` for all errors; never raw `alert()`.
14. **3-layer architecture** — Page → Container → Component. Each layer contains only what belongs there.
15. **Animations** — Duration and easing from design tokens. `prefers-reduced-motion` respected.
16. **Touch targets** — All interactive elements are at least 44×44px.

## Common Mistakes and How to Spot Them

### Hardcoded hex colors
Look for: `#[0-9a-fA-F]{3,6}` in styled component template literals.
Fix: Replace with `props.theme.mcui.palette.*` equivalent from `tokens.json`.

### Hardcoded spacing
Look for: raw numbers followed by `px` in styled component templates (e.g., `padding: 16px`, `margin: 8px`).
Fix: Replace with `${(props) => props.theme.mcui.spacing(N)}`.

### Inline styles
Look for: `style={{` in JSX.
Fix: Extract to a `SC`-prefixed styled component.

### Missing fieldLabel
Look for: `MCFormTextInput` without a `fieldLabel` prop.
Fix: Add `fieldLabel` — required for accessibility (associates label with input).

### Skipped heading levels
Look for: an `H_2` typography token directly followed by `BODY_1_BODY` with no `H_3` in between, when the visual hierarchy requires a sub-heading.
Fix: Use `H_3` for panel-level titles, `H_2` for page-level sections.

### Navigation in component
Look for: `useNavigate` imported in a file under `component/` directory.
Fix: Move navigation to the container; pass callback as a prop.

### Data fetching in component
Look for: `trpc.`, `useQuery`, `useMutation`, or `fetch(` in a file under `component/` directory.
Fix: Move to container; pass data as prop.

### Missing `$` prefix on transient props
Look for: styled component props that are not standard HTML attributes and lack the `$` prefix.
React will warn: "Unknown prop `isActive` on <div> tag."
Fix: Rename to `$isActive` in both the styled component definition and its usage.

### String literals in JSX
Look for: quoted English text directly inside JSX (e.g., `<h1>Campaign List</h1>`).
Fix: Replace with `t('key')` and add the key to the i18n resource file.

### setSubmitting not reset on error
Look for: `async (values, { setSubmitting }) => { ... }` where `setSubmitting(false)` is only in the success path.
Fix: Wrap mutation in try/catch/finally; call `setSubmitting(false)` in `finally`.

## Token Verification Technique

To check for hardcoded values in a file without running grep yourself, scan for these patterns:
- Any 3 or 6 character hex string preceded by `#`
- Any integer followed by `px` in a template literal (excluding `border-radius`)
- Any numeric `font-size` or `font-weight` value

## A11y Verification Checklist

| Element type | What to check |
|-------------|---------------|
| Button | Has visible label (text or `aria-label`); responds to Enter and Space |
| Icon button | Has `aria-label`; icon has `aria-hidden="true"` |
| Form input | Has associated label via `fieldLabel` prop or `htmlFor`/`id` pair |
| Dialog | Traps focus; `role="dialog"`; `aria-labelledby` pointing to title |
| Error message | Announced via `role="alert"` or `aria-live="assertive"` |
| Loading spinner | Has `aria-label="Loading"` or equivalent |
| Table | Has `<caption>` or `aria-label`; `th` cells have `scope` attribute |
| Link | Has descriptive text; not just "click here" |

## Severity Classification

**Blocker** — ship-stopping issues:
- Any hardcoded token value (color, spacing, typography)
- Any user-facing string not using i18n
- Any form input outside Formik context
- Broken keyboard accessibility on interactive elements
- Missing route registration locations

**Warning** — should fix in the same PR when possible:
- Missing `fieldLabel` on form inputs (a11y risk)
- Incorrect naming prefix (MC/MT/SC/ME/use)
- Navigation or data fetching in component layer
- Missing loading state for async operations

**Suggestion** — improvements worth noting:
- Missing hint text on complex fields
- Could benefit from memoization (`useMemo`/`useCallback`)
- Additional edge case handling (empty state, single item)
- More descriptive i18n key names
