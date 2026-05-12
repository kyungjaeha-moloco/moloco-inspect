/**
 * Persists Slack thread ↔ Playground mappings.
 *
 * Design decision (2026-04-30): when creating a job per Slack mention,
 * subsequent mentions in the same thread reuse the same playground. Different
 * threads get different playgrounds. Core data structure for Option B
 * (Slack thread = playground 1:1).
 *
 * Storage: <STATE_DIR>/slack-thread-playgrounds.json
 *   { "<channel>:<threadTs>": "<playgroundId>", ... }
 *
 * Read-modify-write is racy but in v0 mentions are serialised per thread
 * so collisions are very unlikely — introduce a lock if needed.
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
 * Removes the mapping when the playground it points to is no longer active
 * (archived / hibernated / deleted). The next mention will create a new playground.
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
