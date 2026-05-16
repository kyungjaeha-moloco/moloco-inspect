// orchestrator/lib/image-attachment.js
//
// Builds Anthropic vision content blocks from on-disk image attachments.
// Used by LLM callers (plan-emitter, prd-analyzer) that want to forward
// a user-uploaded screenshot as a `type: 'image'` content block.
//
// Reference pattern: orchestrator/lib/qa-adapters/agent-review.js:263-272
// (auto-QA already builds image blocks from in-memory Buffer; this util
// adds disk-based loading + validation for the user-attachment path.)

import fs from 'node:fs';

const ALLOWED_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * @typedef {{ type: 'image', source: { type: 'base64', media_type: string, data: string } }} ImageBlock
 */

/**
 * Load an image from disk and return an Anthropic image content block,
 * or null if the file is missing / oversized / mime invalid.
 *
 * Never throws — failures are logged and return null so callers can
 * silently fall through to text-only requests.
 *
 * @param {{ path: string, mediaType?: string } | null | undefined} attachment
 * @returns {ImageBlock | null}
 */
export function loadImageBlock(attachment) {
  if (!attachment || typeof attachment !== 'object') return null;
  const { path: filePath, mediaType } = attachment;
  if (!filePath || typeof filePath !== 'string') return null;

  const normalizedMediaType =
    typeof mediaType === 'string' && ALLOWED_MEDIA_TYPES.has(mediaType.toLowerCase())
      ? mediaType.toLowerCase()
      : null;
  if (!normalizedMediaType) {
    console.warn(`[image-attachment] skip: invalid mediaType=${mediaType} for ${filePath}`);
    return null;
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    console.warn(`[image-attachment] skip: stat failed ${filePath}: ${err.message}`);
    return null;
  }
  if (!stat.isFile()) {
    console.warn(`[image-attachment] skip: not a file ${filePath}`);
    return null;
  }
  if (stat.size > MAX_BYTES) {
    console.warn(
      `[image-attachment] skip: ${filePath} size=${stat.size} exceeds ${MAX_BYTES}`,
    );
    return null;
  }

  let bytes;
  try {
    bytes = fs.readFileSync(filePath);
  } catch (err) {
    console.warn(`[image-attachment] skip: read failed ${filePath}: ${err.message}`);
    return null;
  }

  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: normalizedMediaType,
      data: bytes.toString('base64'),
    },
  };
}

/**
 * Diagnostic info for logging — does not load the file body.
 * Returns { ok, size?, reason? } without throwing.
 *
 * @param {{ path: string, mediaType?: string } | null | undefined} attachment
 * @returns {{ ok: boolean, size?: number, reason?: string }}
 */
export function describeAttachment(attachment) {
  if (!attachment || typeof attachment !== 'object') return { ok: false, reason: 'absent' };
  const { path: filePath, mediaType } = attachment;
  if (!filePath) return { ok: false, reason: 'no_path' };
  if (!mediaType || !ALLOWED_MEDIA_TYPES.has(String(mediaType).toLowerCase())) {
    return { ok: false, reason: 'invalid_mediatype' };
  }
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return { ok: false, reason: 'not_file' };
    if (stat.size > MAX_BYTES) return { ok: false, reason: 'oversize', size: stat.size };
    return { ok: true, size: stat.size };
  } catch (err) {
    return { ok: false, reason: `stat_err:${err.code || 'unknown'}` };
  }
}
