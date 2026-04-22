# Phase 1: Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a component palette with HTML Drag & Drop, a prop editing panel, component reordering within screens, new screen/section/flow creation UI, and a component library view — transforming the canvas from a read-only viewer into a full visual editor.

**Architecture:** ComponentPalette in the left sidebar lists DS components by category with HTML `draggable`. Drop onto the canvas calls `screenToFlowPosition()` from `useReactFlow()` to convert client coordinates, then adds a ScreenComponent to the store. PropPanel in the right sidebar reads `COMPONENT_CONTROLS` from `@ds-site` alias and renders select/toggle controls that write back to `store.components[id].props`. Component selection is tracked via `selectedComponentId` in the canvas store. New screen/section/flow creation uses a creation toolbar. Component reordering uses move-up/move-down buttons.

**Tech Stack:** @xyflow/react (useReactFlow, screenToFlowPosition), Zustand 5 (useShallow), React 18, Vite 5, TypeScript, HTML Drag & Drop API

**Spec:** `docs/superpowers/specs/2026-04-16-moloco-canvas-design.md` — Sections 6.3, 4, 7, 9 (Phase 1)

---

## File Map

| File | Responsibility |
|------|---------------|
| `canvas-app/src/store/canvas-store.ts` | Add selectedComponentId, addComponent, updateComponentProps, removeComponent, moveComponentUp/Down, addScreen, addSection, addEdge |
| `canvas-app/src/editor/ComponentPalette.tsx` | Left sidebar — DS component list by category, HTML draggable |
| `canvas-app/src/editor/PropPanel.tsx` | Right sidebar — prop editing for selected component |
| `canvas-app/src/editor/ComponentItem.tsx` | Single draggable palette item |
| `canvas-app/src/editor/CreateToolbar.tsx` | Toolbar buttons for new screen/section/flow |
| `canvas-app/src/editor/ComponentLibraryView.tsx` | Full-page component library browser |
| `canvas-app/src/editor/palette-data.ts` | Static palette categories + component metadata |
| `canvas-app/src/hooks/useCanvasDropHandler.ts` | HTML DnD onDragOver/onDrop → add component to screen |
| `canvas-app/src/canvas/CanvasView.tsx` | Wire drop handler, sidebar layout, PropPanel |
| `canvas-app/src/canvas/nodes/ScreenNode.tsx` | Add click-to-select on individual components, drop target highlight |
| `canvas-app/src/ds-registry/DSComponentRenderer.tsx` | Add onClick for component selection |
| `canvas-app/src/App.tsx` | Add sidebar layout wrapper, component library route |
| `canvas-app/src/App.css` | Sidebar layout styles |

---

## Task 1: Extend Canvas Store with Editor State & Actions

**Files:**
- Modify: `canvas-app/src/store/canvas-store.ts`

- [ ] **Step 1: Add editor state and actions to the store**

Open `canvas-app/src/store/canvas-store.ts` and add the new fields and actions.

Add to the `CanvasState` interface (after the existing `toggleNodeLock` line):

```typescript
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
```

Add the initial value for the new state (after `isDirty: false,`):

```typescript
      selectedComponentId: null,
```

Add the setter (after `setDirty`):

```typescript
      setSelectedComponentId: (id) => set({ selectedComponentId: id }),
```

Add the component CRUD actions (after `toggleNodeLock`):

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd canvas-app && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors related to canvas-store.ts.

- [ ] **Step 3: Commit**

```bash
git add canvas-app/src/store/canvas-store.ts
git commit -m "feat(canvas): add editor state and CRUD actions to canvas store (Phase 1)"
```

---

## Task 2: Create Palette Data (Component Catalog for Palette)

**Files:**
- Create: `canvas-app/src/editor/palette-data.ts`

- [ ] **Step 1: Create the editor directory and palette-data.ts**

Run:
```bash
mkdir -p canvas-app/src/editor
```

Create `canvas-app/src/editor/palette-data.ts`:

