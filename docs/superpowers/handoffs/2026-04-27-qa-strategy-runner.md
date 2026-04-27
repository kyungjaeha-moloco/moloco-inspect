# Handoff — QA Strategy Runner (J6 execution)

**Date:** 2026-04-27
**Author:** kyungjae.ha (with Claude)
**Branch:** main
**Status:** strategist (decision) shipped; runner (execution) deferred — this doc.

---

## Why this exists

After this session, the orchestrator picks a QA strategy when the user
approves a plan and stamps it onto the job (`job.qaStrategy`,
`job.qaRationaleKo`). The JobCard renders a 🧪 chip in the header.
**Nothing actually runs that strategy yet.** The job still flips to
`qa` after all tasks reviewed and waits for the manual "QA 통과" click.

Goal of this slice: make the chosen strategy actually execute, surface
a pass/fail signal on the job, and keep the manual gate as the final
override.

---

## What's already in place

### Catalog & strategist
- `orchestrator/lib/job-qa-strategist.js` — exports
  `selectQaStrategy({prdText, tasks, client, apiKey?, model?})` and the
  frozen `QA_STRATEGIES` catalog (5 ids).
- Strategy ids: `inline_per_task`, `final_route_smoke`, `visual_diff`,
  `lint_only`, `human_only`.
- Selection runs fire-and-forget inside the `approve-plan` handler in
  `orchestrator/server.js`. Failures fall back to `human_only`.

### Storage
- `orchestrator/lib/job.js#setQaStrategy(jobId, {strategy, rationale_ko})`.
- Job model fields: `qaStrategy?`, `qaRationaleKo?` (persisted via the
  same disk-backed `state/jobs/*.json` mechanism as the rest of the
  job state).

### UI
- `playground-app/src/services/orchestrator-client.ts` exports
  `QaStrategyId` and the field on `Job`.
- `playground-app/src/editor/JobCard.tsx#QaStrategyChip` — renders
  `🧪 마무리` / `🧪 단계별` etc. with a hover tooltip carrying the LLM
  rationale.
- `targetRoute` (the LLM-picked URL the user should visit) is also
  stamped on jobs as of this session and surfaced via the
  "결과 페이지 열기 ↗" button in JobCard. Required input for
  `final_route_smoke`.

---

## What's missing — the core gap

Strategies are decided, never executed. Specifically:

1. **No runner module** that takes `(strategy, job, playground)` and
   produces a `{ passed: boolean, notes: string, evidence?: ... }`.
2. **No hook** between "all tasks reviewed → status `qa`" and "auto-run
   strategy → flip to `complete` or stay paused".
3. **No persistence** for the result. We need `job.qaAutoResult: {
   strategy, passed, notes, ranAt }` so the UI can show "🧪 자동 QA
   통과" or "🧪 자동 QA 실패: …".
4. **No headless browser** capability anywhere. The sandbox image has
   only Vite + opencode; no Playwright/Puppeteer. The orchestrator
   host has no Playwright either.

---

## Recommended architecture

### Where the headless browser runs

Two viable options. Pick **A** (host) for v1 — strictly easier ops.

**A. Host-side Playwright (recommended for v1)**
- `pnpm add -D @playwright/test` (or just `playwright`) at the
  orchestrator workspace level.
- Run `npx playwright install chromium` once at orchestrator boot or
  via a setup script.
- Targets `http://127.0.0.1:${pg.vitePort}${targetRoute}` — the same
  URL the iframe already loads.
- Pros: no sandbox image rebuild, no per-container browser footprint,
  one chromium install serves every playground.
- Cons: orchestrator host now needs ~300 MB chromium binary; install
  step adds time to first boot.

**B. Sandbox-side Playwright**
- Bake Playwright into `sandbox/Dockerfile`, add a supervisord entry
  to keep a chromium-headless service warm or spawn per-request.
- Pros: smoke runs in same network namespace as the dev server, no
  port plumbing.
- Cons: image rebuild for every existing playground; multi-hundred-MB
  per container memory; complex hot-patching.

Stick with **A**.

### Module layout

```
orchestrator/lib/
├── job-qa-strategist.js     # already exists (decision)
├── job-qa-runner.js          # NEW — dispatches to per-strategy adapter
└── qa-adapters/
    ├── final-route-smoke.js  # NEW — Playwright run against targetRoute
    ├── lint-only.js          # NEW — run tsc / eslint inside sandbox
    ├── inline-per-task.js    # stub for v1; see "future" below
    ├── visual-diff.js        # stub for v1
    └── human-only.js         # always passes (it's the manual default)
```

`job-qa-runner.js` interface:

```js
/**
 * @param {Job} job
 * @param {Playground} playground
 * @returns {Promise<{ passed: boolean, notes: string, evidence?: object }>}
 */
export async function runQaStrategy(job, playground) {
  const strategy = job.qaStrategy ?? 'human_only';
  const adapter = ADAPTERS[strategy] ?? ADAPTERS.human_only;
  return adapter(job, playground);
}
```

