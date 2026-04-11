import path from 'node:path';

const MSM_WEB_RELATIVE_PATH = path.join('js', 'msm-portal-web');
const MSM_WEB_SOURCE_RELATIVE_PATH = path.join(MSM_WEB_RELATIVE_PATH, 'src');
const MSM_WEB_E2E_RELATIVE_PATH = path.join(MSM_WEB_RELATIVE_PATH, 'e2e');

export function createMsmPortalRuntimeConfig({ repoRoot, worktreePath }) {
  const sourceAppRoot = path.join(repoRoot, MSM_WEB_RELATIVE_PATH);
  const worktreeAppRoot = path.join(worktreePath, MSM_WEB_RELATIVE_PATH);

  return {
    productId: 'msm-portal',
    productFilePrefix: 'js/msm-portal-web/',
    productSourcePrefix: 'js/msm-portal-web/src/',
    appRelativePath: MSM_WEB_RELATIVE_PATH,
    sourceAppRoot,
    worktreeAppRoot,
    sourceNodeModulesPath: path.join(sourceAppRoot, 'node_modules'),
    worktreeNodeModulesPath: path.join(worktreeAppRoot, 'node_modules'),
    viteConfigPath: path.join(worktreeAppRoot, 'vite.config.ts'),
    tsconfigPath: path.join(worktreeAppRoot, 'tsconfig.json'),
    e2eScripts: {
      screenshot: path.join(repoRoot, MSM_WEB_E2E_RELATIVE_PATH, 'screenshot-util.ts'),
      previewText: path.join(repoRoot, MSM_WEB_E2E_RELATIVE_PATH, 'preview-text-util.ts'),
      previewRoute: path.join(repoRoot, MSM_WEB_E2E_RELATIVE_PATH, 'preview-route-util.ts'),
    },
    sourceRoots: {
      app: sourceAppRoot,
      src: path.join(repoRoot, MSM_WEB_SOURCE_RELATIVE_PATH),
      e2e: path.join(repoRoot, MSM_WEB_E2E_RELATIVE_PATH),
    },
  };
}
