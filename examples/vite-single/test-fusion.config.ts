import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@test-fusion/core';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const coverageThreshold = {
  global: { branches: 20, functions: 20, lines: 20, statements: 20 },
};

// Single-package example: one repo with Vitest unit tests and Playwright E2E over
// the same `src/**` source. Both reports fuse per file.
export default defineConfig({
  rootDir,
  name: 'Vite Single-Package Example',
  fusionReport: {
    name: 'Unit + Playwright',
    coverageThreshold,
  },
  reports: [
    {
      type: 'vitest',
      name: 'Unit (Vitest)',
      coverageThreshold,
      source: {
        coverage: { dir: './coverage' },
        testReport: { dir: './test-report' },
        testResults: { json: './test-results.json' },
      },
    },
    {
      type: 'playwright',
      name: 'E2E (Playwright)',
      coverageThreshold,
      // Only the local-build + Docker-Playwright run needs this (see below).
      ...(process.env.PLAYWRIGHT_SHARDED === '1' && {
        transformPath: (filePath: string, rootDir: string) =>
          toRelativeKey(filePath, rootDir),
      }),
      source: {
        coverage: { dir: './playwright-coverage' },
        testReport: { dir: './playwright-report' },
        testResults: { json: './test-results/results.json' },
      },
    },
  ],
});

// Unit tests and the instrumented app build run on your local machine, but
// Playwright runs inside Docker so visual snapshots render at the exact same
// pixels regardless of which machine kicks off the run. Because the build happens
// locally, istanbul bakes absolute host paths into the bundle
// (e.g. /Users/you/test-fusion/examples/vite-single/src/components/Badge.tsx),
// while the reporter runs with a Docker cwd (/app/examples/vite-single) that can't
// strip them. This rewrites those keys back to package-relative paths
// (src/components/Badge.tsx) so they fuse with the local unit coverage. It's only
// for this local-build + Docker-Playwright case — a fully local run needs none of it.
function toRelativeKey(filePath: string, root: string): string {
  const posix = filePath.replace(/\\/g, '/');
  const normalizedRoot = root.endsWith('/') ? root : `${root}/`;
  if (posix.startsWith(normalizedRoot)) {
    return posix.slice(normalizedRoot.length);
  }
  const marker = `/${path.basename(root.replace(/\/+$/, ''))}/`;
  const markerIdx = posix.indexOf(marker);
  if (markerIdx !== -1) {
    return posix.slice(markerIdx + marker.length);
  }
  return posix.replace(/^\/+/, '');
}
