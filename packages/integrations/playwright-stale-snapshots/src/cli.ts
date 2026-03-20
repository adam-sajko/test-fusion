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

const program = new Command();

program
  .name('playwright-stale-snapshots')
  .description(
    'Detect (and optionally delete) stale Playwright screenshot snapshots',
  )
  .option('--delete', 'Delete stale snapshots (refused in CI)', false)
  .option('--project <name>', 'Limit to a single Playwright project')
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
    snapshotsDir?: string;
    dir?: string;
    ignore?: string[];
  }) => {
    try {
      const cwd = options.dir
        ? path.resolve(process.cwd(), options.dir)
        : (process.env.PROJECT_CWD ?? process.env.INIT_CWD ?? process.cwd());
      const snapshotsDir = options.snapshotsDir
        ? path.resolve(cwd, options.snapshotsDir)
        : undefined;

      const result = await findStaleSnapshots({
        cwd,
        snapshotsDir,
        delete: Boolean(options.delete),
        project: options.project,
        ignore: options.ignore,
      });

      if (result.staleFiles.length === 0) {
        console.log(
          `${C.green}${C.bold}✓${C.reset} No stale snapshots found (${result.totalFiles} total)`,
        );
        return;
      }

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
