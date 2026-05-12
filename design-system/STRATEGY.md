# MSM Portal Background Agent — strategy document

> Research-based strategy for adapting the Ramp Inspect model to MSM Portal.
>
> Created: 2026-04-07
> References: [Ramp Inspect](https://builders.ramp.com/post/why-we-built-our-background-agent), [Open-Inspect](https://github.com/ColeMurray/background-agents)

---

## 1. Key lessons from Ramp Inspect

### Why Ramp succeeded
| Factor | Ramp's approach | What it means for us |
|--------|------------------|------------------------|
| **Design system as agent input** | Agent reads React internals + DOM tree (not screenshots) | A JSON design system → structured input the agent understands |
| **Full dev environment** | Vite + Postgres + Temporal run inside a sandbox | Mock API + Vite dev server is the agent's environment |
| **Visual verification** | Chrome extension takes before/after screenshots | Playwright-based screenshots compared against design-system baselines |
| **Background execution** | Image rebuild every 30 minutes, sandboxes start instantly | Git worktree + mock environment for isolated execution |
| **Key metric** | Agents author ~30% of PRs | A measurable goal for us too |

### Ramp vs. MSM Portal differences
|  | Ramp | MSM Portal |
|---|------|------------|
| Scale | Hundreds of engineers, many repos | CAS team, single monorepo |
| Infrastructure | Modal + Cloudflare (custom) | Claude Code + Git worktree (existing tooling) |
| Design system | Direct access to React internals | JSON-based structured design system (already built) |
| Backend | Real server environment | Mock API (runs without a backend) |

**Key insight**: Ramp built custom infrastructure, but we can implement the same loop with **Claude Code + existing tooling**. Our advantage is that the design system is **already structured**.

---

## 2. The design system we need

### Today (13 JSON files)
```
✅ Done:
tokens.json                — colors, spacing, typography, animation
components.json            — 67 components, props, accessibility
patterns.json              — 7 page blueprints
conventions.json           — naming, file structure, import rules
api-ui-contracts.json      — proto → model → UI mapping
component-behaviors.json   — semantic actions + data flow
state-machines.json        — state-transition rules
index.json                 — agent loading guide
generation-protocol.json   — 5-phase generation protocol
validation-runner.json     — 29 validation checks
ux-criteria.json           — 19 UX criteria
visual-inspection.json     — 21 visual-verification criteria
auto-fix-loop.json         — 14 auto-fix strategies
```

### Still needed

#### A. Visual reference database (new)
The agent has to know what "normal" looks like.
```json
{
  "page_type": "entity_list",
  "reference_screenshots": {
    "desktop": "refs/entity-list-desktop.png",
    "empty_state": "refs/entity-list-empty.png",
    "loading": "refs/entity-list-loading.png",
    "error": "refs/entity-list-error.png"
  },
  "visual_invariants": [
    "header height = 56px",
    "sidebar width = 220px",
    "table row height = 48px",
    "primary action button is always top-right"
  ]
}
```

#### B. Code examples database (new)
Real code examples per pattern (the agent copies and adapts).
```json
{
  "pattern": "entity_list",
  "example_entity": "order",
  "files": {
    "page": "src/apps/msm-default/page/order/OrderListPage.tsx",
    "container": "src/apps/msm-default/container/order/list/OrderListContainer.tsx",
    "component": "src/apps/msm-default/component/order/OrderListComponent.tsx"
  },
  "key_patterns": [
    "useQuery for data fetching",
    "MCTableActionBar for filters",
    "MCI18nTable for list rendering"
  ]
}
```

#### C. Error pattern database (new)
Common mistakes the agent makes and how to fix them.
```json
{
  "error": "Maximum update depth exceeded",
  "cause": "Formik form input outside Formik context",
  "fix": "Wrap form inputs in <Formik> provider",
  "detection": "grep for MCForm* without Formik ancestor"
}
```

#### D. Component dependency graph (new)
Which components require which Providers / Contexts.
```json
{
  "MCFormTextInput": {
    "requires": ["Formik", "ThemeProvider", "I18nextProvider"],
    "optional": ["MCFormPanel (layout)"]
  },
  "MCContentLayout": {
    "requires": ["ThemeProvider", "ReactRouter"],
    "optional": ["MCBreadcrumb (showBreadcrumb=true)"]
  }
}
```

---

## 3. The agents we need

Not Ramp's single agent — a **pipeline of role-specialized agents**.

### Agent pipeline architecture
```
[Request] → [Planner] → [Coder] → [Runner] → [Verifier] → [PR]
                 ↑                       ↓           ↓
             Design system        Mock environment Screenshots
                 ↑                       ↓           ↓
            patterns.json           Vite dev    Playwright
```

### Agent roles

| Agent | Role | Input | Output |
|-------|------|-------|--------|
| **Planner** | Analyse the request and form an execution plan | Natural-language request + design-system JSON | File list, change plan, which patterns to use |
| **Coder** | Generate / modify code | Plan + design system + codebase | The changed files |
| **Runner** | Execute and verify the build | Modified code | Build success/failure, runtime errors |
| **Verifier** | Visual + structural verification | Screenshots + validation-runner.json | Pass/fail report |
| **Fixer** | Auto-fix on verification failure | Error report + auto-fix-loop.json | Repaired code |

### Per-agent tooling

#### Planner agent
```
- read: design-system/src/*.json (especially index.json, patterns.json)
- search: codebase search (reference existing implementations)
- plan: produce the execution plan
```

#### Coder agent
```
- read: components.json, api-ui-contracts.json, conventions.json
- write: create / modify files
- validate: static validation against validation-runner.json
```

#### Runner agent
```
- exec: pnpm typecheck (type-checking)
- exec: pnpm lint (lint)
- exec: vitest run (tests)
- exec: vite build (build)
- mock: launch the mock-API environment
```

#### Verifier agent
```
- screenshot: capture pages via Playwright
- compare: verify against visual-inspection.json
- evaluate: UX evaluation against ux-criteria.json
```

---

## 4. The verification process

### Ramp's verification model
```
Backend: run tests → check telemetry → check feature flags
Frontend: screenshots → before/after comparison → React-tree inspection
```

### MSM Portal verification pipeline (5 stages)

#### Stage 1: Static analysis (automatic, immediate)
```bash
# Already in place
pnpm typecheck        # TypeScript type-checking
pnpm lint             # ESLint rules
# Still needed
validation-runner     # Design-system rules (no hardcoded colors, i18n, etc.)
```

#### Stage 2: Unit / component tests (automatic, ~30s)
```bash
vitest run --changed  # Only tests for files that changed
```

#### Stage 3: Visual regression (automatic, ~1 min)
```
1. Boot the Vite dev server against the mock environment.
2. Capture screenshots of target pages via Playwright.
3. pixel-diff against baseline images.
4. Fail if the threshold is exceeded.
```

#### Stage 4: UX evaluation (agent, ~30s)
```
1. Hand the screenshots to the agent.
2. Evaluate against 19 criteria from ux-criteria.json.
3. Verify against 21 visual checks from visual-inspection.json.
4. Return a score + specific feedback.
```

#### Stage 5: Human review (manual)
```
1. Open a PR with before/after screenshots.
2. Attach the change summary + verification results.
3. Human gives the final approval.
```

### Required test infrastructure

| Tool | Purpose | Status |
|------|---------|--------|
| Vitest | Unit / integration tests | ✅ Configured (121 tests) |
| Playwright | E2E + screenshots | ❌ Not installed |
| Mock API | Running the UI without a backend | 🟡 Partial (~70%) |
| Visual regression | Baseline-image comparison | ❌ Not built |
| Validation runner | Design-system rule validation | ✅ JSON defined, runner not yet built |

---

## 5. Plan to improve the current design system

### Priority 1: complete the agent execution environment (1–2 weeks)

Today agents can only "generate" code; "run + verify" is missing.

| Task | Description | Dependency |
|------|-------------|------------|
| **Reach 100% mock-API coverage** | Every page renders against mocks | Currently ~70% |
| **Install Playwright + basic screenshots** | Capture key pages | Mock API |
| **Validation-runner CLI** | A CLI that actually enforces the JSON-defined rules | None |

### Priority 2: visual-verification loop (2–3 weeks)

So the agent can iterate "change → check → fix."

| Task | Description | Dependency |
|------|-------------|------------|
| **Baseline screenshot repository** | Reference images for key pages / states | Playwright + mock API |
| **Visual-diff pipeline** | pixelmatch-based image comparison | Baseline screenshots |
| **Visual reference database** | "Normal state" definitions for the agent to reference | Baseline screenshots |

### Priority 3: code-examples database (1 week)

Real code examples the agent can reference when building a new page.

| Task | Description | Dependency |
|------|-------------|------------|
| **Example extractor** | Pull pattern-specific examples from existing code | patterns.json |
| **Code-examples JSON** | Pattern → file paths → key code snippets | Example extractor |

### Priority 4: design-system viewer (on hold)

A Storybook / Vite React viewer is **not essential for the agent**.
Agents read JSON directly, so a viewer is a **human review tool**.
→ Resume after the agent execution environment is complete.

---

## 6. Implementation roadmap

### Phase 2A: agent execution loop (next step)
```
Goal: agent completes one full "write code → build → screenshot → verify" cycle.

1. Reach 100% mock-API coverage.
2. Install Playwright + a screenshot-capture script.
3. Build a CLI tool from validation-runner.json.
4. Encode the workflow in CLAUDE.md so the agent uses these tools.
```

### Phase 2B: visual verification (after that)
```
Goal: the agent visually compares before / after a change.

1. Collect baseline screenshots for key pages (10 pages × 4 states).
2. Build the pixelmatch-based diff tool.
3. Auto-attach before / after screenshots to PRs.
```

### Phase 2C: autonomous PR creation
```
Goal: Ramp-style "request → PR" automation.

1. Git-worktree-based isolated environment.
2. Integrate the full pipeline: Plan → Code → Build → Screenshot → Verify → PR.
3. Slack / GitHub issue → agent trigger.
```

---

## 7. Success metrics

| Metric | Today | 6-month goal | Ramp level |
|--------|-------|--------------|------------|
| Agent PR share | 0% | 10% | 30% |
| Design-system coverage | 13 JSON files | +4 (visual refs, examples, errors, deps) | N/A |
| Mock-API coverage | ~70% | 100% | N/A |
| Visual-regression coverage | 0% | 10 key pages | Full |
| Agent build-success rate | Not yet measured | >80% | >90% |

---

## 8. Key decisions

### Decision 1: custom infrastructure vs. existing tooling
**→ Existing tooling (Claude Code + Git worktree + Playwright)**
- Ramp built custom infrastructure with Modal + Cloudflare; that's overkill at our scale.
- Claude Code already supports code generation + execution.
- Git worktree replaces the isolated environment.

### Decision 2: screenshots vs. React-tree inspection
**→ Screenshots first; React-tree later**
- Ramp accesses React internals via a Chrome extension.
- We start with Playwright screenshots + visual-inspection.json.
- React DevTools integration is something to revisit in Phase 3.

### Decision 3: design-system viewer
**→ On hold. Agent execution environment comes first.**
- The Vite-React viewer has complex dependency-resolution issues.
- Agents read JSON directly; the viewer isn't needed for them.
- Keep the existing static HTML viewer as a human review tool.

### Decision 4: background-agent architecture
**→ Claude Code-based + cron / trigger**
- Like Open-Inspect, use Claude Code's existing features rather than separate infrastructure.
- Use `/schedule` (cron trigger) for recurring tasks.
- Slack integration is implemented via MCP.
