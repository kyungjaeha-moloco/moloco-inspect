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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import type { PickerPluginOptions } from './types';

const RUNTIME_VIRTUAL_ID = 'virtual:playground-picker/runtime';
const RUNTIME_RESOLVED_ID = '\0' + RUNTIME_VIRTUAL_ID;

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
  };
}

export default playgroundPickerPlugin;
