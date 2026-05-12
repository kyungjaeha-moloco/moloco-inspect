// orchestrator/lib/molly-prd-analyzer.js
//
// Model + thinking budget are loaded dynamically from the molly-settings store.
// UI changes take effect immediately (no restart required).
import { getMollySettings, buildThinkingConfig } from './molly-settings.js';
import { recordEvent } from './molly-metrics.js';

export const SYSTEM_PROMPT = `You are Molly's PRD clarity checker. You receive a PRD in which the user requests code work and decide whether it is *clear enough to start right now*.

Response format (JSON only):
{
  "clarity": "clear" | "ambiguous",
  "clarifyingQuestion": "<one concise English question when ambiguous, empty string when clear>",
  "missingInfo": ["<e.g. target page>", "<e.g. target component>", ...]
}

Clear criteria — ALL of the following must be satisfied:
- The target page / component / file is specified or can be inferred (e.g. "TAS sidebar", "MCMainLayoutHeader.tsx")
- The type of change is specified (add / modify / delete / color / text / layout)
- The outcome can be described in one line ("BETA label" / "help menu", etc.)

Ambiguous criteria — ANY of the following applies:
- Target page / component unknown ("where" is missing)
- Change type unknown ("what" is missing)
- Vague value-judgment PRD like "improve it" or "make it better"
- Multiple similar candidates exist and it is unclear which one to touch

clarifyingQuestion rules:
- Ask only one question at a time (no multi-Q)
- Empty string when clear
- Friendly, concise English, 1-2 sentences

Cumulative context mode:
- If the input includes "Previous conversation" — the user has answered a previous clarifying question.
- Evaluate the original PRD plus all answers together to decide if work can start now.
- If the answer is partial and still ambiguous, ask the next clarifying question (one at a time; do not re-ask already-answered questions).
- Once the accumulated context becomes clear, return clarity=clear with an empty clarifyingQuestion.`;

/**
 * Build the PRD analyzer's user message — cumulative history + current text.
 * Extracted for testability (label invariants).
 *
 * @param {string} text — PRD body (post mention-strip cleanup)
 * @param {object} [ctx] — { history: Array<{role, content}> }
 */
export function buildPrdUserMessage(text, ctx = {}) {
  const history = Array.isArray(ctx.history) ? ctx.history : [];
  if (history.length > 0) {
    const turns = history
      .map((t) => `${t.role === 'user' ? 'user' : 'molly'}: ${(t.content || '').slice(0, 500)}`)
      .join('\n');
    return `Previous conversation:\n${turns}\n\nUser's current reply / additional info:\n${text}\n\nUsing the accumulated context above, determine whether the PRD is now clear.`;
  }
  return `PRD candidate:\n${text}\n\nPlease analyze.`;
}

/**
 * @param {string} text — user PRD body (after mention strip and other cleanup)
 * @param {object} [ctx] — { surface }
 * @returns {Promise<{clarity: 'clear'|'ambiguous', clarifyingQuestion: string, missingInfo: string[]}>}
 */
export async function analyzePrdClarity(text, ctx = {}) {
  const t0 = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  // Sub-phase B.1 — when history is present, analyse with cumulative context.
  // Covers the scenario where the user has answered a previous clarifying
  // question. All user turns + the current answer are combined so the system
  // prompt's "cumulative context mode" activates.
  const userMessage = buildPrdUserMessage(text, ctx);
  const settings = getMollySettings();
  const thinkingBudget = settings.prdThinkingBudget;
  const useThinking = thinkingBudget > 0;
  // When thinking is on, max_tokens covers thinking + response combined — keep generous.
  const maxTokens = useThinking ? thinkingBudget + 600 : 400;
  const reqBody = {
    model: settings.prdModel,
    max_tokens: maxTokens,
    // Caching (#1): SYSTEM_PROMPT (~700 tokens) cache_control. Sonnet
    // threshold ~1024 — borderline. API decides automatically.
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMessage }],
    // Per-model thinking — adaptive on Opus/Sonnet 4.6+, legacy budget
    // on older models (see molly-settings.js for the mapping).
    ...buildThinkingConfig(settings.prdModel, thinkingBudget),
  };
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(reqBody),
    // When thinking is on, latency increases (~3-10s) — extend timeout accordingly.
    signal: AbortSignal.timeout(useThinking ? 45000 : 15000),
  });
  if (!resp.ok) {
    // Analysis failure → clear fallback (proceed with job — opposite of Molly's
    // usual safe default). Reason: a spurious clarify failure would trap the
    // user in a frustrating infinite loop. Creating the actual job and letting
    // task review catch the issue is faster.
    console.warn(`[prd-analyzer] http ${resp.status} — fallback clear`);
    return { clarity: 'clear', clarifyingQuestion: '', missingInfo: [] };
  }
  const data = await resp.json();
  // When thinking is on, content[0] is a thinking block. Select only the first text block.
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const textBlock = blocks.find((b) => b?.type === 'text');
  const content = textBlock?.text ?? '';
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1) {
    return { clarity: 'clear', clarifyingQuestion: '', missingInfo: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch {
    return { clarity: 'clear', clarifyingQuestion: '', missingInfo: [] };
  }
  const clarity = parsed?.clarity === 'ambiguous' ? 'ambiguous' : 'clear';
  const clarifyingQuestion = typeof parsed?.clarifyingQuestion === 'string' ? parsed.clarifyingQuestion.slice(0, 300) : '';
  const missingInfo = Array.isArray(parsed?.missingInfo) ? parsed.missingInfo.slice(0, 5).map(String) : [];
  const u = data?.usage || {};
  console.log(
    `[prd-analyzer] input="${text.slice(0, 80)}" → clarity=${clarity} q="${clarifyingQuestion.slice(0, 60)}" | ` +
    `usage: input=${u.input_tokens ?? '?'} output=${u.output_tokens ?? '?'} ` +
    `cache_create=${u.cache_creation_input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0}`,
  );
  recordEvent('lib_call', {
    lib: 'prd-analyzer',
    surface: ctx.surface,
    model: settings.prdModel,
    latency_ms: Date.now() - t0,
    clarity,
    thinking: useThinking,
    thinking_budget: useThinking ? thinkingBudget : 0,
    has_history: Array.isArray(ctx.history) && ctx.history.length > 0,
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
  });
  return { clarity, clarifyingQuestion, missingInfo };
}
