# Phase 0a: Canvas Core + DS Rendering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a working infinite canvas where DS component screens are laid out in sections with flow arrows — zoom, pan, select, drag all working.

**Architecture:** React Flow provides the canvas engine. Custom node types (ScreenNode, SectionNode) render DS components inside draggable frames. Zustand manages state in controlled mode. Existing preview components from design-system-site are reused via Vite aliases.

**Tech Stack:** @xyflow/react, Zustand, React 18, Vite 5, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-16-moloco-canvas-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `canvas-app/package.json` | Dependencies and scripts |
| `canvas-app/vite.config.ts` | Vite config with aliases to DS code |
| `canvas-app/index.html` | HTML entry point |
| `canvas-app/src/main.tsx` | React root mount |
| `canvas-app/src/App.tsx` | App shell with ReactFlowProvider |
| `canvas-app/src/types.ts` | All TypeScript interfaces (ScreenData, SectionData, ScreenComponent, etc.) |
| `canvas-app/src/store/canvas-store.ts` | Zustand store: nodes, edges, components, interactionMode |
| `canvas-app/src/ds-registry/registry.ts` | Map of component name → preview renderer |
| `canvas-app/src/ds-registry/DSComponentRenderer.tsx` | Renders a ScreenComponent by looking up registry + Error Boundary |
| `canvas-app/src/canvas/nodes/ScreenNode.tsx` | Custom node: screen frame with DS components inside |
| `canvas-app/src/canvas/nodes/SectionNode.tsx` | Group node: section with colored border and label |
| `canvas-app/src/canvas/edges/FlowEdge.tsx` | Custom edge: labeled arrow between screens |
| `canvas-app/src/canvas/Toolbar.tsx` | Interaction mode switcher (select/pan) |
| `canvas-app/src/canvas/CanvasView.tsx` | Main `<ReactFlow>` wrapper with minimap, controls, background |
| `canvas-app/src/sample-data.ts` | Sample project data for demo |
| `canvas-app/src/App.css` | Styles for canvas app |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `canvas-app/package.json`
- Create: `canvas-app/vite.config.ts`
- Create: `canvas-app/index.html`
- Create: `canvas-app/tsconfig.json`
- Create: `canvas-app/tsconfig.node.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "moloco-canvas",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 4180",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 0.0.0.0 --port 4181",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@xyflow/react": "^12.6.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "typescript": "^5.7.2",
    "vite": "^5.4.10",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

```typescript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESIGN_SYSTEM_SRC = path.resolve(__dirname, '../design-system/src');
const DS_PREVIEWS = path.resolve(__dirname, '../design-system-site/src/components/previews');
const DS_SITE_SRC = path.resolve(__dirname, '../design-system-site/src');

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@design-system': DESIGN_SYSTEM_SRC,
      '@ds-previews': DS_PREVIEWS,
      '@ds-site': DS_SITE_SRC,
      '@canvas-data': path.resolve(__dirname, './data'),
    },
  },
  server: {
    fs: {
      strict: false,
      allow: [__dirname, DESIGN_SYSTEM_SRC, DS_PREVIEWS, DS_SITE_SRC],
    },
  },
});
```

- [ ] **Step 3: Create index.html**

```html
<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Moloco Canvas</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@design-system/*": ["../design-system/src/*"],
      "@ds-previews/*": ["../design-system-site/src/components/previews/*"],
      "@ds-site/*": ["../design-system-site/src/*"],
      "@canvas-data/*": ["./data/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: Install dependencies**

Run: `cd canvas-app && pnpm install`
Expected: All dependencies installed, `node_modules/` created, `pnpm-lock.yaml` generated.

- [ ] **Step 7: Commit**

```bash
git add canvas-app/package.json canvas-app/vite.config.ts canvas-app/index.html canvas-app/tsconfig.json canvas-app/tsconfig.node.json canvas-app/pnpm-lock.yaml
git commit -m "feat(canvas): scaffold Vite project with React Flow deps"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `canvas-app/src/types.ts`

- [ ] **Step 1: Create types file**

```typescript
import type { Node, Edge } from '@xyflow/react';

// ── Section (Group Node) ──────────────────────────────

export interface SectionData {
  name: string;
  color: string;
}

export type SectionNode = Node<SectionData, 'section'>;

// ── Screen (Custom Node) ──────────────────────────────

export interface ScreenData {
  name: string;
  width: number;
  height: number;
  zIndex: number;
  locked: boolean;
}

export type ScreenNode = Node<ScreenData, 'screen'>;

// ── ScreenComponent (flat map) ────────────────────────

export interface ScreenComponent {
  id: string;
  screenId: string;
  parentId: string | null;
  childIds: string[];
  type: string;             // "MCButton2", "MCFormTextInput", etc.
  props: Record<string, any>;
  order: number;
  createdAt: string;
}

// ── Flow Edge ─────────────────────────────────────────

export interface FlowData {
  label: string;
}

export type FlowEdge = Edge<FlowData>;

// ── Canvas Project ────────────────────────────────────

export interface CanvasProject {
  id: string;
  name: string;
  viewport: { x: number; y: number; zoom: number };
  schemaVersion: number;
  createdBy: string;
  updatedAt: string;
}

// ── Interaction Mode ──────────────────────────────────

export type InteractionMode = 'select' | 'pan' | 'comment';

// ── Union types for React Flow ────────────────────────

export type CanvasNode = SectionNode | ScreenNode;
export type CanvasEdge = FlowEdge;
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/types.ts
git commit -m "feat(canvas): add TypeScript types for canvas data model"
```

---

## Task 3: Zustand Store

**Files:**
- Create: `canvas-app/src/store/canvas-store.ts`

- [ ] **Step 1: Create the store**

```typescript
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
  nodes: [],
  edges: [],
  components: {},
  interactionMode: 'select',

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
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
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/store/canvas-store.ts
git commit -m "feat(canvas): add Zustand store for nodes, edges, components"
```

---

## Task 4: DS Component Registry + Renderer

**Files:**
- Create: `canvas-app/src/ds-registry/registry.ts`
- Create: `canvas-app/src/ds-registry/DSComponentRenderer.tsx`

- [ ] **Step 1: Create the registry**

This maps DS component type names to their preview renderers. We import the existing interactive previews from design-system-site.

```typescript
import React from 'react';
import {
  ButtonPreview,
  TextInputPreview,
  TextAreaPreview,
  NumberInputPreview,
  CheckBoxPreview,
  SwitchPreview,
  RadioPreview,
  TabsPreview,
  AccordionPreview,
  DialogPreview,
  SelectPreview,
  SearchBarPreview,
  StatusPreview,
  BannerPreview,
  LoaderPreview,
} from '@ds-previews/index';

type PreviewRenderer = React.ComponentType<{ propValues?: Record<string, any> }>;

/**
 * Maps DS component type name → preview renderer.
 * Only components with existing preview files are included.
 */