### Wiring into the FSM

Today's flow:
```
delegating → reviewing → ... → reviewing (last task pass) → qa → (manual) → complete
```

After this slice:
```
delegating → reviewing → ... → qa
                                ↓ (auto: runQaStrategy)
                               qaAutoResult stamped on job
                                ↓
                                ├── passed: true  → keep at `qa`, surface "🧪 자동 QA 통과" + manual button still works as the final human gate
                                └── passed: false → keep at `qa`, surface "🧪 자동 QA 실패: …" + offer "재실행" / "그대로 통과" / "전략 수정"
```

Manual `markQaPass` still exists and still flips `qa → complete`.
Auto-result is informational — it doesn't auto-promote past human
review. (We can revisit auto-promote on strategy = `lint_only` later
since lint is a high-confidence binary.)

### Hook point

In `orchestrator/server.js`, find the place where the runner moves
the last reviewed task and the job flips to `qa`. That's inside
`runJobInBackground` → after `runJobRunner` returns, the job state
should be either `qa` (success path) or `paused` (something blocked).
Add:

```js
const finalJob = getJob(jobId);
if (finalJob?.status === 'qa' && !finalJob.qaAutoResult) {
  // Fire-and-forget — keep the runner promise resolution clean.
  void runQaStrategyInBackground(jobId);
}
```

`runQaStrategyInBackground` mirrors `decomposeJobInBackground`: catches
errors, stamps result, never throws.

### State machine

Add to `orchestrator/lib/job.js`:

```js
export function setQaAutoResult(jobId, result) {
  // result = { passed, notes, ranAt, strategy }
  // No FSM transition — informational metadata.
}
```

No `JOB_TRANSITIONS` change needed.

---

## Per-strategy adapter v1 details

### `final_route_smoke` (highest priority)

Input: `playground.vitePort`, `job.targetRoute`.

