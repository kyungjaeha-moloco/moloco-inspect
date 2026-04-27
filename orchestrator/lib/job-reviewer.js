/**
 * Per-task diff reviewer (J4).
 *
 * Plan: docs/superpowers/plans/2026-04-24-prd-to-delivery-thin-slice-v2.md §4 J4
 *
 * Second LLM pass: given a task's description + the diff that landed
 * for it, does the diff match the intent? Binary verdict (pass/fail,
 * no tri-state per v2 §5 scope-cut).
 *
 * Fails soft: any network/LLM error surfaces as `verdict: 'fail'` with
 * the error in `notes`. The runner handles that by pausing — the user
 * sees the reason and decides accept / retry / skip.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are a code reviewer. Given a task description and the diff that landed for that task, decide whether the diff fulfils the task.

Rules:
1. Output JSON only — one fenced \`\`\`json block, nothing else.
2. \`verdict\` is exactly "pass" or "fail". No other values. No "needs-work", no "partial".
3. "pass" means: the diff plausibly accomplishes what the task asked for. Minor cosmetic imperfections are fine — that's for human QA.
4. "fail" means: the diff is empty, touches unrelated files, breaks the stated intent, or is clearly incomplete (e.g. added a button but didn't wire its click handler).
5. \`notes\` is one short sentence (≤150 chars) explaining the verdict. No verbose rationale.
6. Do not invent issues. If you'd pass it in a normal PR review, pass it here.
7. Design system check — fail if the diff introduces *new* hand-rolled UI that this codebase has a canonical equivalent for, e.g. raw \`<button>\` instead of \`MCButton2\` from \`@moloco/moloco-cloud-react-ui\`, raw \`<table><tr><td>\` instead of the table cell-renderer pattern under \`src/common/component/table/\`, hand-colored status pills instead of \`MCStatus\`, or hand-built modals instead of \`src/common/component/dialog/\`. Modifying existing raw markup is fine; *introducing* new raw markup when the codebase clearly already uses a wrapper is the failure mode. Note must explicitly call out which DS component should have been used.

Schema:
\`\`\`json
{ "verdict": "pass", "notes": "..." }
\`\`\``;

/**
 * @param {{ id: string, title: string, description: string }} task
 * @param {string} diff
 * @param {{ model?: string, apiKey?: string }} [ctx]
 * @returns {Promise<{ verdict: 'pass' | 'fail', notes: string }>}
 */
export async function reviewTaskDiff(task, diff, ctx = {}) {
  // Empty-diff fast path: no need to spend an LLM call when there's
  // nothing to review. This also covers `no_change_needed` outcomes
  // from the change-request pipeline, which the runner surfaces as
  // an empty diff.
  if (!diff || !diff.trim()) {
    return {
      verdict: 'fail',
      notes: 'Empty diff — the task produced no code changes.',
    };
  }

  const apiKey =
    ctx.apiKey ||
    process.env.ANTHROPIC_API_KEY ||
    (process.env.SANDBOX_API_KEY && process.env.SANDBOX_API_KEY.startsWith('sk-ant-')
      ? process.env.SANDBOX_API_KEY
      : null);
  if (!apiKey) {
    // Surface as a soft fail so the runner pauses — orchestrator op
    // issue, not the user's task.
    return {
      verdict: 'fail',
      notes: 'ANTHROPIC_API_KEY not configured on the orchestrator.',
    };
  }

  const model = ctx.model || process.env.REVIEW_MODEL || process.env.PLAN_MODEL || 'claude-sonnet-4-20250514';

  // Keep the diff bounded. Huge diffs burn tokens and tell the reviewer
  // nothing useful — if the task produced >100k chars of diff something
  // is wrong anyway.
  const DIFF_CAP = 80_000;
  const capped = diff.length > DIFF_CAP
    ? `${diff.slice(0, DIFF_CAP)}\n\n[...truncated ${diff.length - DIFF_CAP} chars...]`
    : diff;

  const userMessage = `Task: ${task.title}

Description:
${task.description}

Diff:
\`\`\`diff
${capped}
\`\`\``;

  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return {
        verdict: 'fail',
        notes: `LLM ${resp.status}: ${errText.slice(0, 120)}`,
      };
    }
    const result = await resp.json();
    const text = (result.content?.[0]?.text || '').trim();
    const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    const rawJson = fenced ? fenced[1] : (text.startsWith('{') ? text : null);
    if (!rawJson) {
      return { verdict: 'fail', notes: `LLM output missing JSON: ${text.slice(0, 80)}` };
    }
    const parsed = JSON.parse(rawJson);
    if (parsed.verdict !== 'pass' && parsed.verdict !== 'fail') {
      return { verdict: 'fail', notes: `LLM returned unknown verdict: ${parsed.verdict}` };
    }
    const notes = typeof parsed.notes === 'string' ? parsed.notes.slice(0, 200) : '';
    return { verdict: parsed.verdict, notes };
  } catch (err) {
    return {
      verdict: 'fail',
      notes: `reviewer error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
