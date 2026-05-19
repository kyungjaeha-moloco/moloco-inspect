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
import { judgeEscalationType, JUDGE_KINDS } from './ds-escalation-judge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_DIR = path.resolve(__dirname, '..', 'state');
const CHOICES_PATH = path.join(STATE_DIR, 'molly-missing-choices.jsonl');
const GOVERNANCE_QUEUE_PATH = path.join(STATE_DIR, 'governance-queue.jsonl');
const GOVERNANCE_EVENTS_PATH = path.join(STATE_DIR, 'governance-status-events.jsonl');

export const CHOICE_KINDS = ['closest_match', 'custom_build', 'propose_new', 'extend_existing'];

// Plan v3 §5 Q5 — lifecycle for governance queue rows.
//   awaiting_judge: just enqueued, async LLM judge still pending
//   pending:        judge resolved (or sweep-promoted from awaiting_judge), DS owner can act
//   in_review:      DS owner has claimed it
//   resolved:       DS owner finished triage
//   dismissed:      DS owner decided no DS work is needed
export const GOVERNANCE_STATUSES = ['awaiting_judge', 'pending', 'in_review', 'resolved', 'dismissed'];

// Plan v3 §5 Q4 — sweep threshold for orchestrator crash recovery.
const AWAITING_JUDGE_STALE_MS = 5 * 60 * 1000;

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

// ----------------------------------------------------------------------------
// Plan v3 (DS missing AI judge + governance) — governance queue store
// ----------------------------------------------------------------------------

/**
 * Plan v3 §5 Q4 — collision-free ref_id. base36(ms) sortable by time.
 * Format: ESC-<base36(now_ms)>
 */
export function generateRefId(now = Date.now()) {
  return `ESC-${now.toString(36).toUpperCase()}`;
}

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

function readJsonlLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // skip malformed
    }
  }
  return rows;
}

/**
 * Append a new escalation row. Initial status is always `awaiting_judge` —
 * the judge LLM call promotes it to `pending`. Caller already has the
 * pre-generated ref_id so the plan response can include it without waiting
 * for IO to settle.
 *
 * @param {{
 *   refId: string,
 *   intent: string,
 *   reason?: string,
 *   kind?: string,
 *   closestName?: string|null,
 *   closestSimilarity?: number|null,
 *   closestReasoning?: string|null,
 *   prdSnippet?: string|null,
 *   jobId?: string|null,
 *   client?: string|null,
 *   route?: string|null,
 *   surface?: string|null,
 *   user?: string|null,
 *   now?: number,
 * }} item
 * @returns {{ refId: string, createdAt: number }}
 */
export function enqueueGovernance(item) {
  ensureStateDir();
  const now = item.now ?? Date.now();
  const row = {
    id: item.refId,
    createdAt: now,
    status: 'awaiting_judge',
    kind: 'unknown',
    judgeRationale: null,
    judgeErrorReason: null,
    judgeLatencyMs: null,
    component: {
      intent: item.intent ?? '',
      reason: item.reason ?? null,
      kind: item.kind ?? null,
    },
    closestMatch: item.closestName
      ? {
          name: item.closestName,
          similarity: item.closestSimilarity ?? null,
          reasoning: item.closestReasoning ?? null,
        }
      : null,
    context: {
      jobId: item.jobId ?? null,
      client: item.client ?? null,
      route: item.route ?? null,
      surface: item.surface ?? null,
      user: item.user ?? null,
    },
    prdSnippet: item.prdSnippet ?? null,
  };
  try {
    fs.appendFileSync(GOVERNANCE_QUEUE_PATH, JSON.stringify(row) + '\n', 'utf8');
  } catch (err) {
    console.warn(`[ds-escalation] enqueueGovernance write failed: ${err.message?.slice(0, 120)}`);
  }
  appendStatusEvent({
    refId: item.refId,
    status: 'awaiting_judge',
    actor: 'system',
    note: 'enqueued',
    ts: now,
  });
  return { refId: item.refId, createdAt: now };
}

