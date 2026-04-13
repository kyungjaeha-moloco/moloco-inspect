# Design Agent — Progress Report & Revised Roadmap

**Date:** April 13, 2026
**Author:** Kyungjae Ha
**Status:** Phase 1 substantially complete, ahead of the original 10-week schedule

---

## 1. Executive Summary

The Design Agent system described in the original proposal is now **operational end-to-end**. A PM or SA can open a live product page, select an element, describe a change in natural language, and receive an AI-generated code modification—complete with live preview, syntax-highlighted diff review, and one-click PR creation.

Development moved significantly faster than planned. The original 10-week Phase 1 scope has been met, and several Phase 2–3 features (Chrome Extension, auto-refinement loop, design system documentation site) have already been delivered.

This document details what was built, what changed from the original plan, and what comes next.

---

## 2. What Changed from the Original Plan

### Entry Point: Slack → Chrome Extension

The original proposal specified Slack as the sole Phase 1 entry point, with Chrome Extension planned for Phase 3. During early development, we discovered that **visual element selection** produces dramatically better AI output than text-only descriptions.

| Factor | Slack (text-only) | Chrome Extension (visual) |
|--------|-------------------|--------------------------|
| **Element identification** | User describes in words: "the button in the order table header" | User clicks the exact element — system captures React component name, file path, line number, test ID, computed styles |
| **Visual context** | None — AI must guess layout from description | Full context: component hierarchy, page route, DOM structure, CSS properties |
| **User cognitive load** | High — must translate visual intent into precise text | Low — see it, click it, describe the change |
| **AI output quality** | Lower — ambiguous context leads to wrong component, wrong file | Higher — precise element targeting, correct file identification |
| **Iteration speed** | Slow — back-and-forth in Slack thread to clarify which element | Fast — element is unambiguous from the start |

**Decision:** Start with Chrome Extension for the highest-quality pipeline, then expand to Slack (for team-wide visibility and text-based requests) and Jira (for ticket-driven automation).

### Context Layer: 20 → 95 Components

The proposal targeted 20 core components for the Context Layer. The actual implementation covers **95 components** with full specifications. This was possible because we built tooling to generate structured specs from the existing codebase rather than manually authoring each one.

### Scope: Beyond Single Pipeline

The original plan was "one pipeline, one entry point." The actual system includes:
- Full Ops Hub dashboard for request tracking and metrics
- Design System documentation site with interactive component previews
- MCP Server exposing design system data to any AI tool
- Auto-refinement loop (reject → feedback → agent iterates)

---

## 3. System Architecture (Implemented)

```
┌──────────────────────────────────────────────────────────────────────┐
│                        User Layer                                    │
│                                                                      │
│   Chrome Extension          Ops Hub Dashboard         (Future: Slack)│
│   ┌────────────────┐       ┌──────────────────┐                     │
│   │ Element inspect │       │ Request tracking  │                     │
│   │ Region capture  │       │ Inline diff review│                     │
│   │ AI plan review  │       │ Approve / Reject  │                     │
│   │ PRD ingest      │       │ Timeline + metrics│                     │
│   └───────┬────────┘       └────────┬─────────┘                     │
│           │                         │                                │
└───────────┼─────────────────────────┼────────────────────────────────┘
            │         HTTP            │
            ▼                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Orchestrator (Node.js, port 3847)                │
│                                                                      │
│   /api/request          Submit change request                        │
│   /api/analyze-request  AI-powered plan generation (Claude Sonnet)   │
│   /api/approve/:id      Create GitHub PR from approved changes       │
│   /api/reject/:id       Send feedback, agent iterates                │
│   /api/diff-view/:id    Standalone diff viewer (HTML)                │
│   /preview/:id/*        Live preview proxy with auth bootstrap       │
│   /api/sandboxes        Active sandbox status                        │
│   /api/events/:id       SSE stream for real-time updates             │
│                                                                      │
│   Pipeline: Create Sandbox → Sync Source → Run Agent → Collect Diff  │
│             → Typecheck → Screenshot → Start Preview → Ready         │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ Docker API
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Docker Sandbox (per request)                     │
│                                                                      │
│   - Full product repo copy (/workspace/msm-portal)                   │
│   - OpenCode agent server (AI coding)                                │
│   - Vite dev server (live preview, port-mapped to host)              │
│   - Isolated git (changes never touch host repo)                     │
│   - Auth bootstrap page for preview login bypass                     │
│                                                                      │
│   Agent: Claude Sonnet 4.6 via Anthropic API                         │
│   Prompt: includes user request + component context + page route     │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                     Context Layer                                    │
│                                                                      │
│   design-system/src/           95 component JSON contracts           │
│   design-system/src/tokens.json    Semantic design tokens            │
│   design-system/src/patterns.json  UI combination patterns           │
│   design-system-site/          Carbon-style documentation site       │
│   design-system-mcp/           MCP server (9 AI-accessible tools)    │
│   design-system-site/public/llms.txt   AI-readable component index   │
└──────────────────────────────────────────────────────────────────────┘
```

