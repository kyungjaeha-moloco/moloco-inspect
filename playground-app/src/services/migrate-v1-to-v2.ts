/**
 * One-shot migration from v1 (`moloco-canvas-default`) to v2 project/canvas keys.
 *
 * Runs before the app renders. Idempotent — sets a flag so subsequent boots skip.
 * The legacy v1 key is preserved (not deleted) in case rollback is needed.
 */

import {
  MIGRATED_FLAG_KEY,
  PROJECTS_KEY,
  projectStorage,
} from './project-storage';
import {
  LOCAL_USER_ID,
  PROJECT_SCHEMA_VERSION,
  type CanvasSnapshot,
} from '../types/project';

const V1_KEY = 'moloco-canvas-default';

interface V1Saved {
  project?: { viewport?: { x: number; y: number; zoom: number } };
  nodes?: unknown[];
  edges?: unknown[];
  components?: Record<string, unknown>;
  comments?: Record<string, unknown>;
}

export async function migrateV1ToV2(): Promise<
  'already-migrated' | 'nothing-to-migrate' | 'migrated' | 'failed'
> {
  if (localStorage.getItem(MIGRATED_FLAG_KEY)) return 'already-migrated';

  const raw = localStorage.getItem(V1_KEY);
  if (!raw) {
    localStorage.setItem(MIGRATED_FLAG_KEY, '1');
    return 'nothing-to-migrate';
  }

  try {
    const old = JSON.parse(raw) as V1Saved;
    const projectsBefore = localStorage.getItem(PROJECTS_KEY);

    const { project, firstCanvas } = await projectStorage.createProject({
      name: 'Project 1 (이전 작업)',
      description: '이전 단일 캔버스에서 자동 이관된 작업',
      status: 'active',
      defaultClient: 'tving',
      ownerId: LOCAL_USER_ID,
    });

    const snapshot: CanvasSnapshot = {
      id: firstCanvas.id,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      projectId: project.id,
      viewport: old.project?.viewport ?? { x: 0, y: 0, zoom: 1 },
      // Casts are safe: the v1 shape uses the same internal types.
      nodes: (old.nodes as CanvasSnapshot['nodes']) ?? [],
      edges: (old.edges as CanvasSnapshot['edges']) ?? [],
      components: (old.components as CanvasSnapshot['components']) ?? {},
      comments: (old.comments as CanvasSnapshot['comments']) ?? {},
      chatMessages: [],
      updatedAt: new Date().toISOString(),
    };

    try {
      await projectStorage.saveSnapshot(snapshot);
    } catch (err) {
      // Rollback the project writes if snapshot save failed.
      if (projectsBefore != null) localStorage.setItem(PROJECTS_KEY, projectsBefore);
      else localStorage.removeItem(PROJECTS_KEY);
      throw err;
    }

    localStorage.setItem(MIGRATED_FLAG_KEY, '1');
    console.log('[migrate] v1 → v2: Project 1 (이전 작업) 생성 완료');
    return 'migrated';
  } catch (err) {
    console.warn('[migrate] v1 → v2 failed — starting clean:', err);
    // Still set the flag so we don't retry forever; user can clear it manually if needed.
    localStorage.setItem(MIGRATED_FLAG_KEY, '1');
    return 'failed';
  }
}
