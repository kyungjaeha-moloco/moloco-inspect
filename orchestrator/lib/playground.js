// Playground lifecycle manager — M1a (CRUD + state persistence + sandbox boot/hibernate/resume/archive).
//
// Plan: docs/superpowers/plans/2026-04-22-playground-architecture-v3.md
// Spike: docs/spikes/2026-04-22-playground-feasibility.md
//
// M1a scope: do NOT touch /api/change-request pipeline. New endpoints only.

import fs from 'node:fs';
import path from 'node:path';
import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';

import {
  copyFilesIn,
  removeSandbox,
  allocatePort,
  releasePort,
} from '../../tooling/sandbox-manager/src/index.js';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const STATE_DIR = new URL('../state/playground/', import.meta.url).pathname;
const PATCHES_DIR = new URL('../state/playground-archived/', import.meta.url).pathname;
const PLAYGROUND_IMAGE =
  process.env.SANDBOX_IMAGE_PLAYGROUND ||
  'moloco-inspect-sandbox:v3-playground-m3';
const SOURCE_WORKSPACE_ROOT =
  process.env.SOURCE_WORKSPACE_ROOT || '/Users/kyungjae.ha/Documents/Agent-Design-System';

fs.mkdirSync(STATE_DIR, { recursive: true });
fs.mkdirSync(PATCHES_DIR, { recursive: true });

// ── In-memory index (loaded from disk on module init) ────────────────

/** @type {Map<string, Playground>} */
const playgrounds = new Map();

for (const file of fs.readdirSync(STATE_DIR)) {
  if (!file.endsWith('.json')) continue;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(STATE_DIR, file), 'utf8'));
    playgrounds.set(raw.id, raw);
  } catch (err) {
    console.warn('[playground] skipped malformed state:', file, err.message);
  }
}
console.log(`[playground] restored ${playgrounds.size} playgrounds from disk`);

// ── Types (JSDoc for editor hints) ──────────────────────────────────

/**
 * @typedef {Object} Playground
 * @property {string} id
 * @property {string} projectId
 * @property {string} title
 * @property {'active' | 'hibernated' | 'archived'} status
 * @property {string} sandboxContainerName
 * @property {number | undefined} vitePort
 * @property {number | undefined} opencodePort
 * @property {'synthetic' | 'real-clone'} gitModel
 * @property {string | undefined} baselineCommitSha
 * @property {string | undefined} headCommitSha
 * @property {string} workBranch
 * @property {string} baseBranch
 * @property {string | undefined} archivedDiffPath
 * @property {number | undefined} hibernatedAt
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {number} lastActivityAt
 * @property {string | undefined} imageTag
 * @property {string | undefined} prdUrl
 * @property {string | undefined} jiraUrl
 * @property {string | undefined} createdBy  Human name supplied by the
 *   client (playground-app prompt or chrome-extension settings). Purely
 *   informational — surfaced in lists so teammates can tell who kicked
 *   a playground off, but never used as an auth signal.
 * @property {number | undefined} promotedAt  Wall-clock ms of the last
 *   successful (or partially successful) promote run.
 * @property {string | undefined} promotedBranch  Branch pushed to the
 *   host `msm-portal` origin during the last promote. Kept even when the
 *   push step was skipped (dry-run) so the UI can still link to the local
 *   branch if needed.
 * @property {string | undefined} promotedPrUrl  GitHub PR URL from the
 *   last `gh pr create`. Absent on dry-run or when all patches were
 *   skipped.
 */

// ── Persistence ─────────────────────────────────────────────────────

function persist(pg) {
  fs.writeFileSync(
    path.join(STATE_DIR, `${pg.id}.json`),
    JSON.stringify(pg, null, 2),
    'utf8',
  );
}

function nowMs() {
  return Date.now();
}

function makeShortId() {
  // 8 hex chars — matches existing change-request id style
  return randomUUID().replace(/-/g, '').slice(0, 8);
}

/**
 * Poke the in-sandbox Vite plugin's invalidation watcher. The plugin
 * (vite-plugin-playground-picker, `configureServer` hook) polls
 * `/workspace/.playground-invalidate` and, on mtime change, clears the
 * Vite module graph and pushes a `full-reload` to the browser. We touch
 * the file after any git operation that rewrites the working tree
 * because Vite's default inotify watcher silently misses those changes
 * on Docker Desktop overlayfs — the iframe would otherwise keep serving
 * stale transformed modules even after a browser reload.
 *
 * Best-effort: swallow failures so a signal glitch never fails the
 * underlying git operation.
 *
 * @param {string} containerName
 */
async function signalInvalidate(containerName) {
  try {
    await execAsync(
      `docker exec ${containerName} touch /workspace/.playground-invalidate`,
      { timeout: 5_000 },
    );
  } catch (err) {
    console.warn(`[playground] invalidate signal failed: ${err.message}`);
  }
}

