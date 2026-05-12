// orchestrator/lib/ds-escalation.js
//
// DS Escalation Slice A — shared telemetry + card builder for the 4-option
// "DS missing" UX across 3 surfaces (Slack / Playground / Chrome ext).
//
// Plan: docs/superpowers/plans/2026-05-12-ds-escalation-workflow.md (Slice A)
//
// Responsibilities:
//   - normalize plan.unresolved_components (handle legacy string closest_match)
//   - build a surface-agnostic missing_component_card payload
//   - append jsonl telemetry for each user choice (state/molly-missing-choices.jsonl)
//
// PR generation for kinds 'propose_new' / 'extend_existing' is deferred to Slice
// B — this lib only records the choice + intent and returns a stub draft preview.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_DIR = path.resolve(__dirname, '..', 'state');
const CHOICES_PATH = path.join(STATE_DIR, 'molly-missing-choices.jsonl');

export const CHOICE_KINDS = ['closest_match', 'custom_build', 'propose_new', 'extend_existing'];

/**
 * Normalize an unresolved_components entry so downstream surfaces can render
 * uniformly. Tolerates the legacy schema where `closest_match` was a string
 * (`"MCSomething"`) — wraps it into `{ name, importStatement: null, ... }`.
 *
 * @param {object} entry — single unresolved_components entry from the LLM
 * @returns {{
 *   intent: string,
 *   reason: string,
 *   kind: 'new_component'|'extension'|'composition_miss',
 *   closest_match: null | { name: string, importStatement: string|null, similarity_score: number, reasoning: string }
 * }}
 */
export function normalizeUnresolved(entry) {
  const intent = typeof entry?.intent === 'string' ? entry.intent : '';
  const reason = typeof entry?.reason === 'string' ? entry.reason : '';
  const kind = ['new_component', 'extension', 'composition_miss'].includes(entry?.kind)
    ? entry.kind
    : 'new_component';

  let closest_match = null;
  const raw = entry?.closest_match;
  if (raw && typeof raw === 'object' && typeof raw.name === 'string') {
    closest_match = {
      name: raw.name,
      importStatement: typeof raw.importStatement === 'string' ? raw.importStatement : null,
      similarity_score: typeof raw.similarity_score === 'number' ? raw.similarity_score : 0,
      reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : '',
    };
  } else if (typeof raw === 'string' && raw.trim()) {
    closest_match = {
      name: raw.trim(),
      importStatement: null,
      similarity_score: 0,
      reasoning: '(legacy string closest_match — re-emit plan for full structure)',
    };
  }
  return { intent, reason, kind, closest_match };
}

/**
 * Returns a surface-agnostic descriptor for a missing-component card:
 * 4 options with stable kinds + human labels + recommendation flag.
 * Surfaces (Slack Block Kit / Playground / Chrome ext) translate this into
 * their own UI primitive.
 *
 * @param {object} unresolved — normalized via normalizeUnresolved
 * @returns {{ headline: string, hint: string, options: Array<{
 *   kind: 'closest_match'|'custom_build'|'propose_new'|'extend_existing',
 *   label: string,
 *   recommended: boolean,
 *   disabled: boolean,
 *   description: string,
 * }>}}
 */
export function buildMissingComponentCard(unresolved) {
  const u = normalizeUnresolved(unresolved);
  const closestName = u.closest_match?.name ?? null;
  const closestUsable = closestName && (u.closest_match?.similarity_score ?? 0) >= 0.5;

  const headline = closestName
    ? `"${u.intent}" — no exact DS match. Closest: *${closestName}*${
        u.closest_match?.similarity_score
          ? ` (similarity ${Math.round(u.closest_match.similarity_score * 100)}%)`
          : ''
      }.`
    : `"${u.intent}" — no DS match.`;
  const hint = closestUsable
    ? `"Proceed with ${closestName}" is the fastest path.`
    : 'No close DS match — consider proposing a new component or extending an existing one.';

  // Only one option is "recommended" at a time. Engineer-speed-first: when a
  // usable closest match exists, recommend it; otherwise fall back to the
  // unresolved_kind-aligned escalation option.
  let recommendedKind = null;
  if (closestUsable) recommendedKind = 'closest_match';
  else if (u.kind === 'extension' && closestName) recommendedKind = 'extend_existing';
  else recommendedKind = 'propose_new';

  return {
    headline,
    hint,
    options: [
      {
        kind: 'closest_match',
        label: closestUsable ? `Proceed with ${closestName}` : 'Use closest match',
        recommended: recommendedKind === 'closest_match',
        disabled: !closestName,
        description: closestName
          ? `Use ${closestName}. ${u.closest_match?.reasoning ?? ''}`.trim()
          : 'No closest match provided by the planner.',
      },
      {
        kind: 'custom_build',
        label: 'Build custom (outside DS)',
        recommended: false,
        disabled: false,
        description: 'Generate the component locally, auto-label "outside DS".',
      },
      {
        kind: 'propose_new',
        label: 'Propose new DS component (preview)',
        recommended: recommendedKind === 'propose_new',
        disabled: false,
        description: 'Open a 2-step preview before raising a DS request PR. Slice B wires the PR.',
      },
      {
        kind: 'extend_existing',
        label: 'Extend existing component (preview)',
        recommended: recommendedKind === 'extend_existing',
        disabled: !closestName,
        description: closestName
          ? `Open a 2-step preview to add a variant/prop to ${closestName}.`
          : 'Needs a closest_match to extend.',
      },
    ],
  };
}

