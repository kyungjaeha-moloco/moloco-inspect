#!/usr/bin/env node
/**
 * Synthetic verification of agent_review LLM judgment.
 *
 * Why: full e2e (job → decompose → run → QA) takes 10-30 min per case.
 * We just want to confirm the LLM correctly fails on the negative paths
 * the SYSTEM_PROMPT enumerates (sign-in redirect / blank screen /
 * scope-creep delete) and passes on a clean implementation.
 *
 * What this DOES: replays the same call shape `agent-review.js#agentReview`
 * makes — same SYSTEM_PROMPT, same user message structure (text + optional
 * screenshot placeholder) — but with fabricated evidence per case.
 *
 * What this DOES NOT: capture real screenshots / diff. We feed text-only
 * evidence; the prompt still triggers because the model's verdict
 * primarily reads `Final URL` / body text / diff sections.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... node orchestrator/scripts/verify-agent-review.mjs
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// Mirror of agent-review.js#SYSTEM_PROMPT (kept inline so the script
// doesn't depend on that file's runtime).
const SYSTEM_PROMPT = `You are a QA reviewer for Moloco Inspect — a low-code playground that turns PRD-style change requests into actual UI implementations via a coding agent.

Inputs you receive (in the user message):
- The original PRD (what the user asked for).
- The cumulative git diff across every commit this job landed.
- A screenshot of the result page after all tasks completed.
- Telemetry: HTTP status, final URL after navigation, console errors, page errors, first ~2000 chars of rendered body text.

Your job: judge whether the implementation actually satisfies the PRD intent.

PASS criteria (all must hold):
- The intended UI change is *visible* in the screenshot OR clearly present in the diff (the screenshot may not always show every change — e.g. backend-shape PRDs).
- The route loaded with HTTP 2xx and didn't redirect to /sign-in (a sign-in redirect means a permission gate is blocking the result page — almost always a regression).
- No console/page errors block rendering (a stray warning is fine; an actual blank-screen error is not).
- The diff stays within reasonable scope of the PRD (deleting unrelated routes, components, i18n keys is FAIL even if the headline change works).

FAIL examples:
- 200 OK but body is empty / shows only "<div id='root'></div>" → render failed.
- Final URL contains /sign-in → permission gate regression.
- Diff includes scope-creep deletes ("removed Post Creative Review feature" while adding a header badge).
- Screenshot shows the wrong color, missing label, broken layout, or default placeholder text.

Output a single fenced \`\`\`json\`\`\` block with this exact shape — no prose outside the fence:
\`\`\`json
{
  "passed": true | false,
  "notes": "한국어 1~2문장, 200자 이내, 사용자가 통과/실패 사유를 한눈에 알 수 있게."
}
\`\`\``;

const MODEL =
  process.env.QA_REVIEW_MODEL ||
  process.env.PLAN_MODEL ||
  'claude-sonnet-4-5-20250929';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY not set');
  process.exit(2);
}

/**
 * @typedef {object} Case
 * @property {string} name
 * @property {string} prd
 * @property {string} targetRoute
 * @property {number} httpStatus
 * @property {string} finalUrl
 * @property {string} bodyText
 * @property {string[]} consoleErrors
 * @property {string[]} pageErrors
 * @property {string} diff
 * @property {boolean} expectedPassed
 * @property {string} expectedRationale
 */

