# @test-fusion/playwright-stale-snapshots

Detect and clean stale Playwright screenshot snapshots.

Playwright doesn't track whether screenshot snapshots still belong to an existing test. When you rename or delete a test, its snapshot files stay behind in the snapshots directory, silently accumulating over time.

This package fills that gap. It runs `playwright test --list --reporter=json` to discover which snapshots are expected, compares that with the actual `.png` files on disk, and reports (or deletes) the ones that no longer match any test.

The detection is **fully deterministic — it never reads or parses your test source code.** Expected names are reproduced exactly the way Playwright generates them, so the result is 100% accurate *as long as you follow the [rules below](#rules-for-100-accurate-detection)*.

## Install

```bash
npm install -D @test-fusion/playwright-stale-snapshots
```

## Usage

```bash
npx playwright-stale-snapshots                          # list stale files (exits 1 if any found)
npx playwright-stale-snapshots --delete                 # remove stale files (refused in CI)
npx playwright-stale-snapshots --dir path/to/project    # Playwright project directory
npx playwright-stale-snapshots --project chromium       # limit to a single Playwright project
npx playwright-stale-snapshots --config path/to/config  # Playwright config file
npx playwright-stale-snapshots --snapshots-dir path     # custom snapshots directory
npx playwright-stale-snapshots --ignore "custom-*.png"  # declare names the tool can't derive
```

## Rules for 100% accurate detection

The tool only knows what `playwright test --list` tells it: **test titles**. It derives the snapshot name from the title exactly as Playwright does. To stay accurate, your snapshots must be derivable from titles. Follow these rules.

### 1. Use the deterministic snapshot path template

Configure Playwright with:

```ts
// playwright.config.ts
snapshotPathTemplate: '{snapshotDir}/{projectName}/{testFileDir}/{testFileName}/{arg}{ext}',
```

### 2. Prefer anonymous snapshots (one per test)

```ts
test('renders the danger banner', async ({ page }) => {
  await expect(page).toHaveScreenshot();          // ✓ name derived from the test title
});
```

Anonymous snapshots are named from the test title path, so the tool reproduces them exactly — including Playwright's hashing of long (>100 char) titles.

### 3. Avoid multiple `toHaveScreenshot()` calls in one test

Playwright appends an incrementing index per call (`...-1.png`, `...-2.png`, …). The `-1` is verified against the test title; **`-2`, `-3`, … cannot be tied back to a distinct title**, so the tool can't tell a legitimate second screenshot from a leftover one.

The tool **keeps** these files (it won't flag them stale) but **warns** so you can split them:

```ts
// ⚠ warns: two snapshots in one test
test('duration picker', async ({ page }) => {
  await expect(page).toHaveScreenshot();   // ...-1.png
  await page.getByRole('option').click();
  await expect(page).toHaveScreenshot();   // ...-2.png  ← warned
});

// ✓ preferred: one screenshot per test
test('duration picker - initial', async ({ page }) => {
  await expect(page).toHaveScreenshot();
});
test('duration picker - after select', async ({ page }) => {
  await page.getByRole('option').click();
  await expect(page).toHaveScreenshot();
});
```

### 4. Declare custom names with `--ignore`

A custom name passed to `toHaveScreenshot('name.png')` is **not** in the test title, so it never appears in `--list`. The tool will not guess it from source — you must declare it (a name or glob):

```ts
await expect(page).toHaveScreenshot('landing.png');
await expect(page).toHaveScreenshot(`custom-${id}.png`);
```

```bash
npx playwright-stale-snapshots --ignore "landing.png" "custom-*.png"
```

Anything matched by `--ignore` is excluded from stale detection. Custom names that are **not** declared will be reported as stale.

## Programmatic API

```ts
import { findStaleSnapshots } from '@test-fusion/playwright-stale-snapshots';

const result = await findStaleSnapshots({
  cwd: './path/to/playwright/project',
  delete: false,
  project: 'chromium',
  ignore: ['landing.png', 'custom-*.png'],
});

console.log(result.staleFiles);          // absolute paths to stale .png files
console.log(result.multiSnapshotFiles);  // valid files with index >= 2 (multiple per test)
console.log(result.totalFiles);          // total snapshot count
console.log(result.deleted);             // whether files were deleted
```

## License

MIT
