import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  Config,
  JestReportConfig,
  OtherReportConfig,
  PlaywrightReportConfig,
  ReportConfig,
  UserConfig,
  UserReportConfig,
} from './types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveReportConfig(
  report: UserReportConfig,
  rootDir: string,
  fusionDir: string,
): ReportConfig {
  const name = report.name;
  const lowerName = name.toLowerCase();

  const sourceDir = path.resolve(rootDir, report.source.coverage.dir);
  const sourceJson = report.source.coverage.json
    ? path.resolve(rootDir, report.source.coverage.json)
    : path.resolve(sourceDir, 'coverage-final.json');

  if (report.type === 'other') {
    const config: OtherReportConfig = {
      type: 'other',
      name,
      source: {
        coverage: { dir: sourceDir, json: sourceJson },
        testReport: report.source.testReport
          ? {
              html: report.source.testReport.html
                ? path.resolve(rootDir, report.source.testReport.html)
                : undefined,
              dir: report.source.testReport.dir
                ? path.resolve(rootDir, report.source.testReport.dir)
                : undefined,
            }
          : undefined,
      },
      output: {
        coverage: {
          dir: report.output?.coverage?.dir
            ? path.resolve(rootDir, report.output.coverage.dir)
            : path.resolve(fusionDir, `${lowerName}-coverage`),
        },
        testReport: report.output?.testReport?.dir
          ? { dir: path.resolve(rootDir, report.output.testReport.dir) }
          : undefined,
      },
      coverageReports: report.coverageReports,
      coverageThreshold: report.coverageThreshold,
      transformPath: report.transformPath,
    };
    return config;
  }

  if (report.type === 'jest' || report.type === 'vitest') {
    const config: JestReportConfig = {
      type: report.type,
      name,
      source: {
        coverage: { dir: sourceDir, json: sourceJson },
        testReport: report.source.testReport
          ? {
              html: report.source.testReport.html
                ? path.resolve(rootDir, report.source.testReport.html)
                : undefined,
              dir: report.source.testReport.dir
                ? path.resolve(rootDir, report.source.testReport.dir)
                : undefined,
            }
          : undefined,
        testResults: report.source.testResults
          ? {
              json: report.source.testResults.json
                ? path.resolve(rootDir, report.source.testResults.json)
                : undefined,
            }
          : undefined,
      },
      output: {
        coverage: {
          dir: report.output?.coverage?.dir
            ? path.resolve(rootDir, report.output.coverage.dir)
            : path.resolve(fusionDir, `${lowerName}-coverage`),
        },
        testReport: report.output?.testReport?.dir
          ? { dir: path.resolve(rootDir, report.output.testReport.dir) }
          : { dir: path.resolve(fusionDir, `${lowerName}-report`) },
      },
      coverageReports: report.coverageReports,
      coverageThreshold: report.coverageThreshold,
      transformPath: report.transformPath,
    };
    return config;
  }

  const config: PlaywrightReportConfig = {
    type: 'playwright',
    name,
    source: {
      coverage: { dir: sourceDir, json: sourceJson },
      testReport: report.source.testReport
        ? {
            html: report.source.testReport.html
              ? path.resolve(rootDir, report.source.testReport.html)
              : undefined,
            dir: report.source.testReport.dir
              ? path.resolve(rootDir, report.source.testReport.dir)
              : undefined,
          }
        : undefined,
      testResults: report.source.testResults
        ? {
            json: report.source.testResults.json
              ? path.resolve(rootDir, report.source.testResults.json)
              : undefined,
            dir: report.source.testResults.dir
              ? path.resolve(rootDir, report.source.testResults.dir)
              : undefined,
          }
        : undefined,
    },
    output: {
      coverage: {
        dir: report.output?.coverage?.dir
          ? path.resolve(rootDir, report.output.coverage.dir)
          : path.resolve(fusionDir, `${lowerName}-coverage`),
      },
      testReport: report.output?.testReport?.dir
        ? { dir: path.resolve(rootDir, report.output.testReport.dir) }
        : { dir: path.resolve(fusionDir, `${lowerName}-report`) },
      testResults: report.output?.testResults?.dir
        ? { dir: path.resolve(rootDir, report.output.testResults.dir) }
        : { dir: path.resolve(fusionDir, `${lowerName}-test-results`) },
    },
    coverageReports: report.coverageReports,
    coverageThreshold: report.coverageThreshold,
    transformPath: report.transformPath,
  };
  return config;
}

/**
 * Create a resolved test-fusion configuration from user-provided options.
 * Resolves all relative paths against rootDir (defaults to process.cwd()).
 */
export function defineConfig(userConfig: UserConfig): Config {
  const rootDir = userConfig.rootDir
    ? path.resolve(userConfig.rootDir)
    : process.cwd();
  const fusionDir = path.resolve(
    rootDir,
    userConfig.outputDir ?? 'test-fusion-report',
  );
  const projectDir = __dirname;

  const reports: ReportConfig[] = userConfig.reports.map((report) =>
    resolveReportConfig(report, rootDir, fusionDir),
  );

  const fusionReportName =
    userConfig.fusionReport?.name ?? reports.map((r) => r.name).join(' + ');

  return {
    rootDir,
    projectDir,
    fusionDir,
    name: userConfig.name ?? 'Test Fusion',
    showViewCommand: userConfig.showViewCommand,
    fusionReport: {
      name: fusionReportName,
      coverageThreshold: userConfig.fusionReport?.coverageThreshold,
      coverage: {
        dir: path.resolve(fusionDir, 'fusion-coverage'),
        reports: userConfig.fusionReport?.coverage?.reports ?? [
          'json',
          'lcov',
          'clover',
        ],
      },
    },
    reports,
  };
}
