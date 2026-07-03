#!/usr/bin/env node

import path from 'node:path';

import { Command } from 'commander';

import { findStaleSnapshots } from './index.js';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
} as const;

/**
 * Warns about valid snapshots that use a 2nd+ screenshot index. The supported,
 * 100%-verifiable pattern is one `toHaveScreenshot()` per test.
 */
function printMultiSnapshotWarning(files: string[]): void {
  if (files.length === 0) return;
  const unique = [
    ...new Set(
      files.map((f) => `${path.basename(path.dirname(f))}/${path.basename(f)}`),
    ),
  ].sort();
  console.log(
    `\n${C.yellow}${C.bold}⚠ ${unique.length} snapshot(s) use a multi-screenshot index (-2, -3, ...).${C.reset}`,
  );
  console.log(
    `${C.dim}  Prefer a single toHaveScreenshot() per test. Move extra screenshots into their own tests so each name maps to one test title.${C.reset}`,
  );
  for (const f of unique) {
    console.log(`${C.dim}-${C.reset} ${f}`);
  }
}

const program = new Command();

program
  .name('playwright-stale-snapshots')
  .description(
    'Detect (and optionally delete) stale Playwright screenshot snapshots',
  )
  .option('--delete', 'Delete stale snapshots (refused in CI)', false)
  .option('--project <name>', 'Limit to a single Playwright project')
  .option(
    '--config <path>',
    'Path to a Playwright config file (passed to playwright test --config)',
  )
  .option(
    '--snapshots-dir <path>',
    'Path to snapshots directory (defaults to ./snapshots)',
  )
  .option(
    '--dir <path>',
    'Playwright project directory (defaults to process.cwd())',
  )
  .option(
    '--ignore <patterns...>',
    'Snapshot file names or glob patterns to exclude from stale detection',
  );

program.action(
  async (options: {
    delete?: boolean;
    project?: string;
    config?: string;
    snapshotsDir?: string;
    dir?: string;
    ignore?: string[];
  }) => {
    try {
      const cwd = options.dir
        ? path.resolve(process.cwd(), options.dir)
        : process.cwd();

      const result = await findStaleSnapshots({
        cwd,
        snapshotsDir: options.snapshotsDir,
        delete: Boolean(options.delete),
        project: options.project,
        config: options.config,
        ignore: options.ignore,
      });

      if (result.staleFiles.length === 0) {
        console.log(
          `${C.green}${C.bold}✓${C.reset} No stale snapshots found (${result.totalFiles} total)`,
        );
      } else {
        const action = result.deleted ? 'DELETED' : 'FOUND';
        const actionColor = result.deleted ? C.green : C.red;
        console.log(
          `${actionColor}${C.bold}${action}${C.reset} - found ${C.red}${C.bold}${result.staleFiles.length}${C.reset} stale snapshot(s) out of ${result.totalFiles} total`,
        );

        console.log(`\n${C.yellow}Stale snapshots:${C.reset}`);
        for (const f of result.staleFiles) {
          console.log(`${C.dim}-${C.reset} ${path.relative(cwd, f)}`);
        }

        if (result.deleted) {
          console.log(
            `\n${C.green}${C.bold}✓${C.reset} Deleted ${result.staleFiles.length} file(s)`,
          );
        } else {
          console.log(
            `\n${C.cyan}${C.bold}To remove these stale snapshots, run:${C.reset}`,
          );
          console.log(
            `  ${C.bold}npx playwright-stale-snapshots --delete${C.reset}\n`,
          );
        }
      }

      printMultiSnapshotWarning(result.multiSnapshotFiles);

      if (result.staleFiles.length > 0 && !result.deleted) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(
        error instanceof Error ? error.stack || error.message : String(error),
      );
      process.exit(1);
    }
  },
);

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
