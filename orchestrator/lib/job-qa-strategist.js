/**
 * QA strategy selector (J6).
 *
 * After the user approves a task plan, the orchestrator picks ONE QA
 * strategy from a fixed catalog based on the PRD + task list shape.
 * Strategy choice drives:
 *   - WHEN QA runs (between every task vs once at the end vs never).
 *   - WHAT QA does (Playwright route smoke vs visual diff vs lint-only
 *     vs human-only).
 *
 * v0 only stamps the choice + rationale onto the job record so the UI
 * can show the user "we picked X because Y". Actually executing each
 * strategy lives in `lib/job-qa-runner.js` (next slice). The catalog
 * here is the source of truth — id, ko-label, when-to-use blurbs.
 *
 * Failure modes: LLM returns garbage / unreachable / API key missing.
 * Caller wraps in try/catch and falls back to `human_only` (the
 * existing default v0 behavior — manual QA pass button) if anything
 * goes wrong, so the job pipeline never blocks on the strategist.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Strategy catalog — keep this list narrow on purpose. The LLM picks
 * one id; the UI renders the label + description; the executor (next
 * slice) maps id → adapter. Adding a strategy means: extend this
 * catalog + (later) add an adapter.
 *
 * @typedef {'inline_per_task' | 'final_route_smoke' | 'visual_diff' | 'lint_only' | 'human_only' | 'agent_review'} QaStrategyId
 */
export const QA_STRATEGIES = Object.freeze([
  {
    id: 'agent_review',
    label: 'Agent comprehensive review (recommended)',
    when:
      'General case where an LLM needs to comprehensively judge whether the PRD intent was actually implemented. Playwright collects a result-page screenshot + console errors + diff and passes them to Claude via vision to decide "does the result match the PRD" in one shot. Checks both visual and logical correctness.',
  },
  {
    id: 'inline_per_task',
    label: 'Verify after each task',
    when:
      'Multiple tasks depend on each other sequentially and one bad step breaks everything downstream (e.g. data → table → filter → action chain). Automatic smoke test right after each task.',
  },
  {
    id: 'final_route_smoke',
    label: 'Route smoke only (lightweight)',
    when:
      'Lightweight case where it suffices to verify the new route returns 200. One Playwright call (no LLM call). Fast and free.',
  },
  {
    id: 'visual_diff',
    label: 'Visual regression diff',
    when:
      'Case where an existing screen is subtly modified (color / copy / layout tweaks). Before/after screenshot comparison catches unintended visual regressions. (Currently a stub — use only when actually implemented.)',
  },
  {
    id: 'lint_only',
    label: 'Type-check / lint only',
    when:
      'Business-logic-heavy change where UI behavior barely changes (helper functions, data transforms, constants). Pass TypeScript + ESLint and skip human QA.',
  },
  {
    id: 'human_only',
    label: 'Manual verification',
    when:
      "UX / accessibility / usability change that's hard to catch via automation (e.g. modal flow, form validation messages). No auto-QA — user manually verifies from the in-progress tab and marks pass.",
  },
]);

const STRATEGY_IDS = QA_STRATEGIES.map((s) => s.id);

export const SYSTEM_PROMPT = `You are a QA strategist for a low-code playground that turns product requests into UI changes via a coding agent. After tasks are decomposed but before they run, your job is to pick ONE QA strategy from a fixed catalog so the orchestrator knows when and how to verify the work.

Strategies (you must pick exactly one id from this list):

${QA_STRATEGIES.map(
  (s) => `- ${s.id}: ${s.label} — ${s.when}`,
).join('\n')}

Decision heuristics (in priority order — pick the first one that matches):
- DEFAULT for any visible UI change (new feature, badge, label, layout, color, route): agent_review. This is the highest-coverage option — captures a screenshot + diff + console errors and asks an LLM "does this match the PRD". Picks up most footguns including blank screens, sign-in redirects, scope creep, and visual mismatches.
- Pure data layer / helper / constant changes with NO visible UI delta → lint_only.
- UX flow / accessibility / error message wording / modal interaction (where automated visual judgment is unreliable) → human_only.
- Quick smoke only ("just check the new page returns 200, don't pay for an LLM review"): final_route_smoke. Use sparingly — agent_review is almost always more useful.
- inline_per_task / visual_diff are stubs at the moment; only pick them when the user's PRD explicitly asks for that workflow.

**Language rule (critical):** ALWAYS write \`rationale\` in English regardless of the input language. The PRD or task list may be Korean; your rationale string is still English.

Output a single fenced \`\`\`json block with this exact shape — no prose:
\`\`\`json
{ "strategy": "<one of: ${STRATEGY_IDS.join(' | ')}>", "rationale": "<one English sentence, ≤120 chars, explaining why this strategy>" }
\`\`\``;

/**
 * @param {{
 *   prdText: string,
 *   tasks: Array<{ id: string, title: string, description: string }>,
 *   client?: string,
 *   apiKey?: string,
 *   model?: string,
 * }} input
 * @returns {Promise<{ strategy: QaStrategyId, rationale: string }>}
 */
export async function selectQaStrategy(input) {
  const { prdText, tasks, client, apiKey: ctxKey, model: ctxModel } = input;
  if (!prdText || typeof prdText !== 'string') {
    throw new Error('prdText required');
  }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('tasks required (non-empty)');
  }
  const apiKey =
    ctxKey ||
    process.env.ANTHROPIC_API_KEY ||
    (process.env.SANDBOX_API_KEY && process.env.SANDBOX_API_KEY.startsWith('sk-ant-')
      ? process.env.SANDBOX_API_KEY
      : null);
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const model = ctxModel || process.env.PLAN_MODEL || 'claude-sonnet-4-20250514';

  const taskList = tasks
    .map((t, i) => `${i + 1}. ${t.title}\n   ${t.description.slice(0, 200)}`)
    .join('\n\n');
  const userMessage = [
    client ? `Target client: ${client}` : null,
    '',
    'PRD:',
    prdText.trim(),
    '',
    `Approved task plan (${tasks.length} task${tasks.length > 1 ? 's' : ''}):`,
    taskList,
  ]
    .filter((line) => line !== null)
    .join('\n');

  const resp = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!resp.ok) {
    throw new Error(`LLM ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  }
  const result = await resp.json();
  const text = (result.content?.[0]?.text || '').trim();
  if (!text) throw new Error('empty LLM response');

  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  const bare = !fenced && text.startsWith('{') ? text : null;
  const raw = fenced ? fenced[1] : bare;
  if (!raw) throw new Error(`missing JSON block: ${text.slice(0, 120)}`);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`JSON parse failed: ${err.message}`);
  }
  const strategy = parsed?.strategy;
  if (!STRATEGY_IDS.includes(strategy)) {
    throw new Error(`invalid strategy: ${strategy}`);
  }
  // Back-compat: accept legacy `rationale_ko` if the model still emits it.
  // New prompt asks for `rationale`; old cached completions may not have flipped yet.
  const rationaleRaw = parsed?.rationale ?? parsed?.rationale_ko;
  const rationale =
    typeof rationaleRaw === 'string' ? rationaleRaw.trim().slice(0, 200) : '';
  return { strategy, rationale };
}
