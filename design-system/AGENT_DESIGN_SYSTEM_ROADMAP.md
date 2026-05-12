# Agent-Friendly Design System Roadmap

> Roadmap for evolving the MSM Portal design system to the point where agents can autonomously improve the product.
>
> Inspired by: [Ramp Inspect](https://builders.ramp.com/post/why-we-built-our-background-agent)
>
> Created: 2026-04-03
> Last updated: 2026-04-03

---

## Vision

```
Today:  Agents "read" design-system JSON and "generate" code (one-way)
Goal:   Agents "run" the product, "observe" the UI, and "verify" their
        changes — a complete two-way loop.

  docs ↔ code ↔ run ↔ verify
```

---

## Current state (baseline)

### Design-system file inventory
| File | Contents | Status |
|------|----------|--------|
| `tokens.json` | 54 colors, 9 typography scales, spacing, animation, elevation | ✅ Complete |
| `components.json` | 48 components — props, accessibility, states | ✅ Complete |
| `patterns.json` | 20 architecture / coding patterns | ✅ Complete |
| `conventions.json` | Naming, file structure, import rules | ✅ Complete |

### Strengths
- Comprehensive token system (colors, typography, spacing, animation).
- 48 components documented (props, accessibility, states, do's/don'ts).
- Architecture guidance via 20 patterns (Page → Container → Component).
- Clear naming conventions (MC, MT, SC, ME prefixes).

### Gaps (from an agent's perspective)
- No **semantic actions** describing what each component can do.
- No **API ↔ UI mapping** linking proto fields to UI rendering.
- No **state machines** describing state-transition rules.
- No **page blueprints** giving complete scaffolding for new pages.
- No **visual verification baseline** defining what "normal" looks like.

---

## Phase 1: design-system foundation

> So agents fully understand "what needs to be built."

### 1.1 Component semantic actions
**Goal:** specify which user interactions each component supports.

```json
{
  "MCFormTextInput": {
    "semantic_actions": [
      { "action": "user_inputs_text", "triggers": "onChange → formik.setFieldValue" },
      { "action": "validation_error", "triggers": "onBlur → meta.touched + meta.error" },
      { "action": "clear_input", "triggers": "resetForm() or setFieldValue(name, '')" }
    ],
    "data_flow": {
      "input": "formik.values[name]",
      "output": "formik.handleChange → parent container callback",
      "side_effects": ["form dirty state", "validation trigger"]
    }
  }
}
```

- [x] Create `component-behaviors.json` — semantic_actions + data_flow for 42 components (2026-04-03).
- [x] Split into a separate file (keeps `components.json` 1,530-line file stable) (2026-04-03).

### 1.2 Page blueprints
**Goal:** complete structural blueprint for each page type.

```json
{
  "page_type": "entity_list",
  "blueprint": {
    "required_apis": ["list{Entity}", "listAll{Entity}"],
    "required_hooks": ["use{Entity}s", "useEntityParam", "useInAppAlert"],
    "ui_structure": [
      "MCContentLayout > MCTableActionBar + MCI18nTable",
      "Tab navigation: available | draft | archived"
    ],
    "state_management": ["React Query cache", "table filter state", "search state"],
    "error_handling": "useEffect → fireCollapsibleError on query error"
  }
}
```

- [x] Add a `page_blueprints` section to `patterns.json` (2026-04-03).
- [x] Blueprints by page type: list, detail, create, edit, settings (2026-04-03).

### 1.3 API ↔ UI contract map (new file)
**Goal:** trace which proto field becomes which prop on which UI component.

```json
{
  "MIOrderProto": {
    "converter": "orderConverter (src/apps/msm-default/model/order/converter.ts)",
    "ui_mappings": [
      {
        "proto": "main_order.order_detail.title",
        "model": "order.orderDetail.title",
        "ui": "MCTable column 'title'",
        "renderer": "getTitleWithSubTitleRenderer"
      },
      {
        "proto": "main_order.status",
        "model": "order.orderStatus",
        "ui": "MCTable column 'status'",
        "renderer": "getOrderStatusRenderer → MCBadge"
      }
    ]
  }
}
```

- [x] Create `design-system/src/api-ui-contracts.json` (2026-04-03).
- [x] Mapped major entities: Order, AuctionOrder, Creative, Advertiser, Product, PublisherTarget (2026-04-03).
- [x] Add the new file to `CLAUDE.md` references (2026-04-03).

### 1.4 Component state machines (new file)
**Goal:** structure the state-transition rules per component.

```json
{
  "MCFormTextInput": {
    "states": {
      "idle": { "transitions": { "focus": "focused", "disable": "disabled" } },
      "focused": { "transitions": { "blur_valid": "idle", "blur_invalid": "error" } },
      "error": { "transitions": { "focus": "focused", "fix_value": "idle" } },
      "disabled": { "transitions": { "enable": "idle" } }
    }
  }
}
```

- [x] Create `design-system/src/state-machines.json` (2026-04-03).
- [x] State machines for Form components (17 of them) (2026-04-03).
- [x] State machines for interactive components (Dialog, Popover, MCTable, MCBarTabs, MCSnackbar) (2026-04-03).

---

## Phase 2: build the agent tooling

> So agents can run "generate → execute → verify" autonomously.

### 2.1 Finish the local mock environment
**Goal:** the agent can run / inspect the full UI without a backend.

- [x] Build a mock interceptor (`mock-interceptor.ts`).
- [x] Mock data for key APIs (orders, auction orders, creatives, targets, users, apps & pixels).
- [x] Resolve a React infinite-loop issue using async mock responses.
- [ ] Finish mocks for every detail page (some still return 401).
- [ ] Diversify mock-data scenarios (empty state, error state, large datasets).

### 2.2 Strengthen Figma MCP integration
**Goal:** agents read design changes directly and reflect them in code.

- [ ] Auto-sync pipeline: Figma design tokens → `tokens.json`.
- [ ] Auto-update `components.json` from Figma component design specs.
- [ ] Detect design changes → agent opens a code-change PR.

### 2.3 React DevTools integration
**Goal:** agents traverse the runtime component tree (Ramp's Chrome-Extension approach).

- [ ] Build a tool to extract the React component tree.
- [ ] Understand the UI through React internals, not the DOM.
- [ ] Selected region → extract component + props + state.

### 2.4 Screenshot-verification pipeline
**Goal:** automate before/after comparison.

- [ ] Screenshot capture on top of Playwright / Cypress.
- [ ] Per-component visual-regression baselines.
- [ ] Agent attaches before/after screenshots to every PR it opens.

### 2.5 Encode the workflow in CLAUDE.md
**Goal:** the agent automatically references the design system as part of its process.

- [x] Basic Quick-Reference table.
- [x] Agent workflow: "For UI changes → tokens → components → patterns → api-contracts, in that order" (2026-04-03).
- [x] Verification checklist: "no hardcoded tokens, i18n applied, accessibility confirmed" (2026-04-03).

---

## Phase 3: fully autonomous loop

> Like Ramp Inspect — "request → PR → verify → merge" runs autonomously.

### 3.1 Sandbox dev environment
**Goal:** agents write, run, and test code inside an isolated environment.

- [ ] Auto-spin an isolated environment via Git worktree.
- [ ] Auto-launch Vite dev server + mock API.
- [ ] Auto-run the test suite.
- [ ] Agent self-fixes build errors.

### 3.2 Automated visual-regression testing
**Goal:** visual verification for every UI change.

- [ ] Baseline screenshot repository for key pages.
- [ ] Auto-generate screenshot diffs per PR.
- [ ] Auto-detect unintended visual changes.

### 3.3 Multiplayer interface
**Goal:** non-engineers can also request UI changes from the agent.

- [ ] Slack integration: "add a filter to the orders list" → agent opens a PR.
- [ ] Figma comment → triggers an agent task.
- [ ] In-review edits while a PR is being reviewed.

### 3.4 Self-healing
**Goal:** agents auto-detect and fix production errors.

- [ ] Sentry error → agent analysis.
- [ ] Auto-generated fix PR + tests.
- [ ] DataDog metric anomaly → UI performance-optimization PR.

---

## Tracking

### Progress summary
| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1: Design-system foundation | 100% | ✅ Complete |
| Phase 2: Agent tooling | 20% | 🟡 In progress (mock environment) |
| Phase 3: Fully autonomous loop | 0% | ⬜ Planned |

### Key metrics (targets)
- **Agent PR share:** today 0% → goal 30% (Ramp level).
- **Design-system coverage:** today 7 files ✅ (tokens, components, patterns, conventions, api-ui-contracts, component-behaviors, state-machines).
- **Mock API coverage:** today ~70% → goal 100%.
- **Visual-verification automation:** today 0% → goal 100% on the key pages.

### Decision log
| Date | Decision | Why |
|------|----------|-----|
| 2026-04-03 | Use per-API mocks (no global interceptor) | The axios-interceptor / proxy approach conflicted with React Query, causing an infinite loop. |
| 2026-04-03 | Add `setTimeout(0)` to mock responses | Synchronous `Promise.resolve` triggered state updates inside the React render cycle, producing a "Maximum update depth" error. |
| 2026-04-03 | Patch MCRouteErrorElement in dev mode | The moloco-cloud-react-ui error screen has its own infinite-loop bug. |

---

## References

- [Ramp: Why We Built Our Background Agent](https://builders.ramp.com/post/why-we-built-our-background-agent)
- [React Grab](https://github.com/nicholasgriffintn/react-grab) — React component-tree extractor (Ramp-recommended).
- [OpenCode](https://github.com/nicholasgriffintn/opencode) — agent framework (used by Ramp).
- Design System source: `design-system/src/` (tokens, components, patterns, conventions).
