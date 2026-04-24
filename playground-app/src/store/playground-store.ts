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
import type { Playground } from '../services/orchestrator-client';
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
   * Drives the inline "이 시점으로 돌아가기" button on ExecutionCard.
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
   * log (instead of collapsing into the raw "[선택된 요소: ...]" prefix).
   */
  attachedElement?: BridgeElementContext;
  /** Present when the assistant message carries a structured plan. */
  plan?: {
    meta: PlanMeta;
    items: PlanItem[];
  };
  /** Plan has been accepted / rejected — dimmed or highlighted in UI. */
  planResolved?: 'accepted' | 'rejected';
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
  updateExecution(messageId: string, patch: Partial<ExecutionState>): void;
  resolvePlan(messageId: string, outcome: 'accepted' | 'rejected'): void;
  togglePlanItem(messageId: string, itemId: string): void;

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
    set((state) => {
      if (!current) return { current: null, messages: [] };
      const sameId = state.current?.id === current.id;
      return sameId
        ? { current }
        : { current, messages: loadChatFromStorage(current.id) };
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

  reset: () => set({ ...initial }),
}));

// Persist chat on every change, keyed by the currently-open playground.
// Skipping when `current` is null avoids clobbering another playground's
// thread during the brief window between reset() and setCurrent().
usePlaygroundStore.subscribe((state, prev) => {
  if (!state.current) return;
  if (state.messages === prev.messages) return;
  saveChatToStorage(state.current.id, state.messages);
});
