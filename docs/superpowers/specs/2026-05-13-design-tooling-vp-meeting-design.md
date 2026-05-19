# Spec — Design Tooling VP Meeting Pre-read

**Date:** 2026-05-13 (last revised 2026-05-18)
**Author:** Kyungjae Ha
**Deliverable:** `docs/2026-05-13-inspect-overview.md` (English) + `docs/2026-05-13-inspect-overview-ko.md` (Korean reference)
**Meeting:** "Design Tooling" (30 min, date TBD)

---

## Revision history

- **Round 1–4** (initial draft, 2026-05-13): TL;DR + ASCII diagrams + 11-section structure. ~3,988 words.
- **Round 5–7** (mid-May reviewer feedback): factual corrections, "we" → "I" voice, VP-readability passes, Slingshot 4-workstream alignment refined.
- **Round 8** (2026-05-15): Executive Framing prefix added + mermaid PNG diagrams + DS contract syntax-highlighted PNG. Reached ~4,335 words.
- **Round 9** (2026-05-18): user feedback applied across 28 items. Major changes: Executive Framing reordered (Slingshot moved from opening to end-as-hint), §11 threads reordered (MA/MSM → designer → Slingshot light ask), §7 retitled to possibility framing, §9 retitled to "Risks and Unsolved Problems", §6 insights regrounded with evidence + Insight 2 marked untested, §4 generalizability reframed as hypothesis, DESIGN.md Foundation pattern documented (§3 + §4 + new diagram), arbitrary "~50%" numerical examples removed, designer positioning rephrased (AI-augmented workflow bottleneck, not "skip the designer"), model-specific references stripped, redundant text deduped, "Next" section dropped. Current length: ~4,635 words.

---

## Audience

- **Primary:** VP Product, AI Experiences and Transformation. Reports to CEO. Leads Slingshot since April 2026. Background: McKinsey + Google Director (Sales/Revenue with ML), SetSail Co-founder/CEO (AI-powered data layer, 6 yrs, acquired by ZoomInfo), ZoomInfo VP Product (GTM Studio, AI packaging/pricing). Strategic + business mindset. Has built and sold AI product themselves.
- **Secondary:** Product designer on VP's team. Observing, may comment on design-side or be curious about DS detail.

## Outcome / Strategy

- **Stated outcome:** Information sharing.
- **Real outcome:** Reframe "Design Tooling" as broader work (DS as AI knowledge layer + Molly as a domain-independent orchestration shape) with two byproducts that may be relevant to Slingshot — surfaced lightly at the end, not as the opening frame.
- **Approach:** Project-first framing. Lead with what Inspect actually is and what's working; place Slingshot connection at the end as one of three discussion threads, framed as a light "how do you see possible contributions fitting?" ask rather than a sequencing trade-off proposal. VP from SetSail background detects transactional asks instantly — the work must speak for itself.

## Core Message

I started Design Tooling and the work has expanded into two patterns worth surfacing:
1. The design system as an **AI knowledge layer** — structured contract, not documentation, is what makes an LLM useful in a domain. This is evidenced (no hallucinated component names, clean escalation flow, real prop APIs in generated code).
2. A **multi-agent orchestration pattern (Molly)** — plan → gate → execute → review → QA → gate → promote — designed not to be UI-specific. Whether it generalizes to other domains is a hypothesis, not yet a tested claim.

These two patterns may be relevant to Slingshot's broader workstreams — that's a discussion thread for the meeting, not a proposal in the document.

## Guardrails

- **Contract-renewal context is not surfaced in the document or meeting opening.** The author's current contract status / renewal motivation is private context for tone calibration only. VP's background (SetSail Co-founder) makes them quick to detect transactional asks; the work must speak for itself.
- **No Slingshot opening.** Doc opens with project intro ("What this is"), not with "Why this matters to Slingshot." Slingshot connection appears at the end of Executive Framing as discussion thread #3 (a light ask), and is elaborated in §7 with "Where this might contribute to Slingshot" + §11(c) with "I'd be curious how you see possible contributions fitting."
- **No 1:1 mapping claim.** Slingshot 4-workstream section (§7) is framed as "potential touchpoint" not "reference implementation." Each Slingshot block has a possibility hedge.
- **No untested generalization claim.** §4 "Where this could generalize" and §6 Insight 2 both explicitly mark "untested outside design."
- **Designer framing.** §1 frames the designer step as a bottleneck in today's AI-augmented work/dev environment — not as "skip the designer for small changes." §11(b) acknowledges no dedicated design team exists (designers are individual ICs across teams) and asks how the designer role evolves.
- **No model-specific identifiers.** "Sonnet planner" → "the planner"; "Sonnet cache rates" → "cache rates." Models are configurable; the doc reflects that.
- **No arbitrary numerical examples.** The earlier "~50% first-attempt pass rate as iterate-worthy" example was removed because it lacked basis. The §9 rethink trigger is now "sustained well below the targets" without a specific number.
- **No "msm-portal" term.** Removed in §9 coverage gap bullet — "msm-portal" is no longer a current term.
- **Avoid "Carbon-style" (or other vendor-style references).** Describe DS site capabilities directly.

