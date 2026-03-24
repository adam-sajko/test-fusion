import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TransformOptions } from '@babel/core';
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

/** Per-project coverage configuration for offline zero-coverage instrumentation. */
export interface CoverageProject {
  /** Glob patterns (with `!` negations) selecting source files to instrument for this project. */
  collectCoverageFrom: string[];
  /** Babel config for offline zero-coverage instrumentation. Must include `babel-plugin-istanbul`. When omitted, no zero-coverage baseline is generated for this project. */
  getBabelConfig?: () => Promise<TransformOptions> | TransformOptions;
}

export interface PlaywrightCoverageConfig {
  /** Base directory for resolving globs and normalizing file paths. */
  cwd: string;
  /** Directory where coverage artifacts (slices, final report, zero-coverage baseline) are written. Resolved relative to `cwd`. */
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

function getCoverageSlicesFile(
  coverageDir: string,
  shard?: { current: number } | null,
): string {
  const name = shard
    ? `coverage-slices-${shard.current}.jsonl`
    : 'coverage-slices.jsonl';
  return path.resolve(coverageDir, name);
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

const SHARD_ENV_KEY = '__PLAYWRIGHT_COVERAGE_SHARD__';

function setShardEnv(shard: { current: number; total: number } | null): void {
  if (shard) {
    process.env[SHARD_ENV_KEY] = JSON.stringify(shard);
  } else {
    delete process.env[SHARD_ENV_KEY];
  }
}

function getShardFromEnv(): { current: number; total: number } | null {
  const raw = process.env[SHARD_ENV_KEY];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getExpectedCoverageFile(coverageDir: string): string {
  return path.resolve(coverageDir, 'coverage-zero.json');
}

function prepareCoverageDirectory(coverageDir: string) {
  const coverageSlicesFile = getCoverageSlicesFile(coverageDir);
  prepareDirectory(coverageDir);
  fs.writeFileSync(coverageSlicesFile, '');
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
  config: Pick<
    PlaywrightCoverageConfig,
    'cwd' | 'coverageDir' | 'transformPath'
  >,
  shard?: { current: number; total: number } | null,
) {
  printMuted('\n\nGenerating Istanbul coverage report...');

  const coverageSlicesFile = getCoverageSlicesFile(config.coverageDir, shard);
  if (!fs.existsSync(coverageSlicesFile)) {
    console.warn(`No coverage slices found at ${coverageSlicesFile}`);
    return;
  }

  const map: CoverageMap = istanbulCoverage.createCoverageMap({});
  const lines = fs
    .readFileSync(coverageSlicesFile, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  for (const line of lines) {
    try {
      const slice = JSON.parse(line) as CoverageMapData;
      map.merge(slice);
    } catch (e) {
      console.warn('Failed to parse a coverage slice line:', e);
    }
  }

  const finalCoverage = map.toJSON();
  const normalizedCoverage = normalizeCoverageData(
    finalCoverage,
    config.cwd,
    config.transformPath,
  );

  const expectedCoverageFile = getExpectedCoverageFile(config.coverageDir);
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

  const coverageFinalFile = getCoverageFinalFile(config.coverageDir, shard);
  fs.mkdirSync(config.coverageDir, { recursive: true });
  fs.writeFileSync(coverageFinalFile, JSON.stringify(normalizedCoverage));
  printStatus('Generated JSON report', 'success', coverageFinalFile);

  fs.rmSync(coverageSlicesFile, { force: true });
}

/** Istanbul-based coverage collection for Playwright tests. Collects `window.__coverage__` from instrumented apps and merges it into a standard `coverage-final.json`. */
export class PlaywrightCoverage {
  private config: PlaywrightCoverageConfig;
  private shard: { current: number; total: number } | null = null;

  constructor(config: PlaywrightCoverageConfig) {
    this.config = {
      ...config,
      cwd: path.resolve(config.cwd),
      coverageDir: path.resolve(config.cwd, config.coverageDir),
    };
  }

  /** Prepare the coverage directory, reset slices, and optionally instrument files for zero-coverage baselines. Pass `config.shard` when using Playwright sharding. */
  async setup(shard?: { current: number; total: number } | null) {
    this.shard = shard ?? null;
    setShardEnv(this.shard);

    if (shard) {
      fs.mkdirSync(this.config.coverageDir, { recursive: true });
      const slicesFile = getCoverageSlicesFile(
        this.config.coverageDir,
        this.shard,
      );
      fs.writeFileSync(slicesFile, '');
      const finalFile = getCoverageFinalFile(
        this.config.coverageDir,
        this.shard,
      );
      if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
    } else {
      prepareCoverageDirectory(this.config.coverageDir);
    }

    if (this.config.projects) {
      for (const project of this.config.projects) {
        if (project.getBabelConfig) {
          await instrumentExpectedFiles(
            this.config.cwd,
            this.config.coverageDir,
            project.collectCoverageFrom,
            project.getBabelConfig,
            this.config.transformPath,
          );
        }
      }
    }
  }

  /** Merge all collected coverage slices into a final `coverage-final.json`, backfilling zero-coverage baselines for unvisited files. Call this in `globalTeardown`. */
  finish() {
    generateIstanbulCoverageReport(this.config, this.shard);
  }

  /**
   * Append coverage data collected from a page.
   * Shard info is resolved automatically from the marker file written by setup(),
   * so worker processes (which don't share state with globalSetup) get the
   * correct shard-specific slice file.
   */
  addCoverage(coverage: CoverageMapData) {
    if (!coverage) {
      return;
    }

    const shard = this.shard ?? getShardFromEnv();
    const coverageSlicesFile = getCoverageSlicesFile(
      this.config.coverageDir,
      shard,
    );

    fs.mkdirSync(this.config.coverageDir, { recursive: true });
    fs.appendFileSync(coverageSlicesFile, `${JSON.stringify(coverage)}\n`);
  }
}
