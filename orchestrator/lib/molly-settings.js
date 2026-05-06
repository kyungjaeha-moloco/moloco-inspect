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

const ALLOWED_MODELS = [
  DEFAULT_HAIKU,
  DEFAULT_SONNET,
  'claude-sonnet-4-5-20250929',
  'claude-opus-4-5-20251101',
  'claude-opus-4-7-20251201',
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

/** @type {MollySettings} */
let cache = null;

/** @returns {MollySettings} */
export function getMollySettings() {
  if (cache) return cache;
  // 부팅 시 file 우선, 없으면 env defaults
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
