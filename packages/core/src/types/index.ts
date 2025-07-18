import type { FileCoverageData } from 'istanbul-lib-coverage';

export interface NormalizedCoverageData extends FileCoverageData {
  l?: Record<string, number>;
  _coverageSchema?: string;
  hash?: string;
}

export type IstanbulFileCoverage = NormalizedCoverageData;

export type CoverageMapData = {
  [filePath: string]: NormalizedCoverageData;
};

export interface TestStats {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
}

export interface CoverageMetrics {
  totalStatements: number;
  coveredStatements: number;
  totalBranches: number;
  coveredBranches: number;
  totalFunctions: number;
  coveredFunctions: number;
  totalLines: number;
  coveredLines: number;
  totalFiles: number;
  coveredFiles: number;
  overallCoverage: number;
}

export interface CoveragePercentage {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

export interface ReportSummary {
  testStats?: TestStats;
  coveragePercentage: CoveragePercentage;
  overallCoverage: number;
  coveredFiles: number;
  totalFiles: number;
}

export interface FusionReport {
  generatedAt: string;
  reports: (ReportSummary & {
    name: string;
    type: ReportType;
    hasTestReport: boolean;
  })[];
  summary: {
    [reportName: string]: ReportSummary;
  } & {
    fusion: ReportSummary;
  };
}

export interface FileCoverageResult {
  fileStatements: number;
  fileCoveredStatements: number;
  fileBranches: number;
  fileCoveredBranches: number;
  fileFunctions: number;
  fileCoveredFunctions: number;
  fileLines: number;
  fileCoveredLines: number;
  fileCoveragePercent: number;
}

export interface PlaywrightTestResult {
  status: 'passed' | 'failed' | 'skipped' | 'flaky';
}

export interface PlaywrightTest {
  results: PlaywrightTestResult[];
}

export interface PlaywrightSpec {
  tests: PlaywrightTest[];
}

export interface PlaywrightSuite {
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

export interface PlaywrightTestResults {
  suites: PlaywrightSuite[];
}

export interface CoverageCalculationMetrics {
  coveredStatements: number;
  totalStatements: number;
  coveredBranches: number;
  totalBranches: number;
  coveredFunctions: number;
  totalFunctions: number;
  coveredLines: number;
  totalLines: number;
}

export interface CoverageThreshold {
  global?: {
    branches?: number;
    functions?: number;
    lines?: number;
    statements?: number;
  };
}

export type ReportType = 'jest' | 'vitest' | 'playwright' | 'other';

export type CoverageReportType =
  | 'json'
  | 'lcov'
  | 'clover'
  | 'html'
  | 'text'
  | 'text-summary'
  | 'json-summary';

export interface TestReportPaths {
  html?: string;
  dir?: string;
}

export interface TestResultsPaths {
  json?: string;
  dir?: string;
}

export interface CoveragePaths {
  dir: string;
  json?: string;
}

export interface JestReportSource {
  testReport?: TestReportPaths;
  testResults?: TestResultsPaths;
  coverage: CoveragePaths;
}

export interface JestReportOutput {
  testReport?: {
    dir: string;
  };
  coverage: {
    dir: string;
  };
}

export interface PlaywrightReportSource {
  testReport?: TestReportPaths;
  testResults?: TestResultsPaths;
  coverage: CoveragePaths;
}

export interface PlaywrightReportOutput {
  testReport?: {
    dir: string;
  };
  testResults?: {
    dir: string;
  };
  coverage: {
    dir: string;
  };
}

export interface JestReportConfig {
  type: 'jest' | 'vitest';
  name: string;
  source: JestReportSource;
  output: JestReportOutput;
  coverageReports?: CoverageReportType[];
  coverageThreshold?: CoverageThreshold;
  transformPath?: (filePath: string, rootDir: string) => string;
}

export interface PlaywrightReportConfig {
  type: 'playwright';
  name: string;
  source: PlaywrightReportSource;
  output: PlaywrightReportOutput;
  coverageReports?: CoverageReportType[];
  coverageThreshold?: CoverageThreshold;
  transformPath?: (filePath: string, rootDir: string) => string;
}

export interface OtherReportConfig {
  type: 'other';
  name: string;
  source: {
    coverage: CoveragePaths;
    testReport?: TestReportPaths;
  };
  output: {
    coverage: { dir: string };
    testReport?: { dir: string };
  };
  coverageReports?: CoverageReportType[];
  coverageThreshold?: CoverageThreshold;
  transformPath?: (filePath: string, rootDir: string) => string;
}

export type ReportConfig =
  | JestReportConfig
  | PlaywrightReportConfig
  | OtherReportConfig;

export interface FusionReportConfig {
  name: string;
  coverageThreshold?: CoverageThreshold;
  coverage: {
    dir: string;
    reports?: CoverageReportType[];
  };
}

export interface Config {
  rootDir: string;
  projectDir: string;
  fusionDir: string;
  fusionReport: FusionReportConfig;
  name?: string;
  showViewCommand?: boolean;
  reports: ReportConfig[];
}

export interface UserReportConfig {
  type: 'jest' | 'vitest' | 'playwright' | 'other';
  name: string;
  source: {
    coverage: { dir: string; json?: string };
    testReport?: { html?: string; dir?: string };
    testResults?: { json?: string; dir?: string };
  };
  output?: {
    coverage?: { dir: string };
    testReport?: { dir: string };
    testResults?: { dir: string };
  };
  coverageReports?: CoverageReportType[];
  coverageThreshold?: CoverageThreshold;
  transformPath?: (filePath: string, rootDir: string) => string;
}

export interface UserConfig {
  name?: string;
  rootDir?: string;
  outputDir?: string;
  showViewCommand?: boolean;
  fusionReport?: {
    name?: string;
    coverageThreshold?: CoverageThreshold;
    coverage?: {
      reports?: CoverageReportType[];
    };
  };
  reports: UserReportConfig[];
}
