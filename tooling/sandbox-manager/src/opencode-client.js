/**
 * OpenCode HTTP client — direct HTTP calls to OpenCode server API.
 * Based on OpenAPI 3.1 spec at /doc endpoint.
 * More reliable than SDK for our use case.
 */

import { fetch as undiciFetch, Agent } from 'undici';

// Long-lived dispatcher: blocking /session/:id/message returns nothing until
// the whole agent run finishes — Opus 4.7 can think silently for > 5 min.
// Node's default undici bodyTimeout is 300 s, which would kill the stream
// mid-run with `TypeError: fetch failed (cause: "terminated")`. Bump all
// relevant idle timeouts to 20 min to match our AbortSignal budget.
const longAgent = new Agent({
  bodyTimeout: 20 * 60_000,
  headersTimeout: 20 * 60_000,
  keepAliveTimeout: 20 * 60_000,
});

/**
 * Create a client connected to an OpenCode server.
 */
export function createSandboxClient({ openCodePort, serverPassword }) {
  const baseUrl = `http://localhost:${openCodePort}`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (serverPassword) {
    headers['Authorization'] = `Basic ${Buffer.from(`opencode:${serverPassword}`).toString('base64')}`;
  }

  async function request(method, path, body, { timeout = 1_800_000 } = {}) {
    const url = `${baseUrl}${path}`;
    const options = {
      method,
      headers: { ...headers },
      signal: AbortSignal.timeout(timeout),
      dispatcher: longAgent,
    };
    if (body) options.body = JSON.stringify(body);

    const response = await undiciFetch(url, options);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /**
   * Subscribe to `/global/event` SSE stream; fire `onEvent(payload)` for every
   * event whose `properties.sessionID` matches `sessionId` (or every event
   * when `sessionId` is null). Returns a close() function; call it to tear
   * the subscription down. The subscription survives undici idle timeouts
   * because we use `longAgent` as dispatcher.
   *
   * Event shape (opencode OpenAPI minus /doc, discovered empirically):
   *   server.connected
   *   session.status  { sessionID, status: { type: 'busy' | 'idle' | ... } }
   *   session.idle    { sessionID }
   *   session.updated { sessionID, info: {...} }
   *   session.diff    { sessionID, diff: [{ file, patch }, ...] }
   *   message.updated { sessionID, info: { id, role, modelID } }
   *   message.part.updated  { sessionID, part: { type, tool?, text?, ... } }
   *   message.part.delta    { sessionID, messageID, partID, field, delta }
   */
  function subscribeEvents(sessionId, onEvent) {
    const controller = new AbortController();
    (async () => {
      try {
        const resp = await undiciFetch(`${baseUrl}/global/event`, {
          method: 'GET',
          headers: { ...headers, Accept: 'text/event-stream' },
          signal: controller.signal,
          dispatcher: longAgent,
        });
        if (!resp.body) return;
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\n\n/);
          buffer = blocks.pop() ?? '';
          for (const block of blocks) {
            const dataLines = block.split('\n').filter((l) => l.startsWith('data: '));
            if (!dataLines.length) continue;
            try {
              const parsed = JSON.parse(dataLines.map((l) => l.slice(6)).join(''));
              const payload = parsed?.payload;
              if (!payload) continue;
              const evSessionId = payload?.properties?.sessionID;
              if (sessionId && evSessionId && evSessionId !== sessionId) continue;
              onEvent(payload);
            } catch {
              // ignore malformed event
            }
          }
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          console.warn('[opencode-client] event stream ended:', err?.message ?? err);
        }
      }
    })();
    return () => controller.abort();
  }

  return {
    baseUrl,

    async health() {
      return await request('GET', '/global/health');
    },

    async createSession() {
      return await request('POST', '/session', {});
    },

    async listSessions() {
      return await request('GET', '/session');
    },

    async sendMessage(sessionId, { parts, providerID = 'openai', modelID = 'gpt-4o' }) {
      return await request('POST', `/session/${sessionId}/message`, {
        parts,
        providerID,
        modelID,
      });
    },

    async getSession(sessionId) {
      return await request('GET', `/session/${sessionId}`);
    },

    async deleteSession(sessionId) {
      return await request('DELETE', `/session/${sessionId}`);
    },

    async abort(sessionId) {
      return await request('POST', `/session/${sessionId}/abort`);
    },

    subscribeEvents,
  };
}

/**
 * Wait for the OpenCode server inside the container to be ready.
 */
export async function waitForServerReady(client, timeoutMs = 60_000) {
  const start = Date.now();
  let lastError = null;
  let attempts = 0;

  while (Date.now() - start < timeoutMs) {
    attempts++;
    try {
      const result = await client.health();
      if (result && result.healthy) {
        return result;
      }
    } catch (error) {
      lastError = error;
      // Expected — server not ready yet
    }
    const delay = attempts < 5 ? 2000 : 1000;
    await new Promise((r) => setTimeout(r, delay));
  }

  throw new Error(
    `OpenCode server did not start within ${Math.round(timeoutMs / 1000)}s after ${attempts} attempts. Last error: ${lastError?.message || 'unknown'}`,
  );
}

/**
 * Create a session and send a prompt to the agent.
 *
 * If `onEvent` is supplied, subscribes to `/global/event` for this session's
 * stream and invokes the callback for every live event (tool calls, text
 * deltas, diff updates, status). The subscription is torn down automatically
 * once the blocking sendMessage call resolves.
 */
export async function runAgentPrompt(
  client,
  { prompt, provider = 'openai', model = 'gpt-4o', onEvent = null } = {},
) {
  const session = await client.createSession();

  const closeEvents =
    onEvent && typeof client.subscribeEvents === 'function'
      ? client.subscribeEvents(session.id, onEvent)
      : null;

  try {
    const response = await client.sendMessage(session.id, {
      parts: [{ type: 'text', text: prompt }],
      providerID: provider,
      modelID: model,
    });

    return {
      sessionId: session.id,
      info: response.info || {},
      parts: response.parts || [],
      cost: response.info?.cost || 0,
      tokens: response.info?.tokens || {},
      error: response.info?.error || null,
    };
  } finally {
    if (closeEvents) {
      // Give the stream a tiny window to deliver the final session.idle event,
      // then tear it down.
      setTimeout(() => closeEvents(), 250);
    }
  }
}

/**
 * Send a follow-up message to an existing session.
 */
export async function sendFollowUp(client, { sessionId, prompt, provider = 'openai', model = 'gpt-4o' }) {
  const response = await client.sendMessage(sessionId, {
    parts: [{ type: 'text', text: prompt }],
    providerID: provider,
    modelID: model,
  });

  return {
    sessionId,
    info: response.info || {},
    parts: response.parts || [],
    cost: response.info?.cost || 0,
    tokens: response.info?.tokens || {},
    error: response.info?.error || null,
  };
}