/**
 * Append a user choice to the missing-choices jsonl. Best-effort — never
 * throws, since this is fire-and-forget instrumentation for the
 * governance dashboard (Slice C).
 *
 * @param {{
 *   surface: 'slack'|'playground'|'chrome_ext',
 *   jobId?: string,
 *   threadId?: string,
 *   client?: string,
 *   componentIntent: string,
 *   closestMatch?: string|null,
 *   closestSimilarity?: number|null,
 *   kind: 'new_component'|'extension'|'composition_miss',
 *   choice: 'closest_match'|'custom_build'|'propose_new'|'extend_existing',
 *   user?: string,
 * }} payload
 */
export function recordMissingChoice(payload) {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    const row = {
      ts: new Date().toISOString(),
      surface: payload.surface,
      job_id: payload.jobId ?? null,
      thread_id: payload.threadId ?? null,
      client: payload.client ?? null,
      component_intent: payload.componentIntent,
      closest_match: payload.closestMatch ?? null,
      closest_similarity: payload.closestSimilarity ?? null,
      unresolved_kind: payload.kind,
      choice: payload.choice,
      user: payload.user ?? null,
    };
    fs.appendFileSync(CHOICES_PATH, JSON.stringify(row) + '\n', 'utf8');
  } catch (err) {
    console.warn(`[ds-escalation] recordMissingChoice failed: ${err.message?.slice(0, 120)}`);
  }
}

/**
 * Best-effort read of all recorded choices. Used by the dashboard /
 * GovernancePage (Slice C). Returns empty array if the file is missing or
 * partially corrupt.
 */
export function readMissingChoices({ limit = 500 } = {}) {
  if (!fs.existsSync(CHOICES_PATH)) return [];
  let text;
  try {
    text = fs.readFileSync(CHOICES_PATH, 'utf8');
  } catch {
    return [];
  }
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // Skip malformed line.
    }
  }
  return rows.slice(-limit).reverse();
}

/**
 * Build a "2-step preview" draft for the propose_new / extend_existing choice.
 * Returns a markdown body suitable for the PR template that Slice B will
 * eventually post to GitHub. Slice A only previews the draft to the user
 * inside the surface (no PR is created yet).
 */
export function buildDraftPreview({ choice, unresolved, prd, user, surface }) {
  const u = normalizeUnresolved(unresolved);
  const isExtension = choice === 'extend_existing';
  const targetName = u.closest_match?.name ?? '<unknown>';
  const headline = isExtension
    ? `[DS request] Extend ${targetName} — ${u.intent}`
    : `[DS request] New component — ${u.intent}`;

  const lines = [
    `## ${headline}`,
    '',
    `> **AI-generated draft preview** | requested by: ${user ?? '(unknown)'} | surface: ${surface}`,
    `> kind: \`${u.kind}\``,
    '',
    '### User intent',
    `> ${u.intent || '(no intent recorded)'}`,
    '',
    '### Why none of the catalog components fits',
    `> ${u.reason || '(reason missing)'}`,
    '',
    '### Closest existing component',
    u.closest_match
      ? `- \`${u.closest_match.name}\` (similarity ${Math.round((u.closest_match.similarity_score ?? 0) * 100)}%) — ${u.closest_match.reasoning || ''}`
      : '_None close enough to suggest._',
    '',
    '### PRD excerpt',
    '',
    '```',
    (prd ?? '').slice(0, 1200),
    '```',
    '',
    isExtension
      ? '### Proposed extension'
      : '### Proposed new component',
    isExtension
      ? `Add a new prop/variant to \`${targetName}\` so it can render the intent above. DS team: review and adjust the API.`
      : 'Add a new component to design-system/src/components.json with the props inferred from the PRD. DS team: review and adjust the API.',
    '',
    '_Slice A preview — this draft is not posted to GitHub yet. Slice B will turn approval into an actual PR._',
  ];
  return lines.join('\n');
}

export const STATE_PATHS = { CHOICES_PATH };
