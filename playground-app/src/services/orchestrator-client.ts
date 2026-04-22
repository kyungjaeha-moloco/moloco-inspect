/**
 * Client for the orchestrator HTTP API (http://localhost:3847).
 */

const ORCHESTRATOR_URL = 'http://localhost:3847';

export interface RawPlanItem {
  id: string;
  title: string;
  description?: string;
  pattern_id?: string | null;
  target_file?: string | null;
  depends_on?: string[];
}

export interface RawPlan {
  intent: string;
  target?: { client?: string; route_or_page?: string };
  target_entity: string | null;
  summary: string;
  visual_constraints?: string[];
  plan_items: RawPlanItem[];
}

export type ChatRole = 'user' | 'assistant';
export interface ChatApiMessage {
  role: ChatRole;
  content: string;
}

export type ChatReply =
  | { type: 'question'; content: string }
  | { type: 'plan'; content: string; plan: RawPlan };

export class OrchestratorError extends Error {
  status: number;
  detail?: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = 'OrchestratorError';
    this.status = status;
    this.detail = detail;
  }
}

// ── Change request (actual execution) ────────────────

export interface ChangeRequestInput {
  userPrompt: string;
  pagePath: string;
  client: string;
  component?: string;
  requestContract?: { change_intent?: string };
  /** Plan items, inlined into userPrompt so Codex has concrete guidance. */
  planItems?: Array<{
    id: string;
    title: string;
    description?: string;
    patternId?: string;
    targetFile?: string;
  }>;
  visualConstraints?: string[];
  /** When set, the change runs through the playground-scoped queue and
   *  commits to the playground sandbox instead of the stateless path. */
  playgroundId?: string;
}

export interface ChangeRequestAck {
  id: string;
  status: string;
}

export interface ChangeRequestEvent {
  id: string;
  status: 'pending' | 'processing' | 'preview' | 'approved' | 'error' | string;
  phase: string;
  latestLog: string | null;
  updatedAt: string;
  diff?: string | null;
  changedFiles?: string[] | null;
  screenshotUrl?: string | null;
  /** Orchestrator's diff/preview HTML viewer — NOT the live app. */
  previewUrl?: string | null;
  /** Sandbox Vite dev server URL — this is what the ScreenshotNode
   * iframe toggle should load to let the PM explore the real app. */
  livePreviewUrl?: string | null;
  prUrl?: string | null;
  error?: string | null;
}

