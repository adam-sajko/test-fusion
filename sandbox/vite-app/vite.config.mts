import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import open from 'open';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sandboxRoot = path.resolve(__dirname, '..');

const coverageInclude = [
  'ui/src/components/**/*.{ts,tsx}',
  'vite-app/src/**/*.{ts,tsx}',
  'webpack-app/src/**/*.{ts,tsx}',
];

const coverageExclude = [
  '**/*.test.{ts,tsx}',
  '**/test-setup.ts',
  '*/src/index.{ts,tsx}',
  'ui/src/index.ts',
];

function createIstanbulPlugin(): Plugin {
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
              cwd: sandboxRoot,
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
  plugins: [
    {
      name: 'open-browser',
      configureServer(server) {
        server.httpServer?.once('listening', () => {
          const addr = server.httpServer?.address();
          if (addr && typeof addr === 'object' && 'port' in addr) {
            open(`http://localhost:${addr.port}`);
          }
        });
      },
    },
    react(),
    process.env.USE_COVERAGE ? createIstanbulPlugin() : null,
  ],
  server: {
    port: 3001,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