/** @type {Case[]} */
const CASES = [
  {
    name: '🟢 positive — clean admin stats page implementation',
    prd:
      'TAS 사이드바에 "통계" 메뉴 추가, 클릭 시 /stats 페이지 노출. ' +
      '페이지 안에는 제목 "통계" + 안내문구 "곧 컨텐츠가 추가됩니다".',
    targetRoute: '/stats',
    httpStatus: 200,
    finalUrl: 'http://localhost:5173/stats',
    bodyText:
      '<html><body><div id="root"><div class="layout"><nav class="sidebar">' +
      '<a href="/orders">주문</a><a href="/stats">통계</a></nav>' +
      '<main><h1>통계</h1><p>곧 컨텐츠가 추가됩니다</p></main></div></div></body></html>',
    consoleErrors: [],
    pageErrors: [],
    diff: `
 src/apps/tving/routes.ts | 4 ++++
 src/apps/tving/pages/StatsPage.tsx | 12 ++++++++++++
 src/apps/tving/i18n/strings.ko.json | 1 +
 3 files changed, 17 insertions(+)
---
+++ b/src/apps/tving/pages/StatsPage.tsx
@@ +1,12 @@
+export function StatsPage() {
+  return (
+    <div>
+      <h1>통계</h1>
+      <p>곧 컨텐츠가 추가됩니다</p>
+    </div>
+  );
+}
`,
    expectedPassed: true,
    expectedRationale: '통계 페이지가 정상 노출, scope 일치',
  },
  {
    name: '🔴 negative — sign-in redirect (permission guard regression)',
    prd:
      'TAS 사이드바에 "관리자 통계" 메뉴 추가, 클릭 시 /admin/stats 노출. ' +
      '제목 "관리자 통계" + 안내문구 "곧 컨텐츠가 추가됩니다".',
    targetRoute: '/admin/stats',
    httpStatus: 200,
    finalUrl: 'http://localhost:5173/sign-in?redirect=/admin/stats',
    bodyText:
      '<html><body><div id="root"><div class="signin-page"><h1>Sign in</h1>' +
      '<form><input type="email" placeholder="email"/><input type="password"/>' +
      '<button>Sign in</button></form></div></div></body></html>',
    consoleErrors: [],
    pageErrors: [],
    diff: `
 src/apps/tving/routes.ts | 4 ++++
 src/apps/tving/pages/AdminStatsPage.tsx | 14 ++++++++++++++
 2 files changed, 18 insertions(+)
---
+++ b/src/apps/tving/routes.ts
+  { path: '/admin/stats', element: <AdminStatsPage />, allowedRoles: ['admin'] },
+++ b/src/apps/tving/pages/AdminStatsPage.tsx
@@ +1,14 @@
+export function AdminStatsPage() {
+  return (
+    <div>
+      <h1>관리자 통계</h1>
+      <p>곧 컨텐츠가 추가됩니다</p>
+    </div>
+  );
+}
`,
    expectedPassed: false,
    expectedRationale: '/sign-in 으로 리다이렉트 = 권한 가드 차단',
  },
  {
    name: '🔴 negative — blank render (200 OK but body empty)',
    prd:
      'TAS 사이드바에 "도움말" 메뉴 추가, /help 페이지 안내문구.',
    targetRoute: '/help',
    httpStatus: 200,
    finalUrl: 'http://localhost:5173/help',
    bodyText: '<html><body><div id="root"></div></body></html>',
    consoleErrors: [
      'Uncaught TypeError: Cannot read properties of undefined (reading "map") at HelpPage.tsx:7:18',
    ],
    pageErrors: [
      'TypeError: Cannot read properties of undefined (reading "map")',
    ],
    diff: `
 src/apps/tving/routes.ts | 3 +++
 src/apps/tving/pages/HelpPage.tsx | 8 ++++++++
 2 files changed, 11 insertions(+)
`,
    expectedPassed: false,
    expectedRationale: '빈 root + render error → 페이지가 안 그려짐',
  },
  {
    name: '🔴 negative — scope-creep delete',
    prd: 'TAS 헤더에 BETA 라벨 추가.',
    targetRoute: '/',
    httpStatus: 200,
    finalUrl: 'http://localhost:5173/',
    bodyText:
      '<html><body><div id="root"><header><span class="logo">MSM Portal</span>' +
      '<span class="badge-beta">BETA</span></header><main>...</main></div></body></html>',
    consoleErrors: [],
    pageErrors: [],
    diff: `
 src/apps/tving/components/Header.tsx | 4 ++++
 src/apps/tving/routes.ts | 12 ------------
 src/apps/tving/pages/PostCreativeReviewPage.tsx | 0
 3 files changed, 4 insertions(+), 12 deletions(-)
---
+++ b/src/apps/tving/components/Header.tsx
+  <span className="badge-beta">BETA</span>
--- a/src/apps/tving/routes.ts
-  { path: '/post-creative-review', element: <PostCreativeReviewPage /> },
-  { path: '/post-creative-review/queue', element: <QueuePage /> },
-  { path: '/post-creative-review/history', element: <HistoryPage /> },
... (lots more deletes)
`,
    expectedPassed: false,
    expectedRationale: 'BETA 라벨 추가했지만 무관한 라우트들 통째로 삭제 = scope creep',
  },
];

function buildUserMessage(c) {
  return [
    `PRD:`,
    c.prd,
    ``,
    `Target route: ${c.targetRoute}`,
    `HTTP status: ${c.httpStatus}`,
    `Final URL: ${c.finalUrl}`,
    ``,
    `Body text (first 2000 chars):`,
    c.bodyText,
    ``,
    `Console errors (${c.consoleErrors.length}):`,
    c.consoleErrors.length
      ? c.consoleErrors.map((e) => `- ${e}`).join('\n')
      : '(none)',
    ``,
    `Page errors (${c.pageErrors.length}):`,
    c.pageErrors.length
      ? c.pageErrors.map((e) => `- ${e}`).join('\n')
      : '(none)',
    ``,
    `Cumulative diff (baseline..HEAD):`,
    c.diff,
  ].join('\n');
}

async function runCase(c) {
  const userText = buildUserMessage(c);
  const resp = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: [{ type: 'text', text: userText }] },
      ],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    return { error: `http ${resp.status}: ${t.slice(0, 200)}` };
  }
  const data = await resp.json();
  const text = (data.content?.[0]?.text || '').trim();
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  const bare = !fenced && text.startsWith('{') ? text : null;
  const raw = fenced ? fenced[1] : bare;
  if (!raw) return { error: 'no JSON in response', text };
  try {
    const parsed = JSON.parse(raw);
    return { passed: !!parsed.passed, notes: String(parsed.notes ?? '') };
  } catch (err) {
    return { error: `parse fail: ${err.message}`, text };
  }
}

async function main() {
  console.log(`Model: ${MODEL}\n`);
  let pass = 0;
  let fail = 0;
  for (const c of CASES) {
    process.stdout.write(`${c.name}\n  expected passed=${c.expectedPassed} (${c.expectedRationale})\n  → calling Claude... `);
    const t0 = Date.now();
    const res = await runCase(c);
    const ms = Date.now() - t0;
    if (res.error) {
      console.log(`ERROR ${ms}ms\n    ${res.error}\n`);
      fail++;
      continue;
    }
    const matches = res.passed === c.expectedPassed;
    console.log(`${matches ? '✅ MATCH' : '❌ MISMATCH'} ${ms}ms`);
    console.log(`    actual: passed=${res.passed} notes="${res.notes}"`);
    if (matches) pass++;
    else fail++;
    console.log('');
  }
  console.log(`\nResults: ${pass}/${CASES.length} cases matched expectation.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(2);
});
