/**
 * Playground ↔ sandbox iframe bridge.
 *
 * The sandbox's Vite server injects `vite-plugin-playground-picker`'s
 * runtime into every page. That runtime opens a postMessage channel
 * back here. This module authenticates that channel via a per-mount
 * nonce and fans inbound events out to subscribers.
 *
 * See v3 plan §5 (postMessage handshake with nonce) and spike A4
 * (picker identifier priority).
 *
 * Wire-up: the caller (LivePreview, in Step D) creates a bridge on
 * mount, uses `buildIframeSrc()` to build the iframe's URL, registers
 * a message handler, and calls `dispose()` on unmount. The bridge is
 * otherwise stateless — swapping a Playground or reloading the iframe
 * should get a fresh bridge so the nonce rotates.
 */

// ─── Shared wire types (kept in sync with the picker plugin's types) ──
//
// We intentionally duplicate the shape here rather than importing from
// `vite-plugin-playground-picker` because that package lives inside the
// sandbox image and is not (and should not be) a dependency of the
// playground-app. The contract is narrow — if it changes, update both
// sides. Types are exported so the rest of playground-app can consume.

export interface BridgeElementContext {
  testId?: string;
  displayName?: string;
  selector?: string;
  sourceFile?: string;
  label?: string;
}

export type BridgePickerMode = 'view' | 'pick' | 'pin';

interface Envelope {
  source: 'playground-picker';
  nonce: string;
  seq: number;
  timestamp: number;
}

export interface BridgeReady extends Envelope {
  type: 'playground.ready';
  runtimeVersion: string;
  route: string;
}
export interface BridgePicked extends Envelope {
  type: 'playground.picked';
  element: BridgeElementContext;
  route: string;
  bbox: { x: number; y: number; width: number; height: number };
}
export interface BridgeHover extends Envelope {
  type: 'playground.hover';
  element: BridgeElementContext | null;
}
export interface BridgeRoute extends Envelope {
  type: 'playground.route';
  route: string;
  prevRoute: string | null;
}
export interface BridgeError extends Envelope {
  type: 'playground.error';
  message: string;
  stack?: string;
}

export type BridgeMessage =
  | BridgeReady
  | BridgePicked
  | BridgeHover
  | BridgeRoute
  | BridgeError;

export type BridgeCommand =
  | { type: 'picker.setMode'; mode: BridgePickerMode }
  | { type: 'picker.ping' };

// ─── Handshake constants (mirror sandbox plugin) ─────────────────────

const QUERY_NONCE = '__playground_nonce';
const QUERY_PARENT_ORIGIN = '__playground_origin';
const QUERY_DEBUG = '__playground_debug';
const MESSAGE_SOURCE = 'playground-picker';

// ─── Origin allowlist ────────────────────────────────────────────────
//
// Sandbox Vite runs on an ephemeral loopback port (`-p 0:4096` maps to
// whatever docker allocates), so we match by hostname not port. Extra
// origins can be passed in when the playground-app is served from a
// non-default hostname (LAN testing, sub-domain, etc.).

const DEFAULT_ORIGIN_HOSTS = new Set(['127.0.0.1', 'localhost', '0.0.0.0']);

