/**
 * Pin comment store — absolute-positioned comments on top of the live
 * iframe, scoped per playground. Replaces the old canvas feedback-store.
 *
 * Persistence: localStorage, keyed `moloco-playground:v3:pins:<playgroundId>`.
 * We keep pins local-only for MVP — multi-user sharing arrives in Phase 2
 * along with the rest of the playground SaaSification.
 */

import { create } from 'zustand';
import type { BridgeElementContext } from '../services/playground-bridge';
import { pinClient } from '../services/orchestrator-client';

/**
 * Identifier bundle pulled from the sandbox's React tree via the Vite
 * picker plugin. Shipped in M3; coordinate-only pins leave this undefined
 * and fall back to `(x, y)`. See v3 plan §5.2 and spike A4.
 *
 * Re-exported alias of `BridgeElementContext` so downstream code keeps
 * importing `ElementContext` from the pin store while the canonical
 * shape lives next to the wire protocol.
 */
export type ElementContext = BridgeElementContext;

export interface PinReply {
  id: string;
  text: string;
  createdAt: number;
}

export interface PinComment {
  id: string;
  playgroundId: string;
  /** Overlay-relative coordinates in CSS pixels. Captured from the mouse
   * event at the time the user placed the pin in Pin mode. */
  x: number;
  y: number;
  /** Commit sha the sandbox was on when this pin was dropped. Used to
   * annotate stale pins once HEAD moves past it. */
  commitSha?: string;
  /**
   * iframe pathname at placement time. For SPA navigation we can't detect
   * route changes from the parent (cross-origin), so this is best-effort
   * and tracks only full-loads. M3 swaps this for a postMessage-driven
   * live route captured by the Vite picker plugin.
   */
  route?: string;
  /**
   * Semantic target the pin refers to. Populated by the Vite picker in
   * M3. Until then pins rely on `(x, y)` alone and this stays undefined.
   */
  element?: ElementContext;
  text: string;
  replies?: PinReply[];
  createdAt: number;
  resolvedAt?: number;
}

interface PinStoreState {
  /** All pins loaded for the currently open playground. */
  pins: PinComment[];
  /** Pin currently being edited (focused input), or null. */
  editingPinId: string | null;
  /** Pin currently selected in the UI (e.g., highlighted in CommentRow, pulsing in iframe). */
  selectedPinId: string | null;

  loadForPlayground(playgroundId: string): void;
  addPin(input: {
    playgroundId: string;
    x: number;
    y: number;
    commitSha?: string;
    route?: string;
    /** Optional semantic target from the picker (M3). */
    element?: ElementContext;
  }): PinComment;
  updatePinText(id: string, text: string): void;
  deletePin(id: string): void;
  toggleResolved(id: string): void;
  setEditing(id: string | null): void;
  selectPin(id: string | null): void;

  /** Append a reply under an existing pin. */
  addReply(pinId: string, text: string): void;
  /** Replace a reply's text (in-place edit). */
  updateReplyText(pinId: string, replyId: string, text: string): void;
  /** Remove a reply from its pin. */
  deleteReply(pinId: string, replyId: string): void;

  reset(): void;
}

const STORAGE_PREFIX = 'moloco-playground:v3:pins:';

function storageKey(playgroundId: string) {
  return `${STORAGE_PREFIX}${playgroundId}`;
}

