import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * `lint_only` adapter — runs TypeScript type-check inside the sandbox
 * container. Cheap and binary: exit 0 = pass, anything else = fail with
 * the first line or two of stderr.
 *
 * Uses `pnpm tsc --noEmit` because the playground project already has
 * its TS config + dependencies installed. We don't run ESLint here in
 * v1 — typecheck is the high-confidence signal; lint adds noise.
 *
 * @param {object} _job
 * @param {{ sandboxContainerName?: string }} playground
 * @returns {Promise<{ passed: boolean, notes: string, evidence?: object }>}
 */
export async function lintOnly(_job, playground) {
  if (!playground?.sandboxContainerName) {
    return { passed: false, notes: 'sandboxContainerName 미설정' };
  }
  const cmd = `docker exec ${playground.sandboxContainerName} sh -c "cd /workspace/msm-portal/js/msm-portal-web && pnpm exec tsc --noEmit"`;
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 90_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return {
      passed: true,
      notes: '타입 검사 통과',
      evidence: { stdout: stdout.slice(-400), stderr: stderr.slice(-400) },
    };
  } catch (err) {
    const stderr = err.stderr?.slice(-600) ?? '';
    const stdout = err.stdout?.slice(-600) ?? '';
    const firstError =
      stdout.match(/error TS\d+:[^\n]*/i)?.[0] ??
      stderr.split('\n').find((l) => l.trim()) ??
      err.message ??
      'unknown';
    return {
      passed: false,
      notes: `타입 검사 실패: ${firstError.slice(0, 160)}`,
      evidence: { stderr, stdout, exitCode: err.code },
    };
  }
}
