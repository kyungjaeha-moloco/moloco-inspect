import React, { useEffect } from 'react';
import { useCanvasStore } from '../store/canvas-store';
import type { InteractionMode } from '../types';

const MODES: { key: InteractionMode; label: string; shortcut: string; icon: string }[] = [
  { key: 'select', label: 'Select', shortcut: 'V', icon: '↖' },
  { key: 'pan', label: 'Pan', shortcut: 'H', icon: '✋' },
];

export const Toolbar = React.memo(function Toolbar() {
  const interactionMode = useCanvasStore((s) => s.interactionMode);
  const setInteractionMode = useCanvasStore((s) => s.setInteractionMode);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'v' || e.key === 'V') setInteractionMode('select');
      if (e.key === 'h' || e.key === 'H') setInteractionMode('pan');
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setInteractionMode]);

  return (
    <div style={{
      position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
      zIndex: 10, display: 'flex', gap: 2, background: '#fff',
      border: '1px solid #e0e0e0', borderRadius: 8, padding: 4,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      {MODES.map((mode) => (
        <button key={mode.key} onClick={() => setInteractionMode(mode.key)}
          title={`${mode.label} (${mode.shortcut})`}
          style={{
            width: 36, height: 32, border: 'none', borderRadius: 6,
            cursor: 'pointer', fontSize: 16, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: interactionMode === mode.key ? '#e8f0fe' : 'transparent',
            color: interactionMode === mode.key ? '#346bea' : '#666',
          }}>
          {mode.icon}
        </button>
      ))}
    </div>
  );
});
