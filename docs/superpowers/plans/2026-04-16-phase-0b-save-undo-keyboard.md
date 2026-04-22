# Phase 0b: Save + Undo + Keyboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistence (localStorage save/load), undo/redo with zundo, keyboard shortcuts, node resizing, section auto-resize, and node locking — so the canvas becomes a usable editing workspace.

**Architecture:** zundo temporal middleware wraps the existing Zustand store with partialize to track only nodes/edges/components. localStorage adapter provides Phase 0 persistence. Keyboard shortcuts are centralized in an extended Toolbar. NodeResizer from @xyflow/react enables screen resizing. Section auto-resize uses getNodesBounds on drag stop.

**Tech Stack:** @xyflow/react (NodeResizer, getNodesBounds), Zustand 5, zundo, lodash-es (throttle), React 18, Vite 5, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-16-moloco-canvas-design.md` — Sections 6.2, 8, 5, 9 (Phase 0b)

---

## File Map

| File | Responsibility |
|------|---------------|
| `canvas-app/package.json` | Add zundo + lodash-es dependencies |
| `canvas-app/src/store/canvas-store.ts` | Refactor with zundo temporal middleware, add deleteSelectedNodes, updateNodeData |
| `canvas-app/src/services/local-adapter.ts` | localStorage save/load adapter |
| `canvas-app/src/canvas/Toolbar.tsx` | Extend with C mode, undo/redo buttons, save indicator |
| `canvas-app/src/hooks/useKeyboardShortcuts.ts` | Centralized keyboard shortcuts (Delete, Ctrl+Z/Y/S, V/H/C) |
| `canvas-app/src/hooks/useSectionAutoResize.ts` | Auto-resize sections when children move |
| `canvas-app/src/canvas/nodes/ScreenNode.tsx` | Add NodeResizer, respect locked state |
| `canvas-app/src/canvas/nodes/SectionNode.tsx` | Add NodeResizer for manual section resize |
| `canvas-app/src/canvas/CanvasView.tsx` | Wire up hooks, onNodeDragStop, save/load lifecycle |
| `canvas-app/src/App.tsx` | Load from localStorage on mount instead of sample data |
| `canvas-app/src/types.ts` | Add SavedCanvasState type |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `canvas-app/package.json`

- [ ] **Step 1: Install zundo and lodash-es**

Run:
```bash
cd canvas-app && pnpm add zundo lodash-es && pnpm add -D @types/lodash-es
```

Expected: `zundo`, `lodash-es`, and `@types/lodash-es` appear in package.json dependencies/devDependencies.

- [ ] **Step 2: Verify installation**

Run:
```bash
cd canvas-app && node -e "require('zundo'); console.log('zundo OK')" 2>/dev/null; ls node_modules/zundo/package.json && echo "zundo installed"
```

Expected: "zundo installed" printed.

- [ ] **Step 3: Commit**

```bash
git add canvas-app/package.json canvas-app/pnpm-lock.yaml
git commit -m "feat(canvas): add zundo and lodash-es dependencies for Phase 0b"
```

---

## Task 2: Add SavedCanvasState Type

**Files:**
- Modify: `canvas-app/src/types.ts`

- [ ] **Step 1: Add SavedCanvasState and CanvasProject export**

Append to the end of `canvas-app/src/types.ts`:

```typescript
// ── Saved State (for localStorage persistence) ───────

export interface SavedCanvasState {
  project: CanvasProject;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  components: Record<string, ScreenComponent>;
}
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/types.ts
git commit -m "feat(canvas): add SavedCanvasState type for persistence"
```

---

## Task 3: localStorage Adapter

**Files:**
- Create: `canvas-app/src/services/local-adapter.ts`

- [ ] **Step 1: Create local-adapter.ts**

```typescript
import type {
  CanvasNode,
  CanvasEdge,
  ScreenComponent,
  CanvasProject,
  SavedCanvasState,
} from '../types';

const STORAGE_KEY_PREFIX = 'moloco-canvas-';
const DEFAULT_PROJECT_ID = 'default';

function getStorageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

/**
 * Save canvas state to localStorage.
 * Returns true on success, false on failure.
 */
export function saveCanvas(
  projectId: string,
  state: {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    components: Record<string, ScreenComponent>;
  },
): boolean {
  const saved: SavedCanvasState = {
    project: {
      id: projectId,
      name: 'Untitled Project',
      viewport: { x: 0, y: 0, zoom: 1 },
      schemaVersion: 1,
      createdBy: 'local',
      updatedAt: new Date().toISOString(),
    },
    nodes: state.nodes,
    edges: state.edges,
    components: state.components,
  };

  try {
    const json = JSON.stringify(saved);
    localStorage.setItem(getStorageKey(projectId), json);
    return true;
  } catch (err) {
    console.error('[local-adapter] Save failed:', err);
    return false;
  }
}

/**
 * Load canvas state from localStorage.
 * Returns null if not found or corrupted.
 */
export function loadCanvas(
  projectId: string,
): SavedCanvasState | null {
  try {
    const raw = localStorage.getItem(getStorageKey(projectId));
    if (!raw) return null;
    const parsed: SavedCanvasState = JSON.parse(raw);
    // Basic validation
    if (!parsed.nodes || !parsed.edges || !parsed.components) {
      console.warn('[local-adapter] Invalid saved state — missing fields');
      return null;
    }
    return parsed;
  } catch (err) {
    console.error('[local-adapter] Load failed:', err);
    return null;
  }
}

/**
 * Save with 1 retry on failure (as specified in error handling spec).
 * Shows toast-style console warning on final failure.
 */
export function saveCanvasWithRetry(
  projectId: string,
  state: {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    components: Record<string, ScreenComponent>;
  },
): boolean {
  const success = saveCanvas(projectId, state);
  if (success) return true;

  // Retry once
  console.warn('[local-adapter] Retrying save...');
  const retrySuccess = saveCanvas(projectId, state);
  if (!retrySuccess) {
    console.error('[local-adapter] Save failed after retry. Data NOT persisted.');
  }
  return retrySuccess;
}

/**
 * Delete saved canvas from localStorage.
 */
export function deleteCanvas(projectId: string): void {
  localStorage.removeItem(getStorageKey(projectId));
}

/**
 * List all saved project IDs.
 */
export function listSavedProjects(): string[] {
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) {
      ids.push(key.slice(STORAGE_KEY_PREFIX.length));
    }
  }
  return ids;
}

export { DEFAULT_PROJECT_ID };
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/services/local-adapter.ts
git commit -m "feat(canvas): add localStorage adapter for save/load"
```

---

## Task 4: Refactor Zustand Store with zundo

**Files:**
- Modify: `canvas-app/src/store/canvas-store.ts`

This is the most critical task. We wrap the store with `temporal` from zundo, using `partialize` to track only nodes/edges/components, and `throttle` from lodash-es on `handleSet` to prevent excessive undo snapshots during drag.

- [ ] **Step 1: Replace canvas-store.ts with zundo-enabled version**

Replace the entire contents of `canvas-app/src/store/canvas-store.ts` with:

```typescript
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
          ),
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
          ),
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd canvas-app && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors in canvas-store.ts. There may be errors in other files not yet modified — that is fine.

- [ ] **Step 3: Commit**

```bash
git add canvas-app/src/store/canvas-store.ts
git commit -m "feat(canvas): refactor store with zundo temporal middleware (undo/redo)"
```

---

## Task 5: Keyboard Shortcuts Hook

**Files:**
- Create: `canvas-app/src/hooks/useKeyboardShortcuts.ts`

- [ ] **Step 1: Create useKeyboardShortcuts.ts**

This hook centralizes all keyboard shortcuts: Delete, Ctrl+Z (undo), Ctrl+Y / Ctrl+Shift+Z (redo), Ctrl+S (save), V/H/C (mode switching).

