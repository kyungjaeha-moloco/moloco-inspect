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
  /** Present when the assistant message carries a structured plan. */
  plan?: {
    meta: PlanMeta;
    items: PlanItem[];
  };
  /** Plan has been accepted / rejected — dimmed or highlighted in UI. */
  planResolved?: 'accepted' | 'rejected';
  /** Present when this message is showing an execution. */
  execution?: ExecutionState;
  timestamp: number;
}

export interface ExecutionProgress {
  stage: string;
  message: string;
  timestamp: number;
}

/** Live-preview interaction mode over the iframe. See v3 plan §7.2. */
export type IframeMode = 'view' | 'pick' | 'pin';

interface PlaygroundStoreState {
  /** Playground whose detail page is open, or null before load. */
  current: Playground | null;
  /** Iframe-overlay mode — view (block clicks) / pick / pin. */
  mode: IframeMode;
  messages: ChatMessage[];
  isSending: boolean;
  error: string | null;
  /** Orchestrator queue depth reported at enqueue time — display only. */
  queueDepth: number;
  progress: ExecutionProgress[];

  setCurrent(pg: Playground | null): void;
  mergeCurrent(patch: Partial<Playground>): void;
  setMode(mode: IframeMode): void;
  setSending(isSending: boolean): void;
  setError(error: string | null): void;
  setQueueDepth(n: number): void;
  pushProgress(entry: ExecutionProgress): void;

  addUserMessage(content: string): ChatMessage;
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

const initial: Pick<
  PlaygroundStoreState,
  'current' | 'mode' | 'messages' | 'isSending' | 'error' | 'queueDepth' | 'progress'
> = {
  current: null,
  mode: 'view',
  messages: [],
  isSending: false,
  error: null,
  queueDepth: 0,
  progress: [],
};

export const usePlaygroundStore = create<PlaygroundStoreState>((set) => ({
  ...initial,

  setCurrent: (current) => set({ current }),
  mergeCurrent: (patch) =>
    set((state) =>
      state.current ? { current: { ...state.current, ...patch } } : {},
    ),
  setMode: (mode) => set({ mode }),
  setSending: (isSending) => set({ isSending }),
  setError: (error) => set({ error }),
  setQueueDepth: (queueDepth) => set({ queueDepth }),
  pushProgress: (entry) =>
    set((state) => ({ progress: [...state.progress, entry] })),

  addUserMessage: (content) => {
    const msg: ChatMessage = {
      id: nextId('u'),
      role: 'user',
      content,
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
