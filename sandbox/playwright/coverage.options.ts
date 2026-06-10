import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlaywrightCoverageReporterOptions } from '@test-fusion/playwright-coverage';

const sandboxDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const uiPatterns = [
  'ui/src/components/**/*.{ts,tsx}',
  '!**/*.test.{ts,tsx}',
  '!ui/src/index.ts',
];

/** Reporter options for the @test-fusion/playwright-coverage reporter. */
export const coverageReporterOptions = {
  cwd: sandboxDir,
  coverageDir: 'playwright/playwright-coverage',
  ...(process.env.PLAYWRIGHT_SHARDED === '1' && {
    // Apps are built locally, so istanbul embeds each developer's absolute paths.
    // Sharded Playwright runs in Docker (/app/sandbox) — normalize to sandbox-relative keys.
    transformPath: (filePath: string, cwd: string) => {
      const posix = filePath.replace(/\\/g, '/');
      const normalizedRoot = cwd.endsWith('/') ? cwd : `${cwd}/`;
      if (posix.startsWith(normalizedRoot)) {
        return posix.slice(normalizedRoot.length);
      }
      const rootName = path.basename(cwd.replace(/\/+$/, ''));
      const marker = `/${rootName}/`;
      const markerIdx = posix.indexOf(marker);
      if (markerIdx !== -1) {
        return posix.slice(markerIdx + marker.length);
      }
      return posix.replace(/^\/+/, '');
    },
  }),
  projects: [
    {
      collectCoverageFrom: uiPatterns,
      getBabelConfig: () => ({
        presets: [
          '@babel/preset-env',
          ['@babel/preset-react', { runtime: 'automatic' }],
          '@babel/preset-typescript',
        ],
        plugins: [
          [
            'babel-plugin-istanbul',
            {
              cwd: sandboxDir,
              coverageVariable: '__coverage__',
              excludeNodeModules: true,
              include: uiPatterns.filter((p) => !p.startsWith('!')),
              exclude: uiPatterns
                .filter((p) => p.startsWith('!'))
                .map((p) => p.slice(1)),
            },
          ],
        ],
        sourceMaps: false,
        babelrc: false,
      }),
    },
    {
      collectCoverageFrom: [
        'vite-app/src/**/*.{ts,tsx}',
        '!**/*.test.{ts,tsx}',
        '!**/test-setup.ts',
        '!*/src/index.{ts,tsx}',
      ],
    },
    {
      collectCoverageFrom: [
        'webpack-app/src/**/*.{ts,tsx}',
        '!**/*.test.{ts,tsx}',
        '!**/test-setup.ts',
        '!*/src/index.{ts,tsx}',
      ],
    },
  ],
} satisfies PlaywrightCoverageReporterOptions;