export async function postChangeRequest(
  input: ChangeRequestInput,
): Promise<ChangeRequestAck> {
  const lines: string[] = [input.userPrompt];
  if (input.planItems && input.planItems.length > 0) {
    lines.push('', '## Plan items');
    for (const item of input.planItems) {
      lines.push(`- ${item.title}${item.description ? `: ${item.description}` : ''}`);
      if (item.patternId) lines.push(`  (pattern: ${item.patternId})`);
      if (item.targetFile) lines.push(`  (file: ${item.targetFile})`);
    }
  }
  if (input.visualConstraints && input.visualConstraints.length > 0) {
    lines.push('', '## Visual constraints');
    for (const c of input.visualConstraints) lines.push(`- ${c}`);
  }

  const resp = await fetch(`${ORCHESTRATOR_URL}/api/change-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userPrompt: lines.join('\n'),
      pagePath: input.pagePath,
      client: input.client,
      component: input.component,
      requestContract: input.requestContract,
      playgroundId: input.playgroundId,
    }),
  });

  let data: { id?: string; status?: string; queueDepth?: number; error?: string } = {};
  try {
    data = await resp.json();
  } catch {
    throw new OrchestratorError(
      `change-request 응답 파싱 실패 (HTTP ${resp.status})`,
      resp.status,
    );
  }
  if (!resp.ok || !data.id) {
    throw new OrchestratorError(data.error || `HTTP ${resp.status}`, resp.status);
  }
  return { id: data.id, status: data.status ?? 'pending' };
}

/** Absolute URL — callers may need it for <img src=...>. */
export function changeRequestScreenshotUrl(id: string): string {
  return `${ORCHESTRATOR_URL}/api/screenshot/${id}`;
}

export function changeRequestDiffUrl(id: string): string {
  return `${ORCHESTRATOR_URL}/api/diff-view/${id}`;
}

/**
 * Subscribe to the SSE event stream for a change request.
 * Returns a `close` function; call it to tear down on unmount or cancellation.
 */
export function subscribeChangeRequest(
  id: string,
  onEvent: (event: ChangeRequestEvent) => void,
  onError?: (err: Event) => void,
): () => void {
  const source = new EventSource(`${ORCHESTRATOR_URL}/api/events/${id}`);
  source.onmessage = (e) => {
    try {
      const parsed = JSON.parse(e.data) as ChangeRequestEvent;
      onEvent(parsed);
    } catch (err) {
      console.warn('[orchestrator-client] malformed SSE message:', err);
    }
  };
  if (onError) source.onerror = onError;
  return () => source.close();
}

// ── Variations (Tweak) ──────────────────────────────

export interface VariationPlan {
  intent: string;
  target?: { client?: string; route_or_page?: string };
  target_entity: string | null;
  summary: string;
  plan_items: RawPlanItem[];
}

export interface Variation {
  id: string; // "v2" | "v3"
  title: string;
  approach: string;
  promptDelta: string;
}

export async function postGenerateVariations(input: {
  originalPrompt: string;
  plan: VariationPlan;
  visualConstraints?: string[];
}): Promise<Variation[]> {
  const resp = await fetch(`${ORCHESTRATOR_URL}/api/generate-variations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  let data: { ok?: boolean; variations?: Variation[]; error?: string } = {};
  try {
    data = await resp.json();
  } catch {
    throw new OrchestratorError(
      `generate-variations 응답 파싱 실패 (HTTP ${resp.status})`,
      resp.status,
    );
  }
  if (!resp.ok || !data.ok) {
    throw new OrchestratorError(data.error || `HTTP ${resp.status}`, resp.status);
  }
  return data.variations ?? [];
}

// ── Chat ────────────────────────────────────────────

export async function postChat(
  messages: ChatApiMessage[],
): Promise<ChatReply> {
  const resp = await fetch(`${ORCHESTRATOR_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  let data: { ok?: boolean; reply?: ChatReply; error?: string; detail?: unknown } = {};
  try {
    data = await resp.json();
  } catch {
    throw new OrchestratorError(
      `Orchestrator 응답 파싱 실패 (HTTP ${resp.status})`,
      resp.status,
    );
  }

  if (!resp.ok || !data.ok || !data.reply) {
    throw new OrchestratorError(
      data.error || `HTTP ${resp.status}`,
      resp.status,
      data.detail,
    );
  }
  return data.reply;
}

// ── Playground (v3) ─────────────────────────────────
// Plan: docs/superpowers/plans/2026-04-22-playground-architecture-v3.md
// serializePlayground shape: orchestrator/lib/playground.js.

export type PlaygroundStatus = 'active' | 'hibernated' | 'archived' | 'crashed';
export type PlaygroundGitModel = 'synthetic' | 'real-clone';

export interface Playground {
  id: string;
  projectId: string;
  title: string;
  status: PlaygroundStatus;
  gitModel: PlaygroundGitModel;
  baselineCommitSha?: string;
  headCommitSha?: string;
  workBranch: string;
  baseBranch: string;
  sandboxContainerName: string;
  /** Ephemeral — re-read from the server on every load (resume may remap). */
  opencodePort?: number;
  /** Ephemeral — see opencodePort. */
  vitePort?: number;
  imageTag?: string;
  client?: string;
  /** Set iff time-travelling (checkout to an older sha). Block new requests. */
  checkedOutSha?: string;
  prdUrl?: string;
  jiraUrl?: string;
  hibernatedAt?: number;
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number;
  archivedDiffPath?: string;
}

export interface CreatePlaygroundInput {
  projectId: string;
  title: string;
  prdUrl?: string;
  jiraUrl?: string;
}

export interface ListPlaygroundsQuery {
  projectId?: string;
  status?: PlaygroundStatus;
}

export interface PromoteResult {
  playground: Playground;
  patches: string[];
  patchesDir: string;
}

async function playgroundJson<T extends object>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const resp = await fetch(`${ORCHESTRATOR_URL}${path}`, init);
  let data: { ok?: boolean; error?: string } & Partial<T> = {};
  try {
    data = (await resp.json()) as typeof data;
  } catch {
    throw new OrchestratorError(
      `playground 응답 파싱 실패 (HTTP ${resp.status})`,
      resp.status,
    );
  }
  if (!resp.ok || !data.ok) {
    throw new OrchestratorError(data.error || `HTTP ${resp.status}`, resp.status);
  }
  return data as T;
}

export async function createPlayground(
  input: CreatePlaygroundInput,
): Promise<Playground> {
  const data = await playgroundJson<{ playground: Playground }>(
    '/api/playground',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return data.playground;
}

export async function listPlaygrounds(
  query: ListPlaygroundsQuery = {},
): Promise<Playground[]> {
  const params = new URLSearchParams();
  if (query.projectId) params.set('projectId', query.projectId);
  if (query.status) params.set('status', query.status);
  const qs = params.toString();
  const data = await playgroundJson<{ playgrounds: Playground[] }>(
    `/api/playground${qs ? `?${qs}` : ''}`,
  );
  return data.playgrounds;
}

export async function getPlayground(id: string): Promise<Playground> {
  const data = await playgroundJson<{ playground: Playground }>(
    `/api/playground/${encodeURIComponent(id)}`,
  );
  return data.playground;
}

async function playgroundAction(
  id: string,
  action: 'resume' | 'hibernate' | 'archive' | 'restore-head',
  body?: unknown,
): Promise<Playground> {
  const init: RequestInit = { method: 'POST' };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const data = await playgroundJson<{ playground: Playground }>(
    `/api/playground/${encodeURIComponent(id)}/${action}`,
    init,
  );
  return data.playground;
}

export const resumePlayground = (id: string) => playgroundAction(id, 'resume');
export const hibernatePlayground = (id: string) => playgroundAction(id, 'hibernate');
export const archivePlayground = (id: string) => playgroundAction(id, 'archive');
export const restorePlaygroundHead = (id: string) =>
  playgroundAction(id, 'restore-head');

export async function checkoutPlaygroundCommit(
  id: string,
  sha: string,
): Promise<Playground> {
  const data = await playgroundJson<{ playground: Playground }>(
    `/api/playground/${encodeURIComponent(id)}/checkout`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha }),
    },
  );
  return data.playground;
}

export async function revertPlaygroundCommit(
  id: string,
  sha: string,
): Promise<Playground> {
  const data = await playgroundJson<{ playground: Playground }>(
    `/api/playground/${encodeURIComponent(id)}/revert`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha }),
    },
  );
  return data.playground;
}

export async function promotePlayground(id: string): Promise<PromoteResult> {
  const data = await playgroundJson<{
    playground: Playground;
    patches: string[];
    patchesDir: string;
  }>(`/api/playground/${encodeURIComponent(id)}/promote`, { method: 'POST' });
  return {
    playground: data.playground,
    patches: data.patches,
    patchesDir: data.patchesDir,
  };
}
