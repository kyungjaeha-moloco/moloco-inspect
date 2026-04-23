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
 * postMessage channel with the iframe. The outer component re-keys the
 * inner on every (playground.id, status, vitePort, reloadNonce) tuple
 * so React fully unmounts — disposing the old bridge and rotating the
 * nonce — before remounting with a fresh one. That key-bound lifecycle
 * is what lets the inner component create the bridge synchronously via
 * `useState` lazy init, which is critical: the iframe's `src` must
 * carry the handshake query on its very first paint, otherwise the
 * runtime bails into standalone mode.
 *
 * SPA route changes arrive via `onRoute` and update
 * `playground-store.currentRoute`; pins are filtered against that route
 * so a pin placed on `/creative-review` does not visually smear across
 * the app when the user navigates away.
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

/**
 * Outer wrapper: stable mount point whose only job is to re-key the
 * inner component whenever the bridge-affecting inputs change. React's
 * reconciler will unmount the old inner (firing the bridge cleanup) and
 * mount a fresh one — letting the inner safely use `useState` for the
 * bridge without worrying about stale closures on prop changes.
 */
export function LivePreview(props: LivePreviewProps) {
  const { playground, reloadNonce = 0 } = props;
  const key = `${playground.id}:${playground.status}:${playground.vitePort ?? 'none'}:${reloadNonce}`;
  return <LivePreviewInner key={key} {...props} />;
}

function LivePreviewInner({ playground, mode }: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Mirror of the parent `mode` prop so bridge callbacks always read the
  // latest value without forcing bridge re-creation on every mode flip.
  const modeRef = useRef<IframeMode>(mode);
  modeRef.current = mode;

  // Picks are stamped with the playground HEAD at pick time. Props
  // change when a change-request commit lands; the ref lets the bridge
  // handlers keep picking up the right sha without being recreated.
  const headCommitShaRef = useRef<string | undefined>(playground.headCommitSha);
  headCommitShaRef.current = playground.headCommitSha;

  // Has the picker runtime inside the iframe handshaked yet? Gates both
  // (a) sending mode commands — no point posting to a runtime that
  // isn't listening — and (b) the pin-mode fallback overlay below.
  const [bridgeReady, setBridgeReady] = useState(false);

  const { vitePort, status, id: playgroundId, headCommitSha } = playground;

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

  // Load this playground's pin history on mount.
  useEffect(() => {
    loadForPlayground(playgroundId);
  }, [playgroundId, loadForPlayground]);

  // ─── Bridge creation ──────────────────────────────────────────────
  //
  // Created synchronously via `useState` lazy init so `src` below can
  // read `bridge.buildIframeSrc(...)` on the very first render. Any
  // later change to the input tuple (port, status, reloadNonce) goes
  // through the outer component's `key` prop, which unmounts this
  // inner and re-invokes the init — with the new inputs — on remount.
  // StrictMode double-invoke is fine because the useEffect cleanup
  // below disposes the first bridge before the second init fires.

  const [bridge] = useState<PlaygroundBridge | null>(() => {
    if (!vitePort || status !== 'active') return null;
    return createPlaygroundBridge(
      {
        onReady: (msg) => {
          setBridgeReady(true);
          setCurrentRoute(msg.route);
        },
        onPicked: (msg) => {
          const m = modeRef.current;
          if (m === 'pin') {
            // bbox is viewport-relative from the iframe, which matches
            // the overlay-relative coordinate space the pin store uses
            // (the iframe fills the container). Centroid lands a marker
            // in the middle of the picked element.
            const x = Math.round(msg.bbox.x + msg.bbox.width / 2);
            const y = Math.round(msg.bbox.y + msg.bbox.height / 2);
            addPin({
              playgroundId,
              x,
              y,
              commitSha: headCommitShaRef.current,
              route: msg.route,
              element: msg.element,
            });
          } else if (m === 'pick') {
            setLastPickedElement(msg.element);
          }
        },
        onRoute: (msg) => setCurrentRoute(msg.route),
        onError: (m) =>
          console.warn('[playground] runtime error', m.message, m.stack),
      },
      { debug: false },
    );
  });

  // Dispose the bridge on unmount. Runs only when this inner component
  // unmounts — which, because of the outer key, is exactly when the
  // bridge-affecting inputs change.
  useEffect(() => {
    if (!bridge) return;
    return () => {
      bridge.dispose();
    };
  }, [bridge]);

  // Propagate parent mode → child picker. Fires once when the child
  // becomes ready (since `bridgeReady` flips then) and again on every
  // subsequent user-driven mode change. The child ignores no-op flips.
  useEffect(() => {
    if (!bridge || !bridgeReady) return;
    const iframe = iframeRef.current;
    if (iframe) bridge.setMode(iframe, mode);
  }, [mode, bridge, bridgeReady]);

  // Compose iframe src with handshake query. Bridge is guaranteed to be
  // non-null here when vitePort + status are ready, because both go
  // through the `useState` init — and the outer key forces a remount
  // when they change, so this memo always tracks the live bridge.
  const src = useMemo(() => {
    if (!vitePort || !bridge) return null;
    const raw = `http://127.0.0.1:${vitePort}/`;
    return bridge.buildIframeSrc(raw);
  }, [vitePort, bridge]);

  // Scope + route-filter pins for the rendered overlay. Pins without a
  // route pre-date M3 route tracking and always show. Pins with a
  // route only show on that route; while currentRoute is still null
  // (pre-handshake) we show everything to avoid a blank pin layer on
  // legacy sandbox images.
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

  // Legacy coord-only pin fallback — fires only when the picker runtime
  // hasn't handshaked yet (pre-M3 sandbox image, or handshake lost).
  // Once the bridge is ready the overlay is removed and the picker
  // inside the iframe owns pin-mode clicks.
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
          absent in pin mode (when the bridge is ready) so the picker
          catches clicks inside the iframe. Marker pointerEvents remain
          auto so the parent still handles edit / delete interactions
          with existing pins. */}
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