## Document Structure

**Executive Framing (~400 words, top of document, replaces opening TL;DR):**
1. What this is — project intro (Inspect, started as Design Tooling, Phase 1 operational in 18 days, two patterns expanded)
2. What is already working — 6 bullets (pipeline, surfaces, DS knowledge layer, governance console, MCP, cost)
3. What this is built around — 3 intentional design decisions (DS as AI knowledge layer, domain-independent orchestration shape, designed-in governance)
4. What remains uncertain — 4 hedges (trial signal, scale, generalization, closed-loop)
5. What discussion is needed — 3 threads (MA/MSM second-instance, designer role evolution, Slingshot contribution light ask)

**Appendix — body of document (~4,200 words):**

- **TL;DR.** One paragraph framing. #2 softened to "shape designed not to be UI-specific, generalization is a hypothesis." "Three threads" inline summary line removed (already in Executive Framing).
- **§1 Context and Origin.** Designer step as bottleneck in AI-augmented environment; original Phase 1 plan (70d) vs actual (18d); current status (solo build, trial next week); today's 1–3 day cycle vs PoC's <5min.
- **§2 System Architecture.** Mermaid diagram (3 surfaces / orchestrator / DS knowledge layer / sandbox per playground / GitHub PR / external LLM APIs / Inspect Hub). Component roles. Two human gates. Closed-loop vision + concrete self-improvement (prompt engineering / RAG / contract additions near-term, fine-tuning / RLHF long-term). Deployment shape: "my local MacBook" today → GCP for 5–20 users next.
- **§3 The Design System — From Component Library to AI Knowledge Layer.** Component contract example (MCButton2). 112 components + 13 token categories + ~3.6K-file scan stats. DS knowledge layer mermaid diagram (Inputs → Knowledge Layer → Foundation + Slim → Consumers). Why it matters for AI. **Contract ownership and drift** — two ownership layers (auto-extracted ts-morph + scan vs design-team-authored JSON), drift-checking scripts (`prop-check`, `sync-check`) exist locally, CI gating is next. **Two-tier knowledge: full contract + Foundation/slim** — DESIGN.md as Layer 0 (always-on, framing), slim contracts for planner-time, informed by Anthropic CLAUDE.md / Open CoDesign / Google Stitch / VoltAgent. Paired smoke test: 237K → 112K (−52.6%), zero hallucinated names. Two consoles (DS doc site, Governance console). Inspect Hub Dashboard. MCP server.
- **§4 Molly — The Multi-Agent Pattern Behind the UI Changes.** 5-step pipeline (intake / plan + gate / decompose + execute / review + QA / human gate + promote). DS context follows foundation-first pattern. **Where this could generalize** — three bullets, all marked "untested outside design" / "currently untested" / "what a second-instance experiment would tell."
- **§5 Surfaces and Use Cases.** Table (Chrome ext / Playground / Slack). Role-specificity rationale. A note on Figma — drift gap closed by contract + live preview; ideation still in Figma; absorbed Playground roles. No "Comment channels" separate paragraph (covered in Figma note).
- **§6 The Reframe — What This Turned Out to Be.** Three insights:
  - Insight 1 grounded with concrete evidence (escalation flow activates cleanly, no hallucinated names, smoke test).
  - Insight 2 marked "(untested outside design)" — hypothesis, what a second-instance experiment would tell.
  - Insight 3 grounded with concrete artifact list (sandbox isolation, two gates, escalation sink, console, runtime knobs) + governance-not-stress-tested-yet caveat.
  - (Note: opening "three insights emerged" framing sentence was removed.)
