/**
 * LivePreview — iframe embedding the playground's sandbox Vite server.
 *
 * Three interaction modes layered over the iframe (v3 plan §7.2):
 *  - `view`: transparent overlay on top of the iframe captures wheel
 *    events (forwarded into the iframe so scrolling still works) and
 *    swallows clicks so the parent canvas affordances stay responsive.
 *  - `pick` / `pin`: overlay removed. Clicks fall through to the Vite
 *    plugin picker runtime inside the iframe, which sends back either
 *    a `playground.picked` (Pick → stored on `lastPickedElement`) or is
 *    turned into a pin here (Pin → `pin-store.addPin` with `element`).
 *
 * M3 bridge wiring: `createPlaygroundBridge` opens a nonce-authenticated
 * postMessage channel with the iframe. The bridge rotates its nonce with
 * every (playground, vitePort, reloadNonce) tuple so a new iframe can
 * never read events meant for an old one. SPA route changes arrive via
 * `onRoute` and update `playground-store.currentRoute`; pins are filtered
 * against that route so a pin placed on `/creative-review` does not
 * visually smear across the app when the user navigates away.
 *
 * `vitePort` is ephemeral (spike addendum A2); callers re-read playground
 * state on mount and pass the fresh port in — this component just renders.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent,
} from 'react';
import type { Playground } from '../services/orchestrator-client';
import {
  createPlaygroundBridge,
  type PlaygroundBridge,
  type BridgePicked,
  type BridgeReady,
  type BridgeRoute,
} from '../services/playground-bridge';
import { usePlaygroundStore, type IframeMode } from '../store/playground-store';
import { usePinStore, type PinComment } from '../store/pin-store';

interface LivePreviewProps {
  playground: Playground;
  mode: IframeMode;
  /**
   * Bumping this counter re-mounts the iframe. Wire it to a parent-level
   * reload button so users can force a hard refresh when HMR drops a
   * patch (observed when Fast Refresh hiccups in the embedded context).
   */
  reloadNonce?: number;
}

