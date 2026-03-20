# @test-fusion/playwright-stale-snapshots

Detect and clean stale Playwright screenshot snapshots.

Playwright doesn't track whether screenshot snapshots still belong to an existing test. When you rename or delete a test, its snapshot files stay behind in the snapshots directory, silently accumulating over time.

This package fills that gap. It runs `playwright test --list --reporter=json` to discover which snapshots are expected, compares that with the actual `.png` files on disk, and reports (or deletes) the ones that no longer match any test. It handles Playwright's filename hashing for long test titles, so truncated snapshot names are matched correctly.

## Install

```bash
npm install -D @test-fusion/playwright-stale-snapshots
```

## Usage

```bash
npx playwright-stale-snapshots                        # list stale files (exits 1 if any found)
npx playwright-stale-snapshots --delete               # remove stale files (refused in CI)
npx playwright-stale-snapshots --dir path/to/project  # specify Playwright project directory
npx playwright-stale-snapshots --project chromium     # limit to a single Playwright project
npx playwright-stale-snapshots --snapshots-dir path   # custom snapshots directory
npx playwright-stale-snapshots --ignore "custom-*.png"  # exclude from detection
```

## Custom Snapshot Names

By default, Playwright derives snapshot file names from the test title path. This tool detects those automatically.

When you pass a custom name directly to `toHaveScreenshot()`, the tool also picks it up by scanning test source files:

```ts
await expect(page).toHaveScreenshot('landing.png');    // ✓ auto-detected
await expect(page).toHaveScreenshot("dashboard.png");  // ✓ auto-detected
```

If a custom name can't be extracted from the source code, use `--ignore`:

```ts
await expect(page).toHaveScreenshot(`custom-${name}.png`);  // ✗ can't be extracted
```

```bash
npx playwright-stale-snapshots --ignore "custom-*.png"
```

## Programmatic API

```ts
import { findStaleSnapshots } from '@test-fusion/playwright-stale-snapshots';

const result = await findStaleSnapshots({
  cwd: './path/to/playwright/project',
  delete: false,
  project: 'chromium',
  ignore: ['custom-*.png'],
});

console.log(result.staleFiles);  // absolute paths to stale .png files
console.log(result.totalFiles);  // total snapshot count
console.log(result.deleted);     // whether files were deleted
```

## Note

Both auto-generated snapshot names (derived from test titles) and custom names passed as string literals to `toHaveScreenshot('name.png')` are detected automatically. If a custom name can't be extracted from the source code, use the `--ignore` flag.

## License

MIT
