import {
  defineConfig,
  devices,
  type ReporterDescription,
} from '@playwright/test';
import { coverageReporterOptions } from './coverage.options';

const APP_PORT = 4200;
const isCI = !!process.env.CI;

// Under CI/sharding we emit a blob report (merged later); locally we emit the
// human-friendly html/json/list reporters. The coverage reporter always runs.
const reporter: ReporterDescription[] = isCI
  ? [
      ['blob', { outputDir: './blob-report' }],
      ['@test-fusion/playwright-coverage', coverageReporterOptions],
    ]
  : [
      ['html', { open: 'never', outputFolder: './playwright-report' }],
      ['json', { outputFile: './test-results/results.json' }],
      ['list'],
      ['@test-fusion/playwright-coverage', coverageReporterOptions],
    ];

export default defineConfig({
  testDir: './e2e/tests',
  snapshotDir: './snapshots',
  snapshotPathTemplate:
    '{snapshotDir}/{projectName}/{testFileDir}/{testFileName}/{arg}{ext}',

  timeout: 15_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,

  reporter,

  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    headless: true,
    trace: 'retain-on-failure',
    // Deterministic rendering so visual snapshots are stable across machines.
    screenshot: 'on',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chromium'] } }],

  // Serves the instrumented build produced by `yarn build`.
  webServer: {
    command: 'yarn start',
    url: `http://127.0.0.1:${APP_PORT}`,
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
});
