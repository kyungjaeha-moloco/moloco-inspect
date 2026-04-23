/**
 * Playground lifecycle integration tests (v3 §8.5).
 *
 * These exercise the real orchestrator HTTP API against real Docker
 * containers. No mocks. Run locally — the handoff explicitly punts CI
 * setup to Phase 2.
 *
 *   1. Start the orchestrator:  cd orchestrator && pnpm start
 *   2. Run these tests:         node --test test/lifecycle.test.js
 *
 * The harness labels every test playground with an `_lifecycle-` prefix
 * in the title and tears them down in `after()` so reruns don't pile up
 * orphaned containers.
 *
 * The v3 spec calls for 7 scenarios; we implement the four that can run
 * without live-agent API calls (create, checkout, revert, archive). The
 * other three (sequential change-requests, concurrent queue, orchestrator
 * kill+restart mid-execution) are listed as TODOs — they need a real
 * provider key and significantly more runtime, so they belong in a
 * gated suite (`--test-only <tag>`) rather than the default run.
 */

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ORCHESTRATOR_URL = process.env.ORCH_URL ?? 'http://localhost:3847';
const TEST_TIMEOUT_MS = 180_000; // 3 minutes per test — Vite cold boot ~10-15s
const TEST_TITLE_PREFIX = '_lifecycle-';

const DEFAULT_PROJECT_ID = process.env.LIFECYCLE_PROJECT_ID ?? 'visual-demo';
// The orchestrator reads the provider key from its own env (see
// server.js POST /api/playground handler); clients only send
// {projectId, title, prdUrl?, jiraUrl?}. These tests therefore only
// require the orchestrator to have ANTHROPIC_API_KEY (or its configured
// provider key) set — the test runner itself doesn't touch the key.

// ─── HTTP helpers ────────────────────────────────────────────────────

async function getJson(path) {
  const res = await fetch(ORCHESTRATOR_URL + path);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return await res.json();
}

