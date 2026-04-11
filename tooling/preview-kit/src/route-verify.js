import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function verifyRouteWithMsmPortal(args) {
  const {
    runtimeConfig,
    previewUrl,
    expectedLanguage,
    client,
  } = args;

  const commandArgs = [
    'exec',
    'tsx',
    runtimeConfig.e2eScripts.previewRoute,
    previewUrl,
    expectedLanguage || '',
    ...(client ? [client] : []),
  ];

  try {
    const { stdout } = await execFileAsync('pnpm', commandArgs, {
      cwd: runtimeConfig.worktreeAppRoot,
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
