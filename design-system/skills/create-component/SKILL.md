# Skill: Create Component

**Purpose**: Create a new reusable React component in the MSM Portal design system.
**Read first**: `instruction.md` in this directory.

---

## Steps

### Step 1 — Read available tokens
Read `design-system/src/tokens.json`.
Extract the color, spacing, and typography tokens you will need for this component.
Note the exact theme path (e.g., `theme.mcui.palette.content.primary`, `theme.mcui.spacing(2)`).

### Step 2 — Check for existing components
Read `design-system/src/components.json`.
Search for components with similar purpose to avoid duplicates.
If a suitable component already exists, stop and use it instead.

### Step 3 — Read naming and structure conventions
Read `design-system/src/conventions.json`.
Confirm the correct naming prefix, file pattern, and directory location for this component.

### Step 4 — Determine placement
Decide the component location:
- Shared across clients → `src/common/component/{component-name}/`
- Client-specific → `src/apps/{client}/component/{entity}/`

### Step 5 — Create the file structure
Create these four files under the component directory:

```
{ComponentName}.tsx         # Main component implementation
styledComponents.tsx        # All SC-prefixed styled components
types.ts                    # MT-prefixed type/interface definitions
index.ts                    # Barrel export
```

Only create `styledComponents.tsx` if there are more than 3 styled components.
If 3 or fewer, keep them in `{ComponentName}.tsx`.

### Step 6 — Implement the component
Write the component in `{ComponentName}.tsx`:
- Props type named `MTProps` (or `MT{ComponentName}Props` if exported)
- Import tokens via styled-components theme — never hardcode
- Add all required ARIA attributes and keyboard handlers
- Use `BODY_1_BODY` for standard text, `H_3` for panel titles
- Minimum 44×44px touch target for any interactive element

### Step 7 — Write styled components
Write all styled components in `styledComponents.tsx` (or inline if ≤3):
- `SC` prefix on every styled component name
- `$` prefix on every prop that must not reach the DOM
- All values via `props.theme.mcui.*` — zero hex, zero hardcoded px (exception: `border-radius: 2px` or `4px`)

### Step 8 — Define types
Write all exported types in `types.ts`:
- `MT` prefix on every type and interface
- Keep prop types co-located in `{ComponentName}.tsx` if not exported

### Step 9 — Export from index.ts
```ts
export { default } from './{ComponentName}';
export type { MT{ComponentName}Props } from './types';
```

### Step 10 — Add to components.json
Open `design-system/src/components.json` and add a new entry with all required fields:
- `name`, `path`, `description`, `formikRequired`
- `props[]` — every prop with `name`, `type`, `required`, `default`, `description`
- `states[]` — default, hover, focus, disabled, error as applicable
- `accessibility{}` — role, ariaLabel, keyboardInteraction, screenReaderAnnouncement
- `dos[]`, `donts[]`
- `example` — a complete, copy-pasteable usage snippet

### Step 11 — Self-validate
Run the 16-point checklist from `review-component/instruction.md` against your new component.
Fix any failures before declaring completion.
