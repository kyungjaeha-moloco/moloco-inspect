/**
 * PRD → task graph decomposer (J2).
 *
 * Plan: docs/superpowers/plans/2026-04-24-prd-to-delivery-thin-slice-v2.md §4 J2
 *
 * One-shot LLM call: PRD text + playground context → Task[] with
 * `dependsOn` edges. No `patternHint` / `targetFile` auto-generation
 * (scope-cut in v0); the user edits target hints manually before
 * approving.
 *
 * Fails loud on malformed LLM output — no auto-fix loop. If the
 * LLM returns garbage the caller surfaces the error and the user
 * edits / cancels.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You break a product request (PRD, bug report, or free-form feature ask) into a small ordered list of implementation tasks. The code will be modified by a separate coding agent per task; your job is only to plan.

Rules:
1. Output JSON only — one fenced \`\`\`json block, nothing else. No prose before or after.
2. **Task size — CRITICAL**: each task must be completable in ONE agent run (≤3 files edited, ≤~200 lines of diff). A single coding agent executes each task in isolation with a bounded token/turn budget. If a task includes multiple sub-features (e.g. "build the table + add filters + add search + handle error states"), SPLIT it. Err on the side of more, smaller tasks rather than fewer, larger ones. A failing task blocks the whole pipeline.
   - Rule of thumb: a task = "add one component", "wire one API call", "add one filter control". Not "build a whole screen".
3. 2–5 tasks. Prefer more smaller tasks over fewer big ones. Hard ceiling 5.
4. Each task must be self-contained: a coding agent with no memory of other tasks must be able to finish it from the description alone.
5. \`dependsOn\` lists prior task IDs that must land first. Use sparingly — only when the later task *reads* or *mutates* what the earlier one produced. UI wiring after data layer is a legit dep; cosmetic tweaks in different files are independent.
6. IDs must be short kebab-case (t1, t2, ...), unique, and referenced correctly in dependsOn.
7. Descriptions are written in the user's language (detect from the PRD) and include enough context for a fresh agent: what file/area if obvious, what behavior to change, what to leave alone.
   - When a task has 2+ distinct sub-requirements, structure the description as enumerated bullets using \`(1) ... (2) ... (3) ...\` markers so the UI can render them as a readable list. A single narrative paragraph is fine for simple tasks.
   - Use \`\\n\\n\` between logically separate paragraphs (context / requirements / explicit out-of-scope notes). Avoid wall-of-text runs.
8. No task may touch package.json / lockfiles / CI config — those are out of scope for the sandbox pipeline.

Schema:
\`\`\`json
{
  "tasks": [
    {
      "id": "t1",
      "title": "short title",
      "description": "imperative description with enough context for a fresh agent",
      "dependsOn": []
    }
  ]
}
\`\`\``;

/**
 * @param {string} prdText
 * @param {{ client?: string, route?: string, model?: string, apiKey?: string }} ctx
 * @returns {Promise<Array<{ id: string, title: string, description: string, dependsOn: string[] }>>}
 */
export async function decomposePrd(prdText, ctx = {}) {
  if (typeof prdText !== 'string' || !prdText.trim()) {
    throw new Error('prdText required');
  }
  const apiKey =
    ctx.apiKey ||
    process.env.ANTHROPIC_API_KEY ||
    (process.env.SANDBOX_API_KEY && process.env.SANDBOX_API_KEY.startsWith('sk-ant-')
      ? process.env.SANDBOX_API_KEY
      : null);
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const model = ctx.model || process.env.PLAN_MODEL || 'claude-sonnet-4-20250514';

  const contextLines = [];
  if (ctx.client) contextLines.push(`Target client: ${ctx.client}`);
  if (ctx.route) contextLines.push(`Target route (current iframe): ${ctx.route}`);
  const contextBlock = contextLines.length
    ? `Context:\n${contextLines.join('\n')}\n\n`
    : '';

  const userMessage = `${contextBlock}PRD:\n${prdText.trim()}`;

  const resp = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      // 4096 covers 5 tasks with verbose Korean descriptions comfortably;
      // 2048 was getting truncated mid-JSON on larger PRDs (symptom: the
      // closing ``` fence never lands, the regex below fails to match,
      // and the job pauses with 'missing JSON block').
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`LLM ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const result = await resp.json();
  const text = (result.content?.[0]?.text || '').trim();
  if (!text) throw new Error('empty LLM response');

  // Extract JSON. Try three forms:
  //   1. Properly fenced — ```json { ... } ```.
  //   2. Open fence but no closing fence (max_tokens cut off mid-stream
  //      before the trailing ```). Strip the opening fence and trust
  //      the parser to reject broken JSON downstream.
  //   3. Raw object with no fence.
  // The LLM occasionally emits extra prose before the fence; we always
  // anchor on the *last* `{` that can plausibly start a `{ "tasks": ...
  // }` block to tolerate that.
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  const openFenceOnly = !fenced && text.match(/```(?:json)?\s*(\{[\s\S]*)$/i);
  const bareObject = text.trim().startsWith('{') ? text.trim() : null;
  const rawJson = fenced ? fenced[1] : (openFenceOnly ? openFenceOnly[1] : bareObject);
  if (!rawJson) {
    throw new Error(`LLM response missing JSON block: ${text.slice(0, 120)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    throw new Error(`LLM JSON parse failed: ${err.message}`);
  }
  if (!parsed || !Array.isArray(parsed.tasks)) {
    throw new Error('LLM response missing `tasks` array');
  }
  if (parsed.tasks.length === 0) {
    throw new Error('LLM returned zero tasks — PRD likely too vague');
  }
  if (parsed.tasks.length > 5) {
    // Trim silently — the system prompt says max 5 but don't fail on
    // a friendly over-shoot; user can delete extras in the UI.
    parsed.tasks = parsed.tasks.slice(0, 5);
  }

  // Shape validation. dependsOn cross-ref check is done by
  // `setJobTasks` (job.js); we just normalise here.
  /** @type {Array<{ id: string, title: string, description: string, dependsOn: string[] }>} */
  const tasks = parsed.tasks.map((t, idx) => {
    if (!t || typeof t !== 'object') {
      throw new Error(`task ${idx} is not an object`);
    }
    const id = typeof t.id === 'string' ? t.id.trim() : '';
    const title = typeof t.title === 'string' ? t.title.trim() : '';
    const description = typeof t.description === 'string' ? t.description.trim() : '';
    if (!id || !title || !description) {
      throw new Error(`task ${idx} missing id / title / description`);
    }
    const dependsOn = Array.isArray(t.dependsOn)
      ? t.dependsOn.filter((d) => typeof d === 'string' && d.trim()).map((d) => d.trim())
      : [];
    return { id, title, description, dependsOn };
  });

  return tasks;
}