export function LivePreview({
  playground,
  mode,
  reloadNonce = 0,
}: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const bridgeRef = useRef<PlaygroundBridge | null>(null);
  // Mirror of the parent `mode` prop so bridge callbacks always read the
  // latest value without forcing a bridge re-creation on every mode flip.
  const modeRef = useRef<IframeMode>(mode);
  modeRef.current = mode;

  // Has the picker runtime inside the iframe handshaked yet? Used to
  // swap pin-mode between the old coordinate-overlay fallback (works
  // with pre-M3 sandbox images) and the picker-driven flow. Flipped by
  // the bridge's `onReady` handler.
  const [bridgeReady, setBridgeReady] = useState(false);

  const { vitePort, status, id: playgroundId, headCommitSha } = playground;

  // Bump iframe key whenever port changes (new resume) OR the parent
  // asks for a reload. Both paths go through React's normal remount.
  const iframeKey = `${playgroundId}:${vitePort ?? 'none'}:${reloadNonce}`;

  const allPins = usePinStore((s) => s.pins);
  const editingPinId = usePinStore((s) => s.editingPinId);
  const loadForPlayground = usePinStore((s) => s.loadForPlayground);
  const addPin = usePinStore((s) => s.addPin);
  const updatePinText = usePinStore((s) => s.updatePinText);
  const deletePin = usePinStore((s) => s.deletePin);
  const setEditing = usePinStore((s) => s.setEditing);

  const currentRoute = usePlaygroundStore((s) => s.currentRoute);
  const setCurrentRoute = usePlaygroundStore((s) => s.setCurrentRoute);
  const setLastPickedElement = usePlaygroundStore(
    (s) => s.setLastPickedElement,
  );

  // Load this playground's pin history on mount / playground switch.
  useEffect(() => {
    loadForPlayground(playgroundId);
  }, [playgroundId, loadForPlayground]);

  // ─── Bridge lifecycle ─────────────────────────────────────────────
  //
  // One bridge per (playground, vitePort, reloadNonce) tuple. Disposing
  // on cleanup guarantees the nonce rotates with the iframe. Handlers
  // capture the current `playgroundId`/`headCommitSha` so pinned events
  // get stamped with the right commit.

  useEffect(() => {
    if (!vitePort || status !== 'active') {
      return;
    }

    const handleReady = (msg: BridgeReady) => {
      setBridgeReady(true);
      setCurrentRoute(msg.route);
      const iframe = iframeRef.current;
      if (iframe) bridge.setMode(iframe, modeRef.current);
    };

    const handlePicked = (msg: BridgePicked) => {
      const m = modeRef.current;
      if (m === 'pin') {
        // Drop a pin at the picked element's bbox centroid. The bbox is
        // viewport-relative from the iframe — which is exactly what the
        // overlay-relative pin coordinates expect, since the iframe
        // fills the same container. Fast-follow clicks that land while
        // the pin textarea is open still create pins; if users ask for
        // the old "one-shot" behavior we can flip back to view here.
        const x = Math.round(msg.bbox.x + msg.bbox.width / 2);
        const y = Math.round(msg.bbox.y + msg.bbox.height / 2);
        addPin({
          playgroundId,
          x,
          y,
          commitSha: headCommitSha,
          route: msg.route,
          element: msg.element,
        });
      } else if (m === 'pick') {
        setLastPickedElement(msg.element);
      }
    };

    const handleRoute = (msg: BridgeRoute) => {
      setCurrentRoute(msg.route);
    };

    const bridge = createPlaygroundBridge(
      {
        onReady: handleReady,
        onPicked: handlePicked,
        onRoute: handleRoute,
        onError: (m) =>
          console.warn('[playground] runtime error', m.message, m.stack),
      },
      { debug: false },
    );
    bridgeRef.current = bridge;

    return () => {
      bridge.dispose();
      bridgeRef.current = null;
      setBridgeReady(false);
    };
  }, [
    playgroundId,
    vitePort,
    status,
    reloadNonce,
    headCommitSha,
    addPin,
    setCurrentRoute,
    setLastPickedElement,
  ]);

  // Propagate parent mode → child picker. When ready hasn't fired yet,
  // the ready handler will flush `modeRef.current` on arrival, so we
  // don't queue anything here.
  useEffect(() => {
    const bridge = bridgeRef.current;
    const iframe = iframeRef.current;
    if (!bridge || !iframe || !bridge.isReady) return;
    bridge.setMode(iframe, mode);
  }, [mode]);

  // Compose iframe src with handshake query. Bridge identity tracks
  // `iframeKey`, so re-deriving src whenever that changes is correct.
  const src = useMemo(() => {
    if (!vitePort) return null;
    const raw = `http://127.0.0.1:${vitePort}/`;
    const bridge = bridgeRef.current;
    return bridge ? bridge.buildIframeSrc(raw) : raw;
  }, [vitePort, iframeKey]);

  // Scope + route-filter pins for the rendered overlay.
  // Pins without a route pre-date M3 route tracking and always show,
  // so the user isn't surprised by a regression when the bridge rolls
  // out. Pins with a route only show on that route.
  const pins = useMemo(
    () =>
      allPins.filter((p) => {
        if (p.playgroundId !== playgroundId) return false;
        if (!p.route) return true;
        if (!currentRoute) return true;
        return p.route === currentRoute;
      }),
    [allPins, playgroundId, currentRoute],
  );

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.scrollBy({ left: e.deltaX, top: e.deltaY, behavior: 'auto' });
    } catch {
      /* cross-origin — nothing we can do without postMessage */
    }
  };

  // Legacy coord-only pin fallback. Fires only when the picker runtime
  // hasn't handshaked yet — e.g. viewing an old sandbox image that was
  // built before M3. Once the bridge is ready the overlay is removed
  // and the picker inside the iframe owns pin-mode clicks.
  const handleFallbackOverlayClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (mode !== 'pin') return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-pin-marker]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    let route: string | undefined = currentRoute ?? undefined;
    if (!route) {
      try {
        route = new URL(
          iframeRef.current?.src ?? '',
          window.location.origin,
        ).pathname;
      } catch {
        route = undefined;
      }
    }
    addPin({
      playgroundId,
      x: Math.round(e.clientX - rect.left),
      y: Math.round(e.clientY - rect.top),
      commitSha: headCommitSha,
      route,
    });
  };

  if (status !== 'active') {
    return (
      <div style={placeholderStyle}>
        <div>
          <strong>상태: {status}</strong>
          <div
            style={{
              color: 'var(--text-tertiary)',
              fontSize: 12,
              marginTop: 4,
            }}
          >
            Resume 후 라이브 미리보기를 로드할 수 있습니다.
          </div>
        </div>
      </div>
    );
  }

  if (!vitePort || !src) {
    return (
      <div style={placeholderStyle}>
        <div>
          <strong>Vite 포트 미할당</strong>
          <div
            style={{
              color: 'var(--text-tertiary)',
              fontSize: 12,
              marginTop: 4,
            }}
          >
            Resume 또는 재기동이 필요합니다.
          </div>
        </div>
      </div>
    );
  }

  // Overlay shows in view mode (swallow clicks + proxy wheel) and as a
  // pin-mode fallback until the picker handshake completes.
  const showOverlay = mode === 'view' || (mode === 'pin' && !bridgeReady);

  return (
    <div style={wrapperStyle}>
      <iframe
        key={iframeKey}
        ref={iframeRef}
        src={src}
        title={`playground-${playgroundId}`}
        style={iframeStyle}
      />
      {showOverlay && (
        <div
          onWheel={handleWheel}
          onClick={handleFallbackOverlayClick}
          style={{
            ...overlayStyle,
            cursor: mode === 'pin' ? 'crosshair' : 'default',
          }}
          aria-hidden
        />
      )}
      {/* Pin markers live above the iframe directly — the overlay is
          absent in pin mode so the picker catches clicks inside the
          iframe. Marker pointerEvents remain auto so the parent still
          handles edit / delete interactions with existing pins. */}
      {mode === 'pin' && (
        <div style={pinLayerStyle}>
          {pins.map((pin, idx) => (
            <PinMarker
              key={pin.id}
              index={idx + 1}
              pin={pin}
              isEditing={editingPinId === pin.id}
              isStale={!!pin.commitSha && pin.commitSha !== headCommitSha}
              onFocus={() => setEditing(pin.id)}
              onBlurText={(text) => {
                updatePinText(pin.id, text);
                setEditing(null);
              }}
              onDelete={() => deletePin(pin.id)}
            />
          ))}
        </div>
      )}
      {/* Subtle count chip so the user knows there are pins even when
          view / pick modes hide them. */}
      {pins.length > 0 && mode !== 'pin' && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '2px 8px',
            fontSize: 11,
            color: 'var(--text-secondary)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-primary)',
            borderRadius: 999,
            boxShadow: 'var(--shadow-sm)',
            pointerEvents: 'none',
          }}
          title="Pin 모드로 전환하면 보입니다"
        >
          📍 {pins.length}
        </div>
      )}
    </div>
  );
}

