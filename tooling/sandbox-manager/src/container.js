import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const DEFAULT_IMAGE = 'moloco-inspect-sandbox:latest';

/**
 * Create a sandbox container for a request.
 * Ports must be provided at creation time (cannot add later).
 */
export async function createSandbox({
  requestId,
  imageName = DEFAULT_IMAGE,
  openCodePort,
  vitePort,
  apiKey,
  provider = 'openai',
  serverPassword,
}) {
  const containerName = `inspect-${requestId}`;

  // Remove existing container if any
  await execAsync(`docker rm -f ${containerName} 2>/dev/null || true`);

  const envFlags = [
    '-e', `NODE_TLS_REJECT_UNAUTHORIZED=0`,
    '-e', `SSL_CERT_FILE=/tmp/ca-bundle.crt`,
  ];

  if (provider === 'opencode') {
    envFlags.push('-e', `OPENCODE_API_KEY=${apiKey}`);
  } else if (provider === 'openai' || apiKey.startsWith('sk-proj-')) {
    envFlags.push('-e', `OPENAI_API_KEY=${apiKey}`);
  } else {
    envFlags.push('-e', `ANTHROPIC_API_KEY=${apiKey}`);
  }

  if (serverPassword) {
    envFlags.push('-e', `OPENCODE_SERVER_PASSWORD=${serverPassword}`);
  }

  const args = [
    'run', '-d',
    '--name', containerName,
    '-p', `${openCodePort}:4096`,
    '-p', `${vitePort}:5173`,
    '--shm-size=2gb',
    // Mount host CA certs for SSL
    '-v', '/etc/ssl/cert.pem:/etc/ssl/cert.pem:ro',
    '-v', '/etc/ssl/cert.pem:/etc/ssl/certs/ca-certificates.crt:ro',
    ...envFlags,
    imageName,
  ];

  await execFileAsync('docker', args, { timeout: 30_000 });

  return {
    containerId: containerName,
    containerName,
    openCodePort,
    vitePort,
  };
}

/**
 * Copy files from host into the container's msm-portal workspace.
 */
export async function copyFilesIn({ containerId, sourceDir, containerDir = '/workspace/msm-portal' }) {
  // Copy source into container via tar, excluding .git and node_modules
  await execAsync(
    `cd "${sourceDir}" && tar cf - --exclude='.git' --exclude='node_modules' --exclude='.omc' --exclude='._*' . | docker exec -i "${containerId}" tar xf - -C "${containerDir}/"`,
    { timeout: 300_000, maxBuffer: 50 * 1024 * 1024 },
  );

  // Re-initialize git and commit baseline
  // safe.directory is needed because tar-copied files have different ownership
  const baseline = await execInContainer({
    containerId,
    command: [
      `git config --global --add safe.directory ${containerDir}`,
      `cd ${containerDir}`,
      'rm -rf .git',
      'git init',
      'git config user.email "sandbox@local"',
      'git config user.name "Sandbox"',
      'git add -A',
      'git commit -m "baseline" --allow-empty',
    ].join(' && '),
  });

  if (baseline.exitCode !== 0) {
    console.warn(`[sandbox] Baseline commit warning: ${(baseline.stdout + baseline.stderr).slice(0, 300)}`);
  }
}

/**
 * Copy specific changed files from host into container.
 */
export async function copyChangedFilesIn({ containerId, files, sourceRepoRoot, containerDir = '/workspace/msm-portal' }) {
  for (const file of files) {
    const hostPath = path.join(sourceRepoRoot, file);
    if (!fs.existsSync(hostPath)) continue;

    const containerPath = `${containerDir}/${file}`;
    // Ensure parent dir exists
    const parentDir = path.dirname(containerPath);
    await execInContainer({ containerId, command: `mkdir -p "${parentDir}"` });
    await execAsync(`docker cp "${hostPath}" "${containerId}:${containerPath}"`, { timeout: 30_000 });
  }
}

/**
 * Execute a command inside the container.
 */
export async function execInContainer({ containerId, command, timeout = 300_000, env = {} }) {
  const envFlags = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);

  try {
    const { stdout, stderr } = await execFileAsync(
      'docker',
      ['exec', ...envFlags, containerId, 'sh', '-c', command],
      { timeout, maxBuffer: 10 * 1024 * 1024 },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || '',
      exitCode: error.code || 1,
    };
  }
}

/**
 * Extract git diff from inside the container.
 */
export async function extractDiff({ containerId }) {
  await execInContainer({
    containerId,
    command: 'git config --global --add safe.directory /workspace/msm-portal 2>/dev/null || true',
  });

  // Use git status to find modified + untracked files, then git diff for tracked changes
  // and manual diff for new files. Avoids git add -A on huge repos (OOM risk).
  const { stdout: statusRaw } = await execInContainer({
    containerId,
    command: "cd /workspace/msm-portal && git status --porcelain -- . ':(exclude).opencode'",
  });

  const changedFiles = statusRaw
    .split('\n')
    .filter((l) => l.length > 3)
    .map((l) => l.substring(3)) // porcelain format: 2-char status + space + path
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => !f.startsWith('.opencode/'))
    .filter((f) => !/(^|\/)\.\_/.test(f))
    .filter((f) => f !== 'opencode.json');

  if (!changedFiles.length) {
    return { diffText: '', changedFiles: [], diffStat: '' };
  }

  // Stage changed files one by one (avoids shell escaping issues)
  for (const file of changedFiles) {
    await execInContainer({
      containerId,
      command: `cd /workspace/msm-portal && git add -- '${file.replace(/'/g, "'\\''")}'`,
    });
  }

  const { stdout: diffText } = await execInContainer({
    containerId,
    command: "cd /workspace/msm-portal && git diff --cached -- . ':(exclude).opencode/**'",
  });

  const { stdout: diffStat } = await execInContainer({
    containerId,
    command: "cd /workspace/msm-portal && git diff --cached --stat -- . ':(exclude).opencode/**'",
  });

  // Unstage
  await execInContainer({
    containerId,
    command: 'cd /workspace/msm-portal && git reset HEAD -- . 2>/dev/null || true',
  });

  return { diffText, changedFiles, diffStat };
}

/**
 * Extract a file from container to host.
 */
export async function extractFile({ containerId, containerPath, hostPath }) {
  const hostDir = path.dirname(hostPath);
  if (!fs.existsSync(hostDir)) {
    fs.mkdirSync(hostDir, { recursive: true });
  }
  await execAsync(`docker cp "${containerId}:${containerPath}" "${hostPath}"`, { timeout: 30_000 });
}

/**
 * Reset container workspace (for reject/retry).
 */
export async function resetSandbox({ containerId }) {
  await execInContainer({
    containerId,
    command: 'cd /workspace/msm-portal && git checkout -- . && git clean -fd',
  });
}

/**
 * Remove sandbox container.
 */
export async function removeSandbox({ containerId }) {
  await execAsync(`docker rm -f ${containerId}`, { timeout: 30_000 }).catch(() => {});
}
