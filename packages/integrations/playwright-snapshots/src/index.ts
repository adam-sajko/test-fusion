import fs from 'node:fs/promises';
import path from 'node:path';
import {
  collectExpectedPrefixes,
  identifyStaleFiles,
  listAllSnapshotPngs,
  pathExists,
  runPlaywrightListJson,
} from './internals.js';

export type { JsonReport, JsonSpec, JsonSuite } from './internals.js';

export interface StaleSnapshotOptions {
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Path to the snapshots directory (defaults to `./snapshots` from cwd) */
  snapshotsDir?: string;
  /** Delete stale files (refused when CI env is set) */
  delete?: boolean;
  /** Limit scan to a single Playwright project name */
  project?: string;
}

export interface StaleSnapshotResult {
  staleFiles: string[];
  totalFiles: number;
  deleted: boolean;
}

/**
 * Find stale Playwright screenshot snapshots that no longer match any test.
 *
 * Uses `playwright test --list --reporter=json` to discover expected snapshots,
 * then compares with actual `.png` files in the snapshots directory. Works with
 * the deterministic snapshot template:
 *
 *   `{snapshotDir}/{projectName}/{testFileDir}/{testFileName}/{arg}{ext}`
 */
export async function findStaleSnapshots(
  options: StaleSnapshotOptions = {},
): Promise<StaleSnapshotResult> {
  const cwd = options.cwd ?? process.cwd();
  const snapshotsRoot = options.snapshotsDir ?? path.resolve(cwd, 'snapshots');
  const isCI = Boolean(process.env.CI);
  const shouldDelete = Boolean(options.delete) && !isCI;

  if (isCI && options.delete) {
    throw new Error(
      'Refusing to delete snapshots in CI - run locally and commit changes',
    );
  }

  if (!(await pathExists(snapshotsRoot))) {
    throw new Error(`Snapshots directory not found at ${snapshotsRoot}`);
  }

  const jsonReport = runPlaywrightListJson({ cwd, project: options.project });
  const expected = await collectExpectedPrefixes(jsonReport, snapshotsRoot);
  const pngs = await listAllSnapshotPngs(snapshotsRoot, options.project);
  const stale = identifyStaleFiles(snapshotsRoot, expected, pngs);

  if (shouldDelete && stale.length > 0) {
    await Promise.all(stale.map((f) => fs.rm(f, { force: true })));
  }

  return {
    staleFiles: stale,
    totalFiles: pngs.length,
    deleted: shouldDelete && stale.length > 0,
  };
}