/**
 * Plan v3 §5 Q5 momus m2 — event-log status changes. The most recent event for
 * a given ref_id wins. Tabbed UIs that fire updates concurrently get
 * last-write-wins for free without locking.
 */
export function appendStatusEvent({ refId, status, actor = 'system', note = null, ts = Date.now() }) {
  if (!refId || !GOVERNANCE_STATUSES.includes(status)) return;
  ensureStateDir();
  const row = { refId, ts, status, actor, note };
  try {
    fs.appendFileSync(GOVERNANCE_EVENTS_PATH, JSON.stringify(row) + '\n', 'utf8');
  } catch (err) {
    console.warn(`[ds-escalation] appendStatusEvent write failed: ${err.message?.slice(0, 120)}`);
  }
}

/**
 * Persist the judge result onto the row identified by `refId`. Replaces the
 * row body in-place by re-emitting the entire queue file (jsonl is append-only
 * semantically, so we re-build to support edits). Status is bumped from
 * `awaiting_judge` to `pending` on success or stays `awaiting_judge` until the
 * sweep promotes it on error (so the owner can see the failure label).
 *
 * @param {string} refId
 * @param {{ kind: string, rationale: string, errorReason: string|null, latencyMs: number }} judgeResult
 */
export function applyJudgeResult(refId, judgeResult) {
  if (!refId) return false;
  const rows = readJsonlLines(GOVERNANCE_QUEUE_PATH);
  let found = false;
  const next = rows.map((row) => {
    if (row?.id !== refId) return row;
    found = true;
    const success = judgeResult?.kind && JUDGE_KINDS.includes(judgeResult.kind);
    return {
      ...row,
      kind: success ? judgeResult.kind : (row.kind || 'unknown'),
      judgeRationale: judgeResult?.rationale ?? null,
      judgeErrorReason: judgeResult?.errorReason ?? null,
      judgeLatencyMs: judgeResult?.latencyMs ?? null,
      // On success move to `pending` so the owner can act. On failure leave the
      // row in `awaiting_judge` — the sweep will eventually promote it.
      status: success ? 'pending' : row.status,
    };
  });
  if (!found) {
    console.warn(`[ds-escalation] applyJudgeResult: refId not found ${refId}`);
    return false;
  }
  try {
    ensureStateDir();
    fs.writeFileSync(GOVERNANCE_QUEUE_PATH, next.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  } catch (err) {
    console.warn(`[ds-escalation] applyJudgeResult write failed: ${err.message?.slice(0, 120)}`);
    return false;
  }
  appendStatusEvent({
    refId,
    status: judgeResult?.errorReason ? 'awaiting_judge' : 'pending',
    actor: 'judge',
    note: judgeResult?.errorReason ?? judgeResult?.kind ?? null,
  });
  return true;
}

/**
 * @param {string} refId
 * @param {string} status — must be one of GOVERNANCE_STATUSES
 * @param {{ actor?: string, note?: string }} [meta]
 * @returns {boolean} true if a row matched and the status changed
 */
export function updateGovernanceStatus(refId, status, meta = {}) {
  if (!GOVERNANCE_STATUSES.includes(status)) return false;
  const rows = readJsonlLines(GOVERNANCE_QUEUE_PATH);
  let mutated = false;
  const next = rows.map((row) => {
    if (row?.id !== refId) return row;
    if (row.status === status) return row;
    mutated = true;
    return { ...row, status };
  });
  if (!mutated) return false;
  try {
    ensureStateDir();
    fs.writeFileSync(GOVERNANCE_QUEUE_PATH, next.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  } catch (err) {
    console.warn(`[ds-escalation] updateGovernanceStatus write failed: ${err.message?.slice(0, 120)}`);
    return false;
  }
  appendStatusEvent({
    refId,
    status,
    actor: meta.actor ?? 'owner',
    note: meta.note ?? null,
  });
  return true;
}

/**
 * Read the queue, newest first. Filter by status / limit.
 *
 * @param {{ status?: string|string[], limit?: number }} [opts]
 */
export function listGovernanceQueue({ status, limit = 200 } = {}) {
  const rows = readJsonlLines(GOVERNANCE_QUEUE_PATH);
  const wanted = Array.isArray(status) ? new Set(status) : (typeof status === 'string' ? new Set([status]) : null);
  const filtered = wanted ? rows.filter((r) => wanted.has(r?.status)) : rows;
  // newest first
  filtered.sort((a, b) => (b?.createdAt ?? 0) - (a?.createdAt ?? 0));
  return filtered.slice(0, limit);
}

/**
 * @param {string} refId
 */
export function getGovernanceItem(refId) {
  if (!refId) return null;
  const rows = readJsonlLines(GOVERNANCE_QUEUE_PATH);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i]?.id === refId) return rows[i];
  }
  return null;
}

