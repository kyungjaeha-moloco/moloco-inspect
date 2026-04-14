# Design Agent — Progress Report & Revised Roadmap

**Kickoff:** March 26, 2026 | **Updated:** April 14, 2026 (Day 19)
**Author:** Kyungjae Ha
**Status:** Phase 1 core complete in ~18 days vs. planned 70 days (4× faster). Stability & Polish in progress.

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

## 6. Milestones & Roadmap (M1–M16)

### Phase Objectives

| Phase | Question | Focus |
|-------|----------|-------|
| **Phase 1** | "Does it work?" | Pipeline verification + PoC |
| **Phase 2** | "Can the team use it?" | Channel expansion + Quality automation + Deploy + Training |
| **Phase 3** | "Does it run itself?" | Self-managing quality + Production hardening |

### Timeline (M1–M16, Target: August 15, 2026)

| Phase | # | Milestone | Duration | Target | Status |
|-------|---|-----------|----------|--------|--------|
| **Phase 1** | | **"Does it work?"** | | | |
| *Pipeline* | M1 | Context Layer (95 components, tokens, patterns) | — | — | ✅ Done |
| | M2 | Agent Pipeline (sandbox → code → validate → preview → PR) | — | — | ✅ Done |
| | M3 | Chrome Extension (inspector, capture, AI analysis, plan review) | — | — | ✅ Done |
| | M4 | Design System Site (Carbon-style, interactive previews, prop controls, dark mode, ⌘K search) | — | — | ✅ Done |
| | M5 | Ops Hub Dashboard (request tracking, inline diff, approve/reject, timeline, metrics) | — | — | ✅ Done |
| *PoC* | M6 | Stability & Polish | 2w | Apr 14 – 25 | 🔵 In progress |
| | M7 | User Testing (PM 2, Eng 1, SA 1) | 2w | Apr 28 – May 9 | ⬜ |
| | M8 | PoC Report & Go/No-Go | 1w | May 12 – 16 | ⬜ |
| | | *Buffer — PoC feedback incorporation* | *1w* | *May 19 – 23* | |
| | | | | | |
| **Phase 2** | | **"Can the team use it?"** | | | |
| *Channel Expansion* | M9 | External Integration (Slack + Jira + PRD parsing) | 4w | May 26 – Jun 20 | ⬜ |
| *Quality Automation* | M10 | Evaluator Separation (Generator vs Evaluator) | 1.5w | Jun 23 – Jul 2 | ⬜ |
| *Deploy & Rollout* | M11 | Server Deploy & QA | 1w | Jul 3 – 9 | ⬜ |
| | M12 | Demo, Onboarding & Rollout | 1.5w | Jul 10 – 18 | ⬜ |
| | | | | | |
| **Phase 3** | | **"Does it run itself?"** | | | |
| *Self-managing Quality* | M13 | Visual Regression — Eng (Playwright screenshot diff) | 1.5w | Jul 21 – 30 | ⬜ |
| | M14 | Copy Agent — Designer (UX writing, i18n) | 1.5w | Jul 21 – 30 (parallel) | ⬜ |
| | M15 | Doc Maintainer (auto-update Context Layer on code change) | 1w | Jul 31 – Aug 6 | ⬜ |
| *Production Hardening* | M16 | Production Hardening (monitoring, backup, error recovery) | 1.5w | Aug 7 – 15 | ⬜ |

---

### Already Completed (M1–M5)

| # | Milestone | Key Deliverables |
|---|-----------|-----------------|
| M1 | Context Layer | 95 component JSON contracts, 186 design tokens, 12 UI patterns, MCP server (9 tools), llms.txt |
| M2 | Agent Pipeline | Orchestrator, Docker sandbox, Claude Sonnet agent, typecheck, live preview, diff viewer, PR creation, auto-refinement (3 rounds) |
| M3 | Chrome Extension | Element inspector, region capture, AI plan review, structured requests, PRD ingest (basic), `Cmd+Shift+E` shortcut |
| M4 | Design System Site | Carbon-style doc site, interactive prop controls (Mantine-style), anatomy diagrams (Radix-style), Shiki syntax highlighting, style/a11y tabs, Blocks page, dark mode, ⌘K global search |
| M5 | Ops Hub Dashboard | Overview (stat cards, daily activity chart, donut performance chart), request list, request detail (inline diff, approve/reject, sticky action bar, AI analysis, timeline), state persistence |

---

### M6. Stability & Polish (Apr 14 – 25)

| Task | Problem | Solution | Priority |
|------|---------|----------|----------|
| Live Preview auth | Sandbox preview shows login screen | Inject auth tokens into sandbox `index.html` before vite starts | P0 |
| Screenshot capture | Sandbox lacks headless browser | Playwright captures screenshot after vite is ready | P1 |
| State persistence | Orchestrator restart loses data | File-based persistence (`state/{id}.json`), restore on startup | P1 |
| Sandbox cold start | `pnpm install` takes 30–90s | Pre-bake `node_modules` into Docker image | P2 |
| AI prompt quality | Some requests produce generic plans | Intent-specific few-shot examples + Context Layer usage | P2 |

**Exit Criteria:** Live Preview works without login. Screenshot captures reliably. State survives restart.

---

### M7. User Testing (Apr 28 – May 9)

