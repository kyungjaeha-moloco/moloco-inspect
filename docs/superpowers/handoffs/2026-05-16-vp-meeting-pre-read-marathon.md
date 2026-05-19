# Handoff — 2026-05-16 VP Meeting Pre-read Marathon

**Date:** 2026-05-16
**Author:** kyungjae.ha
**Branch:** main (uncommitted)
**Session length:** ~2 days marathon, 8 rounds of AI reviewer feedback applied
**Context:** approaching window limit; pause here, resume in next session

---

## Why this handoff exists

User is preparing a pre-read document for a 30-min meeting with VP Product (AI Experiences and Transformation, Slingshot lead) + a secondary product designer. Eight rounds of AI reviewer feedback have been applied across two days. Two items remain unfinished: (1) two more critical-perspective challenges (#5, #6) not yet received from user, (2) final git commit + Google Docs paste verification.

Context window near limit. Next session should pick up the remaining 2 challenges, decide doc boosts, and finish.

---

## Meeting context (essential for next session pickup)

- **Audience:** VP Product, AI Experiences and Transformation @ Moloco. Reports to CEO. Leads Slingshot — Moloco's company-wide AI transformation program. Background: McKinsey + Google Director (Sales/Revenue with ML), SetSail Co-founder/CEO (AI-powered data layer for GTM, 6 years, acquired by ZoomInfo), then VP Product at ZoomInfo. Strategic + business + AI product builder. Personally built and sold an AI product.
- **Secondary attendee:** product designer from VP's team
- **Meeting title:** "Design Tooling" (30 min)
- **Stated user goal:** information sharing
- **Real intent:** reframe "Design Tooling" as broader (DS = AI knowledge layer + Molly = generalizable multi-agent pattern) + align with Slingshot
- **Underlying personal context (CRITICAL — DO NOT mention in document or meeting):** User's Moloco contract is ending soon. Slingshot contribution / sustained engagement is implicit goal but NEVER surfaced in document or meeting talking points. SetSail-founder VP would detect transactional asks instantly. Work must speak for itself.

---

## Deliverable files (in repo, all uncommitted)

| File | Purpose | Size |
|---|---|---|
| `docs/2026-05-13-inspect-overview.md` | **VP-facing pre-read (English)** — Executive Framing prefix + Appendix detail | 381 lines / 4,335 words |
| `docs/2026-05-13-inspect-overview-ko.md` | Korean version (author reference, synced with English) | 383 lines / 3,804 words |
| `docs/2026-05-13-inspect-overview-architecture.png` | §2 mermaid diagram, colored | 97 KB |
| `docs/2026-05-13-inspect-overview-ds-knowledge.png` | §3 mermaid diagram, colored | 72 KB |
| `docs/2026-05-13-inspect-overview-ds-contract.png` | §3 MCButton2 contract tree, syntax-highlighted | 103 KB |
| `docs/superpowers/specs/2026-05-13-design-tooling-vp-meeting-design.md` | brainstorming spec — strategy, guardrails, meeting flow, talking points | 94 lines |

**Source files (`.omc/`):**
- `.omc/diagram-s2-v3-colored.mmd` — §2 mermaid source
- `.omc/diagram-s3-ds-colored.mmd` — §3 mermaid source
- `.omc/ds-contract.html` — DS contract syntax-highlighted HTML (rendered to PNG via Chrome headless)
- `.omc/diagram-s2-v3-colored.png` + `.omc/diagram-s3-ds-colored.png` — also in docs/ as final names

**Document structure (English/Korean both):**

```
# Moloco Inspect — Progress Update & Direction (May 2026)
> meta block
---
## Executive Framing — Read this first   [VP reads this in 1 min]
  ### Why this matters to Slingshot
  ### What was unexpectedly discovered
  ### What is already working
  ### What remains uncertain
  ### What discussion is needed (3 threads)
---
# Appendix — Architecture, Pipeline, Risks, and Timeline   [Optional deep dive]
  ## TL;DR (with 3 threads inline)
  ## 1. Context and Origin (with "Today vs the goal")
  ## 2. System Architecture (mermaid diagram inline)
  ## 3. The Design System — AI Knowledge Layer (DS contract tree + mermaid diagram)
  ## 4. Molly — Multi-Agent Pattern (5-step pipeline)
  ## 5. Surfaces and Use Cases (with Figma note)
  ## 6. The Reframe — 3 insights
  ## 7. Alignment with Slingshot (4 workstreams)
  ## 8. Where This Could Go (across products / domains / Speedboat)
  ## 9. Risks and Open Questions (6 + "what would prompt a rethink")
  ## 10. Next 8 Weeks + Trial targets
  ## 11. Open Questions for the Conversation (3 threads — also in TL;DR + Executive Framing)
  ## Next
```

---

## What's been done — 8 rounds of reviewer feedback applied

**Initial draft** (3,988 words, ASCII diagrams) → 8 rounds → final 4,335 words (Executive Framing added).

### Round 1 — Audience/tone (Agent A) + factual accuracy (Agent B)
- Fixed: 186 tokens → "token catalog across 13 categories"; 3,615 files → "~3.6K TS/TSX source files"; MCButton2 token field clarified
- Softened pitch-coded sentences (TL;DR "all four workstreams", §7 "not retrofitting", §3 "most under-appreciated")
- Added: "Today vs the goal", "Solo build to date", "What would prompt a rethink", designer involvement Q

### Round 2 — Gemini designer perspective
- User chose C (no apply). Figma reframe and §6 Insight 1 left as is.

### Round 3 — Copy edit (AI #1)
- §11 "Two threads" → "Three threads"
- TL;DR "surface area...surfacing" → "two notable directions"
- §9 P=5 clarification (pre-flight context agents per task)
- §2 "informational, not gating" → "Automated checks provide signal, but only human confirmation acts as a gate"
- §3 surfaces parenthetical: "(Extension, Playground, Slack)"

### Round 4 — Ground-truth gap (AI #2)
- DS Governance console toned down (queue UI → shared sink + queued for next governance view)
- "automatic PR creation" → "automatic DS request draft / issue creation"
- "sandbox per session" → "sandbox per playground"
- Generalization "as-is" → "with adapters (sandbox, QA, promotion path)"

### Round 5 — Consistency pass (AI #3)
- §3 mermaid diagram numbers synced (Tokens label, ~3.6K files)
- §7 Slingshot 2 toned down to match §3 (most pieces still being stress-tested in the trial)
- §4 "Plans cached for 1h" → "static DS context uses 1h prompt cache" (factual fix)
- §3 console title "close the loop" → "for the measurement-improvement loop"
- §9 + §10 temporal split (initial <50% OK; sustained <50% after iteration = rethink)

### Round 6 — "we" → "I" voice
- All 10 English "we/our/us" + 4 Korean "우리" → "I" or passive/noun subject
- Title: "Inspect — Design Tooling, AI Knowledge Layer, and Slingshot Alignment" → "Moloco Inspect — Progress Update & Direction (May 2026)"

### Round 7 — VP-readability (AI #4)
- TL;DR meta line replaced with "Three threads to discuss in the meeting" (ask up-front)
- §2 Molly paren ("Slack bot @molly..." explanation) removed
- §4 adapter detail simplified
- §7 Slingshot 2 → bullet list
- §9 rethink → nested bullet list (4 sub-bullets)
- "## Next" header added at end

### Round 8 — Executive Framing prefix + Appendix structure
- Added "## Executive Framing — Read this first" prefix (5 sub-sections, ~400 words)
- Existing body wrapped under "# Appendix — Architecture, Pipeline, Risks, and Timeline"
- mermaid diagrams now rendered as colored PNGs (3 files in docs/)
- DS contract ASCII tree rendered as syntax-highlighted PNG (Menlo monospace via Chrome headless + HTML+CSS)

---

## Guardrails (CRITICAL — maintain in next session)

1. **Contract / employment context: NEVER surface** in document or talking points. SetSail-founder VP detects transactional asks instantly. Work speaks for itself.
2. **"I" not "we"** — solo build is honest, doesn't undersell. §1 "Solo build to date" + body uses "I" / passive consistently.
3. **Tone grounding** — "designed for governance from day one, not yet stress-tested at scale" / "infrastructure for closed loop not yet built" / "have not yet pointed pipeline at a non-UI domain" / trial targets are "stretch, not commitments"
4. **Designer-friendly Figma reframe** — Figma valuable for ideation / net-new patterns / design-first exploration. Only committed component-level changes route through the contract. (Gemini called this a "designer landmine" if framed as "Figma is a bottleneck"; reframe applied.)
5. **Slingshot 4 workstreams** — Agentic Platform / AI Governance / High-Value Workflows / AI Proficiency & Enablement. Latest Q2 OKR shows 5 workstreams adding "Client Experience", but doc stays with VP's original Slack-posted 4. Client Experience mentioned as next-instance candidate in §8 only.
6. **No quantitative showcase numbers** that are not in current state — 95→112 components 4.75× scorecard, pipeline timing 9-stage table, etc. all left out intentionally. Status-report tone (April 13 PDF style) traded for executive-pre-read tone.

---

## What remains — pick up here

### 1. Two more critical challenges (#5, #6) not yet received

User shared a critical AI review with **6 challenges**. Only #1–#4 received before message truncated mid-sentence on #4. Already-received:

| # | Challenge | Doc currently covers? | Boost priority |
|---|---|---|---|
| 1 | "18d build → tech debt? Fragile prototype?" | §1 solo build + §9 risks + §6 Insight 3 grounding | LOW (well-covered) |
| 2 | "JSON Contract: who maintains? Drift?" | §3 auto-extraction subset + governance console anomaly | **HIGH** — add "Contract ownership" paragraph in §3 |
| 3 | "Engineers as AI's grader fatigue?" | §4 + §10 trial target 70%+ pass rate + §9 rethink trigger | MEDIUM — add "Engineer review time per AI-PR" trial target |
| 4 | "UI vs backend/data risk differ" | §4 + §8 (b) "not yet pointed at non-UI domain" + adapter mention | MEDIUM — §8 (b) add "QA strategy strictness scales with domain risk" |
| 5 | "Figma + Playground workflow fragmentation? Two comment channels?" | §5 Figma reframe (Figma still valuable for ideation) | MEDIUM — §5 add "execution authority shift, not workflow split" frame |
| 6 | "Self-improvement vision too abstract — RLHF? Fine-tuning? Prompt? RAG?" | §2 closed-loop "infrastructure not yet built" caveat | **HIGH** — §2 add near-term (prompt/RAG/contract additions) vs long-term (fine-tuning) split |

**All 6 challenges received.** Boost decision priorities (next session):

- **HIGH:** #2 Contract Ownership, #6 Closed-loop near-term vs long-term split
- **MEDIUM:** #3 Reviewer fatigue metric, #4 Risk-aware QA strategy, #5 Authority shift framing
- **LOW:** #1 Tech debt (well-covered already)

**Proposed boost text (next session evaluates):**

- **#2 (§3 end):** "The auto-extracted fields (cross-refs, usage telemetry, file counts) and the design-team-authored fields (variants, anti-patterns, UX writing rules) are governed differently — the former is rebuilt on each scan, the latter is reviewed in the governance console with anomaly detection (e.g., zero-usage components flagged). CI/CD-level contract validation is scoped as the next governance layer."
- **#3 (§10 trial targets):** new row — `Engineer review time per AI-PR | ≤ human-authored PR equivalent`
- **#4 (§8 b):** add sentence — "QA strategy strictness should scale with domain risk — backend / data changes warrant additional gates (integration tests, performance tests) beyond the UI-domain baseline."
- **#5 (§5 Figma note):** add closing sentence — "This is an execution-authority shift, not a workflow split — designers stay in Figma for what only humans do well (ideation, net-new patterns), while routine committed changes route through the contract."
- **#6 (§2 closed-loop):** add sentence after "infrastructure not yet built" — "The near-term approach is system-level tuning — prompt engineering, RAG over captured signals, contract additions for recurring anti-patterns. Model-level fine-tuning is a long-term step that requires both volume of captured signal and a separate decision about fine-tune budget vs prompt-cache economics."

**Total proposed boost: ~5 sentences added across 5 sections. ~+150 words. Doc would go from ~4,335 to ~4,485.**

### 2. Final commit + paste verification

- Nothing committed yet. 5 deliverable files + spec + this handoff (when written) = ready to commit
- Google Docs paste partially attempted earlier. Confirmed Google Docs doesn't auto-render monospace for ASCII tree (PNG image solution applied)
- Outstanding: user verifies mermaid PNGs + ds-contract PNG render correctly in Google Docs; final paste

---

## External context (Slingshot + Speedboat — for next session)

**Slingshot** = Moloco's company-wide AI transformation program. VP Product is the lead, reports to CEO.

**Slingshot workstreams — original VP-posted 4-workstream model (our doc uses):**
1. Agentic Platform (Speedboat as one-stop shop)
2. AI Governance (guardrails, environment, processes)
3. High-Value Workflows (function-level AI impact)
4. AI Proficiency & Enablement (role-specific learning journeys)

**Latest Q2 2026 OKR shows 5 workstreams** (4/27 update, all on track):
1. Agent Platform / Speedboat — WAU 142 (up from 112), Skills catalog 40, Campaign Recommendation Agent internal-test ready
2. **Client Experience** (NEW workstream) — Roblox/Entain/TextNow user research, Cloud API external MCP, Ads Manager agentic experience
3. Workflow Transformation — originally 30 workflows goal; narrowed Q2 to MA Biz and GDS pilot teams only
4. AI Governance — Q2 target: Framework v1 published (P&E / GTM / Legal / CISO / IT)
5. AI Enablement — EOY 2026: 80%+ coverage

**Speedboat** = Moloco's internal AI execution platform/assistant.
- URL: https://op.moloco.cloud/v2/speedboat-v2/home
- Speedboat MCP layer: connects internal data tools to Claude (SQL/dashboard-free live data, performance analysis, QBR generation, client call prep in one chat)
- Public agents: GM Data Explorer, Troubleshooting, Creative Analysis
- Public skills: QBR Deck, Advertiser Performance Review, Weekly Report
- Future: Speedboat Agent Studio — any Molocan builds and deploys agent apps

---

## Inspect codebase reference (verified during Round 4)

- Repo: `/Users/kyungjae.ha/Documents/moloco-inspect/`
- Components: 112 (`design-system/src/components.json`)
- Tokens: 13 top-level categories (`design-system/src/tokens.json`)
- Product code: msm-portal ~2,413 .tsx files; ~3.6K TS/TSX total (components.json scan record)
- MCP server: `design-system-mcp/` — 9 tools registered
- Sandbox: `sandbox/Dockerfile` line 49 `COPY design-system /workspace/design-system`
- DS Governance console: `design-system-site/src/pages/GovernancePage.tsx` (Usage Insights live)
- Dashboard pages: `dashboard/src/pages/MollyMetricsPage.tsx` + `SettingsPage.tsx`
- DS escalation sink: `orchestrator/lib/ds-escalation.js` → writes to `state/molly-missing-choices.jsonl`
- Coding agent: `sandbox/opencode.json` (anthropic + openai providers) + `sandbox/agents/{reviewer,ui-editor}.md` (model: openai/gpt-4o)
- GCP deploy plan: `docs/superpowers/plans/2026-05-11-gcp-deploy-phased.md`
- Git authors (verified solo build): only `kyungjaeha-moloco`

---

## Spec file (talking points + meeting flow)

`docs/superpowers/specs/2026-05-13-design-tooling-vp-meeting-design.md` contains:
- Audience analysis (VP profile, designer secondary)
- Outcome / strategy (C Hybrid reframe)
- Guardrails (contract context not surfaced; "Carbon-style" avoided; etc.)
- Core message
- Document structure outline
- **Meeting flow (30-min breakdown):** 3 min framing / 7 min live demo (Chrome ext recommended) / 12 min discussion (anticipated 3 VP questions + answers) / 6 min ASK + notes / 2 min next-step
- Source material references
- Risks of the approach + open decisions

**Note:** Spec talking points may need a refresh to reflect Round 8 (Executive Framing) and answer #1–#4 critical challenges. Currently somewhat stale.

---

## Next session priorities (in order)

1. **Ask user for critical challenges #5 and #6 verbatim** — full critical review before deciding doc boosts
2. **Evaluate doc boosts** — especially #2 Contract Ownership paragraph (HIGH-priority — single highest-impact remaining improvement)
3. **Update spec** with Executive Framing context + anticipated questions answers
4. **Final read** — user does their own pass after any boosts
5. **Commit** — 5 deliverable files + spec + this handoff (git already shows uncommitted chrome-extension/manifest.json + background.js from before session — separate)
6. **Google Docs paste verify** — mermaid PNGs render, ds-contract PNG inserts cleanly, Executive Framing reads correctly in Docs
7. **Meeting day delivery** — user delivers; spec has 30-min flow + talking points + anticipated questions

---

## Memory entries to read at next session start

- `MEMORY.md` index
- `project_canvas_app.md` — Playground state
- `project_molly_ds_loop.md` — Molly DS loop
- `feedback_always_review.md` — review before proceeding
- `feedback_real_screens_priority.md` — show real screens (relevant for meeting live demo recommendation)
- `feedback_code_in_english.md` — code identifiers + comments English-only

---

## Open decisions deferred to next session

1. **Boost #2 Contract Ownership** in §3 — proposed paragraph: "The auto-extracted fields (cross-refs, usage telemetry) and the design-team-authored fields (variants, anti-patterns, UX writing rules) are governed differently — the former is rebuilt on each scan, the latter is reviewed in the governance console with anomaly detection (e.g., zero-usage components flagged). CI/CD-level contract validation is scoped as the next governance layer." Apply or skip after #5/#6 review.
2. **Boost #3 Engineer Review Time** — §10 trial targets add row: "Engineer review time per AI-PR | ≤ human-authored PR equivalent". Apply or skip.
3. **Boost #4 Risk Profile by Domain** — §8 (b) hedge: "Risk profile is domain-specific — backend/data changes warrant stricter QA and possibly additional gates." Apply or skip (hedging risk).
4. **Korean version: re-sync after boosts** — currently in sync with English. Any boost requires Korean equivalent.

---

*Marathon: brainstorming + 8 review rounds + 3 PNG generations + Slingshot context integration + Executive Framing prefix. Document is publishable pending #5–#6 critical review and final commit/paste. Resume here in next session.*
