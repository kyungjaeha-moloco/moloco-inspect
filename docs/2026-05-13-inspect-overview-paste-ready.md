# Moloco Inspect — Overview (May 2026)

> **Audience:** VP Product, AI Experiences and Transformation + product designer
> **Meeting:** Design Tooling (30 min)
> **Pre-read prepared:** May 13, 2026
> **Author:** Kyungjae Ha

---

## Executive Framing — Read this first

### One-sentence summary

Inspect lets a PM or SA describe a change to live product UI in natural language and get back a working preview and an engineer-ready PR within about five minutes. That kind of change normally takes 1–3 days when routed through a designer.

### How it works

- **Entry.** PM/SA describes the change from wherever they already are: Chrome extension, Playground, or Slack.
- **Pipeline.** Molly emits a plan (human-approved) → sandboxed coding agent edits real product code → automated review + QA (human-confirmed) → promoted as a GitHub PR.
- **Underneath.** Design system contract (112 components, 13-category token catalog, cross-references and usage telemetry auto-extracted from the codebase) grounds the agent in real component names, real tokens, and real prop APIs, not invented ones.

### Where it is today

- Phase 1 pipeline operational end-to-end. The four weeks since have gone into expansion.
- Three entry surfaces, one orchestrator, one isolated sandbox per playground, all live.
- DS knowledge layer live, governance console live, MCP server live (external AI tools like Claude Code and Cursor can query the same knowledge).
- PoC cost ~$50–100/month.
- Small-team trial begins soon. First real usage data is not far off.

### What this is built around

- **Design system as AI knowledge layer.** Built on the hypothesis that the structured contract (not the documentation site) is what makes an LLM useful in a domain.
- **An orchestration shape designed to be domain-independent (untested outside design).** Plan → gate → execute → review → QA → gate → promote.
- **Governance designed in from day one.** Sandbox isolation, two human gates, escalation sink, and governance console were design decisions made alongside the rest of the system.

### What's still uncertain

- **Trial signal.** How it behaves in real use is the next big gating event.
- **Scale.** Governance and cost not yet stress-tested beyond 5 concurrent users.
- **Generalization.** Applying the pattern outside UI is a hypothesis, untested.
- **Closed-loop self-improvement.** A direction, but the data infrastructure for it isn't built yet.

### What I'd like to talk through in the meeting

Three topics to keep on the table. None of them needs a decision today.

1. **Trying this with an MA or MSM team product.** Build a DS contract for one of those products, attach Molly, watch whether the pipeline scales. That experiment is what would actually move generalization from hypothesis to fact.
2. **Potential touchpoints with Slingshot.** Two patterns from this work (DS as AI knowledge layer, Molly as a domain-independent orchestration shape) seem to brush against Slingshot workstreams. Not pitching anything concrete; just want to gauge whether it's worth a deeper conversation later.
3. **How the designer role evolves.** With the agent handling routine UI changes, how should the designer role be redefined across the org? Probably a bigger question than this meeting can fully answer, but I'd value the room's view from the platform side.

Full architecture, pipeline, DS structure, risks, and the 8-week plan are in the appendix below. Happy to open any of it during the meeting if a specific part draws a question.

---

# Appendix — Architecture, Pipeline, Risks, and Timeline

*Reference material for the meeting. The Executive Framing above is the core summary; the sections below are here to open if a specific question draws attention to them.*

---

## 1. Context and Origin

- **Why does this exist?** Today's AI-augmented work and dev environment has made the designer step in the front-end UI workflow a bottleneck: PM/SA → designer mocks → engineer → review takes days even for "add a column"-class changes. The premise: if the AI knows the design system well enough, the PM/SA describes the change directly, sees a working preview, and ships a PR.
- **Original plan vs reality.** Phase 1 (pipeline + PoC) planned at 10 weeks / 70 days to PoC; core delivered in ~18 days. Phase 2–3 features (Chrome extension, auto-refinement, doc site, dashboard, MCP server) pulled into Phase 1. Past 4 weeks: DS expansion + Molly multi-agent + trial prep.
- **Status.** Solo build to date. Phase 2 (external integration, evaluator separation, deploy) starts late May, with a developer joining to help.
- **Today vs the goal.** Designer-mediated flow: 1–3 days for small UI changes. PoC: under 5 minutes from first message to PR ready for engineer review. The trial measures whether that holds outside controlled conditions.

---

## 2. System Architecture

Three entry points, one orchestrator, one isolated sandbox per playground.