```typescript
import { PREVIEW_REGISTRY } from '../ds-registry/registry';

export interface PaletteItem {
  type: string;            // e.g. "MCButton2"
  label: string;           // human-readable name
  hasPreview: boolean;     // whether a live preview renderer exists
}

export interface PaletteCategory {
  name: string;
  items: PaletteItem[];
}

/**
 * Components that have live preview renderers in the PREVIEW_REGISTRY.
 * These are shown with full interactive previews in the palette.
 * 15 interactive components from registry.ts.
 */
const INTERACTIVE_COMPONENTS: { type: string; label: string; category: string }[] = [
  // Form Inputs
  { type: 'MCFormTextInput', label: 'Text Input', category: 'Form Inputs' },
  { type: 'MCFormTextArea', label: 'Text Area', category: 'Form Inputs' },
  { type: 'MCFormNumberInput', label: 'Number Input', category: 'Form Inputs' },
  { type: 'MCFormCheckBox', label: 'Checkbox', category: 'Form Inputs' },
  { type: 'MCFormSwitchInput', label: 'Switch', category: 'Form Inputs' },
  { type: 'MCFormRadioGroup', label: 'Radio Group', category: 'Form Inputs' },
  { type: 'MCFormSingleRichSelect', label: 'Select', category: 'Form Inputs' },
  { type: 'MCSearchBar', label: 'Search Bar', category: 'Form Inputs' },
  // Buttons
  { type: 'MCButton2', label: 'Button', category: 'Buttons' },
  // Navigation
  { type: 'MCBarTabs', label: 'Bar Tabs', category: 'Navigation' },
  { type: 'MCAccordion', label: 'Accordion', category: 'Navigation' },
  // Feedback & Overlay
  { type: 'MCCommonDialog', label: 'Dialog', category: 'Feedback & Overlay' },
  { type: 'MCStatus', label: 'Status', category: 'Feedback & Overlay' },
  { type: 'MCBanner', label: 'Banner', category: 'Feedback & Overlay' },
  { type: 'MCCircularLoader', label: 'Loader', category: 'Feedback & Overlay' },
];

/**
 * Static components — no interactive preview renderer yet.
 * Shown in the palette with "(preview coming soon)" label.
 * 23 commonly used static components.
 */
const STATIC_COMPONENTS: { type: string; label: string; category: string }[] = [
  // Form Inputs (no preview yet)
  { type: 'MCFormMultiRichSelect', label: 'Multi Select', category: 'Form Inputs' },
  { type: 'MCFormCardSelect', label: 'Card Select', category: 'Form Inputs' },
  { type: 'MCFormInlineChipRichSelect', label: 'Inline Chip Select', category: 'Form Inputs' },
  { type: 'MCFormDateRangePicker', label: 'Date Range Picker', category: 'Form Inputs' },
  { type: 'MCFormColorInput', label: 'Color Input', category: 'Form Inputs' },
  { type: 'MCFormChipInput', label: 'Chip Input', category: 'Form Inputs' },
  // Form Layout
  { type: 'MCFormPanel', label: 'Form Panel', category: 'Form Layout' },
  { type: 'MCFormFieldGroup', label: 'Field Group', category: 'Form Layout' },
  { type: 'MCFormField', label: 'Form Field', category: 'Form Layout' },
  { type: 'MCFormLayout', label: 'Form Layout', category: 'Form Layout' },
  // Buttons
  { type: 'MCMoreActionsButton', label: 'More Actions', category: 'Buttons' },
  // Navigation
  { type: 'MCCollapsibleNavbar', label: 'Navbar', category: 'Navigation' },
  { type: 'MCStepper', label: 'Stepper', category: 'Navigation' },
  // Feedback & Overlay
  { type: 'MCPopover', label: 'Popover', category: 'Feedback & Overlay' },
  { type: 'MCDivider', label: 'Divider', category: 'Feedback & Overlay' },
  { type: 'MCStatusBadge', label: 'Status Badge', category: 'Feedback & Overlay' },
  { type: 'MCTimer', label: 'Timer', category: 'Feedback & Overlay' },
  // Shared Styled
  { type: 'MCIcon', label: 'Icon', category: 'Shared Styled' },
  { type: 'MCStack', label: 'Stack', category: 'Shared Styled' },
  { type: 'MCSingleTextInput', label: 'Text Input (no Formik)', category: 'Shared Styled' },
  { type: 'MCTextEllipsis', label: 'Text Ellipsis', category: 'Shared Styled' },
  // Layout
  { type: 'MCContentLayout', label: 'Content Layout', category: 'Layout' },
  // Table
  { type: 'MCReportTable', label: 'Report Table', category: 'Table' },
];

/**
 * Build palette categories from the combined component list.
 * Interactive components (with preview) come first within each category.
 */
export function buildPaletteCategories(): PaletteCategory[] {
  const categoryMap = new Map<string, PaletteItem[]>();

  // Category order
  const CATEGORY_ORDER = [
    'Form Inputs',
    'Form Layout',
    'Buttons',
    'Navigation',
    'Feedback & Overlay',
    'Shared Styled',
    'Layout',
    'Table',
  ];

  for (const cat of CATEGORY_ORDER) {
    categoryMap.set(cat, []);
  }

  for (const comp of INTERACTIVE_COMPONENTS) {
    const items = categoryMap.get(comp.category) ?? [];
    items.push({
      type: comp.type,
      label: comp.label,
      hasPreview: comp.type in PREVIEW_REGISTRY,
    });
    categoryMap.set(comp.category, items);
  }

  for (const comp of STATIC_COMPONENTS) {
    const items = categoryMap.get(comp.category) ?? [];
    items.push({
      type: comp.type,
      label: comp.label,
      hasPreview: comp.type in PREVIEW_REGISTRY,
    });
    categoryMap.set(comp.category, items);
  }

  return CATEGORY_ORDER
    .filter((cat) => (categoryMap.get(cat)?.length ?? 0) > 0)
    .map((cat) => ({
      name: cat,
      items: categoryMap.get(cat)!,
    }));
}

/** Total number of palette components */
export const TOTAL_PALETTE_COMPONENTS = INTERACTIVE_COMPONENTS.length + STATIC_COMPONENTS.length;
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/editor/palette-data.ts
git commit -m "feat(canvas): add palette data catalog with 38 DS components"
```

---

## Task 3: Create ComponentPalette (Left Sidebar)

**Files:**
- Create: `canvas-app/src/editor/ComponentItem.tsx`
- Create: `canvas-app/src/editor/ComponentPalette.tsx`

- [ ] **Step 1: Create ComponentItem.tsx (draggable palette item)**

Create `canvas-app/src/editor/ComponentItem.tsx`:

```tsx
import React, { useCallback } from 'react';
import type { PaletteItem } from './palette-data';

interface Props {
  item: PaletteItem;
}

export const ComponentItem = React.memo(function ComponentItem({ item }: Props) {
  const handleDragStart = useCallback(
    (event: React.DragEvent) => {
      // Set the component type as drag data — consumed by useCanvasDropHandler
      event.dataTransfer.setData('application/canvas-component-type', item.type);
      event.dataTransfer.effectAllowed = 'move';
    },
    [item.type],
  );

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      style={{
        padding: '8px 12px',
        borderRadius: 6,
        border: '1px solid #e0e0e0',
        background: '#fff',
        cursor: 'grab',
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        userSelect: 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = '#346bea';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(52,107,234,0.15)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = '#e0e0e0';
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
      }}
    >
      <span style={{ fontWeight: 500, color: '#333' }}>{item.label}</span>
      {!item.hasPreview && (
        <span
          style={{
            fontSize: 9,
            color: '#999',
            background: '#f5f5f5',
            padding: '2px 6px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
          }}
        >
          preview soon
        </span>
      )}
    </div>
  );
});
```

