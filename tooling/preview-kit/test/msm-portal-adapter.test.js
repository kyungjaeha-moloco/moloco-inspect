import test from 'node:test';
import assert from 'node:assert/strict';

import { createPreviewAdapter } from '../src/index.js';

const adapter = createPreviewAdapter('msm-portal');

test('msm adapter builds runtime config from repo and worktree roots', () => {
  const runtimeConfig = adapter.createRuntimeConfig({
    repoRoot: '/workspace/source/msm-portal',
    worktreePath: '/workspace/runs/worktree-1',
  });

  assert.equal(runtimeConfig.productId, 'msm-portal');
  assert.equal(runtimeConfig.productFilePrefix, 'js/msm-portal-web/');
  assert.equal(runtimeConfig.productSourcePrefix, 'js/msm-portal-web/src/');
  assert.equal(runtimeConfig.sourceAppRoot, '/workspace/source/msm-portal/js/msm-portal-web');
  assert.equal(runtimeConfig.worktreeAppRoot, '/workspace/runs/worktree-1/js/msm-portal-web');
  assert.equal(runtimeConfig.viteConfigPath, '/workspace/runs/worktree-1/js/msm-portal-web/vite.config.ts');
  assert.equal(runtimeConfig.tsconfigPath, '/workspace/runs/worktree-1/js/msm-portal-web/tsconfig.json');
  assert.equal(runtimeConfig.e2eScripts.screenshot, '/workspace/source/msm-portal/js/msm-portal-web/e2e/screenshot-util.ts');
});

test('msm adapter builds preview context with target route, client, language, and workplace', () => {
  const context = adapter.buildPreviewContext({
    client: 'tving',
    payload: {
      pageUrl: 'http://localhost:8001/v1/p/TVING_OMS/oms/order?type=available',
      language: 'ko',
    },
  });

  assert.equal(context.client, 'tving');
  assert.equal(context.language, 'ko');
  assert.equal(context.targetRoute, '/v1/p/TVING_OMS/oms/order?type=available&lng=ko');
  assert.equal(context.workplaceId, 'TVING_OMS');
  assert.match(context.bootstrapRoute, /^\/__codex\/preview-bootstrap\?/);
  assert.match(context.bootstrapRoute, /target=%2Fv1%2Fp%2FTVING_OMS%2Foms%2Forder%3Ftype%3Davailable%26lng%3Dko/);
  assert.match(context.bootstrapRoute, /workplaceId=TVING_OMS/);
  assert.match(context.bootstrapRoute, /lng=ko/);
  assert.match(context.bootstrapRoute, /client=tving/);
});

test('msm adapter falls back to explicit pagePath and keeps route classifiers consistent', () => {
  const context = adapter.buildPreviewContext({
    payload: {
      pagePath: '/sign-in',
    },
  });

  assert.equal(context.targetRoute, '/sign-in');
  assert.equal(context.workplaceId, null);
  assert.equal(adapter.isProductFile('js/msm-portal-web/src/common/foo.tsx'), true);
  assert.equal(adapter.isProductFile('docs/foo.md'), false);
  assert.equal(adapter.isProductSourceFile('js/msm-portal-web/src/common/foo.tsx'), true);
  assert.equal(adapter.isProductSourceFile('js/msm-portal-web/e2e/foo.ts'), false);
});
