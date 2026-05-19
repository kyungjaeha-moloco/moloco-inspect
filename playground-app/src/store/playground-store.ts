/**
 * Playground store — per-playground UI state for the /p/:id screen.
 *
 * Chat thread + iframe interaction mode + current Playground reference.
 * Persistence lives on the orchestrator side; this store only holds the
 * state the 2-pane UI needs to render.
 *
 * Chat message types are now owned here; the old wizard-store was
 * removed with the canvas cleanup.
 */

import { create } from 'zustand';
import {
  getChatMessages,
  putChatMessages,
  type IntakeKind,
  type Playground,
} from '../services/orchestrator-client';
import type { BridgeElementContext } from '../services/playground-bridge';

export type WizardPhase = 'idle' | 'chatting' | 'executing' | 'done' | 'error';

export type TargetClient =
  | 'msm-default'
  | 'tving'
  | 'shortmax'
  | 'onboard-demo';

export interface PlanItem {
  id: string;
  title: string;
  description?: string;
  patternId?: string;
  targetFile?: string;
  /** Plan v3 — set by plan-emitter when this item introduces UI without a
   * DS equivalent. Reviewer skips DS-equivalence check (Rule 7) for this task. */
  isNewBuild?: boolean;
  dependsOn?: string[];
  enabled: boolean;
}

export interface PlanMeta {
  intent: string;
  targetEntity: string | null;
  summary: string;
  targetClient?: TargetClient;
  targetRoute?: string;
  visualConstraints: string[];
}

export interface PlanClosestMatch {
  name: string;
  importStatement: string | null;
  similarity_score: number;
  reasoning: string;
}

export interface PlanUnresolvedComponent {
  intent: string;
  reason: string;
  kind: 'new_component' | 'extension' | 'composition_miss';
  closest_match: PlanClosestMatch | null;
  /** Tracks which 4-option choice the user clicked, for de-duping the UI card. */
  resolution?: 'closest_match' | 'custom_build' | 'propose_new' | 'extend_existing';
  /** Draft preview body returned by /api/missing-choice for ⓒ/ⓓ. */
  draftPreview?: string;
}

/**
 * Plan v3 (DS missing AI judge + governance) — surface-side render hint for an
 * escalation row that lives in the orchestrator governance queue. Plan card
 * shows a single subtle line per notice with the ref_id so the user knows the
 * DS team has been notified but the AI is proceeding anyway.
 */
export interface EscalationNotice {
  refId: string;
  intent: string;
  unresolvedKind: 'new_component' | 'extension' | 'composition_miss' | string;
  closestMatch: string | null;
  closestSimilarity: number | null;
  status: 'awaiting_judge' | 'pending' | 'in_review' | 'resolved' | 'dismissed';
}

export interface ExecutionState {
  requestId: string;
  status: 'processing' | 'preview' | 'approved' | 'error' | string;
  phase: string;
  phasesSeen: string[];
  latestLog?: string | null;
  screenshotUrl?: string | null;
  diffUrl?: string | null;
  changedFiles?: string[];
  error?: string | null;
  /**
   * Playground HEAD sha captured right after this execution's commit landed.
   * Drives the inline "Go back to this point" button on ExecutionCard.
   */
  commitSha?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /**
   * Element the user picked and attached at send time — rendered as a
   * chip inside the bubble so the visual reference survives in the chat
   * log (instead of collapsing into the raw "[selected element: ...]" prefix).
   */
  attachedElement?: BridgeElementContext;
  /**
   * Set when the user sends a fresh prompt after time-travelling away
   * from this message's commit. The UI groups consecutive archived
   * messages into a single collapsed "old branch" accordion so the
   * main chat timeline isn't cluttered by work that's been rewound
   * past. Archive is UI-only; the messages (and their commits on the
   * git branch) are still here.
   */
  archived?: boolean;
  /** Present when the assistant message carries a structured plan. */
  plan?: {
    meta: PlanMeta;
    items: PlanItem[];
    /** DS Escalation Slice A — unresolved DS gaps surfaced by the planner. */
    unresolvedComponents?: PlanUnresolvedComponent[];
    /** Plan v3 — DS owner escalation pointers (governance queue refs). */
    escalationNotices?: EscalationNotice[];
  };
  /** Plan has been accepted / rejected — dimmed or highlighted in UI. */
  planResolved?: 'accepted' | 'rejected';
  /**
   * assistant only — the previous IntakeResult.kind. Used by history-aware intake
   * (sub-phase C) for multi-turn dispatch decisions. Not present on old messages,
   * so readers should fall back with `m.kind ?? heuristic` (has m.plan → infer 'plan_emit').
   */
  kind?: IntakeKind;
  /**
   * IntakeResult.clarifyingQuestion for code_change_ambiguous. Used for UI rendering
   * and as context by the dispatcher on the following turn.
   */
  clarifyingQuestion?: string;
  /** Present when this message is showing an execution. */
  execution?: ExecutionState;
  /**
   * Present when this message represents an ongoing multi-task PRD
   * job — AIPanel renders a live JobCard inline in place of the usual
   * text / plan / execution treatment. The JobCard polls the server
   * for task-level state.
   */
  jobId?: string;
  timestamp: number;
}

