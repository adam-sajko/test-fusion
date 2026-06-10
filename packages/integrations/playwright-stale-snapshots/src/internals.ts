import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type JsonReport = {
  suites?: JsonSuite[];
};

export type JsonSuite = {
  title?: string;
  file?: string;
  suites?: JsonSuite[];
  specs?: JsonSpec[];
};

export type JsonSpec = {
  title: string;
  file?: string;
  tests?: Array<{ projectName?: string }>;
};

function sanitizeForFilePath(input: string): string {
  return String(input).replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: mirrors Playwright fileUtils.sanitizeForFilePath
    /[\x00-\x2C\x2E-\x2F\x3A-\x40\x5B-\x60\x7B-\x7F]+/g,
    '-',
  );
}

export function calculateSha1(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

export function trimLongString(s: string, length = 100): string {
  if (s.length <= length) return s;
  const hash = calculateSha1(s);
  const middle = `-${hash.substring(0, 5)}-`;
  const start = Math.floor((length - middle.length) / 2);
  const end = length - middle.length - start;
  return s.substring(0, start) + middle + s.slice(-end);
}

/**
 * Mirrors Playwright `{arg}` for anonymous `toHaveScreenshot()` calls:
 * title path joined with spaces, snapshot index appended, trimmed, then sanitized.
 */
export function titlePathToPrefix(titlePath: string[], snapshotIndex = 1) {
  const fullTitle = [...titlePath.filter(Boolean), String(snapshotIndex)].join(
    ' ',
  );
  if (!fullTitle) return '';
  return sanitizeForFilePath(trimLongString(fullTitle));
}

export function looksLikeTestFileTitle(title: unknown): title is string {
  if (!title || typeof title !== 'string') return false;
  return /\.(spec|test)\.[jt]sx?$/.test(title);
}

export async function pathExists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function collectExpectedPrefixes(
  report: JsonReport,
  snapshotsRoot: string,
) {
  const expected = new Map<string, Set<string>>();

  async function walkSuite(
    suite: JsonSuite,
    titlePath: string[],
    currentFileRel: string | null,
  ) {
    const suiteTitle = suite?.title;
    const isFileSuite = looksLikeTestFileTitle(suiteTitle);
    const nextTitlePath =
      suiteTitle && !isFileSuite ? [...titlePath, suiteTitle] : titlePath;
    const nextFileRel =
      (isFileSuite ? suiteTitle : null) ??
      suite?.file ??
      currentFileRel ??
      null;

    for (const spec of suite?.specs ?? []) {
      const fullTitlePath = [...nextTitlePath, spec.title].filter(Boolean);
      const prefix = titlePathToPrefix(fullTitlePath);
      if (!prefix) continue;

      const file = spec.file ?? nextFileRel;
      if (!file) continue;

      for (const test of spec.tests ?? []) {
        const projectName = test.projectName;
        if (!projectName) continue;

        const fileRelCandidates: string[] = [file];
        const firstSlash = file.indexOf('/');
        if (firstSlash !== -1) {
          fileRelCandidates.push(file.slice(firstSlash + 1));
        }

        let chosenFileRel = file;
        for (const candidate of fileRelCandidates) {
          const testFileName = path.posix.basename(candidate);
          const testFileDir = path.posix.dirname(candidate);
          const candidateDir = path.join(
            snapshotsRoot,
            projectName,
            testFileDir === '.' ? '' : testFileDir,
            testFileName,
          );
          if (await pathExists(candidateDir)) {
            chosenFileRel = candidate;
            break;
          }
        }

        const testFileName = path.posix.basename(chosenFileRel);
        const testFileDir = path.posix.dirname(chosenFileRel);

        const bucketKey = [
          projectName,
          testFileDir === '.' ? '' : testFileDir,
          testFileName,
        ]
          .filter(Boolean)
          .join('/');

        if (!expected.has(bucketKey)) {
          expected.set(bucketKey, new Set());
        }
        expected.get(bucketKey)?.add(prefix);
      }
    }

    for (const child of suite?.suites ?? []) {
      await walkSuite(child, nextTitlePath, nextFileRel);
    }
  }

  for (const top of report?.suites ?? []) {
    await walkSuite(top, [], null);
  }

  return expected;
}

export async function listAllSnapshotPngs(
  snapshotsRoot: string,
  project?: string,
): Promise<string[]> {
  const out: string[] = [];

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (ent) => {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) return walk(full);
        if (ent.isFile() && ent.name.toLowerCase().endsWith('.png')) {
          out.push(full);
        }
      }),
    );
  }

  const rootEntries = await fs.readdir(snapshotsRoot, { withFileTypes: true });
  for (const ent of rootEntries) {
    if (!ent.isDirectory()) continue;
    if (project && ent.name !== project) continue;
    await walk(path.join(snapshotsRoot, ent.name));
  }

  return out;
}

