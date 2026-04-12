/**
 * OpenCode HTTP client — direct HTTP calls to OpenCode server API.
 * Based on OpenAPI 3.1 spec at /doc endpoint.
 * More reliable than SDK for our use case.
 */

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

  async function request(method, path, body, { timeout = 120_000 } = {}) {
    const url = `${baseUrl}${path}`;
    const options = {
      method,
      headers: { ...headers },
      signal: AbortSignal.timeout(timeout),
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
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
 */
export async function runAgentPrompt(client, { prompt, provider = 'openai', model = 'gpt-4o' }) {
  const session = await client.createSession();

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
