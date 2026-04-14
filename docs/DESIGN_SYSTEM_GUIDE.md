# Moloco Design System — How It's Built

> A machine-readable specification of our entire UI component library. It exists so the AI agent knows exactly which components exist, how they should be used, and what anti-patterns to avoid.

---

## Why We Built This

The CAS team's design system previously existed only as scattered code and Figma files. Different developers applied the same components differently. There was no single source of truth.

We built a **structured, JSON-based design system** that serves two purposes:
1. **For the AI Agent** — Provides precise context so generated code uses real components, real tokens, and follows real patterns
2. **For the Team** — A documentation site where PMs, SAs, and engineers can browse components, see interactive previews, and understand usage rules

---

## Architecture Overview

```
design-system/                      ← JSON source of truth
├── src/
│   ├── components.json             ← 112 components across 16 categories
│   ├── tokens.json                 ← Design tokens (color, spacing, typography, etc.)
│   ├── patterns.json               ← UI combination patterns (form, table, dashboard...)
│   ├── index.json                  ← Agent loading guide (which file to read for which task)
│   ├── governance.json             ← Rules, anti-patterns, quality standards
│   ├── ux-writing.json             ← Tone, terminology, multilingual rules
│   ├── conventions.json            ← Naming, file structure, import rules
│   ├── component-behaviors.json    ← Interaction states and transitions
│   ├── component-dependencies.json ← Component dependency graph
│   ├── state-machines.json         ← State machine definitions
│   ├── golden-example-states.json  ← Reference implementations
│   ├── api-ui-contracts.json       ← API ↔ UI data contracts
│   ├── pm-sa-request-schema.json   ← Request format for PM/SA inputs
│   └── preview-verification.json   ← Preview validation rules
├── workflows/                      ← Build & validation workflows
│   ├── auto-fix-loop.json
│   ├── error-patterns.json
│   ├── validation-runner.json
│   └── ...
├── scripts/                        ← Tooling
│   ├── validate.ts                 ← Schema validation
│   ├── validate-schemas.mjs        ← JSON schema checks
│   ├── prop-check.mjs              ← Component prop verification
│   ├── sync-check.mjs              ← Code ↔ spec sync verification
│   └── generate-css-variables.mjs  ← Token → CSS variable generation
└── docs/                           ← Human-readable guidelines

design-system-site/                 ← Documentation website (Carbon-style)
design-system-mcp/                  ← MCP server (9 tools for AI access)
```

---

## How It Was Built

### Step 1: Codebase Analysis

We started by scanning the actual product codebase (`msm-portal`) to identify every component in use:

1. **Grep the codebase** for all `MC*` component imports and React component definitions
2. **Count usage** — how many times each component appears across all files
3. **Identify patterns** — which components are always used together (e.g., `MCFormItem` always wraps an input)
4. **Find the primitives** — trace wrapper components back to their base `@moloco/moloco-cloud-react-ui` primitives

### Step 2: Structured Specification

Each component was documented as a JSON contract with these fields:

| Field | Purpose | Example |
|-------|---------|---------|
| `name` | Component name | `MCButton2` |
| `path` | File location | `src/common/component/button/MCButton2.tsx` |
| `description` | What it does | "Primary action button with loading state" |
| `functional_category` | Role in UI | `action`, `input`, `display`, `layout` |
| `status` | Maturity | `stable`, `deprecated`, `experimental` |
| `usage_stats` | How much it's used | `{ count: 342, files: 89, adoption: 0.89 }` |
| `importPath` | How to import | `@common/component/button/MCButton2` |
| `when_to_use` | Guidance | "Primary and secondary actions in forms and toolbars" |
| `do_not_use` | Anti-patterns | "Don't use ghost variant for primary actions" |
| `props` | All props with types | `[{ name: 'disabled', type: 'boolean', required: false }]` |
| `variants` | Visual variations | `['primary', 'secondary', 'ghost', 'danger']` |
| `tokens` | Design token mapping | `{ background: 'semantic.action.primary' }` |
| `states` | Interactive states | `['default', 'hover', 'active', 'disabled', 'loading']` |
| `accessibility` | ARIA and keyboard | `{ role: 'button', keyboard: 'Enter/Space' }` |

### Step 3: Token Extraction

Design tokens were extracted from the codebase's theme files and organized into groups:

| Group | Count | Examples |
|-------|-------|---------|
| Color (semantic) | 10 groups | `text.primary`, `background.base`, `border.default` |
| Color Palette | 2 sets | Base colors + dark mode variants |
| Spacing | 6 values | `4px, 8px, 12px, 16px, 24px, 32px` |
| Typography | 5 scales | `xs(11px), sm(13px), base(14px), lg(16px), xl(20px)` |
| Border Radius | 2 levels | `sm(4px), md(6px), lg(8px)` |
| Elevation | 3 levels | `sm, md, lg` shadow values |
| Breakpoints | 5 sizes | `sm(640), md(768), lg(1024), xl(1280), 2xl(1536)` |
| Animation | 5 presets | Transition durations and easings |

### Step 4: Pattern Documentation

Common UI patterns were documented — not individual components, but how components combine:

