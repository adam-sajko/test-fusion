import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlaywrightCoverageReporterOptions } from '@test-fusion/playwright-coverage';

// The example root (examples/jest-mono). Coverage keys are relative to it so they
// match the ui + app unit coverage and fuse per file.
const exampleRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const uiPatterns = [
  'ui/src/components/**/*.{ts,tsx}',
  '!**/*.test.{ts,tsx}',
  '!ui/src/index.ts',
];

const appPatterns = [
  'app/src/**/*.{ts,tsx}',
  '!**/*.test.{ts,tsx}',
  '!**/test-setup.ts',
  '!app/src/index.tsx',
];

export const coverageReporterOptions = {
  cwd: exampleRoot,
  coverageDir: 'playwright/playwright-coverage',
  // Only the local-build + Docker-Playwright run needs this (see below).
  ...(process.env.PLAYWRIGHT_SHARDED === '1' && {
    transformPath: (filePath: string, cwd: string) =>
      toRelativeKey(filePath, cwd),
  }),
  projects: [
    {
      // Zero-coverage baseline for the ui library, so untested components still
      // appear (at 0%) even when no E2E test renders them.
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
              cwd: exampleRoot,
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
      collectCoverageFrom: appPatterns,
    },
  ],
} satisfies PlaywrightCoverageReporterOptions;

// Unit tests and the instrumented app build run on your local machine, but
// Playwright runs inside Docker so visual snapshots render at the exact same
// pixels regardless of which machine kicks off the run. Because the build happens
// locally, istanbul bakes absolute host paths into the bundle
// (e.g. /Users/you/test-fusion/examples/jest-mono/ui/src/Badge.tsx), while this
// reporter runs with a Docker cwd (/app/examples/jest-mono) that can't strip them.
// This rewrites those keys back to example-relative paths (ui/src/Badge.tsx) so
// they fuse with the local unit coverage. It's only for this local-build +
// Docker-Playwright case — a fully local run needs none of it.
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