export interface ExecutionProgress {
  stage: string;
  message: string;
  timestamp: number;
}

/**
 * Live-preview interaction mode over the iframe.
 *
 * - `interactive` (default): no overlay, iframe receives native clicks
 *   and scrolls. The user browses the sandboxed app naturally.
 * - `pick`: element picker runtime captures hover/click inside the
 *   iframe and reports back via the postMessage bridge. Toggled from
 *   the AIPanel input toolbar.
 * - `comment`: parent overlay captures clicks to drop pin comments
 *   (formerly the "pin" mode). Toggled from the right-pane toolbar.
 *
 * All three are mutually exclusive. Switching into one always leaves
 * the others off.
 */
export type IframeMode = 'interactive' | 'pick' | 'comment';

interface PlaygroundStoreState {
  /** Playground whose detail page is open, or null before load. */
  current: Playground | null;
  /** Iframe-overlay mode — interactive (default) / pick / comment. */
  mode: IframeMode;
  messages: ChatMessage[];
  isSending: boolean;
  error: string | null;
  /** Orchestrator queue depth reported at enqueue time — display only. */
  queueDepth: number;
  progress: ExecutionProgress[];

  /**
   * Current pathname inside the iframe. Updated by the M3 bridge on
   * SPA `history.pushState` / `popstate`. `null` until the child sends
   * its first route event (usually right after `playground.ready`).
   * Used to scope pin visibility to the route the pin was placed on.
   */
  currentRoute: string | null;
  /**
   * Cross-component nav request — when set, LivePreview's effect
   * forwards `path` to the iframe runtime via the bridge so the SPA
   * navigates without a full reload. The token is incremented every
   * call so re-requesting the same path still fires (e.g. user
   * clicks "Open result page" twice in a row).
   */
  requestedIframeNav: { path: string; token: number } | null;

  /**
   * Last element the user picked in Pick mode — surfaces the picker
   * payload to AI prompts and the pin-attach flow. Cleared on mode
   * switch out of Pick.
   */
  lastPickedElement: BridgeElementContext | null;

  /**
   * Viewport-relative bounding box of `lastPickedElement`, captured at
   * pick time. Drives a persistent outline over the iframe so the user
   * can *see* what they picked after the pick mode drops back to
   * interactive. Drifts if the iframe scrolls; users can re-pick.
   */
  lastPickedBbox: { x: number; y: number; width: number; height: number } | null;

  setCurrent(pg: Playground | null): void;
  mergeCurrent(patch: Partial<Playground>): void;
  setMode(mode: IframeMode): void;
  setSending(isSending: boolean): void;
  setError(error: string | null): void;
  setQueueDepth(n: number): void;
  pushProgress(entry: ExecutionProgress): void;

  setCurrentRoute(route: string | null): void;
  /** Ask LivePreview's iframe runtime to SPA-navigate to `path`. */
  requestIframeNav(path: string): void;
  setLastPickedElement(element: BridgeElementContext | null): void;
  /** Atomic setter used right after a pick so outline + chip land together. */
  setLastPicked(
    element: BridgeElementContext | null,
    bbox: { x: number; y: number; width: number; height: number } | null,
  ): void;

