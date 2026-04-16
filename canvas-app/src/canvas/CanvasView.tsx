import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useReactFlow,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { ScreenNode } from './nodes/ScreenNode';
import { SectionNode } from './nodes/SectionNode';
import { CommentNode } from './nodes/CommentNode';
import { IframeNode } from './nodes/IframeNode';
import { ScreenshotNode } from './nodes/ScreenshotNode';
import type { CommentFlowNode } from './nodes/CommentNode';
import { FlowEdge } from './edges/FlowEdge';
import { Toolbar } from './Toolbar';
import { ComponentPalette } from '../editor/ComponentPalette';
import { PropPanel } from '../editor/PropPanel';
import { CreateToolbar, useEdgeCreation } from '../editor/CreateToolbar';
import { useCanvasStore } from '../store/canvas-store';
import { useFeedbackStore } from '../store/feedback-store';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useSectionAutoResize } from '../hooks/useSectionAutoResize';
import { useCanvasDropHandler } from '../hooks/useCanvasDropHandler';
import { FeedbackPanel } from '../feedback/FeedbackPanel';

const nodeTypes: NodeTypes = {
  screen: ScreenNode,
  section: SectionNode,
  comment: CommentNode,
  iframe: IframeNode,
  screenshot: ScreenshotNode,
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

// ── Pending-pin form rendered over the canvas in fixed screen coordinates ──

interface PendingPin {
  screenX: number;
  screenY: number;
  canvasX: number;
  canvasY: number;
}

function CanvasPendingForm({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: PendingPin;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: pending.screenX,
        top: pending.screenY + 8,
        zIndex: 9999,
        background: '#fff',
        borderRadius: 8,
        padding: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
        width: 240,
        border: '1px solid #e0e0e0',
        pointerEvents: 'auto',
      }}
    >
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="댓글을 입력하세요..."
        style={{
          width: '100%',
          height: 60,
          border: '1px solid #d0d0d0',
          borderRadius: 4,
          padding: 8,
          fontSize: 13,
          resize: 'none',
          outline: 'none',
          boxSizing: 'border-box',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '4px 12px',
            border: '1px solid #d0d0d0',
            borderRadius: 4,
            background: '#fff',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          취소
        </button>
        <button
          onClick={handleSubmit}
          style={{
            padding: '4px 12px',
            border: 'none',
            borderRadius: 4,
            background: '#346bea',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          등록
        </button>
      </div>
    </div>
  );
}

// ── The actual canvas — must be inside ReactFlowProvider to use useReactFlow ──

function CanvasFlow() {
  const { nodes, edges, onNodesChange, onEdgesChange, interactionMode } =
    useCanvasStore(useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      interactionMode: s.interactionMode,
    })));

  const setNodes = useCanvasStore((s) => s.setNodes);

  const addCanvasComment = useFeedbackStore((s) => s.addCanvasComment);
  const setActiveThread = useFeedbackStore((s) => s.setActiveThread);

  const { screenToFlowPosition } = useReactFlow();

  const { handleSave, handleUndo, handleRedo } = useKeyboardShortcuts();
  const { handleNodeDragStop } = useSectionAutoResize();
  const { handleDragOver, handleDrop } = useCanvasDropHandler();

  const { edgeMode, edgeSource, toggleEdgeMode, handleNodeClickForEdge } = useEdgeCreation();
  const reactFlowInstance = useReactFlow();

  // Z key state for zoom-to-node
  const zKeyHeld = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'z' && !e.metaKey && !e.ctrlKey && !e.shiftKey) zKeyHeld.current = true; };
    const up = (e: KeyboardEvent) => { if (e.key === 'z') zKeyHeld.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: any) => {
      // Z + click → zoom to fit this node
      if (zKeyHeld.current) {
        reactFlowInstance.fitView({
          nodes: [{ id: node.id }],
          duration: 400,
          padding: 0.1,
        });
        return;
      }
      handleNodeClickForEdge(node.id);
    },
    [handleNodeClickForEdge, reactFlowInstance],
  );

  const canUndo = useStore(useCanvasStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useCanvasStore.temporal, (s) => s.futureStates.length > 0);

  const panOnDrag = useMemo(() => interactionMode === 'pan', [interactionMode]);

  const setSelectedComponentId = useCanvasStore((s) => s.setSelectedComponentId);

  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);

  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      setSelectedComponentId(null);

      if (interactionMode !== 'comment') return;

      // Close any open thread when clicking on blank canvas
      setActiveThread(null);

      const canvasPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setPendingPin({
        screenX: event.clientX,
        screenY: event.clientY,
        canvasX: canvasPos.x,
        canvasY: canvasPos.y,
      });
    },
    [setSelectedComponentId, interactionMode, setActiveThread, screenToFlowPosition],
  );

  const handlePendingSubmit = useCallback(
    (text: string) => {
      if (!pendingPin) return;
      const { canvasX, canvasY } = pendingPin;

      // Persist comment in feedback store
      const commentId = addCanvasComment(canvasX, canvasY, text);

      // Create a React Flow node so the pin zooms/pans with the canvas
      const newNode: CommentFlowNode = {
        id: `comment-node-${commentId}`,
        type: 'comment',
        position: { x: canvasX, y: canvasY },
        data: { commentId },
        draggable: true,
        selectable: false,
        connectable: false,
        deletable: false,
        zIndex: 1000,
      };

      setNodes([...nodes, newNode as any]);
      setPendingPin(null);
    },
    [pendingPin, addCanvasComment, nodes, setNodes],
  );

  const handlePendingCancel = useCallback(() => setPendingPin(null), []);

  return (
    <>
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
        nodesDraggable={interactionMode === 'select' || interactionMode === 'comment'}
        selectionOnDrag={interactionMode === 'select'}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        style={{ cursor: interactionMode === 'comment' ? 'crosshair' : undefined }}
      >
        <MiniMap />
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={20} color="#333" />
        <Toolbar
          onSave={handleSave}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
        <CreateToolbar
          edgeMode={edgeMode}
          edgeSource={edgeSource}
          onToggleEdgeMode={toggleEdgeMode}
        />
      </ReactFlow>

      {/* Pending comment input — outside ReactFlow to avoid zoom/clip */}
      {pendingPin && (
        <CanvasPendingForm
          pending={pendingPin}
          onSubmit={handlePendingSubmit}
          onCancel={handlePendingCancel}
        />
      )}
    </>
  );
}

// ── Root export ───────────────────────────────────────

export function CanvasView() {
  const [paletteOpen, setPaletteOpen] = useState(true);
  const handlePaletteToggle = useCallback(() => setPaletteOpen((prev) => !prev), []);

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const handleFeedbackToggle = useCallback(() => setFeedbackOpen((prev) => !prev), []);

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

      {/* Center: Canvas — wrapped in ReactFlowProvider so useReactFlow works in CanvasFlow */}
      <div style={{ flex: 1, position: 'relative' }}>
        <ArrowMarker />
        <ReactFlowProvider>
          <CanvasFlow />
        </ReactFlowProvider>
      </div>

      {/* Right sidebar: Prop Panel */}
      <PropPanel />

      {/* Right sidebar: Feedback Panel */}
      <FeedbackPanel isOpen={feedbackOpen} onToggle={handleFeedbackToggle} />
    </div>
  );
}