```typescript
import { useEffect, useCallback } from 'react';
import { useCanvasStore } from '../store/canvas-store';
import { saveCanvasWithRetry } from '../services/local-adapter';

const DEFAULT_PROJECT_ID = 'default';

export function useKeyboardShortcuts() {
  const setInteractionMode = useCanvasStore((s) => s.setInteractionMode);
  const deleteSelectedNodes = useCanvasStore((s) => s.deleteSelectedNodes);
  const setDirty = useCanvasStore((s) => s.setDirty);

  const handleSave = useCallback(() => {
    const { nodes, edges, components } = useCanvasStore.getState();
    const success = saveCanvasWithRetry(DEFAULT_PROJECT_ID, {
      nodes,
      edges,
      components,
    });
    if (success) {
      setDirty(false);
      console.log('[save] Canvas saved successfully');
    } else {
      console.error('[save] Failed to save canvas');
    }
    return success;
  }, [setDirty]);

  const handleUndo = useCallback(() => {
    useCanvasStore.temporal.getState().undo();
  }, []);

  const handleRedo = useCallback(() => {
    useCanvasStore.temporal.getState().redo();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if focused on input elements
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;

      // ── Ctrl+S: Save ──
      if (isMod && e.key === 's') {
        e.preventDefault();
        handleSave();
        return;
      }

      // ── Ctrl+Z: Undo ──
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // ── Ctrl+Y or Ctrl+Shift+Z: Redo ──
      if (isMod && (e.key === 'y' || (e.key === 'z' && e.shiftKey) || (e.key === 'Z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // ── Delete / Backspace: Delete selected nodes ──
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedNodes();
        return;
      }

      // ── V: Select mode ──
      if (e.key === 'v' || e.key === 'V') {
        setInteractionMode('select');
        return;
      }

      // ── H: Pan mode ──
      if (e.key === 'h' || e.key === 'H') {
        setInteractionMode('pan');
        return;
      }

      // ── C: Comment mode ──
      if (e.key === 'c' || e.key === 'C') {
        setInteractionMode('comment');
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, handleUndo, handleRedo, deleteSelectedNodes, setInteractionMode]);

  return { handleSave, handleUndo, handleRedo };
}
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/hooks/useKeyboardShortcuts.ts
git commit -m "feat(canvas): add centralized keyboard shortcuts hook"
```

---

## Task 6: Section Auto-Resize Hook

**Files:**
- Create: `canvas-app/src/hooks/useSectionAutoResize.ts`

- [ ] **Step 1: Create useSectionAutoResize.ts**

When a child node finishes dragging inside a section, recalculate the section bounds using `getNodesBounds` and resize the parent section to fit all children with padding.

```typescript
import { useCallback } from 'react';
import { getNodesBounds, type Node } from '@xyflow/react';
import { useCanvasStore } from '../store/canvas-store';

const SECTION_PADDING = 40;
const SECTION_TOP_PADDING = 60; // extra space for label

/**
 * Returns an onNodeDragStop handler that auto-resizes the parent
 * section node to fit all its children.
 */
export function useSectionAutoResize() {
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, draggedNode: Node) => {
      const { nodes } = useCanvasStore.getState();

      // Find the parent section of the dragged node
      const parentId = draggedNode.parentId;
      if (!parentId) return;

      const parentNode = nodes.find((n) => n.id === parentId);
      if (!parentNode || parentNode.type !== 'section') return;

      // Get all children of this section
      const children = nodes.filter((n) => n.parentId === parentId);
      if (children.length === 0) return;

      // Calculate bounds of all children (positions are relative to parent)
      const bounds = getNodesBounds(children);

      // Calculate new section size
      const newWidth = Math.max(
        bounds.x + bounds.width + SECTION_PADDING,
        300, // minimum width
      );
      const newHeight = Math.max(
        bounds.y + bounds.height + SECTION_PADDING,
        200, // minimum height
      );

      // Update section node style with new dimensions
      useCanvasStore.setState({
        nodes: nodes.map((n) =>
          n.id === parentId
            ? {
                ...n,
                style: {
                  ...n.style,
                  width: newWidth,
                  height: newHeight,
                },
              }
            : n,
        ),
      });
    },
    [],
  );

  return { handleNodeDragStop };
}
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/hooks/useSectionAutoResize.ts
git commit -m "feat(canvas): add section auto-resize hook using getNodesBounds"
```

