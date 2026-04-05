import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'path';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  define: {
    global: {},
  },
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/frontend',
  server: {
    port: 4300,
    host: 'localhost',
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
  plugins: [
    tanstackRouter({
      routesDirectory: resolve(__dirname, 'src/routes'),
      generatedRouteTree: resolve(__dirname, 'src/routeTree.gen.ts'),
    }),
    react(),
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['*.md']),
    tailwindcss(),
    tsconfigPaths(),
  ],
  build: {
    outDir: '../../dist/packages/frontend',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: '@aws-ocr-vision-lab/frontend',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/frontend',
      provider: 'v8' as const,
    },
    passWithNoTests: true,
  },
}));
