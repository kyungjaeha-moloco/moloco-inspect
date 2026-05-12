// orchestrator/lib/molly-settings.js
//
// Shared runtime settings for molly libs (classifier / chat / status /
// prd-analyzer / plan-emitter / lifecycle). Env vars set the boot defaults;
// runtime changes are available via dashboard /api/molly/settings.
// Changes take effect on the next lib call (no module reload needed).
//
// Persistent storage: orchestrator/state/molly-settings.json
// In-memory cache: all libs call getMollySettings()

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(__dirname, '..', 'state');
const SETTINGS_PATH = path.join(STATE_DIR, 'molly-settings.json');

const DEFAULT_HAIKU = 'claude-haiku-4-5-20251001';
const DEFAULT_SONNET = 'claude-sonnet-4-20250514';

/**
 * @typedef {object} MollySettings
 * @property {string} classifierModel
 * @property {string} chatModel
 * @property {string} statusModel
 * @property {string} prdModel
 * @property {string} planModel
 * @property {number} prdThinkingBudget — 0 = off
 * @property {number} planThinkingBudget — 0 = off
 * @property {number} verifyMaxRetries — D+ automatic retry count. 0 = off (D behaviour), default 2.
 * @property {boolean} researchEnabled — Type-1 read-only research before each task. Default off.
 * @property {number} researchParallelism — number of read-only Claude Code subprocesses dispatched concurrently per task. Range 1..5.
 * @property {number} researchQueryTimeoutMs — per-query subprocess wall-clock budget (SIGTERM after this, SIGKILL 3s later).
 * @property {number} researchAggregateTimeoutMs — aggregate cap across all queries for a single task.
 */

// Allowed model IDs. Verified against `GET /v1/models` (Anthropic API
// 2026-05-07): Opus 4.7 ships as the alias `claude-opus-4-7` only —
// no dated variant exists. The earlier `claude-opus-4-7-20251201` entry
// was a phantom that returned 404 on /v1/messages, silently breaking
// emitPlan and PRD analysis. If you add a new model here, double-check
// it against the live model list before merging.
const ALLOWED_MODELS = [
  DEFAULT_HAIKU,
  DEFAULT_SONNET,
  'claude-sonnet-4-5-20250929',
  'claude-opus-4-5-20251101',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-opus-4-7',
];

function envDefaults() {
  return {
    classifierModel: process.env.MOLLY_CLASSIFIER_MODEL || DEFAULT_HAIKU,
    chatModel: process.env.MOLLY_CHAT_MODEL || DEFAULT_HAIKU,
    statusModel: process.env.MOLLY_STATUS_MODEL || DEFAULT_HAIKU,
    prdModel: process.env.MOLLY_PRD_MODEL || DEFAULT_SONNET,
    planModel: process.env.PLAN_MODEL || DEFAULT_SONNET,
    prdThinkingBudget: parseThinking(process.env.MOLLY_PRD_THINKING, 2048),
    planThinkingBudget: parseThinking(process.env.MOLLY_PLAN_THINKING, 0),
    verifyMaxRetries: parseRetries(process.env.MOLLY_VERIFY_MAX_RETRIES, 2),
    // Type-1 research parallelism (plan 2026-05-12-research-parallelism.md).
    // Defaults match Slice F-lite empirical findings: P=5 with 180s/600s
    // timeouts gave 6.6× speedup at identical cost with no 429s.
    researchEnabled: parseBool(process.env.RESEARCH_ENABLED, false),
    researchParallelism: parseInt1to5(process.env.RESEARCH_PARALLELISM, 5),
    researchQueryTimeoutMs: parseIntPositive(process.env.RESEARCH_QUERY_TIMEOUT_MS, 180_000),
    researchAggregateTimeoutMs: parseIntPositive(process.env.RESEARCH_AGGREGATE_TIMEOUT_MS, 600_000),
  };
}