- [ ] **Step 2: Create ComponentPalette.tsx**

Create `canvas-app/src/editor/ComponentPalette.tsx`:

```tsx
import React, { useMemo, useState, useCallback } from 'react';
import { buildPaletteCategories } from './palette-data';
import { ComponentItem } from './ComponentItem';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

export const ComponentPalette = React.memo(function ComponentPalette({
  isOpen,
  onToggle,
}: Props) {
  const categories = useMemo(() => buildPaletteCategories(), []);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [searchQuery, setSearchQuery] = useState('');

  const toggleCategory = useCallback((name: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.type.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categories, searchQuery]);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        title="Open Component Palette"
        style={{
          position: 'absolute',
          top: 60,
          left: 12,
          zIndex: 10,
          width: 36,
          height: 36,
          borderRadius: 8,
          border: '1px solid #e0e0e0',
          background: '#fff',
          cursor: 'pointer',
          fontSize: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        +
      </button>
    );
  }

  return (
    <div
      style={{
        width: 260,
        height: '100%',
        background: '#fafafa',
        borderRight: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
          Components
        </span>
        <button
          onClick={onToggle}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: '#999',
            padding: '2px 4px',
            lineHeight: 1,
          }}
          title="Close palette"
        >
          &times;
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px' }}>
        <input
          type="text"
          placeholder="Search components..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 10px',
            border: '1px solid #e0e0e0',
            borderRadius: 6,
            fontSize: 12,
            outline: 'none',
            background: '#fff',
          }}
        />
      </div>

      {/* Category list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 12px 12px',
        }}
      >
        {filteredCategories.map((cat) => {
          const isCollapsed = collapsedCategories.has(cat.name);
          return (
            <div key={cat.name} style={{ marginBottom: 8 }}>
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '6px 0',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#666',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                <span
                  style={{
                    fontSize: 8,
                    transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s',
                  }}
                >
                  &#9660;
                </span>
                {cat.name}
                <span style={{ color: '#bbb', fontWeight: 400 }}>
                  ({cat.items.length})
                </span>
              </button>
              {/* Items */}
              {!isCollapsed && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    paddingLeft: 4,
                  }}
                >
                  {cat.items.map((item) => (
                    <ComponentItem key={item.type} item={item} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filteredCategories.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: '#999',
              fontSize: 12,
            }}
          >
            No components found
          </div>
        )}
      </div>
    </div>
  );
});
```

- [ ] **Step 3: Commit**

```bash
git add canvas-app/src/editor/ComponentItem.tsx canvas-app/src/editor/ComponentPalette.tsx
git commit -m "feat(canvas): add ComponentPalette with HTML draggable items"
```

---

## Task 4: Create Canvas Drop Handler Hook

**Files:**
- Create: `canvas-app/src/hooks/useCanvasDropHandler.ts`

- [ ] **Step 1: Create useCanvasDropHandler.ts**

This hook uses `screenToFlowPosition` from `useReactFlow()` to convert drop coordinates, finds which screen node the drop landed on, and calls `addComponent`.

```typescript
import { useCallback, type DragEvent } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '../store/canvas-store';

const MIME_TYPE = 'application/canvas-component-type';

export function useCanvasDropHandler() {
  const reactFlow = useReactFlow();

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      const componentType = event.dataTransfer.getData(MIME_TYPE);
      if (!componentType) return;

      // Convert screen coordinates to flow position
      const flowPosition = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Find which screen node the drop landed on
      const { nodes } = useCanvasStore.getState();
      const screenNode = nodes.find((node) => {
        if (node.type !== 'screen') return false;

        // Calculate absolute position (handle parentId offset)
        let absX = node.position.x;
        let absY = node.position.y;
        if (node.parentId) {
          const parent = nodes.find((n) => n.id === node.parentId);
          if (parent) {
            absX += parent.position.x;
            absY += parent.position.y;
          }
        }

        const nodeWidth = (node.measured?.width ?? node.width ?? 320);
        const nodeHeight = (node.measured?.height ?? node.height ?? 400);

        return (
          flowPosition.x >= absX &&
          flowPosition.x <= absX + nodeWidth &&
          flowPosition.y >= absY &&
          flowPosition.y <= absY + nodeHeight
        );
      });

      if (screenNode) {
        // Drop onto existing screen — add component
        useCanvasStore.getState().addComponent(screenNode.id, componentType);
      } else {
        // Drop onto empty canvas — create new screen with the component
        const newScreenId = useCanvasStore.getState().addScreen(
          'New Screen',
          flowPosition,
        );
        useCanvasStore.getState().addComponent(newScreenId, componentType);
      }
    },
    [reactFlow],
  );

  return { handleDragOver, handleDrop };
}
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/hooks/useCanvasDropHandler.ts
git commit -m "feat(canvas): add HTML DnD drop handler with screenToFlowPosition"
```

---

## Task 5: Create PropPanel (Right Sidebar)

**Files:**
- Create: `canvas-app/src/editor/PropPanel.tsx`

- [ ] **Step 1: Create PropPanel.tsx**

