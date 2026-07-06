import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlaywrightCoverageReporterOptions } from '@test-fusion/playwright-coverage';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

const srcPatterns = [
  'src/**/*.{ts,tsx}',
  '!**/*.test.{ts,tsx}',
  '!src/test-setup.ts',
  '!src/index.tsx',
  '!src/components/index.ts',
];

export const coverageReporterOptions = {
  cwd: packageRoot,
  coverageDir: 'playwright-coverage',
  // Only the local-build + Docker-Playwright run needs this (see below).
  ...(process.env.PLAYWRIGHT_SHARDED === '1' && {
    transformPath: (filePath: string, cwd: string) =>
      toRelativeKey(filePath, cwd),
  }),
  projects: [
    {
      // Zero-coverage baseline so untested components still appear (at 0%)
      // even when no E2E test renders them.
      collectCoverageFrom: srcPatterns,
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
              cwd: packageRoot,
              coverageVariable: '__coverage__',
              excludeNodeModules: true,
              include: srcPatterns.filter((p) => !p.startsWith('!')),
              exclude: srcPatterns
                .filter((p) => p.startsWith('!'))
                .map((p) => p.slice(1)),
            },
          ],
        ],
        sourceMaps: false,
        babelrc: false,
      }),
    },
  ],
} satisfies PlaywrightCoverageReporterOptions;

// Unit tests and the instrumented app build run on your local machine, but
// Playwright runs inside Docker so visual snapshots render at the exact same
// pixels regardless of which machine kicks off the run. Because the build happens
// locally, istanbul bakes absolute host paths into the bundle
// (e.g. /Users/you/test-fusion/examples/vite-single/src/components/Badge.tsx),
// while this reporter runs with a Docker cwd (/app/examples/vite-single) that
// can't strip them. This rewrites those keys back to package-relative paths
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