```js
import { chromium } from 'playwright';

export async function finalRouteSmoke(job, playground) {
  if (!job.targetRoute) {
    return { passed: false, notes: 'targetRoute 없음 — 사람이 확인해주세요' };
  }
  const url = `http://127.0.0.1:${playground.vitePort}${job.targetRoute}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });
    if (!resp || !resp.ok()) {
      return { passed: false, notes: `HTTP ${resp?.status() ?? 'no-response'}` };
    }
    // Did the SPA actually render? Empty body or sign-in redirect = fail.
    const bodyChars = await page.evaluate(() => document.body.innerText.length);
    if (bodyChars < 50) {
      return { passed: false, notes: '페이지가 비어있음 (렌더 실패 가능)' };
    }
    if (page.url().includes('/sign-in')) {
      return { passed: false, notes: '로그인 페이지로 리다이렉트됨 (권한 가드 가능성)' };
    }
    if (consoleErrors.length) {
      return {
        passed: false,
        notes: `콘솔 에러 ${consoleErrors.length}건: ${consoleErrors[0].slice(0, 80)}`,
      };
    }
    return { passed: true, notes: '라우트 로드 + 렌더 + 콘솔 에러 없음 확인' };
  } finally {
    await browser.close();
  }
}
```

Catches today's actual bug (`allowedRoles` redirecting to sign-in)
without any extra logic — the `/sign-in` URL check handles it.

### `lint_only` (second priority)

Run `pnpm typecheck` + `pnpm lint` (or just `tsc --noEmit`) inside
the sandbox via `docker exec`. Capture stdout/stderr, parse exit code.

```js
const { stdout, stderr } = await execAsync(
  `docker exec ${pg.sandboxContainerName} sh -c "cd /workspace/msm-portal/js/msm-portal-web && pnpm tsc --noEmit"`,
  { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
);
```

Pass if exit 0; fail with the first 200 chars of stderr otherwise.
Cheap, no chromium needed.

### `human_only`

```js
export const humanOnly = async () => ({
  passed: true,
  notes: '사람이 직접 확인하는 전략입니다',
});
```

The `passed: true` is OK because manual `markQaPass` is still the
real gate. The "auto pass" indicator just unblocks any UI conditional
that wants to show "자동 QA 단계 끝났음".

### `visual_diff` (stretch)

Needs a baseline screenshot to diff against. Baseline can be:
- The playground at `baselineCommitSha` (if we keep it in sandbox via
  worktree)
- A separate `pre-job-screenshot.png` captured *right before* the
  first task runs (recommended — simpler)

Then after all tasks: capture `post-job-screenshot.png`, diff via
`pixelmatch` or `playwright-visual-comparisons`. Stub for v1, log
"visual_diff not implemented yet" and return passed=true.

### `inline_per_task` (stretch)

Runs after *each task review pass*, not at the end. Requires a hook
inside `job-runner.js#runJob`. Use `final_route_smoke` per task.
Issue: most tasks don't change a route — only the *last* one does. So
inline smoke is mostly redundant unless we make it task-scoped (each
task declares which route it affects).

Out of scope for v1.

---

## UI surface (small)

After `qaAutoResult` lands on the job:

`playground-app/src/services/orchestrator-client.ts` — add to `Job`:
```ts
qaAutoResult?: {
  strategy: QaStrategyId;
  passed: boolean;
  notes: string;
  ranAt: number;
};
```

`playground-app/src/editor/JobCard.tsx`:
- Below the QA strategy chip in the header, render a one-liner banner
  when `qaAutoResult` exists:
  - passed: `🧪 자동 QA 통과 — {notes}` (green)
  - failed: `🧪 자동 QA 실패: {notes}` (red) + "🔁 재실행" button
    that calls a new `POST /api/job/:id/rerun-qa` endpoint
- The existing manual `QA 통과 ✓` button stays — it's the human
  override.

---

## File-by-file plan

1. `pnpm add -w playwright` at repo root (orchestrator workspace).
2. `npx playwright install chromium` (probably wire it into a postinstall script or document for next session).
3. `orchestrator/lib/job-qa-runner.js` — dispatcher.
4. `orchestrator/lib/qa-adapters/` directory + adapter files.
5. `orchestrator/lib/job.js` — add `setQaAutoResult`.
6. `orchestrator/server.js` — call `runQaStrategyInBackground` after `runJobRunner` resolves; new `POST /api/job/:id/rerun-qa` route.
7. `playground-app/src/services/orchestrator-client.ts` — `Job.qaAutoResult` type, `rerunJobQa` helper.
8. `playground-app/src/editor/JobCard.tsx` — auto-result banner + 재실행 button.

Total: ~400-500 lines.

---

## Open questions / decisions to make

- **Auto-promote on strategy = lint_only pass?** A clean lint+typecheck pass is high-confidence; could automatically flip `qa → complete` for it. Risk: feels surprising. Default: NO, keep manual.
- **Rerun cost cap.** Each Playwright run = 1-2s + chromium boot. Cheap. But what if user spams 재실행 button? Add a 5-second debounce or just trust the user.
- **Sandbox network access.** `localhost:vitePort` from the orchestrator host works because docker exposes the port. Verify on the test rig (it's how the iframe already reaches the sandbox, so should be fine).
- **`networkidle` vs `domcontentloaded` wait condition.** networkidle is stricter — catches lazy-loaded data fetches. Probably the right choice; if it times out too often, fall back to `domcontentloaded` + a small `waitForTimeout(2000)`.
- **First-run chromium install latency.** ~30s to download + install. Run during orchestrator boot? Lazy on first QA run? Lazy + show "Playwright 설치 중..." status feels acceptable.

---

## Verification plan

After implementation:

1. Create a new playground, ship a tiny PRD that adds a route ("페이지 만들기 — 라우트 `/test-qa`, 제목 'Test QA' 표시").
2. Approve plan → strategist picks `final_route_smoke` (likely).
3. Tasks run, all reviewed, status flips to `qa`.
4. Auto-runner fires, hits the route, asserts content present, stamps `qaAutoResult.passed = true`.
5. JobCard shows green "🧪 자동 QA 통과" banner.
6. User clicks `QA 통과` to actually flip to `complete`.

Negative-path test: PRD that puts `allowedRoles: [WORKPLACE_OWNER]` on the route (we know this triggers the sign-in redirect bug). Auto-runner should detect `/sign-in` in URL and stamp `passed: false` with "로그인 페이지로 리다이렉트됨".

---

## How to pick this up next session

1. `git pull` main (this handoff doc is the marker).
2. Read `orchestrator/lib/job-qa-strategist.js` and the JobCard
   `QaStrategyChip` to understand the existing surface.
3. Start with `pnpm add playwright` + chromium install.
4. Implement `final-route-smoke.js` first (highest leverage; catches
   today's permission-gate bug). Stub the other adapters.
5. Wire the hook in `runJobInBackground`. Surface result in JobCard.
6. Test the negative path (allowedRoles sign-in redirect) before
   shipping — that's the regression QA was meant to prevent.

---

## Related context

- Today's session also shipped: chat persistence (server-side), plan
  editing (per-task ✎ + free-form feedback to decomposer), DS
  enforcement in agent prompt + reviewer, `targetRoute` auto-nav,
  branch viz history dialog. See git log for commit details.
- The "작업 다 됐다는데 화면에 안 보임" bug from today (job
  d912c046#5f41d16d) is exactly what `final_route_smoke` would have
  caught — the agent introduced a route with `allowedRoles:
  [WORKPLACE_OWNER]` and the sign-in redirect would have triggered
  the new sign-in URL guard above.
