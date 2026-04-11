import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);

function copyFileWithParents(sourcePath, destinationPath) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

function parseChangedFilesFromDiff(diffText) {
  return Array.from(
    new Set(
      String(diffText || '')
        .split('\n')
        .filter((line) => line.startsWith('diff --git '))
        .map((line) => {
          const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
          return match ? match[2].trim() : null;
        })
        .filter(Boolean)
        .filter((file) => !String(file).startsWith('.omc/')),
    ),
  );
}

export function createMsmPortalProductRunner({ repoRoot, worktreeBase }) {
  const appRelativePath = path.join('js', 'msm-portal-web');
  const sourceAppRoot = path.join(repoRoot, appRelativePath);

  async function listGitPaths(args) {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: repoRoot,
        timeout: 30_000,
        env: { ...process.env },
      });
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async function branchExists(branchName) {
    try {
      await execFileAsync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], {
        cwd: repoRoot,
        timeout: 30_000,
        env: { ...process.env },
      });
      return true;
    } catch {
      return false;
    }
  }

  async function resolveUniqueInspectBranchName(initialBranch) {
    if (!(await branchExists(initialBranch))) {
      return initialBranch;
    }

    for (let index = 1; index <= 20; index += 1) {
      const candidate = `${initialBranch}-${index}`;
      if (!(await branchExists(candidate))) {
        return candidate;
      }
    }

    return `${initialBranch}-${randomUUID().slice(0, 4)}`;
  }

  async function ensureWorktreePathAvailable(worktreePath) {
    if (!fs.existsSync(worktreePath)) {
      return;
    }

    try {
      await execFileAsync('git', ['worktree', 'remove', worktreePath, '--force'], {
        cwd: repoRoot,
        timeout: 60_000,
        env: { ...process.env },
      });
      return;
    } catch {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }
  }

  async function createWorktree({ requestId, initialBranch }) {
    if (!fs.existsSync(worktreeBase)) fs.mkdirSync(worktreeBase, { recursive: true });
    const worktreePath = path.join(worktreeBase, requestId);
    await ensureWorktreePathAvailable(worktreePath);

    const { stdout: currentBranch } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoRoot,
      timeout: 30_000,
      env: { ...process.env },
    });
    const baseBranch = currentBranch.trim();
    const branchName = await resolveUniqueInspectBranchName(initialBranch);

    await execFileAsync('git', ['worktree', 'add', '-b', branchName, worktreePath, baseBranch], {
      cwd: repoRoot,
      timeout: 120_000,
      env: { ...process.env },
    });

    return {
      branchName,
      worktreePath,
      baseBranch,
    };
  }

  async function syncLocalChangesIntoWorktree(worktreePath) {
    const modifiedFiles = await listGitPaths(['diff', '--name-only']);
    const stagedFiles = await listGitPaths(['diff', '--cached', '--name-only']);
    const untrackedFiles = await listGitPaths(['ls-files', '--others', '--exclude-standard']);
    const deletedFiles = new Set([
      ...(await listGitPaths(['diff', '--name-only', '--diff-filter=D'])),
      ...(await listGitPaths(['diff', '--cached', '--name-only', '--diff-filter=D'])),
    ]);

    const filesToCopy = Array.from(
      new Set([...modifiedFiles, ...stagedFiles, ...untrackedFiles]),
    ).filter((relativePath) => !deletedFiles.has(relativePath));

    let copiedCount = 0;
    let removedCount = 0;

    for (const relativePath of deletedFiles) {
      const worktreeTarget = path.join(worktreePath, relativePath);
      if (fs.existsSync(worktreeTarget)) {
        fs.rmSync(worktreeTarget, { recursive: true, force: true });
        removedCount += 1;
      }
    }

    for (const relativePath of filesToCopy) {
      const sourcePath = path.join(repoRoot, relativePath);
      const destinationPath = path.join(worktreePath, relativePath);

      if (!fs.existsSync(sourcePath)) {
        continue;
      }

      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.copyFileSync(sourcePath, destinationPath);
      copiedCount += 1;
    }

    return {
      copiedCount,
      removedCount,
      totalChanged: filesToCopy.length + deletedFiles.size,
    };
  }

  async function commitBaseline(worktreePath) {
    await execFileAsync('git', ['add', '-A'], {
      cwd: worktreePath,
      timeout: 60_000,
      env: { ...process.env },
    });

    const { stdout: statusOutput } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: worktreePath,
      timeout: 30_000,
      env: { ...process.env },
    });

    if (!statusOutput.trim()) {
      return false;
    }

    await execFileAsync(
      'git',
      [
        '-c',
        'user.name=Codex Preview Baseline',
        '-c',
        'user.email=codex-preview@local',
        'commit',
        '-m',
        'chore: sync local workspace baseline',
      ],
      {
        cwd: worktreePath,
        timeout: 60_000,
        env: { ...process.env },
      },
    );

    return true;
  }

  function resolveSafeRepoRelativePath(relativePath) {
    const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const absolutePath = path.resolve(repoRoot, normalized);
    if (!absolutePath.startsWith(repoRoot + path.sep) && absolutePath !== repoRoot) {
      throw new Error(`Refusing to apply path outside repo: ${relativePath}`);
    }
    return { normalized, absolutePath };
  }

  function syncChangedFilesFromWorktree({ requestId, worktreePath, changedFiles, diff = null }) {
    const effectiveChangedFiles = Array.isArray(changedFiles) && changedFiles.length
      ? changedFiles
      : parseChangedFilesFromDiff(diff);

    if (!effectiveChangedFiles.length) {
      throw new Error('No changed files available for file-sync fallback');
    }

    const backupRoot = path.join(repoRoot, '.omc', 'apply-backups', requestId);
    const appliedFiles = [];

    for (const relativeFile of effectiveChangedFiles) {
      const { normalized, absolutePath: localPath } = resolveSafeRepoRelativePath(relativeFile);
      const sourcePath = path.join(worktreePath, normalized);
      const backupPath = path.join(backupRoot, normalized);

      if (fs.existsSync(localPath)) {
        copyFileWithParents(localPath, backupPath);
      }

      if (fs.existsSync(sourcePath)) {
        copyFileWithParents(sourcePath, localPath);
        appliedFiles.push(normalized);
        continue;
      }

      if (fs.existsSync(localPath)) {
        fs.rmSync(localPath, { force: true });
        appliedFiles.push(normalized);
      }
    }

    return { backupRoot, appliedFiles };
  }

  async function applyPatchToLocalRepo({ requestId, worktreePath, diff, changedFiles }) {
    const patchPath = path.join(worktreePath, '.omc', `${requestId}.patch`);
    fs.writeFileSync(patchPath, diff || '', 'utf-8');

    try {
      await execFileAsync('git', ['apply', '--whitespace=nowarn', patchPath], {
        cwd: repoRoot,
        timeout: 120_000,
        env: { ...process.env },
      });
      return { mode: 'direct_apply' };
    } catch {
      try {
        await execFileAsync('git', ['apply', '--3way', patchPath], {
          cwd: repoRoot,
          timeout: 120_000,
          env: { ...process.env },
        });
        return { mode: 'three_way' };
      } catch {
        const fallback = syncChangedFilesFromWorktree({
          requestId,
          worktreePath,
          changedFiles,
          diff,
        });
        return {
          mode: 'file_sync',
          backupRoot: fallback.backupRoot,
          appliedFiles: fallback.appliedFiles,
        };
      }
    }
  }

  async function resetWorktree(worktreePath) {
    await execFileAsync('git', ['checkout', '--', '.'], {
      cwd: worktreePath,
      timeout: 120_000,
      env: { ...process.env },
    });
    await execFileAsync('git', ['clean', '-fd'], {
      cwd: worktreePath,
      timeout: 120_000,
      env: { ...process.env },
    });
  }

  async function removeWorktree(worktreePath) {
    if (!worktreePath || !fs.existsSync(worktreePath)) {
      return;
    }

    try {
      await execFileAsync('git', ['worktree', 'remove', worktreePath, '--force'], {
        cwd: repoRoot,
        timeout: 120_000,
        env: { ...process.env },
      });
    } catch {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }
  }

  async function runTypecheck({ worktreePath }) {
    const worktreeAppRoot = path.join(worktreePath, appRelativePath);
    const tsconfigPath = path.join(worktreeAppRoot, 'tsconfig.json');

    await execFileAsync('pnpm', ['exec', 'tsc', '--noEmit', '-p', tsconfigPath], {
      cwd: sourceAppRoot,
      timeout: 300_000,
      env: { ...process.env, COREPACK_ENABLE_AUTO_PIN: '0' },
    });
  }

  return {
    id: 'msm-portal',
    repoRoot,
    worktreeBase,
    createWorktree,
    syncLocalChangesIntoWorktree,
    commitBaseline,
    resolveSafeRepoRelativePath,
    syncChangedFilesFromWorktree,
    applyPatchToLocalRepo,
    resetWorktree,
    removeWorktree,
    runTypecheck,
  };
}
