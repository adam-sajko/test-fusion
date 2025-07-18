import { playwrightCoverage } from './coverage.js';

export default async function globalTeardown() {
  await playwrightCoverage.finish();
}