This panel imports `COMPONENT_CONTROLS` from `@ds-site/components/PropControls` (via Vite alias) and renders prop editing controls for the selected component. Components without controls show a message.

Create `canvas-app/src/editor/PropPanel.tsx`:

```tsx
import React, { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCanvasStore } from '../store/canvas-store';
import type { ControlDef } from '@ds-site/components/PropControls';

// Import the COMPONENT_CONTROLS map from design-system-site via @ds-site alias.
// We need to re-declare it here since PropControls.tsx doesn't export it directly.
// These are the 10 components that have prop controls defined.
const COMPONENT_CONTROLS: Record<string, ControlDef[]> = {
  MCButton2: [
    { prop: 'variant', label: 'Variant', type: 'select', options: ['contained', 'outlined', 'text'], defaultValue: 'contained' },
    { prop: 'size', label: 'Size', type: 'select', options: ['small', 'medium', 'large'], defaultValue: 'medium' },
    { prop: 'disabled', label: 'Disabled', type: 'toggle', defaultValue: false },
    { prop: 'loading', label: 'Loading', type: 'toggle', defaultValue: false },
  ],
  MCFormTextInput: [
    { prop: 'state', label: 'State', type: 'select', options: ['default', 'focused', 'error', 'disabled', 'readonly'], defaultValue: 'default' },
    { prop: 'required', label: 'Required', type: 'toggle', defaultValue: false },
  ],
  MCFormCheckBox: [
    { prop: 'checked', label: 'Checked', type: 'toggle', defaultValue: true },
    { prop: 'disabled', label: 'Disabled', type: 'toggle', defaultValue: false },
  ],
  MCFormSwitchInput: [
    { prop: 'on', label: 'On', type: 'toggle', defaultValue: true },
    { prop: 'disabled', label: 'Disabled', type: 'toggle', defaultValue: false },
  ],
  MCFormRadioGroup: [
    { prop: 'disabled', label: 'Disabled', type: 'toggle', defaultValue: false },
  ],
  MCBarTabs: [
    { prop: 'variant', label: 'Variant', type: 'select', options: ['default', 'contained'], defaultValue: 'default' },
  ],
  MCStatus: [
    { prop: 'variant', label: 'Status', type: 'select', options: ['positive', 'warning', 'negative', 'neutral'], defaultValue: 'positive' },
  ],
  MCLoader: [
    { prop: 'size', label: 'Size', type: 'select', options: ['small', 'medium', 'large'], defaultValue: 'medium' },
  ],
  MCCommonDialog: [
    { prop: 'variant', label: 'Variant', type: 'select', options: ['default', 'destructive'], defaultValue: 'default' },
  ],
  MCBanner: [
    { prop: 'variant', label: 'Type', type: 'select', options: ['info', 'success', 'warning', 'error'], defaultValue: 'info' },
  ],
};

export const PropPanel = React.memo(function PropPanel() {
  const { selectedComponentId, component, updateComponentProps, removeComponent, moveComponentUp, moveComponentDown } =
    useCanvasStore(
      useShallow((s) => ({
        selectedComponentId: s.selectedComponentId,
        component: s.selectedComponentId
          ? s.components[s.selectedComponentId] ?? null
          : null,
        updateComponentProps: s.updateComponentProps,
        removeComponent: s.removeComponent,
        moveComponentUp: s.moveComponentUp,
        moveComponentDown: s.moveComponentDown,
      })),
    );

  const handlePropChange = useCallback(
    (prop: string, value: string | boolean) => {
      if (!selectedComponentId) return;
      updateComponentProps(selectedComponentId, { [prop]: value });
    },
    [selectedComponentId, updateComponentProps],
  );

  const handleRemove = useCallback(() => {
    if (!selectedComponentId) return;
    removeComponent(selectedComponentId);
  }, [selectedComponentId, removeComponent]);

  const handleMoveUp = useCallback(() => {
    if (!selectedComponentId) return;
    moveComponentUp(selectedComponentId);
  }, [selectedComponentId, moveComponentUp]);

  const handleMoveDown = useCallback(() => {
    if (!selectedComponentId) return;
    moveComponentDown(selectedComponentId);
  }, [selectedComponentId, moveComponentDown]);

  if (!component) {
    return (
      <div
        style={{
          width: 280,
          height: '100%',
          background: '#fafafa',
          borderLeft: '1px solid #e0e0e0',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e0e0e0',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
            Properties
          </span>
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <span style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>
            Select a component to edit its properties
          </span>
        </div>
      </div>
    );
  }

  const controls = COMPONENT_CONTROLS[component.type] ?? [];

  return (
    <div
      style={{
        width: 280,
        height: '100%',
        background: '#fafafa',
        borderLeft: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e0e0e0',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
          Properties
        </span>
        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
          {component.type}
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {controls.length === 0 ? (
          <div
            style={{
              padding: 16,
              textAlign: 'center',
              color: '#999',
              fontSize: 12,
              border: '1px dashed #e0e0e0',
              borderRadius: 6,
              background: '#fff',
            }}
          >
            편집 가능한 속성이 없습니다
          </div>
        ) : (
          controls.map((control) => {
            const value =
              component.props[control.prop] ?? control.defaultValue;
            return (
              <div key={control.prop}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#666',
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                  }}
                >
                  {control.label}
                </label>
                {control.type === 'select' && control.options ? (
                  <select
                    value={String(value)}
                    onChange={(e) =>
                      handlePropChange(control.prop, e.target.value)
                    }
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      border: '1px solid #e0e0e0',
                      borderRadius: 6,
                      fontSize: 12,
                      background: '#fff',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    {control.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    onClick={() =>
                      handlePropChange(control.prop, !value)
                    }
                    style={{
                      padding: '4px 12px',
                      border: '1px solid #e0e0e0',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                      background: value ? '#346bea' : '#fff',
                      color: value ? '#fff' : '#666',
                      fontWeight: 500,
                      transition: 'all 0.15s',
                    }}
                  >
                    {value ? 'On' : 'Off'}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Actions */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #e0e0e0',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
        }}
      >
        {/* Move up/down */}
        <button
          onClick={handleMoveUp}
          title="Move up"
          style={{
            width: 28,
            height: 28,
            border: '1px solid #e0e0e0',
            borderRadius: 4,
            background: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          &#x2191;
        </button>
        <button
          onClick={handleMoveDown}
          title="Move down"
          style={{
            width: 28,
            height: 28,
            border: '1px solid #e0e0e0',
            borderRadius: 4,
            background: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          &#x2193;
        </button>

        <div style={{ flex: 1 }} />

        {/* Delete */}
        <button
          onClick={handleRemove}
          title="Remove component"
          style={{
            height: 28,
            padding: '0 12px',
            border: '1px solid #fca5a5',
            borderRadius: 4,
            background: '#fff',
            color: '#dc2626',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/editor/PropPanel.tsx
git commit -m "feat(canvas): add PropPanel with COMPONENT_CONTROLS-based editing"
```

