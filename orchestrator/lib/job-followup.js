// orchestrator/lib/job-followup.js
//
// Plan v3 (auto-progress) §4.4 G6 — follow-up PRD suggestions for the job
// final-summary card. Called lazily by the 3 surfaces when the user actually
// views the summary. Cached per-job after the first successful response so
// subsequent visits skip the LLM cost.
//
// Failure modes (network, parse, missing key) return [] — the surface shows a
// "no suggestions" hint rather than blocking the user.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const FOLLOWUP_TIMEOUT_MS = 20_000;

const SYSTEM_PROMPT = `You are a planning assistant for a PM-facing tool. Given a recently completed job's review-warning list and the files it changed, propose 1-3 short follow-up PRDs the PM can send to clean up the warnings.

Output JSON only — one fenced \`\`\`json block, nothing else. Schema:
{
  "suggestions": [
    { "text": "<≤50 chars, imperative, English>", "intent_hint": "<one of: copy_update | spacing_adjustment | token_alignment | component_swap | layout_adjustment | state_handling | accessibility_improvement | new_page | new_feature | data_display_change | form_field_addition | bulk_operation>" }
  ]
}

Rules:
- Each text MUST be ≤ 50 characters (Slack interactive button hard cap).
- Imperative voice — start with a verb: "Replace", "Migrate", "Clean up", "Audit", "Add", "Convert".
- 1-3 suggestions. Fewer is better than padding.
- Skip suggestions that just restate the warning verbatim — synthesize.
- If the warnings overlap (e.g. multiple hand-rolled buttons across files), prefer one bundled suggestion over duplicates.`;

/**
 * @typedef {Object} FollowupSuggestion
 * @property {string} text
 * @property {string} intent_hint
 */

/**
 * @param {{
 *   warnings: Array<{ title: string, notes: string, isNewBuild?: boolean }>,
 *   warningCount: number,
 *   changedFiles?: string[],
 *   total?: number,
 * }} summary
 * @param {{ model?: string, apiKey?: string, timeoutMs?: number, fetchImpl?: typeof fetch }} [ctx]
 * @returns {Promise<FollowupSuggestion[]>}
 */
export async function generateFollowupSuggestions(summary, ctx = {}) {
  // Plan v3 §4.4 momus I2 — warningCount=0 skips the LLM entirely.
  if (!summary || !Array.isArray(summary.warnings) || summary.warnings.length === 0) {
    return [];
  }

  const apiKey =
    ctx.apiKey ||
    process.env.ANTHROPIC_API_KEY ||
    (process.env.SANDBOX_API_KEY && process.env.SANDBOX_API_KEY.startsWith('sk-ant-')
      ? process.env.SANDBOX_API_KEY
      : null);
  if (!apiKey) return [];

  const model = ctx.model || process.env.FOLLOWUP_MODEL || 'claude-sonnet-4-20250514';
  const timeoutMs = ctx.timeoutMs ?? FOLLOWUP_TIMEOUT_MS;
  const fetchImpl = ctx.fetchImpl ?? fetch;

  const userMessage = buildUserMessage(summary);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetchImpl(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });
    if (!resp.ok) return [];
    const result = await resp.json();
    const text = (result?.content?.[0]?.text || '').trim();
    const parsed = parseFollowupJson(text);
    if (!parsed || !Array.isArray(parsed.suggestions)) return [];
    // Plan v3 §4.4 — code-side truncate at 70 chars + ellipsis in case the
    // LLM ignored the 50-char rule. 3 surface text parity (momus I4) — all
    // surfaces use the same truncated text.
    const out = [];
    for (const s of parsed.suggestions) {
      if (typeof s?.text !== 'string') continue;
      let t = s.text.trim();
      if (t.length > 70) t = `${t.slice(0, 67)}…`;
      out.push({
        text: t,
        intent_hint: typeof s.intent_hint === 'string' ? s.intent_hint : 'copy_update',
      });
      if (out.length >= 3) break;
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function buildUserMessage(summary) {
  const lines = [
    `Warnings (${summary.warningCount}):`,
  ];
  for (const w of summary.warnings) {
    const tag = w.isNewBuild ? ' [new-build]' : '';
    lines.push(`- ${w.title}${tag}: ${w.notes}`);
  }
  if (Array.isArray(summary.changedFiles) && summary.changedFiles.length > 0) {
    lines.push('');
    lines.push(`Changed files (${summary.changedFiles.length}):`);
    for (const f of summary.changedFiles.slice(0, 30)) {
      lines.push(`- ${f}`);
    }
    if (summary.changedFiles.length > 30) {
      lines.push(`- (… ${summary.changedFiles.length - 30} more)`);
    }
  }
  lines.push('');
  lines.push('Output 1-3 short follow-up PRDs the PM can send to clean up the warnings.');
  return lines.join('\n');
}

function parseFollowupJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  const raw = fenced ? fenced[1] : (text.startsWith('{') ? text : null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
