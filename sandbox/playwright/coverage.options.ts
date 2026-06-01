import path from 'node:path';
import type { PlaywrightCoverageReporterOptions } from '@test-fusion/playwright-coverage';

const sandboxDir = path.resolve(import.meta.dirname, '..');

const uiPatterns = [
  'ui/src/components/**/*.{ts,tsx}',
  '!**/*.test.{ts,tsx}',
  '!ui/src/index.ts',
];

/** Reporter options for the @test-fusion/playwright-coverage reporter. */
export const coverageReporterOptions = {
  cwd: sandboxDir,
  coverageDir: 'playwright/playwright-coverage',
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
