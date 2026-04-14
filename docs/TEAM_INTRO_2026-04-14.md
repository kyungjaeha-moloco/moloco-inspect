# Moloco Inspect — Team Introduction

> An AI agent that lets PMs, SAs, and engineers modify live product UI through natural language — no designer required.

---

## How It Works: End-to-End Flow

![Request Flow](images/01-request-flow.png)

### Step-by-Step Walkthrough

#### Step 1 — Select an Element
PM opens a live product page (e.g., TAS Order Management) in Chrome. Presses `Cmd+Shift+E` to activate the inspector. Hovers over any element — a blue overlay shows what's selected. Clicks to lock the selection.

**What the system captures automatically:**
- React component name (e.g., `MCOrderListTableContainer`)
- Source file path and line number
- Test ID (`data-testid`)
- Computed styles (font size, color, padding, dimensions)
- Page route (e.g., `/v1/p/TVING_OMS/oms/order?type=available`)
- Client context (tving, shortmax, etc.)

#### Step 2 — Describe the Change
In the Chrome Extension side panel, the PM describes what they want in natural language:

> "Add a 'Used Amount' column to this order table"

Or for more complex requests, they can:
- Attach a **PRD link** for context-aware changes
- Use **structured request mode** with clarification options
- **Multi-select** elements (Shift+Click) for changes spanning multiple components

#### Step 3 — AI Plans the Change
Claude Sonnet 4.6 analyzes the request and returns a structured execution plan:

```
┌─────────────────────────────────────────────────┐
│  Inspect Agent — Request analyzed                │
│                                                  │
│  Understanding:                                  │
│  You want to add a "Used Amount" column to the   │
│  order list table on the TAS order management    │
│  page.                                           │
│                                                  │
│  Steps:                                          │
│  1. Find MCOrderListTableContainer.tsx           │
│  2. Add column definition { id: 'usedAmount',   │
│     Header: t('table.usedAmount') }              │
│  3. Update the data accessor to include          │
│     usedAmount field                             │
│  4. Add i18n key for column header               │
│  5. Run typecheck to verify                      │
│                                                  │
│  Risks: Column width may need adjustment         │
│                                                  │
│  [Proceed with this plan]  [Adjust the plan]     │
└─────────────────────────────────────────────────┘
```

The PM reviews and confirms (or adjusts) the plan before any code is touched.

#### Step 4 — Agent Executes in Sandbox
Once confirmed, the orchestrator runs the full pipeline:

![Pipeline](images/03-pipeline.png)

- Full product repo copy inside a Docker container
- Claude Sonnet modifies the code (30s–2min depending on complexity)
- TypeScript typecheck runs automatically
- Vite dev server starts for live preview
- Screenshot captured via Playwright

**Key safety feature:** The host codebase is never modified. All changes happen inside the sandbox. If something goes wrong, the container is deleted — zero impact.

#### Step 5 — PM Reviews
The Ops Hub dashboard shows the result:

```
┌─────────────────────────────────────────────────────────────┐
│  Request a8f3c2d1                              ● preview    │
│                                                             │
│  "Add Used Amount column to order table"                    │
│                                                             │
│  ┌─────────────────────┬───────────────────────────────┐   │
│  │ Agent Analysis       │ Preview                       │   │
│  │                      │                               │   │
│  │ Understanding:       │ ┌───────────────────────────┐ │   │
│  │ Adding usedAmount    │ │  [Open Live Preview]      │ │   │
│  │ column to the order  │ │                           │ │   │
│  │ list table...        │ │  ┌─────────────────────┐  │ │   │
│  │                      │ │  │  Screenshot          │  │ │   │
│  │ Steps:               │ │  │  (captured via       │  │ │   │
│  │ 1. Find container    │ │  │   Playwright)        │  │ │   │
│  │ 2. Add column def    │ │  └─────────────────────┘  │ │   │
│  │ 3. Update accessor   │ │                           │ │   │
│  │ 4. Add i18n key      │ │  Files: 3 changed         │ │   │
│  │ 5. Typecheck         │ │  MCOrderListTable...tsx    │ │   │
│  │                      │ │  ko.json                   │ │   │
│  └─────────────────────┘ │  en.json                   │ │   │
│                           └───────────────────────────┘ │   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Code Changes                        +12  -3  3 files │   │
│  │ ▾                                                     │   │
│  │ diff --git a/MCOrderListTableContainer.tsx            │   │
│  │ + { id: 'usedAmount',                                │   │
│  │ +   Header: t('table.usedAmount'),                    │   │
│  │ +   accessor: 'usedAmount' },                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────┐ ┌─────────────────┐ ┌─────────────┐ │
│  │ ✓ Approve & PR   │ │ Request Changes │ │ Live Preview│ │
│  └──────────────────┘ └─────────────────┘ └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

The PM can:
- **Open Live Preview** — See the actual modified page running in the browser
- **Review the diff** — Syntax-highlighted code changes inline
- **Approve** — Creates a GitHub PR automatically
- **Request Changes** — Enter feedback, agent iterates (up to 3 rounds)

#### Step 6 — Ship
On "Approve", the orchestrator:
1. Creates a git branch (`inspect/a8f3c2d1`)
2. Applies the diff from the sandbox
3. Commits with a descriptive message
4. Runs `gh pr create` with a structured PR body
5. Returns the PR URL

The engineer reviews the PR through the normal code review process and merges.

---

## System Architecture

![Architecture](images/02-architecture.png)

---

## Design System

### What Is It?

A structured, machine-readable specification of all UI components used in our product. It serves as the "rulebook" that the AI agent follows when generating code.

### Structure

![Design System](images/04-design-system.png)

### Component Contract Example

Each of our 95 components has a structured contract like this:

```
MCButton2
├── Category: Action
├── Variants: primary, secondary, ghost, danger
├── Props: label, onClick, disabled, loading, icon, size
├── Tokens:
│   ├── background → semantic.action.primary
│   ├── text → semantic.text.inverse
│   └── border-radius → radius.md
├── States: default, hover, active, disabled, loading
├── Accessibility:
│   ├── role: button
│   ├── aria-disabled: when disabled
│   └── keyboard: Enter/Space to activate
├── Anti-patterns:
│   └── "Don't use ghost variant for primary actions"
├── Usage count: 342 instances across codebase
└── Adoption rate: 89%
```

### Why This Matters for the Agent

| Without Design System | With Design System |
|----------------------|-------------------|
| Agent invents component names | Agent uses real component names (`MCButton2`, `MCTable`) |
| Hardcodes colors like `#0f62fe` | Uses tokens like `semantic.action.primary` |
| Unknown props and states | Knows exact props, variants, and valid states |
| No accessibility awareness | Includes ARIA attributes and keyboard behavior |
| Inconsistent patterns | Follows documented combination patterns |

