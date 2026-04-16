import { create } from 'zustand';
import { temporal } from 'zundo';
import { throttle } from 'lodash-es';
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

// ── State shape ──

interface CanvasState {
  // React Flow state
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void;

  // Screen components (flat map)
  components: Record<string, ScreenComponent>;

  // Interaction mode
  interactionMode: InteractionMode;
  setInteractionMode: (mode: InteractionMode) => void;

  // Dirty flag (unsaved changes)
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;

  // Actions
  setNodes: (nodes: CanvasNode[]) => void;
  setEdges: (edges: CanvasEdge[]) => void;
  setComponents: (components: Record<string, ScreenComponent>) => void;
  getComponentsForScreen: (screenId: string) => ScreenComponent[];
  deleteSelectedNodes: () => void;
  updateNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void;
  toggleNodeLock: (nodeId: string) => void;
}

// ── Partialize: only track these fields for undo/redo ──

type UndoState = Pick<CanvasState, 'nodes' | 'edges' | 'components'>;

export const useCanvasStore = create<CanvasState>()(
  temporal(
    (set, get) => ({
      nodes: sampleNodes,
      edges: sampleEdges,
      components: sampleComponents,
      interactionMode: 'select',
      isDirty: false,

      onNodesChange: (changes) => {
        set({
          nodes: applyNodeChanges(changes, get().nodes) as CanvasNode[],
          isDirty: true,
        });
      },

      onEdgesChange: (changes) => {
        set({
          edges: applyEdgeChanges(changes, get().edges) as CanvasEdge[],
          isDirty: true,
        });
      },

      setInteractionMode: (mode) => set({ interactionMode: mode }),
      setDirty: (dirty) => set({ isDirty: dirty }),

      setNodes: (nodes) => set({ nodes, isDirty: true }),
      setEdges: (edges) => set({ edges, isDirty: true }),
      setComponents: (components) => set({ components, isDirty: true }),

      getComponentsForScreen: (screenId) => {
        const all = get().components;
        return Object.values(all)
          .filter((c) => c.screenId === screenId && c.parentId === null)
          .sort((a, b) => a.order - b.order);
      },

      deleteSelectedNodes: () => {
        const { nodes, edges, components } = get();
        const selectedIds = new Set(
          nodes.filter((n) => n.selected).map((n) => n.id),
        );
        if (selectedIds.size === 0) return;

        // Check if any selected node is locked
        const hasLocked = nodes.some(
          (n) => n.selected && n.type === 'screen' && (n.data as any).locked,
        );
        if (hasLocked) return; // Don't delete locked nodes

        // Remove nodes
        const newNodes = nodes.filter((n) => !selectedIds.has(n.id));

        // Remove edges connected to deleted nodes
        const newEdges = edges.filter(
          (e) => !selectedIds.has(e.source) && !selectedIds.has(e.target),
        );

        // Remove components belonging to deleted screens
        const newComponents: Record<string, ScreenComponent> = {};
        for (const [id, comp] of Object.entries(components)) {
          if (!selectedIds.has(comp.screenId)) {
            newComponents[id] = comp;
          }
        }

        set({
          nodes: newNodes,
          edges: newEdges,
          components: newComponents,
          isDirty: true,
        });
      },

      updateNodeData: (nodeId, data) => {
        set({
          nodes: get().nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, ...data } }
              : n,
          ) as CanvasNode[],
          isDirty: true,
        });
      },

      toggleNodeLock: (nodeId) => {
        const node = get().nodes.find((n) => n.id === nodeId);
        if (!node || node.type !== 'screen') return;
        const screenData = node.data as any;
        set({
          nodes: get().nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, locked: !screenData.locked }, draggable: screenData.locked }
              : n,
          ) as CanvasNode[],
          isDirty: true,
        });
      },
    }),
    {
      // zundo options
      partialize: (state): UndoState => ({
        nodes: state.nodes,
        edges: state.edges,
        components: state.components,
      }),
      limit: 50,
      handleSet: (handleSet) =>
        throttle<typeof handleSet>(handleSet, 100, {
          leading: true,
          trailing: true,
        }),
    },
  ),
);
