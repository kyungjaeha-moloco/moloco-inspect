import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function captureScreenshotWithMsmPortal(args) {
  const {
    runtimeConfig,
    previewUrl,
    screenshotPath,
    expectedLanguage,
    client,
  } = args;

  const commandArgs = [
    'exec',
    'tsx',
    runtimeConfig.e2eScripts.screenshot,
    previewUrl,
    screenshotPath,
    ...(expectedLanguage ? [expectedLanguage] : []),
    ...(client ? [client] : []),
  ];

  const { stdout } = await execFileAsync('pnpm', commandArgs, {
    cwd: runtimeConfig.worktreeAppRoot,
    timeout: 120_000,
    env: {
      ...process.env,
      COREPACK_ENABLE_AUTO_PIN: '0',
    },
  });

  return { stdout };
}