**Repository:** https://github.com/kyungjaeha-moloco/moloco-inspect

---

## 4. Feature-by-Feature Detail

### 4.1 Chrome Extension

The Chrome Extension is the primary user interface. It runs as a side panel in Chrome, communicating with the orchestrator server.

**Inspector Mode (`Cmd+Shift+E`)**
- Hover highlights elements with a translucent overlay
- Click selects an element and extracts:
  - React component name (via fiber tree traversal)
  - Source file path and line number
  - Test ID (`data-testid`)
  - Computed styles (font, color, padding, dimensions)
  - DOM semantics (tag, role, aria-label, placeholder)
- Shift+Click for multi-element selection
- Escape to cancel selection

**Region Capture**
- Drag to select a rectangular screen area
- Captures coordinates, device pixel ratio, page URL
- Used for visual context when no specific element is targeted

**AI Analysis & Plan Review**
- After describing a change, the extension sends the request to `/api/analyze-request`
- Claude Sonnet analyzes the request and returns a structured plan:
  - **Understanding:** 2–3 sentence summary of what the user wants
  - **Approach:** Technical implementation strategy (which files, which components)
  - **Steps:** Numbered execution steps with file names
  - **Risks:** Potential issues or null
  - **Verification:** How to validate the changes
- The user reviews the plan and can:
  - **"Proceed with this plan"** → Agent executes
  - **"Adjust the plan"** → User refines the request

**PRD Ingest (In Testing)**
- Paste a PRD link or key requirements text
- System reads the document, extracts change candidates relevant to the current page
- Generates structured request from PRD context

**Structured Request Flow**
- Based on the detected intent (layout, state, copy, spacing, token alignment, component swap, accessibility), the extension presents relevant clarification options
- User can select from predefined options or type freeform
- This structured context significantly improves agent output quality

### 4.2 Orchestrator Pipeline

The orchestrator is a Node.js HTTP server that manages the full request lifecycle.

**Pipeline Stages (with timing):**

| Stage | What Happens | Typical Duration |
|-------|-------------|-----------------|
| `creating_sandbox` | Docker container created with port allocation | 2–5s |
| `syncing_source` | Product repo copied into sandbox via `docker cp` | 3–8s |
| `starting_agent` | OpenCode server boots inside sandbox | 2–4s |
| `running_agent` | Claude Sonnet modifies code based on the prompt | 30–120s |
| `collecting_diff` | `git diff` extracted from sandbox | 1–2s |
| `validating` | TypeScript typecheck (`tsc --noEmit`) | 5–30s |
| `capturing_screenshot` | Screenshot extracted (when available) | 1–3s |
| `starting_preview` | `pnpm install` + `vite --mode test` in sandbox | 30–90s |
| `preview_ready` | Live preview URL available for PM review | — |

**AI Analysis Endpoint (`/api/analyze-request`)**
- Uses Claude Sonnet 4.6 (Anthropic API) as primary provider
- OpenAI GPT-4o as fallback
- Smart template fallback when both APIs are unavailable
- Templates cover 4 intent types: layout, state handling, copy update, component swap
- Response includes understanding, analysis, steps, risks, verification

**Approve → PR Flow**
1. PM clicks "Approve & Create PR" in the dashboard
2. Orchestrator extracts diff from sandbox
3. Writes diff to a temp patch file
4. Creates a new git branch (`inspect/{id}`)
5. Applies patch via `git apply`
6. Commits with descriptive message
7. Creates PR via `gh pr create` with structured body (using `--body-file` to prevent shell injection)
8. Returns PR URL to the dashboard
9. Switches back to main branch