> 📷 **[INSERT IMAGE HERE]** — `2026-05-13-inspect-overview-architecture.png`
> *System Architecture diagram*

**Component roles.**

- **Surfaces (Chrome extension / Playground / Slack).** Role-specific entry points; each optimizes for a different cognitive mode (in-flow visual, deep-work canvas, casual async).
- **Molly.** The orchestrator: single Node service all three surfaces talk to. Runs the job state machine and routes tasks through review and QA.
- **Sandbox.** One Docker container per playground (Vite dev server + git working tree + coding agent). Host repo is never modified.
- **Coding agent.** opencode framework inside the sandbox (chosen for its HTTP-serve daemon, multi-provider support, and open-source modifiability), using OpenAI / Anthropic models. Receives per-task prompt + DS context, edits code, commits.
- **DS knowledge layer.** Structured contracts (components, tokens, patterns, cross-references, usage statistics). Served to the agent at planning and execution time.
- **Inspect Hub Dashboard.** Operational console: job tracking, diff review, Molly metrics, runtime knobs.
- **Two human gates.** Plan approval after LLM emit; QA confirmation after automated checks. Automated checks provide signal; only human confirmation acts as a gate.

**Closed-loop vision (medium-term).** Both human gates double as signal-capture points (plan edits, rejections, QA outcomes, comment pins are structured feedback). Goal: feed the signal back into planner/reviewer so the agent improves over time. *Data infrastructure not yet built; for now the signal is collected and the loop stays open.* Concretely:

- **Near-term (system-level):** prompt engineering tuned to recurring failures, RAG over captured signal, contract additions when the agent trips on the same anti-pattern.
- **Long-term (model-level):** fine-tuning (supervised or RLHF-style if signal supports it), gated by signal volume and fine-tune-budget-vs-prompt-cache economics.

**Deployment shape.** Today: orchestrator + sandboxes on my local MacBook (Docker on macOS), ceiling 1–2 users. Next step (after trial signal): GCP for both layers, raising ceiling to ~5–20 concurrent users. Architecture unchanged; only host changes.

---

## 3. The Design System — From Component Library to AI Knowledge Layer

**What's in the contract today.**

> 📷 **[INSERT IMAGE HERE]** — `2026-05-13-inspect-overview-ds-contract.png`
> *DS contract example (MCButton2)*

**Scope today.** 112 components, token catalog across 13 top-level categories (color, spacing, typography, elevation, animation, etc.). Cross-references and usage telemetry auto-extracted from a codebase scan over ~3.6K TS/TSX source files; the extraction pipeline went live last week.

> 📷 **[INSERT IMAGE HERE]** — `2026-05-13-inspect-overview-ds-knowledge.png`
> *DS Knowledge Layer flow*

**Why this matters for AI.** Without the contract the agent invents component names, hardcodes colors, guesses at props. With it the agent uses real names (`MCButton2`), real tokens, real prop APIs, and respects documented anti-patterns. That is the "AI knowledge layer" claim in concrete terms.

**Two-tier injection for the planner.** The full contract (~500KB) stays authoritative for the DS site, the governance console, and the MCP server. For planner-time, the orchestrator splits the knowledge:

- **Foundation (Layer 0): `DESIGN.md`** (~11KB markdown). Brand identity, authority hierarchy, 16-category component index, design-token summary, Do's & Don'ts. Read first by the planner. Pattern informed by Anthropic CLAUDE.md memory guidance and the Google Stitch DESIGN.md spec, with additional open-source references (VoltAgent, Open CoDesign).
- **Derived slim contracts.** `components-index.json` (~22KB) + slimmed `component-props.json` (~200KB → ~100KB). Per-component `when_to_use` / `antiPatterns` reach the planner only via the escalation flow.
- **Measured impact** (paired smoke test, 2 PRDs): cold-start system tokens **237K → 112K (−52.6%)**, latency −10% to −21%, plan quality unchanged or slightly richer, zero hallucinated component names. ~$0.35 saved per cold-start emission.

**Contract ownership and how drift is caught.** Two ownership layers:

- **Auto-extracted** (props via ts-morph; cross-refs + usage via codebase scan). Rebuilt on every scan; cannot drift from source.
- **Design-team-authored** (variants, anti-patterns, accessibility, UX writing). JSON; reviewed in the governance console with anomaly callouts (e.g., stable components with zero usage are flagged).
- **Drift-checking scripts** (`prop-check`, `sync-check`) exist locally; wiring them as CI gates is the next governance step.

**Two consoles + MCP.**