  addUserMessage(
    content: string,
    attachedElement?: BridgeElementContext,
  ): ChatMessage;
  addAssistantMessage(
    msg: Omit<ChatMessage, 'id' | 'role' | 'timestamp'>,
  ): ChatMessage;
  updateMessage(messageId: string, patch: Partial<ChatMessage>): void;
  /** Flip `archived=true` on every message below `anchorMessageId`. */
  archiveMessagesAfter(anchorMessageId: string): void;
  updateExecution(messageId: string, patch: Partial<ExecutionState>): void;
  resolvePlan(messageId: string, outcome: 'accepted' | 'rejected'): void;
  togglePlanItem(messageId: string, itemId: string): void;
  /**
   * "Re-plan" — replace the plan on the same message with a new plan.
   * Swaps both meta + items entirely. planResolved is reset (decision required again).
   */
  replacePlan(messageId: string, plan: { meta: PlanMeta; items: PlanItem[] }): void;
  /**
   * DS Escalation Slice A — record which of the 4 options the user picked
   * for a specific unresolved component on a plan message. Optional draft
   * preview body returned by `/api/missing-choice` for ⓒ/ⓓ.
   */
  resolveMissingComponent(
    messageId: string,
    componentIntent: string,
    resolution: 'closest_match' | 'custom_build' | 'propose_new' | 'extend_existing',
    draftPreview?: string,
  ): void;

