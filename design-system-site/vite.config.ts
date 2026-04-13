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
  },
});
