import React, { useState, useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import { useCanvasStore } from '../store/canvas-store';

interface CreateToolbarProps {
  edgeMode: boolean;
  edgeSource: string | null;
  onToggleEdgeMode: () => void;
}

export const CreateToolbar = React.memo(function CreateToolbar({ edgeMode, edgeSource, onToggleEdgeMode }: CreateToolbarProps) {
  const { addScreen, addSection } = useCanvasStore(
    useShallow((s) => ({
      addScreen: s.addScreen,
      addSection: s.addSection,
    })),
  );
  const reactFlow = useReactFlow();

  const getViewportCenter = useCallback(() => {
    const viewport = reactFlow.getViewport();
    // Convert the center of the visible area to flow coordinates
    const centerX = (-viewport.x + window.innerWidth / 2) / viewport.zoom;
    const centerY = (-viewport.y + window.innerHeight / 2) / viewport.zoom;
    return { x: centerX, y: centerY };
  }, [reactFlow]);

  const handleAddScreen = useCallback(() => {
    const center = getViewportCenter();
    addScreen('New Screen', center);
  }, [addScreen, getViewportCenter]);

  const handleAddSection = useCallback(() => {
    const center = getViewportCenter();
    addSection('New Section', center);
  }, [addSection, getViewportCenter]);

  const buttonStyle: React.CSSProperties = {
    height: 28,
    padding: '0 10px',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 500,
    color: '#666',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    whiteSpace: 'nowrap',
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 292,
        zIndex: 10,
        display: 'flex',
        gap: 4,
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: 4,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      <button onClick={handleAddScreen} style={buttonStyle} title="Add new screen">
        + Screen
      </button>
      <button onClick={handleAddSection} style={buttonStyle} title="Add new section">
        + Section
      </button>
      <button
        onClick={onToggleEdgeMode}
        style={{
          ...buttonStyle,
          background: edgeMode ? '#e8f0fe' : '#fff',
          color: edgeMode ? '#346bea' : '#666',
          borderColor: edgeMode ? '#346bea' : '#e0e0e0',
        }}
        title={edgeMode ? (edgeSource ? 'Click target screen' : 'Click source screen') : 'Connect screens with arrow'}
      >
        {edgeMode
          ? edgeSource
            ? 'Click target...'
            : 'Click source...'
          : '+ Flow'}
      </button>
    </div>
  );
});

// Export the hook for CanvasView to use edge-creation node clicks
export function useEdgeCreation() {
  const [edgeMode, setEdgeMode] = useState(false);
  const [edgeSource, setEdgeSource] = useState<string | null>(null);
  const addEdge = useCanvasStore((s) => s.addEdge);

  const handleNodeClickForEdge = useCallback(
    (nodeId: string) => {
      if (!edgeMode) return false;
      if (!edgeSource) {
        setEdgeSource(nodeId);
        return true;
      } else if (nodeId !== edgeSource) {
        addEdge(edgeSource, nodeId, '');
        setEdgeMode(false);
        setEdgeSource(null);
        return true;
      }
      return true;
    },
    [edgeMode, edgeSource, addEdge],
  );

  return {
    edgeMode,
    edgeSource,
    toggleEdgeMode: () => {
      setEdgeMode((prev) => !prev);
      setEdgeSource(null);
    },
    handleNodeClickForEdge,
  };
}