  /** Drop all per-playground state — used when leaving /p/:id. */
  reset(): void;
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── Chat persistence (per-playground) ────────────────────────────────
//
// Keyed by playgroundId so each playground has its own thread. Stored
// as a plain JSON array of ChatMessage. Missing / malformed entries are
// treated as an empty thread — never throw on corrupt data.
const CHAT_STORAGE_PREFIX = 'moloco-playground:v3:chat:';

function chatStorageKey(playgroundId: string) {
  return `${CHAT_STORAGE_PREFIX}${playgroundId}`;
}

function loadChatFromStorage(playgroundId: string): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(chatStorageKey(playgroundId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

// Tracks the playground id whose server hydration is in-flight so a
// rapid playground switch doesn't allow a stale fetch to clobber the
// new thread. Updated by `setCurrent`.
let pendingHydrate: string | null = null;
// Periodic polling for server-side chat updates (e.g. molly writing
// from Slack). Without this, messages added on the server only show
// up after the user manually refreshes — disorienting when working
// across surfaces. Runs only while a playground is mounted; cleared
// in setCurrent(null) and on every playground swap.
let chatPollInterval: ReturnType<typeof setInterval> | null = null;
const CHAT_POLL_MS = 4000;

// Debounce handle for the server PUT — coalesces rapid mutations (e.g.
// streaming an assistant message word-by-word) into a single request.
let chatPutTimer: ReturnType<typeof setTimeout> | null = null;

function saveChatToStorage(playgroundId: string, messages: ChatMessage[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      chatStorageKey(playgroundId),
      JSON.stringify(messages),
    );
  } catch {
    // Quota or serialization failure — silent drop is fine, the thread
    // will just re-fill from the in-memory store on this session.
  }
}

const initial: Pick<
  PlaygroundStoreState,
  | 'current'
  | 'mode'
  | 'messages'
  | 'isSending'
  | 'error'
  | 'queueDepth'
  | 'progress'
  | 'currentRoute'
  | 'requestedIframeNav'
  | 'lastPickedElement'
  | 'lastPickedBbox'
> = {
  current: null,
  mode: 'interactive',
  messages: [],
  isSending: false,
  error: null,
  queueDepth: 0,
  progress: [],
  currentRoute: null,
  requestedIframeNav: null,
  lastPickedElement: null,
  lastPickedBbox: null,
};

export const usePlaygroundStore = create<PlaygroundStoreState>((set) => ({
  ...initial,

  setCurrent: (current) =>
    // Switching playgrounds must pull that playground's thread back
    // into memory — otherwise the prior thread (or an empty array)
    // would leak across /p/:id navigation. When clearing (null), drop
    // the thread too so the next mount starts fresh.
    //
    // Two-stage hydration: render localStorage immediately for fast
    // paint, then async-fetch the server copy and replace if the
    // server has data (which it does whenever the user has touched
    // this playground from any browser before). The async fetch is
    // fire-and-forget — failure leaves the localStorage thread in
    // place. Reentrancy guard via `pendingHydrate` so flipping back
    // and forth between playgrounds doesn't race two fetches into
    // the same store.
    set((state) => {
      // Always reset any prior poll loop on any setCurrent transition;
      // we restart it below if `current` is non-null.
      if (chatPollInterval) {
        clearInterval(chatPollInterval);
        chatPollInterval = null;
      }
      if (!current) return { current: null, messages: [] };
      const sameId = state.current?.id === current.id;
      if (sameId) {
        startChatPoll(current.id);
        return { current };
      }
      pendingHydrate = current.id;
      const localMessages = loadChatFromStorage(current.id);
      void (async () => {
        try {
          const server = await getChatMessages<ChatMessage>(current.id);
          if (pendingHydrate !== current.id) return; // navigated away
          // Server is authoritative. If it has at least one message,
          // adopt it. Empty server with non-empty local = first-time
          // upload of the local thread, handled by the subscribe
          // below firing on the next mutation.
          if (server.length > 0) {
            usePlaygroundStore.setState((s) =>
              s.current?.id === current.id ? { messages: server } : s,
            );
          } else if (localMessages.length > 0) {
            // Seed the server with whatever was kept in localStorage so
            // a fresh device sees this playground's thread next time.
            try {
              await putChatMessages(current.id, localMessages);
            } catch {
              /* best-effort upload */
            }
          }
        } catch {
          /* network down / orchestrator off — localStorage stays */
        }
      })();
      startChatPoll(current.id);
      return { current, messages: localMessages };
    }),
  mergeCurrent: (patch) =>
    set((state) =>
      state.current ? { current: { ...state.current, ...patch } } : {},
    ),
  setMode: (mode) =>
    // Leaving Pick keeps `lastPickedElement` + `lastPickedBbox` around —
    // the user needs them to remember *what* they just picked after the
    // mode bounces back to interactive. They clear on explicit chip
    // dismissal (setLastPickedElement(null) / setLastPicked(null,null)).
    set({ mode }),
  setSending: (isSending) => set({ isSending }),
  setError: (error) => set({ error }),
  setQueueDepth: (queueDepth) => set({ queueDepth }),
  pushProgress: (entry) =>
    set((state) => ({ progress: [...state.progress, entry] })),

  setCurrentRoute: (currentRoute) => set({ currentRoute }),
  requestIframeNav: (path) =>
    set((state) => ({
      requestedIframeNav: {
        path,
        token: (state.requestedIframeNav?.token ?? 0) + 1,
      },
    })),
  setLastPickedElement: (lastPickedElement) =>
    // Clearing the element clears its paired bbox too — there's no
    // sensible case where we'd keep a stale outline after the chip is
    // dismissed.
    set(lastPickedElement === null
      ? { lastPickedElement: null, lastPickedBbox: null }
      : { lastPickedElement }),
  setLastPicked: (lastPickedElement, lastPickedBbox) =>
    set({ lastPickedElement, lastPickedBbox }),

  addUserMessage: (content, attachedElement) => {
    const msg: ChatMessage = {
      id: nextId('u'),
      role: 'user',
      content,
      ...(attachedElement ? { attachedElement } : {}),
      timestamp: Date.now(),
    };
    set((state) => ({ messages: [...state.messages, msg] }));
    return msg;
  },

  addAssistantMessage: (msg) => {
    const full: ChatMessage = {
      id: nextId('a'),
      role: 'assistant',
      timestamp: Date.now(),
      ...msg,
    };
    set((state) => ({ messages: [...state.messages, full] }));
    return full;
  },

  updateMessage: (messageId, patch) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, ...patch } : m,
      ),
    })),

  archiveMessagesAfter: (anchorMessageId) =>
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === anchorMessageId);
      if (idx < 0) return {};
      const next = state.messages.map((m, i) =>
        i > idx && !m.archived ? { ...m, archived: true } : m,
      );
      return { messages: next };
    }),

  updateExecution: (messageId, patch) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m;
        const base: ExecutionState = m.execution
          ? { ...m.execution }
          : {
              requestId: patch.requestId ?? '',
              status: 'processing',
              phase: 'queued',
              phasesSeen: [],
            };
        const next: ExecutionState = { ...base, ...patch };
        if (patch.phase && !next.phasesSeen.includes(patch.phase)) {
          next.phasesSeen = [...next.phasesSeen, patch.phase];
        }
        return { ...m, execution: next };
      }),
    })),

  resolvePlan: (messageId, outcome) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, planResolved: outcome } : m,
      ),
    })),

  togglePlanItem: (messageId, itemId) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId || !m.plan) return m;
        return {
          ...m,
          plan: {
            ...m.plan,
            items: m.plan.items.map((it) =>
              it.id === itemId ? { ...it, enabled: !it.enabled } : it,
            ),
          },
        };
      }),
    })),

  replacePlan: (messageId, plan) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m;
        return {
          ...m,
          plan,
          // New plan — invalidates the previous accept/reject decision. User decides again.
          planResolved: undefined,
        };
      }),
    })),

  resolveMissingComponent: (messageId, componentIntent, resolution, draftPreview) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId || !m.plan?.unresolvedComponents) return m;
        return {
          ...m,
          plan: {
            ...m.plan,
            unresolvedComponents: m.plan.unresolvedComponents.map((u) =>
              u.intent === componentIntent
                ? { ...u, resolution, ...(draftPreview ? { draftPreview } : {}) }
                : u,
            ),
          },
        };
      }),
    })),

  reset: () => set({ ...initial }),
}));

