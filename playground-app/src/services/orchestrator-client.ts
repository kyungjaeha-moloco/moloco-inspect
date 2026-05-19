/**
 * Client for the orchestrator HTTP API (http://localhost:3847).
 */

export const ORCHESTRATOR_URL = 'http://localhost:3847';

export interface RawPlanItem {
  id: string;
  title: string;
  description?: string;
  pattern_id?: string | null;
  target_file?: string | null;
  /** Plan v3 — set by plan-emitter when this item introduces UI without a DS
   * equivalent. Reviewer skips Rule 7 (DS equivalence check) for this task. */
  is_new_build?: boolean;
  depends_on?: string[];
}

export interface RawClosestMatch {
  name: string;
  importStatement?: string | null;
  similarity_score?: number;
  reasoning?: string;
}

export type UnresolvedKind = 'new_component' | 'extension' | 'composition_miss';

export interface RawUnresolvedComponent {
  intent: string;
  reason: string;
  kind?: UnresolvedKind;
  /** May be null, an object (preferred), or a legacy string. */
  closest_match?: RawClosestMatch | string | null;
}

/**
 * Plan v3 (DS missing AI judge + governance) — one-row pointer to a row that
 * lives in the orchestrator-side governance queue. Sent on the plan response
 * when an unresolved component fell below similarity threshold and was
 * escalated to the DS owner. `status='awaiting_judge'` means the judge LLM is
 * still running in the background; the row promotes to `pending` on success
 * or stays `awaiting_judge` (eventually swept) on failure.
 */
export interface RawEscalationNotice {
  ref_id: string;
  intent: string;
  unresolved_kind: UnresolvedKind | string;
  closest_match: string | null;
  closest_similarity: number | null;
  status: 'awaiting_judge' | 'pending' | 'in_review' | 'resolved' | 'dismissed';
}

export interface RawPlan {
  intent: string;
  target?: { client?: string; route_or_page?: string };
  target_entity: string | null;
  summary: string;
  visual_constraints?: string[];
  plan_items: RawPlanItem[];
  unresolved_components?: RawUnresolvedComponent[];
  /** Plan v3 — orchestrator-injected. Optional for backward compat. */
  escalation_notices?: RawEscalationNotice[];
}

export type MissingChoiceKind = 'closest_match' | 'custom_build' | 'propose_new' | 'extend_existing';

export interface MissingChoiceInput {
  surface: 'playground' | 'chrome_ext' | 'slack';
  choice: MissingChoiceKind;
  unresolved: RawUnresolvedComponent;
  prd?: string;
  jobId?: string | null;
  threadId?: string | null;
  client?: string | null;
  user?: string | null;
}

export interface MissingChoiceReply {
  ok: boolean;
  choice: MissingChoiceKind;
  draftPreview?: string | null;
  error?: string;
}

