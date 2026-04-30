/**
 * Slack thread ↔ Playground 매핑 persist.
 *
 * 사용자 결정 (2026-04-30): Slack 멘션마다 잡을 만들 때, 같은 thread
 * 의 후속 멘션은 같은 playground 를 reuse. 다른 thread 는 다른
 * playground. 옵션 B (Slack thread = playground 1:1) 의 핵심 자료구조.
 *
 * Storage: <STATE_DIR>/slack-thread-playgrounds.json
 *   { "<channel>:<threadTs>": "<playgroundId>", ... }
 *
 * Read-modify-write 가 race-y 하지만 v0 에서는 멘션이 thread 별 직렬
 * 이라 충돌 가능성 매우 낮음 — 필요하면 lock 도입.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.resolve(__dirname, '..', 'state');
const FILE = path.join(STATE_DIR, 'slack-thread-playgrounds.json');

function readMap() {
  try {
    if (!fs.existsSync(FILE)) return {};
    const raw = fs.readFileSync(FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn(`[slack-thread-map] read failed: ${err.message} — treating as empty`);
    return {};
  }
}

function writeMap(map) {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2), 'utf-8');
  fs.renameSync(tmp, FILE);
}

function key(channel, threadTs) {
  return `${channel}:${threadTs}`;
}

/**
 * @param {string} channel
 * @param {string} threadTs
 * @returns {string | null}
 */
export function getPlaygroundIdForThread(channel, threadTs) {
  if (!channel || !threadTs) return null;
  return readMap()[key(channel, threadTs)] ?? null;
}

/**
 * @param {string} channel
 * @param {string} threadTs
 * @param {string} playgroundId
 */
export function setPlaygroundIdForThread(channel, threadTs, playgroundId) {
  if (!channel || !threadTs || !playgroundId) return;
  const map = readMap();
  map[key(channel, threadTs)] = playgroundId;
  writeMap(map);
}

/**
 * 매핑이 가리키는 playground 가 더 이상 활성이 아니면 (archived /
 * hibernated / 삭제됨) 매핑 제거. 다음 멘션이 새 playground 를 만듦.
 *
 * @param {string} channel
 * @param {string} threadTs
 */
export function clearPlaygroundForThread(channel, threadTs) {
  if (!channel || !threadTs) return;
  const map = readMap();
  if (key(channel, threadTs) in map) {
    delete map[key(channel, threadTs)];
    writeMap(map);
  }
}
