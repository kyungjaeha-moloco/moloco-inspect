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
3. Pick the task count from the PRD's actual scope, not from a fixed range. A small tweak might be 1–2 tasks; a full feature with backend, UI, filters, history can easily be 8–12. Hard ceiling 15. Prefer more smaller tasks over fewer big ones.
4. Each task must be self-contained: a coding agent with no memory of other tasks must be able to finish it from the description alone.
5. \`dependsOn\` lists prior task IDs that must land first. Use sparingly — only when the later task *reads* or *mutates* what the earlier one produced. UI wiring after data layer is a legit dep; cosmetic tweaks in different files are independent.
6. IDs must be short kebab-case (t1, t2, ...), unique, and referenced correctly in dependsOn.

7. **Audience — CRITICAL**: titles and descriptions are read by a product manager / service architect who does NOT read code. Write in plain product language about what the user sees and can do. The coding agent will translate behavior into code on its own.
   - Title: 5–15 chars, plain product action. GOOD: "크리에이티브 리뷰 페이지 추가". BAD: "라우트 등록 및 레이아웃 스캐폴딩".
   - Description opens with the user-visible outcome ("이 작업이 끝나면 …가 보이고, …를 누를 수 있습니다."), then the behavior bullets.
   - **Forbidden jargon (translate into product behavior instead):** 라우트, 스캐폴딩, placeholder, fetching, mock, in-memory, wrapper, embed, MVP, API, hook, state, props, prop, scope, refactor, z-index, 포커스 트랩, render, component, DOM, ref. Avoid English code/library names too (useQuery, useState, etc.). It's fine to mention the file *area* by its user-facing name ("사이드바 메뉴", "테이블 첫 컬럼") instead of file path.
   - Avoid "범위 외" / "out of scope" callouts written in technical terms — say "이 단계에서는 …는 아직 동작하지 않습니다" instead.
   - Numbers, options, copy text the user sees ARE plain language and SHOULD appear (e.g. "Today / Yesterday / 최근 7일", 기본값, 정렬 기준).

8. Sub-requirement formatting:
   - When a task has 2+ distinct sub-requirements, structure the description as enumerated bullets using \`(1) ... (2) ... (3) ...\` markers so the UI can render them as a readable list. A single narrative paragraph is fine for simple tasks.
   - Use \`\\n\\n\` between logically separate paragraphs (outcome / requirements / what's not yet working). Avoid wall-of-text runs.
9. Language: detect the PRD's language and match it (Korean PRD → Korean tasks).
10. No task may touch package.json / lockfiles / CI config — those are out of scope for the sandbox pipeline.

11. **Target route** (optional, top-level): if the PRD explicitly creates or modifies a single user-visible URL path, output a top-level \`targetRoute\` string with that path so the UI can auto-open the result page when the job finishes. Examples: "/post-creative-review", "/dashboard". Skip the field entirely (don't emit \`null\`) when the work spans multiple pages, is purely backend, or doesn't have an obvious single landing URL. The path must start with "/". This is a hint for UX, not a hard route registration — getting it wrong only means the user has to click through the sidebar, no functional damage.

Schema:
\`\`\`json
{
  "targetRoute": "/post-creative-review",
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
 * @param {{
 *   client?: string,
 *   route?: string,
 *   model?: string,
 *   apiKey?: string,
 *   previousTasks?: Array<{ id: string, title: string, description: string, dependsOn?: string[] }>,
 *   userFeedback?: string
 * }} ctx — `previousTasks` is the prior decomposition the user just rejected
 * via "다시 계획 세우기". When present we instruct the LLM to produce a
 * strictly finer-grained breakdown so the second plan is actually
 * different from the first instead of the LLM emitting near-identical
 * tasks at temperature drift. `userFeedback` is the free-form natural-
 * language note the user typed asking for specific structural changes
 * (e.g. "split task 3 into search vs filter", "add a permissions task")
 * — when set we surface it verbatim with explicit instructions to
 * honor it.
 * @returns {Promise<{
 *   tasks: Array<{ id: string, title: string, description: string, dependsOn: string[] }>,
 *   targetRoute?: string,
 * }>}
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

  // Re-plan path: the user already saw a plan and clicked "다시 계획
  // 세우기". Without this hint the LLM at our default temperature tends
  // to emit near-identical breakdowns on the second pass. Showing the
  // rejected plan + an explicit "produce a meaningfully different
  // breakdown" instruction is what makes the second plan actually
  // differ.
  let previousBlock = '';
  const prev = Array.isArray(ctx.previousTasks) ? ctx.previousTasks : [];
  if (prev.length) {
    const summary = prev
      .map((t, i) => `${i + 1}. ${t.title}`)
      .join('\n');
    previousBlock =
      `Previous breakdown (user rejected — wants you to re-plan):\n` +
      `${summary}\n\n` +
      `Re-plan: produce a *meaningfully different* breakdown. Boundaries, ordering, and scope of each task should differ from the previous list — do NOT just rename or re-order. ` +
      `Lean toward a finer-grained plan (more, smaller tasks) when scope allows. ` +
      `If the prior plan packed multiple sub-features into one task, this is your cue to split them. ` +
      `If the prior plan was already minimal, change the boundaries (e.g. swap which task owns which sub-step) so the user gets a real alternative.\n\n`;
  }

  // Free-form user feedback on a prior plan ("3번을 둘로 쪼개고 권한
  // 가드 task 빼줘" 등). Distinct from `previousTasks` because feedback
  // can come without a "다시 계획" click — e.g. user types directly into
  // the "이 계획에 수정 요청" box. Surfaced verbatim with strict honor
  // language so the LLM treats it as a hard constraint rather than a
  // suggestion.
  const feedbackBlock =
    typeof ctx.userFeedback === 'string' && ctx.userFeedback.trim()
      ? `User feedback on the plan (must honor — this overrides defaults):\n${ctx.userFeedback.trim()}\n\n`
      : '';

  const userMessage = `${contextBlock}${previousBlock}${feedbackBlock}PRD:\n${prdText.trim()}`;

  const resp = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      // 8192 comfortably fits 15 tasks with verbose Korean descriptions;
      // smaller caps were truncating mid-JSON on larger PRDs (symptom:
      // the closing ``` fence never lands, the regex below fails to
      // match, and the job pauses with 'missing JSON block').
      max_tokens: 8192,
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
  if (parsed.tasks.length > 15) {
    // Trim silently at the hard ceiling — user can delete extras in
    // the UI if 15 is somehow still too many for a single PRD.
    parsed.tasks = parsed.tasks.slice(0, 15);
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

  // Optional top-level `targetRoute` — only accept if it's a string
  // starting with "/" to avoid storing junk. Anything else (null,
  // undefined, "TBD", missing field) → the caller falls back to
  // showing the user the workspace tab without an auto-nav prompt.
  let targetRoute;
  if (
    typeof parsed.targetRoute === 'string' &&
    parsed.targetRoute.trim().startsWith('/')
  ) {
    targetRoute = parsed.targetRoute.trim();
  }

  return { tasks, targetRoute };
}