export async function postMissingChoice(input: MissingChoiceInput): Promise<MissingChoiceReply> {
  const res = await fetch(`${ORCHESTRATOR_URL}/api/missing-choice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  let body: MissingChoiceReply | null = null;
  try {
    body = (await res.json()) as MissingChoiceReply;
  } catch {
    /* fall through */
  }
  if (!res.ok || !body?.ok) {
    throw new OrchestratorError(
      body?.error ?? `missing-choice failed with status ${res.status}`,
      res.status,
      body,
    );
  }
  return body;
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
  /**
   * After approving a plan card in Playground, runs with fast-track flags.
   *
   * NOTE: The /api/change-request flow (Playground) has no decomposer / approval
   * gate by design, so these two options are preserved in the payload but have no
   * effect on actual backend behaviour. The /api/playground/:id/job flow used by
   * Slack / Chrome ext passes both options to createJob normally
   * (decomposer bypass + auto-advance).
   * The ⚡ badge in Playground is purely a visual UX signal to the user that
   * fast-track intent is set; the behaviour itself is unchanged.
   */
  autoApprove?: boolean;
  /** Source of truth: FAST_TRACK_INTENTS in orchestrator/lib/plan-intent.js. */
  skipDecomposer?: boolean;
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
      autoApprove: input.autoApprove,
      skipDecomposer: input.skipDecomposer,
    }),
  });

  let data: { id?: string; status?: string; queueDepth?: number; error?: string } = {};
  try {
    data = await resp.json();
  } catch {
    throw new OrchestratorError(
      `Failed to parse change-request response (HTTP ${resp.status})`,
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
      `Failed to parse generate-variations response (HTTP ${resp.status})`,
      resp.status,
    );
  }
  if (!resp.ok || !data.ok) {
    throw new OrchestratorError(data.error || `HTTP ${resp.status}`, resp.status);
  }
  return data.variations ?? [];
}

// ── Chat ────────────────────────────────────────────

export interface MollyDispatchResult {
  kind: 'chat' | 'status_query' | 'code_change';
  response?: string;
  reason: string;
}

/**
 * Classifies the first user message via the molly classifier. If code_change,
 * the caller proceeds with the existing Wizard flow (postChat). If chat /
 * status_query, surfaces the response to the user and skips Wizard entry.
 */
export async function mollyClassifyAndDispatch(
  text: string,
  isFirstMessage: boolean,
): Promise<MollyDispatchResult | null> {
  if (!isFirstMessage) return null; // multi-turn guard — subsequent turns go to Wizard
  try {
    const resp = await fetch(`${ORCHESTRATOR_URL}/api/molly/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, surface: 'playground' }),
    });
    if (!resp.ok) return null; // on failure, caller falls back to existing flow
    const data = await resp.json();
    return {
      kind: data?.kind ?? 'code_change',
      response: data?.response,
      reason: data?.reason ?? '',
    };
  } catch {
    return null;
  }
}

/**
 * @deprecated Use postIntake (Phase 3 Task 3.1, sub-phase C). postChat
 * is single-turn and calls the classification gate separately (mollyClassifyAndDispatch).
 * postIntake integrates history-aware multi-turn + classifier + analyzer + plan
 * emitter. /api/chat will be deleted after the deprecation cycle.
 */
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
      `Failed to parse Orchestrator response (HTTP ${resp.status})`,
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

// ── Unified Intake (Phase 3 Task 3.1, sub-phase C) ──────────

export type IntakeKind =
  | 'chat'
  | 'status_query'
  | 'lifecycle_action'
  | 'code_change_clear'
  | 'code_change_ambiguous'
  | 'plan_emit'
  | 'job_dispatched'
  | 'plan_feedback';

export interface IntakeHistoryTurn {
  role: ChatRole;
  content: string;
  /** assistant turns only — the previous IntakeResult.kind. Used by the dispatcher for routing decisions. */
  kind?: IntakeKind;
  clarifyingQuestion?: string;
  planItems?: RawPlanItem[];
}

export interface IntakeRequest {
  text: string;
  surface?: string;
  history?: IntakeHistoryTurn[];
  /** Optional — used by handleClarificationAnswer / handlePlanEdit when calling emitPlan. */
  client?: string;
  routeOrPage?: string;
  channel?: string;
  threadTs?: string;
  /**
   * Enable plan_feedback — true when a plan card is visible and the user
   * can send revision requests via chat. The classifier considers plan_feedback
   * as a candidate kind. Sending summary alongside improves accuracy.
   */
  hasPendingPlan?: boolean;
  pendingPlanSummary?: string;
}

export interface IntakeResult {
  ok: true;
  kind: IntakeKind;
  reason: string;
  /** Response body for chat / status_query. */
  response?: string;
  /** Next clarifying question for code_change_ambiguous. */
  clarifyingQuestion?: string;
  missingInfo?: string[];
  /** Plan items for plan_emit. */
  planItems?: RawPlanItem[];
  /** Full plan for plan_emit (intent, summary, visual_constraints, plan_items). */
  plan?: RawPlan;
  /** PRD assembled from history at plan_emit / job_dispatched time. */
  cumulativePrd?: string;
  /** Raw natural-language feedback from the user when kind is plan_feedback. */
  feedback?: string;
}

/**
 * Unified intake — surface-agnostic entry point. Unified dispatch for
 * classifier + chat/status + PRD analyzer + plan emitter. Sending ctx.history
 * enables multi-turn handling (clarification + plan ceremony).
 */
