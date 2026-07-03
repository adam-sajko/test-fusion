import fs from 'node:fs/promises';
import path from 'node:path';
import {
  collectExpectedPrefixes,
  identifyStaleFiles,
  listAllSnapshotPngs,
  pathExists,
  runPlaywrightListJson,
} from './internals.js';

export interface StaleSnapshotOptions {
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Path to the snapshots directory (defaults to `./snapshots` from cwd) */
  snapshotsDir?: string;
  /** Delete stale files (refused when CI env is set) */
  delete?: boolean;
  /** Limit scan to a single Playwright project name */
  project?: string;
  /** Path to a Playwright config file (passed to `playwright test --config`) */
  config?: string;
  /** Snapshot file names or glob patterns to exclude (e.g. custom names) */
  ignore?: string[];
}

export interface StaleSnapshotResult {
  staleFiles: string[];
  /** Valid snapshots with index >= 2 (a test took multiple screenshots). */
  multiSnapshotFiles: string[];
  totalFiles: number;
  deleted: boolean;
}

/**
 * Find stale Playwright screenshot snapshots that no longer match any test.
 *
 * The detection is fully deterministic - it never inspects test source. Expected
 * names are derived from `playwright test --list --reporter=json` and compared
 * with the `.png` files on disk, assuming the snapshot template:
 *
 *   `{snapshotDir}/{projectName}/{testFileDir}/{testFileName}/{arg}{ext}`
 *
 * Snapshots created with a custom name (anything not derived from the test
 * title) are invisible to `--list`, so they must be declared via `ignore`.
 */
export async function findStaleSnapshots(
  options: StaleSnapshotOptions = {},
): Promise<StaleSnapshotResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const snapshotsRoot = options.snapshotsDir
    ? path.resolve(cwd, options.snapshotsDir)
    : path.resolve(cwd, 'snapshots');
  const isCI = Boolean(process.env.CI);
  const shouldDelete = Boolean(options.delete) && !isCI;

  if (isCI && options.delete) {
    throw new Error(
      'Refusing to delete snapshots in CI - run locally and commit changes',
    );
  }

  if (!(await pathExists(snapshotsRoot))) {
    return {
      staleFiles: [],
      multiSnapshotFiles: [],
      totalFiles: 0,
      deleted: false,
    };
  }

  const jsonReport = runPlaywrightListJson({
    cwd,
    project: options.project,
    config: options.config,
  });
  const expected = await collectExpectedPrefixes(jsonReport, snapshotsRoot);

  const pngs = await listAllSnapshotPngs(snapshotsRoot, options.project);
  const { stale, multiSnapshot } = identifyStaleFiles(
    snapshotsRoot,
    expected,
    pngs,
    { ignorePatterns: options.ignore },
  );

  if (shouldDelete && stale.length > 0) {
    await Promise.all(stale.map((f) => fs.rm(f, { force: true })));
  }

  return {
    staleFiles: stale,
    multiSnapshotFiles: multiSnapshot,
    totalFiles: pngs.length,
    deleted: shouldDelete && stale.length > 0,
  };
}
