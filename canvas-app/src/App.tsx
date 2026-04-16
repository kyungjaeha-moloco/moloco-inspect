import { useEffect, useState, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CanvasView } from './canvas/CanvasView';
import { ComponentLibraryView } from './editor/ComponentLibraryView';
import { useCanvasStore } from './store/canvas-store';
import { useFeedbackStore } from './store/feedback-store';
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
      // Load comments if present
      if (saved.comments) {
        useFeedbackStore.setState({ comments: saved.comments });
      }
    } else {
      console.log('[app] No saved state found — using sample data');
      useCanvasStore.setState({ isDirty: true });
    }

    // Resume undo history
    useCanvasStore.temporal.getState().resume();

    // Auto-save comments on every change (debounced 1s)
    let saveTimeout: ReturnType<typeof setTimeout>;
    const unsubscribe = useFeedbackStore.subscribe((state) => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        const { nodes, edges, components } = useCanvasStore.getState();
        const saved = {
          nodes,
          edges,
          components,
          comments: state.comments,
        };
        try {
          const json = JSON.stringify({
            project: { id: DEFAULT_PROJECT_ID, name: 'Untitled Project', viewport: { x: 0, y: 0, zoom: 1 }, schemaVersion: 1, createdBy: 'local', updatedAt: new Date().toISOString() },
            ...saved,
          });
          localStorage.setItem(`moloco-canvas-${DEFAULT_PROJECT_ID}`, json);
        } catch (err) {
          console.error('[auto-save] Failed to save comments:', err);
        }
      }, 1000);
    });

    return () => {
      clearTimeout(saveTimeout);
      unsubscribe();
    };
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
