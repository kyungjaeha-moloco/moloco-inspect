/**
 * Project store — thin zustand wrapper around projectStorage.
 *
 * Holds the listing UI state (projects + currently viewed project) but delegates
 * all persistence to `projectStorage`. This keeps the Supabase swap in Phase 4B
 * trivial — only the storage adapter changes.
 */

import { create } from 'zustand';
import type {
  CanvasMeta,
  Project,
  ProjectStatus,
} from '../types/project';
import {
  projectStorage,
  type CreateProjectInput,
} from '../services/project-storage';
import {
  archivePlayground as apiArchivePlayground,
  createPlayground as apiCreatePlayground,
  hibernatePlayground as apiHibernatePlayground,
  listPlaygrounds as apiListPlaygrounds,
  resumePlayground as apiResumePlayground,
  type CreatePlaygroundInput,
  type Playground,
} from '../services/orchestrator-client';

interface ProjectStoreState {
  projects: Project[];
  canvasesByProjectId: Record<string, CanvasMeta[]>;
  /** Playgrounds fetched from the orchestrator, grouped by projectId. */
  playgroundsByProjectId: Record<string, Playground[]>;
  isLoadingProjects: boolean;
  isLoadingCanvases: boolean;
  isLoadingPlaygrounds: boolean;

  refreshProjects(): Promise<void>;
  refreshCanvases(projectId: string): Promise<void>;
  createProject(
    input: CreateProjectInput,
  ): Promise<{ project: Project; firstCanvas: CanvasMeta }>;
  updateProjectStatus(id: string, status: ProjectStatus): Promise<void>;
  renameProject(id: string, name: string): Promise<void>;
  deleteProject(id: string): Promise<void>;
  createCanvas(projectId: string, name?: string): Promise<CanvasMeta>;
  renameCanvas(id: string, name: string): Promise<void>;
  deleteCanvas(id: string): Promise<void>;

  // ── Playgrounds (v3) ───────────────────────────────
  refreshPlaygrounds(projectId: string): Promise<void>;
  createPlayground(input: CreatePlaygroundInput): Promise<Playground>;
  resumePlayground(id: string): Promise<Playground>;
  hibernatePlayground(id: string): Promise<Playground>;
  archivePlayground(id: string): Promise<Playground>;
}

function upsertPlayground(
  map: Record<string, Playground[]>,
  pg: Playground,
): Record<string, Playground[]> {
  const arr = map[pg.projectId] ?? [];
  const idx = arr.findIndex((p) => p.id === pg.id);
  const next = idx === -1 ? [...arr, pg] : arr.map((p) => (p.id === pg.id ? pg : p));
  return { ...map, [pg.projectId]: next };
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projects: [],
  canvasesByProjectId: {},
  playgroundsByProjectId: {},
  isLoadingProjects: false,
  isLoadingCanvases: false,
  isLoadingPlaygrounds: false,

  async refreshProjects() {
    set({ isLoadingProjects: true });
    try {
      const projects = await projectStorage.listProjects();
      set({ projects });
    } finally {
      set({ isLoadingProjects: false });
    }
  },

  async refreshCanvases(projectId) {
    set({ isLoadingCanvases: true });
    try {
      const canvases = await projectStorage.listCanvases(projectId);
      set((s) => ({
        canvasesByProjectId: { ...s.canvasesByProjectId, [projectId]: canvases },
      }));
    } finally {
      set({ isLoadingCanvases: false });
    }
  },

  async createProject(input) {
    const result = await projectStorage.createProject(input);
    set((s) => ({
      projects: [...s.projects, result.project],
      canvasesByProjectId: {
        ...s.canvasesByProjectId,
        [result.project.id]: [result.firstCanvas],
      },
    }));
    return result;
  },

  async updateProjectStatus(id, status) {
    const next = await projectStorage.updateProject(id, { status });
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? next : p)),
    }));
  },

  async renameProject(id, name) {
    const next = await projectStorage.updateProject(id, { name });
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? next : p)),
    }));
  },

  async deleteProject(id) {
    await projectStorage.softDeleteProject(id);
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
    }));
  },

  async createCanvas(projectId, name) {
    const canvas = await projectStorage.createCanvas(projectId, name);
    const existing = get().canvasesByProjectId[projectId] ?? [];
    set((s) => ({
      canvasesByProjectId: {
        ...s.canvasesByProjectId,
        [projectId]: [...existing, canvas],
      },
    }));
    return canvas;
  },

  async renameCanvas(id, name) {
    const next = await projectStorage.updateCanvasMeta(id, { name });
    const projectId = next.projectId;
    set((s) => {
      const arr = s.canvasesByProjectId[projectId] ?? [];
      return {
        canvasesByProjectId: {
          ...s.canvasesByProjectId,
          [projectId]: arr.map((c) => (c.id === id ? next : c)),
        },
      };
    });
  },

  async deleteCanvas(id) {
    await projectStorage.softDeleteCanvas(id);
    // Find the project this canvas belongs to in our cache and remove.
    set((s) => {
      const out: Record<string, CanvasMeta[]> = {};
      for (const [projectId, arr] of Object.entries(s.canvasesByProjectId)) {
        out[projectId] = arr.filter((c) => c.id !== id);
      }
      return { canvasesByProjectId: out };
    });
  },

  // ── Playgrounds (v3) ─────────────────────────────────
  // Orchestrator is the source of truth; this cache mirrors what the UI
  // needs to render without round-tripping on every keystroke.

  async refreshPlaygrounds(projectId) {
    set({ isLoadingPlaygrounds: true });
    try {
      const items = await apiListPlaygrounds({ projectId });
      set((s) => ({
        playgroundsByProjectId: {
          ...s.playgroundsByProjectId,
          [projectId]: items,
        },
      }));
    } finally {
      set({ isLoadingPlaygrounds: false });
    }
  },

  async createPlayground(input) {
    const pg = await apiCreatePlayground(input);
    set((s) => ({ playgroundsByProjectId: upsertPlayground(s.playgroundsByProjectId, pg) }));
    return pg;
  },

  async resumePlayground(id) {
    const pg = await apiResumePlayground(id);
    set((s) => ({ playgroundsByProjectId: upsertPlayground(s.playgroundsByProjectId, pg) }));
    return pg;
  },

  async hibernatePlayground(id) {
    const pg = await apiHibernatePlayground(id);
    set((s) => ({ playgroundsByProjectId: upsertPlayground(s.playgroundsByProjectId, pg) }));
    return pg;
  },

  async archivePlayground(id) {
    const pg = await apiArchivePlayground(id);
    set((s) => ({ playgroundsByProjectId: upsertPlayground(s.playgroundsByProjectId, pg) }));
    return pg;
  },
}));