export async function postIntake(args: IntakeRequest): Promise<IntakeResult> {
  const resp = await fetch(`${ORCHESTRATOR_URL}/api/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: args.text,
      surface: args.surface ?? 'playground',
      history: args.history ?? [],
      client: args.client,
      routeOrPage: args.routeOrPage,
      channel: args.channel,
      threadTs: args.threadTs,
      hasPendingPlan: args.hasPendingPlan,
      pendingPlanSummary: args.pendingPlanSummary,
    }),
  });

  let data: { ok?: boolean; error?: string; [k: string]: unknown } = {};
  try {
    data = await resp.json();
  } catch {
    throw new OrchestratorError(
      `Intake response parse failed (HTTP ${resp.status})`,
      resp.status,
    );
  }

  if (!resp.ok || !data.ok) {
    throw new OrchestratorError(
      typeof data.error === 'string' ? data.error : `HTTP ${resp.status}`,
      resp.status,
      data,
    );
  }
  return data as unknown as IntakeResult;
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
  /**
   * The anchor sha the user restored to via `restoreToSha`. Present
   * until forward work (new commit via change-request / job) lands on
   * top. Drives a "restored" indicator + dimming of chat/task rows
   * that sit between this sha and the pre-restore HEAD.
   */
  restoredFromSha?: string;
  prdUrl?: string;
  jiraUrl?: string;
  /** Human name from whoever kicked the playground off. Display-only. */
  createdBy?: string;
  hibernatedAt?: number;
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number;
  archivedDiffPath?: string;
  /**
   * How this playground reached `status==='archived'`.
   *  - `'user'`: explicit archive action (patches exported, container removed)
   *  - `'reattach-missing'`: orchestrator startup couldn't `docker inspect`
   *    the container — likely a daemon race after host wake / Docker restart.
   *    Reattach re-checks these on every boot so the entry can self-heal.
   */
  archivedReason?: 'user' | 'reattach-missing';
  /** ms since epoch of the most recent promote run (any outcome). */
  promotedAt?: number;
  /** Branch name pushed to the host `msm-portal` origin on last promote. */
  promotedBranch?: string;
  /** GitHub PR URL from last `gh pr create`. Absent on dry-run. */
  promotedPrUrl?: string;
}

export interface CreatePlaygroundInput {
  projectId: string;
  title: string;
  prdUrl?: string;
  jiraUrl?: string;
  /** Shown in the list; not an auth signal. */
  createdBy?: string;
}

export interface ListPlaygroundsQuery {
  projectId?: string;
  status?: PlaygroundStatus;
}

export interface PromoteAppliedPatch {
  file: string;
  commit: string;
}

export interface PromoteSkippedPatch {
  file: string;
  reason: string;
}

export interface PromoteResult {
  playground: Playground;
  patches: string[];
  patchesDir: string;
  branch: string;
  applied: PromoteAppliedPatch[];
  skipped: PromoteSkippedPatch[];
  prUrl?: string;
  dryRun: boolean;
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
      `Playground response parse failed (HTTP ${resp.status})`,
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

/**
 * Restore to a checkpoint — reverts every commit after `sha` in a
 * single "Restore to <short>" commit. Non-destructive: history is
 * preserved so the user can go back.
 */
export async function restorePlaygroundToSha(
  id: string,
  sha: string,
): Promise<Playground> {
  const data = await playgroundJson<{ playground: Playground }>(
    `/api/playground/${encodeURIComponent(id)}/restore-to-sha`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha }),
    },
  );
  return data.playground;
}

export async function promotePlayground(
  id: string,
  opts: { dryRun?: boolean } = {},
): Promise<PromoteResult> {
  const data = await playgroundJson<{
    playground: Playground;
    patches: string[];
    patchesDir: string;
    branch: string;
    applied: PromoteAppliedPatch[];
    skipped: PromoteSkippedPatch[];
    prUrl?: string;
    dryRun: boolean;
  }>(`/api/playground/${encodeURIComponent(id)}/promote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun: Boolean(opts.dryRun) }),
  });
  return {
    playground: data.playground,
    patches: data.patches,
    patchesDir: data.patchesDir,
    branch: data.branch,
    applied: data.applied,
    skipped: data.skipped,
    prUrl: data.prUrl,
    dryRun: data.dryRun,
  };
}

