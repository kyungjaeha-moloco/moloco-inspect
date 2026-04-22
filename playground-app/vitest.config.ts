import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dedicated Vitest config — avoids the `canvasApiPlugin` WebSocket server
// from the main vite.config.ts so tests can run in plain node env.
export default defineConfig({
  resolve: {
    alias: {
      '@design-system': path.resolve(__dirname, '../design-system/src'),
      '@ds-previews': path.resolve(
        __dirname,
        '../design-system-site/src/components/previews',
      ),
      '@ds-site': path.resolve(__dirname, '../design-system-site/src'),
      '@canvas-data': path.resolve(__dirname, './data'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
