/**
 * Live agent stream — subscribes to the orchestrator's SSE channel for
 * a change-request and translates each `latestLog` line into a compact
 * snapshot the JobCard renders under the running task ("Read ×4 ·
 * Edit ×2 · 💬 컬럼 정의 중…").
 *
 * The orchestrator already tags agent events with leading emoji in
 * `appendLog`:
 *   `🛠️ ${tool}`     — tool call (Read / Edit / Bash / Glob / Grep …)
 *   `💬 ${snippet}`  — assistant text snippet
 *   `📝 ${n} files`  — files-touched count summary
 * Anything else is pipeline plumbing (sandbox boot, validation, etc.).
 *
 * This module is pure subscription mechanics — no React. JobCard wraps
 * it with a small hook to hold the snapshot in component state.
 */

import { ORCHESTRATOR_URL } from './orchestrator-client';

export interface AgentStreamSnapshot {
  /** Counts per tool name, e.g. { Read: 4, Edit: 2 }. */
  toolCounts: Record<string, number>;
  /** Most recent assistant text snippet (already trimmed by orchestrator). */
  latestThought: string | null;
  /** The raw last log line — fallback so we never display nothing. */
  latestLog: string | null;
  /** True once the SSE connection has delivered at least one event. */
  connected: boolean;
}

const EMPTY: AgentStreamSnapshot = {
  toolCounts: {},
  latestThought: null,
  latestLog: null,
  connected: false,
};

interface SsePayload {
  latestLog?: string | null;
  status?: string;
  phase?: string;
}

/**
 * Open an EventSource for `requestId` and call `onUpdate` with a fresh
 * snapshot each time a new agent event arrives. Returns a cleanup
 * function that closes the connection. Safe to call repeatedly — each
 * call yields an independent subscription.
 */
export function subscribeAgentStream(
  requestId: string,
  onUpdate: (snap: AgentStreamSnapshot) => void,
): () => void {
  let snapshot: AgentStreamSnapshot = { ...EMPTY, toolCounts: {} };
  let lastSeenLog: string | null = null;
  const url = `${ORCHESTRATOR_URL}/api/events/${encodeURIComponent(requestId)}`;
  const es = new EventSource(url);

  function emit() {
    onUpdate({ ...snapshot, toolCounts: { ...snapshot.toolCounts } });
  }

  es.onmessage = (ev) => {
    let payload: SsePayload | null = null;
    try {
      payload = JSON.parse(ev.data) as SsePayload;
    } catch {
      return;
    }
    if (!payload) return;
    snapshot.connected = true;

    const log = payload.latestLog ?? null;
    if (log && log !== lastSeenLog) {
      lastSeenLog = log;
      snapshot.latestLog = log;
      // Tool call: `🛠️ <tool>` — bump counter. Strip the emoji + any
      // following parens (some tool labels are `Edit (file.tsx)`).
      const toolMatch = log.match(/^🛠️\s+(\S+)/);
      if (toolMatch) {
        const tool = toolMatch[1];
        snapshot.toolCounts[tool] = (snapshot.toolCounts[tool] ?? 0) + 1;
      }
      // Assistant thought: `💬 ...`
      const thoughtMatch = log.match(/^💬\s+([\s\S]+)$/);
      if (thoughtMatch) {
        snapshot.latestThought = thoughtMatch[1].trim();
      }
    }

    emit();
  };

  es.onerror = () => {
    // EventSource auto-reconnects on transient errors; nothing to do.
    // If the request is finished, the orchestrator will eventually
    // close from its side and the subscriber will stop receiving
    // events. JobCard unsubscribes when the task moves past `running`.
  };

  return () => {
    es.close();
  };
}
