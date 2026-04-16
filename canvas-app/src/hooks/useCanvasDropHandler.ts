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