- **§7 Where this might contribute to Slingshot.** Each of four workstreams has a "potential touchpoint." Slingshot 1 — Molly orchestration could in principle be packaged as Speedboat skills/plugins (packaging not designed); DS MCP server is strongest candidate (MCP is open protocol). Slingshot 2 — governance pieces in production with each bullet tagged by governance dimension (environment / guardrail / process / audit); could serve as case study. Slingshot 3 — PM/SA UI-change workflow as candidate high-value workflow + potential beachhead. Slingshot 4 — three role-specific surfaces; DS site as learning artifact; Playground as teaching tool.
- **§8 Where This Could Go.** Three directions: across products (one-time contract extraction cost), across domains (next logical experiment, untested outside UI, risk profile domain-specific — UI fails visibly, backend/data can fail silently, QA strictness scales accordingly), as Speedboat contributions.
- **§9 Risks and Unsolved Problems.** 6 items (API cost, multi-page, PRD parsing, coverage gap *no msm-portal mention*, governance edge cases, concurrent code writing) + "what would prompt a rethink" sub-list (rate sustained well below targets after iteration — no specific number).
- **§10 Next 8 Weeks.** 3-period table (W1–3 trial, W4–6 Phase 2 start, W7–8 deployment + onboarding). Trial targets table (5 metrics including "Engineer review effort per AI-PR ≤ baseline (no fatigue tax)" added). Stretch-target paragraph: "not commitments, low first read is signal to iterate not halt, exact cutoff is a judgement to make once real data lands."
- **§11 Three Threads for the Conversation.** Reordered to match Executive Framing: (a) Applying the pattern to MA or MSM team product; (b) How the designer role evolves (no dedicated design team, designers are individual ICs); (c) Where this might contribute to Slingshot (light ask, "not a current proposal").

## Anticipated VP questions and prepared answers

VP is reading the doc beforehand. Anticipate questions on substance, not exposition.

1. **"Who maintains the contract, and what happens when it drifts from code?"** — §3 covers this. Auto-extracted fields (props via ts-morph, cross-refs + telemetry via codebase scan) cannot drift; design-team-authored fields (variants, anti-patterns, accessibility behavior, UX writing rules) are guarded by governance-console anomaly callouts. Drift-checking scripts (`prop-check`, `sync-check`) exist; CI gating is next.
2. **"What is the cost shape at scale, and what evidence do you have for it?"** — §9 first bullet has PoC ($50–100/month) → Phase 2 estimate ($200–400/month at small-team scale). Per-request parallelism cost measured (P=1–5 sweep, default P=5). 5+ concurrent users untested.
3. **"How concrete is 'self-improvement,' or is it hand-waving?"** — §2 has concrete near-term (prompt engineering, RAG over captured signal, contract additions for recurring anti-patterns) and long-term (model-level fine-tuning, supervised or RLHF-style if signal supports it, with a separate budget-vs-prompt-cache economics decision). Loop infrastructure not yet built, honest about that.
4. **"Engineer review fatigue — won't grading 70%+ AI PRs burn them out?"** — §10 trial target row added: "Engineer review effort per AI-PR ≤ baseline for human-authored PRs (no fatigue tax)." Plus §4 has evaluator-separation in Phase 2 (the agent producing the diff is not the one grading it).
5. **"UI vs backend risk — does QA strictness scale appropriately?"** — §8(b) explicitly addresses: UI fails visibly, backend/data can fail silently, each adapter calibrates QA accordingly (UI: automated check + visual confirmation; backend/data: integration tests + performance assertions + data-quality gates on top).
6. **"How are Figma and Playground reconciled? Two comment channels?"** — §5 Figma note. Ideation/net-new patterns/design-first exploration stay in Figma; final-mile path for committed component-level changes routes through contract + live preview. Same author-level shift; no separate Comment-channels paragraph.
7. **"This is solo build — what's the tech debt risk?"** — §1 "Solo build to date" + §9 risks + §6 Insight 3 (governance designed-in, not retrofit). §9 "What would prompt a rethink" handles regression triggers.
8. **"How does this compare to other internal AI tools (Speedboat) or external (Vercel V0, Stitch)?"** — Honest assessment: Inspect runs on the company's actual product code (not isolated demo); DS contract is the differentiator (real component APIs, real anti-patterns); MCP server makes the knowledge consumable by any future agent. Open to where the company chooses to invest.
9. **"Who else have you talked to?"** — Honest answer. No inflation.

## Live demo plan (3–8 min slot)

