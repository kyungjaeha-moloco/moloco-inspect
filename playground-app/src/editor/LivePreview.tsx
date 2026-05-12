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
  /**
   * Called when the user clicks the "재개" button on the hibernated
   * placeholder. Parent should call `resumePlayground(id)` and update
   * the playground in the store; LivePreview will rerender as `active`
   * once the new playground prop arrives.
   */
  onResume?: () => Promise<void>;
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

function LivePreviewInner({ playground, mode, reloadNonce = 0, onResume }: LivePreviewProps) {
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

  // Live bbox cache keyed by CSS selector — fed by the runtime's
  // `playground.tracked` stream. Each entry is the *current* viewport-
  // relative bbox of the element that selector resolves to, or `null`
  // when the selector resolves to nothing (element unmounted, route
  // changed away). Comment pins look themselves up here on render so
  // they follow their anchor element through scroll / layout / SPA
  // navigation. A selector key absent from the map means "tracking has
  // not reported yet" — pins fall back to their stored x/y as a
  // best-effort initial paint until the first sample arrives.
  const [liveBboxes, setLiveBboxes] = useState<
    Record<string, { x: number; y: number; width: number; height: number } | null>
  >({});

  const { vitePort, status, id: playgroundId, headCommitSha } = playground;

  const allPins = usePinStore((s) => s.pins);
  const editingPinId = usePinStore((s) => s.editingPinId);
  const loadForPlayground = usePinStore((s) => s.loadForPlayground);
  const addPin = usePinStore((s) => s.addPin);
  const updatePinText = usePinStore((s) => s.updatePinText);
  const deletePin = usePinStore((s) => s.deletePin);
  const setEditing = usePinStore((s) => s.setEditing);
  const selectedPinId = usePinStore((s) => s.selectedPinId);
  const selectPin = usePinStore((s) => s.selectPin);

  const currentRoute = usePlaygroundStore((s) => s.currentRoute);
  const setCurrentRoute = usePlaygroundStore((s) => s.setCurrentRoute);
  const requestedIframeNav = usePlaygroundStore((s) => s.requestedIframeNav);
  const setLastPicked = usePlaygroundStore((s) => s.setLastPicked);
  const lastPickedBbox = usePlaygroundStore((s) => s.lastPickedBbox);
  const lastPickedElement = usePlaygroundStore((s) => s.lastPickedElement);
  const setMode = usePlaygroundStore((s) => s.setMode);

  // Load this playground's pin history on mount.
  useEffect(() => {
    loadForPlayground(playgroundId);
  }, [playgroundId, loadForPlayground]);

  // Auto-deselect pin after 4 s (pulse animation runs for ~2.4 s).
  useEffect(() => {
    if (!selectedPinId) return;
    const timer = setTimeout(() => selectPin(null), 4000);
    return () => clearTimeout(timer);
  }, [selectedPinId, selectPin]);

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
          if (m === 'comment') {
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
            // 핀 작성 완료 → 자동으로 interactive 복귀
            setMode('interactive');
          } else if (m === 'pick') {
            setMode('interactive');
            setLastPicked(msg.element, msg.bbox);
          }
        },
        onRoute: (msg) => setCurrentRoute(msg.route),
        onTracked: (msg) => setLiveBboxes(msg.bboxes),
        onError: (m) =>
          console.warn('[playground] runtime error', m.message, m.stack),
      },
      { debug: false },
    );
  });

  // No explicit dispose on unmount. React StrictMode's dev-only
  // mount→cleanup→mount cycle would otherwise dispose the bridge
  // between the two mounts while useState hands the *same* bridge
  // object back on the second mount — the re-mounted component would
  // then see disposed=true and silently drop every incoming message
  // (including `playground.ready`, which is exactly how we spent an
  // hour debugging "bridgeReady never flips"). The bridge's listener
  // nonce-filters, so leaving it attached when this component unmounts
  // is harmless — messages intended for other bridges just get
  // dropped at the nonce check. The next key change creates a fresh
  // bridge with a new nonce; old listeners never see its traffic.

  // Propagate parent mode → child picker. Fires once when the child
  // becomes ready (since `bridgeReady` flips then) and again on every
  // subsequent user-driven mode change. The child ignores no-op flips.
  //
  // The store uses `'interactive' | 'pick' | 'comment'` but the bridge
  // protocol (baked into the sandbox image) still speaks the legacy
  // `'view' | 'pick' | 'pin'` dialect. Translate at the boundary so we
  // don't have to rebuild the Docker image every time the UI reshuffles.
  useEffect(() => {
    if (!bridge || !bridgeReady) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const bridgeMode =
      mode === 'pick' ? 'pick' : mode === 'comment' ? 'pin' : 'view';
    bridge.setMode(iframe, bridgeMode);
  }, [mode, bridge, bridgeReady]);

  // Push the current pin-anchor selectors to the runtime so it streams
  // live bboxes back. Recomputed any time the pin list (for this
  // playground / route) changes — adding a pin starts tracking it,
  // deleting one stops. Pins without a selector (legacy coord-only
  // pins from before M3) contribute nothing to the tracker.
  const trackedSelectorList = useMemo(
    () =>
      allPins
        .filter(
          (p) =>
            p.playgroundId === playgroundId &&
            !!p.element?.selector &&
            (!p.route || !currentRoute || p.route === currentRoute),
        )
        .map((p) => p.element!.selector!) as string[],
    [allPins, playgroundId, currentRoute],
  );
  // Stable string fingerprint so the effect doesn't re-fire on
  // referentially-different but identical selector arrays.
  const trackedSelectorKey = useMemo(
    () => trackedSelectorList.slice().sort().join('\u0000'),
    [trackedSelectorList],
  );
  useEffect(() => {
    if (!bridge || !bridgeReady) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    bridge.setTracked(iframe, trackedSelectorList);
    // No teardown — sending an empty array on the next change is the
    // legitimate "stop tracking" signal, and unmount happens via the
    // outer key-bound remount which already discards this bridge.
  }, [bridge, bridgeReady, trackedSelectorKey, trackedSelectorList]);

  // External nav request — JobCard's "결과 페이지 열기" button (and
  // potentially other consumers) ask the runtime to SPA-navigate via
  // the store. Fire when the token changes, including same-path repeats.
  useEffect(() => {
    if (!bridge || !bridgeReady || !requestedIframeNav) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    bridge.navigate(iframe, requestedIframeNav.path);
    // We don't clear `requestedIframeNav` here — the token monotonically
    // increasing is enough to dedupe. If the user re-clicks the same
    // path, the token bumps and this effect re-fires.
  }, [bridge, bridgeReady, requestedIframeNav]);

  // 'C' 단축키 — comment mode 토글 (interactive ↔ comment).
  // ESC 도 comment mode 종료에 사용. 입력 필드 (textarea / input /
  // contenteditable) 안에서는 skip — 텍스트 입력 흐름을 가로채지 않음.
  // Cmd+C / Ctrl+C 같은 조합 무시 (복사 안 가로챔).
  // AIPanel 의 ESC 핸들러 (lastPickedElement 해제) 와는 독립적:
  //   - 그쪽은 lastPickedElement 가 있을 때만 등록됨
  //   - 이쪽은 mode === 'comment' 일 때 ESC 처리
  //   - 두 상태가 동시에 활성화되는 시나리오 없음
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ESC → comment mode 종료
      if (e.key === 'Escape') {
        if (mode !== 'comment') return;
        const t = e.target as HTMLElement | null;
        const isInput =
          t?.tagName === 'TEXTAREA' ||
          t?.tagName === 'INPUT' ||
          t?.isContentEditable === true;
        const inputValue =
          t && (t as HTMLInputElement | HTMLTextAreaElement).value;
        if (isInput && inputValue) return;
        e.preventDefault();
        setMode('interactive');
        return;
      }
      // 'C' / 'c' / 'ㅊ' (한글 IME 인접 키) → comment mode 토글
      if (e.key !== 'c' && e.key !== 'C' && e.key !== 'ㅊ') return;
      const t = e.target as HTMLElement | null;
      if (
        t?.tagName === 'TEXTAREA' ||
        t?.tagName === 'INPUT' ||
        t?.isContentEditable === true
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      setMode(mode === 'comment' ? 'interactive' : 'comment');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, setMode]);

  // Compose iframe src with handshake query. Bridge is guaranteed to be
  // non-null here when vitePort + status are ready, because both go
  // through the `useState` init — and the outer key forces a remount
  // when they change, so this memo always tracks the live bridge.
  const src = useMemo(() => {
    if (!vitePort || !bridge) return null;
    // Cache-bust query bumps whenever the playground HEAD advances or the
    // user forces a reload. Vite's dev server ignores unknown query
    // params for `/`, but the browser treats each distinct URL as a new
    // document — which forces the module-script-cache bypass that
    // `location.reload()` alone could not achieve on Chrome. Without
    // this, even after invalidating Vite's module graph, the iframe's
    // ES-module realm happily served stale transformed modules from its
    // per-realm script cache on subsequent mounts.
    const cb = `${headCommitSha ?? 'head'}.${reloadNonce}`;
    const raw = `http://127.0.0.1:${vitePort}/?_cb=${encodeURIComponent(cb)}`;
    return bridge.buildIframeSrc(raw);
  }, [vitePort, bridge, headCommitSha, reloadNonce]);

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
    if (mode !== 'comment') return;
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
    // 핀 작성 완료 → 자동으로 interactive 복귀
    setMode('interactive');
  };

  if (status !== 'active') {
    return (
      <div style={placeholderStyle}>
        <HibernatedPlaceholder
          status={status}
          archivedReason={playground.archivedReason}
          onResume={onResume}
        />
      </div>
    );
  }

  if (!vitePort || !src) {
    return (
      <div style={placeholderStyle}>
        <div>
          <strong>Vite port not assigned</strong>
          <div
            style={{
              color: 'var(--text-tertiary)',
              fontSize: 12,
              marginTop: 4,
            }}
          >
            Resume or restart required.
          </div>
        </div>
      </div>
    );
  }

  // Default `interactive` mode has NO parent overlay — clicks pass
  // straight through to the sandboxed app so the user can browse it
  // naturally. The only overlay we still need is the pre-bridge
  // comment fallback: if the picker runtime hasn't handshaked yet
  // (legacy image or transient load state) we let the user drop
  // coord-only pins via a parent layer. Once bridge is ready the
  // picker inside the iframe owns click capture in both pick and
  // comment modes.
  const showOverlay = mode === 'comment' && !bridgeReady;

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
            cursor: mode === 'comment' ? 'crosshair' : 'default',
          }}
          aria-hidden
        />
      )}
      {/* Persistent outline of the last picked element. Lives in the
          parent, not the iframe, so it survives mode changes and
          iframe-scoped navigation. Viewport-relative bbox means it
          drifts if the iframe scrolls — acceptable for a "which one
          did I pick?" reminder; the user re-picks if they lose it. */}
      {lastPickedBbox && lastPickedElement && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: lastPickedBbox.x,
            top: lastPickedBbox.y,
            width: lastPickedBbox.width,
            height: lastPickedBbox.height,
            pointerEvents: 'none',
            boxSizing: 'border-box',
            border: '2px dashed var(--accent)',
            borderRadius: 4,
            background: 'rgba(59, 130, 246, 0.06)',
            boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.6)',
            transition: 'opacity 120ms ease-out',
            zIndex: 5,
          }}
        />
      )}
      {/* Pin markers live above the iframe directly — the overlay is
          absent in comment mode (when the bridge is ready) so the picker
          catches clicks inside the iframe. Marker pointerEvents remain
          auto so the parent still handles edit / delete interactions
          with existing pins. */}
      {mode === 'comment' && (
        <div
          aria-live="polite"
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            fontSize: 11,
            padding: '4px 10px',
            background: 'var(--bg-elevated, rgba(0,0,0,0.7))',
            color: 'var(--text-primary, #fff)',
            borderRadius: 4,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          📍 Comment mode — press C / ESC to exit
        </div>
      )}
      {mode === 'comment' && (
        <div style={pinLayerStyle}>
          {pins.map((pin, idx) => {
            const sel = pin.element?.selector ?? null;
            // Three states for live tracking:
            //   - selector tracked AND resolved → use the live centroid
            //   - selector tracked AND null     → orphaned (faded marker)
            //   - selector not tracked yet      → fall back to stored x/y
            const tracked = sel != null ? sel in liveBboxes : false;
            const liveBbox = sel != null ? liveBboxes[sel] : undefined;
            const orphaned = tracked && !liveBbox;
            return (
              <PinMarker
                key={pin.id}
                index={idx + 1}
                pin={pin}
                liveBbox={liveBbox ?? null}
                orphaned={orphaned}
                isEditing={editingPinId === pin.id}
                isActive={pin.id === selectedPinId}
                isStale={!!pin.commitSha && pin.commitSha !== headCommitSha}
                onFocus={() => setEditing(pin.id)}
                onBlurText={(text) => {
                  updatePinText(pin.id, text);
                  setEditing(null);
                }}
                onDelete={() => deletePin(pin.id)}
              />
            );
          })}
        </div>
      )}
      {/* Subtle count chip so the user knows there are pins even when
          view / pick modes hide them. */}
      {pins.length > 0 && mode !== 'comment' && (
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
          title="Switch to Comment mode to see pins"
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
  liveBbox,
  orphaned,
  isEditing,
  isActive,
  isStale,
  onFocus,
  onBlurText,
  onDelete,
}: {
  pin: PinComment;
  index: number;
  /** Current bbox of the anchor element from the live tracker, or null
   * when not yet sampled / element unmounted. When provided we use its
   * centroid as the marker position, falling back to the pin's stored
   * x/y. */
  liveBbox: { x: number; y: number; width: number; height: number } | null;
  /** True when the tracker reported the selector as no longer resolving
   * (route changed away, element unmounted). The marker stays at the
   * last-known coordinate but is faded to signal "this pin lost its
   * anchor". */
  orphaned: boolean;
  isEditing: boolean;
  isActive: boolean;
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
  const left = liveBbox ? liveBbox.x + liveBbox.width / 2 : pin.x;
  const top = liveBbox ? liveBbox.y + liveBbox.height / 2 : pin.y;
  return (
    <div
      data-pin-marker
      style={{
        position: 'absolute',
        left,
        top,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'auto',
        opacity: orphaned ? 0.5 : 1,
        // Smooth small movements (scroll, layout shifts) so the marker
        // doesn't jitter on every rAF sample. 80ms keeps it tight enough
        // to feel anchored without lagging visibly behind the element.
        transition: 'left 80ms linear, top 80ms linear, opacity 120ms ease-out',
      }}
      title={orphaned ? 'Anchor element not found — it may have unmounted or navigated away.' : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      {isActive && (
        <>
          <style>{`
            @keyframes pin-pulse {
              0%, 100% { opacity: 0.5; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.18); }
            }
          `}</style>
          <div
            style={{
              position: 'absolute',
              inset: -6,
              borderRadius: '50%',
              border: '2px solid var(--accent, #4c8bff)',
              animation: 'pin-pulse 1.2s ease-in-out 2',
              pointerEvents: 'none',
            }}
          />
        </>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFocus();
        }}
        aria-label={`Pin ${index}`}
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
            placeholder="Note for this point (⌘/Ctrl + Enter to save, Esc to cancel)"
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
              title="Delete pin"
            >
              Delete
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
              title="Save note"
            >
              Save
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

// ── Placeholder shown when status !== 'active' ──────────────────────

function HibernatedPlaceholder({
  status,
  archivedReason,
  onResume,
}: {
  status: Playground['status'];
  archivedReason: Playground['archivedReason'];
  onResume?: () => Promise<void>;
}) {
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (!onResume || resuming) return;
    setError(null);
    setResuming(true);
    try {
      await onResume();
      // Parent updates the playground prop → status becomes 'active' →
      // this placeholder unmounts. We don't need to flip `resuming` back
      // ourselves, but reset for the rare case where parent skipped the
      // update (shouldn't happen).
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResuming(false);
    }
  };

  const message = describeStatus(status, archivedReason);
  const showResumeButton = status === 'hibernated' && !!onResume;

  return (
    <div style={{ textAlign: 'center', padding: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Status: {status}</div>
      <div
        style={{
          color: 'var(--text-tertiary)',
          fontSize: 12,
          marginTop: 6,
          maxWidth: 360,
        }}
      >
        {message}
      </div>
      {showResumeButton && (
        <button
          type="button"
          onClick={handleClick}
          disabled={resuming}
          style={{
            marginTop: 16,
            padding: '6px 16px',
            fontSize: 13,
            fontWeight: 500,
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-sm)',
            background: resuming ? 'var(--bg-secondary)' : 'var(--bg-primary)',
            color: 'var(--text-primary)',
            cursor: resuming ? 'wait' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {resuming ? 'Resuming…' : 'Resume'}
        </button>
      )}
      {error && (
        <div
          style={{
            marginTop: 12,
            color: 'var(--danger, #c53030)',
            fontSize: 11,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function describeStatus(
  status: Playground['status'],
  archivedReason: Playground['archivedReason'],
): string {
  if (status === 'hibernated') {
    return 'Container is paused. It will reboot when resumed.';
  }
  if (status === 'archived') {
    if (archivedReason === 'reattach-missing') {
      return 'Auto-archived due to container attach failure. Recovery will be attempted on the next orchestrator restart.';
    }
    return 'This Playground is archived. Changes have been exported as patches.';
  }
  if (status === 'crashed') {
    return 'Crashed — check the orchestrator logs.';
  }
  return '';
}
