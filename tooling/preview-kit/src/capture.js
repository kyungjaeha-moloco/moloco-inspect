import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function captureScreenshotWithMsmPortal(args) {
  const {
    msmRepoRoot,
    worktreePath,
    previewUrl,
    screenshotPath,
    expectedLanguage,
    client,
  } = args;

  const commandArgs = [
    'exec',
    'tsx',
    path.join(msmRepoRoot, 'js/msm-portal-web', 'e2e', 'screenshot-util.ts'),
    previewUrl,
    screenshotPath,
    ...(expectedLanguage ? [expectedLanguage] : []),
    ...(client ? [client] : []),
  ];

  const { stdout } = await execFileAsync('pnpm', commandArgs, {
    cwd: path.join(worktreePath, 'js/msm-portal-web'),
    timeout: 120_000,
    env: {
      ...process.env,
      COREPACK_ENABLE_AUTO_PIN: '0',
    },
  });

  return { stdout };
}
