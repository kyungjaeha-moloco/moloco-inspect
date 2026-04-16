import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CanvasView } from './canvas/CanvasView';
import { useCanvasStore } from './store/canvas-store';
import { loadCanvas, DEFAULT_PROJECT_ID } from './services/local-adapter';
import './App.css';

export default function App() {
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

  return (
    <ReactFlowProvider>
      <CanvasView />
    </ReactFlowProvider>
  );
}
