import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCT_REPO_ROOT =
  process.env.PRODUCT_REPO_ROOT || path.resolve(__dirname, '../msm-portal');
const MSM_WEB = path.resolve(PRODUCT_REPO_ROOT, 'js/msm-portal-web');
const MSM_SRC = path.resolve(MSM_WEB, 'src');
const MSM_NODE_MODULES = path.resolve(MSM_WEB, 'node_modules');
const LOCAL_DESIGN_SYSTEM_SRC = path.resolve(__dirname, '../design-system/src');
const LOCAL_DESIGN_SYSTEM_WORKFLOWS = path.resolve(__dirname, '../design-system/workflows');

export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    global: 'window',
  },
  resolve: {
    alias: {
      '@msm-portal/builder': path.resolve(MSM_SRC, 'app-builder'),
      '@msm-portal/common': path.resolve(MSM_SRC, 'common'),
      '@msm-portal/route': path.resolve(MSM_SRC, 'route'),
      '@msm-portal/i18n': path.resolve(MSM_SRC, 'i18n'),
      '@msm-portal/msm-default': path.resolve(MSM_SRC, 'apps/msm-default'),
      '@msm-portal/tving': path.resolve(MSM_SRC, 'apps/tving'),
      '@msm-portal/shortmax': path.resolve(MSM_SRC, 'apps/shortmax'),
      '@msm-portal/onboard-demo': path.resolve(MSM_SRC, 'apps/onboard-demo'),
      '@source-design-system': LOCAL_DESIGN_SYSTEM_SRC,
      '@source-design-system-workflows': LOCAL_DESIGN_SYSTEM_WORKFLOWS,
      react: path.resolve(MSM_NODE_MODULES, 'react'),
      'react-dom': path.resolve(MSM_NODE_MODULES, 'react-dom'),
      'react-router-dom': path.resolve(MSM_NODE_MODULES, 'react-router-dom'),
      'styled-components': path.resolve(MSM_NODE_MODULES, 'styled-components'),
      formik: path.resolve(MSM_NODE_MODULES, 'formik'),
      i18next: path.resolve(MSM_NODE_MODULES, 'i18next'),
      'react-i18next': path.resolve(MSM_NODE_MODULES, 'react-i18next'),
      '@moloco/moloco-cloud-react-ui': path.resolve(MSM_NODE_MODULES, '@moloco/moloco-cloud-react-ui'),
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'styled-components',
      'formik',
      'i18next',
      'react-i18next',
      '@moloco/moloco-cloud-react-ui',
    ],
    esbuildOptions: {
      define: {
        global: 'window',
      },
    },
  },
  server: {
    fs: {
      strict: false,
      allow: [__dirname, MSM_SRC, MSM_NODE_MODULES, LOCAL_DESIGN_SYSTEM_SRC, PRODUCT_REPO_ROOT],
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.endsWith('.css') || !id.includes('node_modules')) return undefined;
          if (id.includes('@moloco/moloco-cloud-react-ui')) return 'pkg-moloco-ui';
          if (id.includes('styled-components')) return 'pkg-styled-components';
          if (id.includes('formik')) return 'pkg-formik';
          if (id.includes('recharts')) return 'pkg-recharts';
          if (id.includes('react-router-dom')) return 'pkg-react-router';
          if (id.includes('react-i18next')) return 'pkg-react-i18next';
          if (id.includes('i18next')) return 'pkg-i18next';
          if (id.includes('react-dom')) return 'pkg-react-dom';
          if (id.includes('/react/')) return 'pkg-react';
          return 'vendor';
        },
      },
    },
  },
});