- **Surface:** Chrome extension preferred — most visual, lowest cognitive load.
- **Goal:** Show one real end-to-end change from natural-language description → live preview → PR-ready diff.
- **Backup:** If Chrome extension has issues, Playground app on a real PRD.
- **Avoid:** Speed runs that obscure the gates. Show the plan-approval pause explicitly — that's the governance point.

## Meeting Flow (30 min)

VP is reading the doc beforehand, so meeting time is for discussion, not exposition.

- **0–3 min** — Greeting + framing: "I sent a pre-read; I'll skip the recap and we can dive into whichever parts are most useful for you."
- **3–10 min** — Quick live walkthrough of one surface (Chrome extension preferred) showing one real end-to-end change.
- **10–22 min** — Discussion. Answer the 8–9 anticipated questions above. Slingshot mapping is open-ended ("how do you see this fitting?" not "here's where it fits").
- **22–28 min** — Walk through §11's three threads. Take notes; do not negotiate.
- **28–30 min** — Confirm next step (if any). Possible: "Would it be useful for me to attend the next Slingshot Agentic Platform or AI Governance working group as an observer?"

## Format

- Markdown, English body. Korean reference doc maintained in parallel.
- Target length: ~4,635 words / ~7–8 pages when pasted to Google Docs.
- Paste path: Google Docs with Markdown paste enabled (Tools → Preferences → Enable Markdown). Mermaid + DS-contract diagrams pasted as PNG images (3 files in `docs/`).
- Fallback: pandoc-generate HTML if formatting breaks.

## Source material

- `docs/TEAM_INTRO_2026-04-14.md` (Phase 1 scorecard, roadmap, key numbers — partially stale)
- `docs/architecture/system-overview.md` (system diagram, glossary, principles)
- `docs/superpowers/handoffs/2026-05-12-three-lanes-summary.md` (latest state across three parallel lanes)
- `docs/superpowers/handoffs/2026-05-12-ontology-phase0-and-escalation-slice-a.md` (DS escalation + ontology Phase 0)
- `docs/superpowers/handoffs/2026-05-12-research-parallelism-shipped.md` (Type-1 parallelism)
- `docs/superpowers/handoffs/2026-05-16-vp-meeting-pre-read-marathon.md` (Round 8 handoff + prior boost decisions)
- `docs/superpowers/research/2026-05-17-plan-emitter-baseline.md` (baseline measurement before condensation)
- `docs/superpowers/research/2026-05-18-design-md-condensation.md` (DESIGN.md Foundation pattern rationale + measurements + research grounding sources)
- `docs/superpowers/plans/2026-05-17-open-codesign-inspired-six-tracks-v2.md` (six-track plan v2)
- Memory: `project_parallelism_direction.md`, `project_molly_ds_loop.md`, `project_canvas_app.md`, `project_molly_deploy.md`

## Risks of this approach

- **VP reads §7 as opportunism.** Mitigation: §7 is framed as "potential touchpoint" not "reference implementation"; §11(c) explicitly says "Slingshot integration is not a current proposal." Doc avoids the Slingshot opening framing entirely.
- **Doc length (~4,635 words) is at the upper limit for a pre-read.** Mitigation: Executive Framing (~400 words at top) is the 1-minute read; the Appendix is optional. If VP signals they prefer tighter, prepare a 1-page exec summary as a follow-up.
- **Designer pushes on DS detail that VP does not care about.** Mitigation: invite designer to a separate deeper session after, or to a working session on §11(b) designer-role evolution.
- **Designer reads §5 Figma note as critique of their tool choice.** Mitigation: Figma note explicitly frames Figma as "still valuable for early ideation, net-new patterns, design-first exploration"; only the final-mile path for committed component-level changes shifts. Gemini reviewer flagged this as a potential "designer landmine"; the current phrasing should defuse it.

## Open decisions

- **Google Docs paste verification.** Mermaid PNGs + DS-contract syntax-highlighted PNG render correctly in Google Docs? Confirmed (Chrome headless render to PNG via HTML+CSS). Final paste verification pending.
- **Korean reference doc.** Maintained in parallel for author's reference. English is the meeting doc.
- **Send mechanism.** Google Docs link in invite + TL;DR or Executive Framing copied inline. Default: link + Executive Framing inline as preview.
- **Follow-up after meeting.** Default next step depends on VP signal. Options: (a) attend Slingshot working group as observer, (b) async write-up of any threads that need more thought, (c) propose a second-instance experiment scoping doc.