/**
 * Write the playground Vite wrapper config into the sandbox. The wrapper
 * lives *inside* msm-portal-web so the relative `./vite.config` import
 * resolves; its playground-picker import is absolute because the plugin
 * package is baked into the sandbox image at a known path (see
 * `sandbox/Dockerfile`). Adding the file to `.git/info/exclude` keeps
 * change-request diffs clean.
 *
 * @param {string} containerId
 */
async function writePlaygroundViteConfig(containerId) {
  const configBody = `import { defineConfig } from 'vite';
import base from './vite.config';
// @ts-ignore — plugin lives outside node_modules at a container-fixed path.
import playgroundPicker from '/workspace/plugins/vite-plugin-playground-picker/dist/index.js';

export default defineConfig(async (env) => {
  const b: any = base;
  const resolved = await (typeof b === 'function' ? b(env) : b);
  return {
    ...resolved,
    plugins: [...(resolved?.plugins ?? []), playgroundPicker()],
  };
});
`;
  // Base64 pipe to avoid any shell/quote escaping on TS syntax.
  const b64 = Buffer.from(configBody, 'utf8').toString('base64');
  await execAsync(
    `docker exec ${containerId} sh -c "echo '${b64}' | base64 -d > /workspace/msm-portal/js/msm-portal-web/vite.config.playground.ts"`,
    { timeout: 10_000 },
  );
  // Local ignore — never lands in playground commits or promote patches.
  // Includes vite's temporary transpile artifacts (`.timestamp-*.mjs`)
  // so they don't sneak into change-request diffs either.
  const excludeLines =
    'js/msm-portal-web/vite.config.playground.ts\\n' +
    'js/msm-portal-web/vite.config.playground.ts.timestamp-*.mjs';
  await execAsync(
    `docker exec ${containerId} sh -c "printf '%b\\n' '${excludeLines}' >> /workspace/msm-portal/.git/info/exclude"`,
    { timeout: 5_000 },
  );
}

// ── CRUD ────────────────────────────────────────────────────────────

export function listPlaygrounds({ projectId = null, status = null } = {}) {
  const out = [];
  for (const pg of playgrounds.values()) {
    if (projectId && pg.projectId !== projectId) continue;
    if (status && pg.status !== status) continue;
    out.push(pg);
  }
  out.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  return out;
}

export function getPlayground(id) {
  return playgrounds.get(id) ?? null;
}

/** Update Playground HEAD sha + lastActivity after a change-request commit. */
export function updatePlaygroundHead(id, commitSha) {
  const pg = playgrounds.get(id);
  if (!pg) return;
  pg.headCommitSha = commitSha;
  pg.lastActivityAt = nowMs();
  pg.updatedAt = nowMs();
  persist(pg);
}

/**
 * Create a new Playground: boot container, copy msm-portal source, init git baseline,
 * record state. Does NOT run any agent or change-request — that belongs to M1b.
 */
/**
 * msm-portal's vite.config.ts requires `CLIENT=<target>` env. For MVP default
 * to 'tving'; pilot uses TVING Ad System. Override via `client` param if a
 * different client's preview is needed.
 */
async function bootPlaygroundContainer({ id, apiKey, provider, client, openCodePort, vitePort }) {
  const containerName = `inspect-pg-${id}`;
  await execAsync(`docker rm -f ${containerName} 2>/dev/null || true`);
  const envFlags = [
    '-e', `NODE_TLS_REJECT_UNAUTHORIZED=0`,
    '-e', `SSL_CERT_FILE=/tmp/ca-bundle.crt`,
    '-e', `CLIENT=${client}`,
  ];
  if (provider === 'opencode') envFlags.push('-e', `OPENCODE_API_KEY=${apiKey}`);
  else if (provider === 'openai' || apiKey.startsWith('sk-proj-')) envFlags.push('-e', `OPENAI_API_KEY=${apiKey}`);
  else envFlags.push('-e', `ANTHROPIC_API_KEY=${apiKey}`);
  const args = [
    'run', '-d',
    '--name', containerName,
    '-p', `${openCodePort}:4096`,
    '-p', `${vitePort}:5173`,
    '--shm-size=2gb',
    '-v', '/etc/ssl/cert.pem:/etc/ssl/cert.pem:ro',
    '-v', '/etc/ssl/cert.pem:/etc/ssl/certs/ca-certificates.crt:ro',
    ...envFlags,
    PLAYGROUND_IMAGE,
  ];
  await execFileAsync('docker', args, { timeout: 30_000 });
  return { containerId: containerName, containerName };
}

