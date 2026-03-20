import { expect, test } from '../src/fixtures/base';
import { WelcomePage } from '../src/pages/welcome';

test.describe('Snapshots', () => {
  test('welcome page', async ({ page, baseURL }) => {
    const welcomePage = new WelcomePage(page, baseURL);
    await welcomePage.goto();
    await expect(welcomePage.container).toBeVisible();
    await expect(page).toHaveScreenshot();
  });

  test('this is a very long test name that should trigger the SHA1 hash truncation mechanism in Playwright snapshot path resolution because it exceeds one hundred characters easily', async ({
    page,
    baseURL,
  }) => {
    const welcomePage = new WelcomePage(page, baseURL);
    await welcomePage.goto();
    await expect(welcomePage.heading).toBeVisible();
    await expect(welcomePage.heading).toHaveScreenshot();
  });

  test('custom snapshot name', async ({ page, baseURL }) => {
    const welcomePage = new WelcomePage(page, baseURL);
    await welcomePage.goto();
    await expect(welcomePage.heading).toBeVisible();
    await expect(welcomePage.heading).toHaveScreenshot('heading.png');
    const customName = 'custom-snapshot-name.png';
    await expect(welcomePage.heading).toHaveScreenshot(customName);
  });
});