- **DS documentation site.** Interactive component browser, anatomy, tokens, accessibility specs, syntax-highlighted code, global search.
- **DS Governance console.** Live usage insights and anomaly callouts. AI requests for non-existent components log to a shared sink across all three surfaces (no silent failure); surfacing the queue in the governance view is the next step.
- **Inspect Hub Dashboard.** Orchestration-side: job metrics, review pass rate, QA outcomes, runtime knobs.
- **MCP server.** Any tool that speaks the Model Context Protocol (Claude Code, Cursor, future agents) can query the same knowledge.

---

## 4. Molly — The Multi-Agent Pattern Behind the UI Changes

Molly is the orchestrator that uses the DS knowledge layer: a single service all three surfaces talk to, and a *pattern* (plan → decompose → execute → review → gate → promote) that turns a PRD or one-line request into a reviewable PR.

**The pipeline, step by step.**

> 📷 **[INSERT IMAGE HERE]** — `2026-05-13-inspect-overview-molly-pipeline.png`
> *Molly pipeline flow (5 steps + 2 human gates)*

1. **Intake.** History-aware, multi-turn. Asks clarifying questions, accepts attached context (PRD, screenshot), routes by intent (chat / plan / status / clarify).
2. **Plan emission + human gate.** Planner reads request + DS context (foundation-first: `DESIGN.md` first, then slim contracts) and emits a structured plan. User must approve, edit, or reject before execution.
3. **Decompose and execute.** Plan broken into atomic tasks, each producing one git commit. Coding agent runs inside the sandbox with DS context and (optionally) a pre-flight research bundle from parallel read-only agents.
4. **Per-task review + QA.** Reviewer checks each diff against the task description, then picks a QA strategy based on change shape (smoke test, lint-only, human-only, etc.) and runs it against the sandbox.
5. **Human QA gate → promote.** Human confirms before the job becomes `complete`. Promote opens a PR against the real product repo.

**Where this could generalize (untested outside design).**

- Steps 1–5 describe a shape that *could* apply to other system-of-record domains: data pipelines, QA test authoring, backend handlers, infrastructure config.
- Two human gates + sandbox isolation are designed as domain-agnostic governance primitives; fit in non-UI domains is also untested.
- The DS knowledge layer could be a special case of a broader pattern: structured, machine-readable contract over the domain (entity schemas, API contracts, test scaffolds). Whether orchestrator primitives transfer with comparable quality is what a second-instance experiment would tell.

---

## 5. Surfaces and Use Cases

Three surfaces share a single orchestrator and a single intake protocol. The same pipeline is reachable from whatever context the user is already in.

| Surface | Primary user | Work context | Typical use case |
|---|---|---|---|
| **Chrome Extension** | PM, SA | In-flow, visual | Inspect a live product page, click the exact element, describe the change in one sentence. *"Add a Used Amount column to this table."* |
| **Playground App** | PM, SA, designer, engineer | Deep work | PRD-sized changes, multi-task plans, plan editing, comment pins on the preview, iterative refinement. |
| **Slack** | Anyone | Casual, async | *"@molly please update the empty-state copy on the X page"*. Thread-based clarification, result delivered as a PR link. |

**A note on Figma.** The Figma DS library drifted out of sync with the codebase over time. For *code-grounded* component-level changes, the operational source of truth is now the DS contract + live preview that any plan produces. Figma stays valuable for early ideation, net-new patterns, and design-first exploration before a contract exists. What shifted is only the final-mile path for committed component-level work, now grounded in contract + live preview and closing the historical drift gap. The Playground absorbs Figma's role of:

- *Visual confirmation* (shipped). Every plan produces a live preview on real product code, not a mock.
- *Team communication anchored to a design* (shipped). Comment pins on the running preview.
- *Exploratory spread of options* (planned). Alternative plans side-by-side on the actual route.
- *Cross-team sharing* (planned). Shareable playground links any teammate can open.

---

## 6. Three patterns the work points to

- **The design system is an AI knowledge layer.** A structured contract, not a documentation site, is what makes an LLM useful in a domain. Evidence: clean escalation when the agent hits an unknown component, real import paths and prop names in generated code, zero hallucinations in smoke tests.
- **Orchestration may be domain-independent (untested outside design).** Plan → gate → decompose → execute → review → QA → gate → promote, plus sandbox + git + LLM-review primitives, are not design-bound. Early signal: UX writing tasks (copy and tone changes) already route through the same pipeline cleanly, hinting that the shape handles different change types within design itself. Cross-domain transfer to non-UI domains (data, QA, backend) remains untested.
- **Governance was designed in from day one.** The artifacts already exist: sandbox isolation, two human gates, escalation sink across all three surfaces, governance console, runtime knobs with measured defaults. Doing this from the start was cheap; retrofitting later would have been expensive. Stress-testing at scale is what the trial will measure.