---

## Task 7: Update ScreenNode with NodeResizer

**Files:**
- Modify: `canvas-app/src/canvas/nodes/ScreenNode.tsx`

- [ ] **Step 1: Replace ScreenNode.tsx with NodeResizer-enabled version**

Replace the entire contents of `canvas-app/src/canvas/nodes/ScreenNode.tsx` with:

```tsx
import React, { useMemo, useCallback } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import type { ScreenNode as ScreenNodeType } from '../../types';
import { DSComponentRenderer } from '../../ds-registry/DSComponentRenderer';
import { useCanvasStore } from '../../store/canvas-store';

export const ScreenNode = React.memo(function ScreenNode({
  id,
  data,
  selected,
}: NodeProps<ScreenNodeType>) {
  const allComponents = useCanvasStore((s) => s.components);
  const toggleNodeLock = useCanvasStore((s) => s.toggleNodeLock);

  const components = useMemo(
    () =>
      Object.values(allComponents)
        .filter((c) => c.screenId === id && c.parentId === null)
        .sort((a, b) => a.order - b.order),
    [allComponents, id],
  );

  const handleLockToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleNodeLock(id);
    },
    [id, toggleNodeLock],
  );

  const isLocked = data.locked;

  return (
    <>
      {/* NodeResizer — only visible when selected and not locked */}
      <NodeResizer
        isVisible={selected && !isLocked}
        minWidth={200}
        minHeight={150}
        lineStyle={{ stroke: '#346bea', strokeWidth: 1 }}
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: '#346bea',
          border: 'none',
        }}
      />

      <div
        style={{
          width: '100%',
          minHeight: data.height,
          background: '#ffffff',
          borderRadius: 8,
          border: selected ? '2px solid #346bea' : '1px solid #e0e0e0',
          boxShadow: selected
            ? '0 0 0 2px rgba(52,107,234,0.2)'
            : '0 2px 8px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          fontSize: 14,
        }}
      >
        {/* Title bar */}
        <div
          style={{
            background: '#f5f5f5',
            borderBottom: '1px solid #e0e0e0',
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: isLocked ? 'default' : 'grab',
          }}
        >
          <div style={{ display: 'flex', gap: 4 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#ff5f57',
              }}
            />
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#febc2e',
              }}
            />
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#28c840',
              }}
            />
          </div>
          <div
            style={{
              fontSize: 11,
              color: '#666',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {data.name}
          </div>
          <button
            onClick={handleLockToggle}
            title={isLocked ? 'Unlock node' : 'Lock node'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 10,
              color: isLocked ? '#e67e22' : '#bbb',
              padding: '2px 4px',
              borderRadius: 3,
              lineHeight: 1,
            }}
          >
            {isLocked ? '\uD83D\uDD12' : '\uD83D\uDD13'}
          </button>
        </div>

        {/* Components */}
        <div
          style={{
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {components.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: '#ccc',
                fontSize: 12,
                border: '1px dashed #e0e0e0',
                borderRadius: 6,
              }}
            >
              컴포넌트를 추가하세요
            </div>
          ) : (
            components.map((comp) => (
              <DSComponentRenderer key={comp.id} component={comp} />
            ))
          )}
        </div>

        {/* Connection handles */}
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: '#346bea' }}
        />
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: '#346bea' }}
        />
      </div>
    </>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/canvas/nodes/ScreenNode.tsx
git commit -m "feat(canvas): add NodeResizer and lock toggle to ScreenNode"
```

---

## Task 8: Update SectionNode with NodeResizer

**Files:**
- Modify: `canvas-app/src/canvas/nodes/SectionNode.tsx`

