import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function verifyCopyVisibleWithMsmPortal(args) {
  const {
    msmRepoRoot,
    worktreePath,
    previewUrl,
    expectedLanguage,
    candidates,
  } = args;

  const uniqueCandidates = Array.from(
    new Set((candidates || []).map((value) => String(value || '').trim()).filter(Boolean)),
  );

  if (!uniqueCandidates.length) {
    return {
      ok: true,
      message: 'Copy visibility verification skipped (no visible copy candidates found in changed locale values)',
    };
  }

  const commandArgs = [
    'exec',
    'tsx',
    path.join(msmRepoRoot, 'js/msm-portal-web', 'e2e', 'preview-text-util.ts'),
    previewUrl,
    expectedLanguage || '',
    ...uniqueCandidates,
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
        message: `Copy visibility verification failed: ${parsed.message || 'changed text not visible on preview route'}`,
      };
    }
    return {
      ok: true,
      message: `Copy visibility verification passed: ${parsed.match || parsed.message || 'visible text found on route'}`,
    };
  } catch (error) {
    const stderr = String(error?.stderr || error?.stdout || error?.message || '').trim();
    return {
      ok: false,
      message: `Copy visibility verification failed: ${stderr || 'preview text check failed'}`,
    };
  }
}
