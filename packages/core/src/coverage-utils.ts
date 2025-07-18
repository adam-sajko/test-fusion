import * as fs from 'node:fs';
import * as path from 'node:path';
import IstanbulCoverage from 'istanbul-lib-coverage';
import istanbulLibReport from 'istanbul-lib-report';
import { printStatus } from './print-utils.js';
import type {
  CoverageCalculationMetrics,
  CoverageMapData,
  CoverageMetrics,
  CoverageThreshold,
  FileCoverageResult,
  IstanbulFileCoverage,
  NormalizedCoverageData,
  PlaywrightSuite,
  PlaywrightTestResults,
  TestStats,
} from './types/index.js';

/**
 * Reset coverage data to zero coverage values.
 * Takes coverage structure (maps) and initializes all coverage counts to 0.
 */
export function resetCoverageData<T extends NormalizedCoverageData>(
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

function applyStandardNormalization(filePath: string): string {
  return filePath.replace(/^\/+/, '').split(path.sep).join('/');
}

export function normalizeFilePath(
  filePath: string,
  rootDir: string,
  transformPath?: (filePath: string, rootDir: string) => string,
): string {
  let transformedPath = filePath;

  if (transformPath) {
    transformedPath = transformPath(filePath, rootDir);
  } else {
    const normalizedRoot = rootDir.endsWith('/') ? rootDir : `${rootDir}/`;
    if (transformedPath.startsWith(normalizedRoot)) {
      transformedPath = transformedPath.slice(normalizedRoot.length);
    } else if (transformedPath === rootDir) {
      transformedPath = '';
    }
  }

  return applyStandardNormalization(transformedPath);
}

export function normalizeCoverageData(
  coverageData: CoverageMapData,
  rootDir: string,
  transformPath?: (filePath: string, rootDir: string) => string,
): CoverageMapData {
  const normalizedCoverage: CoverageMapData = {};

  for (const [filePath, coverage] of Object.entries(coverageData)) {
    const normalizedPath = normalizeFilePath(filePath, rootDir, transformPath);
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

/**
 * Clear existing directory by removing individual files.
 * More reliable than rmSync for Docker/CI volumes with locked files.
 */
export function prepareDirectory(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch (error) {
      console.error(`Warning: Could not remove directory ${dirPath}:`, error);
    }
  }

  fs.mkdirSync(dirPath, { recursive: true });
}

export function createValidCoverageData(
  filePath: string,
  coverageData: NormalizedCoverageData,
  rootDir: string,
): NormalizedCoverageData {
  const validCoverageData: NormalizedCoverageData = {
    path: path.resolve(rootDir, filePath),
    statementMap: coverageData.statementMap || {},
    fnMap: coverageData.fnMap || {},
    branchMap: coverageData.branchMap || {},
    s: coverageData.s || {},
    f: coverageData.f || {},
    b: coverageData.b || {},
    l: coverageData.l || {},
  };

  const statementIds = Object.keys(validCoverageData.s);
  for (const statementId of statementIds) {
    if (!validCoverageData.statementMap[statementId]) {
      delete validCoverageData.s[statementId];
    }
  }

  const functionIds = Object.keys(validCoverageData.f);
  for (const functionId of functionIds) {
    if (!validCoverageData.fnMap[functionId]) {
      delete validCoverageData.f[functionId];
    }
  }

  const branchIds = Object.keys(validCoverageData.b);
  for (const branchId of branchIds) {
    if (!validCoverageData.branchMap[branchId]) {
      delete validCoverageData.b[branchId];
    }
  }

  if ('_coverageSchema' in coverageData) {
    validCoverageData._coverageSchema = coverageData._coverageSchema;
  }
  if ('hash' in coverageData) {
    validCoverageData.hash = coverageData.hash;
  }

  return validCoverageData;
}

export function readJsonFile<T>(
  filePath: string,
  description: string,
): T | null {
  if (!fs.existsSync(filePath)) {
    printStatus(`${description} not found at: ${filePath}`, 'warning');
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
    return data;
  } catch (error) {
    console.error(`Failed to parse ${description}:`, error);
    return null;
  }
}

export function readJestCoverage(
  jestCoverageFile: string,
): CoverageMapData | null {
  return readJsonFile<CoverageMapData>(jestCoverageFile, 'Jest coverage data');
}

/**
 * Read Playwright coverage. Supports sharded CI runs: if coverage-final.json
 * is missing, looks for coverage-shard-*.json files and merges them automatically.
 */
export function readPlaywrightCoverage(
  playwrightCoverageFile: string,
): CoverageMapData | null {
  if (fs.existsSync(playwrightCoverageFile)) {
    return readJsonFile<CoverageMapData>(
      playwrightCoverageFile,
      'Playwright coverage data',
    );
  }

  const dir = path.dirname(playwrightCoverageFile);
  if (!fs.existsSync(dir)) {
    printStatus(
      `Playwright coverage data not found at: ${playwrightCoverageFile}`,
      'warning',
    );
    return null;
  }

  const shardFiles = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('coverage-shard-') && f.endsWith('.json'));

  if (shardFiles.length === 0) {
    printStatus(
      `Playwright coverage data not found at: ${playwrightCoverageFile}`,
      'warning',
    );
    return null;
  }

  printStatus(
    `Merging ${shardFiles.length} shard coverage files from ${dir}`,
    'success',
  );

  const map = IstanbulCoverage.createCoverageMap({});
  for (const file of shardFiles) {
    const data = readJsonFile<CoverageMapData>(
      path.join(dir, file),
      `Shard coverage ${file}`,
    );
    if (data) map.merge(data);
  }

  const zeroFile = path.join(dir, 'coverage-zero.json');
  if (fs.existsSync(zeroFile)) {
    const zeroCov = readJsonFile<CoverageMapData>(
      zeroFile,
      'Zero coverage baseline',
    );
    if (zeroCov) {
      for (const [filePath, data] of Object.entries(zeroCov)) {
        if (!map.data[filePath]) {
          map.addFileCoverage(
            data as unknown as IstanbulCoverage.FileCoverageData,
          );
        }
      }
    }
  }

  return map.toJSON() as CoverageMapData;
}

export function readFinalPlaywrightCoverage(
  finalPlaywrightCoverageFile: string,
): CoverageMapData | null {
  return readJsonFile<CoverageMapData>(
    finalPlaywrightCoverageFile,
    'Playwright coverage data',
  );
}

export function readFusionCoverage(
  fusionCoverageFile: string,
): CoverageMapData | null {
  return readJsonFile<CoverageMapData>(
    fusionCoverageFile,
    'Fusion coverage data',
  );
}

export function extractCoverageMetrics(
  coverageData: CoverageMapData,
): CoverageMetrics {
  if (!coverageData) {
    return getEmptyCoverageMetrics();
  }

  let totalStatements = 0;
  let coveredStatements = 0;
  let totalBranches = 0;
  let coveredBranches = 0;
  let totalFunctions = 0;
  let coveredFunctions = 0;
  let totalLines = 0;
  let coveredLines = 0;
  let totalFiles = 0;
  let coveredFiles = 0;

  for (const [filePath, coverage] of Object.entries(coverageData)) {
    if (filePath === 'totalCounts') {
      continue;
    }

    totalFiles++;
    const fileCoverage = calculateFileCoverage(coverage);

    if (fileCoverage.fileCoveragePercent > 0) {
      coveredFiles++;
    }

    totalStatements += fileCoverage.fileStatements;
    coveredStatements += fileCoverage.fileCoveredStatements;
    totalBranches += fileCoverage.fileBranches;
    coveredBranches += fileCoverage.fileCoveredBranches;
    totalFunctions += fileCoverage.fileFunctions;
    coveredFunctions += fileCoverage.fileCoveredFunctions;
    totalLines += fileCoverage.fileLines;
    coveredLines += fileCoverage.fileCoveredLines;
  }

  return {
    totalStatements,
    coveredStatements,
    totalBranches,
    coveredBranches,
    totalFunctions,
    coveredFunctions,
    totalLines,
    coveredLines,
    totalFiles,
    coveredFiles,
    overallCoverage: calculateOverallCoverage({
      coveredStatements,
      totalStatements,
      coveredBranches,
      totalBranches,
      coveredFunctions,
      totalFunctions,
      coveredLines,
      totalLines,
    }),
  };
}

export function calculateFileCoverage(
  coverage: IstanbulFileCoverage,
): FileCoverageResult {
  const fileStatements = Object.keys(coverage.s || {}).length;
  const fileCoveredStatements = Object.values(coverage.s || {}).filter(
    (count: number) => count > 0,
  ).length;

  let fileBranches = 0;
  let fileCoveredBranches = 0;

  if (coverage.b) {
    for (const branchArray of Object.values(coverage.b)) {
      if (Array.isArray(branchArray)) {
        fileBranches += branchArray.length;
        fileCoveredBranches += branchArray.filter(
          (count: number) => count > 0,
        ).length;
      }
    }
  }

  const fileFunctions = Object.keys(coverage.f || {}).length;
  const fileCoveredFunctions = Object.values(coverage.f || {}).filter(
    (count: number) => count > 0,
  ).length;

  let fileLines = 0;
  let fileCoveredLines = 0;
  if (coverage.l) {
    fileLines = Object.keys(coverage.l).length;
    fileCoveredLines = Object.values(coverage.l).filter(
      (count) => count > 0,
    ).length;
  } else if (coverage.statementMap && coverage.s) {
    const allLines = new Set<number>();
    const coveredLinesSet = new Set<number>();
    for (const [statementKey, count] of Object.entries(coverage.s)) {
      const statement = coverage.statementMap[statementKey];
      if (statement) {
        allLines.add(statement.start.line);
        if (count > 0) {
          coveredLinesSet.add(statement.start.line);
        }
      }
    }
    fileLines = allLines.size;
    fileCoveredLines = coveredLinesSet.size;
  }

  const fileCoveragePercent =
    fileStatements > 0 ? (fileCoveredStatements / fileStatements) * 100 : 0;

  return {
    fileStatements,
    fileCoveredStatements,
    fileBranches,
    fileCoveredBranches,
    fileFunctions,
    fileCoveredFunctions,
    fileLines,
    fileCoveredLines,
    fileCoveragePercent,
  };
}

export function calculateOverallCoverage(
  metrics: CoverageCalculationMetrics,
): number {
  const statementsCoverage =
    metrics.totalStatements > 0
      ? (metrics.coveredStatements / metrics.totalStatements) * 100
      : 100;
  const branchesCoverage =
    metrics.totalBranches > 0
      ? (metrics.coveredBranches / metrics.totalBranches) * 100
      : 100;
  const functionsCoverage =
    metrics.totalFunctions > 0
      ? (metrics.coveredFunctions / metrics.totalFunctions) * 100
      : 100;
  const linesCoverage =
    metrics.totalLines > 0
      ? (metrics.coveredLines / metrics.totalLines) * 100
      : 100;

  const overallCoverage =
    (statementsCoverage +
      branchesCoverage +
      functionsCoverage +
      linesCoverage) /
    4;

  return Math.round(overallCoverage * 100) / 100;
}

export function readJestJsonTestStats(jsonFile: string): TestStats | null {
  if (!fs.existsSync(jsonFile)) {
    printStatus(`Test results JSON not found at: ${jsonFile}`, 'warning');
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8')) as Record<
      string,
      unknown
    >;
    const passed = Number(data.numPassedTests ?? 0);
    const failed = Number(data.numFailedTests ?? 0);
    const skipped = Number(data.numPendingTests ?? data.numSkippedTests ?? 0);
    const total = Number(data.numTotalTests ?? passed + failed + skipped);

    return { total, passed, failed, skipped, flaky: 0 };
  } catch (error) {
    console.error('Failed to parse test results JSON:', error);
    return null;
  }
}

export function readJestTestStats(
  jestTestReportFile: string,
): TestStats | null {
  if (!fs.existsSync(jestTestReportFile)) {
    printStatus(
      `Jest test report not found at: ${jestTestReportFile}`,
      'warning',
    );
    return null;
  }

  try {
    const htmlContent = fs.readFileSync(jestTestReportFile, 'utf8');

    const passedTests = (htmlContent.match(/class="test-result passed"/g) || [])
      .length;
    const failedTests = (htmlContent.match(/class="test-result failed"/g) || [])
      .length;
    const pendingTests = (
      htmlContent.match(/class="test-result pending"/g) || []
    ).length;

    const total = passedTests + failedTests + pendingTests;

    if (total > 0) {
      return {
        total,
        passed: passedTests,
        failed: failedTests,
        skipped: pendingTests,
        flaky: 0,
      };
    }

    return { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 };
  } catch (error) {
    console.error('Failed to parse Jest test report:', error);
    return null;
  }
}

export function readPlaywrightTestResults(
  playwrightTestResultsFile: string,
): TestStats | null {
  if (!fs.existsSync(playwrightTestResultsFile)) {
    printStatus(
      `Playwright test results not found at: ${playwrightTestResultsFile}`,
      'warning',
    );
    return null;
  }

  try {
    const resultData = JSON.parse(
      fs.readFileSync(playwrightTestResultsFile, 'utf8'),
    ) as PlaywrightTestResults;

    let total = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let flaky = 0;

    const countTestsInSuites = (suites: PlaywrightSuite[]) => {
      for (const suite of suites) {
        if (suite.specs) {
          for (const spec of suite.specs) {
            if (spec.tests) {
              for (const test of spec.tests) {
                total++;
                const lastResult = test.results?.[test.results.length - 1];
                if (!lastResult) {
                  skipped++;
                  continue;
                }
                const hasFailedRetries =
                  test.results?.length > 1 &&
                  test.results?.some((r) => r.status === 'failed');
                if (lastResult.status === 'passed' && hasFailedRetries) {
                  flaky++;
                } else {
                  switch (lastResult.status) {
                    case 'passed':
                      passed++;
                      break;
                    case 'failed':
                      failed++;
                      break;
                    case 'skipped':
                      skipped++;
                      break;
                    case 'flaky':
                      flaky++;
                      break;
                    default:
                      passed++;
                      break;
                  }
                }
              }
            }
          }
        }

        if (suite.suites) {
          countTestsInSuites(suite.suites);
        }
      }
    };

    if (resultData.suites) {
      countTestsInSuites(resultData.suites);
    }

    return { total, passed, failed, skipped, flaky };
  } catch (error) {
    console.error('Failed to read Playwright test results:', error);
    return null;
  }
}

export function getEmptyCoverageMetrics(): CoverageMetrics {
  return {
    totalStatements: 0,
    coveredStatements: 0,
    totalBranches: 0,
    coveredBranches: 0,
    totalFunctions: 0,
    coveredFunctions: 0,
    totalLines: 0,
    coveredLines: 0,
    totalFiles: 0,
    coveredFiles: 0,
    overallCoverage: 0,
  };
}

export function calculatePercentage(covered: number, total: number): number {
  if (total === 0) {
    return 100;
  }
  return Math.round((covered / total) * 100 * 100) / 100;
}

export function mergeTestStats(
  statsA: TestStats | null,
  statsB: TestStats | null,
): TestStats | null {
  if (!statsA && !statsB) {
    return null;
  }

  const a = statsA || { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 };
  const b = statsB || { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 };

  return {
    total: a.total + b.total,
    passed: a.passed + b.passed,
    failed: a.failed + b.failed,
    skipped: a.skipped + b.skipped,
    flaky: a.flaky + b.flaky,
  };
}

export function mergeCoverageData(
  coverageA: CoverageMapData | null,
  coverageB: CoverageMapData | null,
  rootDir: string,
  transformPath?: (filePath: string, rootDir: string) => string,
): CoverageMapData {
  const mapA = IstanbulCoverage.createCoverageMap({});
  if (coverageA) {
    for (const [filePath, coverageData] of Object.entries(coverageA)) {
      const relativePath = normalizeFilePath(filePath, rootDir, transformPath);
      const validCoverageData = createValidCoverageData(
        relativePath,
        coverageData,
        rootDir,
      );
      mapA.addFileCoverage(validCoverageData);
    }
  }

  const mapB = IstanbulCoverage.createCoverageMap({});
  if (coverageB) {
    for (const [filePath, value] of Object.entries(coverageB)) {
      const relativePath = normalizeFilePath(filePath, rootDir, transformPath);
      let coverageData: NormalizedCoverageData;

      if (value && typeof value === 'object' && 'data' in value) {
        coverageData = (value as { data: NormalizedCoverageData }).data;
      } else {
        coverageData = value as NormalizedCoverageData;
      }

      const validCoverageData = createValidCoverageData(
        relativePath,
        coverageData,
        rootDir,
      );
      mapB.addFileCoverage(validCoverageData);
    }
  }

  const fusionMap = IstanbulCoverage.createCoverageMap({});
  fusionMap.merge(mapA);
  fusionMap.merge(mapB);

  return normalizeCoverageData(fusionMap.toJSON(), rootDir, transformPath);
}

export function getFinalPlaywrightCoverageData(
  finalPlaywrightCoverageFile: string,
): CoverageMapData | null {
  return readFinalPlaywrightCoverage(finalPlaywrightCoverageFile);
}

export function getWatermarksFromThreshold(
  threshold: CoverageThreshold | undefined,
): {
  statements: [number, number];
  functions: [number, number];
  branches: [number, number];
  lines: [number, number];
} {
  const defaultWatermarks = istanbulLibReport.getDefaultWatermarks();

  if (!threshold || !threshold.global) {
    return {
      statements: [...defaultWatermarks.statements] as [number, number],
      functions: [...defaultWatermarks.functions] as [number, number],
      branches: [...defaultWatermarks.branches] as [number, number],
      lines: [...defaultWatermarks.lines] as [number, number],
    };
  }

  const keys: Array<'branches' | 'functions' | 'lines' | 'statements'> = [
    'branches',
    'functions',
    'lines',
    'statements',
  ];

  const watermarks = {
    statements: [...defaultWatermarks.statements] as [number, number],
    functions: [...defaultWatermarks.functions] as [number, number],
    branches: [...defaultWatermarks.branches] as [number, number],
    lines: [...defaultWatermarks.lines] as [number, number],
  };

  for (const key of keys) {
    const value = threshold.global?.[key];
    if (value !== undefined) {
      watermarks[key][1] = value;
    }
  }

  return watermarks;
}
