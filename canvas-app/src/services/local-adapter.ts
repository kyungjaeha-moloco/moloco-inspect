import type {
  CanvasNode,
  CanvasEdge,
  ScreenComponent,
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
