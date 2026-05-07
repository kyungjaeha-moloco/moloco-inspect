// orchestrator/lib/molly-settings.js
//
// Shared runtime settings for molly libs (classifier / chat / status /
// prd-analyzer / plan-emitter / lifecycle). 환경변수로 부팅 시 default
// 잡히고, dashboard /api/molly/settings 로 런타임 변경 가능.
// 변경 즉시 lib 들이 다음 호출 부터 반영 (모듈 재로드 X).
//
// 영구 저장: orchestrator/state/molly-settings.json
// 메모리 cache: 모든 lib 이 getMollySettings() 호출

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
  };
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
 * @returns {MollySettings} 업데이트된 전체 settings
 */
export function setMollySettings(patch) {
  const current = getMollySettings();
  const validated = validate(patch);
  cache = { ...current, ...validated };
  // 파일 저장 (best-effort, 실패해도 in-memory 는 적용됨)
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
 * 입력 patch 검증. 허용 model 만, thinking budget 은 0~16384.
 */
function validate(patch) {
  const out = {};
  const modelKeys = ['classifierModel', 'chatModel', 'statusModel', 'prdModel', 'planModel'];
  for (const k of modelKeys) {
    if (patch[k] !== undefined) {
      if (typeof patch[k] !== 'string' || !patch[k]) {
        throw new Error(`${k}: model id 가 string 이어야 합니다`);
      }
      // 알 수 없는 model id 라도 허용 (env 가 자유롭게 설정 가능 — 단 경고)
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
  return out;
}

/**
 * UI 가 "선택지" 보여주려면 알아야 할 정보.
 * @returns {{models: string[], defaults: MollySettings, current: MollySettings}}
 */
export function describeMollySettings() {
  return {
    models: ALLOWED_MODELS,
    defaults: envDefaults(),
    current: getMollySettings(),
  };
}
