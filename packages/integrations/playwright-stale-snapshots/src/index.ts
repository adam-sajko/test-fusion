import fs from 'node:fs/promises';
import path from 'node:path';
import {
  collectExpectedPrefixes,
  collectTestFilePaths,
  extractCustomSnapshotNames,
  identifyStaleFiles,
  listAllSnapshotPngs,
  pathExists,
  resolveTestFile,
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
  /** Snapshot file names or glob patterns to exclude from stale detection */
  ignore?: string[];
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

  const customNames = new Set<string>();
  const testFiles = collectTestFilePaths(jsonReport);
  await Promise.all(
    testFiles.map(async (file) => {
      const resolved = await resolveTestFile(cwd, file);
      if (!resolved) return;
      try {
        const content = await fs.readFile(resolved, 'utf8');
        for (const name of extractCustomSnapshotNames(content)) {
          customNames.add(name);
        }
      } catch {
        // test file not readable, skip
      }
    }),
  );

  const pngs = await listAllSnapshotPngs(snapshotsRoot, options.project);
  const stale = identifyStaleFiles(snapshotsRoot, expected, pngs, {
    customNames: customNames.size > 0 ? customNames : undefined,
    ignorePatterns: options.ignore,
  });

  if (shouldDelete && stale.length > 0) {
    await Promise.all(stale.map((f) => fs.rm(f, { force: true })));
  }

  return {
    staleFiles: stale,
    totalFiles: pngs.length,
    deleted: shouldDelete && stale.length > 0,
  };
}
