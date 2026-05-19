// orchestrator/lib/ds-escalation-judge.js
//
// Plan v3 (DS missing AI judge + governance) §5 Q2 — LLM judge for escalation
// kind. Called by ds-escalation when an unresolved component has
// similarity < 0.5, async after the plan response so the user is not blocked.
//
// Output is one of `propose_new | extend_existing | custom_build`. On any
// failure mode (timeout, JSON parse, invalid kind, API 5xx, missing key) the
// caller falls back to `kind='unknown'` and the governance queue row keeps the
// escalation visible so a human can resolve it manually.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const JUDGE_TIMEOUT_MS = 30_000;

const JUDGE_SYSTEM = `You are a design-system governance triage agent. Given one DS-missing component intent + the closest existing component, decide which escalation kind best describes the gap.

Output JSON only — one fenced \`\`\`json block, nothing else. Schema:
{
  "kind": "propose_new" | "extend_existing" | "custom_build",
  "rationale": "<one or two short sentences, ≤180 chars>"
}

Kind meanings:
- propose_new: the codebase needs a brand-new DS component. The intent is reusable across pages, not a one-off, and no existing DS component is structurally close.
- extend_existing: a near-by DS component exists (similarity is non-trivial) and can grow a new prop / variant / slot to cover the intent. Prefer this whenever the closest match is in the right family.
- custom_build: a one-off, product-specific UI that does not belong in DS. Build it locally inside the app without adding to the DS.

Be terse. Do not invent components that are not mentioned. If the closest match looks structurally similar, prefer extend_existing.`;

export const JUDGE_KINDS = ['propose_new', 'extend_existing', 'custom_build'];

/**
 * @typedef {Object} JudgeInput
 * @property {string} intent — unresolved component intent
 * @property {string} [reason]
 * @property {string} [closestName]
 * @property {number} [closestSimilarity]
 * @property {string} [closestReasoning]
 * @property {string} [prdSnippet]
 */

/**
 * @typedef {Object} JudgeOutput
 * @property {'propose_new'|'extend_existing'|'custom_build'|'unknown'} kind
 * @property {string} rationale
 * @property {string|null} errorReason — null on success, short label on failure
 * @property {number} latencyMs
 */

/**
 * Call Anthropic to classify an escalation. Fails soft — caller always gets a
 * deterministic shape with `kind='unknown'` on every error path.
 *
 * @param {JudgeInput} input
 * @param {{ model?: string, apiKey?: string, timeoutMs?: number, fetchImpl?: typeof fetch }} [ctx]
 * @returns {Promise<JudgeOutput>}
 */
export async function judgeEscalationType(input, ctx = {}) {
  const t0 = Date.now();
  const intent = (input?.intent ?? '').trim();
  if (!intent) {
    return {
      kind: 'unknown',
      rationale: '',
      errorReason: 'missing_intent',
      latencyMs: Date.now() - t0,
    };
  }

  const apiKey =
    ctx.apiKey ||
    process.env.ANTHROPIC_API_KEY ||
    (process.env.SANDBOX_API_KEY && process.env.SANDBOX_API_KEY.startsWith('sk-ant-')
      ? process.env.SANDBOX_API_KEY
      : null);
  if (!apiKey) {
    return {
      kind: 'unknown',
      rationale: '',
      errorReason: 'missing_api_key',
      latencyMs: Date.now() - t0,
    };
  }

  const model = ctx.model || process.env.DS_JUDGE_MODEL || 'claude-sonnet-4-20250514';
  const timeoutMs = ctx.timeoutMs ?? JUDGE_TIMEOUT_MS;
  const fetchImpl = ctx.fetchImpl ?? fetch;

  const userMessage = buildUserMessage(input);

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
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
        max_tokens: 200,
        system: JUDGE_SYSTEM,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return {
        kind: 'unknown',
        rationale: '',
        errorReason: `http_${resp.status}: ${errText.slice(0, 100)}`,
        latencyMs: Date.now() - t0,
      };
    }
    const result = await resp.json();
    const text = (result?.content?.[0]?.text || '').trim();
    const parsed = parseJudgeJson(text);
    if (!parsed) {
      return {
        kind: 'unknown',
        rationale: '',
        errorReason: `json_parse_fail: ${text.slice(0, 80)}`,
        latencyMs: Date.now() - t0,
      };
    }
    if (!JUDGE_KINDS.includes(parsed.kind)) {
      return {
        kind: 'unknown',
        rationale: typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 200) : '',
        errorReason: `invalid_kind: ${parsed.kind}`,
        latencyMs: Date.now() - t0,
      };
    }
    return {
      kind: parsed.kind,
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 200) : '',
      errorReason: null,
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return {
      kind: 'unknown',
      rationale: '',
      errorReason: aborted ? 'timeout' : `exception: ${err instanceof Error ? err.message : String(err)}`,
      latencyMs: Date.now() - t0,
    };
  } finally {
    clearTimeout(abortTimer);
  }
}

function buildUserMessage(input) {
  const lines = [
    `Unresolved intent: ${input.intent}`,
  ];
  if (input.reason) lines.push(`Reason no DS match: ${input.reason}`);
  if (input.closestName) {
    const sim = typeof input.closestSimilarity === 'number'
      ? ` (similarity ${Math.round(input.closestSimilarity * 100)}%)`
      : '';
    lines.push(`Closest existing DS component: ${input.closestName}${sim}`);
    if (input.closestReasoning) lines.push(`Closest reasoning: ${input.closestReasoning}`);
  } else {
    lines.push('Closest existing DS component: (none)');
  }
  if (input.prdSnippet) {
    const trimmed = input.prdSnippet.slice(0, 1200);
    lines.push('');
    lines.push('PRD context:');
    lines.push(trimmed);
  }
  return lines.join('\n');
}

function parseJudgeJson(text) {
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