**Participants:** 2 PMs, 1 Engineer, 1 SA (4 total)
**Target:** TAS Order Management List

| Metric | Target | Measurement |
|--------|--------|-------------|
| PM completes task without designer | 3 of 4 participants | Observation |
| Time from request to PR | < 5 minutes | System logs |
| DS compliance rate | 80%+ auto-pass | Evaluator logs |
| Engineer review pass rate | 70%+ (minor fix or less) | PR review records |
| User satisfaction | 3.5/5+ | Post-test survey |
| Request coverage | 60%+ of test tasks | Request classification |

**Exit Criteria:** At least 3 of 6 metrics met.

---

### M8. PoC Report & Go/No-Go (May 12 – 16)

**Deliverables:** Results vs. criteria table, per-intent breakdown, before/after comparison, demo recording, CAS team presentation.

**Exit Criteria:** Report reviewed by Gyeongjun Lee, Kevin Park, Ji Hun Lee. Go/no-go decision for Phase 2.

**Buffer (May 19 – 23):** Incorporate PoC feedback before Phase 2 begins.

---

### M9. External Integration (May 26 – Jun 20)

Slack, Jira, and PRD parsing in a single milestone — 3 entry channels unified.

| Week | Focus | Deliverable |
|------|-------|-------------|
| 1 (May 26) | Slack | Bot setup, `@design-agent` mention, thread-based request/response |
| 2 (Jun 2) | Jira | Webhook listener, ticket detection, proposal comment |
| 3 (Jun 9) | Jira + PRD | Ticket→PR link, PRD basic parsing, component mapping |
| 4 (Jun 16) | PRD + QA | PRD change candidate generation, 3-channel integration testing |

**Exit Criteria:** PM can request via Slack or Jira and receive a PR. PRD link extracts actionable items.

---

### M10. Evaluator Separation (Jun 23 – Jul 2)

Separate Generator and Evaluator agents to eliminate self-evaluation bias.

| Dimension | Check | Example |
|-----------|-------|---------|
| Token compliance | Rule | No hardcoded `#ffffff` → must use `semantic.background.base` |
| Component API | Rule | `MCButton2` rejects unknown props |
| Import paths | Rule | No cross-boundary relative imports |
| Layout patterns | Rule + LLM | Spacing follows 4/8/12/16/24px scale |
| Accessibility | Rule | Interactive elements have `aria-label` |

**Stop Conditions:** Target score → auto-deploy. Stagnation after 3 rounds → escalate. Score drop → immediate escalate.

**Exit Criteria:** Evaluator runs on every request. 80%+ auto-passed code needs no engineer changes.

---

### M11. Server Deploy & QA (Jul 3 – 9)

| Task | Description |
|------|-------------|
| Infrastructure | Docker Compose on team server (or each dev's machine) |
| Deploy | Orchestrator + Sandbox image + Ops Hub + DS Site |
| Access | VPN internal, HTTPS, basic auth |
| QA | 10 end-to-end scenarios, Slack/Jira channels verified |

---

### M12. Demo, Onboarding & Rollout (Jul 10 – 18)

| Task | Description |
|------|-------------|
| Demo | 30-min live session for CAS team + 3-min recording |
| 1:1 Onboarding | Hands-on session with each PM/SA |
| Guide | Quick Start doc + FAQ + troubleshooting |
| Slack channel | `#cas-design-agent` setup with bot |
| Feedback | Survey after 1 week of usage |

---

### M13–M14. Parallel Quality Agents (Jul 21 – 30)

| # | Agent | Owner | Scope |
|---|-------|-------|-------|
| M13 | Visual Regression | Engineer | Playwright screenshot diff (before/after), auto-detect regressions |
| M14 | Copy Agent | Designer | UX writing: tone & voice, terminology, multilingual (ko/en/ja) |

---

### M15. Doc Maintainer (Jul 31 – Aug 6)

PR merge → auto-update Context Layer (Agent View + Human View). Drift detection in CI blocks hardcoded values that bypass tokens.

---

### M16. Production Hardening (Aug 7 – 15)

Monitoring, error recovery, backup, uptime alerting. System runs without daily intervention.

---

### Checkpoints

| Gate | Date | Decision |
|------|------|----------|
| **Phase 1 → Buffer** | May 16 | PoC success criteria met → Go/No-Go |
| **Buffer → Phase 2** | May 26 | Feedback incorporated → Phase 2 begins |
| **Phase 2 → 3** | Jul 18 | Team actively using, deployed & trained |
| **Phase 3 Complete** | Aug 15 | Self-managing quality + production stable |

### Visual Timeline

```
Apr          May              Jun              Jul              Aug
├────────────┼────────────────┼────────────────┼────────────────┼───────┤

Phase 1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 M1-M5                 ✅ Done
 M6 Stability  ████████
 M7 Testing           ████████
 M8 Report                    ████
 Buffer                           ████

Phase 2 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                                       M9  Integration  ████████████████
                                       M10 Evaluator                    ██████
                                       M11 Deploy                             ████
                                       M12 Rollout                               ██████

Phase 3 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                                                                          M13 Visual  ██████ ┐
                                                                          M14 Copy    ██████ ┘ parallel
                                                                          M15 DocMaint       ████
                                                                          M16 Prod               ██████

                                                                                              Aug 15 ← Complete
```

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
