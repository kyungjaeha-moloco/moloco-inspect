import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESIGN_SYSTEM_SRC = path.resolve(__dirname, '../design-system/src');
const DESIGN_SYSTEM_WORKFLOWS = path.resolve(__dirname, '../design-system/workflows');

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@design-system': DESIGN_SYSTEM_SRC,
      '@design-system-workflows': DESIGN_SYSTEM_WORKFLOWS,
    },
  },
  server: {
    fs: {
      strict: false,
      allow: [__dirname, DESIGN_SYSTEM_SRC, DESIGN_SYSTEM_WORKFLOWS],
    },
    // Plan v3 (DS missing AI judge + governance) §4.3 — proxy governance API
    // to the orchestrator so the dev page at /governance can list the queue
    // without orchestrator CORS surgery. The governance UI is an internal
    // admin surface; in production we expect a same-origin reverse proxy.
    proxy: {
      '/api/governance': {
        target: 'http://localhost:3847',
        changeOrigin: true,
      },
    },
  },
});
