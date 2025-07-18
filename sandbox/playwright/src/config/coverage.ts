import path from 'node:path';
import { PlaywrightCoverage } from '@test-fusion/playwright-coverage';

const sandboxDir = path.resolve(import.meta.dirname, '../../../');
const coverageDir = path.resolve(
  import.meta.dirname,
  '../../playwright-coverage',
);

export const playwrightCoverage = new PlaywrightCoverage({
  cwd: sandboxDir,
  coverageDir,
  collectCoverageFrom: [
    'ui/src/components/**/*.{ts,tsx}',
    'vite-app/src/**/*.{ts,tsx}',
    'webpack-app/src/**/*.{ts,tsx}',
    '!**/*.test.{ts,tsx}',
    '!**/test-setup.ts',
    '!*/src/index.{ts,tsx}',
    '!ui/src/index.ts',
  ],
});
