/**
 * Day 1 smoke tests for the localStorage project storage adapter + migration.
 *
 * Uses a minimal in-memory localStorage mock so tests run under the default
 * vitest node environment — no jsdom/happy-dom dependency required.
 */

import { beforeEach, describe, expect, it } from 'vitest';

// ── Minimal localStorage mock ──────────────────────────

class LocalStorageMock {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  key(i: number) { return Array.from(this.store.keys())[i] ?? null; }
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

(globalThis as any).localStorage = new LocalStorageMock();

// Mock crypto.randomUUID if missing (older Node)
if (!('crypto' in globalThis) || !(globalThis as any).crypto.randomUUID) {
  let counter = 0;
  (globalThis as any).crypto = {
    ...((globalThis as any).crypto || {}),
    randomUUID: () => `uuid-${++counter}`,
  };
}

// ── Now import the modules under test ──────────────────

import {
  createLocalStorageAdapter,
  MIGRATED_FLAG_KEY,
  PROJECTS_KEY,
} from '../project-storage';
import { migrateV1ToV2 } from '../migrate-v1-to-v2';

// Per-test reset
beforeEach(() => {
  (globalThis as any).localStorage.clear();
});

describe('project-storage (localStorage adapter)', () => {
  it('creates a project with an auto-generated first canvas', async () => {
    const storage = createLocalStorageAdapter();
    const { project, firstCanvas } = await storage.createProject({
      name: 'Test',
      defaultClient: 'tving',
    });

    expect(project.id).toBeTruthy();
    expect(project.schemaVersion).toBe(2);
    expect(project.status).toBe('active');
    expect(project.deletedAt).toBeNull();
    expect(project.ownerId).toBe('local-user');

    expect(firstCanvas.projectId).toBe(project.id);
    expect(firstCanvas.name).toBe('Canvas 1');
    expect(firstCanvas.order).toBe(0);
  });

  it('round-trips a project through list/get', async () => {
    const storage = createLocalStorageAdapter();
    const { project } = await storage.createProject({ name: 'A' });

    const all = await storage.listProjects();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(project.id);

    const got = await storage.getProject(project.id);
    expect(got?.name).toBe('A');
  });

  it('hides soft-deleted projects from listProjects by default', async () => {
    const storage = createLocalStorageAdapter();
    const { project } = await storage.createProject({ name: 'Trash me' });
    await storage.softDeleteProject(project.id);

    expect(await storage.listProjects()).toHaveLength(0);
    expect(await storage.listProjects({ includeDeleted: true })).toHaveLength(1);

    const got = await storage.getProject(project.id);
    expect(got?.deletedAt).toBeTruthy();
  });

  it('auto-increments canvas order', async () => {
    const storage = createLocalStorageAdapter();
    const { project } = await storage.createProject({ name: 'Multi' });
    const c2 = await storage.createCanvas(project.id);
    const c3 = await storage.createCanvas(project.id, 'Custom Name');

    expect(c2.order).toBe(1);
    expect(c2.name).toBe('Canvas 2');
    expect(c3.order).toBe(2);
    expect(c3.name).toBe('Custom Name');

    const list = await storage.listCanvases(project.id);
    expect(list.map((c) => c.order)).toEqual([0, 1, 2]);
  });

  it('round-trips a canvas snapshot', async () => {
    const storage = createLocalStorageAdapter();
    const { project, firstCanvas } = await storage.createProject({ name: 'S' });

    const snap = await storage.loadSnapshot(firstCanvas.id);
    expect(snap?.nodes).toEqual([]);
    expect(snap?.projectId).toBe(project.id);

    await storage.saveSnapshot({
      ...snap!,
      nodes: [{ id: 'n1', type: 'screen', position: { x: 0, y: 0 }, data: {} as any }] as any,
    });

    const again = await storage.loadSnapshot(firstCanvas.id);
    expect(again?.nodes).toHaveLength(1);
  });

  it('renames canvas via updateCanvasMeta', async () => {
    const storage = createLocalStorageAdapter();
    const { project, firstCanvas } = await storage.createProject({ name: 'R' });

    const renamed = await storage.updateCanvasMeta(firstCanvas.id, {
      name: 'Main Draft',
    });
    expect(renamed.name).toBe('Main Draft');
    expect(renamed.projectId).toBe(project.id);
  });
});

describe('migrate v1 → v2', () => {
  it('creates a project + canvas from legacy key on first boot', async () => {
    localStorage.setItem(
      'moloco-canvas-default',
      JSON.stringify({
        project: { viewport: { x: 10, y: 20, zoom: 1.5 } },
        nodes: [{ id: 'n1' }],
        edges: [],
        components: {},
        comments: { c1: { id: 'c1' } },
      }),
    );

    const result = await migrateV1ToV2();
    expect(result).toBe('migrated');

    // Flag set
    expect(localStorage.getItem(MIGRATED_FLAG_KEY)).toBe('1');

    // Legacy key is preserved (rollback-safe)
    expect(localStorage.getItem('moloco-canvas-default')).toBeTruthy();

    // Project created
    const storage = createLocalStorageAdapter();
    const projects = await storage.listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toContain('migrated');

    const canvases = await storage.listCanvases(projects[0].id);
    expect(canvases).toHaveLength(1);

    const snap = await storage.loadSnapshot(canvases[0].id);
    expect(snap?.viewport).toEqual({ x: 10, y: 20, zoom: 1.5 });
    expect(snap?.nodes).toHaveLength(1);
    expect(Object.keys(snap?.comments ?? {})).toEqual(['c1']);
  });

  it('is idempotent — second run does nothing', async () => {
    localStorage.setItem(
      'moloco-canvas-default',
      JSON.stringify({ nodes: [], edges: [], components: {} }),
    );
    await migrateV1ToV2();

    // Second run
    const second = await migrateV1ToV2();
    expect(second).toBe('already-migrated');

    const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
    expect(projects).toHaveLength(1);
  });

  it('sets the flag even with no legacy key (clean install)', async () => {
    const result = await migrateV1ToV2();
    expect(result).toBe('nothing-to-migrate');
    expect(localStorage.getItem(MIGRATED_FLAG_KEY)).toBe('1');

    const storage = createLocalStorageAdapter();
    expect(await storage.listProjects()).toHaveLength(0);
  });
});
