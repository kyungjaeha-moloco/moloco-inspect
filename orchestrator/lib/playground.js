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
  console.log(`[playground] ${id} restored head on ${pg.workBranch}`);
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
  console.log(`[playground] ${id} reverted ${sha.slice(0, 8)} → ${pg.headCommitSha.slice(0, 8)}`);
  return pg;
}

/**
 * Promote (M1b skeleton): export `baselineCommitSha..HEAD` as .patch files to
 * `state/playground-promoted/<id>/`. Full host-msm-portal rebase + PR creation
 * is scheduled for M5. Returns `{ patches, dir }`.
 */
export async function promotePlayground(id) {
  const pg = getPlayground(id);
  if (!pg) throw new Error(`playground not found: ${id}`);
  if (pg.status !== 'active') throw new Error(`playground not active: ${pg.status}`);
  if (pg.checkedOutSha) throw new Error('restore head before promoting');

  const outDir = path.join(
    new URL('../state/playground-promoted/', import.meta.url).pathname,
    id,
  );
  fs.mkdirSync(outDir, { recursive: true });

  await execAsync(
    `docker exec ${pg.sandboxContainerName} sh -c "cd /workspace/msm-portal && rm -rf /tmp/pg-promote && mkdir -p /tmp/pg-promote && git format-patch ${pg.baselineCommitSha}..HEAD -o /tmp/pg-promote"`,
    { timeout: 30_000 },
  );
  await execAsync(
    `docker cp ${pg.sandboxContainerName}:/tmp/pg-promote/. ${outDir}/`,
    { timeout: 30_000 },
  );
  const patches = fs
    .readdirSync(outDir)
    .filter((f) => f.endsWith('.patch'))
    .sort();
  console.log(`[playground] ${id} promoted — ${patches.length} patches → ${outDir}`);
  pg.lastActivityAt = nowMs();
  persist(pg);
  return { patches, dir: outDir };
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
  };
}