/**
 * Server → client chat sync. Fires every CHAT_POLL_MS while a
 * playground is mounted. Pulls the server's `messages` array, merges
 * any server-only ids into the local store (sorted by timestamp).
 *
 * Why polling vs SSE: existing SSE infra is per-change-request, not
 * per-playground. A 4s poll is cheap (small JSON body, infrequent
 * writers) and keeps the surface area small. SSE/websocket can
 * replace this later if poll churn becomes noticeable.
 *
 * Local pending writes are preserved — server-only messages append
 * to the existing array, never replace.
 */
function startChatPoll(playgroundId: string) {
  if (chatPollInterval) {
    clearInterval(chatPollInterval);
  }
  chatPollInterval = setInterval(() => {
    void pollChatOnce(playgroundId);
  }, CHAT_POLL_MS);
}

async function pollChatOnce(playgroundId: string) {
  const state = usePlaygroundStore.getState();
  if (state.current?.id !== playgroundId) {
    // Playground was swapped away mid-tick. Caller's setCurrent path
    // already cleared the interval; this is just defense.
    return;
  }
  let server: ChatMessage[];
  try {
    server = await getChatMessages<ChatMessage>(playgroundId);
  } catch {
    // Orchestrator down / network glitch — silent retry next tick.
    return;
  }
  // Re-read after await — user may have navigated away or the poll
  // interval was cleared while we were in flight.
  const cur = usePlaygroundStore.getState();
  if (cur.current?.id !== playgroundId) return;
  const localIds = new Set(cur.messages.map((m) => m.id));
  const newOnes = server.filter((m) => !localIds.has(m.id));
  if (newOnes.length === 0) return;
  const merged = [...cur.messages, ...newOnes].sort(
    (a, b) => a.timestamp - b.timestamp,
  );
  usePlaygroundStore.setState((s) =>
    s.current?.id === playgroundId ? { messages: merged } : s,
  );
}

// Persist chat on every change, keyed by the currently-open playground.
// Skipping when `current` is null avoids clobbering another playground's
// thread during the brief window between reset() and setCurrent().
//
// Two-tier persistence:
//   - localStorage: synchronous, instant — used for first-paint hydrate
//     when the page reopens in the same browser.
//   - server PUT: debounced 500ms — survives browser switches /
//     incognito / new devices. Fire-and-forget; a transient network
//     error just leaves the server one revision behind until the next
//     mutation flushes it.
usePlaygroundStore.subscribe((state, prev) => {
  if (!state.current) return;
  if (state.messages === prev.messages) return;
  const playgroundId = state.current.id;
  const messages = state.messages;
  saveChatToStorage(playgroundId, messages);
  if (chatPutTimer) clearTimeout(chatPutTimer);
  chatPutTimer = setTimeout(() => {
    chatPutTimer = null;
    putChatMessages(playgroundId, messages).catch(() => {
      /* see comment above */
    });
  }, 500);
});
