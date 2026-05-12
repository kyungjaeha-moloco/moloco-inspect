/**
 * One-shot migration from v2 (canvas-based) to v3 (playground-based).
 *
 * Why this is a best-effort, not a full port:
 *  v2 comments were anchored to canvas nodes (screens/sections/frames),
 *  and v3 playgrounds don't have canvases. There is no 1:1 mapping —
 *  the orphan comments are preserved inside localStorage under a
 *  dedicated key so the user can download them as JSON and replay any
 *  notes manually inside a playground chat.
 *
 * Keys written:
 *  - moloco-playground:v3:migrated-v2                (flag, set once)
 *  - moloco-playground:v3:legacy-comments:<projectId> (array of comments)
 *
 * v2 keys are NEVER deleted — if a user needs to roll back or export
 * more data, the originals remain under `moloco-canvas:v2:*`.
 */

const V2_PROJECTS_KEY = 'moloco-canvas:v2:projects';
const V2_CANVASES_PREFIX = 'moloco-canvas:v2:project:';
const V2_SNAPSHOT_PREFIX = 'moloco-canvas:v2:canvas:';

const V3_FLAG = 'moloco-playground:v3:migrated-v2';
const V3_LEGACY_PREFIX = 'moloco-playground:v3:legacy-comments:';

export interface LegacyComment {
  id: string;
  projectId: string;
  projectName?: string;
  canvasId: string;
  canvasName?: string;
  /** Optional pointer to the node the comment was attached to, for context. */
  screenId?: string | null;
  text: string;
  author?: string;
  status?: string;
  createdAt: string;
  replies?: Array<{ id: string; text: string; author?: string; createdAt: string }>;
}

export type MigrationState = 'pending' | 'partial' | 'complete';

export interface MigrationSummary {
  state: MigrationState;
  migratedProjects: number;
  totalComments: number;
  skippedCanvases: number;
  /** Project ids that have legacy comments stashed — used by UI to
   * surface the "download JSON" affordance per project. */
  projectsWithLegacy: string[];
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Run the v2 → v3 migration once per browser. Idempotent — subsequent
 * calls short-circuit on the flag and return the previously-seen legacy
 * projects by scanning the v3 legacy-comments keys.
 */
export async function migrateV2ToV3(): Promise<MigrationSummary> {
  const projectsWithLegacy: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith(V3_LEGACY_PREFIX)) {
      projectsWithLegacy.push(k.slice(V3_LEGACY_PREFIX.length));
    }
  }

  if (localStorage.getItem(V3_FLAG)) {
    return {
      state: 'complete',
      migratedProjects: projectsWithLegacy.length,
      totalComments: 0,
      skippedCanvases: 0,
      projectsWithLegacy,
    };
  }

  const projects =
    safeParse<Array<{ id: string; name?: string }>>(
      localStorage.getItem(V2_PROJECTS_KEY),
    ) ?? [];

  if (projects.length === 0) {
    localStorage.setItem(V3_FLAG, '1');
    return {
      state: 'complete',
      migratedProjects: 0,
      totalComments: 0,
      skippedCanvases: 0,
      projectsWithLegacy: [],
    };
  }

  let totalComments = 0;
  let skippedCanvases = 0;
  let partial = false;
  const freshLegacy: string[] = [];

  for (const project of projects) {
    if (!project?.id) continue;

    const canvases =
      safeParse<Array<{ id: string; name?: string }>>(
        localStorage.getItem(`${V2_CANVASES_PREFIX}${project.id}:canvases`),
      ) ?? [];

    const comments: LegacyComment[] = [];
    for (const canvas of canvases) {
      if (!canvas?.id) continue;
      const snap = safeParse<{
        comments?: Record<string, unknown>;
      }>(localStorage.getItem(`${V2_SNAPSHOT_PREFIX}${canvas.id}:snapshot`));
      if (!snap) {
        skippedCanvases += 1;
        partial = true;
        continue;
      }
      const entries = Object.values(snap.comments ?? {});
      for (const raw of entries) {
        if (!raw || typeof raw !== 'object') continue;
        const c = raw as Record<string, unknown>;
        comments.push({
          id: String(c.id ?? `legacy-${Math.random().toString(36).slice(2, 8)}`),
          projectId: project.id,
          projectName: project.name,
          canvasId: canvas.id,
          canvasName: canvas.name,
          screenId: (c.screenId as string | null | undefined) ?? null,
          text: String(c.text ?? ''),
          author:
            typeof c.author === 'object' && c.author != null
              ? String((c.author as Record<string, unknown>).name ?? '')
              : (c.author as string | undefined),
          status: c.status as string | undefined,
          createdAt: String(c.createdAt ?? new Date().toISOString()),
          replies: Array.isArray(c.replies)
            ? (c.replies as Array<Record<string, unknown>>).map((r) => ({
                id: String(r.id ?? ''),
                text: String(r.text ?? ''),
                author:
                  typeof r.author === 'object' && r.author != null
                    ? String(
                        (r.author as Record<string, unknown>).name ?? '',
                      )
                    : (r.author as string | undefined),
                createdAt: String(r.createdAt ?? ''),
              }))
            : undefined,
        });
      }
    }

    if (comments.length > 0) {
      try {
        localStorage.setItem(
          `${V3_LEGACY_PREFIX}${project.id}`,
          JSON.stringify(comments),
        );
        totalComments += comments.length;
        freshLegacy.push(project.id);
      } catch (err) {
        console.warn(
          `[migrate v2→v3] failed to persist legacy comments for ${project.id}:`,
          err,
        );
        partial = true;
      }
    }
  }

  localStorage.setItem(V3_FLAG, '1');
  return {
    state: partial ? 'partial' : 'complete',
    migratedProjects: freshLegacy.length,
    totalComments,
    skippedCanvases,
    projectsWithLegacy: Array.from(new Set([...projectsWithLegacy, ...freshLegacy])),
  };
}

/**
 * Returns the legacy comments stashed for a project, or null when none.
 * The UI uses this to drive the per-project "Download" button.
 */
export function readLegacyComments(projectId: string): LegacyComment[] | null {
  const raw = localStorage.getItem(`${V3_LEGACY_PREFIX}${projectId}`);
  if (!raw) return null;
  const parsed = safeParse<LegacyComment[]>(raw);
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
}

/** List of project ids that still have an un-downloaded legacy blob. */
export function listLegacyProjects(): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith(V3_LEGACY_PREFIX)) {
      out.push(k.slice(V3_LEGACY_PREFIX.length));
    }
  }
  return out;
}

/** User-initiated clear after they downloaded the JSON. */
export function dismissLegacyComments(projectId: string): void {
  localStorage.removeItem(`${V3_LEGACY_PREFIX}${projectId}`);
}

/** Build a JSON Blob + trigger a browser download. No server hop. */
export function downloadLegacyComments(
  projectId: string,
  comments: LegacyComment[],
): void {
  const blob = new Blob([JSON.stringify(comments, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `moloco-canvas-legacy-comments-${projectId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