| Pattern | Description | Components Used |
|---------|-------------|-----------------|
| Form | Standard data entry form | `MCFormItem` + input + `MCButton2` + validation |
| Table | Data table with sorting/filtering | `MCTable` + `MCColumn` + `MCPagination` |
| Dashboard | Metric cards + charts | `MCCard` + chart library + stat display |
| Dialog | Modal confirmation/input | `MCDialog` + form content + action buttons |
| List Page | Filtered list with actions | `MCTable` + `MCSearchBar` + `MCFilter` + toolbar |
| Detail Page | Entity detail with tabs | `MCTabs` + content sections + action bar |

---

## Component Categories (112 total)

| Category | Count | Description |
|----------|-------|-------------|
| Library Primitives | 36 | Base `@moloco/moloco-cloud-react-ui` components |
| Form Inputs (v1) | 17 | Formik-integrated form fields |
| Form Scaffold | 13 | Form structure (FormItem, FormSection, validation) |
| Moloco UI Primitives | 8 | Core UI building blocks (Button, Checkbox, etc.) |
| Display | 7 | Read-only display components (Badge, Tag, Status) |
| Navigation | 5 | Routing and navigation (Tabs, Breadcrumb, Sidebar) |
| Auth Flows | 4 | Login, workplace selection, session management |
| Buttons | 3 | Action buttons (Button2, IconButton, LinkButton) |
| Feedback & Overlay | 3 | Dialog, Toast, Tooltip |
| Standalone Inputs | 3 | Non-Formik inputs (SearchBar, DatePicker) |
| Table | 3 | Data table components |
| Layout | 3 | Page structure (PageHeader, ContentArea, Panel) |
| Ad Pacing Dashboard | 3 | Domain-specific dashboard components |
| Shared Styled | 2 | Shared styled-components utilities |
| Form Layout | 1 | Form grid layout |
| Empty State | 1 | Empty/no-data state display |

---

## How the Agent Uses It

When a PM requests a change, the agent reads the design system in this order:

```
1. index.json         → "What files should I read for this type of task?"
2. components.json    → "What components exist? What are their props?"
3. tokens.json        → "What design tokens should I use instead of hardcoded values?"
4. patterns.json      → "How do these components combine in this type of page?"
5. conventions.json   → "What are the import rules and naming conventions?"
6. governance.json    → "What anti-patterns should I avoid?"
```

The `index.json` acts as a routing table — it tells the agent which files are relevant based on the task type (layout change, copy update, component swap, etc.).

---

## Documentation Site

The Design System Site (`design-system-site/`) renders all this JSON data into a browsable documentation website:

**Pages:**
- **Overview** — Total components, tokens, patterns at a glance
- **Components** — Browse all 112 components by category, click for detail
- **Component Detail** — 7 tabs: Usage, Behavior, States, Code, Style, A11y, Notes
- **Tokens** — All design tokens grouped by type with values
- **Patterns** — UI combination patterns with descriptions
- **Blocks** — Full page-level compositions (shadcn-style)
- **Governance** — Rules, anti-patterns, quality standards

**Interactive Features:**
- Prop controls (Mantine-style) — change props and see preview update
- Anatomy diagrams (Radix-style) — visual component structure breakdown
- Shiki syntax highlighting — code examples in 5 languages
- `⌘K` global search — fuzzy search across everything
- Dark mode — full theme toggle

---

## MCP Server (9 Tools)

The MCP server (`design-system-mcp/`) exposes the design system to any AI tool:

| Tool | What It Does |
|------|-------------|
| `lookup_component` | Find a component by name or keyword |
| `get_component_detail` | Get full specification for a component |
| `resolve_token` | Map a semantic token to its CSS value |
| `search_patterns` | Find UI combination patterns |
| `list_components` | Browse all components by category |
| `get_token_groups` | List all token groups and values |
| `get_governance` | Get rules and anti-patterns |
| `get_blocks` | Get page-level composition patterns |
| `health` | Server health check |

Any AI coding tool (Claude Code, Cursor, Copilot) can connect to this MCP server and query component specs, tokens, and patterns in real-time.

---

## llms.txt

A single text file (`design-system-site/public/llms.txt`) provides a flat, AI-readable index of all components. Any LLM can read this file to understand the design system without needing the MCP server.

---

## Validation & Quality

Scripts in `design-system/scripts/` ensure the design system stays accurate:

| Script | Purpose |
|--------|---------|
| `validate.ts` | Validate all JSON files against schemas |
| `validate-schemas.mjs` | JSON schema compliance checks |
| `prop-check.mjs` | Verify component props match actual code |
| `sync-check.mjs` | Detect drift between spec and codebase |
| `generate-css-variables.mjs` | Generate CSS variables from tokens |

---

## Key Files Quick Reference

| Need to... | Read this file |
|-----------|---------------|
| Find a component | `components.json` → search by name or category |
| Check design tokens | `tokens.json` → color, spacing, typography groups |
| See UI patterns | `patterns.json` → form, table, dashboard patterns |
| Know what the agent reads | `index.json` → routing table for task types |
| Check anti-patterns | `governance.json` → rules and violations |
| UX writing rules | `ux-writing.json` → tone, terms, multilingual |
| Component interactions | `component-behaviors.json` → state transitions |
| API data contracts | `api-ui-contracts.json` → API ↔ UI field mapping |

---

## Numbers

| Metric | Value |
|--------|-------|
| Total components | 112 |
| Categories | 16 |
| JSON source files | 14 |
| Total JSON lines | ~19,000 |
| Design token groups | 14 (color, spacing, typography, radius, elevation, ...) |
| UI patterns | 12 |
| MCP server tools | 9 |
| Validation scripts | 5 |
