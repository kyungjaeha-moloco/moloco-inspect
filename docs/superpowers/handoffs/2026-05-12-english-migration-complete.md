# Handoff — 2026-05-12 English migration complete

**Date:** 2026-05-12
**Author:** kyungjae.ha (with Claude Opus 4.7)
**Branch:** main
**Prior handoff:** `docs/superpowers/handoffs/2026-05-12-english-migration-handoff.md` (start-of-day plan)

---

## TL;DR

System-wide English migration **completed in a single session — 17 commits**. The system now:
- Accepts Korean user input (preserved Korean keyword matching everywhere needed).
- Always replies in English — Molly responses, plan_items, status reports, lifecycle action acknowledgements, Slack/Chrome ext/Playground/Dashboard labels.
- Has English code comments throughout (dev team is English-speaking).
- Carries a Tving-locale exception in the decomposer + plan-emitter prompts so generated *product code* can still contain Korean UI copy (msm-portal i18n is KR-primary).

Verified: 135/135 orchestrator tests pass, playground-app + dashboard `pnpm tsc --noEmit` clean, LLM smoke against `/api/intake` confirmed English output for Korean PRD / status / chat / lifecycle inputs.

---

## 1) Commit list (17, chronological)

```
09c1a88  feat(i18n): molly-classifier SYSTEM_PROMPT → English (C1) + tests
8d86f22  feat(i18n): molly-plan-emitter SYSTEM_PROMPT markers → English (C2)
d25f15c  feat(i18n): molly-chat SYSTEM_PROMPT → English (C3)
fa6a407  feat(i18n): molly-status SYSTEM_PROMPT + inline templates → English (C4)
f48e878  feat(i18n): molly-prd-analyzer SYSTEM_PROMPT + user-message → English (C5)
6e349d6  feat(i18n): job-decomposer English + risksKo/qaRationaleKo rename (C6)
4c4798f  feat(i18n): molly-lifecycle templates + reply builders → English (C7)
3370551  fix(i18n): force English output regardless of Korean input (C-followup)
153d85c  feat(i18n): chrome-extension sidepanel UI → English (B.2)
c77fc0f  feat(i18n): Slack message builders + server fallback errors → English (B.3)
c226b59  feat(i18n): dashboard pages → English (B.4)
d5102c6  feat(i18n): Playground UI → English (B.1)
93a335f  feat(i18n): unify sentinel + PRD context labels + parse errors → English (B.5)
0826b81  chore(i18n): translate Korean comments → English across orchestrator (B.6a)
7cdabdd  chore(i18n): translate Korean comments → English in playground-app/src (B.6b)
fb66b58  chore(i18n): translate Korean comments → English in chrome-extension (B.6c)
637c0b5  chore(i18n): translate last 2 Korean comments in dashboard (B.6d)
```

---

## 2) What changed per surface

### LLM prompts (Phase C — 7 libs)

| Lib | What | Notes |
|---|---|---|
| `molly-classifier.js` | SYSTEM_PROMPT + buildClassifierUserMessage labels | Kept Korean keyword tokens + Korean user-message examples inside the prompt — they teach the model to classify Korean input. `reason` field now English ("`<one-line English reason>`"). |
| `molly-plan-emitter.js` | Schema markers + top-level Language rule | "in Korean>" → "in English>"; added `**Language rule (critical):**` forcing English output regardless of input language. Tving locale exception documented (see §3). |
| `molly-chat.js` | Full SYSTEM_PROMPT body | Self-intro fixed to **"Molly, an AI assistant for design-system-driven product improvements"** (no team name suffix). Hallucination-ban list translated 1:1. |
| `molly-status.js` | SYSTEM_PROMPT + inline templates | Added "ALWAYS reply in English regardless" forcing rule. composeStatusReply / templatedFallback fully English. |
| `molly-prd-analyzer.js` | SYSTEM_PROMPT + extracted buildPrdUserMessage | Role label `'사용자'` → `'user'`. Clarifying-question spec → "Friendly, concise English, 1-2 sentences". |
| `job-decomposer.js` | SYSTEM_PROMPT + field rename | `risksKo` → `risks`, `qaRationaleKo` → `qaRationale`. Back-compat reads (`obj.risks ?? obj.risksKo`) at every caller. |
| `molly-lifecycle.js` | SURFACE_INSTRUCTIONS + reply builders + actionLabel | Korean ACTION_KEYWORDS preserved (Korean input matching). Templates fully English. |

