// orchestrator/lib/pins.js
//
// Pin (comment) CRUD store. JSON file (orchestrator/state/pins-{playgroundId}.json)
// 영구화 + in-memory 작업. localStorage 의 playground-app pin-store 와
// shape 호환 — { id, playgroundId, x, y, text, route, element, commitSha,
//   createdAt, updatedAt, resolvedAt, replies: [{ id, text, createdAt }] }
//
// 동기 IO (read-on-demand / write-on-mutate). 50 핀 미만 가정 — 작은 파일,
// 동기 fs 가 단순. 필요 시 추후 lib/molly-metrics 패턴 따라 비동기 변경.
//
// Multi-user concurrent: last-write-wins. CRDT 아님. 운영 충돌 빈도 측정
// 후 결정.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(__dirname, '..', 'state');

function fileFor(playgroundId) {
  return path.join(STATE_DIR, `pins-${encodeURIComponent(playgroundId)}.json`);
}

function load(playgroundId) {
  try {
    const raw = fs.readFileSync(fileFor(playgroundId), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(playgroundId, pins) {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(fileFor(playgroundId), JSON.stringify(pins, null, 2));
  } catch (err) {
    console.warn(`[pins] save failed for ${playgroundId}: ${err?.message ?? err}`);
  }
}

/**
 * @param {string} playgroundId
 * @returns {Array<object>} pins
 */
export function listPins(playgroundId) {
  if (!playgroundId) return [];
  return load(playgroundId);
}

/**
 * @param {string} playgroundId
 * @param {object} pin — must include id (client 가 생성)
 * @returns {object} 저장된 pin
 */
export function createPin(playgroundId, pin) {
  if (!playgroundId || !pin?.id) throw new Error('playgroundId + pin.id required');
  const pins = load(playgroundId);
  // 중복 id 방지 — 이미 있으면 update 로 처리 (client 가 retry 한 경우)
  const idx = pins.findIndex((p) => p.id === pin.id);
  const stamped = { ...pin, playgroundId, createdAt: pin.createdAt ?? Date.now() };
  if (idx === -1) {
    pins.push(stamped);
  } else {
    pins[idx] = { ...pins[idx], ...stamped };
  }
  save(playgroundId, pins);
  return stamped;
}

/**
 * Partial patch. 알 수 없는 필드는 그대로 spread.
 */
export function updatePin(playgroundId, pinId, patch) {
  if (!playgroundId || !pinId) return null;
  const pins = load(playgroundId);
  const idx = pins.findIndex((p) => p.id === pinId);
  if (idx === -1) return null;
  pins[idx] = { ...pins[idx], ...patch, updatedAt: Date.now() };
  save(playgroundId, pins);
  return pins[idx];
}

export function deletePin(playgroundId, pinId) {
  if (!playgroundId || !pinId) return false;
  const before = load(playgroundId);
  const after = before.filter((p) => p.id !== pinId);
  if (after.length === before.length) return false;
  save(playgroundId, after);
  return true;
}

export function addReply(playgroundId, pinId, reply) {
  if (!playgroundId || !pinId || !reply?.id) return null;
  const pins = load(playgroundId);
  const pin = pins.find((p) => p.id === pinId);
  if (!pin) return null;
  pin.replies = pin.replies ?? [];
  // 중복 id 방지
  const existing = pin.replies.findIndex((r) => r.id === reply.id);
  const stamped = { ...reply, createdAt: reply.createdAt ?? Date.now() };
  if (existing === -1) pin.replies.push(stamped);
  else pin.replies[existing] = { ...pin.replies[existing], ...stamped };
  pin.updatedAt = Date.now();
  save(playgroundId, pins);
  return stamped;
}

export function updateReply(playgroundId, pinId, replyId, patch) {
  if (!playgroundId || !pinId || !replyId) return null;
  const pins = load(playgroundId);
  const pin = pins.find((p) => p.id === pinId);
  if (!pin?.replies) return null;
  const idx = pin.replies.findIndex((r) => r.id === replyId);
  if (idx === -1) return null;
  pin.replies[idx] = { ...pin.replies[idx], ...patch, updatedAt: Date.now() };
  pin.updatedAt = Date.now();
  save(playgroundId, pins);
  return pin.replies[idx];
}

export function deleteReply(playgroundId, pinId, replyId) {
  if (!playgroundId || !pinId || !replyId) return false;
  const pins = load(playgroundId);
  const pin = pins.find((p) => p.id === pinId);
  if (!pin?.replies) return false;
  const before = pin.replies.length;
  pin.replies = pin.replies.filter((r) => r.id !== replyId);
  if (pin.replies.length === before) return false;
  pin.updatedAt = Date.now();
  save(playgroundId, pins);
  return true;
}
