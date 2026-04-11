# Domain Knowledge: Create Component

## Naming Prefixes — Non-negotiable

| Prefix | Use for | Example |
|--------|---------|---------|
| `MC` | Exported React components | `MCStatusBadge`, `MCEmptyState` |
| `MT` | TypeScript types and interfaces | `MTStatusBadgeProps`, `MTBadgeVariant` |
| `SC` | Internal styled components | `SCBadgeWrapper`, `SCBadgeLabel` |
| `ME` | Enums | `MEBadgeVariant`, `MEBadgeSize` |
| `use` | Custom hooks | `useStatusBadge` |

Never mix prefixes. `MCButton` is a component. `SCButton` is a styled wrapper inside that component file.

## Token Usage — Always via Theme

Access tokens only through the styled-components theme. Never hardcode.

```tsx
// Colors
props.theme.mcui.palette.content.primary        // primary text
props.theme.mcui.palette.content.secondary      // secondary text
props.theme.mcui.palette.background.primary     // page background
props.theme.mcui.palette.background.secondary   // panel background
props.theme.mcui.palette.background.tertiary    // active/hover background
props.theme.mcui.palette.border.primary         // default border
props.theme.mcui.palette.foundation.assent      // brand accent, focus ring
props.theme.mcui.palette.foundation.negative    // error state

// Spacing (8px base unit)
props.theme.mcui.spacing(1)   // 8px
props.theme.mcui.spacing(2)   // 16px
props.theme.mcui.spacing(3)   // 24px
props.theme.mcui.spacing(4)   // 32px

// Typography
props.theme.mcui.typography.H_3.size
props.theme.mcui.typography.H_3.fontWeight
props.theme.mcui.typography.BODY_1_BODY.size
props.theme.mcui.typography.BODY_1_BODY.fontWeight
props.theme.mcui.typography.BODY_1_BODY.lineHeight
```

**Allowed exceptions**: `border-radius: 2px` and `border-radius: 4px` may be hardcoded.

## Transient Props — $ Prefix Rule

Any styled-component prop that must NOT reach the DOM must use the `$` prefix.

```tsx
// Correct
const SCWrapper = styled.div<{ $isActive: boolean; $variant: string }>`
  background: ${(props) => props.$isActive
    ? props.theme.mcui.palette.background.tertiary
    : props.theme.mcui.palette.background.primary};
`;

// Wrong — React will warn about unknown DOM attribute
const SCWrapper = styled.div<{ isActive: boolean }>``;
```

## Component Purity Rule

Components must be pure UI. They must not:
- Fetch data (no `trpc.*`, no `useQuery`)
- Navigate (`useNavigate` belongs in containers)
- Access route params directly

All data arrives via props. All callbacks are passed as props.

## Typography Guidance

- `BODY_1_BODY` — standard body text, descriptions, labels
- `H_3` — panel titles, section headings within a card
- `H_2` — page-level section headings
- Never set `font-size` or `font-weight` with raw values

## Accessibility Requirements

Every interactive component must satisfy:

1. **Keyboard reachability** — reachable via Tab
2. **Activation** — Enter or Space triggers the primary action
3. **Focus visibility** — visible focus ring using `palette.foundation.assent`; never `outline: none` without a replacement
4. **ARIA role** — explicit `role` when HTML semantics are insufficient
5. **ARIA label** — `aria-label` or associated `<label>` for all inputs and controls
6. **Touch target** — minimum 44×44px for any clickable/tappable element (WCAG 2.5.8)
7. **Color independence** — information must not rely on color alone; pair with icons or text
8. **Screen reader announcement** — dynamic state changes use `aria-live` or `role="alert"`

## Styled Component File Split Rule

- ≤3 styled components → define inline in `{ComponentName}.tsx`
- >3 styled components → move all to `styledComponents.tsx`, import from there

## Icon Size Guide

| Context | Size |
|---------|------|
| Inline with body text / button | `width={16} height={16}` |
| Nav items / standalone | `width={20} height={20}` |
| Page headers | `width={24} height={24}` |
| Empty state hero | `width={48} height={48}` |

## Animation Tokens

- Hover / color change → `100ms` + `easing.default`
- Expand / show-hide → `200ms` + `easing.default`
- Modal open/close → `300ms` + `easing.enter` / `easing.exit`
- Always respect `prefers-reduced-motion` — wrap animations in a media query

```tsx
const SCAnimated = styled.div`
  transition: background ${(props) => props.theme.mcui.animation.durations.fast} ${(props) => props.theme.mcui.animation.easings.default};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;
```

## components.json Entry Requirements

Every component entry must include:
- `name` — PascalCase component name with MC prefix
- `path` — relative path from `src/common/component/`
- `description` — one-sentence purpose
- `formikRequired` — `true` only for form inputs that use `useField`
- `props[]` — complete list; mark `required: true` for mandatory props
- `states[]` — at minimum: `default`, `hover`, `focus`; add `disabled`, `error`, `readonly` as applicable
- `accessibility{}` — role, ariaLabel source, keyboardInteraction array, screenReaderAnnouncement
- `dos[]` — 2-4 correct usage examples
- `donts[]` — 2-4 anti-patterns to avoid
- `example` — a complete, self-contained JSX snippet that can be pasted directly