---

## Task 6: Create CreateToolbar (New Screen/Section/Edge)

**Files:**
- Create: `canvas-app/src/editor/CreateToolbar.tsx`

- [ ] **Step 1: Create CreateToolbar.tsx**

This component adds buttons for creating new screens, sections, and edges. It sits inside the React Flow panel area.

Create `canvas-app/src/editor/CreateToolbar.tsx`:

```tsx
import React, { useState, useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import { useCanvasStore } from '../store/canvas-store';

export const CreateToolbar = React.memo(function CreateToolbar() {
  const { addScreen, addSection, addEdge, nodes } = useCanvasStore(
    useShallow((s) => ({
      addScreen: s.addScreen,
      addSection: s.addSection,
      addEdge: s.addEdge,
      nodes: s.nodes,
    })),
  );
  const reactFlow = useReactFlow();

  // Edge creation state
  const [edgeMode, setEdgeMode] = useState(false);
  const [edgeSource, setEdgeSource] = useState<string | null>(null);

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

  const handleEdgeModeToggle = useCallback(() => {
    if (edgeMode) {
      setEdgeMode(false);
      setEdgeSource(null);
    } else {
      setEdgeMode(true);
      setEdgeSource(null);
    }
  }, [edgeMode]);

  // When in edge mode, clicking a screen selects source/target
  const handleNodeClickForEdge = useCallback(
    (nodeId: string) => {
      if (!edgeMode) return;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node || node.type !== 'screen') return;

      if (!edgeSource) {
        setEdgeSource(nodeId);
      } else if (nodeId !== edgeSource) {
        addEdge(edgeSource, nodeId, '');
        setEdgeMode(false);
        setEdgeSource(null);
      }
    },
    [edgeMode, edgeSource, nodes, addEdge],
  );

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
        onClick={handleEdgeModeToggle}
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
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/editor/CreateToolbar.tsx
git commit -m "feat(canvas): add CreateToolbar for new screen/section/flow creation"
```

---

## Task 7: Update DSComponentRenderer to Support Selection

**Files:**
- Modify: `canvas-app/src/ds-registry/DSComponentRenderer.tsx`

- [ ] **Step 1: Add onClick handler for component selection**

Replace the entire contents of `canvas-app/src/ds-registry/DSComponentRenderer.tsx` with:

```tsx
import React, { Component, useCallback, type ReactNode } from 'react';
import { PREVIEW_REGISTRY } from './registry';
import { useCanvasStore } from '../store/canvas-store';
import type { ScreenComponent } from '../types';

interface ErrorBoundaryState {
  hasError: boolean;
}

class PreviewErrorBoundary extends Component<
  { componentType: string; children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 12, background: '#2a1a1a', border: '1px solid #b91c1c',
          borderRadius: 6, color: '#f87171', fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{this.props.componentType}</div>
          <div style={{ color: '#888' }}>렌더링 실패</div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface Props {
  component: ScreenComponent;
}

export const DSComponentRenderer = React.memo(function DSComponentRenderer({ component }: Props) {
  const selectedComponentId = useCanvasStore((s) => s.selectedComponentId);
  const setSelectedComponentId = useCanvasStore((s) => s.setSelectedComponentId);

  const isSelected = selectedComponentId === component.id;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedComponentId(component.id);
    },
    [component.id, setSelectedComponentId],
  );

  const Preview = PREVIEW_REGISTRY[component.type];

  const wrapperStyle: React.CSSProperties = {
    position: 'relative',
    borderRadius: 6,
    border: isSelected ? '2px solid #346bea' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  };

  if (!Preview) {
    return (
      <div onClick={handleClick} style={wrapperStyle}>
        <div style={{
          padding: 12, background: '#f8f9fa', border: '1px dashed #d0d0d0',
          borderRadius: 6, color: '#888', fontSize: 12, textAlign: 'center',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{component.type}</div>
          <div style={{ fontSize: 10, color: '#aaa' }}>프리뷰 없음</div>
        </div>
      </div>
    );
  }

  return (
    <div onClick={handleClick} style={wrapperStyle}>
      <PreviewErrorBoundary componentType={component.type}>
        <Preview propValues={component.props} />
      </PreviewErrorBoundary>
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/ds-registry/DSComponentRenderer.tsx
git commit -m "feat(canvas): add click-to-select component in DSComponentRenderer"
```

