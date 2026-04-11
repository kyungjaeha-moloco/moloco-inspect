import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createMsmPortalProductRunner,
  createProductRunner,
} from '../src/index.js';

function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'moloco-inspect-runner-'));
}

test('factory creates msm portal runner with expected contract surface', () => {
  const repoRoot = createTempRepo();
  const runner = createProductRunner('msm-portal', {
    repoRoot,
    worktreeBase: path.join(repoRoot, '.worktrees'),
  });

  assert.equal(runner.id, 'msm-portal');
  assert.equal(typeof runner.createWorktree, 'function');
  assert.equal(typeof runner.runTypecheck, 'function');
  assert.equal(typeof runner.runBuild, 'function');
  assert.equal(typeof runner.runTests, 'function');
  assert.equal(typeof runner.collectLocaleStringChanges, 'function');
});

test('resolveSafeRepoRelativePath normalizes unsafe prefixes back into repo scope', () => {
  const repoRoot = createTempRepo();
  const runner = createMsmPortalProductRunner({
    repoRoot,
    worktreeBase: path.join(repoRoot, '.worktrees'),
  });

  const safe = runner.resolveSafeRepoRelativePath('js/msm-portal-web/src/common/foo.tsx');
  assert.equal(safe.normalized, path.normalize('js/msm-portal-web/src/common/foo.tsx'));
  assert.equal(safe.absolutePath, path.join(repoRoot, 'js/msm-portal-web/src/common/foo.tsx'));

  const sanitized = runner.resolveSafeRepoRelativePath('../../outside.txt');
  assert.equal(sanitized.normalized, 'outside.txt');
  assert.equal(sanitized.absolutePath, path.join(repoRoot, 'outside.txt'));
});

test('collectLocaleStringChanges compares source repo and worktree locale assets', () => {
  const repoRoot = createTempRepo();
  const worktreePath = path.join(repoRoot, '.worktrees', 'req-1');
  const relativeFile = path.join('js', 'msm-portal-web', 'src', 'i18n', 'assets', 'ko', 'sot-resource.json');
  const sourceFile = path.join(repoRoot, relativeFile);
  const worktreeFile = path.join(worktreePath, relativeFile);

  fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
  fs.mkdirSync(path.dirname(worktreeFile), { recursive: true });

  fs.writeFileSync(
    sourceFile,
    JSON.stringify({
      auth: {
        form: {
          signIn: {
            buttons: {
              submit: '로그인',
            },
          },
        },
      },
    }),
    'utf8',
  );

  fs.writeFileSync(
    worktreeFile,
    JSON.stringify({
      auth: {
        form: {
          signIn: {
            buttons: {
              submit: '로그인 하기',
            },
          },
        },
      },
    }),
    'utf8',
  );

  const runner = createMsmPortalProductRunner({
    repoRoot,
    worktreeBase: path.join(repoRoot, '.worktrees'),
  });

  const result = runner.collectLocaleStringChanges({
    worktreePath,
    changedFiles: [relativeFile],
  });

  assert.deepEqual(result.localeFiles, [relativeFile]);
  assert.equal(result.changedEntries.length, 1);
  assert.equal(result.changedEntries[0].file, relativeFile);
  assert.equal(result.changedEntries[0].path, 'auth.form.signIn.buttons.submit');
  assert.equal(result.changedEntries[0].before, '로그인');
  assert.equal(result.changedEntries[0].after, '로그인 하기');
});
