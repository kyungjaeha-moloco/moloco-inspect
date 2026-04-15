# Session Handoff — 2026-04-14

## What Was Done This Session

### Code Changes (21 commits)
1. **Session B batch commit** — 99 files from previous session
2. **Auth bypass for live preview** — Proxy HTML injection, bootstrap redirect
3. **PR flow hardened** — `--body-file` (shell injection fix), `didStash` flag, branch cleanup
4. **Chrome Extension AI UI** — Section headers, file highlighting, risk/verify cards
5. **Codex review fixes** — pipeline_error not treated as success, label restore on retry
6. **Full English localization** — Chrome Extension (287 strings), Ops Hub, Orchestrator prompts/templates
7. **Keyboard shortcut** — `Alt+Shift+X` → `Cmd+Shift+E` (Mac) / `Alt+Shift+E` (Win)
8. **Tab opening fix** — Skip bootstrap recovery for `/api/` URLs
9. **Diff-view redesign** — Carbon Light theme matching Ops Hub
10. **Progress stepper** — Green checkmark "Done" on success, red on error
11. **README rewrite** — Full English documentation with architecture diagram
12. **Request Detail redesign** — Two-column layout, inline diff, sticky action bar, feedback dialog
13. **Timeline enhancement** — Analytics events + logs merged, per-event-type colors
14. **State persistence** — `orchestrator/state/{id}.json`, restore on startup, merge into analytics API
15. **Donut chart** — Recharts PieChart for Agent Performance
16. **Auth token injection** — `sed` into sandbox `index.html` before vite starts
17. **Playwright screenshot** — Capture after vite ready inside sandbox
18. **macOS `._` files** — Remove resource forks after `docker cp`
19. **TypeCheck reorder** — Moved after `pnpm install`
20. **Zscaler CA cert** — Inject corporate proxy CA into sandbox
21. **System status script** — `bash scripts/status.sh`
22. **Health state fix** — background.js now parses model/requests from API
23. **Rename Ops Hub → Inspect Hub** — Dashboard, docs, diagrams

### Documentation
- `docs/TEAM_INTRO_2026-04-14.md` — Comprehensive team intro (merged with proposal update)
- `docs/PROPOSAL_UPDATE_2026-04-13.md` — Progress report with M1-M16 milestone roadmap
- `docs/DESIGN_SYSTEM_GUIDE.md` — How the DS was built, structure, agent usage
- 6 D2 diagrams in `docs/images/` (request flow, architecture, pipeline, DS, AI plan, review page)

### Key Decisions
- **Entry point strategy**: Chrome Extension → Slack → Jira
- **Provider**: `SANDBOX_PROVIDER=opencode` (not anthropic) — avoids Zscaler SSL issue
- **Dashboard name**: Moloco Ops Hub → **Inspect Hub**
- **Timeline**: M1-M16, Phase 1/2/3, target Aug 15, 2026

---

## Current State

### Running Services
```bash
# Orchestrator (opencode provider)
cd orchestrator && SANDBOX_PROVIDER=opencode node server.js  # → http://localhost:3847

# Inspect Hub
cd dashboard && pnpm dev  # → http://localhost:4174

# Design System Site
cd design-system-site && pnpm dev  # → http://localhost:4176

# Product App
cd /Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web && pnpm start:tving:test  # → http://localhost:8000

# Status check
bash scripts/status.sh
```

### Provider Config
| Purpose | Provider | Model |
|---------|----------|-------|
| Sandbox agent (code modification) | OpenCode | opencode/gpt-5-nano |
| AI analysis (request planning) | Anthropic | claude-sonnet-4-6 |
| Fallback | OpenAI | gpt-4o |

**Important:** Use `SANDBOX_PROVIDER=opencode` — using `anthropic` causes Zscaler SSL failure inside Docker containers.

### State Persistence
- Request state saved to `orchestrator/state/{id}.json`
- Restored on server startup
- Merged into analytics API responses
- Screenshots at `orchestrator/screenshots/{id}.png`

---

## Known Issues

### P0
- **Live Preview auth** — Token injection via `sed` into `index.html` implemented but not verified end-to-end. Previous sessions showed login screen persisting.
- **Product App (localhost:8000)** — May need manual restart. Check with `bash scripts/status.sh`.

### P1
- **Screenshot capture** — Playwright script added but not tested with a successful request. The `._` file fix + Zscaler CA fix were done at the same time.
- **Sandbox cold start** — `pnpm install` still takes 30-90s. Pre-baking `node_modules` into Docker image would fix.

### P2
- **AI prompt quality** — Some requests produce generic plans. Need intent-specific few-shot examples.
- **PRD parsing** — Basic implementation, needs iteration.
- **Old sandbox cleanup** — No auto-cleanup. Containers accumulate. Cleaned manually this session.

---

## Next Session Priorities

### 1. End-to-end test with opencode provider
- Send a request from Chrome Extension
- Verify: agent runs → diff collected → typecheck → live preview → screenshot
- Confirm Live Preview loads without login

### 2. M4 Stability remaining tasks
- Sandbox cold start optimization (pre-bake node_modules)
- AI prompt quality improvement
- PRD parsing iteration
- Auto-cleanup of old sandbox containers

### 3. Prepare for M7 User Testing (Apr 28)
- Define 5 test tasks for TAS Order Management
- Set up measurement: timing, quality scoring
- 1:1 onboarding guide for testers

---

## Files Modified This Session (key files)

```
orchestrator/server.js          — Pipeline, state persistence, auth injection, Zscaler CA, typecheck reorder
chrome-extension/sidepanel.js   — Full English localization (287 strings)
chrome-extension/sidepanel.html — Full English localization (41 strings)
chrome-extension/sidepanel.css  — Timeline styling, stepper complete/error states, diff colors
chrome-extension/content-script.js — English, shortcut change, ESC cancel
chrome-extension/background.js  — Tab opening fix, health state parsing
dashboard/src/pages/RequestDetailPage.tsx — Full redesign (two-column, inline diff, action bar)
dashboard/src/pages/OverviewPage.tsx — Donut chart (Recharts PieChart)
dashboard/assets/site.css       — Request detail styles, timeline, chart row, diff colors
tooling/sandbox-manager/src/container.js — SSL_CERT_FILE → /tmp/ca-bundle.crt
sandbox/zscaler-ca.pem          — Corporate proxy CA cert
scripts/status.sh               — System status check script
README.md                       — Full English rewrite
docs/TEAM_INTRO_2026-04-14.md   — Comprehensive team document
docs/PROPOSAL_UPDATE_2026-04-13.md — Milestone roadmap M1-M16
docs/DESIGN_SYSTEM_GUIDE.md     — DS structure and build process
docs/images/*.d2, *.png         — 6 D2 diagrams
```

## Git Log (this session)
```
b666cb1 fix: populate health state with model/requests/sandboxImage from API
16abf27 feat: add system status check script
2f29d04 fix: inject Zscaler CA cert into sandbox for corporate proxy SSL
b09a830 fix: remove macOS ._ resource fork files from sandbox
e0d54f2 fix: move typecheck after pnpm install
d07634a docs: replace ASCII mockups with D2-rendered PNG images
86da399 rename: Moloco Ops Hub → Inspect Hub
b93bbdf docs: merge Team Intro + Proposal Update
91f0f8e docs: replace milestone roadmap with M1-M16 timeline
0a350c5 docs: add Design System guide
... (+ 15 more commits)
```