---

## 7. Possible touchpoints with Slingshot

The two patterns from this work (DS as AI knowledge layer, Molly as a domain-independent orchestration shape) seem to brush against Slingshot workstreams: Agentic Platform, AI Governance, High-Value Workflows, AI Proficiency & Enablement. Not pitching anything concrete; just gauging whether it is worth a deeper conversation later. Two narrow candidates worth mentioning:

- **DS MCP server.** Open protocol, so any Speedboat agent could query the same knowledge.
- **Governance pieces in production.** A possible case study for the AI Governance workstream once stress-tested in the trial.

---

## 8. Where This Could Go

- **Across products.** Point the same pipeline at any product with a DS contract. Marginal cost: one-time contract extraction.
- **Across domains** *(longer-horizon, untested)*. The orchestration shape is not UI-bound. Plausible candidates: data pipelines (entity schemas), QA test authoring (test patterns), backend handlers (API contracts), internal admin UIs (CRUD patterns). Each needs its own contract and adapters (sandbox, QA, promotion path); orchestrator primitives are reusable. Risk profile is domain-specific: UI fails visibly, while backend/data can fail silently and warrant heavier QA gates (integration tests, performance assertions, data-quality checks).
- **As Speedboat contributions.** Intake protocol, plan-execute-review-gate pattern, sandbox primitive, MCP-served knowledge layer: each a candidate to package as Speedboat skills or plugins.

---

## 9. Risks and Unsolved Problems

- **API cost at scale.** PoC cost ~$50–100/month; Phase 2 estimate ~$200–400/month at small-team scale. Per-request cost measured with an evidence-based default; cost at 5+ concurrent users not yet measured.
- **Multi-page consistency.** The agent works per-page. Cross-page operations ("rename this concept everywhere it appears") are not yet first-class. Planned for Phase 2.
- **PRD parsing accuracy.** Formats vary across teams; parsing degrades on non-standard inputs. Phase 2 sub-item.
- **Coverage gap.** The shared-component layer has high coverage; the 1,320 app-level files lack structured contracts. The agent sees them but does not reason over them with the same power. Addressed incrementally; full coverage is long-term.
- **Governance edge cases.** Today's escalation handles missing components but not subtler cases (a component used outside its intended pattern; unrecognized anti-pattern violations). Follow-up work is scoped but not yet built.
- **Concurrent code writing.** Current parallelism gathers *context* in parallel; writing *code* in parallel across tasks is a separate problem, currently in development.
- **What would prompt a rethink:**
  - Review pass rate *sustained* well below the targets after iteration. An initial low read is expected; the rethink signal is the lack of improvement, not the first read
  - Users dropping off after the first session
  - Cost outliers that do not track with usage
  - Governance escapes (anti-pattern code passing both human gates)

---

## 10. Next 8 Weeks

| Period | Focus |
|---|---|
| **Now (W1–3)** | Small-team trial runs; first real usage data. In parallel: automatic DS request draft / issue creation for unrecognized components; quality measurement on parallel pre-flight context. |
| **Mid-June (W4–6)** | Phase 2 starts: deeper external integration (Slack threads, Jira tickets, richer PRD parsing). Generator and evaluator agents split into separate roles so the agent producing the diff is not the one grading it. |
| **Early July (W7–8)** | Server deployment and QA. Demo and onboarding for the first internal pilot team. |

The small-team trial is the gating event. Real usage data tells whether the pipeline is ready to widen and whether the cost-and-quality tradeoffs hold outside controlled testing.

**Trial targets** (aspirational; not yet measured):

| Metric | Target |
|---|---|
| Time to PR for simple changes | under 5 minutes from first message |
| Average request-to-preview latency | 1–3 minutes |
| PM independence (no designer needed for the request) | 3 of 4 participants |
| DS compliance (real tokens and component APIs used) | 80%+ |
| Engineer review pass rate on first attempt | 70%+ |
| Engineer review effort per AI-PR | ≤ baseline for human-authored PRs (no fatigue tax) |

They serve as the read-out for whether to move toward broader rollout or iterate further. These are stretch targets, not commitments. A low first read is signal to iterate, not to halt; the rethink trigger is *sustained* underperformance after iteration. The exact iteration cutoff is a judgment to make once real data lands.
