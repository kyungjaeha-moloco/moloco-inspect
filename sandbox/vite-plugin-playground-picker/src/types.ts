/**
 * Shared types for the playground picker plugin and its browser runtime.
 *
 * These types form the wire contract between the sandbox app (child) and
 * the playground-app (parent). Keep them intentionally plain — parent
 * TypeScript copies shape-compatible versions for its own imports
 * (see playground-app/src/services/playground-bridge.ts in M3 Step C).
 */

// ─── Element identification ──────────────────────────────────────────
//
// Priority order (v3 plan §14 E4 / spike A4):
//   1. data-testid  — cheap, stable, but only 0.97% of msm-portal files
//   2. React fiber displayName  — best-effort, breaks across React upgrades
//   3. CSS selector path (nth-child) — universal fallback
//   4. _debugSource → sourceFile:line — dev-only, most useful when present
//
// All fields are optional. A pick emits whatever was resolvable; consumers
// must handle the empty case gracefully.

export interface ElementContext {
  testId?: string;
  displayName?: string;
  selector?: string;
  sourceFile?: string;
  /** Human-friendly label assembled by the runtime for UI display. */
  label?: string;
}

// ─── Plugin options ──────────────────────────────────────────────────

export interface PickerPluginOptions {
  /**
   * When true, the runtime emits verbose console diagnostics. Forwarded
   * to the browser via a query string on the injected script.
   */
  debug?: boolean;

  /**
   * Only inject the runtime when Vite runs in one of these modes. Default
   * is `undefined` which injects in every mode — sandbox always uses dev.
   */
  modes?: string[];

  /**
   * Additional parent origins the runtime will accept during handshake,
   * beyond the default 127.0.0.1 / localhost / 0.0.0.0 on any port. Use
   * this when the playground-app is served from a custom hostname.
   */
  extraAllowedParentOrigins?: string[];
}

// ─── postMessage protocol (child → parent) ───────────────────────────
//
// Every runtime message is tagged with `source: 'playground-picker'`
// and carries the nonce learned from the parent during handshake. The
// parent drops any message that does not match.

interface Envelope {
  source: 'playground-picker';
  /** Monotonic counter — parent can drop out-of-order messages. */
  seq: number;
  /** Nonce returned by the parent during `playground.ready`. */
  nonce: string;
  timestamp: number;
}

export interface PickerReadyMessage extends Envelope {
  type: 'playground.ready';
  /** Runtime version, used to warn on version drift. */
  runtimeVersion: string;
  /** Initial pathname at load. */
  route: string;
}

export interface PickerPickedMessage extends Envelope {
  type: 'playground.picked';
  element: ElementContext;
  /** Pathname at the moment of pick. */
  route: string;
  /** Viewport-relative bounding box of the picked element. */
  bbox: { x: number; y: number; width: number; height: number };
}

export interface PickerHoverMessage extends Envelope {
  type: 'playground.hover';
  /** null means hover left the document. */
  element: ElementContext | null;
}

export interface PickerRouteMessage extends Envelope {
  type: 'playground.route';
  route: string;
  /** Previous pathname, or null on first emission. */
  prevRoute: string | null;
}

export interface PickerErrorMessage extends Envelope {
  type: 'playground.error';
  message: string;
  stack?: string;
}

export type PlaygroundPickerMessage =
  | PickerReadyMessage
  | PickerPickedMessage
  | PickerHoverMessage
  | PickerRouteMessage
  | PickerErrorMessage;

// ─── Parent → Child control commands ─────────────────────────────────

export type PlaygroundPickerCommand =
  | { type: 'picker.setMode'; mode: PickerMode }
  | { type: 'picker.ping' };

/** Overlay interaction mode. Mirrors playground-store `IframeMode`. */
export type PickerMode = 'view' | 'pick' | 'pin';

// ─── Handshake constants ─────────────────────────────────────────────

/** URL query parameter the parent uses to hand the runtime its nonce. */
export const PICKER_QUERY_NONCE = '__playground_nonce';

/** URL query parameter naming the parent's origin (for reply targeting). */
export const PICKER_QUERY_PARENT_ORIGIN = '__playground_origin';

/** URL query parameter toggling verbose logs at load time. */
export const PICKER_QUERY_DEBUG = '__playground_debug';

/** Marker used on every runtime-originated message. */
export const PICKER_MESSAGE_SOURCE = 'playground-picker';
