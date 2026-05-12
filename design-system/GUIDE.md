# MSM Portal Agent Design System — Guide

> Describes the design system's structure, the role of each file, and the workflows agents follow.
> This document is a guide for **both humans and agents**.

---

## Overview: why an agent-friendly design system?

A typical design system is **read and interpreted by humans**. This one is designed so that **AI agents can parse it directly** and generate code from it.

```
┌─────────────────────────────────────────────────────┐
│                   Design System                      │
│                                                      │
│  tokens.json ─── "Which colors / spacing / fonts?"  │
│       ↓                                              │
│  components.json ─── "Which components, what props?"│
│       ↓                                              │
│  patterns.json ─── "How are components composed?"   │
│       ↓                                              │
│  conventions.json ─── "What are the naming rules?"  │
│       ↓                                              │
│  api-ui-contracts.json ─── "How does API data map  │
│                             onto the UI?"           │
└─────────────────────────────────────────────────────┘
```

---

## File map: what each file is for

### Source files (`src/`)

| File | Role | Size | When to read |
|------|------|------|--------------|
| **tokens.json** | Colors, typography, spacing, animation, elevation, breakpoints | 54 colors, 9 typography scales, 8 spacing units | When writing styling code |
| **components.json** | 48 components — props, accessibility, states, do/don't | 1,530 lines | When selecting / using a component |
| **patterns.json** | 20 architecture / coding patterns (list, detail, create, edit, …) | 197 lines | When implementing a new page / feature |
| **conventions.json** | Naming (MC/MT/SC/ME), file structure, import order | 106 lines | Every time you write code |
| **api-ui-contracts.json** | proto → converter → model → UI mapping for 6 entities | 6 entities | When wiring an API to UI |

### Generated files

| File | Role | How it's produced |
|------|------|--------------------|
| `docs/*.md` | Human-friendly Markdown version of the JSON sources | `node generate.mjs` |
| `dist/tokens.css` | CSS custom properties | `npm run generate:css` |
| `dist/tokens-rgb-only.css` | RGB variants only | `npm run generate:css` |

### Tooling

| File | Role |
|------|------|
| `schemas/*.schema.json` | JSON Schema validation for the `src/` files |
| `scripts/validate-schemas.mjs` | Runs schema validation |
| `scripts/sync-check.mjs` | Verifies the design system stays in sync with the actual codebase |
| `mcp-server/` | MCP server for querying the design system from AI coding tools |

### Planning & tracking

| File | Role |
|------|------|
| `AGENT_DESIGN_SYSTEM_ROADMAP.md` | 3-phase roadmap, progress tracker, technical decision log |
| `GUIDE.md` | This document. Explains structure and workflows |

---

## Cross-file relationships

```
User request: "Add a filter to the orders list page"
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ 1. conventions.json                                      │
│    → Find the file location: src/apps/msm-default/      │
│      container/                                          │
│    → Naming rules: MC*, MT*, SC* prefixes                │
│    → 3-layer architecture: Page → Container → Component  │
└───────────────────────┬─────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 2. api-ui-contracts.json                                 │
│    → Look up field mappings on the Order entity          │
│    → Check the table column definitions and filter type  │
│    → Hooks in use: useOrders, usePublisherCurrency       │
│    → Confirm the Container file location                 │
└───────────────────────┬─────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 3. patterns.json                                         │
│    → Reference "List Page Pattern"                       │
│    → For filters, use useTableSearchBarAndFilter         │
│    → Apply the Error Handling Pattern                    │
└───────────────────────┬─────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 4. components.json                                       │
│    → Verify MCTable's filterConfig prop                  │
│    → Confirm MCFormSingleRichSelect (filter UI) props    │
│    → Check accessibility requirements                    │
└───────────────────────┬─────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 5. tokens.json                                           │
│    → Pick color / spacing tokens for the styling         │
│    → theme.mcui.palette.* / theme.mcui.spacing()         │
└───────────────────────┬─────────────────────────────────┘
                        ▼
                   Code generation complete
```

---

## Agent workflow: read order by task type

### A. Creating a new page

```
1. conventions.json  → File locations, naming, 3-layer architecture
2. patterns.json     → Pattern for the page type (list/detail/create/edit)
3. api-ui-contracts  → Entity's proto→model→UI mapping, API endpoints
4. components.json   → Pick components, verify props
5. tokens.json       → Apply styling tokens
```

### B. Modifying an existing page

```
1. api-ui-contracts  → Confirm the target entity's mapping
2. conventions.json  → Find which file to change (container? component?)
3. components.json   → Verify props on the components you'll change / add
4. tokens.json       → Reference tokens when changing styles
```

### C. Wiring a new API endpoint

```
1. api-ui-contracts  → Reference a similar entity's mapping pattern
2. patterns.json     → tRPC Data Fetching Pattern, Error Handling Pattern
3. conventions.json  → Hook / converter naming rules
4. components.json   → Pick the component that will render the data
```

### D. Styling / design change

```
1. tokens.json       → Which tokens are available (never hardcode!)
2. components.json   → Component's built-in style / state options
3. conventions.json  → styled-component SC* naming, $transient props
```

### E. Form development

```
1. components.json   → MCForm* components (17 of them) — verify props
2. patterns.json     → Form Pattern (Formik + panels + field groups)
3. api-ui-contracts  → Form field ↔ proto field mapping (formFields section)
4. conventions.json  → Formik context rules, validation patterns
```

---

## Per-file structure detail

### tokens.json

