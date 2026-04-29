/**
 * Chat persistence helper — shared between the HTTP /api/playground/:id/chat
 * endpoint and `molly` (Slack bot) so a Slack-originated job shows up in
 * the playground app's chat panel without the user having to switch
 * surfaces.
 *
 * Storage layout (matches the existing endpoint):
 *   <STATE_DIR>/chat/<playgroundId>.json   — { messages: ChatMessage[] }
 *
 * Schema is owned by the playground-app client (`store/playground-store.ts
 * #ChatMessage`). The orchestrator treats messages as opaque records;
 * we only construct the minimum fields here:
 *   { id, role, content, timestamp, jobId? }
 *
 * Race notes: read-modify-write is *not* atomic across concurrent
 * writers (e.g. playground app PUT + molly append within ~ms). We
 * accept the small window in v1 — molly writes are infrequent and
 * happen at well-defined moments. Switch to a lock or an explicit
 * "append" endpoint if it becomes a real source of lost messages.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.resolve(__dirname, '..', 'state');
const CHAT_DIR = path.join(STATE_DIR, 'chat');

function chatFilePath(playgroundId) {
  return path.join(CHAT_DIR, `${playgroundId}.json`);
}

export function readChat(playgroundId) {
  const file = chatFilePath(playgroundId);
  if (!fs.existsSync(file)) return { messages: [] };
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.messages) ? parsed : { messages: [] };
  } catch (err) {
    console.warn(
      `[chat-store] read failed for ${playgroundId}: ${err.message} — treating as empty`,
    );
    return { messages: [] };
  }
}

/**
 * Append messages to the persisted chat file. Atomic write via tmp +
 * rename so a crash mid-write doesn't leave a half-flushed file.
 *
 * @param {string} playgroundId
 * @param {Array<object>} newMessages
 */
export function appendChatMessages(playgroundId, newMessages) {
  if (!Array.isArray(newMessages) || newMessages.length === 0) return;
  if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });
  const file = chatFilePath(playgroundId);
  const current = readChat(playgroundId);
  const next = { messages: [...current.messages, ...newMessages] };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next), 'utf-8');
  fs.renameSync(tmp, file);
}

export function generateMessageId() {
  return `msg_${Date.now()}_${randomBytes(3).toString('hex')}`;
}
