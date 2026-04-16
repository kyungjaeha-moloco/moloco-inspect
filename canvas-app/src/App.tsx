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
