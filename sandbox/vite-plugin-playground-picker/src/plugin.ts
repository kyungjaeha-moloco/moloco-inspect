/**
 * Vite plugin that injects the playground picker runtime.
 *
 * Mechanism:
 *   1. A virtual module `virtual:playground-picker/runtime` resolves to
 *      the compiled `dist/runtime.js` contents on disk.
 *   2. `transformIndexHtml` adds `<script type="module">import '...'</script>`
 *      to every served HTML page, which pulls the virtual module in.
 *
 * This keeps the runtime a single-file ES module (no module resolution
 * inside the sandbox Vite instance) while still letting us author it as
 * TypeScript and ship it through the normal `tsc` build.
 *
 * The plugin is dev-only by intent. In production builds (never used in
 * the sandbox today — msm-portal runs `vite dev --mode test`) the tags
 * are still injected but the runtime gracefully no-ops when handshake
 * query params are absent.
 */

import { readFileSync, promises as fsp } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import type { PickerPluginOptions } from './types';

const RUNTIME_VIRTUAL_ID = 'virtual:playground-picker/runtime';
const RUNTIME_RESOLVED_ID = '\0' + RUNTIME_VIRTUAL_ID;

// Sentinel file the orchestrator `touch`es after each commit / checkout /
// revert inside the sandbox. The plugin watches this path with polling
// (inotify is unreliable on Docker Desktop overlayfs when git rewrites
// files via inode swap — empirically confirmed: Vite's default watcher
// missed `git am` file changes, leaving the module graph stale). On
// change we blow away the entire module graph and push a full reload
// to the browser so the parent iframe picks up the fresh code even if
// the user never hits the Reload button.
const INVALIDATE_FILE = '/workspace/.playground-invalidate';

const __dirname = dirname(fileURLToPath(import.meta.url));
// tsc emits src/plugin.ts → dist/plugin.js and src/runtime.ts → dist/runtime.js
// so the runtime sits next to this file after compilation.
const RUNTIME_PATH = join(__dirname, 'runtime.js');

export function playgroundPickerPlugin(options: PickerPluginOptions = {}): Plugin {
  let runtimeSource: string | null = null;
  let activeForMode = true;

  const loadRuntime = (): string => {
    if (runtimeSource !== null) return runtimeSource;
    let source: string;
    try {
      source = readFileSync(RUNTIME_PATH, 'utf8');
    } catch (err) {
      const hint =
        '[vite-plugin-playground-picker] runtime.js not found — did you forget `pnpm --filter vite-plugin-playground-picker build`?';
      throw new Error(`${hint}\nUnderlying: ${(err as Error).message}`);
    }
    runtimeSource = source;
    return source;
  };

  return {
    name: 'vite-plugin-playground-picker',
    // Plugin only participates in dev serving. HTML transform still runs
    // in build mode but we early-exit inside it based on `modes` option.
    apply: 'serve',

    config(_cfg, env) {
      if (options.modes && options.modes.length > 0) {
        activeForMode = options.modes.includes(env.mode);
      }
    },

    resolveId(id) {
      if (id === RUNTIME_VIRTUAL_ID) return RUNTIME_RESOLVED_ID;
      return null;
    },

    load(id) {
      if (id !== RUNTIME_RESOLVED_ID) return null;
      return loadRuntime();
    },

    transformIndexHtml() {
      if (!activeForMode) return;
      // Inject before any app script so the runtime's double-injection
      // guard fires even if the app somehow also imports the runtime.
      return [
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: `import ${JSON.stringify(RUNTIME_VIRTUAL_ID)};`,
          injectTo: 'head-prepend',
        },
      ];
    },

    configureServer(server) {
      // Polling interval tradeoff: 500ms keeps CPU noise negligible on an
      // idle sandbox while giving the user a near-instant refresh after a
      // commit. The orchestrator writes this file synchronously after the
      // git operation returns, so the worst-case delay the user sees is
      // roughly one poll tick from touch → full reload.
      const POLL_INTERVAL_MS = 500;
      let lastMtimeMs = 0;
      let armed = false; // skip the first observed mtime — it's the baseline
      const log = (msg: string) => server.config.logger.info(`[picker] ${msg}`);
      log('invalidation watcher starting (polling interval 500ms)');

      const tick = async () => {
        try {
          const stat = await fsp.stat(INVALIDATE_FILE);
          const mtime = stat.mtimeMs;
          if (!armed) {
            lastMtimeMs = mtime;
            armed = true;
            log(`baseline mtime captured: ${mtime}`);
            return;
          }
          if (mtime !== lastMtimeMs) {
            lastMtimeMs = mtime;
            server.moduleGraph.invalidateAll();
            server.ws.send({ type: 'full-reload' });
            log('invalidate signal received — module graph cleared + full reload pushed');
          }
        } catch {
          // File absent on first boot — just arm on first appearance.
          if (!armed) lastMtimeMs = 0;
        }
      };

      const timer = setInterval(tick, POLL_INTERVAL_MS);
      // Prime immediately so the baseline mtime is captured before the
      // orchestrator gets a chance to touch the file.
      void tick();

      // Clean up on server shutdown. NOT returning a function from
      // configureServer — Vite treats that as a post-middleware hook
      // that fires *immediately* after internal middlewares install,
      // which would kill the interval before it ever runs.
      server.httpServer?.once('close', () => clearInterval(timer));
    },
  };
}

export default playgroundPickerPlugin;
