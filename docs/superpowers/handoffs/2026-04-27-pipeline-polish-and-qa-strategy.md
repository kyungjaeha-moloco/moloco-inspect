# Handoff — Pipeline polish + QA strategy decisions

**Date:** 2026-04-27
**Author:** kyungjae.ha (with Claude)
**Branch:** main (uncommitted; commit before next session)
**Prior handoff:** `docs/superpowers/handoffs/2026-04-24-prd-delivery-thin-slice.md`
**Companion:** `docs/superpowers/handoffs/2026-04-27-qa-strategy-runner.md` — picks up where this leaves off on auto-QA execution.

---

## Where we are

PRD→delivery thin-slice (J0–J5) was already live coming into this
session. Today turned the rough edges into polish: the agent's live
work is visible, plans can be edited, the result page auto-opens,
chat survives browser switches, and the orchestrator now picks a QA
strategy at approve time. The actual QA *execution* didn't ship —
it's queued as the next focused slice.

Status: **all of today's changes are unstaged.** First action next
session: review + commit (15 files modified, 3 new — see "Commit
plan" below).

---

## Shipped this session

### A. Live agent feedback (the "답답함" fix)

**Phase + tool counter + latest thought, grouped into one panel.**

- New SSE-backed `agent-stream.ts` — subscribes to
  `/api/events/<requestId>` and parses `🛠️`/`💬`/`📝` log lines into
  `{toolCounts, latestThought, latestLog}` snapshots.
- `ActivityPanel` in JobCard renders all three signals inside one
  bordered, lightly-tinted box under the running task title:
  - phase line (한국어 라벨 — "코드 작성 중" / "변경사항 수집 중" /
    "타입 검증 중" / "스크린샷 촬영 중")
  - tool chips (Read ×3, Edit, Bash …)
  - latest assistant thought, separated by dashed divider
- Running task row gets a pulse glow border + pixel-agent walking
  sprite. Cancelled job: pulse off, pixel agent replaced with a gray
  "취소됨" chip, full job card opacity 0.55.
- Phase poller in `runChangeRequestForTask` clears `currentPhase` on
  finish + on cancel, so stale phases don't linger.

Files touched: `JobCard.tsx`, `agent-stream.ts` (new),
`server.js#runChangeRequestForTask`, `job.js#setTaskMeta`,
`tokens.css#jobTaskPulse,livePhaseBlink`.

### B. Plan editing — both surgical and conversational

- **A. Inline ✎ edit** per task row, only when job is `planning`
  AND task is `pending`. Title input + description textarea. Save
  posts the full updated array to the existing
  `POST /api/job/:id/tasks` endpoint.
- **B. "이 계획에 수정 요청" textarea** above the footer. ⌘/Ctrl+Enter
  submits. Wires through `redecomposeJob(id, feedback)` →
  `POST /api/job/:id/decompose` body `{feedback}` → decomposer
  `ctx.userFeedback` embedded in the user message with strict honor
  language.
- Decomposer task ceiling 5 → **15**, `max_tokens` 4096 → 8192.
- Re-plan button copy: "더 작게 나누기" → **"다시 계획 세우기"** with
  tooltip explaining outcome. Inline banner during in-flight
  re-decompose ("다시 계획 세우는 중…" pixel-agent + dimmed prior
  tasks).
- FSM addition: `planning → decomposing` (was missing).

### C. Decomposer voice + UX polish

- System prompt now mandates **plain product language** (PM/SA
  audience, not coders).
  - Title: 5–15 chars, plain action.
  - Description opens with the user-visible outcome before any
    technical bullets.
  - **Forbidden jargon list:** 라우트, 스캐폴딩, placeholder, fetching,
    mock, in-memory, wrapper, embed, MVP, API, hook, state, props,
    scope, refactor, z-index, render, component, DOM, ref. Plus
    English library names (useQuery, useState, etc.).
  - Translates "범위 외" / "out of scope" into "이 단계에서는 …는 아직
    동작하지 않습니다".
- `dependsOn` rendering converted from internal IDs (`← t3,t5`) to
  user-visible indices (`← 3, 5번 작업 후`) with a hover tooltip
  explaining the relationship.

### D. Design system enforcement

- `prompt-builder.js` RULE 7: explicit catalog of canonical
  components + "use these instead of rolling your own" mandate.
  - `MCButton2`/`MCButton`, `MCStack`, `MCIcon`, `MCSwitch`,
    `MCStatus`, dialog/table primitives under `src/common/component/`.
  - "찾기 막히면 옆 라우트(예: PublisherCreativeReview) 그대로
    베껴라" 휴리스틱.
- Reviewer RULE 7 mirrors it: fail diffs that *introduce* new raw
  `<button>`/`<table>`/colored boxes when a DS equivalent obviously
  exists, with explicit guidance on which component should have
  been used.

### E. Result page auto-nav

The "작업 다 됐다는데 화면에 안 보임" UX gap from today.

- Decomposer schema: optional top-level `targetRoute` (path starting
  with `/`).
- Job model: `targetRoute` field + `setTargetRoute(jobId, route)`
  helper. Stamped after a successful decompose.
- Sandbox runtime new command: **`picker.navigate {path}`** — applies
  via `history.pushState` + `popstate` so the SPA navigates without a
  bridge handshake reload.
- Bridge: `BridgeCommand` adds `picker.navigate`, returned object
  exposes `navigate(iframe, path)`.
- Store: `requestedIframeNav: { path, token }` field +
  `requestIframeNav(path)` action. LivePreview's `useEffect` watches
  the token and calls `bridge.navigate`.
- JobCard footer: **"결과 페이지 열기 ↗"** button when `targetRoute`
  is set AND status is `qa` or `complete`.

Files: `job-decomposer.js`, `job.js`, `server.js`,
`vite-plugin-playground-picker/src/{types,runtime}.ts`,
`playground-bridge.ts`, `playground-store.ts`, `LivePreview.tsx`,
`JobCard.tsx`, `orchestrator-client.ts`.

### F. Branch viz — history dialog

- New endpoint **`GET /api/playground/:id/log`** — runs
  `git log baseline..HEAD --format='%H\\t%P\\t%at\\t%s'` inside the
  sandbox, parses into commits.
- Client helper `getPlaygroundLog()` + `PlaygroundCommit` type.
- **📜 히스토리** button on PlaygroundDetail header (next to
  Promote).
- `HistoryDialog` modal: vertical timeline, dot+line for each commit,
  HEAD chip (blue), "Restore to" commits highlighted (orange),
  current `checkedOutSha` chip, "이 시점 보기" per-commit button →
  `checkoutPlaygroundCommit(id, sha)` → store `setCurrent(updated)`
  → modal closes.
- Empty/loading/error states all rendered.

### G. Chat persistence — server-side

`localStorage` is per-browser; user lost chat moving from Chrome to
Safari. Now both:

- `state/chat/<playgroundId>.json` on the orchestrator host. Atomic
  write via tmp+rename.
- Endpoints: `GET /api/playground/:id/chat`,
  `PUT /api/playground/:id/chat` (full-array round-trip — server
  doesn't need to know schema).
- Client: `getChatMessages` / `putChatMessages` helpers in
  orchestrator-client. Store integrates as 2-tier persistence:
  - localStorage = instant first paint cache
  - Server PUT = debounced 500 ms, fire-and-forget
  - On `setCurrent`, hydrate from localStorage immediately, then
    async-fetch server. Server wins if it has any messages; if
    server is empty but localStorage has data, the client seeds the
    server with what it had.
- Reentrancy guard via `pendingHydrate` so rapid playground switches
  don't race fetches into the wrong store.

### H. Comment tracker — comments stick to elements

The "코멘트가 그냥 위에 떠 있어서 쓸모 없다" complaint.

- New runtime feature: rAF-throttled bbox sampling per tracked CSS
  selector. Emits `playground.tracked {bboxes: {sel: bbox|null}}`
  whenever any value changes.
- New parent → child command: **`picker.track {selectors}`**. Empty
  array stops tracking; rAF loop suspends.
- New child → parent message: **`playground.tracked`** with the bbox
  map.
- Bridge: `setTracked(iframe, selectors)` + `onTracked` handler.
- LivePreview maintains `liveBboxes` cache, recomputes
  `trackedSelectorList` from current pins, pushes via
  `bridge.setTracked` whenever the set changes (stable string-key
  fingerprint dedupe).
- PinMarker uses live bbox centroid when present, falls back to
  stored x/y otherwise. `orphaned` (selector resolves to null) →
  faded marker + tooltip "연결된 요소를 찾을 수 없어요". Smooth
  80ms linear transition keeps motion non-jittery.
- Sandbox plugin rebuilt + `docker cp dist → /workspace/plugins/...`
  hot-patched into `inspect-pg-52fd083e` *and* `inspect-pg-d912c046`
  + vite restart. **New playground containers ship with the
  pre-tracker plugin baked into the image — they need the same hot
  patch until the image is rebuilt.**

### I. QA strategy selector (decision phase only)

- New `lib/job-qa-strategist.js` — calls Anthropic Messages with the
  PRD + approved task list, returns `{strategy, rationale_ko}`.
- Catalog (frozen): `inline_per_task`, `final_route_smoke`,
  `visual_diff`, `lint_only`, `human_only`. Each entry has
  `id, label_ko, when_ko`.
- `setQaStrategy(jobId, info)` stamps decision on job record.
- Server: `approve-plan` handler kicks `selectQaStrategy` in
  background. Failure falls back to `human_only` ("자동 선택 실패 —
  사람이 직접 확인").
- UI: `QaStrategyChip` in JobCard header — `🧪 마무리`/`🧪 단계별`/
  `🧪 시각`/`🧪 린트`/`🧪 수동`. Hover tooltip carries the LLM
  rationale.

**Execution still TODO** — see companion handoff
`2026-04-27-qa-strategy-runner.md`.

### J. Cancel-with-rewind

When user cancels a job that already landed commits on the
playground, optionally rewind workBranch to `baselineHeadSha`
(snapshotted at job creation).

- `Job.baselineHeadSha` field, set in `createJob` to playground's
  current `headCommitSha`.
- `cancelJob` body now accepts `{rewind: true}` — server calls
  `restoreToSha(playgroundId, baselineHeadSha)` after FSM flip.
- Client `cancelJob(id, rewind?)` signature. JobCard cancel flow
  detects "any landed commits?" — if so, asks two confirms (cancel +
  rewind decision). If not, single confirm.
- Reason: today's screenshot of the job that "didn't show up"
  problem — now the user has a clean way to undo half-broken work.

### L. Late-session fixes (browser-validation pass)

User opened a fresh playground (`a90c9895`) to test today's polish
and surfaced two bugs introduced *by* today's work:

- **CORS PUT method blocked.** Chat persistence's `PUT
  /api/playground/:id/chat` was rejected by the orchestrator's CORS
  preflight (Safari: "Method PUT is not allowed by Access-Control-
  Allow-Methods"). Fix: bumped the two `Access-Control-Allow-Methods`
  headers from `'GET, POST, OPTIONS'` to `'GET, POST, PUT, DELETE,
  OPTIONS'` in `orchestrator/server.js`. Chat now round-trips to the
  server cleanly and survives browser switches.
- **New playground containers ship with the pre-tracker / pre-navigate
  picker plugin.** `inspect-pg-a90c9895` had the baked-in dist from
  the docker image, not the host's hot-patched version, so picker
  runtime serving failed entirely (Safari: "지원되지 않는 URL"). Two
  steps:
  - **Immediate:** `docker cp` host dist into a90c9895 + vite
    restart — that container now works.
  - **Permanent:** added a hot-patch block to
    `playground.js#createPlayground`, right after
    `writePlaygroundViteConfig`. Every new container automatically
    gets the host's latest `sandbox/vite-plugin-playground-picker/dist`
    copied in before vite is started, so this footgun is gone.
    Best-effort try/catch — if the host dist is missing the boot
    continues with the baked-in version.

This collapses what was a "next session" todo into the current
session, so the next-session list shrinks by one.

### K. Decomposer signal cleanup

- "재분해" → "다시 계획 세우기" everywhere (button label, banner copy,
  prompt rationale block).
- Re-decompose only available from `planning` (a plan exists) or
  `paused` with `pausedReason` starting with "decompose failed".
  Hidden during in-flight `decomposing` to prevent panic clicks
  racing the LLM.
- Re-decompose path passes prior `tasks` as `previousTasks` ctx and
  optional `userFeedback`. Combined with the system prompt's
  "produce a meaningfully different breakdown" rule, the second
  plan is now actually different.

---

## Files modified / added

```
M  orchestrator/lib/job-decomposer.js   # plain-language voice, targetRoute, userFeedback, cap 15
M  orchestrator/lib/job-reviewer.js     # DS check rule
M  orchestrator/lib/job-state.js        # planning→decomposing, failed→reviewed (accept-anyway)
M  orchestrator/lib/job.js              # baselineHeadSha, setQaStrategy, setTargetRoute, setTaskMeta, acceptTask
M  orchestrator/server.js               # /chat, /log, accept-task, rewind, qa-strategist hook, immediate changeRequestId stamp
M  playground-app/src/editor/JobCard.tsx          # ActivityPanel, ReviewFailActions, QaStrategyChip, PlanFeedbackInput, inline edit, dependsOn label, decomposing banner, "결과 페이지 열기"
M  playground-app/src/editor/LivePreview.tsx     # liveBboxes, trackedSelectorList effect, requestedIframeNav effect
M  playground-app/src/pages/PlaygroundDetail.tsx # 📜 button, HistoryDialog, relativeTimeShort
M  playground-app/src/services/orchestrator-client.ts # ORCHESTRATOR_URL export, QaStrategyId, getChatMessages/putChatMessages, getPlaygroundLog, acceptJobTask, updateJobTasks, redecomposeJob(feedback)
M  playground-app/src/services/playground-bridge.ts # picker.track, picker.navigate, BridgeTracked, setTracked, navigate
M  playground-app/src/shared-ui/tokens.css        # jobTaskPulse, livePhaseBlink
M  playground-app/src/store/playground-store.ts  # requestedIframeNav, requestIframeNav, server-side chat hydrate+PUT, pendingHydrate, chatPutTimer
M  sandbox/vite-plugin-playground-picker/src/runtime.ts # tracker, picker.navigate handler, sample loop
M  sandbox/vite-plugin-playground-picker/src/types.ts   # PickerTrackedBboxes, picker.track, picker.navigate
M  tooling/sandbox-manager/src/prompt-builder.js # RULE 7 — DS components mandate

A  docs/superpowers/handoffs/2026-04-27-qa-strategy-runner.md
A  docs/superpowers/handoffs/2026-04-27-pipeline-polish-and-qa-strategy.md  (this file)
A  orchestrator/lib/job-qa-strategist.js
A  playground-app/src/services/agent-stream.ts
```

---

## Open issues found mid-session

### 1. Permission-gate sign-in redirect — **diagnosed, not fixed**

Today's playground d912c046 ran job 5f41d16d (12 tasks, 8/8
reviewed, all DONE), but the agent introduced
`allowedRoles: [MEUserRoleType.WORKPLACE_OWNER]` on the new
`TAS_POST_CREATIVE_REVIEW_MAIN` route. The current playground user
isn't WORKPLACE_OWNER, so clicking the new sidebar entry silently
redirects through `/sign-in?redirect=...`. From the user's POV
"작업 다 됐다는데 화면에 안 보임" — felt like our pipeline was lying.

Root cause: agent copied the `allowedRoles` line from the adjacent
`PUBLISHER_CREATIVE_REVIEW_MAIN` entry without thinking about
whether the playground's test user actually had that role.

**Mitigations available:**
- Decomposer prompt could note "playground users do NOT have
  WORKPLACE_OWNER unless explicitly stated" — would steer the agent
  away from copying the role line
- Reviewer could flag any `allowedRoles` introduction that gates
  the very route the task was supposed to make visible
- The `final_route_smoke` adapter (next session) catches this at QA
  time via the `/sign-in` URL guard already coded into its spec
- Long term: synthesize a fake "全権 admin" session into the
  playground sandbox so role gates don't trip during QA

The cleanest single fix is **the QA runner**: it catches this
class of bug end-to-end without prompt engineering. Defer until
that ships.

### 2. i18n labels rendered as keys

Same job: navbar shows literal `oms.tasPostCreativeReview` instead
of "Creative Review" because the agent didn't add Korean
translation entries. Console: `i18next::translator: missingKey`.

Decomposer doesn't currently mention i18n as a sibling task.
Cosmetic but gives "this looks unfinished" signal. Low priority —
covered by the DS rule expansion (RULE 7 now mentions i18n
indirectly via "follow sibling page imports").

### 3. New sandbox containers ship pre-tracker plugin

The picker plugin's tracker code lives in
`sandbox/vite-plugin-playground-picker/dist/` baked into the docker
image at build time. New playground containers don't get the
tracker until either (a) the image is rebuilt, or (b) the orchestrator
hot-patches them on first boot.

**Suggested fix (next session):** add a one-time hot-patch step in
`bootPlaygroundContainer` that does `docker cp` of the host's latest
plugin dist into `/workspace/plugins/...` and `supervisorctl restart
vite`. ~10 lines. Same idea as the existing invalidation watcher
patch.

### 4. Parallel task execution — researched, deferred

Conversation ran through this. Conclusion: technically possible via
git worktree + multiple opencode workers in same container, but the
real risk isn't infrastructure — it's hot-spot file conflicts
(routeTemplate, i18n locales, navbar) and the decomposer's
dependency-graph accuracy. Re-design separately. Not a v1 line.

---

## What ships next session (recommended order)

1. **Commit today's work.** ~16 modified + 4 added. Aim for ~6
   logically-grouped commits matching sections A-L above.
2. **QA strategy runner (companion handoff).** Highest leverage —
   directly catches the bug class from §"Open issues" #1. Plan is
   in `2026-04-27-qa-strategy-runner.md`. Start with
   `final_route_smoke` adapter.
3. **Decomposer "no allowedRoles unless asked" hint.** Prompt-only
   fix to reduce the role-gate footgun rate while QA runner is
   getting built. ~5 lines.
4. **Validate the late-session fixes once more on a *fresh*
   playground.** Specifically:
   - Make a brand-new playground (no manual hot-patch). Confirm
     picker mode works, comment tracker works, "결과 페이지 열기"
     navigates the iframe — i.e. the auto hot-patch from §L fires.
   - Send a chat message, open the same playground in a different
     browser (or incognito). Confirm the message is there.
5. **(Optional)** Add a small "agent skipped i18n keys" reviewer
   check — flags diffs that introduce a new `labelKey:` or
   `t('foo')` without adding the key to `ko/en` locale files.
   Cosmetic but kills the "navbar shows raw key name" footgun
   from §"Open issues" #2.

---

## Test artifacts left behind

- Active playgrounds: `52fd083e` (컬럼 개편), `d912c046` (Tving DR4P), `9cb08297` (older M3 test). All `active`. d912c046 has the role-gate bug job to use as a regression case for QA runner.
- `inspect-pg-d912c046` and `inspect-pg-52fd083e` containers are running with the latest hot-patched picker plugin (tracker + navigate).
- Orchestrator listens on :3847 (background task `bz7ap5hw0`).
- playground-app dev server on :4180 (separate process).

---

## How to start the next session

Drop these as the first prompt to the next assistant — copy/paste:

```
이전 세션 핸드오프 두 개 읽고 현재 상태 파악해:
1. docs/superpowers/handoffs/2026-04-27-pipeline-polish-and-qa-strategy.md (오늘 세션 정리)
2. docs/superpowers/handoffs/2026-04-27-qa-strategy-runner.md (다음 슬라이스 가이드)

현재 main 브랜치에 16+4 파일이 uncommitted 상태야. 첫 액션은 git status 로 확인하고, A-L 섹션에 맞춰서 6개 정도 logical commit 으로 정리.

커밋 끝나면 QA strategy runner의 final_route_smoke 어댑터부터 구현. companion handoff에 모든 코드 스니펫 + 검증 플랜 있어.

orchestrator는 :3847, playground-app은 :4180 둘 다 백그라운드에 떠 있을 가능성 높아 — `lsof -ti :3847` 로 살아있는지 확인하고 죽었으면 다시 띄워. 활성 플레이그라운드: 52fd083e / d912c046 / 9cb08297 / a90c9895.

특히 d912c046#5f41d16d 잡이 final_route_smoke 의 regression 케이스 (allowedRoles WORKPLACE_OWNER → /sign-in 리다이렉트). 이걸로 verification.
```

### Pre-flight checklist (다음 세션 첫 5분)

다음 어시스턴트가 5분 안에 처리해야 하는 것들 — 셋 다 사이드 이펙트 적고 컨텍스트 회복에 도움됨:

```bash
# 1. 어디까지 와 있는지
git status --short
git log --oneline -10

# 2. 서비스 살아 있는지
lsof -ti :3847 | head -1   # orchestrator
lsof -ti :4180 | head -1   # playground-app vite

# 3. 컨테이너 살아 있는지
docker ps --filter "name=inspect-pg-" --format '{{.Names}} {{.Status}}'

# 4. 핸드오프 두 개 읽기 (이 문서 + qa-strategy-runner.md)
```

### 첫 commit 그룹 제안 (~6개)

핸드오프 §A-L 매핑:

| 그룹 | 섹션 | 변경 파일 (요점) |
|---|---|---|
| `feat(JobCard): live agent ActivityPanel + cancel state` | A, J | JobCard.tsx, agent-stream.ts, server.js#runChangeRequestForTask, job.js, tokens.css |
| `feat(JobCard): plan editing — inline ✎ + free-form feedback` | B, K | JobCard.tsx, orchestrator-client.ts, job-decomposer.js, server.js, job-state.js |
| `feat(decomposer): plain-language voice + DS enforcement` | C, D | job-decomposer.js, prompt-builder.js, job-reviewer.js, JobCard.tsx (dependsOn label) |
| `feat(playground): result-page auto-nav (decomposer targetRoute → bridge.navigate)` | E | job-decomposer.js, job.js, server.js, runtime.ts, types.ts, playground-bridge.ts, playground-store.ts, LivePreview.tsx, JobCard.tsx |
| `feat(playground): branch viz history dialog + chat persistence + comment tracker` | F, G, H | server.js (/log, /chat), orchestrator-client.ts, PlaygroundDetail.tsx, playground-store.ts, runtime.ts, types.ts, playground-bridge.ts, LivePreview.tsx |
| `feat(job): QA strategy selector + late-session fixes (CORS PUT, auto plugin hot-patch)` | I, L | job-qa-strategist.js (new), job.js, server.js (CORS), playground.js (hot-patch), JobCard.tsx |

Plus the two handoff docs as a separate `docs(handoff): 2026-04-27 session` commit.

### Memory / context to update

After committing, refresh
`/Users/kyungjae.ha/.claude/projects/-Users-kyungjae-ha-Documents-moloco-inspect/memory/project_canvas_app.md`
to point at this handoff and tag the major themes (live agent
visibility, plan editing, DS enforcement, result auto-nav, branch
viz, chat persistence, comment tracker, QA strategy decision).
