import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  identifyStaleFiles,
  matchesAnyExpectedPrefix,
  parseSnapshotIndex,
  titlePathToPrefix,
} from './internals.ts';

const PLAYWRIGHT_TRIM_HASH = /-[a-f0-9]{5}-/;

const SHORT_SCREENSHOT_TITLE =
  'column headers remain visible on narrow screens';

/** Long enough to force Playwright's trimLongString hash segment after sanitization. */
const LONG_SCREENSHOT_TITLE = `${SHORT_SCREENSHOT_TITLE} when the dataset title is Alpha bravo Charlie delta Echo foxtrot Golf hotel India juliet Kilo lima Mike november Oscar papa Quebec`;

describe('titlePathToPrefix', () => {
  it('builds short names the same way Playwright does', () => {
    assert.equal(
      titlePathToPrefix([
        'LoginForm',
        'visual regression',
        'default appearance',
      ]),
      'LoginForm-visual-regression-default-appearance-1',
    );
    assert.equal(
      titlePathToPrefix(['LoginForm', 'visual regression', 'dark mode']),
      'LoginForm-visual-regression-dark-mode-1',
    );
  });

  it('inserts a hash segment when the title exceeds 100 characters', () => {
    const prefix = titlePathToPrefix(['DataTable', LONG_SCREENSHOT_TITLE]);
    assert.equal(prefix.length, 100);
    assert.match(prefix, PLAYWRIGHT_TRIM_HASH);
  });
});

describe('matchesAnyExpectedPrefix', () => {
  it('matches exact Playwright snapshot file names', () => {
    const prefix = titlePathToPrefix([
      'LoginForm',
      'visual regression',
      'default appearance',
    ]);
    assert.equal(
      matchesAnyExpectedPrefix(`${prefix}.png`, new Set([prefix])),
      true,
    );
  });

  it('does not treat renamed shorter snapshots as valid for long prefixes', () => {
    const obsoletePrefix = titlePathToPrefix([
      'DataTable',
      SHORT_SCREENSHOT_TITLE,
    ]);
    const currentPrefix = titlePathToPrefix([
      'DataTable',
      LONG_SCREENSHOT_TITLE,
    ]);
    assert.notEqual(obsoletePrefix, currentPrefix);
    assert.equal(
      matchesAnyExpectedPrefix(
        `${obsoletePrefix}.png`,
        new Set([currentPrefix]),
      ),
      false,
    );
  });

  it('matches every screenshot index a single test produces', () => {
    // One expected prefix (index 1); a test taking multiple screenshots writes
    // ...-1.png, ...-2.png, etc. All must be recognized as belonging to it.
    const prefix = titlePathToPrefix(['DurationPicker', 'CustomOptions']);
    assert.equal(
      matchesAnyExpectedPrefix(
        'DurationPicker-CustomOptions-1.png',
        new Set([prefix]),
      ),
      true,
    );
    assert.equal(
      matchesAnyExpectedPrefix(
        'DurationPicker-CustomOptions-2.png',
        new Set([prefix]),
      ),
      true,
    );
  });

  it('matches hashed snapshot file names for long title paths', () => {
    const prefix = titlePathToPrefix(['DataTable', LONG_SCREENSHOT_TITLE]);
    assert.match(prefix, PLAYWRIGHT_TRIM_HASH);
    assert.equal(
      matchesAnyExpectedPrefix(`${prefix}.png`, new Set([prefix])),
      true,
    );
  });
});

describe('parseSnapshotIndex', () => {
  it('reads the trailing screenshot index, defaulting to 1', () => {
    assert.equal(parseSnapshotIndex('DurationPicker-CustomOptions-1.png'), 1);
    assert.equal(parseSnapshotIndex('DurationPicker-CustomOptions-2.png'), 2);
    assert.equal(parseSnapshotIndex('heading.png'), 1);
  });
});

describe('identifyStaleFiles', () => {
  const root = path.resolve('/snapshots');
  const png = (project: string, name: string) =>
    path.join(root, project, 'atoms', 'widget.spec.ts', `${name}.png`);
  const bucket = (project: string) => `${project}/atoms/widget.spec.ts`;

  it('flags snapshots that match no known test as stale', () => {
    const expected = new Map([
      [bucket('chromium'), new Set(['Widget-Current-1'])],
    ]);
    const { stale } = identifyStaleFiles(root, expected, [
      png('chromium', 'Widget-Current-1'),
      png('chromium', 'Widget-Removed-1'),
    ]);
    assert.deepEqual(stale, [png('chromium', 'Widget-Removed-1')]);
  });

  it('keeps every index of a known test but reports index >= 2', () => {
    const expected = new Map([
      [bucket('chromium'), new Set(['Widget-Custom-1'])],
    ]);
    const { stale, multiSnapshot } = identifyStaleFiles(root, expected, [
      png('chromium', 'Widget-Custom-1'),
      png('chromium', 'Widget-Custom-2'),
    ]);
    assert.deepEqual(stale, []);
    assert.deepEqual(multiSnapshot, [png('chromium', 'Widget-Custom-2')]);
  });

  it('skips snapshots covered by ignore patterns', () => {
    const expected = new Map([[bucket('chromium'), new Set(['Widget-A-1'])]]);
    const { stale } = identifyStaleFiles(
      root,
      expected,
      [png('chromium', 'custom-logo')],
      { ignorePatterns: ['custom-*.png'] },
    );
    assert.deepEqual(stale, []);
  });
});