export function snapshotPathToBucketKey(
  snapshotsRoot: string,
  pngAbsPath: string,
) {
  const rel = path.relative(snapshotsRoot, pngAbsPath);
  const parts = rel.split(/[\\/]/);
  if (parts.length < 3) return null;

  // biome-ignore lint/style/noNonNullAssertion: length checked above
  const projectName = parts[0]!;
  // biome-ignore lint/style/noNonNullAssertion: length checked above
  const fileName = parts[parts.length - 1]!;
  // biome-ignore lint/style/noNonNullAssertion: length checked above
  const testFileName = parts[parts.length - 2]!;
  const testFileDir = parts.length > 3 ? parts.slice(1, -2).join('/') : '';

  const bucketKey = [projectName, testFileDir, testFileName]
    .filter(Boolean)
    .join('/');

  return { bucketKey, fileName };
}

/** Trailing `-1`, `-2`, ... that Playwright appends per `toHaveScreenshot()` call. */
const SNAPSHOT_INDEX_SUFFIX = /-\d+$/;

export function matchesAnyExpectedPrefix(
  fileName: string,
  expectedPrefixes: Set<string>,
) {
  const base = fileName.endsWith('.png') ? fileName.slice(0, -4) : fileName;
  // A test can call toHaveScreenshot() multiple times, producing `...-1`,
  // `...-2`, etc. Ignore that index so every screenshot of a known test matches.
  const baseStem = base.replace(SNAPSHOT_INDEX_SUFFIX, '');
  for (const prefix of expectedPrefixes) {
    if (base === prefix) return true;
    if (baseStem === prefix.replace(SNAPSHOT_INDEX_SUFFIX, '')) return true;
  }
  return false;
}

export function runPlaywrightListJson(opts: {
  cwd: string;
  project?: string;
}): JsonReport {
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const pwArgs = ['playwright', 'test', '--list', '--reporter=json'];
  if (opts.project) {
    pwArgs.push(`--project=${opts.project}`);
  }

  const res = spawnSync(cmd, pwArgs, {
    cwd: opts.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (res.status !== 0) {
    throw new Error(
      [
        'Failed to run Playwright list',
        `command: ${cmd} ${pwArgs.join(' ')}`,
        res.stderr?.trim() ? `stderr:\n${res.stderr.trim()}` : '',
        res.stdout?.trim() ? `stdout:\n${res.stdout.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  }

  const stdout = (res.stdout || '').trim();
  if (!stdout) {
    throw new Error(
      'Playwright returned empty output; expected JSON on stdout',
    );
  }

  return JSON.parse(stdout) as JsonReport;
}

/** Playwright's trailing screenshot index (`...-1`, `...-2`, ...). Defaults to 1. */
export function parseSnapshotIndex(fileName: string): number {
  const base = fileName.endsWith('.png') ? fileName.slice(0, -4) : fileName;
  const match = base.match(/-(\d+)$/);
  return match ? Number(match[1]) : 1;
}

export interface StaleScanResult {
  /** Snapshots on disk that match no known test. */
  stale: string[];
  /** Valid snapshots with an index >= 2 (a test took more than one screenshot). */
  multiSnapshot: string[];
}

export function identifyStaleFiles(
  snapshotsRoot: string,
  expected: Map<string, Set<string>>,
  pngs: string[],
  options?: { ignorePatterns?: string[] },
): StaleScanResult {
  const stale: string[] = [];
  const multiSnapshot: string[] = [];
  for (const png of pngs) {
    const parsed = snapshotPathToBucketKey(snapshotsRoot, png);
    if (!parsed) continue;

    // Custom (non-title-derived) names can't be known from `playwright --list`;
    // they must be declared via --ignore, otherwise they count as stale.
    if (
      options?.ignorePatterns?.length &&
      matchesIgnorePattern(parsed.fileName, options.ignorePatterns)
    ) {
      continue;
    }

    const expectedPrefixes = expected.get(parsed.bucketKey);
    if (!expectedPrefixes || expectedPrefixes.size === 0) {
      stale.push(png);
      continue;
    }
    if (!matchesAnyExpectedPrefix(parsed.fileName, expectedPrefixes)) {
      stale.push(png);
      continue;
    }

    // Valid, but a 2nd+ screenshot of the same test: discourage it because the
    // `-2`, `-3`, ... index can't be verified against a single test title.
    if (parseSnapshotIndex(parsed.fileName) > 1) {
      multiSnapshot.push(png);
    }
  }

  stale.sort((a, b) => a.localeCompare(b));
  multiSnapshot.sort((a, b) => a.localeCompare(b));
  return { stale, multiSnapshot };
}

export function matchesIgnorePattern(
  fileName: string,
  patterns: string[],
): boolean {
  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      if (new RegExp(`^${escaped}$`).test(fileName)) return true;
    } else {
      if (fileName === pattern) return true;
    }
  }
  return false;
}
