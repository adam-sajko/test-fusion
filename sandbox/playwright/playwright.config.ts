import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import type { PlaywrightCoverageReporterOptions } from '@test-fusion/playwright-coverage';

const WEBPACK_APP_PORT = 3000;
const VITE_APP_PORT = 3001;

const isCI = !!process.env.CI;

const sandboxDir = path.resolve(import.meta.dirname, '..');

const uiPatterns = [
  'ui/src/components/**/*.{ts,tsx}',
  '!**/*.test.{ts,tsx}',
  '!ui/src/index.ts',
];

export default defineConfig({
  snapshotDir: './snapshots',
  testDir: './tests',

  snapshotPathTemplate:
    '{snapshotDir}/{projectName}/{testFileDir}/{testFileName}/{arg}{ext}',

  timeout: 15_000,

  expect: {
    timeout: 15_000,
  },

  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,

  reporter: [
    ['blob', { outputDir: './blob-report' }],
    ['html', { open: 'never', outputFolder: './playwright-report' }],
    ['json', { outputFile: './test-results/results.json' }],
    ['list', { printSteps: true }],
    [
      '@test-fusion/playwright-coverage',
      {
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
      } satisfies PlaywrightCoverageReporterOptions,
    ],
  ],

  use: {
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'on',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  },

  projects: [
    {
      name: 'webpack-chromium',
      testDir: './tests',
      use: {
        ...devices['Desktop Chromium'],
        baseURL: `http://localhost:${WEBPACK_APP_PORT}`,
      },
      testMatch: '**/tests/**/*.spec.ts',
    },
    {
      name: 'vite-chromium',
      testDir: './tests',
      use: {
        ...devices['Desktop Chromium'],
        baseURL: `http://localhost:${VITE_APP_PORT}`,
      },
      testMatch: '**/tests/**/*.spec.ts',
    },
  ],

  webServer: [
    {
      name: 'Webpack App',
      command: `cd ../../ && yarn workspace @sandbox/webpack-app start --port ${WEBPACK_APP_PORT}`,
      url: `http://127.0.0.1:${WEBPACK_APP_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: 'Vite App',
      command: `cd ../../ && yarn workspace @sandbox/vite-app start --port ${VITE_APP_PORT}`,
      url: `http://127.0.0.1:${VITE_APP_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
