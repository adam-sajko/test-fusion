import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TransformOptions } from '@babel/core';
import type { TestInfo } from '@playwright/test';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
} from '@playwright/test/reporter';
import fg from 'fast-glob';
import type {
  CoverageMap,
  CoverageMapData,
  FileCoverageData,
} from 'istanbul-lib-coverage';
import istanbulCoverage from 'istanbul-lib-coverage';

interface NormalizedCoverageData extends FileCoverageData {
  l?: Record<string, number>;
  _coverageSchema?: string;
  hash?: string;
}

function printMuted(message: string): void {
  console.log(`\x1b[90m${message}\x1b[0m`);
}

function printStatus(
  message: string,
  status: 'success' | 'warning' | 'error' | 'neutral' = 'neutral',
  details?: string,
): void {
  if (status === 'success') {
    console.log(`\x1b[32m  ✓  \x1b[0m${message}`);
  } else if (status === 'warning') {
    console.log(`\x1b[33m  ⚠  \x1b[0m${message}`);
  } else if (status === 'error') {
    console.log(`\x1b[31m  ✗  \x1b[0m${message}`);
  } else {
    console.log(`\x1b[90m  •  \x1b[0m${message}`);
  }
  if (details) {
    console.log(`\x1b[90m     (${details})\x1b[0m`);
  }
}

function applyStandardNormalization(filePath: string): string {
  return filePath.replace(/^\/+/, '').split(path.sep).join('/');
}

function normalizeFilePath(
  filePath: string,
  cwd: string,
  transformPath?: (filePath: string, cwd: string) => string,
): string {
  let transformedPath = filePath;

  if (transformPath) {
    transformedPath = transformPath(filePath, cwd);
  } else {
    const normalizedRoot = cwd.endsWith('/') ? cwd : `${cwd}/`;
    if (transformedPath.startsWith(normalizedRoot)) {
      transformedPath = transformedPath.slice(normalizedRoot.length);
    } else if (transformedPath === cwd) {
      transformedPath = '';
    }
  }

  return applyStandardNormalization(transformedPath);
}

function normalizeCoverageData(
  coverageData: CoverageMapData,
  cwd: string,
  transformPath?: (filePath: string, cwd: string) => string,
): CoverageMapData {
  const normalizedCoverage: CoverageMapData = {};

  for (const [filePath, coverage] of Object.entries(coverageData)) {
    const normalizedPath = normalizeFilePath(filePath, cwd, transformPath);
    normalizedCoverage[normalizedPath] = {
      ...coverage,
      path: normalizedPath,
      statementMap: coverage.statementMap || {},
      fnMap: coverage.fnMap || {},
      branchMap: coverage.branchMap || {},
      s: coverage.s || {},
      f: coverage.f || {},
      b: coverage.b || {},
    };
  }

  return normalizedCoverage;
}

function resetCoverageData<T extends NormalizedCoverageData>(
  coverageData: T,
): T {
  const zeroCoverageData: T = {
    ...coverageData,
    statementMap: coverageData.statementMap || {},
    fnMap: coverageData.fnMap || {},
    branchMap: coverageData.branchMap || {},
    s: {},
    f: {},
    b: {},
    l: {},
  };

  const statementIds = Object.keys(zeroCoverageData.statementMap);
  for (const statementId of statementIds) {
    zeroCoverageData.s[statementId] = 0;
  }

  const functionIds = Object.keys(zeroCoverageData.fnMap);
  for (const functionId of functionIds) {
    zeroCoverageData.f[functionId] = 0;
  }

  const branchIds = Object.keys(zeroCoverageData.branchMap);
  for (const branchId of branchIds) {
    const branchInfo = zeroCoverageData.branchMap[branchId];
    if (branchInfo && Array.isArray(branchInfo.locations)) {
      zeroCoverageData.b[branchId] = new Array(
        branchInfo.locations.length,
      ).fill(0);
    }
  }

  for (const statementId of statementIds) {
    const statementInfo = zeroCoverageData.statementMap[statementId];
    if (statementInfo?.start?.line) {
      (zeroCoverageData.l as Record<string, number>)[
        statementInfo.start.line.toString()
      ] = 0;
    }
  }

  return zeroCoverageData;
}