- [ ] **Step 1: Read current SectionNode**

Read `canvas-app/src/canvas/nodes/SectionNode.tsx` to confirm current content.

- [ ] **Step 2: Replace SectionNode.tsx with NodeResizer-enabled version**

Replace the entire contents of `canvas-app/src/canvas/nodes/SectionNode.tsx` with:

```tsx
import React from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { SectionNode as SectionNodeType } from '../../types';

export const SectionNode = React.memo(function SectionNode({
  data,
  selected,
}: NodeProps<SectionNodeType>) {
  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={300}
        minHeight={200}
        lineStyle={{ stroke: data.color, strokeWidth: 1 }}
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: data.color,
          border: 'none',
        }}
      />
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 12,
          border: `2px dashed ${data.color}`,
          background: `${data.color}08`,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -28,
            left: 8,
            fontSize: 13,
            fontWeight: 600,
            color: data.color,
            background: '#0a0a14',
            padding: '2px 10px',
            borderRadius: 4,
            userSelect: 'none',
          }}
        >
          {data.name}
        </div>
      </div>
    </>
  );
});
```

- [ ] **Step 3: Commit**

```bash
git add canvas-app/src/canvas/nodes/SectionNode.tsx
git commit -m "feat(canvas): add NodeResizer to SectionNode"
```

---

## Task 9: Update Toolbar with C Mode + Undo/Redo/Save Buttons

**Files:**
- Modify: `canvas-app/src/canvas/Toolbar.tsx`

- [ ] **Step 1: Replace Toolbar.tsx with extended version**

Replace the entire contents of `canvas-app/src/canvas/Toolbar.tsx` with:

```tsx
import React from 'react';
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
  const interactionMode = useCanvasStore((s) => s.interactionMode);
  const setInteractionMode = useCanvasStore((s) => s.setInteractionMode);
  const isDirty = useCanvasStore((s) => s.isDirty);

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
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/canvas/Toolbar.tsx
git commit -m "feat(canvas): extend Toolbar with undo/redo, comment mode, save button"
```

---

## Task 10: Update CanvasView to Wire Everything Together

**Files:**
- Modify: `canvas-app/src/canvas/CanvasView.tsx`

- [ ] **Step 1: Replace CanvasView.tsx with fully wired version**

Replace the entire contents of `canvas-app/src/canvas/CanvasView.tsx` with:

```tsx
import { useMemo } from 'react';
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
import { ScreenNode } from './nodes/ScreenNode';
import { SectionNode } from './nodes/SectionNode';
import { FlowEdge } from './edges/FlowEdge';
import { Toolbar } from './Toolbar';
import { useCanvasStore } from '../store/canvas-store';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useSectionAutoResize } from '../hooks/useSectionAutoResize';

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

  // Keyboard shortcuts (Delete, Ctrl+Z/Y/S, V/H/C)
  const { handleSave, handleUndo, handleRedo } = useKeyboardShortcuts();

  // Section auto-resize on child drag stop
  const { handleNodeDragStop } = useSectionAutoResize();

  // Undo/redo state from zundo temporal store
  const canUndo = useStore(useCanvasStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useCanvasStore.temporal, (s) => s.futureStates.length > 0);

  // Determine pan behavior from interaction mode
  const panOnDrag = useMemo(
    () => interactionMode === 'pan',
    [interactionMode],
  );

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a14' }}>
      <ArrowMarker />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
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
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/canvas/CanvasView.tsx
git commit -m "feat(canvas): wire CanvasView with shortcuts, auto-resize, undo/redo"
```

---

## Task 11: Update App.tsx with Load-from-Storage Logic

**Files:**
- Modify: `canvas-app/src/App.tsx`

- [ ] **Step 1: Replace App.tsx with localStorage-aware version**

Replace the entire contents of `canvas-app/src/App.tsx` with:

```tsx
import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CanvasView } from './canvas/CanvasView';
import { useCanvasStore } from './store/canvas-store';
import { loadCanvas, DEFAULT_PROJECT_ID } from './services/local-adapter';
import './App.css';

export default function App() {
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);
  const setComponents = useCanvasStore((s) => s.setComponents);
  const setDirty = useCanvasStore((s) => s.setDirty);

  useEffect(() => {
    // Try to load from localStorage
    const saved = loadCanvas(DEFAULT_PROJECT_ID);

    if (saved) {
      console.log('[app] Loaded saved canvas from localStorage');
      setNodes(saved.nodes);
      setEdges(saved.edges);
      setComponents(saved.components);
      setDirty(false);
    } else {
      console.log('[app] No saved state found — using sample data');
      // Sample data is already set as the store default.
      // Mark as dirty so user knows it is not yet persisted.
      setDirty(true);
    }
  }, [setNodes, setEdges, setComponents, setDirty]);

  return (
    <ReactFlowProvider>
      <CanvasView />
    </ReactFlowProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/App.tsx
git commit -m "feat(canvas): load from localStorage on mount, fall back to sample data"
```

---

## Task 12: Verify Full Integration

- [ ] **Step 1: Type check**

Run:
```bash
cd canvas-app && npx tsc --noEmit 2>&1 | head -40
```

Expected: No errors. If there are errors, fix them before proceeding.

- [ ] **Step 2: Start dev server and manually test**

Run:
```bash
cd canvas-app && pnpm dev
```

Expected behaviors to verify:

1. **Save (Ctrl+S):** Press Ctrl+S. Console shows "[save] Canvas saved successfully". Toolbar "Save" button changes to "Saved". Refresh the page — canvas restores to the same state.

2. **Undo/Redo (Ctrl+Z/Y):** Drag a node to a new position. Press Ctrl+Z — node returns to previous position. Press Ctrl+Y — node moves back to new position. Undo button in toolbar is clickable when there is history.

3. **Delete:** Select a node, press Delete — node and its connected edges are removed. Ctrl+Z restores them.

4. **Mode switching (V/H/C):** Press V — select mode (cursor icon active in toolbar). Press H — pan mode. Press C — comment mode (speech bubble icon active). Toolbar buttons reflect the active mode.

5. **Node resize:** Click a screen node to select it. Resize handles appear at edges and corners. Drag a handle — node resizes. Locked nodes do NOT show resize handles.

6. **Node lock:** Click the lock icon in a screen node's title bar. Node becomes locked (lock icon changes). Locked node cannot be dragged or resized. Click lock again to unlock.

7. **Section auto-resize:** Drag a screen to the edge of its section. When you release, the section boundary expands to contain the screen.

- [ ] **Step 3: Fix any TypeScript or runtime issues**

If `tsc --noEmit` shows errors, address each one. Common issues:
- zundo `temporal` store usage: ensure `useCanvasStore.temporal` is used correctly for subscribing to undo/redo state.
- NodeResizer import: ensure it comes from `@xyflow/react`.
- Type castings for `CanvasNode[]` after `applyNodeChanges`.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(canvas): Phase 0b complete — save, undo, keyboard, resize, lock"
```

---

## Acceptance Criteria Checklist

These map to the spec's Phase 0b completion criteria:

- [ ] Ctrl+S saves to localStorage; refreshing the page restores the same canvas state
- [ ] Ctrl+Z/Y undoes and redoes node move, delete, and prop changes
- [ ] V/H/C keys switch interaction modes (select/pan/comment)
- [ ] NodeResizer handles appear on selected screen nodes; dragging resizes the node
- [ ] Section auto-resizes when child nodes are dragged to its edge
- [ ] Lock toggle in screen title bar prevents drag, resize, and delete
- [ ] Delete key removes selected (unlocked) nodes and their connected edges
- [ ] Undo history is capped at 50 snapshots
- [ ] Save failure triggers 1 automatic retry with console warning
- [ ] Load failure (no saved data) starts with sample data and shows console message
- [ ] Toolbar shows undo/redo buttons with disabled state, save status indicator, and all 3 mode buttons