Each lib has its own `orchestrator/test/<lib>.test.js` with regression + English-migration invariants (135 tests total).

### UI surfaces (Phase B — 4 surfaces + cleanup)

- **B.1 Playground** (`playground-app/src/`, 11 files): AIPanel, JobCard, LivePreview, pages, services. PHASE_LABELS values English. ~80 string migrations.
- **B.2 Chrome ext** (`chrome-extension/sidepanel.js`): 64 string migrations. Korean intent-classifier regexes (lines 1107-1170) preserved — they match Korean user input.
- **B.3 Slack + server fallbacks** (`orchestrator/lib/molly.js`, `orchestrator/server.js`): ~60 Slack block kit strings + 5 server.js fallback errors.
- **B.4 Dashboard** (`dashboard/src/`, 6 pages): ~57 string migrations.
- **B.5 cleanup** (sentinel + ctx labels + parse errors): "재실행 중…" sentinel renamed to "Re-running…" atomically across writer (server.js) + reader (JobCard.tsx). Chrome ext `buildJobPrdText` context labels (Target page / Client / Component / File / Selected element / Context) translated. 3 playground orchestrator-client parse errors translated.

### Code comments (Phase B.6 — 4 commits)

- `orchestrator/lib/*.js` (19 files) + `server.js` + 2 test files
- `playground-app/src/` (10 files)
- `chrome-extension/{background,sidepanel}.js`
- `dashboard/src/pages/{OverviewPage,SettingsPage}.tsx`

---

## 3) Tving locale exception (decomposer + plan-emitter)

The decomposer / plan-emitter now teach the LLM that *product* code may contain Korean UI copy even though task descriptions are English. The prompts say roughly:

> Quoted UI copy that ends up in the actual product (Tving is the primary client — its end-users read Korean as their main locale; msm-portal supports KR + EN via i18n) may be Korean inside the English prose — e.g. `Add a button labelled "확인"`. The surrounding prose stays English; only the verbatim quoted copy may be Korean.

`job-decomposer.test.js` has an invariant: any Korean codepoint in SYSTEM_PROMPT must appear within ±250 chars of `Tving|i18n|locale|user-facing copy|verbatim`. So future edits accidentally introducing Korean elsewhere will fail the test.

---

## 4) Korean residue — what stays and why

| Where | Why preserve |
|---|---|
| classifier `GREETING_RE` / `LIFECYCLE_FAST_RE` / `PRD_KEYWORDS` | Match Korean user input. Required for fast-path classification. |
| chrome-ext sidepanel.js lines 1107-1170 | Intent-classifier regexes that match Korean keywords in user input. |
| SYSTEM_PROMPT keyword tokens + user-input examples (classifier / lifecycle) | LLM learns to classify Korean inputs from these. |
| decomposer + plan-emitter Tving locale exception (e.g. `"확인"`, `"환영합니다"`) | Teach LLM to keep product UI copy in Korean per Tving i18n convention. |
| Legacy state files (existing `prdText` with Korean structured context labels) | Not migrated by code — new data is English, old data renders fine read-only. |

Total Korean-line count went from **1,085 → 257** (76% reduction). The remaining 257 are all in the four categories above.

---

## 5) Decisions made this session

| Topic | Decision |
|---|---|
| Self-intro phrasing | "Molly, an AI assistant for design-system-driven product improvements" — no "Moloco Inspect" team suffix (no such team exists). |
| Korean keyword preservation | Keep in fast-path regexes + SYSTEM_PROMPT keyword lists; never translate. |
| Korean user-input examples in prompts | Keep — they teach the LLM Korean classification. Mix Korean + English examples. |
| English forcing | Soft "reply in English" wasn't enough — LLMs default to mirroring input language. All 3 LLM-text libs (chat/status/plan-emitter) now have explicit "ALWAYS reply in English regardless of input language" top-level rule. |
| Code comments | Translate to English (dev team is English-speaking). |
| Tving product locale | Decomposer + plan-emitter prompt teaches the LLM that quoted UI copy inside English task descriptions may be Korean. |
| `risksKo` / `qaRationaleKo` rename | Renamed to `risks` / `qaRationale` with back-compat reads (`?? oldField`) at all 5 caller sites + `@deprecated` on TS types. Old state files still render. |
| Sentinel `재실행 중…` | Atomic rename to `Re-running…` (writer server.js + reader JobCard.tsx in same commit). |

