import { expect, test } from '../src/fixtures/base';

test.describe('Welcome Page', () => {
  test('renders page', async ({ page, baseURL }) => {
    // biome-ignore lint/style/noNonNullAssertion: provided by Playwright config
    await page.goto(baseURL!);
    await expect(page.getByTestId('welcome-page')).toBeVisible();
    await expect(page).toHaveScreenshot();
  });

  test('counter increments on click', async ({ page, baseURL }) => {
    // biome-ignore lint/style/noNonNullAssertion: provided by Playwright config
    await page.goto(baseURL!);

    const button = page.getByTestId('counter-button');
    await expect(button).toHaveText('Count: 0');

    await button.click();
    await expect(button).toHaveText('Count: 1');

    await button.click();
    await button.click();
    await expect(button).toHaveText('Count: 3');
  });

  test('this is a very long test name that should trigger the SHA1 hash truncation mechanism in Playwright snapshot path resolution because it exceeds one hundred characters easily', async ({
    page,
    baseURL,
  }) => {
    // biome-ignore lint/style/noNonNullAssertion: provided by Playwright config
    await page.goto(baseURL!);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page).toHaveScreenshot();
  });
});
