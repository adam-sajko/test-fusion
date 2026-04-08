import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page, browserName }, use, testInfo) => {
    await use(page);

    if (browserName === 'chromium') {
      // biome-ignore lint/suspicious/noExplicitAny: Istanbul global has no type
      const coverage = await page.evaluate(() => (window as any).__coverage__);
      if (coverage) {
        await testInfo.attach('coverage', {
          body: JSON.stringify(coverage),
          contentType: 'application/json',
        });
      }
    }
  },
});

export { expect };
