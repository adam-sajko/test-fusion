import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
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

const require = createRequire(import.meta.url);

const sanitizeForFilePath: (input: string) => string = (() => {
  try {
    const utils = require('playwright-core/lib/utils') as {
      sanitizeForFilePath?: (s: string) => string;
    };
    if (typeof utils?.sanitizeForFilePath === 'function') {
      return utils.sanitizeForFilePath;
    }
  } catch {
    // playwright-core not installed, using fallback sanitizer
  }
  return (input: string) =>
    String(input)
      .trim()
      .replace(/['"]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
})();

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

export function sanitizeForSnapshotArg(part: string) {
  return sanitizeForFilePath(String(part));
}

export function titlePathToPrefix(titlePath: string[]) {
  return titlePath
    .filter(Boolean)
    .map(sanitizeForSnapshotArg)
    .filter(Boolean)
    .join('-')
    .replace(/^-+|-+$/g, '');
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

const TRIM_HASH_START = Math.floor((100 - 7) / 2);

export function matchesAnyExpectedPrefix(
  fileName: string,
  expectedPrefixes: Set<string>,
) {
  const base = fileName.endsWith('.png') ? fileName.slice(0, -4) : fileName;
  for (const prefix of expectedPrefixes) {
    if (base === prefix) return true;
    // Playwright appends "-1", "-2", etc. for each toHaveScreenshot() call
    if (
      base.startsWith(`${prefix}-`) &&
      /^\d+$/.test(base.slice(prefix.length + 1))
    ) {
      return true;
    }
    if (prefix.length > 100 && base.length >= TRIM_HASH_START) {
      const commonStart = prefix.substring(0, TRIM_HASH_START);
      if (base.startsWith(commonStart)) return true;
    }
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

export function identifyStaleFiles(
  snapshotsRoot: string,
  expected: Map<string, Set<string>>,
  pngs: string[],
): string[] {
  const stale: string[] = [];
  for (const png of pngs) {
    const parsed = snapshotPathToBucketKey(snapshotsRoot, png);
    if (!parsed) continue;

    const expectedPrefixes = expected.get(parsed.bucketKey);
    if (!expectedPrefixes || expectedPrefixes.size === 0) {
      stale.push(png);
      continue;
    }
    if (!matchesAnyExpectedPrefix(parsed.fileName, expectedPrefixes)) {
      stale.push(png);
    }
  }

  stale.sort((a, b) => a.localeCompare(b));
  return stale;
}