### Documentation Site

A full documentation site (Carbon Design-style) is available at `http://localhost:4176`:

```
┌──────────────────────────────────────────────────────────┐
│  Moloco Design System                          [⌘K Search] │
│                                                          │
│  ┌────────┐                                              │
│  │Overview │  Components: 95                              │
│  │Tokens   │  Tokens: 186                                │
│  │Patterns │  Patterns: 12                               │
│  │Blocks   │                                              │
│  │Governance│                                             │
│  └────────┘                                              │
│                                                          │
│  Component Detail — MCButton2                            │
│  ┌────┬───────┬──────┬───────┬────────┬──────┬──────┐   │
│  │Usage│Behavior│States│ Code │ Style  │A11y  │Notes │   │
│  └────┴───────┴──────┴───────┴────────┴──────┴──────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────┐        │
│  │  Interactive Preview                         │        │
│  │  ┌──────────────────┐                       │        │
│  │  │  [Primary Button] │  Variant: ▼ primary  │        │
│  │  └──────────────────┘  Size: ▼ medium       │        │
│  │                         Disabled: □          │        │
│  │                         Loading: □           │        │
│  └─────────────────────────────────────────────┘        │
│                                                          │
│  Anatomy Diagram:                                        │
│  ┌──────────────────────────────────────────┐           │
│  │ ┌──icon──┐ ┌──label──┐ ┌──loader──┐     │           │
│  │ │  svg   │ │  text   │ │ spinner  │     │           │
│  │ └────────┘ └─────────┘ └──────────┘     │           │
│  └──────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────┘
```

Features:
- **Interactive previews** — Change props in real-time (Mantine-style controls)
- **Anatomy diagrams** — Visual breakdown of component structure (Radix-style)
- **Code examples** — Copy-paste ready with Shiki syntax highlighting
- **Style tab** — Token mapping tables (semantic ↔ runtime path)
- **Accessibility tab** — ARIA specs, keyboard behavior, screen reader notes
- **Dark mode** — Full theme toggle with CSS variables
- **`Cmd+K` search** — Fuzzy search across all pages and components

### MCP Server

For AI tools (Claude Code, Cursor, etc.) that want to query the design system:

```
design-system-mcp/
└── 9 tools available:
    ├── lookup_component     — Find by name or keyword
    ├── get_component_detail — Full contract for a component
    ├── resolve_token        — Semantic token → CSS value
    ├── search_patterns      — Find UI combination patterns
    ├── list_components      — Browse by category
    ├── get_token_groups     — All token groups
    ├── get_governance       — Rules and anti-patterns
    ├── get_blocks           — Page-level compositions
    └── health               — Server status
```

---

## Ops Hub (Dashboard)

The operational dashboard for monitoring and managing all agent requests.

### Overview Page

