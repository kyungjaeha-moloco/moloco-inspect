/**
 * LivePreview — iframe embedding the playground's sandbox Vite server.
 *
 * Uses the overlay-proxy technique from v3 plan §7.2:
 *  - `view`: transparent overlay on top of the iframe captures click/drag
 *    (so parent affordances stay responsive) but forwards wheel events
 *    into the iframe so the user can still scroll the live app.
 *  - `pick`: overlay removed; clicks reach the sandbox's Vite picker
 *    plugin (wired in M3). Until then, picker clicks are a no-op.
 *  - `pin`: overlay captures click coordinates, drops a `PinComment`
 *    into the pin store, and focuses an inline textarea for the user
 *    to type their note.
 *
 * The `vitePort` on Playground is ephemeral (see spike addendum A2).
 * Callers must re-read playground state on every mount — this component
 * just renders whatever port is handed to it.
 */

import { useEffect, useMemo, useRef, type WheelEvent } from 'react';
import type { Playground } from '../services/orchestrator-client';
import type { IframeMode } from '../store/playground-store';
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

  // Load this playground's pin history on mount / playground switch.
  useEffect(() => {
    loadForPlayground(playgroundId);
  }, [playgroundId, loadForPlayground]);

  // Scope to current playground only — store might hold pins from a
  // previous session if we ever add preloading.
  const pins = useMemo(
    () => allPins.filter((p) => p.playgroundId === playgroundId),
    [allPins, playgroundId],
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

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== 'pin') return;
    // Ignore clicks that came from a pin marker / editor (they bubble up).
    const target = e.target as HTMLElement;
    if (target.closest('[data-pin-marker]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // Best-effort route capture — cross-origin blocks live SPA nav
    // tracking, so this records only the iframe's initial-load path.
    // M3 replaces this with a postMessage live-route feed.
    let route: string | undefined;
    try {
      route = new URL(
        iframeRef.current?.src ?? '',
        window.location.origin,
      ).pathname;
    } catch {
      route = undefined;
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
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 4 }}>
            Resume 후 라이브 미리보기를 로드할 수 있습니다.
          </div>
        </div>
      </div>
    );
  }

  if (!vitePort) {
    return (
      <div style={placeholderStyle}>
        <div>
          <strong>Vite 포트 미할당</strong>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 4 }}>
            Resume 또는 재기동이 필요합니다.
          </div>
        </div>
      </div>
    );
  }

  const src = `http://127.0.0.1:${vitePort}/`;
  const showOverlay = mode !== 'pick';

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
          onClick={handleOverlayClick}
          onWheel={handleWheel}
          style={{
            ...overlayStyle,
            cursor: mode === 'pin' ? 'crosshair' : 'default',
          }}
        >
          {/* Pin markers render only in pin mode so they don't hover
              over the app while the user explores in view mode.
              Filtering per-SPA-route arrives with M3 postMessage. */}
          {mode === 'pin' &&
            pins.map((pin, idx) => (
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
          view/pick modes hide them. */}
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
