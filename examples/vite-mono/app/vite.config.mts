import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The example root (examples/vite-mono) — coverage keys are made relative to it so the
// ui, app, and Playwright reports all share the same file keys and fuse.
const exampleRoot = path.resolve(__dirname, '..');

const coverageInclude = [
  'ui/src/components/**/*.{ts,tsx}',
  'app/src/**/*.{ts,tsx}',
];
const coverageExclude = [
  '**/*.test.{ts,tsx}',
  '**/test-setup.ts',
  '*/src/index.{ts,tsx}',
  'ui/src/index.ts',
];

// Instruments the original TypeScript source (ui + app) with babel-plugin-istanbul
// so the browser exposes window.__coverage__. Enabled only when USE_COVERAGE=1.
function istanbulPlugin(): Plugin {
  let babel: typeof import('@babel/core');
  return {
    name: 'istanbul-instrument',
    enforce: 'pre',
    async buildStart() {
      babel = await import('@babel/core');
    },
    transform(code, id) {
      if (!/\.[jt]sx?$/.test(id) || id.includes('node_modules')) {
        return null;
      }
      const result = babel.transformSync(code, {
        filename: id,
        configFile: false,
        babelrc: false,
        presets: [
          ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
        ],
        plugins: [
          [
            'babel-plugin-istanbul',
            {
              cwd: exampleRoot,
              include: coverageInclude,
              exclude: coverageExclude,
            },
          ],
        ],
        sourceMaps: true,
      });
      if (result?.code != null) {
        return { code: result.code, map: result.map };
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), process.env.USE_COVERAGE ? istanbulPlugin() : null],
  server: { port: 3001 },
  build: { outDir: 'dist', sourcemap: true },
});