// ── Job (PRD → delivery pipeline) ────────────────────

export type JobStatus =
  | 'decomposing'
  | 'planning'
  | 'delegating'
  | 'reviewing'
  | 'qa'
  | 'complete'
  | 'paused'
  | 'cancelled';

export type JobTaskStatus =
  | 'pending'
  | 'running'
  | 'committed'
  | 'reviewed'
  | 'failed'
  | 'skipped'
  | 'blocked';

export interface JobTask {
  id: string;
  title: string;
  description: string;
  dependsOn: string[];
  status: JobTaskStatus;
  attempt: number;
  changeRequestId?: string;
  commitSha?: string;
  baseSha?: string;
  currentPhase?: string;
  /** Plan v3 — propagated from plan_item.is_new_build through planItemsToTasks. */
  isNewBuild?: boolean;
  /** Plan v3 Phase 2 — per-task file changes captured from the adapter; used
   * by buildJobSummary to compute leaf-only canRevert without re-running git. */
  changedFiles?: string[];
  review?: {
    verdict: 'pass' | 'fail';
    /** Plan v3 — 'warning' tasks auto-progress with the review note preserved
     * for the final summary; 'critical' tasks pause the whole job. */
    severity?: 'critical' | 'warning';
    notes: string;
    acceptedByUser?: boolean;
  };
}

/** Plan v3 Phase 2 — derived view computed by orchestrator on each /api/job/:id
 * read. Race-free (pure function from task state), so the chat-history
 * persistence flow doesn't need a separate atomic-persist pass. */
export interface JobSummary {
  total: number;
  reviewed: number;
  skipped: number;
  blocked: number;
  failed: number;
  pending: number;
  warningCount: number;
  warnings: Array<{
    taskId: string;
    title: string;
    notes: string;
    commitSha?: string;
    isNewBuild: boolean;
    /** Leaf-only revert — true iff no later task changed any file this task
     * also changed. The Phase 2 UI greys out the revert button when false. */
    canRevert: boolean;
  }>;
  changedFiles: string[];
  finalSha?: string;
}

export type QaStrategyId =
  | 'inline_per_task'
  | 'final_route_smoke'
  | 'visual_diff'
  | 'lint_only'
  | 'human_only'
  | 'agent_review';

export interface Job {
  id: string;
  playgroundId: string;
  prdText: string;
  status: JobStatus;
  tasks: JobTask[];
  /** Plan v3 Phase 2 — derived view, attached by GET /api/job/:id on each read. */
  summary?: JobSummary;
  currentTaskId?: string;
  pausedReason?: string;
  qaStrategy?: QaStrategyId;
  qaRationale?: string;
  /** @deprecated use qaRationale — back-compat for old state files */
  qaRationaleKo?: string;
  /**
   * PRD-specific risk lines emitted by the decomposer. Surfaced in
   * the plan UI so the user signs off on the watch-outs along with
   * the task list. Empty / missing array = no risks worth calling
   * out (the decomposer prompt explicitly suppresses generic ones).
   */
  risks?: string[];
  /** @deprecated use risks — back-compat for old state files */
  risksKo?: string[];
  /**
   * Outcome of the auto-QA run picked by `qaStrategy`. Stamped by the
   * orchestrator's QA runner once the job lands at status `qa`. Pure
   * metadata — does NOT gate completion. The manual `markQaPass`
   * button remains the human override that flips qa → complete.
   */
  qaAutoResult?: {
    strategy: QaStrategyId;
    passed: boolean;
    notes: string;
    ranAt: number;
    evidence?: Record<string, unknown>;
  };
  /**
   * LLM-picked URL path the user should visit to see this job's
   * delivered output. Populated by the decomposer when the PRD has a
   * single obvious landing page (e.g. "/post-creative-review").
   * Optional — multi-page or backend-only jobs leave this unset.
   */
  targetRoute?: string;
  createdAt: number;
  updatedAt: number;
}

async function jobJson<T extends object>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const resp = await fetch(`${ORCHESTRATOR_URL}${path}`, init);
  let data: { ok?: boolean; error?: string } & Partial<T> = {};
  try {
    data = (await resp.json()) as typeof data;
  } catch {
    throw new OrchestratorError(
      `Job response parse failed (HTTP ${resp.status})`,
      resp.status,
    );
  }
  if (!resp.ok || !data.ok) {
    throw new OrchestratorError(data.error || `HTTP ${resp.status}`, resp.status);
  }
  return data as T;
}

