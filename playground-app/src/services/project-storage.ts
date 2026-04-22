/**
 * Storage adapter for Project / CanvasMeta / CanvasSnapshot.
 *
 * API is async-first so Phase 4B can swap in a Supabase adapter without
 * touching any caller.
 */

import {
  type CanvasMeta,
  type CanvasSnapshot,
  DEFAULT_VIEWPORT,
  LOCAL_USER_ID,
  type Project,
  type ProjectStatus,
  PROJECT_SCHEMA_VERSION,
  type TargetClient,
} from '../types/project';

// ── Key scheme (v2) ────────────────────────────────────

const KEY_PREFIX = 'moloco-canvas:v2';
export const MIGRATED_FLAG_KEY = `${KEY_PREFIX}:migrated`;
export const PROJECTS_KEY = `${KEY_PREFIX}:projects`;
const canvasMetaKey = (projectId: string) =>
  `${KEY_PREFIX}:project:${projectId}:canvases`;
const snapshotKey = (canvasId: string) =>
  `${KEY_PREFIX}:canvas:${canvasId}:snapshot`;

// ── Interface ──────────────────────────────────────────

export interface ProjectStorage {
  listProjects(options?: { includeDeleted?: boolean }): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(
    input: CreateProjectInput,
  ): Promise<{ project: Project; firstCanvas: CanvasMeta }>;
  updateProject(id: string, patch: Partial<Project>): Promise<Project>;
  softDeleteProject(id: string): Promise<void>;