```
┌─────────────────────────────────────────────────────────────────┐
│  Moloco Ops Hub                                                 │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ 87.5%    │ │ 23       │ │ 1.2m     │ │ 4.2%     │         │
│  │Success   │ │Today's   │ │Avg       │ │Error     │         │
│  │Rate      │ │Requests  │ │Latency   │ │Rate      │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
│                                                                 │
│  Daily Activity                    Agent Performance            │
│  ┌────────────────────────┐       ┌───────────────────────┐   │
│  │  ▃▅▇█▆▄▅              │       │  ████░░ layout  65%   │   │
│  │  M T W T F S S         │       │  ███░░░ copy    52%   │   │
│  └────────────────────────┘       │  ██░░░░ state   38%   │   │
│                                    └───────────────────────┘   │
│  Recent Requests                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ a8f3c2d1  ● preview  "Add Used Amount column"   1:23   │   │
│  │ 7bc4e1f2  ● done     "Change button label"      0:45   │   │
│  │ 3e9a0b5d  ● error    "Update form validation"   2:10   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Request Detail Page

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Requests    ● preview · 1:23 · tving · /oms/order          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ "Add a Used Amount column to the order list table"      │   │
│  │  Goal: Display used amount for each order               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────┬───────────────────────────────────┐   │
│  │ Agent Analysis       │ Preview                           │   │
│  │                      │                                   │   │
│  │ Understanding:       │ [████ Open Live Preview ████]     │   │
│  │ You want to add...   │                                   │   │
│  │                      │ ┌───────────────────────────┐    │   │
│  │ Steps:               │ │ [Screenshot]              │    │   │
│  │ ① Find container     │ └───────────────────────────┘    │   │
│  │ ② Add column def     │                                   │   │
│  │ ③ Update accessor    │ MCOrderListTableContainer.tsx     │   │
│  │ ④ Add i18n key       │ ko.json  en.json                  │   │
│  │ ⑤ Typecheck          │                                   │   │
│  │                      │                                   │   │
│  │ ⚠ Risks: Column      │                                   │   │
│  │ width adjustment      │                                   │   │
│  └─────────────────────┘───────────────────────────────────┘   │
│                                                                 │
│  Code Changes                                  +12 -3  3 files │
│  ▾ ──────────────────────────────────────────────────────────  │
│  diff --git a/MCOrderListTableContainer.tsx                    │
│  + { id: 'usedAmount',                                         │
│  +   Header: t('table.usedAmount'),                             │
│  +   accessor: 'usedAmount' },                                  │
│                                                                 │
│  ▸ Timeline (12 events)                                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  [✓ Approve & Create PR]  [Request Changes]  [Live Preview ↗]  │
└─────────────────────────────────────────────────────────────────┘
```

### What Ops Hub Tracks

| Data | Purpose |
|------|---------|
| Request status lifecycle | processing → preview → approved/rejected → done |
| Pipeline timeline | Every step with timestamps and duration |
| AI analysis | Understanding, approach, steps, risks, verification |
| Code diff | Inline syntax-highlighted diff with +/- counts |
| Changed files | Which files the agent modified |
| Screenshot | Visual capture of the modified page |
| Live preview URL | Direct link to the running modified app |
| PR URL | Link to the created GitHub pull request |
| Agent cost | API usage cost per request |
| Error details | Stack trace and phase when errors occur |

---

## What Types of Requests Work

### Works Well Now ✅

| Type | Example |
|------|---------|
| Add/remove table columns | "Add a Used Amount column" |
| Change button labels/text | "Change 'Submit' to 'Confirm Order'" |
| Modify spacing/padding | "Add more space between these cards" |
| Swap components | "Replace this dropdown with a radio group" |
| Simple layout changes | "Move this section above the table" |
| Add form fields | "Add an email input to this form" |
| Status text changes | "Change the error message to be more specific" |

### Needs Improvement 🟡

| Type | Challenge |
|------|-----------|
| PRD-based changes | PRD format varies; parsing accuracy needs work |
| Multi-page changes | Agent works per-page; cross-page consistency not guaranteed |
| Complex state logic | Event handlers with API calls need careful context |

### Not Supported Yet ❌

| Type | Phase |
|------|-------|
| Completely new page layouts | Phase 2 |
| Drag-and-drop interactions | Phase 3 |
| New components not in DS | Requires designer |
| Deep accessibility audits | Phase 3 |

---

## Local Services

| Service | URL | What It Does |
|---------|-----|-------------|
| Product App | http://localhost:8000 | The live TAS/TVING OMS app |
| Orchestrator | http://localhost:3847 | API server managing the pipeline |
| Ops Hub | http://localhost:4174 | Dashboard for request management |
| Design System Site | http://localhost:4176 | Component documentation |

---

## Numbers

| Metric | Value |
|--------|-------|
| Components in Design System | 95 |
| Design tokens | 186 |
| Pipeline stages | 7 |
| API endpoints | 11 |
| MCP Server tools | 9 |
| Avg request-to-preview time | 1–3 minutes |
| Max auto-refinement rounds | 3 |
| Sandbox isolation | Full Docker container per request |

---

## Repository

**GitHub:** https://github.com/kyungjaeha-moloco/moloco-inspect

```
moloco-inspect/
├── chrome-extension/      Chrome Extension (inspector, side panel)
├── orchestrator/          Pipeline server (Node.js)
├── sandbox/               Docker image for isolated execution
├── dashboard/             Ops Hub (React dashboard)
├── design-system/         95 component JSON contracts + tokens
├── design-system-site/    Documentation site (Carbon-style)
├── design-system-mcp/     MCP server for AI tool integration
├── tooling/               Sandbox manager, preview utilities
└── docs/                  Architecture docs, handoffs, proposals
```