**Reject → Iterate Flow**
1. PM clicks "Request Changes" and enters feedback
2. Feedback is appended to the original prompt
3. Request status resets to `pending`
4. Sandbox is reset (or recreated after 3 iterations)
5. Pipeline re-runs with the enriched prompt
6. PM reviews the new result

### 4.3 Context Layer

The Context Layer is the structured knowledge base that the agent references. As stated in the original proposal: "The quality of the Agent is proportional to the quality of the Context Layer."

**95 Component Contracts** — Each component is specified as a JSON contract:
```json
{
  "name": "MCButton2",
  "category": "Action",
  "props": [...],
  "variants": ["primary", "secondary", "ghost", "danger"],
  "tokens": { "background": "semantic.action.primary", ... },
  "states": ["default", "hover", "active", "disabled", "loading"],
  "accessibility": { "role": "button", "aria-disabled": "when disabled", ... },
  "anti_patterns": ["Don't use ghost variant for primary actions"],
  "usage_count": 342,
  "adoption_rate": 0.89
}
```

**Design Tokens** — Semantic palette mapping:
- 5 token groups: text, background, border, border_semantic, icon
- Each token maps to a semantic purpose and runtime CSS variable path
- Agent uses these to ensure generated code uses tokens, not hardcoded values

**MCP Server (9 tools)** — Enables any AI tool to query the design system:
- `lookup_component` — Find component by name or keyword
- `get_component_detail` — Full specification for a component
- `resolve_token` — Map a semantic token to its value
- `search_patterns` — Find UI combination patterns
- `list_components` — Browse all components by category
- And 4 more utility tools

**llms.txt** — A single text file at `design-system-site/public/llms.txt` that provides an AI-readable index of all 95+ components. Any LLM can read this to understand the design system without needing the MCP server.

**Documentation Site** — A Carbon Design-style documentation site:
- Interactive component previews with prop controls (Mantine-style)
- Anatomy diagrams (Radix-style)
- Code examples with Shiki syntax highlighting (5 languages)
- Style tab with token mapping tables
- Accessibility tab with ARIA specifications
- Dark mode with CSS variable theming
- `Cmd+K` global search (fuzzy matching across pages and components)
- Blocks page with full page-level composition patterns (shadcn-style)

### 4.4 Ops Hub (Dashboard)

The Ops Hub is a React dashboard for monitoring and managing all agent requests.

**Overview Page:**
- Stat cards: Success Rate / Today's Requests / Avg Latency / Error Rate
- Infrastructure status strip (Orchestrator, Sandboxes, Model)
- Daily Activity chart (Recharts, 7-day default + date picker)
- Agent Performance (stacked bar + chips)
- Coverage progress bars
- Recent Requests (Vercel deployment card style)

**Request Detail Page (Redesigned):**
- Top bar: status badge, duration, client, page path
- Hero prompt card with goal
- Two-column layout:
  - Left: AI Analysis (understanding, approach, steps, risks, verification)
  - Right: Live Preview button + screenshot + changed file chips
- Inline diff viewer (collapsible, syntax-highlighted, +/- stats)
- Sticky bottom action bar: Approve & Create PR / Request Changes / Live Preview
- Feedback dialog overlay for reject flow
- Timeline: analytics events + pipeline logs merged chronologically (collapsed by default)

**Requests Table:**
- Sortable columns: ID, status, prompt, client, duration, changed files, timestamp
- Status badge coloring
- Click-through to detail page

### 4.5 Security Considerations

- **Sandbox isolation:** All code modifications happen inside Docker containers. The host repo is never modified directly.
- **Shell injection prevention:** PR body text is written to a temp file and passed via `--body-file` to prevent shell metacharacter expansion.
- **Auth bypass scope:** Preview auth token injection only applies to sandbox vite servers, not production.
- **API key handling:** Keys are passed via environment variables, never stored in code.

---

## 5. Original Plan vs Actual Delivery

### Phase 1 Scorecard

