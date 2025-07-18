import type { FullConfig } from '@playwright/test';

import { playwrightCoverage } from './coverage.js';

export default async function globalSetup(config: FullConfig) {
  await playwrightCoverage.setup(config.shard);
}
