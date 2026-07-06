import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

const coverageInclude = ['src/**/*.{ts,tsx}'];
const coverageExclude = [
  '**/*.test.{ts,tsx}',
  '**/test-setup.ts',
  'src/index.tsx',
  'src/components/index.ts',
];

// Instruments the original TypeScript source with babel-plugin-istanbul so the
// browser exposes window.__coverage__. Enabled only when USE_COVERAGE=1.
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
              cwd: packageRoot,
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
  server: { port: 4200 },
  build: { outDir: 'dist', sourcemap: true },
});
