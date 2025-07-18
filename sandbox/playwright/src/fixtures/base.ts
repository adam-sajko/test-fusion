import { test as base, expect } from '@playwright/test';

import { playwrightCoverage } from '../config/coverage.js';

export const test = base.extend({
  page: async ({ page, browserName }, use) => {
    await use(page);

    if (browserName === 'chromium') {
      // biome-ignore lint/suspicious/noExplicitAny: Istanbul global has no type
      const coverage = await page.evaluate(() => (window as any).__coverage__);
      playwrightCoverage.addCoverage(coverage);
    }
  },
});

export { expect };