---

## 6) New auto-memory entries

- `feedback_code_in_english.md` — Code identifiers + comments must be English. Korean only for user-input regexes and prompt examples.
- `project_tving_product_i18n.md` — Tving = primary client, Korean main locale. Product code (msm-portal) supports KR + EN; UI copy stays in user locale. Inspect tooling itself is English-only.

---

## 7) Verification commands

```bash
# Orchestrator tests (run from orchestrator/)
node --test test/molly-classifier.test.js test/molly-plan-emitter.test.js test/molly-chat.test.js test/molly-status.test.js test/molly-prd-analyzer.test.js test/molly-lifecycle.test.js test/job-decomposer.test.js test/job-runner.test.js test/job-state.test.js
# → 135 pass, 0 fail

# Frontends
(cd playground-app && pnpm tsc --noEmit)  # clean
(cd dashboard && pnpm tsc --noEmit)       # clean

# Chrome ext syntax
node --check chrome-extension/background.js
node --check chrome-extension/sidepanel.js

# Korean residue count (sanity)
grep -rn '[가-힣]' orchestrator/lib orchestrator/server.js orchestrator/test playground-app/src dashboard/src chrome-extension --include='*.js' --include='*.ts' --include='*.tsx' --include='*.html' --include='*.json' --include='*.css' 2>/dev/null | wc -l
# → ~257 (all intentional — see §4)
```

---

## 8) Smoke test results (LLM-actual, against `localhost:3847`)

| Input | Kind | Reply | Pass |
|---|---|---|---|
| `"안녕"` | chat (fast-path) | "Hi! 👋..." | ✓ |
| `"이 잡 취소해줘"` | lifecycle_action | "🤔 Which job would you like to Cancel?" | ✓ |
| `"활성 잡 몇 개야?"` | status_query | "You have **2 active tasks** currently running..." | ✓ |
| `"TAS 사이드바에 도움말 메뉴 추가..."` | plan_emit | "Add HELP_MAIN to MERouteKey enum" / "Append HELP_MAIN..." | ✓ |
| `"molly 가 뭐야?"` | chat | "Molly, an AI assistant for design-system-driven product improvements..." | ✓ |

---

## 9) Known limitations / gotchas

- **Anthropic prompt cache (`cache_control: ephemeral`)** has a 5-minute TTL. New prompt content takes effect immediately for fresh requests after edits.
- **`node --watch`** for orchestrator restarts on dependent-file changes (Node ≥20). Confirmed reload by the C-followup smoke test catching the new English prompt instantly.
- **Existing state files** with Korean `prdText` / `risksKo` / `qaRationaleKo` still load correctly via back-compat reads. New writes go to the new English field names.
- **Chrome ext intent-classifier regexes** still match Korean keywords intentionally. Don't lump those into a future "remove all Korean" sweep.
- **Slack `manifest.json` bot description** — not in repo (configured in Slack workspace console). Update separately if it's still Korean.

---

## 10) Next session candidates

Pick one — listed by user-visible payoff:

1. **Deploy via Cloudflare Tunnel** — 2-user trial. Plan doc already exists: `docs/superpowers/plans/2026-05-11-local-share-cloudflare-tunnel.md`. English migration just unblocked external sharing.
2. **GCP phased deploy** — 5-20 users. Plan doc: `docs/superpowers/plans/2026-05-11-gcp-deploy-phased.md`.
3. **Operational measurement dashboard** — D+ retry cost / fast-track usage / plan_feedback frequency charts. The `molly-cost.js` infra is already there; add dashboard sections.
4. **DS Direction roadmap** — copy-to-clipboard → style tab → a11y → prop controls → anatomy → blocks (see `project_ds_direction` memory).

---

## 11) Service ports (unchanged)

- orchestrator `:3847`
- playground-app `:4180`
- dashboard `:4174`

Auto-restart:
- orchestrator: `node --watch` on lib edits
- playground-app / dashboard: Vite HMR

---

*Last updated: 2026-05-12. Migration complete; next session should pick from §10.*