---

## Task 8: Create Component Library View

**Files:**
- Create: `canvas-app/src/editor/ComponentLibraryView.tsx`

- [ ] **Step 1: Create ComponentLibraryView.tsx**

A standalone view that shows all DS components in a grid layout for browsing.

Create `canvas-app/src/editor/ComponentLibraryView.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { buildPaletteCategories } from './palette-data';
import { PREVIEW_REGISTRY } from '../ds-registry/registry';

interface Props {
  onClose: () => void;
}

export const ComponentLibraryView = React.memo(function ComponentLibraryView({
  onClose,
}: Props) {
  const categories = useMemo(() => buildPaletteCategories(), []);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.type.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categories, searchQuery]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: '1px solid #e0e0e0',
            borderRadius: 6,
            cursor: 'pointer',
            padding: '4px 12px',
            fontSize: 12,
            color: '#666',
          }}
        >
          &larr; Back to Canvas
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#333', margin: 0 }}>
          Component Library
        </h1>
        <input
          type="text"
          placeholder="Search components..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            marginLeft: 'auto',
            width: 240,
            padding: '6px 12px',
            border: '1px solid #e0e0e0',
            borderRadius: 6,
            fontSize: 13,
            outline: 'none',
          }}
        />
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 32px',
        }}
      >
        {filteredCategories.map((cat) => (
          <div key={cat.name} style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#333',
                marginBottom: 12,
                borderBottom: '1px solid #e0e0e0',
                paddingBottom: 8,
              }}
            >
              {cat.name}
              <span style={{ color: '#999', fontWeight: 400, marginLeft: 8 }}>
                ({cat.items.length})
              </span>
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 16,
              }}
            >
              {cat.items.map((item) => {
                const Preview = PREVIEW_REGISTRY[item.type];
                return (
                  <div
                    key={item.type}
                    style={{
                      border: '1px solid #e0e0e0',
                      borderRadius: 8,
                      padding: 16,
                      background: '#fafafa',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#333',
                        marginBottom: 4,
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: '#999',
                        marginBottom: 12,
                        fontFamily: 'monospace',
                      }}
                    >
                      {item.type}
                    </div>
                    <div
                      style={{
                        minHeight: 48,
                        padding: 12,
                        background: '#fff',
                        borderRadius: 6,
                        border: '1px solid #e8e8e8',
                      }}
                    >
                      {Preview ? (
                        <Preview />
                      ) : (
                        <div
                          style={{
                            textAlign: 'center',
                            color: '#ccc',
                            fontSize: 11,
                          }}
                        >
                          Preview coming soon
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/editor/ComponentLibraryView.tsx
git commit -m "feat(canvas): add ComponentLibraryView for browsing all DS components"
```

---

## Task 9: Update ScreenNode to Support Drop Target and Deselect

**Files:**
- Modify: `canvas-app/src/canvas/nodes/ScreenNode.tsx`

- [ ] **Step 1: Add deselect-on-background-click to ScreenNode**

The ScreenNode body area should deselect any selected component when clicked on empty space, and show a visual indicator when a component is being dragged over.

Replace the entire contents of `canvas-app/src/canvas/nodes/ScreenNode.tsx` with:

```tsx
import React, { useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import type { ScreenNode as ScreenNodeType } from '../../types';
import { DSComponentRenderer } from '../../ds-registry/DSComponentRenderer';
import { useCanvasStore } from '../../store/canvas-store';

export const ScreenNode = React.memo(function ScreenNode({
  id,
  data,
  selected,
}: NodeProps<ScreenNodeType>) {
  const toggleNodeLock = useCanvasStore((s) => s.toggleNodeLock);
  const setSelectedComponentId = useCanvasStore((s) => s.setSelectedComponentId);
  const components = useCanvasStore(
    useShallow((s) =>
      Object.values(s.components)
        .filter((c) => c.screenId === id && c.parentId === null)
        .sort((a, b) => a.order - b.order)
    )
  );

  const [isDragOver, setIsDragOver] = useState(false);

  const handleLockToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleNodeLock(id);
    },
    [id, toggleNodeLock],
  );

  const handleBodyClick = useCallback(
    (e: React.MouseEvent) => {
      // Only deselect if clicking on the body itself, not on a component
      if (e.target === e.currentTarget) {
        setSelectedComponentId(null);
      }
    },
    [setSelectedComponentId],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/canvas-component-type')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setIsDragOver(false);
      const componentType = e.dataTransfer.getData('application/canvas-component-type');
      if (!componentType) return;
      e.preventDefault();
      e.stopPropagation();
      useCanvasStore.getState().addComponent(id, componentType);
    },
    [id],
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
          border: selected
            ? '2px solid #346bea'
            : isDragOver
              ? '2px solid #60a5fa'
              : '1px solid #e0e0e0',
          boxShadow: selected
            ? '0 0 0 2px rgba(52,107,234,0.2)'
            : isDragOver
              ? '0 0 0 2px rgba(96,165,250,0.2)'
              : '0 2px 8px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          fontSize: 14,
          transition: 'border-color 0.15s, box-shadow 0.15s',
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
          onClick={handleBodyClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minHeight: 60,
          }}
        >
          {components.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: isDragOver ? '#346bea' : '#ccc',
                fontSize: 12,
                border: `1px dashed ${isDragOver ? '#346bea' : '#e0e0e0'}`,
                borderRadius: 6,
                background: isDragOver ? '#f0f5ff' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              {isDragOver ? 'Drop here' : 'Drag a component here'}
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
git commit -m "feat(canvas): add drop-target highlight and component selection to ScreenNode"
```