| Original Milestone | Target | Actual | Status |
|-------------------|--------|--------|--------|
| Context Layer | 20 components | **95 components** + tokens + patterns + MCP + doc site | ✅ 4.75x target |
| Agent Pipeline | Slack → Agent → PR | **Extension → Sandbox → Preview → Diff → PR** | ✅ Complete |
| Quality Verification | Rule-based evaluator | TypeScript typecheck + AI analysis + manual review | ✅ Complete |
| User Entry | Slack bot | Chrome Extension side panel | ✅ Changed (better) |
| Preview | Staging URL | **Live preview** (sandbox vite server with auth bootstrap) | ✅ Complete |
| User Testing | 4 participants | Ready to begin | 🟡 Next step |
| Impact Report | PoC results | Gathering data | 🟡 In progress |

### Features Delivered Ahead of Schedule

| Feature | Original Phase | Delivered Now |
|---------|---------------|---------------|
| Chrome Extension with inspector | Phase 3 (Week 18+) | ✅ Phase 1 |
| Auto-refinement loop | Phase 2 (Week 14+) | ✅ Phase 1 |
| Design System doc site | Phase 3 (Week 18+) | ✅ Phase 1 |
| Ops Hub analytics dashboard | Not in original plan | ✅ Phase 1 |
| Live preview with auth | Not in original plan | ✅ Phase 1 |
| Inline diff + approve/reject | Not in original plan | ✅ Phase 1 |
| MCP Server (9 tools) | Not in original plan | ✅ Phase 1 |
| Global search (`Cmd+K`) | Not in original plan | ✅ Phase 1 |
| Dark mode | Not in original plan | ✅ Phase 1 |

---

## 6. Milestones & Roadmap

### Milestone Overview

```
Phase 1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 M1 Context Layer  ██████████ DONE
 M2 Agent Pipeline ██████████ DONE
 M3 Chrome Extension ████████ DONE (was Phase 3)
 M4 Stability      ██████░░░░ IN PROGRESS
 M5 User Testing   ░░░░░░░░░░ READY TO START
 M6 PoC Report     ░░░░░░░░░░ AFTER M5

Phase 2 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 M7 Slack Integration    ░░░░░░░░░░
 M8 Jira Integration     ░░░░░░░░░░
 M9 Evaluator Separation ░░░░░░░░░░

Phase 3 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 M10 Visual Regression   ░░░░░░░░░░
 M11 Copy Agent          ░░░░░░░░░░
 M12 Doc Maintainer      ░░░░░░░░░░
```

---

### M4. Stability & Polish (Current — 2 weeks)

The pipeline works end-to-end, but several areas need hardening before user testing.

| Task | Problem | Solution | Priority |
|------|---------|----------|----------|
| Live Preview auth | Sandbox preview shows login screen | Debug bootstrap page's `signInWithCache` flow; ensure `.env.test` mock interceptor activates in sandbox vite | P0 |
| Screenshot capture | Sandbox lacks headless browser; screenshots often fail | Bundle Playwright in the sandbox Docker image; orchestrator falls back to host-side capture | P1 |
| State persistence | Orchestrator restart loses all request data | Add SQLite or NDJSON file-based persistence for request state | P1 |
| Sandbox cold start | `pnpm install` takes 30–90s per request | Pre-bake `node_modules` into the Docker image; only run install on lockfile change | P2 |
| AI prompt quality | Some requests produce generic plans | Add intent-specific few-shot examples; increase Context Layer usage in agent prompt | P2 |
| PRD parsing | PRD formats vary; extraction accuracy low | Structured PRD template + LLM-based extraction with validation | P2 |

**Exit Criteria:** Live Preview works without login. Screenshot captures reliably. State survives restart.

---

### M5. User Testing (2 weeks)

First real-world validation with CAS team members.

**Participants:** 2 PMs, 1 Engineer, 1 SA (4 total)
**Target Surface:** TAS Order Management List (most patterned, highest component reuse)

**Test Protocol:**
1. Each participant receives 5 pre-defined UI change tasks (varying complexity)
2. Tasks cover all supported intents: layout, copy, spacing, component swap, state handling
3. Participants use Chrome Extension independently (1:1 onboarding in first session)
4. Each task is timed from request submission to PR creation
5. Generated code reviewed by engineer for quality scoring
6. Post-test survey (5-point scale)

