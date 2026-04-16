import { useCallback } from 'react';
import { getNodesBounds, type Node } from '@xyflow/react';
import { useCanvasStore } from '../store/canvas-store';

const SECTION_PADDING = 40;

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
        isDirty: true,
      });
    },
    [],
  );

  return { handleNodeDragStop };
}
