import path from 'path';
import fs from 'fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const MSM_WEB = path.resolve(__dirname, '../../msm-portal/js/msm-portal-web');
const MSM_SRC = path.resolve(MSM_WEB, 'src');
const MSM_NODE_MODULES = path.resolve(MSM_WEB, 'node_modules');
// pnpm stores transitive dependencies here
const PNPM_STORE = path.resolve(MSM_NODE_MODULES, '.pnpm/node_modules');

/** Resolve bare imports from msm-portal's pnpm store as fallback */
function resolveMsmDeps(): Plugin {
  return {
    name: 'resolve-msm-deps',
    enforce: 'pre',
    resolveId(source) {
      if (source.startsWith('.') || source.startsWith('/') || source.startsWith('\0')) {
        return null;
      }
      // Get the package name (handle scoped packages)
      const pkgName = source.startsWith('@')
        ? source.split('/').slice(0, 2).join('/')
        : source.split('/')[0];

      // Check pnpm store first, then top-level node_modules
      for (const base of [PNPM_STORE, MSM_NODE_MODULES]) {
        const pkgDir = path.resolve(base, pkgName);
        if (fs.existsSync(pkgDir)) {
          const fullPath = path.resolve(base, source);
          // For exact package imports, resolve via package.json
          if (source === pkgName) {
            try {
              const pkgJson = JSON.parse(fs.readFileSync(path.resolve(pkgDir, 'package.json'), 'utf-8'));
              const entry = pkgJson.module || pkgJson.main || 'index.js';
              return path.resolve(pkgDir, entry);
            } catch {
              return path.resolve(pkgDir, 'index.js');
            }
          }
          // For deep imports like @material-ui/core/Tooltip or dom-helpers/removeClass
          if (fs.existsSync(fullPath)) {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              // Directory: check package.json → index.js
              const deepPkg = path.resolve(fullPath, 'package.json');
              if (fs.existsSync(deepPkg)) {
                try {
                  const pkg = JSON.parse(fs.readFileSync(deepPkg, 'utf-8'));
                  const entry = pkg.module || pkg.main || 'index.js';
                  return path.resolve(fullPath, entry);
                } catch { /* fall through */ }
              }
              if (fs.existsSync(path.resolve(fullPath, 'index.js'))) return path.resolve(fullPath, 'index.js');
              if (fs.existsSync(path.resolve(fullPath, 'index.mjs'))) return path.resolve(fullPath, 'index.mjs');
            } else {
              return fullPath;
            }
          }
          if (fs.existsSync(fullPath + '.js')) return fullPath + '.js';
          if (fs.existsSync(fullPath + '.mjs')) return fullPath + '.mjs';
          if (fs.existsSync(fullPath + '/index.js')) return fullPath + '/index.js';
          // Try resolving with the base path for the resolver
          return null;
        }
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [resolveMsmDeps(), react()],
  resolve: {
    alias: {
      // MSM Portal source aliases
      '@msm-portal/builder': path.resolve(MSM_SRC, 'app-builder'),
      '@msm-portal/common': path.resolve(MSM_SRC, 'common'),
      '@msm-portal/route': path.resolve(MSM_SRC, 'route'),
      '@msm-portal/tving': path.resolve(MSM_SRC, 'apps/tving'),
      '@msm-portal/shortmax': path.resolve(MSM_SRC, 'apps/shortmax'),
      '@msm-portal/msm-default': path.resolve(MSM_SRC, 'apps/msm-default'),
      '@msm-portal/onboard-demo': path.resolve(MSM_SRC, 'apps/onboard-demo'),
      '@msm-portal/i18n': path.resolve(MSM_SRC, 'i18n'),

      // Ensure single copies of React ecosystem (top-level hoisted by pnpm)
      'react': path.resolve(MSM_NODE_MODULES, 'react'),
      'react-dom': path.resolve(MSM_NODE_MODULES, 'react-dom'),
      'react-router-dom': path.resolve(MSM_NODE_MODULES, 'react-router-dom'),
      'styled-components': path.resolve(MSM_NODE_MODULES, 'styled-components'),
      'formik': path.resolve(MSM_NODE_MODULES, 'formik'),
      'i18next': path.resolve(MSM_NODE_MODULES, 'i18next'),
      'react-i18next': path.resolve(MSM_NODE_MODULES, 'react-i18next'),
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
      define: { global: 'window' },
      // Tell esbuild to also look in pnpm store for transitive deps
      nodePaths: [PNPM_STORE, MSM_NODE_MODULES],
    },
  },
  server: {
    port: 6100,
    fs: {
      strict: false,
      allow: [
        __dirname,
        MSM_SRC,
        MSM_NODE_MODULES,
        path.resolve(__dirname, '../../'),
      ],
    },
  },
});
