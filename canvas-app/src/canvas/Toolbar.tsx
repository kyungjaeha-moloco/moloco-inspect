import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCanvasStore } from '../store/canvas-store';
import type { InteractionMode } from '../types';

const MODES: {
  key: InteractionMode;
  label: string;
  shortcut: string;
  icon: string;
}[] = [
  { key: 'select', label: 'Select', shortcut: 'V', icon: '\u2196' },
  { key: 'pan', label: 'Pan', shortcut: 'H', icon: '\u270B' },
  { key: 'comment', label: 'Comment', shortcut: 'C', icon: '\uD83D\uDCAC' },
];

interface ToolbarProps {
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export const Toolbar = React.memo(function Toolbar({
  onSave,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: ToolbarProps) {
  const { interactionMode, setInteractionMode, isDirty } = useCanvasStore(
    useShallow((s) => ({
      interactionMode: s.interactionMode,
      setInteractionMode: s.setInteractionMode,
      isDirty: s.isDirty,
    }))
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        display: 'flex',
        gap: 2,
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: 4,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        alignItems: 'center',
      }}
    >
      {/* Undo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        style={{
          width: 32,
          height: 32,
          border: 'none',
          borderRadius: 6,
          cursor: canUndo ? 'pointer' : 'default',
          fontSize: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          color: canUndo ? '#666' : '#ccc',
        }}
      >
        &#x21A9;
      </button>

      {/* Redo */}
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        style={{
          width: 32,
          height: 32,
          border: 'none',
          borderRadius: 6,
          cursor: canRedo ? 'pointer' : 'default',
          fontSize: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          color: canRedo ? '#666' : '#ccc',
        }}
      >
        &#x21AA;
      </button>

      {/* Divider */}
      <div
        style={{
          width: 1,
          height: 20,
          background: '#e0e0e0',
          margin: '0 4px',
        }}
      />

      {/* Mode buttons */}
      {MODES.map((mode) => (
        <button
          key={mode.key}
          onClick={() => setInteractionMode(mode.key)}
          title={`${mode.label} (${mode.shortcut})`}
          style={{
            width: 36,
            height: 32,
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background:
              interactionMode === mode.key ? '#e8f0fe' : 'transparent',
            color: interactionMode === mode.key ? '#346bea' : '#666',
          }}
        >
          {mode.icon}
        </button>
      ))}

      {/* Divider */}
      <div
        style={{
          width: 1,
          height: 20,
          background: '#e0e0e0',
          margin: '0 4px',
        }}
      />

      {/* Save */}
      <button
        onClick={onSave}
        title="Save (Ctrl+S)"
        style={{
          height: 32,
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          padding: '0 10px',
          background: isDirty ? '#346bea' : 'transparent',
          color: isDirty ? '#fff' : '#999',
        }}
      >
        {isDirty ? 'Save' : 'Saved'}
      </button>
    </div>
  );
});