function prepareDirectory(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    for (const entry of fs.readdirSync(dirPath)) {
      fs.rmSync(path.join(dirPath, entry), { recursive: true, force: true });
    }
  } else {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Per-run scratch directory holding each test's raw coverage as a `.json` file.
 * Derived from Playwright's `rootDir` so the fixture (`testInfo.config.rootDir`)
 * and the reporter (`config.rootDir`) resolve the same path without sharing any
 * options. Created at the start of the run and removed once merged, so it stays
 * out of the Playwright report output.
 */
function coverageSidecarDir(
  rootDir: string,
  shard?: { current: number } | null,
): string {
  const name = shard
    ? `.coverage-sidecar-${shard.current}`
    : '.coverage-sidecar';
  return path.join(rootDir, name);
}

function getCoverageFinalFile(
  coverageDir: string,
  shard?: { current: number } | null,
): string {
  const name = shard
    ? `coverage-shard-${shard.current}.json`
    : 'coverage-final.json';
  return path.resolve(coverageDir, name);
}

function getExpectedCoverageFile(coverageDir: string): string {
  return path.resolve(coverageDir, 'coverage-zero.json');
}

async function collectCoverageStructure(
  filePaths: string[],
  cwd: string,
  getBabelConfig: () => Promise<TransformOptions> | TransformOptions,
  transformPath?: (filePath: string, cwd: string) => string,
): Promise<CoverageMapData> {
  const babel = await import('@babel/core');
  const { readInitialCoverage } = await import('istanbul-lib-instrument');

  const expectedCoverage: CoverageMapData = {};

  for (const filePath of filePaths) {
    const fullPath = path.resolve(cwd, filePath);

    if (!fs.existsSync(fullPath)) {
      continue;
    }

    try {
      const sourceCode = fs.readFileSync(fullPath, 'utf8');
      const babelConfig = await getBabelConfig();

      const transformResult = await babel.transformAsync(sourceCode, {
        filename: fullPath,
        ast: true,
        ...babelConfig,
      });

      if (!transformResult?.ast) {
        console.warn(`Babel transformation failed for ${filePath}`);
        continue;
      }

      const initialCoverage = readInitialCoverage(
        transformResult.ast as unknown as string,
      );

      if (initialCoverage?.coverageData) {
        const coverageData = initialCoverage.coverageData;
        const normalizedPath = normalizeFilePath(fullPath, cwd, transformPath);

        const resetData = resetCoverageData(coverageData);

        const expectedCoverageData: NormalizedCoverageData = {
          ...resetData,
          path: normalizedPath,
        };

        if ('_coverageSchema' in coverageData) {
          expectedCoverageData._coverageSchema =
            coverageData._coverageSchema as string;
        }
        if ('hash' in initialCoverage) {
          expectedCoverageData.hash = initialCoverage.hash as string;
        }

        expectedCoverage[normalizedPath] = expectedCoverageData;
      }
    } catch (error) {
      console.error(
        `Failed to instrument file ${filePath}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return expectedCoverage;
}

async function instrumentExpectedFiles(
  cwd: string,
  coverageDir: string,
  collectCoverageFrom: string[],
  getBabelConfig: () => Promise<TransformOptions> | TransformOptions,
  transformPath?: (filePath: string, cwd: string) => string,
): Promise<void> {
  const expectedFiles = await fg(collectCoverageFrom, {
    onlyFiles: true,
    unique: true,
    cwd,
  });

  if (expectedFiles.length === 0) {
    return;
  }

  const coverageStructure = await collectCoverageStructure(
    expectedFiles,
    cwd,
    getBabelConfig,
    transformPath,
  );

  const expectedCoverageFile = path.resolve(coverageDir, 'coverage-zero.json');
  fs.mkdirSync(coverageDir, { recursive: true });
  fs.writeFileSync(expectedCoverageFile, JSON.stringify(coverageStructure));
}

function generateIstanbulCoverageReport(
  cwd: string,
  coverageDir: string,
  rootDir: string,
  transformPath: ((filePath: string, cwd: string) => string) | undefined,
  shard: { current: number; total: number } | null,
) {
  printMuted('\n\nGenerating Istanbul coverage report...');

  const sidecarDir = coverageSidecarDir(rootDir, shard);
  const rawFiles = fs.existsSync(sidecarDir)
    ? fs.readdirSync(sidecarDir).filter((f) => f.endsWith('.json'))
    : [];

  const map: CoverageMap = istanbulCoverage.createCoverageMap({});
  for (const rawFile of rawFiles) {
    try {
      const slice = JSON.parse(
        fs.readFileSync(path.join(sidecarDir, rawFile), 'utf8'),
      ) as CoverageMapData;
      map.merge(slice);
    } catch (e) {
      console.warn(`Failed to parse coverage file ${rawFile}:`, e);
    }
  }

  const finalCoverage = map.toJSON();
  const normalizedCoverage = normalizeCoverageData(
    finalCoverage,
    cwd,
    transformPath,
  );

  const expectedCoverageFile = getExpectedCoverageFile(coverageDir);
  if (fs.existsSync(expectedCoverageFile)) {
    try {
      const expectedCoverage = JSON.parse(
        fs.readFileSync(expectedCoverageFile, 'utf8'),
      ) as CoverageMapData;

      for (const [filePath, expectedCoverageData] of Object.entries(
        expectedCoverage,
      )) {
        if (!normalizedCoverage[filePath]) {
          normalizedCoverage[filePath] = expectedCoverageData;
        }
      }
    } catch (error) {
      console.warn('Failed to load expected files coverage data:', error);
    }
  }

  const coverageFinalFile = getCoverageFinalFile(coverageDir, shard);
  fs.mkdirSync(coverageDir, { recursive: true });
  fs.writeFileSync(coverageFinalFile, JSON.stringify(normalizedCoverage));
  printStatus('Generated JSON report', 'success', coverageFinalFile);

  fs.rmSync(sidecarDir, { recursive: true, force: true });
}

/** Per-project coverage configuration for offline zero-coverage instrumentation. */
export interface CoverageProject {
  /** Glob patterns (with `!` negations) selecting source files to instrument for this project. */
  collectCoverageFrom: string[];
  /** Babel config for offline zero-coverage instrumentation. Must include `babel-plugin-istanbul`. When omitted, no zero-coverage baseline is generated for this project. */
  getBabelConfig?: () => Promise<TransformOptions> | TransformOptions;
}

export interface PlaywrightCoverageReporterOptions {
  /** Base directory for resolving globs and normalizing file paths. Defaults to Playwright's `rootDir` (the directory containing `playwright.config.ts`). */
  cwd?: string;
  /** Directory where coverage artifacts (the final report and zero-coverage baseline) are written. Resolved relative to `cwd`. */
  coverageDir: string;
  /** Optional path transform applied when normalizing file paths in coverage data. Useful for Docker or monorepo setups where absolute paths differ between environments. */
  transformPath?: (filePath: string, cwd: string) => string;
  /**
   * Per-project coverage configuration. Each entry defines a set of source
   * files and an optional Babel config for offline zero-coverage baselines.
   * When `getBabelConfig` is provided, files not visited by any test appear
   * in the report with 0% coverage.
   */
  projects?: CoverageProject[];
}

/**
 * Records a test's Istanbul coverage so the reporter can merge it in `onEnd`.
 *
 * Read the coverage global in a fixture (e.g.
 * `await page.evaluate(() => window.__coverage__)`, matching your
 * `coverageVariable`) and pass it here. The destination is derived from
 * `testInfo.config.rootDir`, so no options are needed. Does nothing when
 * `coverage` is empty.
 */
export function recordCoverage(testInfo: TestInfo, coverage: unknown): void {
  if (!coverage) return;

  const dir = coverageSidecarDir(
    testInfo.config.rootDir,
    testInfo.config.shard,
  );
  fs.mkdirSync(dir, { recursive: true });
  const id =
    `${testInfo.project.name}-${testInfo.testId}-${testInfo.retry}`.replace(
      /[^a-zA-Z0-9._-]/g,
      '_',
    );
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(coverage));
}

/** Istanbul-based coverage reporter for Playwright tests. Collects `window.__coverage__` recorded by a fixture (via `recordCoverage`) and merges it into a standard `coverage-final.json`. */
export class PlaywrightCoverageReporter implements Reporter {
  private options: PlaywrightCoverageReporterOptions;
  private cwd!: string;
  private coverageDir!: string;
  private rootDir!: string;
  private shard: { current: number; total: number } | null = null;

  constructor(options: PlaywrightCoverageReporterOptions) {
    this.options = options;
  }

  async onBegin(config: FullConfig, _suite: Suite) {
    this.cwd = path.resolve(this.options.cwd ?? config.rootDir);
    this.coverageDir = path.resolve(this.cwd, this.options.coverageDir);
    this.rootDir = config.rootDir;
    this.shard = config.shard;

    if (this.shard) {
      fs.mkdirSync(this.coverageDir, { recursive: true });
      const finalFile = getCoverageFinalFile(this.coverageDir, this.shard);
      if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
    } else {
      prepareDirectory(this.coverageDir);
    }
    prepareDirectory(coverageSidecarDir(this.rootDir, this.shard));

    if (this.options.projects) {
      for (const project of this.options.projects) {
        if (project.getBabelConfig) {
          await instrumentExpectedFiles(
            this.cwd,
            this.coverageDir,
            project.collectCoverageFrom,
            project.getBabelConfig,
            this.options.transformPath,
          );
        }
      }
    }
  }

  onEnd(_result: FullResult) {
    generateIstanbulCoverageReport(
      this.cwd,
      this.coverageDir,
      this.rootDir,
      this.options.transformPath,
      this.shard,
    );
  }

  printsToStdio() {
    return false;
  }
}
