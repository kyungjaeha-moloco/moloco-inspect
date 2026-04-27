/**
 * Playground picker runtime — injected into every sandbox app page.
 *
 * Responsibilities (M3):
 *   1. Read handshake params from URL query, establish message channel
 *      with the parent playground-app.
 *   2. Track SPA route changes (history.pushState / popstate) so the
 *      parent can filter pins by current route.
 *   3. In Pick mode (set by parent), overlay a hover highlight and emit
 *      `playground.picked` when the user clicks an element.
 *
 * This file is authored in TypeScript and compiled to plain ESM by tsc.
 * It uses `import type` only — the emitted JS has zero imports so it can
 * be served directly as a virtual module by the Vite plugin without
 * worrying about module resolution inside the sandbox's Vite instance.
 *
 * Step A (this commit): handshake + route tracking + picker stub. The
 * fiber walker and overlay UI arrive in Step B.
 */

import type {
  ElementContext,
  PickerMode,
  PickerReadyMessage,
  PickerPickedMessage,
  PickerHoverMessage,
  PickerRouteMessage,
  PickerErrorMessage,
  PickerTrackedBboxes,
  PlaygroundPickerMessage,
  PlaygroundPickerCommand,
} from './types';

// Constants are inlined (no imports → zero emit side-effects beyond code).
const PICKER_QUERY_NONCE = '__playground_nonce';
const PICKER_QUERY_PARENT_ORIGIN = '__playground_origin';
const PICKER_QUERY_DEBUG = '__playground_debug';
const PICKER_MESSAGE_SOURCE = 'playground-picker' as const;
const RUNTIME_VERSION = '0.1.0';

