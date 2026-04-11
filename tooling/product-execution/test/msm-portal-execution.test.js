import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createMsmPortalProductExecution,
  createProductExecution,
} from '../src/index.js';

function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'moloco-inspect-execution-'));
}

function writeFile(targetPath, contents) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, contents, 'utf8');
}

test('factory creates msm portal execution adapter with expected surface', () => {
  const repoRoot = createTempRepo();
  const execution = createProductExecution('msm-portal', {
    repoRoot,
    worktreeBase: path.join(repoRoot, '.worktrees'),
  });

  assert.equal(execution.id, 'msm-portal');
  assert.equal(typeof execution.getPreviewContext, 'function');
  assert.equal(typeof execution.shouldRunBuild, 'function');
  assert.equal(typeof execution.shouldRunTests, 'function');
  assert.equal(typeof execution.verifyCopyNamespaceAlignment, 'function');
  assert.equal(typeof execution.getAnalyticsMetadata, 'function');
});

test('execution adapter derives build and test policy from expectations and changed files', () => {
  const repoRoot = createTempRepo();
  const execution = createMsmPortalProductExecution({
    repoRoot,
    worktreeBase: path.join(repoRoot, '.worktrees'),
  });

  const routeFile = 'js/msm-portal-web/src/apps/tving/page/order/MCOrderPage.tsx';
  const componentFile = 'js/msm-portal-web/src/common/component/auth/form/sign-in/MCSignInForm.tsx';
  const testFile = 'js/msm-portal-web/src/common/component/auth/form/sign-in/MCSignInForm.test.tsx';

  assert.equal(
    execution.shouldRunBuild({ payload: { requestContract: {} }, changedFiles: [routeFile] }),
    true,
  );
  assert.equal(
    execution.shouldRunBuild({
      payload: { requestContract: { validation_expectations: ['product_build'] } },
      changedFiles: [componentFile],
    }),
    true,
  );
  assert.equal(
    execution.shouldRunBuild({ payload: { requestContract: {} }, changedFiles: [componentFile] }),
    false,
  );

  assert.equal(
    execution.shouldRunTests({ payload: { requestContract: {} }, changedFiles: [testFile] }),
    true,
  );
  assert.equal(
    execution.shouldRunTests({
      payload: { requestContract: { validation_expectations: ['tests'] } },
      changedFiles: [componentFile],
    }),
    true,
  );
  assert.equal(
    execution.shouldRunTests({ payload: { requestContract: {} }, changedFiles: [componentFile] }),
    false,
  );
});

test('execution adapter verifies copy namespace alignment using target source file namespace', () => {
  const repoRoot = createTempRepo();
  const worktreePath = path.join(repoRoot, '.worktrees', 'req-2');
  const localeFile = path.join('js', 'msm-portal-web', 'src', 'i18n', 'assets', 'ko', 'sot-resource.json');
  const targetFile = path.join('js', 'msm-portal-web', 'src', 'common', 'component', 'auth', 'form', 'sign-in', 'MCSignInForm.tsx');

  writeFile(
    path.join(repoRoot, localeFile),
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
  );
  writeFile(
    path.join(worktreePath, localeFile),
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
  );
  writeFile(
    path.join(worktreePath, targetFile),
    "const { t } = useTranslation('auth.form.signIn');\nexport const Demo = () => t('buttons.submit');\n",
  );

  const execution = createMsmPortalProductExecution({
    repoRoot,
    worktreeBase: path.join(repoRoot, '.worktrees'),
  });

  const result = execution.verifyCopyNamespaceAlignment({
    payload: {
      userPrompt: '로그인 버튼 문구를 바꿔줘',
      requestContract: {
        change_intent: 'copy_update',
        target: {
          selection_context: {
            source_file: targetFile,
          },
        },
      },
    },
    changedFiles: [localeFile],
    worktreePath,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.context?.namespaces, ['auth.form.signIn']);
  assert.equal(result.context?.visibleTextCandidates[0], '로그인 하기');
});

test('execution adapter exposes analytics metadata for dashboard drill-down', () => {
  const repoRoot = createTempRepo();
  const worktreeBase = path.join(repoRoot, '.worktrees');
  const execution = createMsmPortalProductExecution({ repoRoot, worktreeBase });

  assert.deepEqual(execution.getAnalyticsMetadata(), {
    layer: 'product-execution',
    productId: 'msm-portal',
    previewAdapterId: 'msm-portal',
    productRunnerId: 'msm-portal',
    repoRoot,
    worktreeBase,
  });
});
