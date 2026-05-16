# MSM Portal Design System — Plan Emitter Brief

> Condensed catalog + design principles for LLM planners.
> **Authoritative source**: `components.json` (full), `component-props.json` (props), `patterns.json` (compositions), `tokens.json` (values).
> This file is the *plan-time fast path* — when a plan_item references a component below, the planner can ground it immediately. When the intent is not covered here, fall back to `components.json` lookup or mark `unresolved_components`.

---

## Brand Identity & Authority

**Visual character**: Precise, trustworthy, dense data-display admin UI for ad operations. Designed for power users (PMs, advertisers, ad-ops). No marketing flourish — every pixel carries information. Korean-primary (Tving) + English (Moloco internal). Desktop-first; modest responsive tolerance.

**Authority hierarchy** (when sources disagree, top wins):
1. `tokens.json` — design tokens (color/typography/spacing/elevation/radius). Closed system; never hardcode.
2. `components.json` — component catalog. Authoritative for component names, `importStatement`, `when_to_use` / `do_not_use` / `antiPatterns`.
3. `component-props.json` — ts-morph extracted props. Authoritative for `required: true` props and prop types.
4. `patterns.json` — composition recipes + `layer_structure.location` file path templates.
5. This file (`DESIGN.md`) — fast-path summary. Reference, not override. **Never** invent values absent from above sources.

**Brand values are data, not model memory** — derive from these files only. Do not infer brand details from training data on similar admin products.

**Living document policy** — when the agent identifies a new pattern, missing token, or recurring composition during multi-screen work, propose a PR updating both the authoritative source (e.g., `tokens.json`) and this file. Do not silently drift.

---

## Meta

- **Package root**: `src/common/component/`
- **Import alias**: `@msm-portal/common/component/`
- **Primary client**: Tving (Korean main locale; msm-portal supports KR + EN via i18n)
- **Underlying lib**: `@moloco/moloco-cloud-react-ui` (Portal wrappers add Formik integration and theme styling on top)

### Tier system

| Tier | Name | Use when |
|------|------|----------|
| 1 | **Core** | Atomic/molecule UI primitives reusable across any feature. Directly importable by page developers. |
| 2 | **Composite** | Page-level compositions from Core. Layout, table, navigation. |
| 3 | **Domain** | Domain-specific (ad scheduling, video creative). Only meaningful inside that domain. |
| 4 | **Internal** | Styled components, enums, low-level helpers. Not directly imported by page developers. |

---

## 16 Categories — quick index

> Format: **N. Category** (count) — short description. → `ComponentList`

### 0. Form Inputs (v1) — Formik-bound (17)
All form components use Formik via `useField(name)`. Must be inside a `<Formik>` provider.
→ `MCFormTextInput`, `MCFormTextArea`, `MCFormNumberInput`, `MCFormCheckBox`, `MCFormSwitchInput`, `MCFormRadioGroup`, `MCFormSingleRichSelect`, `MCFormMultiRichSelect`, `MCFormCardSelect`, `MCFormInlineChipRichSelect`, `MCFormDateRangePicker`, `MCFormDateTimeRangePicker`, `MCFormColorInput`, `MCFormChipInput`, `MCFormWeeklyTimeTablePicker`, `MCFormOptionalFrequencyInput`, `MCFormSkippableVideoInput`

### 1. Standalone Inputs (3)
Reusable input-like components not tied to Formik.
→ `MCRadioGroup`, `MCColorPicker`, `MCI18nWeeklyTimeTablePicker`

### 2. Form Scaffold (13)
Structural components composing form page layout (used in patterns.json form recipes).
→ `MCFormPanel`, `MCFormPanelTitle`, `MCFormPanelBody`, `MCFormFieldGroup`, `MCFormField`, `MCFormTitle`, `MCFormBody`, `MCFormActions`, `MCFormFieldError`, `MCFormHint`, `MCFormGuideMessage`, `MCFormDescription`, `MCFormPortal`

### 3. Form Layout (1)
Full-page form layout with header, scrollable body, footer.
→ `MCFormLayout`

### 4. Buttons (3)
→ `MCButton2`, `MCMoreActionsButton`, `MCMoreActionGroupsButton`

