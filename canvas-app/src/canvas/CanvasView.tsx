import { useMemo, useState, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { ScreenNode } from './nodes/ScreenNode';
import { SectionNode } from './nodes/SectionNode';
import { FlowEdge } from './edges/FlowEdge';
import { Toolbar } from './Toolbar';
import { ComponentPalette } from '../editor/ComponentPalette';
import { PropPanel } from '../editor/PropPanel';
import { CreateToolbar, useEdgeCreation } from '../editor/CreateToolbar';
import { useCanvasStore } from '../store/canvas-store';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useSectionAutoResize } from '../hooks/useSectionAutoResize';
import { useCanvasDropHandler } from '../hooks/useCanvasDropHandler';
import { FeedbackPanel } from '../feedback/FeedbackPanel';

const nodeTypes: NodeTypes = {
  screen: ScreenNode,
  section: SectionNode,
};

const edgeTypes: EdgeTypes = {
  flow: FlowEdge,
};

function ArrowMarker() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        <marker
          id="arrow-marker"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" fill="#6b7280" />
        </marker>
      </defs>
    </svg>
  );
}

export function CanvasView() {
  const { nodes, edges, onNodesChange, onEdgesChange, interactionMode } =
    useCanvasStore(useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      interactionMode: s.interactionMode,
    })));

  // Sidebar state
  const [paletteOpen, setPaletteOpen] = useState(true);

  // Keyboard shortcuts (Delete, Ctrl+Z/Y/S, V/H/C)
  const { handleSave, handleUndo, handleRedo } = useKeyboardShortcuts();

  // Section auto-resize on child drag stop
  const { handleNodeDragStop } = useSectionAutoResize();

  // HTML DnD drop handler
  const { handleDragOver, handleDrop } = useCanvasDropHandler();

  // Edge creation mode (single source of truth)
  const { edgeMode, edgeSource, toggleEdgeMode, handleNodeClickForEdge } = useEdgeCreation();
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: any) => {
      handleNodeClickForEdge(node.id);
    },
    [handleNodeClickForEdge],
  );

  // Undo/redo state from zundo temporal store
  const canUndo = useStore(useCanvasStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useCanvasStore.temporal, (s) => s.futureStates.length > 0);

  // Determine pan behavior from interaction mode
  const panOnDrag = useMemo(
    () => interactionMode === 'pan',
    [interactionMode],
  );

  // Deselect component when clicking on canvas background
  const setSelectedComponentId = useCanvasStore((s) => s.setSelectedComponentId);
  const handlePaneClick = useCallback(() => {
    setSelectedComponentId(null);
  }, [setSelectedComponentId]);

  const handlePaletteToggle = useCallback(() => {
    setPaletteOpen((prev) => !prev);
  }, []);

  // Feedback panel state
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const handleFeedbackToggle = useCallback(() => {
    setFeedbackOpen((prev) => !prev);
  }, []);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        background: '#0a0a14',
      }}
    >
      {/* Left sidebar: Component Palette */}
      <ComponentPalette isOpen={paletteOpen} onToggle={handlePaletteToggle} />

      {/* Center: Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        <ArrowMarker />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={handleNodeDragStop}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          panOnDrag={panOnDrag}
          nodesDraggable={interactionMode === 'select'}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap />
          <Controls />
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            color="#333"
          />
          <Toolbar
            onSave={handleSave}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
          <CreateToolbar edgeMode={edgeMode} edgeSource={edgeSource} onToggleEdgeMode={toggleEdgeMode} />
        </ReactFlow>
      </div>

      {/* Right sidebar: Prop Panel */}
      <PropPanel />

      {/* Right sidebar: Feedback Panel */}
      <FeedbackPanel isOpen={feedbackOpen} onToggle={handleFeedbackToggle} />
    </div>
  );
}
