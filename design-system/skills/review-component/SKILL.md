# Skill: Review Component

**Purpose**: Systematically review an existing component or feature for correctness, quality, and compliance.
**Read first**: `instruction.md` in this directory for the full domain knowledge behind each check.

---

## Steps

### Step 1 — Read the source file
Read the component file being reviewed.
If it has a `styledComponents.tsx`, read that too.
If it has a container, read the container as well.

### Step 2 — Check architecture compliance
Verify the 3-layer separation:
- [ ] Page file contains zero hooks, zero logic — only renders the Container
- [ ] Container owns all hooks, data fetching, navigation, and i18n
- [ ] Component is a pure UI function — no hooks that cause side effects, no navigation

### Step 3 — Check token usage (no hardcoded values)
Scan for violations:
- [ ] No hex color codes (e.g., `#ffffff`, `#333`) in styled components or inline styles
- [ ] No hardcoded px spacing values outside of `border-radius: 2px` or `border-radius: 4px`
- [ ] No hardcoded font sizes or font weights
- [ ] No inline `style={{}}` attributes anywhere

Allowed: `border-radius: 2px`, `border-radius: 4px`, `1px solid` for borders when the color uses a theme token.

### Step 4 — Check naming conventions
- [ ] All exported components use `MC` prefix
- [ ] All internal styled components use `SC` prefix
- [ ] All TypeScript types and interfaces use `MT` prefix
- [ ] All enums use `ME` prefix
- [ ] All custom hooks use `use` prefix (camelCase)
- [ ] Transient styled-component props use `$` prefix

### Step 5 — Check styled component rules
- [ ] Styled components that must not forward props to DOM use `$` prefix on those props
- [ ] No styled components are exported unless shared across multiple components
- [ ] If more than 3 styled components exist in a single file, they live in `styledComponents.tsx`

### Step 6 — Check form compliance (if the component contains form inputs)
- [ ] All form inputs are inside a `<Formik>` context
- [ ] `MCFormTextInput` is used (not `MCSingleTextInput`) for form fields
- [ ] Every required field has a matching Yup `.required()` in the schema
- [ ] `required={false}` is explicit on optional fields (not omitted)
- [ ] Error handling uses `useInAppAlert().fireCollapsibleError()`
- [ ] Success handling uses `useInAppAlert().fireSuccess()`

### Step 7 — Check i18n compliance
- [ ] All user-facing strings use `t()` from `useTranslation` — no string literals in JSX
- [ ] The correct namespace is used (`container.{entity}.{action}` or `form.{entity}`)
- [ ] Pluralization and interpolation use `t()` with variables, not string concatenation

### Step 8 — Check accessibility
- [ ] Interactive elements are keyboard reachable via Tab
- [ ] Buttons and interactive controls respond to Enter/Space
- [ ] Focus ring is visible — no `outline: none` without replacement indicator
- [ ] All form fields have associated labels via `fieldLabel` prop or `aria-label`
- [ ] Dialogs trap focus and return focus to trigger on close
- [ ] Touch targets are at least 44×44px
- [ ] Color is not the only way to convey state (paired with text or icon)

### Step 9 — Check route registration (if a new page was added)
- [ ] `MERouteKey` enum has the new key
- [ ] `routeTemplate.tsx` has the route entry with `path`, `key`, and `handle.crumb`
- [ ] `route.tsx` maps the key to a page component with `allowedRoles`

### Step 10 — Check loading and error states
- [ ] Loading states use `<MCCircularLoader fillParent />` (full page) or `<MCLoader />` (inline)
- [ ] Query errors handled in `useEffect` with `fireCollapsibleError` + navigation away
- [ ] Mutation errors handled in `catch` with `fireCollapsibleError` (stay on page)
- [ ] `setSubmitting(false)` called in `finally` block for form submissions

### Step 11 — Check animation compliance (if animations are present)
- [ ] Animation durations use design token values (`theme.mcui.animation.durations.*`)
- [ ] Easing uses design token values (`theme.mcui.animation.easings.*`)
- [ ] `@media (prefers-reduced-motion: reduce)` disables all animations

### Step 12 — Check import order
Imports must follow this order:
1. React and react-related (`react`, `react-router-dom`)
2. Third-party libraries (`styled-components`, `formik`, `yup`)
3. Moloco UI library (`@moloco/moloco-cloud-react-ui`)
4. Internal portal imports (`@msm-portal/*`)
5. Relative imports (`./`, `../`)

### Step 13 — Compile findings
Categorize each finding:
- **Blocker** — must fix before ship (hardcoded tokens, missing i18n, broken a11y)
- **Warning** — should fix soon (naming inconsistency, missing hint text)
- **Suggestion** — nice to have (additional edge case handling)

### Step 14 — Report
Output a structured report:
```
## Review: {ComponentName}

### Blockers
- [file:line] description of issue and how to fix

### Warnings
- [file:line] description of issue

### Suggestions
- description

### Passed Checks
- List of checks that passed cleanly
```