### 5. Navigation (5)
Primary navigation building blocks for app shell + route-level movement.
→ `MCCollapsibleNavbar`, `MCNavbarItems`, `MCProfileButton`, `MCWorkplaceSelectorPopper`, `MCWorkplaceSelector`

### 6. Feedback & Overlay (3)
Dialogs, popovers, loading feedback (temporarily above page content).
→ `MCCommonDialog`, `MCPopover`, `MCLoader`

### 7. Display (7)
Presentation components for content structure, separation, tabs, status.
→ `MCAccordion`, `MCBarTabs`, `MCDivider`, `MCStatus`, `MCStatusBadge`, `MCTimer`, `MCStepper`

### 8. Shared Styled (2)
Styled-components helpers from `@msm-portal/common/component/styled`.
→ `SCBoldLabel`, `SCClickableText`

### 9. Moloco UI Primitives (8)
Used directly from `@moloco/moloco-cloud-react-ui` without Portal wrapping.
→ `MCIcon`, `MCStack`, `MCSingleTextInput`, `MCSingleTextArea`, `MCTextEllipsis`, `MCMarkdownTooltip`, `MCBarTab`, `MCBarTabIndicator`

### 10. Table (3)
Tabular-data display for reporting + dense list views.
→ `MCReportTable`, `MCI18nTable`, `MCTableActionBar`

### 11. Layout (3)
Page-level layout for structuring content areas.
→ `MCContentLayout`, `MCCircularLoader`, `MCConfirmDialog`

### 12. Auth Flows (4)
Sign-in, two-factor, forgot-password flows.
→ `MCSignInForm`, `MCTFAForm`, `MCForgotPasswordForm`, `MCPostForgotPassword`

### 13. Ad Pacing Dashboard (3)
Domain components for ad pacing config + table.
→ `MCAdPacingDashboardConfigurator`, `MCAdPacingDashboardColumnConfigurator`, `MCAdPacingDashboardTable`

### 14. Empty State (1)
→ `EmptyState`

### 15. Library Primitives (36)
Additional components from `@moloco/moloco-cloud-react-ui` used directly without Portal wrapping.
→ `MCButton`, `MCBanner`, `MCSearchBar`, `MCTag`, `MCBoxTab`, `MCCollapse`, `MCMarkdown`, `MCChip`, `MCDataTable`, `MCSelect`, `MCDatePicker`, `MCTimePicker`, `MCDynamicDropdown`, `MCFilter`, `MCModal`, `MCPopper`, `MCStateIcon`, `MCSingleNumberInput`, `MCDebounceInput`, `MCDateRangePicker`, *(+ 16 more — see components.json)*

---

## Design Tokens (summary)

> Authoritative: `tokens.json`. Below is intent-level guidance.

### Color (`tokens.json#color`)
- **Naming**: `color.[property].[role].[emphasis].[state]`
  - `property`: text / background / border / icon
  - `role`: neutral / brand / info / success / warning / danger
  - `emphasis`: primary / secondary / tertiary / disabled / inverse
  - `state`: default / hover / pressed / focus
- **Source of truth**: `theme.mcui.color.*` — never hardcode hex.
- Dark mode: `tokens.json#darkMode` for per-token dark equivalents.

### Typography (`tokens.json#typography`)
- Access: `theme.mcui.typography.{NAME}.{size|fontWeight|lineHeight}`
- Common tokens: `H_1` (34px) … `H_6`, `BODY_1` … `BODY_3`, `LABEL_1` … `LABEL_3`, `CAPTION_1` / `CAPTION_2`

### Spacing (`tokens.json#spacing`)
- 4 px base scale. Use `theme.mcui.spacing.{n}` — do not hardcode `px` values.

### Elevation (`tokens.json#elevation`)
- Semantic shadow tokens (e.g., `elevation.card`, `elevation.popover`, `elevation.modal`). Reference by name — never compose `box-shadow` by hand.
- Surface stacking: card < popover < dialog < modal. Higher elevation = stronger shadow + visually closer to user.