```
{
  colors: {
    text: { ... 12 tokens },       ← props.theme.mcui.palette.content.*
    background: { ... 23 tokens }, ← props.theme.mcui.palette.background.*
    border: { ... 10 tokens },     ← props.theme.mcui.palette.border.*
    icon: { ... 9 tokens }         ← props.theme.mcui.palette.content.*
  },
  typography: { ... 9 scales },    ← props.theme.mcui.typography.*
  spacing: { ... 8 multipliers },  ← props.theme.mcui.spacing(n) → n × 8px
  animation: { durations, easings, patterns },
  elevation: { sunken, default, raised, overlay },
  borderRadius: { small, default, large, circle },
  breakpoints: { xs, sm, md, lg, xl }
}
```

### components.json

```
{
  categories: {
    "Form Inputs (v1)": [17 components],   ← MCForm* (Formik required)
    "Buttons": [3 components],              ← MCButton2, MCIconButton, MCMoreActionsButton
    "Navigation": [2 components],           ← MCBarTabs, MCBreadcrumb
    "Feedback & Overlay": [3 components],   ← MCCommonDialog, MCPopover, MCSnackbar
    "Display": [5 components],              ← MCTextEllipsis, MCLoader, MCBadge, ...
    "Table": [1 component],                 ← MCTable
    "Layout": [3 components],               ← MCContentLayout, MCRootLayout, MCSidebar
    ...
  }

  // Per component:
  {
    name, description, path,
    props: [{ name, type, required, default, description }],
    accessibility: { role, keyboard, aria, focusManagement },
    states: [default, hover, focus, disabled, error, ...],
    dos: [...], donts: [...],
    example: "code example"
  }
}
```

### patterns.json

```
{
  patterns: [
    "Basic Form Pattern",           ← Formik + MCFormPanel + MCFormFieldGroup
    "Full-Page Form Pattern",       ← MCFormLayout with breadcrumbs / footer
    "List Page Pattern",            ← tabs + MCContentLayout + MCTable
    "Detail Page Pattern",          ← dependent queries + error handling
    "Create Page Pattern",          ← form + mutation + navigation
    "Edit Page Pattern",            ← fetch + pre-populate + update
    "Page → Container → Component", ← required 3-layer architecture
    "Styled Component Pattern",     ← SC prefix, transient $props, theme tokens
    "tRPC Data Fetching Pattern",   ← React Query hooks
    "Error Handling Pattern",       ← useInAppAlert
    "i18n Usage Pattern",           ← react-i18next namespacing
    "Route Registration Pattern",   ← enum → template → config (3 steps)
    ... 20 total
  ]
}
```

### conventions.json

```
{
  naming: {
    MC → Component,    MT → Type,
    SC → Styled,       ME → Enum,
    use → Hook
  },
  fileNaming: {
    PascalCase.tsx → React component,
    camelCase.ts → config / utils,
    index.ts → barrel export
  },
  importOrder: "React → 3rd party → Moloco UI → Internal → Relative",
  architecture: "Page (thin) → Container (logic) → Component (pure UI)"
}
```

### api-ui-contracts.json

```
{
  entities: {
    "Order": {
      proto: { type, file, apiEndpoints },
      converter: { file, functions },
      model: { type, file },
      fieldMappings: [
        { proto → model → ui → renderer }   ← Each field's full chain
      ],
      tableColumns: [...],                    ← Table column definitions
      containers: { list, detail, create },   ← Related file locations
      hooks: [...]                            ← Hooks used by this entity
    },
    "AuctionOrder": { ... },
    "Creative": { ... },
    "Advertiser": { ... },
    "Product": { ... },
    "PublisherTarget": { ... }
  },
  commonPatterns: { ... },                    ← Shared rules (micro currency, timestamps, …)
  cellRenderers: { ... }                      ← Table-cell renderer catalog
}
```

---

## Strict rules (for agents and humans alike)

These rules are also defined in `CLAUDE.md` and must be followed whenever you use the design system:

| Rule | Why |
|------|-----|
| Never hardcode colors → use `theme.mcui.palette.*` | Dark-mode / theme support |
| Never hardcode spacing → use `theme.mcui.spacing(n)` | Consistent layouts |
| Never hardcode typography → use `theme.mcui.typography.*` | Preserves the typography system |
| No inline styles → use styled-components | Performance + consistency |
| Form inputs must live inside Formik | Unified form state management |
| Non-HTML props → prefix with `$` (transient) | Avoids DOM-attribute warnings |
| Every user-facing string → `useTranslation` | i18n support |

---

## MCP server: programmatic queries

Instead of reading the JSON files directly, you can query just the information you need through the MCP server:

```bash
# Register the MCP server
claude mcp add msm-design-system -- npx ts-node design-system/mcp-server/src/index.ts
```

```
Available tools:
├── list_components      → All components
├── get_component        → A specific component's details (props, examples)
├── list_tokens          → Token categories
├── get_tokens           → A specific token's value
├── list_patterns        → All patterns
├── get_pattern          → A specific pattern's details
├── get_conventions      → Conventions lookup
└── get_icon_catalog     → Icon list
```

---

## Roadmap

For the full roadmap, see `AGENT_DESIGN_SYSTEM_ROADMAP.md`.

**Phase 1 (current):** Strengthen the design system
- [x] api-ui-contracts.json
- [ ] Component Semantic Actions
- [ ] Page Blueprints
- [ ] Component State Machines

**Phase 2:** Build agent tooling (Figma integration, screenshot verification)

**Phase 3:** Fully autonomous loop (sandbox, self-healing)

Final goal: **Like Ramp Inspect — agents autonomously author ~30 % of PRs.**