function PinMarker({
  pin,
  index,
  isEditing,
  isStale,
  onFocus,
  onBlurText,
  onDelete,
}: {
  pin: PinComment;
  index: number;
  isEditing: boolean;
  isStale: boolean;
  onFocus: () => void;
  onBlurText: (text: string) => void;
  onDelete: () => void;
}) {
  const resolved = !!pin.resolvedAt;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Label prefers the picker's own label; falls back to displayName /
  // testId / selector in the priority order baked into the runtime.
  const identityLabel =
    pin.element?.label ??
    pin.element?.displayName ??
    (pin.element?.testId ? `[${pin.element.testId}]` : undefined) ??
    pin.element?.selector;
  return (
    <div
      data-pin-marker
      style={{
        position: 'absolute',
        left: pin.x,
        top: pin.y,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'auto',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFocus();
        }}
        aria-label={`핀 ${index}`}
        title={identityLabel}
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          border: '2px solid #fff',
          background: resolved
            ? 'var(--success)'
            : isStale
              ? 'var(--warning)'
              : 'var(--accent)',
          color: '#fff',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: 'var(--shadow-md)',
          fontFamily: 'inherit',
        }}
      >
        {index}
      </button>
      {isEditing && (
        <div
          style={{
            position: 'absolute',
            top: 30,
            left: 0,
            transform: 'translateX(-8px)',
            minWidth: 220,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: 8,
            zIndex: 10,
          }}
        >
          {identityLabel && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                marginBottom: 6,
                wordBreak: 'break-all',
              }}
            >
              {identityLabel}
            </div>
          )}
          <textarea
            ref={textareaRef}
            autoFocus
            defaultValue={pin.text}
            placeholder="이 지점에 대한 메모 (⌘/Ctrl + Enter 저장, Esc 취소)"
            onKeyDown={(e) => {
              const isMod = e.metaKey || e.ctrlKey;
              if (isMod && e.key === 'Enter') {
                e.preventDefault();
                onBlurText((e.target as HTMLTextAreaElement).value);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                // Escape drops the edit without persisting; if the pin
                // was just created with no text, remove it entirely.
                if (!pin.text) onDelete();
                else onBlurText(pin.text);
              }
            }}
            style={{
              width: '100%',
              minHeight: 54,
              resize: 'vertical',
              fontSize: 13,
              fontFamily: 'inherit',
              color: 'var(--text-primary)',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)',
              padding: 6,
              boxSizing: 'border-box',
            }}
          />
          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
              marginTop: 6,
            }}
          >
            <button
              type="button"
              onClick={onDelete}
              style={{ ...pinActionButtonStyle, color: 'var(--error)' }}
              title="핀 삭제"
            >
              삭제
            </button>
            <button
              type="button"
              onClick={() =>
                onBlurText(textareaRef.current?.value ?? pin.text)
              }
              style={{
                ...pinActionButtonStyle,
                background: 'var(--accent)',
                color: 'var(--text-inverse)',
                borderColor: 'var(--accent)',
              }}
              title="메모 저장"
            >
              저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const wrapperStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  background: 'var(--bg-canvas)',
};

const iframeStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  border: 'none',
  display: 'block',
};

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'transparent',
  pointerEvents: 'auto',
};

const pinLayerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
};

const placeholderStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'grid',
  placeItems: 'center',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
};

const pinActionButtonStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: 11,
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-primary)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
