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
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
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
