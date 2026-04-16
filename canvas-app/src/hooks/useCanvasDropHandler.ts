import { useCallback, type DragEvent } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '../store/canvas-store';


const MIME_TYPE = 'application/canvas-component-type';

export function useCanvasDropHandler() {
  const reactFlow = useReactFlow();
  const { getNodes } = reactFlow;

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

      // Find which screen node the drop landed on using positionAbsolute for correct nested hit-testing
      const screenNodes = getNodes().filter((n) => n.type === 'screen');
      const screenNode = screenNodes.find((n) => {
        const absPos = (n as any).computed?.positionAbsolute ?? n.position;
        const w = n.measured?.width ?? (n as any).width ?? 320;
        const h = n.measured?.height ?? (n as any).height ?? 400;
        return (
          flowPosition.x >= absPos.x &&
          flowPosition.x <= absPos.x + w &&
          flowPosition.y >= absPos.y &&
          flowPosition.y <= absPos.y + h
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
