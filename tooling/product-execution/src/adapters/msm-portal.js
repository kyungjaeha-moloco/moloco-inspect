import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { createPreviewAdapter } from '../../../preview-kit/src/index.js';
import { createProductRunner } from '../../../product-runner/src/index.js';

function getChangeIntent(payload) {
  return payload?.requestContract?.change_intent || 'layout_adjustment';
}

function isCopyChangeRequest(payload) {
  return getChangeIntent(payload) === 'copy_update';
}

function extractTranslationNamespacesFromFile(worktreePath, relativeFile) {
  if (!relativeFile) return [];

  const absolutePath = path.join(worktreePath, relativeFile);
  if (!fs.existsSync(absolutePath)) return [];
  const source = fs.readFileSync(absolutePath, 'utf8');
  const matches = Array.from(source.matchAll(/useTranslation\(\s*['"`]([^'"`]+)['"`]\s*\)/g));
  return Array.from(new Set(matches.map((match) => match[1]).filter(Boolean)));
}

async function getAvailablePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate preview port')));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForServerReady(url, getEarlyError, timeoutMs = 45_000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    const earlyError = typeof getEarlyError === 'function' ? getEarlyError() : null;
    if (earlyError) {
      throw earlyError;
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok || response.status === 302 || response.status === 404) {
        return;
      }
      lastError = new Error(`Server responded with status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw lastError || new Error(`Timed out waiting for preview server at ${url}`);
}

export function createMsmPortalProductExecution({ repoRoot, worktreeBase }) {
  const previewAdapter = createPreviewAdapter('msm-portal');
  const productRunner = createProductRunner('msm-portal', { repoRoot, worktreeBase });

  function getPreviewRuntimeConfig(worktreePath) {
    return previewAdapter.createRuntimeConfig({
      repoRoot: productRunner.repoRoot,
      worktreePath,
    });
  }

  function getPreviewContext(payload) {
    const client = payload?.client || payload?.requestContract?.target?.client || 'msm-default';
    return previewAdapter.buildPreviewContext({ payload, client });
  }

  function shouldRunBuild({ payload, changedFiles }) {
    if (!changedFiles.some((file) => previewAdapter.isProductFile(file))) {
      return false;
    }

    const expectations = Array.isArray(payload?.requestContract?.validation_expectations)
      ? payload.requestContract.validation_expectations
      : [];
    if (expectations.includes('build') || expectations.includes('product_build')) {
      return true;
    }

    return changedFiles.some((file) =>
      /\/src\/(app-builder\/route|route\/|apps\/[^/]+\/page\/|apps\/[^/]+\/config\/layout)/.test(file),
    );
  }

  function shouldRunTests({ payload, changedFiles }) {
    if (!changedFiles.some((file) => previewAdapter.isProductFile(file))) {
      return false;
    }

    const expectations = Array.isArray(payload?.requestContract?.validation_expectations)
      ? payload.requestContract.validation_expectations
      : [];
    if (expectations.includes('test') || expectations.includes('tests') || expectations.includes('product_test')) {
      return true;
    }

    return changedFiles.some((file) => /\.(test|spec)\.(ts|tsx)$/.test(file));
  }

  function collectCopyChangeContext({ payload, changedFiles, worktreePath }) {
    const targetFile =
      payload?.requestContract?.target?.selection_context?.source_file ||
      payload?.file ||
      null;
    const namespaces = extractTranslationNamespacesFromFile(worktreePath, targetFile);
    const { localeFiles, changedEntries } = productRunner.collectLocaleStringChanges({
      worktreePath,
      changedFiles,
    });

    const namespaceChanges = namespaces.length
      ? changedEntries.filter((entry) =>
          namespaces.some((namespace) => entry.path === namespace || entry.path.startsWith(`${namespace}.`)),
        )
      : [];

    const visibleTextCandidates = Array.from(
      new Set(
        namespaceChanges
          .map((entry) => String(entry.after || '').trim())
          .filter(Boolean),
      ),
    );

    return {
      targetFile,
      namespaces,
      localeFiles,
      changedEntries,
      namespaceChanges,
      visibleTextCandidates,
    };
  }

  function verifyCopyNamespaceAlignment({ payload, changedFiles, worktreePath }) {
    if (!isCopyChangeRequest(payload)) {
      return { ok: true, message: 'Copy verification skipped (intent is not copy_update)' };
    }

    const context = collectCopyChangeContext({ payload, changedFiles, worktreePath });

    if (!context.targetFile) {
      return {
        ok: true,
        message: 'Copy namespace verification skipped (no source file hint available)',
        context,
      };
    }

    if (!context.namespaces.length) {
      return {
        ok: true,
        message: 'Copy namespace verification skipped (target file has no explicit useTranslation namespace)',
        context,
      };
    }

    if (!context.localeFiles.length) {
      return {
        ok: true,
        message: `Copy namespace verification passed (no locale assets changed; target namespaces: ${context.namespaces.join(', ')})`,
        context,
      };
    }

    if (!context.namespaceChanges.length) {
      return {
        ok: false,
        message: `Copy namespace verification failed: locale changes did not touch namespaces used by ${path.basename(context.targetFile)} (${context.namespaces.join(', ')})`,
        context,
      };
    }

    return {
      ok: true,
      message: `Copy namespace verification passed for ${context.namespaces.join(', ')}`,
      context,
    };
  }

  async function verifyCopyVisibleOnRoute({ payload, previewUrl, worktreePath, visibleTextCandidates }) {
    if (!isCopyChangeRequest(payload)) {
      return { ok: true, message: 'Copy visibility verification skipped (intent is not copy_update)' };
    }

    return await previewAdapter.verifyCopyVisible({
      runtimeConfig: getPreviewRuntimeConfig(worktreePath),
      previewUrl,
      expectedLanguage: getPreviewContext(payload).language || '',
      candidates: visibleTextCandidates,
    });
  }

  function ensureWorktreeNodeModules(worktreePath) {
    const runtimeConfig = getPreviewRuntimeConfig(worktreePath);
    const worktreeNodeModules = runtimeConfig.worktreeNodeModulesPath;
    const sourceNodeModules = runtimeConfig.sourceNodeModulesPath;

    if (fs.existsSync(worktreeNodeModules)) {
      return;
    }

    fs.symlinkSync(sourceNodeModules, worktreeNodeModules, process.platform === 'win32' ? 'junction' : 'dir');
  }

  async function capturePreviewScreenshot({ id, worktreePath, payload, screenshotsDir }) {
    const previewContext = getPreviewContext(payload);
    const runtimeConfig = getPreviewRuntimeConfig(worktreePath);
    const client = previewContext.client;
    const expectedLanguage = previewContext.language;
    const route = previewContext.bootstrapRoute;
    const previewMode = 'test';
    const port = await getAvailablePort();
    const screenshotPath = path.join(screenshotsDir, `${id}.png`);
    const previewUrl = `http://127.0.0.1:${port}${route}`;
    ensureWorktreeNodeModules(worktreePath);

    const previewServer = spawn(
      'pnpm',
      [
        'exec',
        'vite',
        '--mode',
        previewMode,
        '--host',
        '127.0.0.1',
        '--strictPort',
        '--port',
        String(port),
        '--config',
        runtimeConfig.viteConfigPath,
      ],
      {
        cwd: runtimeConfig.worktreeAppRoot,
        env: {
          ...process.env,
          CLIENT: client,
          MODE: previewMode,
          PORT: String(port),
          COREPACK_ENABLE_AUTO_PIN: '0',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let serverLogs = '';
    let previewExitError = null;
    const collectServerLog = (chunk) => {
      serverLogs += chunk.toString();
      serverLogs = serverLogs.slice(-4000);
    };

    previewServer.stdout.on('data', collectServerLog);
    previewServer.stderr.on('data', collectServerLog);
    previewServer.on('close', (code, signal) => {
      if (code === 0 || signal === 'SIGTERM' || signal === 'SIGKILL') {
        return;
      }
      previewExitError = new Error(`Preview server exited early with code ${code ?? 'unknown'}`);
    });

    try {
      await waitForServerReady(`http://127.0.0.1:${port}/`, () => previewExitError);
      const { stdout } = await previewAdapter.captureScreenshot({
        runtimeConfig,
        previewUrl,
        outputPath: screenshotPath,
        expectedLanguage,
      });

      const screenshotCaptured = stdout?.trim() || screenshotPath;
      return {
        previewServer,
        previewUrl,
        screenshotPath: screenshotCaptured,
      };
    } catch (error) {
      try {
        previewServer.kill('SIGTERM');
      } catch {
        // ignore cleanup failure
      }
      const extra = serverLogs ? `\nPreview server logs:\n${serverLogs}` : '';
      throw new Error(`${error.message}${extra}`);
    }
  }

  async function verifyRoute({ previewUrl, worktreePath, payload }) {
    const previewContext = getPreviewContext(payload);
    return await previewAdapter.verifyRoute({
      runtimeConfig: getPreviewRuntimeConfig(worktreePath),
      previewUrl,
      expectedLanguage: previewContext.language,
      client: previewContext.client,
    });
  }

  return {
    id: 'msm-portal',
    repoRoot: productRunner.repoRoot,
    worktreeBase: productRunner.worktreeBase,
    isProductFile: previewAdapter.isProductFile,
    isProductSourceFile: previewAdapter.isProductSourceFile,
    createWorktree: productRunner.createWorktree,
    syncLocalChangesIntoWorktree: productRunner.syncLocalChangesIntoWorktree,
    commitBaseline: productRunner.commitBaseline,
    resolveSafeRepoRelativePath: productRunner.resolveSafeRepoRelativePath,
    applyPatchToLocalRepo: productRunner.applyPatchToLocalRepo,
    resetWorktree: productRunner.resetWorktree,
    removeWorktree: productRunner.removeWorktree,
    runTypecheck: productRunner.runTypecheck,
    runBuild: productRunner.runBuild,
    runTests: productRunner.runTests,
    getPreviewContext,
    getPreviewRuntimeConfig,
    shouldRunBuild,
    shouldRunTests,
    verifyCopyNamespaceAlignment,
    verifyCopyVisibleOnRoute,
    capturePreviewScreenshot,
    verifyRoute,
  };
}