function readPins(playgroundId: string): PinComment[] {
  try {
    const raw = localStorage.getItem(storageKey(playgroundId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[pin-store] failed to read pins:', err);
    return [];
  }
}

function writePins(playgroundId: string, pins: PinComment[]) {
  try {
    localStorage.setItem(storageKey(playgroundId), JSON.stringify(pins));
  } catch (err) {
    console.warn('[pin-store] failed to persist pins:', err);
  }
}

function nextId() {
  return `pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const usePinStore = create<PinStoreState>((set, get) => ({
  pins: [],
  editingPinId: null,
  selectedPinId: null,

  loadForPlayground: (playgroundId) => {
    // localStorage 먼저 (즉시 표시)
    const stored = readPins(playgroundId);
    set({ pins: stored, editingPinId: null, selectedPinId: null });
    // 그 다음 server sync (latency 후 reconcile)
    void pinClient.list(playgroundId).then((serverPins) => {
      if (serverPins.length === 0 && stored.length > 0) {
        // server 가 empty 인데 local 에 있음 — 첫 서버 진입 migration → backfill
        for (const p of stored) {
          void pinClient.create(playgroundId, p);
        }
        return; // local 유지
      }
      // server 에 데이터 있으면 server 가 source of truth
      set({ pins: serverPins });
      writePins(playgroundId, serverPins);
    }).catch((err) =>
      console.warn('[pin-store.loadForPlayground] server sync failed', err),
    );
  },

  addPin: ({ playgroundId, x, y, commitSha, route, element }) => {
    const pin: PinComment = {
      id: nextId(),
      playgroundId,
      x,
      y,
      commitSha,
      route,
      ...(element ? { element } : {}),
      text: '',
      createdAt: Date.now(),
    };
    const next = [...get().pins, pin];
    writePins(playgroundId, next);
    set({ pins: next, editingPinId: pin.id });
    // background server sync
    void pinClient.create(playgroundId, pin).catch((err) =>
      console.warn('[pin-store.addPin] server sync failed', err),
    );
    return pin;
  },

  updatePinText: (id, text) => {
    const pins = get().pins.map((p) => (p.id === id ? { ...p, text } : p));
    const first = pins.find((p) => p.id === id);
    if (first) {
      writePins(first.playgroundId, pins);
      void pinClient.update(first.playgroundId, id, { text }).catch((err) =>
        console.warn('[pin-store.updatePinText] server sync failed', err),
      );
    }
    set({ pins });
  },

  deletePin: (id) => {
    const target = get().pins.find((p) => p.id === id);
    const next = get().pins.filter((p) => p.id !== id);
    if (target) {
      writePins(target.playgroundId, next);
      void pinClient.delete(target.playgroundId, id).catch((err) =>
        console.warn('[pin-store.deletePin] server sync failed', err),
      );
    }
    set({
      pins: next,
      editingPinId: get().editingPinId === id ? null : get().editingPinId,
    });
  },

  toggleResolved: (id) => {
    const pins = get().pins.map((p) =>
      p.id === id
        ? { ...p, resolvedAt: p.resolvedAt ? undefined : Date.now() }
        : p,
    );
    const updated = pins.find((p) => p.id === id);
    if (updated) {
      writePins(updated.playgroundId, pins);
      void pinClient.update(updated.playgroundId, id, { resolvedAt: updated.resolvedAt }).catch((err) =>
        console.warn('[pin-store.toggleResolved] server sync failed', err),
      );
    }
    set({ pins });
  },

  setEditing: (id) => set({ editingPinId: id }),

  selectPin: (id) => set({ selectedPinId: id }),

  addReply: (pinId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const reply: PinReply = {
      id: nextId().replace(/^pin-/, 'reply-'),
      text: trimmed,
      createdAt: Date.now(),
    };
    const pins = get().pins.map((p) =>
      p.id === pinId ? { ...p, replies: [...(p.replies ?? []), reply] } : p,
    );
    const first = pins.find((p) => p.id === pinId);
    if (first) {
      writePins(first.playgroundId, pins);
      void pinClient.addReply(first.playgroundId, pinId, reply).catch((err) =>
        console.warn('[pin-store.addReply] server sync failed', err),
      );
    }
    set({ pins });
  },

  updateReplyText: (pinId, replyId, text) => {
    const pins = get().pins.map((p) => {
      if (p.id !== pinId || !p.replies) return p;
      return {
        ...p,
        replies: p.replies.map((r) =>
          r.id === replyId ? { ...r, text } : r,
        ),
      };
    });
    const first = pins.find((p) => p.id === pinId);
    if (first) {
      writePins(first.playgroundId, pins);
      void pinClient.updateReply(first.playgroundId, pinId, replyId, { text }).catch((err) =>
        console.warn('[pin-store.updateReplyText] server sync failed', err),
      );
    }
    set({ pins });
  },

  deleteReply: (pinId, replyId) => {
    const pins = get().pins.map((p) => {
      if (p.id !== pinId || !p.replies) return p;
      return {
        ...p,
        replies: p.replies.filter((r) => r.id !== replyId),
      };
    });
    const first = pins.find((p) => p.id === pinId);
    if (first) {
      writePins(first.playgroundId, pins);
      void pinClient.deleteReply(first.playgroundId, pinId, replyId).catch((err) =>
        console.warn('[pin-store.deleteReply] server sync failed', err),
      );
    }
    set({ pins });
  },

  reset: () => set({ pins: [], editingPinId: null, selectedPinId: null }),
}));

export const STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Stale: sha가 현재 HEAD와 다르고 createdAt이 7일 이상 지났음.
 * 또는 resolved + resolvedAt이 7일 이상 지났음.
 * Active list에서 빼고 Archive 섹션으로.
 */
export function isPinStale(pin: PinComment, headSha: string | null): boolean {
  const now = Date.now();
  if (pin.resolvedAt && (now - pin.resolvedAt) > STALE_AGE_MS) return true;
  if (!pin.commitSha || !headSha) return false;
  if (pin.commitSha === headSha) return false;
  return (now - pin.createdAt) > STALE_AGE_MS;
}