function parseBool(raw, fallback) {
  if (raw === undefined) return fallback;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

function parseInt1to5(raw, fallback) {
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return Math.floor(n);
  return fallback;
}

function parseIntPositive(raw, fallback) {
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return fallback;
}

function parseRetries(raw, fallback) {
  if (raw === '0' || raw === 'off' || raw === 'false') return 0;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0 && n <= 5) return Math.floor(n);
  return fallback;
}

function parseThinking(raw, fallback) {
  if (raw === '0' || raw === 'off' || raw === 'false') return 0;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return n;
  return fallback;
}

// Models that use the new adaptive thinking API. On these, the legacy
// `thinking: {type:'enabled', budget_tokens:N}` request body returns 400 —
// we must use `thinking: {type:'adaptive'}` plus `output_config.effort`.
// (Source: docs.claude.com/build-with-claude/extended-thinking + /effort,
// fetched 2026-05-07.)
const ADAPTIVE_THINKING_MODELS = new Set([
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
]);

/**
 * Translate a legacy `budget_tokens` value into the per-model thinking
 * request fields. Returns an object meant to be `Object.assign`-ed into
 * the messages request body.
 *
 * - Adaptive models (Opus/Sonnet 4.6+) → `{thinking:{type:'adaptive'}, output_config:{effort}}`.
 * - Older models → legacy `{thinking:{type:'enabled', budget_tokens:N}}`.
 * - `budget <= 0` → no thinking fields (caller still gets `{}` to spread safely).
 *
 * Effort mapping is intentionally coarse (budget bands → effort levels) and
 * conservative — the docs note effort is a behavioral signal, not a strict
 * budget, so an exact translation isn't possible. Callers can override via
 * settings if a different default is wanted.
 *
 * @param {string} modelId
 * @param {number} budgetTokens — settings value (0 = no thinking)
 * @returns {object} Partial request body (`thinking` / `output_config`).
 */
export function buildThinkingConfig(modelId, budgetTokens) {
  if (!budgetTokens || budgetTokens <= 0) return {};
  if (ADAPTIVE_THINKING_MODELS.has(modelId)) {
    let effort;
    if (budgetTokens <= 1024) effort = 'low';
    else if (budgetTokens <= 3000) effort = 'medium';
    else if (budgetTokens <= 8000) effort = 'high';
    else effort = 'xhigh';
    return {
      thinking: { type: 'adaptive' },
      output_config: { effort },
    };
  }
  return {
    thinking: { type: 'enabled', budget_tokens: budgetTokens },
  };
}

/** True if `modelId` uses adaptive thinking (no token-based budget). */
export function usesAdaptiveThinking(modelId) {
  return ADAPTIVE_THINKING_MODELS.has(modelId);
}

/** @type {MollySettings} */
let cache = null;
/** mtime (ms) of SETTINGS_PATH at the time `cache` was populated. Used to
 *  detect out-of-band edits (e.g., direct sed of the JSON, or manual fix
 *  during incident triage) without requiring a full process restart. */
let cacheMtimeMs = 0;

/** @returns {MollySettings} */
export function getMollySettings() {
  // Cheap stat() each call — invalidate cache if the JSON file changed
  // since we last loaded. Keeps `setMollySettings` (in-process patches)
  // fast while letting external edits land within one call.
  let currentMtimeMs = 0;
  try {
    currentMtimeMs = fs.statSync(SETTINGS_PATH).mtimeMs;
  } catch {
    // file missing — fall through; cache stays as-is or rebuilds from defaults
  }
  if (cache && currentMtimeMs === cacheMtimeMs) return cache;

  const defaults = envDefaults();
  let fileSettings = {};
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      fileSettings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    }
  } catch (err) {
    console.warn('[molly-settings] file read failed, using env defaults:', err.message);
  }
  cache = { ...defaults, ...fileSettings };
  cacheMtimeMs = currentMtimeMs;
  return cache;
}

