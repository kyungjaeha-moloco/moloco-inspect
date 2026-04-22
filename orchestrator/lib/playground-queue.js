// Per-playground request queue (M1b #3).
//
// Purpose: prevent concurrent change-requests on the same playground from
// clobbering each other's `git status` / working tree. Concurrent requests
// across DIFFERENT playgrounds still run in parallel.
//
// Design (MVP):
//   - in-memory chain: `tails` Map<playgroundId, Promise> — new job awaits prior
//   - disk audit trail: append-only JSONL to state/playground-queue/<id>.jsonl
//     (used for debugging; recovery across orchestrator restart is out-of-scope
//     for MVP — enqueued work-in-progress is treated as failed on restart and
//     surfaced via state/<changeRequestId>.json).
//
// API:
//   enqueue(playgroundId, jobFn) → Promise<result of jobFn>
//   queueDepth(playgroundId) → number (estimate, incl. running)
//   stats() → per-playground depth map

import fs from 'node:fs';
import path from 'node:path';

const QUEUE_DIR = new URL('../state/playground-queue/', import.meta.url).pathname;
fs.mkdirSync(QUEUE_DIR, { recursive: true });

const MAX_DEPTH = 5;

/** @type {Map<string, Promise<void>>} */
const tails = new Map();
/** @type {Map<string, number>} pending counter incl. running */
const depths = new Map();

function audit(playgroundId, event) {
  try {
    fs.appendFileSync(
      path.join(QUEUE_DIR, `${playgroundId}.jsonl`),
      JSON.stringify({ t: Date.now(), ...event }) + '\n',
      'utf8',
    );
  } catch {
    // best-effort
  }
}

export function queueDepth(playgroundId) {
  return depths.get(playgroundId) ?? 0;
}

export function stats() {
  return Object.fromEntries([...depths.entries()]);
}

export class QueueFullError extends Error {
  constructor(playgroundId, depth) {
    super(`playground ${playgroundId} queue full (depth=${depth}, max=${MAX_DEPTH})`);
    this.name = 'QueueFullError';
    this.playgroundId = playgroundId;
    this.depth = depth;
  }
}

/**
 * Chain `jobFn` onto the playground's serial queue.
 * Rejects with QueueFullError if depth would exceed MAX_DEPTH.
 */
export async function enqueue(playgroundId, jobId, jobFn) {
  if (!playgroundId) throw new Error('enqueue requires playgroundId');
  const current = depths.get(playgroundId) ?? 0;
  if (current >= MAX_DEPTH) {
    throw new QueueFullError(playgroundId, current);
  }
  depths.set(playgroundId, current + 1);
  audit(playgroundId, { event: 'enqueued', jobId, depthAfter: current + 1 });

  const prior = tails.get(playgroundId) ?? Promise.resolve();

  // Chain a wrapper that always clears the slot, even on rejection.
  const wrapped = prior.then(async () => {
    audit(playgroundId, { event: 'started', jobId });
    try {
      return await jobFn();
    } finally {
      // nothing here — caller handles result/error
    }
  });

  // Keep tail in sync; swallow errors at tail to prevent unhandled rejection
  // polluting subsequent chain.
  tails.set(
    playgroundId,
    wrapped.then(
      () => {},
      () => {},
    ),
  );

  try {
    const result = await wrapped;
    audit(playgroundId, { event: 'completed', jobId });
    return result;
  } catch (err) {
    audit(playgroundId, { event: 'failed', jobId, error: err.message });
    throw err;
  } finally {
    const after = (depths.get(playgroundId) ?? 1) - 1;
    if (after <= 0) {
      depths.delete(playgroundId);
      // Leave `tails` entry alone — it's a resolved promise; GC when next enqueue overwrites.
    } else {
      depths.set(playgroundId, after);
    }
  }
}