(() => {
  // Guard against double-injection (e.g. HMR reload re-running this module).
  const w = window as unknown as {
    __playgroundPickerLoaded?: boolean;
    __playgroundPickerDebug?: boolean;
  };
  if (w.__playgroundPickerLoaded) {
    return;
  }
  w.__playgroundPickerLoaded = true;

  const qs = new URLSearchParams(window.location.search);
  const nonce = qs.get(PICKER_QUERY_NONCE);
  const parentOrigin = qs.get(PICKER_QUERY_PARENT_ORIGIN);
  const debug = qs.get(PICKER_QUERY_DEBUG) === '1';
  w.__playgroundPickerDebug = debug;

  const log = (...args: unknown[]) => {
    if (debug) console.log('[playground-picker]', ...args);
  };
  const warn = (...args: unknown[]) => console.warn('[playground-picker]', ...args);

  if (!nonce || !parentOrigin) {
    // Not running inside a playground iframe. Stay silent — the app may be
    // opened directly during development without handshake params.
    log('no handshake params — standalone mode');
    return;
  }

  // Defensive: the runtime should never run at top level (no parent).
  if (window.parent === window) {
    log('no parent window — standalone mode');
    return;
  }

  // ─── Message channel ───────────────────────────────────────────────
  let seq = 0;
  const send = (msg: Omit<PlaygroundPickerMessage, 'source' | 'nonce' | 'seq' | 'timestamp'>) => {
    const envelope = {
      source: PICKER_MESSAGE_SOURCE,
      nonce,
      seq: ++seq,
      timestamp: Date.now(),
      ...msg,
    } as PlaygroundPickerMessage;
    try {
      window.parent.postMessage(envelope, parentOrigin);
      log('→', envelope.type, envelope);
    } catch (err) {
      // postMessage throws on serialization failures (rare, but defensive).
      console.error('[playground-picker] send failed', err);
    }
  };

  const sendError = (message: string, stack?: string) => {
    const payload: Omit<PickerErrorMessage, 'source' | 'nonce' | 'seq' | 'timestamp'> = {
      type: 'playground.error',
      message,
      ...(stack ? { stack } : {}),
    };
    send(payload);
  };

  // ─── Route tracking ────────────────────────────────────────────────
  // Parent can't read iframe.contentWindow.location cross-origin on LAN
  // hosts, so it relies on this channel for SPA nav. We patch the two
  // history methods in place (react-router uses these) and also listen
  // to popstate for back/forward navigation.

  let prevRoute: string | null = null;
  const currentRoute = () => window.location.pathname + window.location.search;

  const emitRoute = () => {
    const route = currentRoute();
    if (route === prevRoute) return;
    const payload: Omit<PickerRouteMessage, 'source' | 'nonce' | 'seq' | 'timestamp'> = {
      type: 'playground.route',
      route,
      prevRoute,
    };
    send(payload);
    prevRoute = route;
  };

  const patchHistory = (method: 'pushState' | 'replaceState') => {
    const original = history[method];
    // Preserve `this`, pass through all args, emit route after mutation.
    history[method] = function patched(this: History, ...args: unknown[]) {
      const ret = (original as (...a: unknown[]) => unknown).apply(this, args);
      // Queue emission to the next microtask so the url has already updated
      // (some routers read location synchronously after pushState).
      queueMicrotask(emitRoute);
      return ret;
    } as typeof history[typeof method];
  };
  patchHistory('pushState');
  patchHistory('replaceState');
  window.addEventListener('popstate', emitRoute);

  // ─── Identifier extraction (v3 plan §14 E4 / spike A4) ────────────
  //
  // Priority:
  //   1. data-testid  (rare — 0.97% of msm-portal files, but highest value)
  //   2. React fiber displayName  (walker up the fiber.return chain)
  //   3. CSS selector path (universal fallback, always emitted)
  //   4. _debugSource → sourceFile:line (dev-only, best-effort)

  interface ReactFiber {
    type?: unknown;
    elementType?: unknown;
    return?: ReactFiber | null;
    _debugSource?: { fileName?: string; lineNumber?: number } | null;
    _debugOwner?: ReactFiber | null;
  }

  /** Find the React fiber attached to a DOM node (if any). */
  const findFiber = (el: Element): ReactFiber | null => {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    if (!key) return null;
    return (
      (el as unknown as Record<string, ReactFiber | undefined>)[key] ?? null
    );
  };

  /** Walk fiber.return up, return first nameable component. */
  const findDisplayName = (fiber: ReactFiber | null): string | undefined => {
    let cursor: ReactFiber | null = fiber;
    let hops = 0;
    while (cursor && hops < 40) {
      const kind = cursor.type ?? cursor.elementType;
      if (kind && typeof kind !== 'string') {
        const c = kind as { displayName?: string; name?: string };
        const name = c.displayName || c.name;
        if (name && name !== 'Anonymous' && name !== '_default') return name;
      }
      cursor = cursor.return ?? null;
      hops++;
    }
    return undefined;
  };

  /** Pull _debugSource from fiber or its owner chain. */
  const findDebugSource = (fiber: ReactFiber | null): string | undefined => {
    let cursor: ReactFiber | null = fiber;
    let hops = 0;
    while (cursor && hops < 40) {
      const dbg = cursor._debugSource;
      if (dbg && dbg.fileName) {
        return dbg.lineNumber != null
          ? `${dbg.fileName}:${dbg.lineNumber}`
          : dbg.fileName;
      }
      cursor = cursor._debugOwner ?? cursor.return ?? null;
      hops++;
    }
    return undefined;
  };

  /** Build a bounded CSS selector path (≤ 5 levels or up to nearest id). */
  const buildSelector = (el: Element): string => {
    const parts: string[] = [];
    let cursor: Element | null = el;
    let levels = 0;
    while (
      cursor &&
      cursor.nodeType === 1 &&
      levels < 5 &&
      cursor !== document.body
    ) {
      let seg = cursor.nodeName.toLowerCase();
      if (cursor.id) {
        parts.unshift(`${seg}#${CSS.escape(cursor.id)}`);
        break;
      }
      const parent: Element | null = cursor.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.nodeName === (cursor as Element).nodeName,
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(cursor) + 1;
          seg += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(seg);
      cursor = cursor.parentElement;
      levels++;
    }
    return parts.join(' > ');
  };

  const extractElementContext = (target: Element): ElementContext => {
    // Crawl up a few hops for data-testid — React apps frequently apply
    // testids to a wrapper a level or two above the exact click target.
    let testIdHost: Element | null = target;
    let testHops = 0;
    let testId: string | undefined;
    while (testIdHost && testHops < 4) {
      const t = testIdHost.getAttribute?.('data-testid');
      if (t) {
        testId = t;
        break;
      }
      testIdHost = testIdHost.parentElement;
      testHops++;
    }

    const fiber = findFiber(target);
    const displayName = findDisplayName(fiber);
    const sourceFile = findDebugSource(fiber);
    const selector = buildSelector(target);

    // Human label prefers the most recognisable signal available.
    const labelParts: string[] = [];
    if (displayName) labelParts.push(displayName);
    if (testId) labelParts.push(`[${testId}]`);
    if (sourceFile && !displayName) labelParts.push(sourceFile);
    const label = labelParts.length > 0 ? labelParts.join(' ') : selector;

    return {
      ...(testId ? { testId } : {}),
      ...(displayName ? { displayName } : {}),
      ...(sourceFile ? { sourceFile } : {}),
      selector,
      label,
    };
  };

  // ─── Picker mode + hover overlay ──────────────────────────────────

  let mode: PickerMode = 'view';
  let hoverEl: Element | null = null;
  let outline: HTMLDivElement | null = null;

  const ensureOutline = (): HTMLDivElement => {
    if (outline) return outline;
    const el = document.createElement('div');
    el.setAttribute('data-playground-picker-outline', '');
    Object.assign(el.style, {
      position: 'fixed',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      border: '2px solid #3B82F6',
      background: 'rgba(59, 130, 246, 0.08)',
      zIndex: '2147483646',
      display: 'none',
      transition: 'all 80ms ease-out',
    });
    (document.body ?? document.documentElement).appendChild(el);
    outline = el;
    return el;
  };

  const positionOutline = (rect: DOMRect) => {
    const el = ensureOutline();
    el.style.display = 'block';
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
  };
  const hideOutline = () => {
    if (outline) outline.style.display = 'none';
  };

  const isPickerInternal = (el: Element | null): boolean => {
    // Don't let the hover overlay hover over itself.
    return !!el?.closest?.('[data-playground-picker-outline]');
  };

  const handleMouseMove = (ev: MouseEvent) => {
    if (mode !== 'pick' && mode !== 'pin') return;
    const target = ev.target as Element | null;
    if (!target || isPickerInternal(target)) return;
    if (target === hoverEl) return;
    hoverEl = target;
    positionOutline(target.getBoundingClientRect());
    const payload: Omit<PickerHoverMessage, 'source' | 'nonce' | 'seq' | 'timestamp'> = {
      type: 'playground.hover',
      element: extractElementContext(target),
    };
    send(payload);
  };

  const clearHover = () => {
    if (hoverEl === null) return;
    hoverEl = null;
    hideOutline();
    const payload: Omit<PickerHoverMessage, 'source' | 'nonce' | 'seq' | 'timestamp'> = {
      type: 'playground.hover',
      element: null,
    };
    send(payload);
  };

  const handleClick = (ev: MouseEvent) => {
    if (mode !== 'pick' && mode !== 'pin') return;
    const target = ev.target as Element | null;
    if (!target || isPickerInternal(target)) return;
    // Swallow the click — otherwise the app will treat it as navigation.
    ev.preventDefault();
    ev.stopPropagation();
    const rect = target.getBoundingClientRect();
    const payload: Omit<PickerPickedMessage, 'source' | 'nonce' | 'seq' | 'timestamp'> = {
      type: 'playground.picked',
      element: extractElementContext(target),
      route: currentRoute(),
      bbox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
    send(payload);
  };

  const applyMode = (next: PickerMode) => {
    if (next === mode) return;
    mode = next;
    if (mode !== 'pick' && mode !== 'pin') clearHover();
    log('mode →', mode);
  };

  // ─── Element tracking (for comment-pin live positioning) ────────────
  //
  // The parent passes a list of CSS selectors via `picker.track`. We
  // resolve each one in the live DOM on a polling cadence (rAF-throttled
  // ~16 fps) and emit a `playground.tracked` message whenever any bbox
  // changes by ≥1px or an element appears / disappears. Polling is
  // strictly cheaper than ResizeObserver+IntersectionObserver+scroll
  // listeners orchestrated separately and the bbox math is identical.
  // Empty selector list = stop tracking (and skip the rAF loop entirely).
  let trackedSelectors: string[] = [];
  let trackedRafId: number | null = null;
  let trackedLast: Record<
    string,
    { x: number; y: number; width: number; height: number } | null
  > = {};

  const sameBbox = (
    a: { x: number; y: number; width: number; height: number } | null,
    b: { x: number; y: number; width: number; height: number } | null,
  ) => {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
      a.x === b.x &&
      a.y === b.y &&
      a.width === b.width &&
      a.height === b.height
    );
  };

  const sampleTracked = () => {
    if (trackedSelectors.length === 0) {
      trackedRafId = null;
      return;
    }
    const now: Record<
      string,
      { x: number; y: number; width: number; height: number } | null
    > = {};
    let changed = false;
    for (const sel of trackedSelectors) {
      let bbox:
        | { x: number; y: number; width: number; height: number }
        | null = null;
      try {
        const el = document.querySelector(sel) as Element | null;
        if (el) {
          const r = el.getBoundingClientRect();
          // 0×0 elements (display:none, etc.) are reported as null so the
          // pin layer renders them as orphaned instead of stuck at (0,0).
          if (r.width > 0 || r.height > 0) {
            bbox = {
              x: Math.round(r.x),
              y: Math.round(r.y),
              width: Math.round(r.width),
              height: Math.round(r.height),
            };
          }
        }
      } catch {
        // Invalid selector — keep null, don't crash the loop.
      }
      now[sel] = bbox;
      if (!sameBbox(bbox, trackedLast[sel] ?? null)) changed = true;
    }
    // Also check for selectors that vanished from the list — but since
    // we replace `trackedLast` wholesale below, dropped keys are
    // implicitly cleaned up.
    if (changed) {
      trackedLast = now;
      const payload: Omit<
        PickerTrackedBboxes,
        'source' | 'nonce' | 'seq' | 'timestamp'
      > = { type: 'playground.tracked', bboxes: now };
      send(payload);
    }
    trackedRafId = window.requestAnimationFrame(sampleTracked);
  };

  const setTrackedSelectors = (next: string[]) => {
    // Dedupe — parent might pass the same selector twice if two pins
    // anchor to the same element.
    const dedup: string[] = [];
    const seen = new Set<string>();
    for (const s of next) {
      if (!seen.has(s)) {
        seen.add(s);
        dedup.push(s);
      }
    }
    trackedSelectors = dedup;
    log('track', dedup.length, 'selector(s)');
    if (dedup.length === 0) {
      // Stop the rAF loop so an idle iframe doesn't burn frames.
      if (trackedRafId !== null) {
        window.cancelAnimationFrame(trackedRafId);
        trackedRafId = null;
      }
      // Force one final emit so the parent sees the cleared map and
      // can drop its own cached bboxes.
      trackedLast = {};
      const payload: Omit<
        PickerTrackedBboxes,
        'source' | 'nonce' | 'seq' | 'timestamp'
      > = { type: 'playground.tracked', bboxes: {} };
      send(payload);
      return;
    }
    // Reset the last-seen cache so the next sample emits fresh
    // coordinates even if values happen to coincide with the prior
    // selector set's last sample.
    trackedLast = {};
    if (trackedRafId === null) {
      trackedRafId = window.requestAnimationFrame(sampleTracked);
    }
  };

  // Capture phase so we see events before any app handler swallows them.
  window.addEventListener('click', handleClick, true);
  window.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('mouseleave', clearHover, true);

  // ─── Parent → Child command channel ────────────────────────────────
  window.addEventListener('message', (ev) => {
    // Parent-origin validation — accept only the origin we were handed.
    if (ev.origin !== parentOrigin) return;
    const data = ev.data as Partial<PlaygroundPickerCommand> | undefined;
    if (!data || typeof data !== 'object') return;
    switch (data.type) {
      case 'picker.setMode': {
        const next = data.mode;
        if (next === 'view' || next === 'pick' || next === 'pin') {
          applyMode(next);
        } else {
          warn('picker.setMode got invalid mode', next);
        }
        break;
      }
      case 'picker.ping': {
        // Health-check — parent uses this to verify the channel is live
        // after iframe reload. No ack needed in this direction (parent
        // already knows we're alive once 'playground.ready' lands).
        log('ping');
        break;
      }
      case 'picker.track': {
        const list = Array.isArray(data.selectors)
          ? data.selectors.filter(
              (s): s is string => typeof s === 'string' && s.length > 0,
            )
          : [];
        setTrackedSelectors(list);
        break;
      }
      case 'picker.navigate': {
        const path = typeof data.path === 'string' ? data.path : null;
        if (!path || !path.startsWith('/')) {
          warn('picker.navigate ignored — invalid path', path);
          break;
        }
        // SPA-style navigation: the host SPA's router watches popstate
        // (and the original pushState that we monkey-patched at boot —
        // see emitRoute). Simulating both keeps it agnostic of which
        // router lib (react-router, history v5, etc.) is in use.
        try {
          history.pushState(null, '', path);
          window.dispatchEvent(new PopStateEvent('popstate'));
        } catch (err) {
          warn('picker.navigate failed', err);
        }
        break;
      }
      default:
        // Unknown type — ignore silently so unrelated page postMessage
        // traffic doesn't spam the console.
        break;
    }
  });

  // ─── Handshake: announce ready ─────────────────────────────────────
  //
  // The first message from child → parent is always `playground.ready`.
  // This is what the parent uses to mark the iframe as usable.

  const readyPayload: Omit<PickerReadyMessage, 'source' | 'nonce' | 'seq' | 'timestamp'> = {
    type: 'playground.ready',
    runtimeVersion: RUNTIME_VERSION,
    route: currentRoute(),
  };

  // Surface uncaught runtime errors to the parent — helps during M3
  // debugging when the sandbox console is not easily reachable.
  window.addEventListener('error', (ev) => {
    sendError(ev.message, ev.error?.stack);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    sendError(message, reason instanceof Error ? reason.stack : undefined);
  });

  // Send ready after DOM is parsed so parent receives it with a realistic
  // `route`. `document.readyState` is 'loading' during script execution
  // for a <head> script without defer, hence the guard.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => send(readyPayload), {
      once: true,
    });
  } else {
    send(readyPayload);
  }

  log('runtime initialized', { version: RUNTIME_VERSION, mode });
})();

// Force module emit so tsc keeps this as an ES module file.
export {};
