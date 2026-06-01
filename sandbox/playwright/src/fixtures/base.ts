import { test as base, expect } from '@playwright/test';
import { recordCoverage } from '@test-fusion/playwright-coverage';

export const test = base.extend({
  page: async ({ page, browserName }, use, testInfo) => {
    await use(page);

    if (browserName === 'chromium') {
      // biome-ignore lint/suspicious/noExplicitAny: Istanbul global has no type
      const coverage = await page.evaluate(() => (window as any).__coverage__);
      recordCoverage(testInfo, coverage);
    }
  },
});

export { expect };