### Radius / Border (`tokens.json#borderRadius` / `#borderWidth`)
- All values have semantic tokens. Reference by name (e.g., `borderRadius.sm` / `borderWidth.subtle`).

### Responsive Behavior (`tokens.json#breakpoints`)
- **Desktop-first**. MSM Portal targets ≥1280px primary. Tablet (≥768px) graceful degradation. Mobile (<768px) is best-effort, not a primary use case.
- Tables and dashboards do not collapse to mobile — they horizontal-scroll inside their container.
- Tap targets meet 44×44px on tablet/mobile; desktop uses standard 32-40px button heights.

---

## Do's and Don'ts

These ship in every plan's `visual_constraints` array. Downstream agents use them when generating actual screens so output matches existing product.

### ✅ Do

- Follow the existing visual vocabulary of the target client (color, typography, spacing, density, shadow, radius).
- Use tokens from `tokens.json` only — reference by name, never inline.
- Use icons from the `components.json` icon catalog. If unknown, render a placeholder box with a comment.
- Use DS typography tokens (`H_1` … `BODY_3` … `CAPTION_2`).
- Place a correct placeholder when uncertain — a labelled empty slot beats a bad attempt at the real component.
- Honour each component's `when_to_use` / `do_not_use` / `antiPatterns` from `components.json`.
- When a `required: true` prop appears in `component-props.json`, mention it verbatim in the plan_item description.

### ❌ Don't

- ❌ Hardcoded hex colors / px values / inline `font-family` declarations.
- ❌ Aggressive gradient backgrounds (admin UI is flat).
- ❌ Emoji in UI copy unless the brand explicitly uses them (Tving / Moloco do not).
- ❌ "Rounded container with left-border accent" tropes (overused; not in our visual vocabulary).
- ❌ Freehand SVG for icons/imagery — use catalog icons.
- ❌ Substitute fonts (Inter, Roboto, Arial, system) — only DS typography tokens.
- ❌ Invent component names that are not in `components.json`. Add `unresolved_components` instead.
- ❌ Invent prop names absent from `component-props.json`. Fall back to intent-only language ("text input with placeholder").

---

## Component lookup workflow (for planners)

1. **First** — check the 16 categories above. If a component matching the intent is listed, reference it directly. Use its exact `importStatement` from `components.json` (still authoritative for import paths — do not reconstruct).
2. **Second** — if no category matches, check `components.json` fully for variants (e.g., `MCBanner` vs `MCStateIcon`).
3. **Third** — if still none match: add an entry to `unresolved_components` with:
   - `intent` (1 line, English)
   - `closest_match` (the nearest existing component + similarity_score ∈ [0, 1] + reasoning)
   - `kind` (`new_component` / `extension` / `composition_miss`)
   - `reason` (1 line, why nothing fits as-is)
4. **Never invent** component names that are not in the catalog. Honour `when_to_use` / `do_not_use` / `antiPatterns` from the full `components.json`.

---

## Patterns + entity contracts (cross-reference, not duplicated here)

For composition recipes (app-shell, list-page, detail-page, form-basic, etc.) and entity definitions (Creative, Order, Advertiser, Product, AuctionOrder, PublisherTarget), see:
- `patterns.json` — composition patterns + `layer_structure.location` templates
- `api-ui-contracts.json` — entity definitions
- `pm-sa-request-schema.json` — structured request contract + `change_intent` enum
- `component-props.json` — per-component props (ts-morph extracted)

Planner's job: keep this brief in `system` cache, and pull props/details from `component-props.json` on demand (still in `system` block but smaller subset acceptable).

---

## Cross-references

- Ontology metadata (usedInPatterns / relatedComponents / requiredProviders / usage_stats) generated by `design-system/scripts/extract-cross-refs.mjs` (2026-05-12). Available inside each component entry in full `components.json`.
- Governance / audit cycles / promotion queues: `governance.json`.
- UX writing guidance: `ux-writing.json`.
- Conventions: `conventions.json`.

---

*Generated 2026-05-17 as part of plan v2 Track 1 (DESIGN.md condensed brief). Update when categories change or new components ship. Keep this file ≤15KB to preserve LLM cache benefit.*
