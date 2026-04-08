# @test-fusion/playwright-coverage

Istanbul-based coverage reporter for Playwright tests. Collects `window.__coverage__` from instrumented apps via test attachments and merges it into a standard `coverage-final.json`.

## Setup

### 1. Add the reporter to your Playwright config

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';
import { PlaywrightCoverageReporter } from '@test-fusion/playwright-coverage';

export default defineConfig({
  reporter: [
    ['html', { open: 'never' }],
    [PlaywrightCoverageReporter, { coverageDir: './playwright-coverage' }],
  ],
});
```

### 2. Create a fixture that attaches coverage data

```ts
// fixtures/base.ts
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await use(page);
    const coverage = await page.evaluate(() => (window as any).__coverage__);
    if (coverage) {
      await testInfo.attach('coverage', {
        body: JSON.stringify(coverage),
        contentType: 'application/json',
      });
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
