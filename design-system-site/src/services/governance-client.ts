// Plan v3 (DS missing AI judge + governance) §4.3 — typed client for the
// orchestrator governance queue endpoints. Calls go through the dev-server
// vite proxy (`/api/governance/*` → http://localhost:3847). Prod assumes a
// same-origin reverse proxy.

export type GovernanceStatus =
  | 'awaiting_judge'
  | 'pending'
  | 'in_review'
  | 'resolved'
  | 'dismissed';

export type EscalationKind =
  | 'propose_new'
  | 'extend_existing'
  | 'custom_build'
  | 'unknown';

export interface GovernanceQueueItem {
  id: string;
  createdAt: number;
  status: GovernanceStatus;
  kind: EscalationKind;
  judgeRationale: string | null;
  judgeErrorReason: string | null;
  judgeLatencyMs: number | null;
  component: {
    intent: string;
    reason: string | null;
    kind: string | null;
  };
  closestMatch: {
    name: string;
    similarity: number | null;
    reasoning: string | null;
  } | null;
  context: {
    jobId: string | null;
    client: string | null;
    route: string | null;
    surface: string | null;
    user: string | null;
  };
  prdSnippet: string | null;
}

export interface GovernanceStatusEvent {
  refId: string;
  ts: number;
  status: GovernanceStatus;
  actor: string;
  note: string | null;
}

export interface GovernanceListReply {
  ok: boolean;
  items: GovernanceQueueItem[];
  error?: string;
}

export interface GovernanceItemReply {
  ok: boolean;
  item?: GovernanceQueueItem;
  events?: GovernanceStatusEvent[];
  error?: string;
}

export interface GovernanceStatusUpdateReply {
  ok: boolean;
  item?: GovernanceQueueItem;
  error?: string;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    /* swallow */
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (!body) throw new Error('Empty response');
  return body;
}

export function listGovernanceQueue(opts: {
  status?: GovernanceStatus | GovernanceStatus[];
  limit?: number;
} = {}): Promise<GovernanceListReply> {
  const params = new URLSearchParams();
  if (opts.status) {
    const s = Array.isArray(opts.status) ? opts.status.join(',') : opts.status;
    params.set('status', s);
  }
  if (typeof opts.limit === 'number') params.set('limit', String(opts.limit));
  const qs = params.toString();
  return fetchJson<GovernanceListReply>(`/api/governance/queue${qs ? `?${qs}` : ''}`);
}

export function getGovernanceItem(refId: string): Promise<GovernanceItemReply> {
  return fetchJson<GovernanceItemReply>(
    `/api/governance/queue/${encodeURIComponent(refId)}`,
  );
}

export function updateGovernanceStatus(
  refId: string,
  status: GovernanceStatus,
  meta: { actor?: string; note?: string } = {},
): Promise<GovernanceStatusUpdateReply> {
  return fetchJson<GovernanceStatusUpdateReply>(
    `/api/governance/queue/${encodeURIComponent(refId)}/status`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...meta }),
    },
  );
}
