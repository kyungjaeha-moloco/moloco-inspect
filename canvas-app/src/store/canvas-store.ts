import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import type {
  CanvasNode,
  CanvasEdge,
  ScreenComponent,
  InteractionMode,
} from '../types';
import { sampleNodes, sampleEdges, sampleComponents } from '../sample-data';

interface CanvasState {
  // ── React Flow state ──
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void;

  // ── Screen components (flat map) ──
  components: Record<string, ScreenComponent>;

  // ── Interaction mode ──
  interactionMode: InteractionMode;
  setInteractionMode: (mode: InteractionMode) => void;

  // ── Actions ──
  setNodes: (nodes: CanvasNode[]) => void;
  setEdges: (edges: CanvasEdge[]) => void;
  setComponents: (components: Record<string, ScreenComponent>) => void;
  getComponentsForScreen: (screenId: string) => ScreenComponent[];
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: sampleNodes,
  edges: sampleEdges,
  components: sampleComponents,
  interactionMode: 'select',

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) as CanvasNode[] });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) as CanvasEdge[] });
  },

  setInteractionMode: (mode) => set({ interactionMode: mode }),

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setComponents: (components) => set({ components }),

  getComponentsForScreen: (screenId) => {
    const all = get().components;
    return Object.values(all)
      .filter((c) => c.screenId === screenId && c.parentId === null)
      .sort((a, b) => a.order - b.order);
  },
}));