---

## Task 10: Update CanvasView with Sidebar Layout and Drop Handler

**Files:**
- Modify: `canvas-app/src/canvas/CanvasView.tsx`

- [ ] **Step 1: Replace CanvasView.tsx with sidebar layout and drop handler**

Replace the entire contents of `canvas-app/src/canvas/CanvasView.tsx` with:

```tsx
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

  // Edge creation mode (from CreateToolbar)
  const { handleNodeClickForEdge } = useEdgeCreation();
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
          <CreateToolbar />
        </ReactFlow>
      </div>

      {/* Right sidebar: Prop Panel */}
      <PropPanel />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/canvas/CanvasView.tsx
git commit -m "feat(canvas): add sidebar layout with palette, prop panel, and drop handler"
```

---

## Task 11: Update App.tsx with Component Library Toggle

**Files:**
- Modify: `canvas-app/src/App.tsx`

- [ ] **Step 1: Replace App.tsx with library view support**

Replace the entire contents of `canvas-app/src/App.tsx` with:

```tsx
import { useEffect, useState, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CanvasView } from './canvas/CanvasView';
import { ComponentLibraryView } from './editor/ComponentLibraryView';
import { useCanvasStore } from './store/canvas-store';
import { loadCanvas, DEFAULT_PROJECT_ID } from './services/local-adapter';
import './App.css';

export default function App() {
  const [showLibrary, setShowLibrary] = useState(false);

  useEffect(() => {
    const saved = loadCanvas(DEFAULT_PROJECT_ID);

    // Pause undo history during initial load
    useCanvasStore.temporal.getState().pause();

    if (saved) {
      console.log('[app] Loaded saved canvas from localStorage');
      useCanvasStore.setState({
        nodes: saved.nodes,
        edges: saved.edges,
        components: saved.components,
        isDirty: false,
      });
    } else {
      console.log('[app] No saved state found — using sample data');
      useCanvasStore.setState({ isDirty: true });
    }

    // Resume undo history
    useCanvasStore.temporal.getState().resume();
  }, []);

  const handleOpenLibrary = useCallback(() => setShowLibrary(true), []);
  const handleCloseLibrary = useCallback(() => setShowLibrary(false), []);

  return (
    <ReactFlowProvider>
      {showLibrary ? (
        <ComponentLibraryView onClose={handleCloseLibrary} />
      ) : (
        <CanvasView />
      )}
      {/* Library toggle button — visible only in canvas mode */}
      {!showLibrary && (
        <button
          onClick={handleOpenLibrary}
          title="Open Component Library"
          style={{
            position: 'fixed',
            bottom: 16,
            left: 16,
            zIndex: 10,
            height: 32,
            padding: '0 14px',
            borderRadius: 8,
            border: '1px solid #e0e0e0',
            background: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            color: '#666',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          Component Library
        </button>
      )}
    </ReactFlowProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/App.tsx
git commit -m "feat(canvas): add component library view toggle in App"
```

---

## Task 12: Update App.css for Sidebar Layout

**Files:**
- Modify: `canvas-app/src/App.css`

- [ ] **Step 1: Add sidebar-related styles**

Replace the entire contents of `canvas-app/src/App.css` with:

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0a0a14; color: #e0e0e0; overflow: hidden;
}
#root { width: 100vw; height: 100vh; }

/* React Flow node overrides */
.react-flow__node-screen { padding: 0 !important; border: none !important; background: none !important; border-radius: 0 !important; }
.react-flow__node-section { padding: 0 !important; border: none !important; background: none !important; }

/* Sidebar scrollbar styling */
.react-flow__panel { z-index: 5; }

/* Component palette scrollbar */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #d0d0d0;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #bbb;
}
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/App.css
git commit -m "feat(canvas): update styles for sidebar layout and scrollbars"
```

---

## Task 13: Update useKeyboardShortcuts to Skip PropPanel Inputs

**Files:**
- Modify: `canvas-app/src/hooks/useKeyboardShortcuts.ts`

- [ ] **Step 1: Ensure keyboard shortcuts do not fire when editing props**

The current useKeyboardShortcuts already checks for input/textarea/select focus, but we also need to add `isContentEditable` check. Also add `Escape` to deselect components.

In `canvas-app/src/hooks/useKeyboardShortcuts.ts`, add after the `setDirty` subscription:

```typescript
  const setSelectedComponentId = useCanvasStore((s) => s.setSelectedComponentId);
```

Add the Escape handler inside `handleKeyDown`, before the `isMod` check:

```typescript
      // ── Escape: Deselect component ──
      if (e.key === 'Escape') {
        setSelectedComponentId(null);
        return;
      }
```

Add `setSelectedComponentId` to the useEffect dependency array.

The full updated file should be:

```typescript
import { useEffect, useCallback } from 'react';
import { useCanvasStore } from '../store/canvas-store';
import { saveCanvasWithRetry } from '../services/local-adapter';

const DEFAULT_PROJECT_ID = 'default';

