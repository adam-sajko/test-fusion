import type { Locator, Page } from '@playwright/test';

export class WelcomePage {
  readonly container: Locator;
  readonly heading: Locator;
  readonly counterButton: Locator;

  constructor(
    private page: Page,
    private baseURL: string | undefined,
  ) {
    this.container = page.getByTestId('welcome-page');
    this.heading = page.locator('h1');
    this.counterButton = page.getByTestId('counter-button');
  }

  async goto() {
    await this.page.goto(this.baseURL ?? '/');
  }
}