export async function createPlayground({
  projectId,
  title,
  prdUrl,
  jiraUrl,
  createdBy,
  client = 'tving',
  apiKey,
  provider = 'anthropic',
}) {
  if (!projectId) throw new Error('projectId required');
  if (!title) throw new Error('title required');
  if (!apiKey) throw new Error('apiKey required (orchestrator must pass current key)');

  const id = makeShortId();
  const openCodePort = await allocatePort();
  const vitePort = await allocatePort();

  const sandbox = await bootPlaygroundContainer({
    id, apiKey, provider, client, openCodePort, vitePort,
  });

  // Copy msm-portal source into container + git init baseline.
  await copyFilesIn({
    containerId: sandbox.containerId,
    sourceDir: path.join(SOURCE_WORKSPACE_ROOT, 'msm-portal'),
  });

  // Capture baseline sha (copyFilesIn already created a baseline commit).
  const baseline = await execAsync(
    `docker exec ${sandbox.containerId} sh -c "cd /workspace/msm-portal && git rev-parse HEAD"`,
    { timeout: 10_000 },
  );
  const baselineSha = baseline.stdout.trim();

  // Create a named work branch so future commits go on playground-<id>.
  await execAsync(
    `docker exec ${sandbox.containerId} sh -c "cd /workspace/msm-portal && git checkout -b playground-${id}"`,
    { timeout: 10_000 },
  );

  // Drop the playground Vite wrapper config next to msm-portal's own
  // vite.config. start-vite.sh picks it up via `--config` so the picker
  // plugin is loaded. Locally excluded from git so change-request diffs
  // never sweep our shim into the real promote patches.
  await writePlaygroundViteConfig(sandbox.containerId);

  // Kick Vite over supervisor — autostart is disabled in supervisord.conf
  // so the wrapper config lands first. Errors here are warnings only;
  // the UI already shows "Vite 포트 미할당" until it comes up, and
  // `resume` runs the same start sequence with retry/readiness polling.
  await execAsync(
    `docker exec ${sandbox.containerId} supervisorctl start vite`,
    { timeout: 20_000 },
  ).catch((err) => {
    console.warn(
      `[playground] initial supervisorctl start vite failed for ${id}: ${err.message}`,
    );
  });

  const pg = /** @type {Playground} */ ({
    id,
    projectId,
    title,
    status: 'active',
    sandboxContainerName: sandbox.containerName,
    vitePort,
    opencodePort: openCodePort,
    gitModel: 'synthetic',
    baselineCommitSha: baselineSha,
    headCommitSha: baselineSha,
    workBranch: `playground-${id}`,
    baseBranch: 'main',
    hibernatedAt: undefined,
    createdAt: nowMs(),
    updatedAt: nowMs(),
    lastActivityAt: nowMs(),
    imageTag: PLAYGROUND_IMAGE,
    client,
    prdUrl,
    jiraUrl,
    createdBy: (createdBy ?? '').trim() || undefined,
  });

  playgrounds.set(id, pg);
  persist(pg);
  console.log(
    `[playground] created ${id} container=${sandbox.containerName} oc=${openCodePort} vite=${vitePort}`,
  );
  return pg;
}

// ── Lifecycle: hibernate / resume / archive ─────────────────────────

export async function hibernatePlayground(id) {
  const pg = getPlayground(id);
  if (!pg) throw new Error(`playground not found: ${id}`);
  if (pg.status !== 'active') {
    return pg;
  }
  try {
    await execAsync(`docker stop ${pg.sandboxContainerName}`, { timeout: 30_000 });
  } catch (err) {
    console.warn(`[playground] docker stop warning ${id}: ${err.message}`);
  }
  if (pg.vitePort) releasePort(pg.vitePort);
  if (pg.opencodePort) releasePort(pg.opencodePort);
  pg.status = 'hibernated';
  pg.hibernatedAt = nowMs();
  pg.vitePort = undefined;
  pg.opencodePort = undefined;
  pg.updatedAt = nowMs();
  persist(pg);
  console.log(`[playground] hibernated ${id}`);
  return pg;
}

/**
 * Resume a hibernated Playground.
 *
 * Per v3 Section 2.2 / spike A2+A3:
 *   1. docker start <container>
 *   2. docker exec <container> supervisorctl start vite
 *   3. Re-query `docker port` (ephemeral ports change across stop/start)
 *   4. Wait for Vite HTTP 200 (timeout 20s)
 */