export function useKeyboardShortcuts() {
  const setInteractionMode = useCanvasStore((s) => s.setInteractionMode);
  const deleteSelectedNodes = useCanvasStore((s) => s.deleteSelectedNodes);
  const setDirty = useCanvasStore((s) => s.setDirty);
  const setSelectedComponentId = useCanvasStore((s) => s.setSelectedComponentId);

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
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      // ── Escape: Deselect component ──
      if (e.key === 'Escape') {
        setSelectedComponentId(null);
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
  }, [handleSave, handleUndo, handleRedo, deleteSelectedNodes, setInteractionMode, setSelectedComponentId]);

  return { handleSave, handleUndo, handleRedo };
}
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/hooks/useKeyboardShortcuts.ts
git commit -m "feat(canvas): add Escape to deselect component, guard contentEditable"
```

---

## Task 14: Verify Full Integration

- [ ] **Step 1: Type check**

Run:
```bash
cd canvas-app && npx tsc --noEmit 2>&1 | head -50
```

Expected: No errors. Common issues to check:
- `ControlDef` type import: if `@ds-site/components/PropControls` does not export `ControlDef`, the PropPanel has its own inline definition. Remove the import line and define locally:
  ```typescript
  type ControlDef = {
    prop: string;
    label: string;
    type: 'select' | 'toggle';
    options?: string[];
    defaultValue: string | boolean;
  };
  ```
- `addComponent` / `addScreen` / `addSection` / `addEdge` return types must match string.
- `useReactFlow` must be called inside `<ReactFlowProvider>` — it is, since CanvasView is rendered inside the provider in App.tsx.

- [ ] **Step 2: Fix ControlDef import if needed**

If the `@ds-site` import fails, replace the import line in `canvas-app/src/editor/PropPanel.tsx`:

```typescript
// Remove this line:
import type { ControlDef } from '@ds-site/components/PropControls';

// Add this instead:
type ControlDef = {
  prop: string;
  label: string;
  type: 'select' | 'toggle';
  options?: string[];
  defaultValue: string | boolean;
};
```

- [ ] **Step 3: Start dev server and manually test**

Run:
```bash
cd canvas-app && pnpm dev
```

Expected behaviors to verify:

1. **Palette visible:** Left sidebar shows "Components" header with search field and 8 categories of components. Collapsing/expanding categories works. Search filters components.

2. **Drag from palette to screen:** Drag a "Button" item from the palette. Drop it on an existing ScreenNode. The component appears inside the screen. The component is auto-selected (blue border).

3. **Drag to empty canvas:** Drag a component from the palette and drop on empty canvas area. A new "New Screen" is created at the drop position with the component inside.

4. **PropPanel editing:** Click on a component inside a screen (e.g., the Button just added). The right PropPanel shows "MCButton2" with Variant, Size, Disabled, Loading controls. Change Variant to "outlined" — the rendered button updates immediately.

5. **No controls message:** Click on a component that has no COMPONENT_CONTROLS entry (e.g., MCFormTextArea). PropPanel shows "편집 가능한 속성이 없습니다".

6. **Component reorder:** Select a component. In the PropPanel footer, click the up/down arrows. The component moves within its screen.

7. **Component removal:** Select a component. Click "Remove" in the PropPanel footer. The component is removed from the screen.

8. **New screen/section:** Click "+ Screen" in the create toolbar. A new empty screen appears at viewport center. Click "+ Section". A new section appears.

9. **New flow:** Click "+ Flow". Button changes to "Click source...". Click on a screen. Button changes to "Click target...". Click on another screen. An edge arrow connects them.

10. **Deselect:** Press Escape. Selected component (blue border) is deselected. PropPanel shows "Select a component to edit its properties".

11. **Component Library:** Click "Component Library" button in bottom-left. Full-screen view shows all components in a grid. Search works. "Back to Canvas" returns to the canvas.

12. **Palette collapse:** Click the X in the palette header. Palette hides, a "+" button appears in top-left. Click it to reopen.

- [ ] **Step 4: Fix any TypeScript or runtime issues**

Common issues:
- Ensure `addComponent` is available in the store when called from ScreenNode's `handleDrop`.
- Ensure `useReactFlow()` is inside ReactFlowProvider (it is — CanvasView is a child of ReactFlowProvider in App.tsx).
- If React Flow's `onDrop` conflicts with ScreenNode's `onDrop`, the ScreenNode's `e.stopPropagation()` prevents bubbling.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(canvas): Phase 1 complete — editor with palette, prop panel, DnD, library view"
```

---

## Acceptance Criteria Checklist

These map to the spec's Phase 1 completion criteria:

- [ ] Palette shows DS components organized by 8 categories (Form Inputs, Form Layout, Buttons, Navigation, Feedback & Overlay, Shared Styled, Layout, Table)
- [ ] 15 interactive components show with live previews; 23 static components show with "preview soon" badge
- [ ] Dragging a component from the palette onto an existing screen adds it to that screen
- [ ] Dragging a component onto empty canvas creates a new screen with the component
- [ ] Selecting a component shows PropPanel with controls based on COMPONENT_CONTROLS
- [ ] Changing a prop value in PropPanel (select or toggle) immediately updates the rendered component
- [ ] Components without COMPONENT_CONTROLS entries show "편집 가능한 속성이 없습니다"
- [ ] Move up/down buttons in PropPanel reorder components within a screen
- [ ] Remove button in PropPanel deletes the selected component
- [ ] "+ Screen" button creates a new empty screen at viewport center
- [ ] "+ Section" button creates a new section at viewport center
- [ ] "+ Flow" enables edge creation by clicking source then target screen
- [ ] Escape key deselects the current component
- [ ] Component Library view shows all 38 components in a searchable grid
- [ ] All store subscriptions use `useShallow` from `zustand/react/shallow`
- [ ] Nodes with `parentId` have top-level `width` and `height` set
- [ ] HTML Drag & Drop API is used (NOT @dnd-kit)
- [ ] `screenToFlowPosition()` from `useReactFlow()` is used for drop coordinate conversion
- [ ] Undo/redo works for component add, prop change, remove, and reorder operations
- [ ] Save (Ctrl+S) persists all editor changes to localStorage