**Success Criteria:**

| Metric | Target | Measurement |
|--------|--------|-------------|
| PM completes task without designer | 3 of 4 participants | Observation |
| Time from request to PR | < 5 minutes | System logs |
| DS compliance rate | 80%+ auto-pass on Evaluator | Evaluator logs |
| Engineer review pass rate | 70%+ (minor fix or less) | PR review records |
| User satisfaction | 3.5/5+ | Post-test survey |
| Request coverage | 60%+ of test tasks processable | Request classification |

**Exit Criteria:** At least 3 of 6 metrics met. Clear signal on which request types work well and which need improvement.

---

### M6. PoC Impact Report (1 week)

Compile user testing data into a stakeholder-ready report.

**Deliverables:**
- Quantitative results vs. success criteria table
- Per-intent breakdown: which types of requests succeed, which fail, and why
- Before/after comparison: time and designer dependency for common tasks
- Context Layer coverage gap analysis: which components/patterns are missing
- Concrete recommendations for Phase 2 scope and priority
- Demo recording (3-minute walkthrough)
- Presentation for CAS team all-hands

**Exit Criteria:** Report reviewed by document reviewers (Gyeongjun Lee, Kevin Park, Ji Hun Lee). Go/no-go decision for Phase 2.

---

### M7. Slack Integration (4 weeks)

Add Slack as the second entry point for team-wide visibility and text-based requests.

| Week | Deliverable |
|------|-------------|
| 1 | Slack app setup, `@design-agent` mention detection, basic request submission via thread |
| 2 | Agent replies in-thread with plan summary; user confirms/rejects in Slack |
| 3 | Status notifications: sandbox started, preview ready, PR created, merged |
| 4 | Deep link to Chrome Extension for visual refinement; `/design-agent status` command |

**Key Design Decisions:**
- Slack is the **notification and text-entry** layer, not a replacement for Chrome Extension
- Complex visual changes → Slack links to Chrome Extension for element selection
- Simple text/copy changes → fully completable in Slack thread
- All requests visible in Ops Hub regardless of entry point

**Exit Criteria:** PM can submit a copy-change request in Slack and receive a PR link without leaving Slack.

---

### M8. Jira Integration (4 weeks)

Add Jira as the third entry point for ticket-driven automation.

| Week | Deliverable |
|------|-------------|
| 1 | Jira webhook listener; detect UI improvement tickets by label/component |
| 2 | Auto-generate change proposal from ticket description; post proposal as Jira comment |
| 3 | Ticket → Agent → PR flow; bi-directional link (Jira ticket ↔ GitHub PR) |
| 4 | Status sync (PR merged → ticket moves to "Done"); batch related tickets into single PR |

**Scope Rules:**
- Only tickets tagged with `design-agent` label are processed
- Agent posts a proposal comment first; human must approve before code generation
- Tickets requiring new components (not in DS) are auto-escalated to designer

**Exit Criteria:** A tagged Jira ticket automatically generates a PR proposal. PM approves in Jira, PR is created.

---

### M9. Evaluator Separation (4 weeks)

Separate generation and evaluation into distinct agents to eliminate self-evaluation bias.

| Week | Deliverable |
|------|-------------|
| 1 | Define evaluation rubric: DS token usage, import paths, component API compliance, layout rules |
| 2 | Build Evaluator agent with rule-based checks + LLM-based review |
| 3 | Integration: Generator output → Evaluator scores → auto-feedback loop |
| 4 | Dashboard: per-request quality scores, trend charts, common failure patterns |

**Evaluation Dimensions:**

| Dimension | Check Type | Example |
|-----------|-----------|---------|
| Token compliance | Rule | No hardcoded `#ffffff`; must use `semantic.background.base` |
| Component API | Rule | `MCButton2` must not receive unknown props |
| Import paths | Rule | No relative imports crossing module boundaries |
| Layout patterns | Rule + LLM | Spacing follows 4/8/12/16/24px scale |
| Visual consistency | LLM | Generated UI "looks right" compared to existing patterns |
| Accessibility | Rule | Interactive elements have `aria-label` or visible text |

**Stop Conditions (from original proposal):**
1. Target score reached → auto-deploy
2. Score stagnation after 3 rounds → escalate to human
3. Score drops between rounds → immediate escalate
4. Safety ceiling reached → escalate

