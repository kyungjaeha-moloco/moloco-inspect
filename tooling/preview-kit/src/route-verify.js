import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function verifyRouteWithMsmPortal(args) {
  const {
    msmRepoRoot,
    worktreePath,
    previewUrl,
    expectedLanguage,
    client,
  } = args;

  const commandArgs = [
    'exec',
    'tsx',
    path.join(msmRepoRoot, 'js/msm-portal-web', 'e2e', 'preview-route-util.ts'),
    previewUrl,
    expectedLanguage || '',
    ...(client ? [client] : []),
  ];

  try {
    const { stdout } = await execFileAsync('pnpm', commandArgs, {
      cwd: path.join(worktreePath, 'js/msm-portal-web'),
      timeout: 120_000,
      env: { ...process.env, COREPACK_ENABLE_AUTO_PIN: '0' },
    });
    const parsed = JSON.parse(stdout.trim());
    if (!parsed.ok) {
      return {
        ok: false,
        profileId: parsed.profileId || null,
        currentPath: parsed.currentPath || null,
        message: parsed.message || 'Route profile verification failed',
      };
    }

    return {
      ok: true,
      profileId: parsed.profileId || null,
      currentPath: parsed.currentPath || null,
      message: parsed.message || 'Route profile verification passed',
    };
  } catch (error) {
    const stderr = String(error?.stderr || error?.stdout || error?.message || '').trim();
    return {
      ok: false,
      profileId: null,
      currentPath: null,
      message: stderr || 'Route profile verification failed',
    };
  }
}