  listCanvases(
    projectId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<CanvasMeta[]>;
  createCanvas(projectId: string, name?: string): Promise<CanvasMeta>;
  updateCanvasMeta(id: string, patch: Partial<CanvasMeta>): Promise<CanvasMeta>;
  softDeleteCanvas(id: string): Promise<void>;

  loadSnapshot(canvasId: string): Promise<CanvasSnapshot | null>;
  saveSnapshot(snapshot: CanvasSnapshot): Promise<void>;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  jiraUrl?: string;
  prdUrl?: string;
  defaultClient?: TargetClient;
  status?: ProjectStatus;
  ownerId?: string | null;
}

// ── localStorage adapter ───────────────────────────────

function now() {
  return new Date().toISOString();
}

function uuid(): string {
  // Use browser crypto when available, else fall back.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[project-storage] Failed to read ${key}:`, err);
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  const json = JSON.stringify(value);
  try {
    localStorage.setItem(key, json);
  } catch (err) {
    console.error(`[project-storage] Failed to write ${key}:`, err);
    throw err;
  }
}

function emptySnapshot(canvasId: string, projectId: string): CanvasSnapshot {
  return {
    id: canvasId,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId,
    viewport: { ...DEFAULT_VIEWPORT },
    nodes: [],
    edges: [],
    components: {},
    comments: {},
    chatMessages: [],
    updatedAt: now(),
  };
}

function buildProject(input: CreateProjectInput): Project {
  const id = uuid();
  const ts = now();
  const owner = input.ownerId ?? LOCAL_USER_ID;
  return {
    id,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: input.name,
    description: input.description,
    jiraUrl: input.jiraUrl,
    prdUrl: input.prdUrl,
    defaultClient: input.defaultClient ?? 'tving',
    status: input.status ?? 'active',
    ownerId: owner,
    createdBy: owner,
    updatedBy: owner,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  };
}

function buildCanvas(projectId: string, name: string, order: number): CanvasMeta {
  const id = uuid();
  const ts = now();
  return {
    id,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId,
    name,
    order,
    ownerId: LOCAL_USER_ID,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  };
}

export function createLocalStorageAdapter(): ProjectStorage {
  return {
    async listProjects({ includeDeleted = false } = {}) {
      const all = readJson<Project[]>(PROJECTS_KEY, []);
      return includeDeleted ? all : all.filter((p) => p.deletedAt == null);
    },

    async getProject(id) {
      const all = readJson<Project[]>(PROJECTS_KEY, []);
      return all.find((p) => p.id === id) ?? null;
    },

    async createProject(input) {
      const all = readJson<Project[]>(PROJECTS_KEY, []);
      const project = buildProject(input);
      writeJson(PROJECTS_KEY, [...all, project]);

      // Atomic: create the first canvas and snapshot together.
      // On snapshot failure, roll back the project write.
      try {
        const firstCanvas = buildCanvas(project.id, 'Canvas 1', 0);
        writeJson(canvasMetaKey(project.id), [firstCanvas]);
        writeJson(
          snapshotKey(firstCanvas.id),
          emptySnapshot(firstCanvas.id, project.id),
        );
        return { project, firstCanvas };
      } catch (err) {
        // Rollback project creation
        writeJson(PROJECTS_KEY, all);
        throw err;
      }
    },

    async updateProject(id, patch) {
      const all = readJson<Project[]>(PROJECTS_KEY, []);
      const idx = all.findIndex((p) => p.id === id);
      if (idx < 0) throw new Error(`Project not found: ${id}`);
      const next: Project = {
        ...all[idx],
        ...patch,
        id: all[idx].id,
        schemaVersion: PROJECT_SCHEMA_VERSION,
        updatedAt: now(),
        updatedBy: patch.updatedBy ?? all[idx].updatedBy,
      };
      const arr = all.slice();
      arr[idx] = next;
      writeJson(PROJECTS_KEY, arr);
      return next;
    },

    async softDeleteProject(id) {
      const all = readJson<Project[]>(PROJECTS_KEY, []);
      const idx = all.findIndex((p) => p.id === id);
      if (idx < 0) return;
      const ts = now();
      const arr = all.slice();
      arr[idx] = { ...all[idx], deletedAt: ts, updatedAt: ts };
      writeJson(PROJECTS_KEY, arr);
    },

    async listCanvases(projectId, { includeDeleted = false } = {}) {
      const all = readJson<CanvasMeta[]>(canvasMetaKey(projectId), []);
      const filtered = includeDeleted ? all : all.filter((c) => c.deletedAt == null);
      return filtered.slice().sort((a, b) => a.order - b.order);
    },

    async createCanvas(projectId, name) {
      const all = readJson<CanvasMeta[]>(canvasMetaKey(projectId), []);
      const nextOrder = all.length
        ? Math.max(...all.map((c) => c.order)) + 1
        : 0;
      const autoName = name ?? `Canvas ${all.length + 1}`;
      const meta = buildCanvas(projectId, autoName, nextOrder);

      writeJson(canvasMetaKey(projectId), [...all, meta]);
      writeJson(snapshotKey(meta.id), emptySnapshot(meta.id, projectId));
      return meta;
    },

    async updateCanvasMeta(id, patch) {
      // Find the project this canvas lives under by scanning projects.
      const projects = readJson<Project[]>(PROJECTS_KEY, []);
      for (const p of projects) {
        const arr = readJson<CanvasMeta[]>(canvasMetaKey(p.id), []);
        const idx = arr.findIndex((c) => c.id === id);
        if (idx < 0) continue;

        const next: CanvasMeta = {
          ...arr[idx],
          ...patch,
          id: arr[idx].id,
          projectId: arr[idx].projectId,
          schemaVersion: PROJECT_SCHEMA_VERSION,
          updatedAt: now(),
        };
        const out = arr.slice();
        out[idx] = next;
        writeJson(canvasMetaKey(p.id), out);
        return next;
      }
      throw new Error(`Canvas not found: ${id}`);
    },

    async softDeleteCanvas(id) {
      const projects = readJson<Project[]>(PROJECTS_KEY, []);
      for (const p of projects) {
        const arr = readJson<CanvasMeta[]>(canvasMetaKey(p.id), []);
        const idx = arr.findIndex((c) => c.id === id);
        if (idx < 0) continue;
        const ts = now();
        const out = arr.slice();
        out[idx] = { ...arr[idx], deletedAt: ts, updatedAt: ts };
        writeJson(canvasMetaKey(p.id), out);
        return;
      }
    },

    async loadSnapshot(canvasId) {
      return readJson<CanvasSnapshot | null>(snapshotKey(canvasId), null);
    },

    async saveSnapshot(snapshot) {
      const safe: CanvasSnapshot = {
        ...snapshot,
        schemaVersion: PROJECT_SCHEMA_VERSION,
        updatedAt: now(),
      };
      writeJson(snapshotKey(snapshot.id), safe);
    },
  };
}

// Default singleton — replaced by a Supabase adapter in Phase 4B.
export const projectStorage: ProjectStorage = createLocalStorageAdapter();
