import { expect, test } from '../src/fixtures/base';
import { WelcomePage } from '../src/pages/welcome';

test.describe('Welcome Page', () => {
  test('renders page', async ({ page, baseURL }) => {
    const welcomePage = new WelcomePage(page, baseURL);
    await welcomePage.goto();
    await expect(welcomePage.container).toBeVisible();
  });

  test('counter increments on click', async ({ page, baseURL }) => {
    const welcomePage = new WelcomePage(page, baseURL);
    await welcomePage.goto();

    await expect(welcomePage.counterButton).toHaveText('Count: 0');

    await welcomePage.counterButton.click();
    await expect(welcomePage.counterButton).toHaveText('Count: 1');

    await welcomePage.counterButton.click();
    await welcomePage.counterButton.click();
    await expect(welcomePage.counterButton).toHaveText('Count: 3');
  });
});
