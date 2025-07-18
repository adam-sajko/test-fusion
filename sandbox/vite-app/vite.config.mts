import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import open from 'open';
import { defineConfig } from 'vite';
import istanbul from 'vite-plugin-istanbul';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sandboxRoot = path.resolve(__dirname, '..');

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
    process.env.USE_COVERAGE &&
      istanbul({
        cwd: sandboxRoot,
        forceBuildInstrument: true,
        include: [
          'ui/src/components/**/*.{ts,tsx}',
          'vite-app/src/**/*.{ts,tsx}',
          'webpack-app/src/**/*.{ts,tsx}',
        ],
        exclude: [
          '**/*.test.{ts,tsx}',
          '**/test-setup.ts',
          '*/src/index.{ts,tsx}',
          'ui/src/index.ts',
        ],
      }),
  ],
  server: {
    port: 3001,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