export async function createJob(
  playgroundId: string,
  prdText: string,
): Promise<Job> {
  const data = await jobJson<{ job: Job }>(
    `/api/playground/${encodeURIComponent(playgroundId)}/job`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prdText }),
    },
  );
  return data.job;
}

export async function getJob(id: string): Promise<Job> {
  const data = await jobJson<{ job: Job }>(`/api/job/${encodeURIComponent(id)}`);
  return data.job;
}

export async function listJobs(): Promise<Job[]> {
  const data = await jobJson<{ jobs: Job[] }>('/api/job');
  return data.jobs;
}

async function jobAction(
  id: string,
  action: string,
  body?: object,
): Promise<Job> {
  const data = await jobJson<{ job: Job }>(
    `/api/job/${encodeURIComponent(id)}/${action}`,
    {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  return data.job;
}

export const approveJobPlan = (id: string) => jobAction(id, 'approve-plan');
export const retryJobTask = (
  id: string,
  taskId: string,
  actionMeta?: { reason?: string; reasonText?: string },
) => jobAction(id, 'retry-task', { taskId, ...actionMeta });
export const acceptJobTask = (
  id: string,
  taskId: string,
  actionMeta?: { reason?: string; reasonText?: string },
) => jobAction(id, 'accept-task', { taskId, ...actionMeta });
export const skipJobTask = (
  id: string,
  taskId: string,
  actionMeta?: { reason?: string; reasonText?: string },
) => jobAction(id, 'skip-task', { taskId, ...actionMeta });
export const unblockJobTask = (id: string, taskId: string) =>
  jobAction(id, 'unblock-task', { taskId });
/**
 * Cancel a running job.
 * @param rewind If true, also revert the playground's HEAD to the sha
 *   snapshotted at job creation — undoes every commit this job landed
 *   (`baselineHeadSha`). Equivalent to clicking "Cancel this job and revert changes".
 */
export const cancelJob = (id: string, rewind = false) =>
  jobAction(id, 'cancel', rewind ? { rewind: true } : undefined);
export const resumeJob = (id: string, target: JobStatus = 'delegating') =>
  jobAction(id, 'resume', { target });
/**
 * @param feedback Optional free-form natural-language note steering the
 *   LLM toward specific structural changes ("split step 3 in two and remove the auth-guard task").
 *   When omitted, behaves as a plain "re-plan".
 */
export const redecomposeJob = (id: string, feedback?: string) =>
  jobAction(id, 'decompose', feedback ? { feedback } : undefined);
/**
 * Replace the job's task list (direct edit). Server validates that the
 * job is still in a pre-delegation phase. Use for surgical title /
 * description / dependsOn edits when re-running the decomposer would
 * be overkill.
 */
export const updateJobTasks = (
  id: string,
  tasks: Pick<JobTask, 'id' | 'title' | 'description' | 'dependsOn'>[],
) => jobAction(id, 'tasks', { tasks });
export const markQaPass = (id: string) => jobAction(id, 'mark-qa-pass');
/**
 * Re-fire the auto-QA strategy for a job sitting at status `qa`. Used
 * when the user wants to retry after a transient failure (timeout,
 * playground was being restarted, etc) without having to re-run the
 * whole task pipeline.
 */
export const rerunJobQa = (id: string) => jobAction(id, 'rerun-qa');

// ─── Chat persistence (per playground) ────────────────────────────────
//
// localStorage handles fast first paint; the server is the source of
// truth across browser sessions. Client owns the schema — the server
// round-trips an opaque message array.

export async function getChatMessages<T = unknown>(
  playgroundId: string,
): Promise<T[]> {
  const resp = await fetch(
    `${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/chat`,
  );
  if (!resp.ok) {
    throw new Error(`getChat ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json();
  return Array.isArray(data?.messages) ? (data.messages as T[]) : [];
}

// ─── Playground commit log (branch viz) ──────────────────────────────

export interface PlaygroundCommit {
  sha: string;
  parents: string[];
  timestamp: number;
  message: string;
}

export interface PlaygroundLog {
  commits: PlaygroundCommit[];
  headSha: string | null;
  baselineSha: string | null;
}

export async function getPlaygroundLog(
  playgroundId: string,
): Promise<PlaygroundLog> {
  const resp = await fetch(
    `${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/log`,
  );
  if (!resp.ok) {
    throw new Error(`getLog ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json();
  return {
    commits: Array.isArray(data?.commits) ? data.commits : [],
    headSha: data?.headSha ?? null,
    baselineSha: data?.baselineSha ?? null,
  };
}

export async function putChatMessages<T = unknown>(
  playgroundId: string,
  messages: T[],
): Promise<void> {
  const resp = await fetch(
    `${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/chat`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages }),
    },
  );
  if (!resp.ok) {
    throw new Error(`putChat ${resp.status}: ${await resp.text()}`);
  }
}

// ── Pin (comment) CRUD — server sync (P5.3) ────────────────

import type { PinComment, PinReply } from '../store/pin-store';

export const pinClient = {
  list: async (playgroundId: string): Promise<PinComment[]> => {
    const r = await fetch(
      `${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/pins`,
    );
    const body = await r.json().catch(() => ({ ok: false }));
    if (!r.ok || body.ok === false) return [];
    return Array.isArray(body.pins) ? (body.pins as PinComment[]) : [];
  },

  create: async (playgroundId: string, pin: PinComment): Promise<PinComment | null> => {
    const r = await fetch(
      `${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/pins`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pin),
      },
    );
    const body = await r.json().catch(() => ({ ok: false }));
    if (!r.ok || body.ok === false) {
      console.warn('[pinClient.create] failed', body?.error || r.status);
      return null;
    }
    return body.pin as PinComment;
  },

  update: async (
    playgroundId: string,
    pinId: string,
    patch: Partial<PinComment>,
  ): Promise<PinComment | null> => {
    const r = await fetch(
      `${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/pins/${encodeURIComponent(pinId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      },
    );
    const body = await r.json().catch(() => ({ ok: false }));
    if (!r.ok || body.ok === false) {
      console.warn('[pinClient.update] failed', body?.error || r.status);
      return null;
    }
    return body.pin as PinComment;
  },

  delete: async (playgroundId: string, pinId: string): Promise<boolean> => {
    const r = await fetch(
      `${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/pins/${encodeURIComponent(pinId)}`,
      { method: 'DELETE' },
    );
    if (!r.ok) {
      console.warn('[pinClient.delete] failed', r.status);
      return false;
    }
    return true;
  },

  addReply: async (
    playgroundId: string,
    pinId: string,
    reply: PinReply,
  ): Promise<PinReply | null> => {
    const r = await fetch(
      `${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/pins/${encodeURIComponent(pinId)}/replies`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reply),
      },
    );
    const body = await r.json().catch(() => ({ ok: false }));
    if (!r.ok || body.ok === false) {
      console.warn('[pinClient.addReply] failed', body?.error || r.status);
      return null;
    }
    return body.reply as PinReply;
  },

  updateReply: async (
    playgroundId: string,
    pinId: string,
    replyId: string,
    patch: Partial<PinReply>,
  ): Promise<PinReply | null> => {
    const r = await fetch(
      `${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/pins/${encodeURIComponent(pinId)}/replies/${encodeURIComponent(replyId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      },
    );
    const body = await r.json().catch(() => ({ ok: false }));
    if (!r.ok || body.ok === false) {
      console.warn('[pinClient.updateReply] failed', body?.error || r.status);
      return null;
    }
    return body.reply as PinReply;
  },

  deleteReply: async (
    playgroundId: string,
    pinId: string,
    replyId: string,
  ): Promise<boolean> => {
    const r = await fetch(
      `${ORCHESTRATOR_URL}/api/playground/${encodeURIComponent(playgroundId)}/pins/${encodeURIComponent(pinId)}/replies/${encodeURIComponent(replyId)}`,
      { method: 'DELETE' },
    );
    if (!r.ok) {
      console.warn('[pinClient.deleteReply] failed', r.status);
      return false;
    }
    return true;
  },
};