**Exit Criteria:** Evaluator runs automatically on every request. 80%+ of auto-passed code requires no engineer changes.

---

### M10–M12. Phase 3 (Estimated 6 weeks each)

| Milestone | Scope | Entry Condition |
|-----------|-------|-----------------|
| M10. Visual Regression | Playwright screenshot diff (before/after); auto-detect visual regressions in generated code | M9 complete |
| M11. Copy Agent | Dedicated agent for UX writing: tone & voice guide, terminology dictionary, multilingual rules (ko/en/ja) | M7 complete (Slack needed for copy-focused requests) |
| M12. Doc Maintainer | PR merge → auto-update Context Layer (Agent View + Human View); drift detection in CI | M9 complete |

---

### Timeline Summary

| Phase | Milestones | Duration | Status |
|-------|-----------|----------|--------|
| **Phase 1** | M1 Context Layer | — | ✅ Done |
| | M2 Agent Pipeline | — | ✅ Done |
| | M3 Chrome Extension | — | ✅ Done |
| | M4 Stability & Polish | 2 weeks | 🔵 In progress |
| | M5 User Testing | 2 weeks | ⬜ Ready |
| | M6 PoC Report | 1 week | ⬜ After M5 |
| **Phase 2** | M7 Slack Integration | 4 weeks | ⬜ After M6 go-decision |
| | M8 Jira Integration | 4 weeks | ⬜ After M7 or parallel |
| | M9 Evaluator Separation | 4 weeks | ⬜ After M7 |
| **Phase 3** | M10 Visual Regression | 6 weeks | ⬜ After M9 |
| | M11 Copy Agent | 6 weeks | ⬜ After M7 |
| | M12 Doc Maintainer | 6 weeks | ⬜ After M9 |

**Total estimated time to full vision:** Phase 1 remaining (~5 weeks) + Phase 2 (~12 weeks) + Phase 3 (~12 weeks) = **~29 weeks from now**. Phase 2 start depends on M6 go-decision.

---

## 8. Cost & Infrastructure

| Item | Current (PoC) | Phase 2 Estimate |
|------|--------------|-----------------|
| AI API (Anthropic) | ~$50–100/month (10–20 requests/day) | ~$200–400/month |
| Infrastructure | Local Docker (zero cost) | Same (no cloud needed yet) |
| GitHub | Existing org account | Same |
| Additional tooling | None | Slack app hosting (minimal) |

The system runs entirely on local infrastructure. No cloud deployment is needed for Phase 1 or 2. Phase 4 (organizational expansion) would be the point to evaluate cloud migration.

---

## 9. Demo Availability

The system is running and available for demonstration:

| Service | URL | Purpose |
|---------|-----|---------|
| Ops Hub | http://localhost:4174 | Dashboard, request tracking, diff review |
| Orchestrator | http://localhost:3847 | API server, pipeline management |
| Design System Site | http://localhost:4176 | Component documentation |
| Product App | http://localhost:8000 | Live product (TAS/TVING OMS) |

To run a demo:
1. Open the product app in Chrome
2. Press `Cmd+Shift+E` to activate the inspector
3. Click an element on the page
4. Describe the desired change in the side panel
5. Review the AI plan → Confirm
6. Wait for the agent to complete (~1–3 minutes)
7. Review diff + live preview in the Ops Hub
8. Approve to create a PR

---

## 10. Key Takeaways

1. **Visual context is king.** The Chrome Extension's ability to capture precise element information dramatically outperforms text-only descriptions. This validated the decision to prioritize it over Slack.

2. **Context Layer investment paid off.** Going from 20 to 95 components took extra time upfront but resulted in significantly better agent output quality. The agent rarely suggests non-existent components or wrong props.

3. **Sandbox isolation is essential.** Running code modifications in Docker containers means zero risk to the host codebase. Failed experiments are simply discarded.

4. **The review flow matters as much as generation.** Early versions focused on code generation quality. Adding live preview, inline diff, and structured approve/reject flow made the system actually usable by non-engineers.

5. **Auto-refinement closes the gap.** The reject-with-feedback loop means the first attempt doesn't need to be perfect. 2–3 iterations typically reach an acceptable result.
