/**
 * Project data model.
 *
 * Carried forward from Phase 4A as the persisted shape for Project and
 * CanvasMeta. The CanvasSnapshot payload is now opaque to v3 — v2 users
 * still have snapshots on disk for migration (see `migrate-v1-to-v2`
 * and `migrate-v2-to-v3`), but v3 code never inspects the inner canvas
 * nodes/edges/components. Leaving them as `unknown[]` keeps the type
 * decoupled from the deleted canvas module while preserving the
 * migration roundtrip.
 */

export type TargetClient = 'msm-default' | 'tving' | 'shortmax' | 'onboard-demo';

export type ProjectStatus = 'active' | 'archived' | 'done';

export const PROJECT_SCHEMA_VERSION = 2;

/** Top-level container for a body of work (typically tied to a Jira ticket). */
export interface Project {
  id: string;
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  name: string;
  description?: string;
  jiraUrl?: string;
  prdUrl?: string;
  defaultClient: TargetClient;
  status: ProjectStatus;
  /** 4A: 'local-user' · 4B: supabase user id */
  ownerId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Soft-delete timestamp. null when active. */
  deletedAt: string | null;
}

/**
 * Light metadata for a canvas — kept separate from the snapshot so the project
 * home can list canvases without hydrating their full state.
 */
export interface CanvasMeta {
  id: string;
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  projectId: string;
  name: string;
  /** Deterministic ordering within a project. */
  order: number;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Legacy v2 canvas snapshot. v3 never reads the inner fields — migration
 * code walks them structurally but by `unknown`. Retained so
 * `projectStorage.saveSnapshot` / `loadSnapshot` keep their shape for
 * any in-flight user data.
 */
export interface CanvasSnapshot {
  id: string;
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  projectId: string;
  viewport: { x: number; y: number; zoom: number };
  nodes: unknown[];
  edges: unknown[];
  components: Record<string, unknown>;
  comments: Record<string, unknown>;
  chatMessages: unknown[];
  updatedAt: string;
}

// ── Helpers ────────────────────────────────────────────

export const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 } as const;

export const LOCAL_USER_ID = 'local-user';
