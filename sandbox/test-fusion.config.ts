import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@test-fusion/core';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const coverageThreshold = {
  global: {
    branches: 20,
    functions: 20,
    lines: 20,
    statements: 20,
  },
};

export default defineConfig({
  rootDir,
  name: 'My Project',
  fusionReport: {
    name: 'UI Library + Vite + Webpack + Playwright',
    coverageThreshold,
  },
  reports: [
    {
      type: 'vitest',
      name: 'UI Library (Vitest)',
      coverageThreshold,
      source: {
        coverage: { dir: './ui/coverage' },
        testReport: { dir: './ui/test-report' },
        testResults: { json: './ui/test-results.json' },
      },
    },
    {
      type: 'vitest',
      name: 'Vite (Vitest)',
      coverageThreshold,
      source: {
        coverage: { dir: './vite-app/coverage' },
        testReport: { dir: './vite-app/test-report' },
        testResults: { json: './vite-app/test-results.json' },
      },
    },
    {
      type: 'jest',
      name: 'Webpack (Jest)',
      coverageThreshold,
      source: {
        coverage: { dir: './webpack-app/coverage' },
        testReport: { html: './webpack-app/test-report/index.html' },
        testResults: { json: './webpack-app/test-results.json' },
      },
    },
    {
      type: 'playwright',
      name: 'Playwright (UI Library + Apps)',
      coverageThreshold,
      source: {
        coverage: { dir: './playwright/playwright-coverage' },
        testReport: { dir: './playwright/playwright-report' },
        testResults: { json: './playwright/test-results/results.json' },
      },
    },
  ],
});