export function listGovernanceStatusEvents(refId, { limit = 200 } = {}) {
  const events = readJsonlLines(GOVERNANCE_EVENTS_PATH);
  const filtered = refId ? events.filter((e) => e?.refId === refId) : events;
  filtered.sort((a, b) => (b?.ts ?? 0) - (a?.ts ?? 0));
  return filtered.slice(0, limit);
}

/**
 * Plan v3 §5 Q4 — crash recovery sweep. Rows stuck in `awaiting_judge` past
 * the threshold get promoted to `pending` with kind='unknown' so the owner can
 * triage manually. Idempotent — safe to call on every orchestrator startup.
 *
 * @param {{ now?: number, staleMs?: number }} [opts]
 * @returns {{ swept: number }}
 */
export function sweepStaleAwaitingJudge({ now = Date.now(), staleMs = AWAITING_JUDGE_STALE_MS } = {}) {
  const rows = readJsonlLines(GOVERNANCE_QUEUE_PATH);
  let swept = 0;
  const next = rows.map((row) => {
    if (row?.status !== 'awaiting_judge') return row;
    const createdAt = row?.createdAt ?? 0;
    if (!createdAt || (now - createdAt) <= staleMs) return row;
    swept += 1;
    return {
      ...row,
      status: 'pending',
      judgeErrorReason: row.judgeErrorReason || 'sweep_promoted_stale',
    };
  });
  if (swept === 0) return { swept };
  try {
    ensureStateDir();
    fs.writeFileSync(GOVERNANCE_QUEUE_PATH, next.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  } catch (err) {
    console.warn(`[ds-escalation] sweepStaleAwaitingJudge write failed: ${err.message?.slice(0, 120)}`);
    return { swept: 0 };
  }
  for (const row of next) {
    if (row?.status === 'pending' && (row?.judgeErrorReason === 'sweep_promoted_stale')) {
      appendStatusEvent({ refId: row.id, status: 'pending', actor: 'system', note: 'sweep_promoted_stale' });
    }
  }
  console.warn(`[ds-escalation] sweep promoted ${swept} stale awaiting_judge row(s) to pending`);
  return { swept };
}

/**
 * Plan v3 §5 Q4 — fire-and-forget judge call. The plan response has already
 * been sent to the user (with the awaiting_judge row + ref_id); this is the
 * background half. Always resolves to a JudgeOutput. Never throws.
 *
 * @param {string} refId
 * @param {import('./ds-escalation-judge.js').JudgeInput} judgeInput
 * @returns {Promise<import('./ds-escalation-judge.js').JudgeOutput>}
 */
export async function runJudgeAndApply(refId, judgeInput) {
  const result = await judgeEscalationType(judgeInput).catch((err) => ({
    kind: 'unknown',
    rationale: '',
    errorReason: `exception: ${err instanceof Error ? err.message : String(err)}`,
    latencyMs: 0,
  }));
  applyJudgeResult(refId, result);
  return result;
}

export const STATE_PATHS = {
  CHOICES_PATH,
  GOVERNANCE_QUEUE_PATH,
  GOVERNANCE_EVENTS_PATH,
};
