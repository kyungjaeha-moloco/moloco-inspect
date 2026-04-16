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

  // ── Editor state (Phase 1) ──
  selectedComponentId: string | null;
  setSelectedComponentId: (id: string | null) => void;

  // Component CRUD
  addComponent: (screenId: string, type: string, props?: Record<string, any>) => string;
  updateComponentProps: (componentId: string, props: Record<string, any>) => void;
  removeComponent: (componentId: string) => void;
  moveComponentUp: (componentId: string) => void;
  moveComponentDown: (componentId: string) => void;

  // Screen/Section/Edge creation
  addScreen: (name: string, position: { x: number; y: number }, parentId?: string) => string;
  addSection: (name: string, position: { x: number; y: number }) => string;
  addEdge: (sourceId: string, targetId: string, label?: string) => string;
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
      selectedComponentId: null,

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
      setSelectedComponentId: (id) => set({ selectedComponentId: id }),

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

      addComponent: (screenId, type, props = {}) => {
        const { components } = get();
        const siblings = Object.values(components).filter(
          (c) => c.screenId === screenId && c.parentId === null,
        );
        const newId = `comp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newComponent: ScreenComponent = {
          id: newId,
          screenId,
          parentId: null,
          childIds: [],
          type,
          props,
          order: siblings.length,
          createdAt: new Date().toISOString(),
        };
        set({
          components: { ...components, [newId]: newComponent },
          selectedComponentId: newId,
          isDirty: true,
        });
        return newId;
      },

      updateComponentProps: (componentId, props) => {
        const { components } = get();
        const comp = components[componentId];
        if (!comp) return;
        set({
          components: {
            ...components,
            [componentId]: { ...comp, props: { ...comp.props, ...props } },
          },
          isDirty: true,
        });
      },

      removeComponent: (componentId) => {
        const { components, selectedComponentId } = get();
        const comp = components[componentId];
        if (!comp) return;
        const newComponents = { ...components };
        delete newComponents[componentId];
        // Re-order remaining siblings
        const siblings = Object.values(newComponents)
          .filter((c) => c.screenId === comp.screenId && c.parentId === comp.parentId)
          .sort((a, b) => a.order - b.order);
        siblings.forEach((s, i) => {
          newComponents[s.id] = { ...newComponents[s.id], order: i };
        });
        set({
          components: newComponents,
          selectedComponentId: selectedComponentId === componentId ? null : selectedComponentId,
          isDirty: true,
        });
      },

      moveComponentUp: (componentId) => {
        const { components } = get();
        const comp = components[componentId];
        if (!comp || comp.order === 0) return;
        // Find the sibling directly above
        const above = Object.values(components).find(
          (c) =>
            c.screenId === comp.screenId &&
            c.parentId === comp.parentId &&
            c.order === comp.order - 1,
        );
        if (!above) return;
        set({
          components: {
            ...components,
            [componentId]: { ...comp, order: comp.order - 1 },
            [above.id]: { ...above, order: above.order + 1 },
          },
          isDirty: true,
        });
      },

      moveComponentDown: (componentId) => {
        const { components } = get();
        const comp = components[componentId];
        if (!comp) return;
        const siblings = Object.values(components).filter(
          (c) => c.screenId === comp.screenId && c.parentId === comp.parentId,
        );
        if (comp.order >= siblings.length - 1) return;
        const below = Object.values(components).find(
          (c) =>
            c.screenId === comp.screenId &&
            c.parentId === comp.parentId &&
            c.order === comp.order + 1,
        );
        if (!below) return;
        set({
          components: {
            ...components,
            [componentId]: { ...comp, order: comp.order + 1 },
            [below.id]: { ...below, order: below.order - 1 },
          },
          isDirty: true,
        });
      },

      addScreen: (name, position, parentId) => {
        const { nodes } = get();
        const newId = `screen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newNode: CanvasNode = {
          id: newId,
          type: 'screen',
          position,
          width: 320,
          height: 400,
          ...(parentId ? { parentId, expandParent: true } : {}),
          data: {
            name,
            width: 320,
            height: 400,
            zIndex: 1,
            locked: false,
          },
        } as CanvasNode;
        set({ nodes: [...nodes, newNode], isDirty: true });
        return newId;
      },

      addSection: (name, position) => {
        const { nodes } = get();
        const newId = `section-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newNode: CanvasNode = {
          id: newId,
          type: 'section',
          position,
          style: { width: 800, height: 500 },
          data: {
            name,
            color: '#346bea',
          },
        } as CanvasNode;
        // Sections must come before their children in the array
        set({ nodes: [newNode, ...nodes], isDirty: true });
        return newId;
      },

      addEdge: (sourceId, targetId, label = '') => {
        const { edges } = get();
        const newId = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newEdge: CanvasEdge = {
          id: newId,
          source: sourceId,
          target: targetId,
          type: 'flow',
          data: { label },
        };
        set({ edges: [...edges, newEdge], isDirty: true });
        return newId;
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
