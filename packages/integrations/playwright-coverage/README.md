# @test-fusion/playwright-coverage

Istanbul-based coverage reporter for Playwright tests. Collects `window.__coverage__` from instrumented apps and merges it into a standard `coverage-final.json`.

## Setup

### 1. Add the reporter to your Playwright config

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';
import { PlaywrightCoverageReporter } from '@test-fusion/playwright-coverage';

const coverageOptions = { cwd: import.meta.dirname, coverageDir: './playwright-coverage' };

export default defineConfig({
  reporter: [
    ['html', { open: 'never' }],
    [PlaywrightCoverageReporter, coverageOptions],
  ],
});
```

### 2. Record coverage from a fixture

Read your coverage global (the `coverageVariable` you instrument with) and pass
it to `recordCoverage(testInfo, coverage)`. No options needed — it derives its
location from `testInfo.config.rootDir`, matching the reporter.

```ts
// fixtures/base.ts
import { test as base, expect } from '@playwright/test';
import { recordCoverage } from '@test-fusion/playwright-coverage';

export const test = base.extend({
  page: async ({ page, browserName }, use, testInfo) => {
    await use(page);
    if (browserName === 'chromium') {
      const coverage = await page.evaluate(() => (window as any).__coverage__);
      recordCoverage(testInfo, coverage);
    }
  },
});

export { expect };
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `coverageDir` | `string` | — | Directory for coverage artifacts. Resolved relative to `cwd`. |
| `cwd` | `string?` | Playwright's `rootDir` | Base directory for resolving globs and normalizing paths. |
| `transformPath` | `function?` | — | Custom path transform for normalizing coverage paths (useful for Docker/monorepo). |
| `projects` | `CoverageProject[]?` | — | Per-project config for zero-coverage baselines via Babel instrumentation. |

For full documentation, see the [main README](https://github.com/adam-sajko/test-fusion#playwright).