export async function resumePlayground(id) {
  const pg = getPlayground(id);
  if (!pg) throw new Error(`playground not found: ${id}`);
  if (pg.status === 'archived') throw new Error('cannot resume archived playground');
  if (pg.status === 'active') return pg;

  // Step 1. docker start
  await execAsync(`docker start ${pg.sandboxContainerName}`, { timeout: 30_000 });

  // supervisord needs a moment to bring its unix socket up after docker start.
  // Retry vite start a few times, tolerating "already started" as success.
  await new Promise((r) => setTimeout(r, 1000));
  let started = false;
  let lastErr = null;
  for (let i = 0; i < 5; i++) {
    try {
      const { stdout, stderr } = await execAsync(
        `docker exec ${pg.sandboxContainerName} supervisorctl start vite`,
        { timeout: 10_000 },
      );
      const out = (stdout + stderr).toLowerCase();
      if (out.includes('started') || out.includes('already started')) {
        started = true;
        break;
      }
    } catch (err) {
      const out = (err.stdout || '') + (err.stderr || '') + err.message;
      if (out.toLowerCase().includes('already started')) {
        started = true;
        break;
      }
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!started) {
    throw new Error(
      `failed to start vite via supervisorctl: ${lastErr?.message ?? 'unknown'}`,
    );
  }

  // Step 3. Re-query ports (ephemeral mappings shift)
  const oc = await queryDockerPort(pg.sandboxContainerName, 4096);
  const vt = await queryDockerPort(pg.sandboxContainerName, 5173);

  // Step 4. Wait for Vite readiness
  const viteReady = await waitForHttpOk(`http://localhost:${vt}/`, 20_000);

  pg.status = 'active';
  pg.hibernatedAt = undefined;
  pg.opencodePort = oc;
  pg.vitePort = vt;
  pg.updatedAt = nowMs();
  pg.lastActivityAt = nowMs();
  persist(pg);
  console.log(
    `[playground] resumed ${id} oc=${oc} vite=${vt} viteReady=${viteReady}`,
  );
  return pg;
}

export async function archivePlayground(id) {
  const pg = getPlayground(id);
  if (!pg) throw new Error(`playground not found: ${id}`);
  if (pg.status === 'archived') return pg;

  // Ensure container is running so we can extract patches.
  if (pg.status === 'hibernated') {
    try {
      await execAsync(`docker start ${pg.sandboxContainerName}`, { timeout: 30_000 });
    } catch (err) {
      console.warn(`[playground] archive start warning ${id}: ${err.message}`);
    }
  }

  // Export patches baseline..HEAD as a single directory.
  const patchesDir = path.join(PATCHES_DIR, id);
  fs.mkdirSync(patchesDir, { recursive: true });
  try {
    await execAsync(
      `docker exec ${pg.sandboxContainerName} sh -c "cd /workspace/msm-portal && git format-patch ${pg.baselineCommitSha}..HEAD -o /tmp/pg-patches 2>/dev/null || true"`,
      { timeout: 30_000 },
    );
    // Copy out
    await execAsync(
      `docker cp ${pg.sandboxContainerName}:/tmp/pg-patches/. ${patchesDir}/`,
      { timeout: 30_000 },
    );
  } catch (err) {
    console.warn(`[playground] patch export warning ${id}: ${err.message}`);
  }

  try {
    await removeSandbox({ containerId: pg.sandboxContainerName });
  } catch (err) {
    console.warn(`[playground] removeSandbox warning ${id}: ${err.message}`);
  }

  if (pg.vitePort) releasePort(pg.vitePort);
  if (pg.opencodePort) releasePort(pg.opencodePort);

  pg.status = 'archived';
  pg.vitePort = undefined;
  pg.opencodePort = undefined;
  pg.archivedDiffPath = patchesDir;
  pg.updatedAt = nowMs();
  persist(pg);
  console.log(`[playground] archived ${id} patches=${patchesDir}`);
  return pg;
}

// ── Time-travel: checkout / restore-head / revert ───────────────────

/**
 * Checkout a historical commit. Container enters detached HEAD state until
 * `restorePlaygroundHead()` returns to workBranch. While detached, the
 * playground has `checkedOutSha` set — callers should refuse new change-requests
 * until restored.
 */
export async function checkoutCommit(id, sha) {
  const pg = getPlayground(id);
  if (!pg) throw new Error(`playground not found: ${id}`);
  if (pg.status !== 'active') throw new Error(`playground not active: ${pg.status}`);
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error('invalid sha');
  await execAsync(
    `docker exec ${pg.sandboxContainerName} sh -c "cd /workspace/msm-portal && git checkout ${sha}"`,
    { timeout: 15_000 },
  );
  pg.checkedOutSha = sha;
  pg.updatedAt = nowMs();
  pg.lastActivityAt = nowMs();
  persist(pg);
  await signalInvalidate(pg.sandboxContainerName);
  console.log(`[playground] ${id} checkout ${sha.slice(0, 8)}`);
  return pg;
}

export async function restorePlaygroundHead(id) {
  const pg = getPlayground(id);
  if (!pg) throw new Error(`playground not found: ${id}`);
  if (!pg.checkedOutSha) return pg;
  await execAsync(
    `docker exec ${pg.sandboxContainerName} sh -c "cd /workspace/msm-portal && git checkout ${pg.workBranch}"`,
    { timeout: 15_000 },
  );
  pg.checkedOutSha = undefined;
  pg.updatedAt = nowMs();
  pg.lastActivityAt = nowMs();
  persist(pg);
  await signalInvalidate(pg.sandboxContainerName);
  console.log(`[playground] ${id} restored head on ${pg.workBranch}`);
  return pg;
}

/**
 * Restore to a checkpoint — create revert commits for every commit
 * after `sha` so the tree matches that checkpoint's state, while
 * preserving full history (no destructive reset). Writes a single
 * "Restore to <shortsha>" commit on top. Updates `headCommitSha`.
 */
export async function restoreToSha(id, sha) {
  const pg = getPlayground(id);
  if (!pg) throw new Error(`playground not found: ${id}`);
  if (pg.status !== 'active') throw new Error(`playground not active: ${pg.status}`);
  if (pg.checkedOutSha) throw new Error('restore head before restoring to a checkpoint');
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error('invalid sha');

  // Guard: already at that sha → nothing to do.
  const { stdout: headOut } = await execAsync(
    `docker exec ${pg.sandboxContainerName} sh -c "cd /workspace/msm-portal && git rev-parse HEAD"`,
    { timeout: 5_000 },
  );
  const currentHead = headOut.trim();
  if (currentHead === sha || currentHead.startsWith(sha)) {
    return pg;
  }

  // `git revert <sha>..HEAD --no-commit` stages the inverse of every
  // commit after `sha`, then we seal it with one commit so the log
  // gets a single "Restore" marker instead of N noisy revert commits.
  //
  // Revert can halt mid-way with conflicts (e.g. when two commits after
  // `sha` touch the same region and reverting them produces textual
  // collisions). If that happens we MUST `--abort` the partial revert,
  // otherwise the sandbox is left in a "reverting commit X" state and
  // every subsequent git op inside the container fails. We detect
  // mid-revert via `.git/REVERT_HEAD` and surface a clean error so the
  // UI can tell the user to skip the bad hop.
  const script = [
    'cd /workspace/msm-portal',
    `git revert --no-commit ${sha}..HEAD || { git revert --abort 2>/dev/null; echo "__REVERT_FAILED__"; exit 2; }`,
    '[ -f .git/REVERT_HEAD ] && { git revert --abort; echo "__REVERT_CONFLICT__"; exit 3; }',
    `git commit --no-verify -m 'Restore to ${sha.slice(0, 8)}'`,
  ].join(' && ');
  try {
    await execAsync(
      `docker exec ${pg.sandboxContainerName} sh -c ${JSON.stringify(script)}`,
      { timeout: 30_000 },
    );
  } catch (err) {
    const stdout = err.stdout || '';
    const stderr = err.stderr || '';
    const combined = `${stdout}\n${stderr}`;
    if (combined.includes('__REVERT_CONFLICT__')) {
      throw new Error(
        `restore to ${sha.slice(0, 8)} hit revert conflicts (aborted cleanly) — try a different checkpoint or restore-head first`,
      );
    }
    if (combined.includes('__REVERT_FAILED__')) {
      throw new Error(
        `restore to ${sha.slice(0, 8)} failed during revert (aborted cleanly) — sandbox is clean`,
      );
    }
    throw err;
  }
  const { stdout: newHead } = await execAsync(
    `docker exec ${pg.sandboxContainerName} sh -c "cd /workspace/msm-portal && git rev-parse HEAD"`,
    { timeout: 5_000 },
  );
  pg.headCommitSha = newHead.trim();
  pg.updatedAt = nowMs();
  pg.lastActivityAt = nowMs();
  persist(pg);
  await signalInvalidate(pg.sandboxContainerName);
  console.log(`[playground] ${id} restored to ${sha.slice(0, 8)} → ${pg.headCommitSha.slice(0, 8)}`);
  return pg;
}

/**
 * Revert a specific commit by creating a new revert commit. Updates
 * `headCommitSha` to the new revert commit sha.
 */
export async function revertCommit(id, sha) {
  const pg = getPlayground(id);
  if (!pg) throw new Error(`playground not found: ${id}`);
  if (pg.status !== 'active') throw new Error(`playground not active: ${pg.status}`);
  if (pg.checkedOutSha) throw new Error('cannot revert while checked out; restore head first');
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error('invalid sha');
  // `git revert --no-verify` flag doesn't exist on this git build; split into
  // --no-commit + manual commit with --no-verify to bypass husky hooks.
  await execAsync(
    `docker exec ${pg.sandboxContainerName} sh -c "cd /workspace/msm-portal && git revert --no-commit ${sha} && git commit --no-verify -m 'Revert ${sha.slice(0, 8)}'"`,
    { timeout: 15_000 },
  );
  const newSha = await execAsync(
    `docker exec ${pg.sandboxContainerName} sh -c "cd /workspace/msm-portal && git rev-parse HEAD"`,
    { timeout: 5_000 },
  );
  pg.headCommitSha = newSha.stdout.trim();
  pg.updatedAt = nowMs();
  pg.lastActivityAt = nowMs();
  persist(pg);
  await signalInvalidate(pg.sandboxContainerName);
  console.log(`[playground] ${id} reverted ${sha.slice(0, 8)} → ${pg.headCommitSha.slice(0, 8)}`);
  return pg;
}

/**
 * Promote (M5): extract `baselineCommitSha..HEAD` as .patch files from the
 * sandbox, then — on the host `msm-portal` clone — create a fresh branch
 * off `origin/main`, `git am` each patch in sequence (skipping any that
 * fail to apply), optionally push to `origin`, and open a PR via `gh`.
 *
 * Options:
 *   - `dryRun`: extract + `git am` locally, but skip `git push` and
 *     `gh pr create`. Leaves the local branch behind so callers can
 *     inspect it; cleanup is the test harness's responsibility.
 *
 * Returns:
 *   {
 *     patches: string[],    // patch filenames extracted from the sandbox
 *     patchesDir: string,   // absolute path on the host where patches live
 *     branch: string,       // newly created branch in host msm-portal
 *     applied: Array<{ file: string, commit: string }>,
 *     skipped: Array<{ file: string, reason: string }>,
 *     prUrl?: string,       // present when push + gh pr create succeeded
 *     dryRun: boolean,
 *   }
 *
 * The playground's `promotedAt`, `promotedBranch`, and (when non-dry-run)
 * `promotedPrUrl` fields are persisted.
 *
 * IMPORTANT: this function writes to a **real** host clone of msm-portal.
 * Husky hooks are bypassed with `--no-verify`; the push and PR steps land
 * on `github.com/moloco/msm-portal` unless `dryRun` is set.
 */
export async function promotePlayground(id, opts = {}) {
  const { dryRun = false } = opts;
  const pg = getPlayground(id);
  if (!pg) throw new Error(`playground not found: ${id}`);
  if (pg.status !== 'active') throw new Error(`playground not active: ${pg.status}`);
  if (pg.checkedOutSha) throw new Error('restore head before promoting');
  if (!pg.baselineCommitSha) throw new Error('playground has no baselineCommitSha');

  // ── Step 1: extract patches from the sandbox container ────────────
  const outDir = path.join(
    new URL('../state/playground-promoted/', import.meta.url).pathname,
    id,
  );
  fs.mkdirSync(outDir, { recursive: true });
  // Wipe any leftovers from a previous promote so the index is clean.
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.patch')) fs.unlinkSync(path.join(outDir, f));
  }

  await execAsync(
    `docker exec ${pg.sandboxContainerName} sh -c "cd /workspace/msm-portal && rm -rf /tmp/pg-promote && mkdir -p /tmp/pg-promote && git format-patch ${pg.baselineCommitSha}..HEAD -o /tmp/pg-promote"`,
    { timeout: 60_000 },
  );
  await execAsync(
    `docker cp ${pg.sandboxContainerName}:/tmp/pg-promote/. ${outDir}/`,
    { timeout: 30_000 },
  );
  const patches = fs
    .readdirSync(outDir)
    .filter((f) => f.endsWith('.patch'))
    .sort();

  if (patches.length === 0) {
    throw new Error(
      `no patches to promote (baseline ${pg.baselineCommitSha.slice(0, 8)}..HEAD is empty)`,
    );
  }

  // ── Step 2: host msm-portal clone — fetch + fresh branch ──────────
  const hostRepo = path.join(SOURCE_WORKSPACE_ROOT, 'msm-portal');
  if (!fs.existsSync(path.join(hostRepo, '.git'))) {
    throw new Error(`host msm-portal not found: ${hostRepo}`);
  }
  const stamp = formatBranchStamp(new Date());
  const branch = `playground-${id}-${stamp}`;

  if (!dryRun) {
    // Real promote: refresh origin/main so patches stack on the latest
    // tip. Must succeed — if the host can't reach origin, pushing won't
    // work either. In dry-run we skip this step and use whatever
    // `origin/main` ref is already cached locally; this keeps dry-runs
    // usable on laptops without git auth set up for `moloco/msm-portal`
    // (e.g. personal `gh` account active vs. SSO account).
    await execFileAsync('git', ['fetch', 'origin', 'main'], {
      cwd: hostRepo,
      timeout: 60_000,
    });
  }
  await execFileAsync('git', ['checkout', '-B', branch, 'origin/main'], {
    cwd: hostRepo,
    timeout: 15_000,
  });

  // ── Step 3: git am each patch, skipping failures ──────────────────
  // `git am` needs a committer identity even though it preserves the
  // author from the patch's `From:` header. Inject stable defaults via
  // `-c user.*` so the host clone works even when no global git identity
  // is configured on the machine. Author info is untouched so the
  // resulting PR still credits whoever wrote the sandbox commit.
  const committerFlags = [
    '-c',
    `user.name=Playground (${pg.createdBy || 'unknown'})`,
    '-c',
    'user.email=playground@moloco.inspect',
  ];
  const applied = [];
  const skipped = [];
  for (const file of patches) {
    const abs = path.join(outDir, file);
    try {
      await execFileAsync(
        'git',
        [...committerFlags, 'am', '--no-verify', abs],
        { cwd: hostRepo, timeout: 30_000 },
      );
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd: hostRepo,
        timeout: 5_000,
      });
      applied.push({ file, commit: stdout.trim() });
    } catch (err) {
      // Abort the half-applied patch so the next one can try clean.
      await execFileAsync('git', ['am', '--abort'], {
        cwd: hostRepo,
        timeout: 10_000,
      }).catch(() => {});
      const reason = String(err.stderr || err.message || err).split('\n').slice(0, 3).join(' | ');
      skipped.push({ file, reason });
      console.warn(`[playground] promote ${id} skipped ${file}: ${reason}`);
    }
  }

  let prUrl;
  if (applied.length === 0) {
    console.warn(`[playground] promote ${id} — every patch failed to apply; skipping push/PR`);
  } else if (!dryRun) {
    // ── Step 4: push branch ─────────────────────────────────────────
    await execFileAsync('git', ['push', '--no-verify', '-u', 'origin', branch], {
      cwd: hostRepo,
      timeout: 120_000,
    });

    // ── Step 5: open PR via gh ──────────────────────────────────────
    const bodyFile = path.join(outDir, 'PR_BODY.md');
    fs.writeFileSync(bodyFile, buildPrBody(pg, { applied, skipped, branch }), 'utf8');
    try {
      const { stdout } = await execFileAsync(
        'gh',
        [
          'pr',
          'create',
          '--base',
          'main',
          '--head',
          branch,
          '--title',
          `Playground: ${pg.title}`,
          '--body-file',
          bodyFile,
        ],
        { cwd: hostRepo, timeout: 60_000 },
      );
      prUrl = stdout.trim().split('\n').find((l) => l.startsWith('http'))?.trim();
    } catch (err) {
      console.warn(`[playground] gh pr create failed for ${id}: ${err.stderr || err.message}`);
    }
  }

  // ── Step 6: persist promote metadata ────────────────────────────────
  pg.promotedAt = nowMs();
  pg.promotedBranch = branch;
  if (prUrl) pg.promotedPrUrl = prUrl;
  pg.lastActivityAt = nowMs();
  persist(pg);

  console.log(
    `[playground] promote ${id} — patches=${patches.length} applied=${applied.length} skipped=${skipped.length} dryRun=${dryRun} branch=${branch}${prUrl ? ` pr=${prUrl}` : ''}`,
  );

  return {
    patches,
    patchesDir: outDir,
    branch,
    applied,
    skipped,
    prUrl,
    dryRun,
  };
}