async function postJson(path, body) {
  const res = await fetch(ORCHESTRATOR_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${text}`);
  return json;
}

// ─── Docker helpers ──────────────────────────────────────────────────

async function dockerExec(container, cmd) {
  const { stdout } = await execFileAsync(
    'docker',
    ['exec', container, 'sh', '-c', cmd],
    { timeout: 30_000 },
  );
  return stdout.trim();
}

async function containerExists(name) {
  try {
    const { stdout } = await execFileAsync('docker', [
      'inspect',
      '--format',
      '{{.Name}}',
      name,
    ]);
    return stdout.trim().replace(/^\//, '') === name;
  } catch {
    return false;
  }
}

// ─── Polling ─────────────────────────────────────────────────────────

async function waitFor(label, predicate, timeoutMs = 30_000, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const ok = await predicate();
      if (ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `waitFor(${label}) timed out after ${timeoutMs}ms${lastErr ? ` — last error: ${lastErr.message}` : ''}`,
  );
}

// ─── Playground helpers ──────────────────────────────────────────────

async function createTestPlayground(tag) {
  const res = await postJson('/api/playground', {
    projectId: DEFAULT_PROJECT_ID,
    title: TEST_TITLE_PREFIX + tag + '-' + Math.random().toString(36).slice(2, 6),
  });
  if (!res?.playground?.id) {
    throw new Error(
      `POST /api/playground returned unexpected shape: ${JSON.stringify(res)}`,
    );
  }
  return res.playground;
}

async function archivePlayground(id) {
  try {
    await postJson(`/api/playground/${id}/archive`, {});
  } catch (err) {
    console.warn(`[lifecycle] archive ${id} failed: ${err.message}`);
  }
}

// Track created playgrounds for after() cleanup.
const createdPlaygroundIds = new Set();

async function cleanupAll() {
  for (const id of createdPlaygroundIds) {
    await archivePlayground(id);
  }
  createdPlaygroundIds.clear();
}

// ─── Preflight — orchestrator must be running ────────────────────────

before(async () => {
  const health = await getJson('/api/health').catch(() => null);
  if (!health?.ok) {
    throw new Error(
      `Orchestrator not reachable at ${ORCHESTRATOR_URL}. Start it with: cd orchestrator && pnpm start`,
    );
  }
});

after(async () => {
  await cleanupAll();
});

// ─── Scenario 1 — create + boot + Vite ready ─────────────────────────

describe('Playground lifecycle', () => {
  test(
    '1. create → container boots → Vite ready',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const pg = await createTestPlayground('boot');
      createdPlaygroundIds.add(pg.id);

      assert.equal(pg.status, 'active', 'freshly-created playground should be active');
      assert.ok(pg.sandboxContainerName, 'sandboxContainerName should be set');
      assert.ok(
        await containerExists(pg.sandboxContainerName),
        'docker container should exist',
      );

      // Vite is started by the orchestrator right after create — in the
      // supervisor-based image it's `supervisorctl start vite` + HTTP
      // polling. Give it a generous budget: first-boot transpile is slow.
      await waitFor(
        'vite ready',
        async () => {
          const fresh = await getJson(`/api/playground/${pg.id}`);
          if (!fresh.playground?.vitePort) return false;
          const res = await fetch(`http://127.0.0.1:${fresh.playground.vitePort}/`);
          return res.status < 500;
        },
        120_000,
      );
    },
  );

  // ─── Scenario 5 — git checkout <sha> + restore-head ──────────────────

  test(
    '5. checkout past sha moves HEAD, then restore returns to tip',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const pg = await createTestPlayground('checkout');
      createdPlaygroundIds.add(pg.id);

      // Synthesize two commits on the workBranch by touching files
      // directly inside the container. Skips the agent pipeline while
      // still exercising the real git state the lifecycle API manages.
      const container = pg.sandboxContainerName;
      const baseline = pg.baselineCommitSha;

      await dockerExec(
        container,
        `cd /workspace/msm-portal && echo '// test-1' >> README.md && git add -A && git commit --no-verify -m 'test-1'`,
      );
      const sha1 = await dockerExec(
        container,
        'cd /workspace/msm-portal && git rev-parse HEAD',
      );
      await dockerExec(
        container,
        `cd /workspace/msm-portal && echo '// test-2' >> README.md && git add -A && git commit --no-verify -m 'test-2'`,
      );
      const tip = await dockerExec(
        container,
        'cd /workspace/msm-portal && git rev-parse HEAD',
      );
      assert.notEqual(sha1, tip, 'two synthetic commits should have distinct SHAs');
      assert.notEqual(baseline, sha1, 'first commit must diverge from baseline');

      // Checkout back to sha1 via the orchestrator API.
      await postJson(`/api/playground/${pg.id}/checkout`, { sha: sha1 });
      const afterCheckout = await dockerExec(
        container,
        'cd /workspace/msm-portal && git rev-parse HEAD',
      );
      assert.equal(afterCheckout, sha1, 'HEAD should land on requested sha');

      // Restore to the work branch tip.
      await postJson(`/api/playground/${pg.id}/restore-head`, {});
      const afterRestore = await dockerExec(
        container,
        'cd /workspace/msm-portal && git rev-parse HEAD',
      );
      assert.equal(afterRestore, tip, 'restore-head should return to branch tip');
    },
  );

  // ─── Scenario 6 — git revert <sha> adds a revert commit ──────────────

  test(
    '6. revert sha adds a revert commit on top of HEAD',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const pg = await createTestPlayground('revert');
      createdPlaygroundIds.add(pg.id);

      const container = pg.sandboxContainerName;
      await dockerExec(
        container,
        `cd /workspace/msm-portal && echo '// revert-target' >> README.md && git add -A && git commit --no-verify -m 'target'`,
      );
      const target = await dockerExec(
        container,
        'cd /workspace/msm-portal && git rev-parse HEAD',
      );

      await postJson(`/api/playground/${pg.id}/revert`, { sha: target });

      const count = await dockerExec(
        container,
        `cd /workspace/msm-portal && git rev-list --count ${pg.baselineCommitSha}..HEAD`,
      );
      assert.ok(
        Number(count) >= 2,
        `expected at least target + revert commits above baseline, got ${count}`,
      );
      const lastMsg = await dockerExec(
        container,
        'cd /workspace/msm-portal && git log -1 --format=%s',
      );
      // lib/playground.js revert commit message starts with 'Revert '
      assert.match(lastMsg, /^Revert /, 'most recent commit should be a revert');
    },
  );

  // ─── Scenario 7 — archive writes patches + removes container ─────────

  test(
    '7. archive writes patch set and removes container',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const pg = await createTestPlayground('archive');
      // not added to cleanup set — this test IS the cleanup
      const container = pg.sandboxContainerName;

      // Synth one commit so there's something to patch-format.
      await dockerExec(
        container,
        `cd /workspace/msm-portal && echo '// archive-me' >> README.md && git add -A && git commit --no-verify -m 'archive-me'`,
      );

      await postJson(`/api/playground/${pg.id}/archive`, {});

      await waitFor(
        'container removed',
        async () => !(await containerExists(container)),
        30_000,
      );

      const after = await getJson(`/api/playground/${pg.id}`).catch(() => null);
      assert.ok(
        !after || after.playground?.status === 'archived',
        'playground status should be archived (or record removed)',
      );
    },
  );

  // ─── Scenario 8 — dry-run promote extracts + applies patches locally ─

  test(
    '8. promote(dryRun) extracts patches and applies them to host clone',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const pg = await createTestPlayground('promote');
      createdPlaygroundIds.add(pg.id);

      const container = pg.sandboxContainerName;
      // One deterministic commit so format-patch produces exactly one file.
      await dockerExec(
        container,
        `cd /workspace/msm-portal && echo '// promote-${pg.id}' >> README.md && git add -A && git commit --no-verify -m 'promote-test ${pg.id}'`,
      );

      const result = await postJson(`/api/playground/${pg.id}/promote`, {
        dryRun: true,
      });

      assert.ok(result.ok, 'response.ok should be true');
      assert.equal(result.dryRun, true, 'dryRun flag should round-trip');
      assert.ok(
        Array.isArray(result.patches) && result.patches.length >= 1,
        `expected at least 1 patch, got ${result.patches?.length}`,
      );
      assert.ok(
        Array.isArray(result.applied) && result.applied.length === result.patches.length,
        `expected all patches applied cleanly — got applied=${result.applied?.length}/${result.patches?.length} skipped=${result.skipped?.length}`,
      );
      assert.equal(
        result.skipped?.length ?? 0,
        0,
        `expected no skipped patches, got ${JSON.stringify(result.skipped)}`,
      );
      assert.equal(result.prUrl, undefined, 'dryRun should not produce a PR');
      assert.match(
        result.branch,
        new RegExp(`^playground-${pg.id}-\\d{8}-\\d{4}$`),
        `branch name should match playground-<id>-<YYYYMMDD-HHmm>, got ${result.branch}`,
      );

      // Verify the branch exists locally in host msm-portal, then clean up.
      const hostRepo = process.env.SOURCE_WORKSPACE_ROOT
        ? `${process.env.SOURCE_WORKSPACE_ROOT}/msm-portal`
        : '/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal';
      const branches = await execFileAsync(
        'git',
        ['branch', '--list', result.branch],
        { cwd: hostRepo, timeout: 10_000 },
      );
      assert.ok(
        branches.stdout.includes(result.branch),
        `branch ${result.branch} should exist in ${hostRepo}; got: ${branches.stdout}`,
      );
      try {
        // Leave main as the active branch so we don't strand the test on
        // a promote branch that's about to be deleted.
        await execFileAsync('git', ['checkout', '-q', 'main'], {
          cwd: hostRepo,
          timeout: 10_000,
        });
        await execFileAsync('git', ['branch', '-D', result.branch], {
          cwd: hostRepo,
          timeout: 10_000,
        });
      } catch (err) {
        console.warn(`[lifecycle] promote cleanup warning: ${err.message}`);
      }

      // Playground metadata should reflect the promote on the server side.
      const fresh = await getJson(`/api/playground/${pg.id}`);
      assert.equal(
        fresh.playground?.promotedBranch,
        result.branch,
        'playground.promotedBranch should persist',
      );
      assert.equal(
        fresh.playground?.promotedPrUrl,
        undefined,
        'dry-run should not persist a promotedPrUrl',
      );
    },
  );

  // ─── TODO: scenarios 2, 3, 4 (require live agent) ────────────────────
  //
  // 2. Three sequential change-requests → commits land, HEAD advances
  // 3. Two concurrent change-requests → queue holds #2 until #1 lands
  // 4. Orchestrator kill + restart mid-execution → resume succeeds
  //
  // These need a provider API key with real quota and take ~3-5 min per
  // run. Add them behind `--test-only live` when we build a staged CI.
});