/**
 * @param {Partial<MollySettings>} patch
 * @returns {MollySettings} the full updated settings object
 */
export function setMollySettings(patch) {
  const current = getMollySettings();
  const validated = validate(patch);
  cache = { ...current, ...validated };
  // Persist to file (best-effort — in-memory update is applied even if the write fails)
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(cache, null, 2));
    // Sync the mtime checkpoint so `getMollySettings` doesn't treat our
    // own write as an external edit and re-read the same content back.
    cacheMtimeMs = fs.statSync(SETTINGS_PATH).mtimeMs;
  } catch (err) {
    console.warn('[molly-settings] file write failed (in-memory still applied):', err.message);
  }
  console.log('[molly-settings] updated:', Object.keys(validated).join(', '));
  return cache;
}

/**
 * Validate input patch. Only allowed models; thinking budget must be 0–16384.
 */
function validate(patch) {
  const out = {};
  const modelKeys = ['classifierModel', 'chatModel', 'statusModel', 'prdModel', 'planModel'];
  for (const k of modelKeys) {
    if (patch[k] !== undefined) {
      if (typeof patch[k] !== 'string' || !patch[k]) {
        throw new Error(`${k}: model id 가 string 이어야 합니다`);
      }
      // Unknown model IDs are still allowed (env can set any model freely — but log a warning)
      if (!ALLOWED_MODELS.includes(patch[k])) {
        console.warn(`[molly-settings] ${k}="${patch[k]}" — ALLOWED_MODELS 에 없음, 적용은 함`);
      }
      out[k] = patch[k];
    }
  }
  for (const k of ['prdThinkingBudget', 'planThinkingBudget']) {
    if (patch[k] !== undefined) {
      const n = Number(patch[k]);
      if (!Number.isFinite(n) || n < 0 || n > 16384) {
        throw new Error(`${k}: 0~16384 사이 정수 (0 = off)`);
      }
      out[k] = Math.floor(n);
    }
  }
  if (patch.verifyMaxRetries !== undefined) {
    const n = Number(patch.verifyMaxRetries);
    if (!Number.isFinite(n) || n < 0 || n > 5) {
      throw new Error('verifyMaxRetries: 0~5 사이 정수 (0 = off)');
    }
    out.verifyMaxRetries = Math.floor(n);
  }
  if (patch.researchEnabled !== undefined) {
    if (typeof patch.researchEnabled !== 'boolean') {
      throw new Error('researchEnabled: must be boolean');
    }
    out.researchEnabled = patch.researchEnabled;
  }
  if (patch.researchParallelism !== undefined) {
    const n = Number(patch.researchParallelism);
    if (!Number.isFinite(n) || n < 1 || n > 5) {
      throw new Error('researchParallelism: 1~5 사이 정수');
    }
    out.researchParallelism = Math.floor(n);
  }
  if (patch.researchQueryTimeoutMs !== undefined) {
    const n = Number(patch.researchQueryTimeoutMs);
    if (!Number.isFinite(n) || n < 1_000 || n > 600_000) {
      throw new Error('researchQueryTimeoutMs: 1000~600000 사이 정수 (ms)');
    }
    out.researchQueryTimeoutMs = Math.floor(n);
  }
  if (patch.researchAggregateTimeoutMs !== undefined) {
    const n = Number(patch.researchAggregateTimeoutMs);
    if (!Number.isFinite(n) || n < 5_000 || n > 3_600_000) {
      throw new Error('researchAggregateTimeoutMs: 5000~3600000 사이 정수 (ms)');
    }
    out.researchAggregateTimeoutMs = Math.floor(n);
  }
  return out;
}

/**
 * Information the UI needs to render the model selection options.
 * @returns {{models: string[], defaults: MollySettings, current: MollySettings}}
 */
export function describeMollySettings() {
  return {
    models: ALLOWED_MODELS,
    defaults: envDefaults(),
    current: getMollySettings(),
  };
}
