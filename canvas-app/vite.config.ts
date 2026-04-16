import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESIGN_SYSTEM_SRC = path.resolve(__dirname, '../design-system/src');
const DS_PREVIEWS = path.resolve(__dirname, '../design-system-site/src/components/previews');
const DS_SITE_SRC = path.resolve(__dirname, '../design-system-site/src');

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@design-system': DESIGN_SYSTEM_SRC,
      '@ds-previews': DS_PREVIEWS,
      '@ds-site': DS_SITE_SRC,
      '@canvas-data': path.resolve(__dirname, './data'),
    },
  },
  server: {
    fs: {
      strict: false,
      allow: [__dirname, DESIGN_SYSTEM_SRC, DS_PREVIEWS, DS_SITE_SRC],
    },
  },
});