/** Build a `YYYYMMDD-HHmm` timestamp suffix for promote branch names. */
function formatBranchStamp(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes())
  );
}

/** Compose the GitHub PR body for a promote. */
function buildPrBody(pg, { applied, skipped, branch }) {
  const lines = [];
  lines.push(`# Playground: ${pg.title}`);
  lines.push('');
  lines.push(`- **Playground id:** \`${pg.id}\``);
  if (pg.createdBy) lines.push(`- **Created by:** ${pg.createdBy}`);
  if (pg.prdUrl) lines.push(`- **PRD:** ${pg.prdUrl}`);
  if (pg.jiraUrl) lines.push(`- **Jira:** ${pg.jiraUrl}`);
  lines.push(`- **Branch:** \`${branch}\``);
  lines.push(`- **Local UI:** http://localhost:4180/p/${pg.id}`);
  lines.push('');
  lines.push(`## Applied patches (${applied.length})`);
  if (applied.length === 0) {
    lines.push('_none_');
  } else {
    for (const a of applied) {
      lines.push(`- \`${a.file}\` → \`${a.commit.slice(0, 8)}\``);
    }
  }
  lines.push('');
  lines.push(`## Skipped patches (${skipped.length})`);
  if (skipped.length === 0) {
    lines.push('_none — all patches applied cleanly_');
  } else {
    lines.push('These patches failed `git am` and need manual resolution:');
    for (const s of skipped) {
      lines.push(`- \`${s.file}\` — ${s.reason}`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('_Generated by the Playground (moloco-inspect) M5 promote flow._');
  return lines.join('\n');
}

// ── Startup Reattach ────────────────────────────────────────────────

/**
 * Reconcile persisted Playground state with real Docker state. Called by
 * orchestrator after module load. Any in-memory ports/status become a
 * **projection** of the container's actual state.
 *
 * Transitions:
 *   persisted 'active'      + container running   → keep active, re-query ports
 *   persisted 'active'      + container stopped   → mark 'hibernated'
 *   persisted 'active'      + container missing   → mark 'archived'
 *   persisted 'hibernated'  + container missing   → mark 'archived'
 *   persisted 'archived'                          → unchanged
 */
export async function reattachOnStartup() {
  let touched = 0;
  for (const pg of playgrounds.values()) {
    if (pg.status === 'archived') continue;
    try {
      const { stdout } = await execAsync(
        `docker inspect -f "{{.State.Running}}" ${pg.sandboxContainerName} 2>/dev/null || echo MISSING`,
        { timeout: 5_000 },
      );
      const out = stdout.trim();
      if (out === 'MISSING' || out === '') {
        pg.status = 'archived';
        pg.vitePort = undefined;
        pg.opencodePort = undefined;
        pg.updatedAt = nowMs();
        persist(pg);
        touched++;
        console.log(`[playground] reattach ${pg.id}: container missing → archived`);
        continue;
      }
      if (out === 'true') {
        // Container alive. Re-query ports regardless of previous status.
        const oc = await queryDockerPort(pg.sandboxContainerName, 4096).catch(() => undefined);
        const vt = await queryDockerPort(pg.sandboxContainerName, 5173).catch(() => undefined);
        if (pg.status !== 'active' || pg.opencodePort !== oc || pg.vitePort !== vt) {
          pg.status = 'active';
          pg.opencodePort = oc;
          pg.vitePort = vt;
          pg.updatedAt = nowMs();
          persist(pg);
          touched++;
          console.log(`[playground] reattach ${pg.id}: running (oc=${oc} vite=${vt})`);
        }
      } else if (out === 'false') {
        if (pg.status !== 'hibernated') {
          pg.status = 'hibernated';
          pg.vitePort = undefined;
          pg.opencodePort = undefined;
          pg.hibernatedAt = pg.hibernatedAt ?? nowMs();
          pg.updatedAt = nowMs();
          persist(pg);
          touched++;
          console.log(`[playground] reattach ${pg.id}: stopped → hibernated`);
        }
      }
    } catch (err) {
      console.warn(`[playground] reattach ${pg.id} error:`, err.message);
    }
  }
  if (touched) console.log(`[playground] reattach: reconciled ${touched} playgrounds`);
}

// ── Helpers ─────────────────────────────────────────────────────────

async function queryDockerPort(containerName, internalPort) {
  const { stdout } = await execFileAsync('docker', ['port', containerName, String(internalPort)], {
    timeout: 5_000,
  });
  // "0.0.0.0:55003" → 55003
  const m = stdout.trim().split('\n')[0]?.match(/:(\d+)$/);
  return m ? parseInt(m[1], 10) : undefined;
}

async function waitForHttpOk(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true; // 404 from Vite (no index) still counts as alive
    } catch {
      // connection refused etc.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ── Public convenience: plain JSON shape for API responses ──────────

export function serializePlayground(pg) {
  if (!pg) return null;
  return {
    id: pg.id,
    projectId: pg.projectId,
    title: pg.title,
    status: pg.status,
    gitModel: pg.gitModel,
    baselineCommitSha: pg.baselineCommitSha,
    headCommitSha: pg.headCommitSha,
    workBranch: pg.workBranch,
    baseBranch: pg.baseBranch,
    sandboxContainerName: pg.sandboxContainerName,
    opencodePort: pg.opencodePort,
    vitePort: pg.vitePort,
    imageTag: pg.imageTag,
    client: pg.client,
    checkedOutSha: pg.checkedOutSha,
    prdUrl: pg.prdUrl,
    jiraUrl: pg.jiraUrl,
    hibernatedAt: pg.hibernatedAt,
    createdAt: pg.createdAt,
    updatedAt: pg.updatedAt,
    lastActivityAt: pg.lastActivityAt,
    archivedDiffPath: pg.archivedDiffPath,
    createdBy: pg.createdBy,
    promotedAt: pg.promotedAt,
    promotedBranch: pg.promotedBranch,
    promotedPrUrl: pg.promotedPrUrl,
  };
}