export const PREVIEW_REGISTRY: Record<string, PreviewRenderer> = {
  MCButton2: ButtonPreview,
  MCFormTextInput: TextInputPreview,
  MCFormTextArea: TextAreaPreview,
  MCFormNumberInput: NumberInputPreview,
  MCFormCheckBox: CheckBoxPreview,
  MCFormSwitchInput: SwitchPreview,
  MCFormRadioGroup: RadioPreview,
  MCBarTabs: TabsPreview,
  MCAccordion: AccordionPreview,
  MCCommonDialog: DialogPreview,
  MCFormSingleRichSelect: SelectPreview,
  MCSearchBar: SearchBarPreview,
  MCStatus: StatusPreview,
  MCBanner: BannerPreview,
  MCCircularLoader: LoaderPreview,
};

export function hasPreview(type: string): boolean {
  return type in PREVIEW_REGISTRY;
}
```

- [ ] **Step 2: Create DSComponentRenderer with Error Boundary**

```tsx
import React, { Component, type ReactNode } from 'react';
import { PREVIEW_REGISTRY } from './registry';
import type { ScreenComponent } from '../types';

// ── Error Boundary ──

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class PreviewErrorBoundary extends Component<
  { componentType: string; children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 12,
          background: '#2a1a1a',
          border: '1px solid #b91c1c',
          borderRadius: 6,
          color: '#f87171',
          fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {this.props.componentType}
          </div>
          <div style={{ color: '#888' }}>렌더링 실패</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Renderer ──

interface Props {
  component: ScreenComponent;
}

export const DSComponentRenderer = React.memo(function DSComponentRenderer({
  component,
}: Props) {
  const Preview = PREVIEW_REGISTRY[component.type];

  if (!Preview) {
    return (
      <div style={{
        padding: 12,
        background: '#1a1a2e',
        border: '1px dashed #334',
        borderRadius: 6,
        color: '#888',
        fontSize: 12,
        textAlign: 'center',
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{component.type}</div>
        <div style={{ fontSize: 10, color: '#555' }}>프리뷰 없음</div>
      </div>
    );
  }

  return (
    <PreviewErrorBoundary componentType={component.type}>
      <Preview propValues={component.props} />
    </PreviewErrorBoundary>
  );
});
```

- [ ] **Step 3: Verify it compiles**

Run: `cd canvas-app && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to types.ts, registry.ts, or DSComponentRenderer.tsx. There may be warnings about missing App.tsx — that is expected at this stage.

- [ ] **Step 4: Commit**

```bash
git add canvas-app/src/ds-registry/
git commit -m "feat(canvas): add DS component registry and renderer with error boundary"
```

---

## Task 5: SectionNode (Group Node)

**Files:**
- Create: `canvas-app/src/canvas/nodes/SectionNode.tsx`

- [ ] **Step 1: Create SectionNode**

```tsx
import React from 'react';
import type { NodeProps } from '@xyflow/react';
import type { SectionNode as SectionNodeType } from '../../types';

export const SectionNode = React.memo(function SectionNode({
  data,
}: NodeProps<SectionNodeType>) {
  return (
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
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/canvas/nodes/SectionNode.tsx
git commit -m "feat(canvas): add SectionNode group node component"
```

---

## Task 6: ScreenNode (Custom Node)

**Files:**
- Create: `canvas-app/src/canvas/nodes/ScreenNode.tsx`

- [ ] **Step 1: Create ScreenNode**

This is the core node. It renders a "screen frame" with a title bar and DS components inside.

```tsx
import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ScreenNode as ScreenNodeType } from '../../types';
import { DSComponentRenderer } from '../../ds-registry/DSComponentRenderer';
import { useCanvasStore } from '../../store/canvas-store';

export const ScreenNode = React.memo(function ScreenNode({
  id,
  data,
  selected,
}: NodeProps<ScreenNodeType>) {
  const components = useCanvasStore((s) => s.getComponentsForScreen(id));

  return (
    <div
      style={{
        width: data.width,
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
          cursor: data.locked ? 'default' : 'grab',
        }}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f57' }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#febc2e' }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#28c840' }} />
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
        {data.locked && (
          <span style={{ fontSize: 10, color: '#999' }}>🔒</span>
        )}
      </div>

      {/* Component content area */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
      <Handle type="source" position={Position.Right} style={{ background: '#346bea' }} />
      <Handle type="target" position={Position.Left} style={{ background: '#346bea' }} />
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/canvas/nodes/ScreenNode.tsx
git commit -m "feat(canvas): add ScreenNode with DS component rendering"
```

---

## Task 7: FlowEdge (Custom Edge)

**Files:**
- Create: `canvas-app/src/canvas/edges/FlowEdge.tsx`

- [ ] **Step 1: Create FlowEdge**

```tsx
import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import type { FlowEdge as FlowEdgeType } from '../../types';

export const FlowEdge = React.memo(function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<FlowEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? '#346bea' : '#94a3b8',
          strokeWidth: selected ? 2 : 1.5,
        }}
        markerEnd="url(#arrow)"
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 11,
              fontWeight: 500,
              color: '#666',
              background: '#fff',
              border: '1px solid #e0e0e0',
              borderRadius: 4,
              padding: '2px 8px',
              pointerEvents: 'all',
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/canvas/edges/FlowEdge.tsx
git commit -m "feat(canvas): add FlowEdge with label rendering"
```

---

## Task 8: Toolbar (Interaction Modes)

**Files:**
- Create: `canvas-app/src/canvas/Toolbar.tsx`

- [ ] **Step 1: Create Toolbar**

```tsx
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
      }}
    >
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
            background: interactionMode === mode.key ? '#e8f0fe' : 'transparent',
            color: interactionMode === mode.key ? '#346bea' : '#666',
          }}
        >
          {mode.icon}
        </button>
      ))}
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/canvas/Toolbar.tsx
git commit -m "feat(canvas): add Toolbar with select/pan mode switching"
```

---

## Task 9: Sample Data

**Files:**
- Create: `canvas-app/src/sample-data.ts`

- [ ] **Step 1: Create sample data**

This provides a working demo with a "캠페인 생성 플로우" section containing 3 screens connected by flow edges.

```typescript
import type { CanvasNode, CanvasEdge, ScreenComponent } from './types';

export const sampleNodes: CanvasNode[] = [
  // Section
  {
    id: 'section-1',
    type: 'section',
    position: { x: 0, y: 0 },
    data: { name: '캠페인 생성 플로우', color: '#346bea' },
    style: { width: 1200, height: 600 },
  },
  // Screen 1
  {
    id: 'screen-1',
    type: 'screen',
    position: { x: 40, y: 60 },
    parentId: 'section-1',
    data: {
      name: 'Step 1: 캠페인 정보 입력',
      width: 320,
      height: 400,
      zIndex: 1,
      locked: false,
    },
    expandParent: true,
  },
  // Screen 2
  {
    id: 'screen-2',
    type: 'screen',
    position: { x: 440, y: 60 },
    parentId: 'section-1',
    data: {
      name: 'Step 2: 타겟팅 설정',
      width: 320,
      height: 400,
      zIndex: 1,
      locked: false,
    },
    expandParent: true,
  },
  // Screen 3
  {
    id: 'screen-3',
    type: 'screen',
    position: { x: 840, y: 60 },
    parentId: 'section-1',
    data: {
      name: 'Step 3: 완료',
      width: 320,
      height: 300,
      zIndex: 1,
      locked: false,
    },
    expandParent: true,
  },
];

export const sampleEdges: CanvasEdge[] = [
  {
    id: 'edge-1-2',
    source: 'screen-1',
    target: 'screen-2',
    type: 'flow',
    data: { label: '다음' },
  },
  {
    id: 'edge-2-3',
    source: 'screen-2',
    target: 'screen-3',
    type: 'flow',
    data: { label: '완료' },
  },
];

export const sampleComponents: Record<string, ScreenComponent> = {
  'comp-1': {
    id: 'comp-1',
    screenId: 'screen-1',
    parentId: null,
    childIds: [],
    type: 'MCFormTextInput',
    props: { state: 'default', required: true },
    order: 0,
    createdAt: new Date().toISOString(),
  },
  'comp-2': {
    id: 'comp-2',
    screenId: 'screen-1',
    parentId: null,
    childIds: [],
    type: 'MCFormTextArea',
    props: {},
    order: 1,
    createdAt: new Date().toISOString(),
  },
  'comp-3': {
    id: 'comp-3',
    screenId: 'screen-1',
    parentId: null,
    childIds: [],
    type: 'MCButton2',
    props: { variant: 'contained', size: 'medium' },
    order: 2,
    createdAt: new Date().toISOString(),
  },
  'comp-4': {
    id: 'comp-4',
    screenId: 'screen-2',
    parentId: null,
    childIds: [],
    type: 'MCFormCheckBox',
    props: { checked: false },
    order: 0,
    createdAt: new Date().toISOString(),
  },
  'comp-5': {
    id: 'comp-5',
    screenId: 'screen-2',
    parentId: null,
    childIds: [],
    type: 'MCFormSwitchInput',
    props: { on: true },
    order: 1,
    createdAt: new Date().toISOString(),
  },
  'comp-6': {
    id: 'comp-6',
    screenId: 'screen-3',
    parentId: null,
    childIds: [],
    type: 'MCStatus',
    props: { variant: 'positive' },
    order: 0,
    createdAt: new Date().toISOString(),
  },
  'comp-7': {
    id: 'comp-7',
    screenId: 'screen-3',
    parentId: null,
    childIds: [],
    type: 'MCButton2',
    props: { variant: 'outlined', size: 'medium' },
    order: 1,
    createdAt: new Date().toISOString(),
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/sample-data.ts
git commit -m "feat(canvas): add sample data for demo (3 screens, 7 components)"
```

---

## Task 10: CanvasView (Main Component)

**Files:**
- Create: `canvas-app/src/canvas/CanvasView.tsx`

- [ ] **Step 1: Create CanvasView**

```tsx
import React, { useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
  type DefaultEdgeOptions,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useCanvasStore } from '../store/canvas-store';
import { ScreenNode } from './nodes/ScreenNode';
import { SectionNode } from './nodes/SectionNode';
import { FlowEdge } from './edges/FlowEdge';
import { Toolbar } from './Toolbar';

const nodeTypes: NodeTypes = {
  screen: ScreenNode,
  section: SectionNode,
};

const edgeTypes: EdgeTypes = {
  flow: FlowEdge,
};

const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'flow',
};

// SVG marker for arrow heads
function ArrowMarker() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>
    </svg>
  );
}

export function CanvasView() {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const interactionMode = useCanvasStore((s) => s.interactionMode);

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
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        panOnDrag={panOnDrag}
        panOnScroll={false}
        zoomOnScroll
        selectionOnDrag={interactionMode === 'select'}
        nodesDraggable={interactionMode === 'select'}
        nodesConnectable={interactionMode === 'select'}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Toolbar />
        <MiniMap
          style={{ background: '#1a1a2e' }}
          nodeColor={(node) => {
            if (node.type === 'section') return '#346bea22';
            return '#346bea';
          }}
        />
        <Controls
          showInteractive={false}
          style={{ background: '#fff', borderRadius: 8 }}
        />
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#333"
        />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/canvas/CanvasView.tsx
git commit -m "feat(canvas): add CanvasView with ReactFlow, minimap, controls"
```

---

## Task 11: App Shell + Styles + main.tsx

**Files:**
- Create: `canvas-app/src/main.tsx`
- Create: `canvas-app/src/App.tsx`
- Create: `canvas-app/src/App.css`

- [ ] **Step 1: Create main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 2: Create App.tsx**

```tsx
import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CanvasView } from './canvas/CanvasView';
import { useCanvasStore } from './store/canvas-store';
import { sampleNodes, sampleEdges, sampleComponents } from './sample-data';
import './App.css';

export function App() {
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);
  const setComponents = useCanvasStore((s) => s.setComponents);

  useEffect(() => {
    setNodes(sampleNodes);
    setEdges(sampleEdges);
    setComponents(sampleComponents);
  }, [setNodes, setEdges, setComponents]);

  return (
    <ReactFlowProvider>
      <CanvasView />
    </ReactFlowProvider>
  );
}
```

- [ ] **Step 3: Create App.css**

```css
/* Reset */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0a0a14;
  color: #e0e0e0;
  overflow: hidden;
}

#root {
  width: 100vw;
  height: 100vh;
}

/* React Flow overrides */
.react-flow__node-screen {
  padding: 0 !important;
  border: none !important;
  background: none !important;
  border-radius: 0 !important;
}

.react-flow__node-section {
  padding: 0 !important;
  border: none !important;
  background: none !important;
}

/* DS preview component styles (imported from design-system-site) */
.preview-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 20px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}

.preview-button.primary {
  background: #346bea;
  color: #fff;
}

.preview-button.outlined {
  background: transparent;
  border: 1px solid #d0d0d0;
  color: #333;
}

.preview-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
}

.preview-input:focus {
  border-color: #346bea;
  box-shadow: 0 0 0 2px rgba(52, 107, 234, 0.2);
}
```

- [ ] **Step 4: Start the dev server and verify**

Run: `cd canvas-app && pnpm dev`

Expected:
- Browser opens at http://localhost:4180
- Dark canvas background with dot grid visible
- 3 screen frames inside a blue dashed section ("캠페인 생성 플로우")
- Screens show DS component previews (text input, textarea, button, checkbox, switch, status)
- Flow arrows with "다음" and "완료" labels connect the screens
- Minimap in bottom-right shows overview
- Zoom controls in bottom-left
- Toolbar at top center with Select/Pan mode toggle
- V key switches to select mode, H key switches to pan mode
- Nodes are draggable in select mode
- Canvas pans in pan mode

- [ ] **Step 5: Commit**

```bash
git add canvas-app/src/main.tsx canvas-app/src/App.tsx canvas-app/src/App.css
git commit -m "feat(canvas): add App shell with sample data demo — Phase 0a complete"
```

---

## Acceptance Criteria Checklist

These map to the spec's Phase 0a completion criteria:

- [ ] Canvas renders with pan, zoom, and minimap working
- [ ] At least 3 ScreenNodes visible with DS components rendered inside them
- [ ] At least 1 SectionNode groups multiple screens
- [ ] Select mode: clicking a node highlights it; dragging moves it
- [ ] FlowEdges connect screens with visible labels
