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

import { ScreenNode } from './nodes/ScreenNode';
import { SectionNode } from './nodes/SectionNode';
import { FlowEdge } from './edges/FlowEdge';
import { Toolbar } from './Toolbar';
import { useCanvasStore } from '../store/canvas-store';

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
    useCanvasStore();

  return (
    <div style={{ width: '100%', height: '100%', background: '#0a0a14' }}>
      <ArrowMarker />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        panOnDrag={interactionMode === 'pan'}
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
        <Toolbar />
      </ReactFlow>
    </div>
  );
}