function isAllowedOrigin(
  origin: string,
  extraOrigins: Set<string>,
): boolean {
  if (extraOrigins.has(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return DEFAULT_ORIGIN_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

// ─── Bridge API ──────────────────────────────────────────────────────

export interface BridgeOptions {
  /** Extra parent origins to accept beyond loopback defaults. */
  extraAllowedOrigins?: string[];
  /** Pass `?__playground_debug=1` so the runtime console-logs verbosely. */
  debug?: boolean;
}

export interface BridgeHandlers {
  onReady?(msg: BridgeReady): void;
  onPicked?(msg: BridgePicked): void;
  onHover?(msg: BridgeHover): void;
  onRoute?(msg: BridgeRoute): void;
  onError?(msg: BridgeError): void;
  /** Fires on every validated message, useful for logging / metrics. */
  onMessage?(msg: BridgeMessage): void;
}

export interface PlaygroundBridge {
  /** Nonce baked into the iframe URL for this session. */
  readonly nonce: string;
  /**
   * Compose the iframe `src` with handshake query params. Pass the raw
   * Vite URL (e.g. `http://127.0.0.1:61864/`). Existing query params on
   * `baseUrl` are preserved.
   */
  buildIframeSrc(baseUrl: string): string;
  /** Send a parent → child command. No-op until `ready` fires. */
  sendCommand(iframe: HTMLIFrameElement, cmd: BridgeCommand): void;
  /** Convenience: set picker mode on the iframe. */
  setMode(iframe: HTMLIFrameElement, mode: BridgePickerMode): void;
  /** Has the child sent `playground.ready` yet? */
  readonly isReady: boolean;
  /** Latest route reported by the child; null until a route event fires. */
  readonly currentRoute: string | null;
  /** Tear down message listener + mark disposed. Safe to call twice. */
  dispose(): void;
}

function makeNonce(): string {
  // crypto.randomUUID is available in every evergreen browser + Node 19+.
  // Falls back to a timestamp-seeded hex string on ancient runtimes.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createPlaygroundBridge(
  handlers: BridgeHandlers = {},
  options: BridgeOptions = {},
): PlaygroundBridge {
  const nonce = makeNonce();
  const extraOrigins = new Set(options.extraAllowedOrigins ?? []);
  const debug = options.debug ?? false;
  const parentOrigin = window.location.origin;

  let ready = false;
  let disposed = false;
  let currentRoute: string | null = null;
  let lastSeq = 0;

  const onMessage = (ev: MessageEvent) => {
    if (disposed) return;
    if (!isAllowedOrigin(ev.origin, extraOrigins)) return;
    const data = ev.data as Partial<BridgeMessage> | undefined;
    if (!data || typeof data !== 'object') return;
    if (data.source !== MESSAGE_SOURCE) return;
    if (data.nonce !== nonce) return;
    // Out-of-order messages are dropped — they'd confuse state updates.
    // Sequence resets when the iframe reloads (new handshake), but that
    // also issues a new nonce so we never mix streams.
    if (typeof data.seq !== 'number' || data.seq <= lastSeq) return;
    lastSeq = data.seq;

    const msg = data as BridgeMessage;
    handlers.onMessage?.(msg);

    switch (msg.type) {
      case 'playground.ready':
        ready = true;
        currentRoute = msg.route;
        handlers.onReady?.(msg);
        break;
      case 'playground.picked':
        currentRoute = msg.route;
        handlers.onPicked?.(msg);
        break;
      case 'playground.hover':
        handlers.onHover?.(msg);
        break;
      case 'playground.route':
        currentRoute = msg.route;
        handlers.onRoute?.(msg);
        break;
      case 'playground.error':
        handlers.onError?.(msg);
        break;
      default:
        // Unknown message — reserved for future types, ignore silently.
        break;
    }
  };

  window.addEventListener('message', onMessage);

  const buildIframeSrc = (baseUrl: string): string => {
    const u = new URL(baseUrl, window.location.origin);
    u.searchParams.set(QUERY_NONCE, nonce);
    u.searchParams.set(QUERY_PARENT_ORIGIN, parentOrigin);
    if (debug) u.searchParams.set(QUERY_DEBUG, '1');
    return u.toString();
  };

  const sendCommand = (iframe: HTMLIFrameElement, cmd: BridgeCommand) => {
    if (disposed) return;
    const win = iframe.contentWindow;
    if (!win) return;
    try {
      // The child validates nonce + origin, not the parent's origin on
      // *our* post — but we still target a narrow origin to avoid
      // broadcasting commands. Derive from the iframe's current src.
      const target = (() => {
        try {
          return new URL(iframe.src).origin;
        } catch {
          return '*';
        }
      })();
      win.postMessage(cmd, target);
    } catch (err) {
      console.warn('[playground-bridge] sendCommand failed', err);
    }
  };

  return {
    nonce,
    buildIframeSrc,
    sendCommand,
    setMode(iframe, mode) {
      this.sendCommand(iframe, { type: 'picker.setMode', mode });
    },
    get isReady() {
      return ready;
    },
    get currentRoute() {
      return currentRoute;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('message', onMessage);
    },
  };
}

// ─── Exports re-used by Step D wiring ────────────────────────────────

export const PLAYGROUND_BRIDGE_QUERY = {
  nonce: QUERY_NONCE,
  parentOrigin: QUERY_PARENT_ORIGIN,
  debug: QUERY_DEBUG,
} as const;
