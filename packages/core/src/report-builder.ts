import fs from 'node:fs';
import path from 'node:path';
import HandlebarsBase from 'handlebars';
import {
  calculateOverallCoverage,
  calculatePercentage,
  createValidCoverageData,
  extractCoverageMetrics,
  getEmptyCoverageMetrics,
  getFinalPlaywrightCoverageData,
  getWatermarksFromThreshold,
  mergeCoverageData,
  mergeTestStats,
  normalizeCoverageData,
  prepareDirectory,
  readFusionCoverage,
  readJestCoverage,
  readJestJsonTestStats,
  readJestTestStats,
  readPlaywrightCoverage,
  readPlaywrightTestResults,
} from './coverage-utils.js';
import { printHeading, printMuted, printStatus } from './print-utils.js';
import type {
  Config,
  CoverageMapData,
  CoverageReportType,
  CoverageThreshold,
  FusionReport,
  PlaywrightReportConfig,
  ReportConfig,
  ReportSummary,
  ReportType,
  TestStats,
} from './types/index.js';

function getCoverageCssClass(
  percentage: number,
  watermarks: [number, number],
): 'low' | 'medium' | 'high' {
  const [low, high] = watermarks;
  const effectiveLow = Math.min(low, high);
  const effectiveHigh = Math.max(low, high);

  if (percentage >= effectiveHigh) {
    return 'high';
  }
  if (percentage >= effectiveLow) {
    return 'medium';
  }
  return 'low';
}

export class ReportBuilder {
  private config: Config;
  private handlebars: typeof HandlebarsBase;

  constructor(config: Config) {
    this.config = config;
    this.handlebars = HandlebarsBase.create();
    this.validateConfig();
    this.registerHandlebarsHelpers();
  }

  private validateConfig(): void {
    if (this.config.fusionReport.coverageThreshold) {
      const keys = Object.keys(this.config.fusionReport.coverageThreshold);
      const unsupportedKeys = keys.filter((key) => key !== 'global');

      if (unsupportedKeys.length > 0) {
        printStatus(
          `Warning: Fusion report coverageThreshold contains unsupported keys: ${unsupportedKeys.join(', ')}. Only 'global' is supported. Per-path thresholds are not yet implemented.`,
          'warning',
        );
      }
    }

    for (const report of this.config.reports) {
      if (report.coverageThreshold) {
        const keys = Object.keys(report.coverageThreshold);
        const unsupportedKeys = keys.filter((key) => key !== 'global');

        if (unsupportedKeys.length > 0) {
          printStatus(
            `Warning: ${report.name} report coverageThreshold contains unsupported keys: ${unsupportedKeys.join(', ')}. Only 'global' is supported. Per-path thresholds are not yet implemented.`,
            'warning',
          );
        }
      }
    }
  }

  private getWatermarksForMetric(
    metric: 'statements' | 'branches' | 'functions' | 'lines',
    threshold?: CoverageThreshold,
  ): [number, number] {
    const effectiveThreshold =
      threshold || this.config.fusionReport.coverageThreshold;
    const watermarks = getWatermarksFromThreshold(effectiveThreshold);
    return watermarks[metric];
  }

  private getColoredPercentage(
    percentage: number,
    metric: 'statements' | 'branches' | 'functions' | 'lines' = 'statements',
    threshold?: CoverageThreshold,
  ): string {
    const watermarks = this.getWatermarksForMetric(metric, threshold);
    const coverageClass = getCoverageCssClass(percentage, watermarks);
    let color = '\x1b[31m';
    if (coverageClass === 'high') {
      color = '\x1b[32m';
    } else if (coverageClass === 'medium') {
      color = '\x1b[33m';
    }
    return `${color}${percentage}%\x1b[0m`;
  }

  private get name(): string {
    return this.config.name || 'Test Fusion';
  }

  private registerHandlebarsHelpers() {
    this.handlebars.registerHelper('coverageClass', (percentage: number) => {
      const watermarks = getWatermarksFromThreshold(
        this.config.fusionReport.coverageThreshold,
      );
      const avgLow =
        (watermarks.statements[0] +
          watermarks.functions[0] +
          watermarks.branches[0] +
          watermarks.lines[0]) /
        4;
      const avgHigh =
        (watermarks.statements[1] +
          watermarks.functions[1] +
          watermarks.branches[1] +
          watermarks.lines[1]) /
        4;
      return getCoverageCssClass(percentage, [avgLow, avgHigh]);
    });

    this.handlebars.registerHelper('gt', (a: number, b: number) => {
      return a > b;
    });

    this.handlebars.registerHelper('eq', (a: unknown, b: unknown) => {
      return a === b;
    });

    this.handlebars.registerHelper('toLowerCase', (str: string) => {
      return str ? str.toLowerCase() : '';
    });

    this.handlebars.registerHelper('getFusionTitle', () => {
      return (
        this.config.fusionReport.name ||
        this.config.reports.map((r) => r.name).join(' + ')
      );
    });

    this.handlebars.registerHelper('getDashboardTitle', () => {
      return this.name;
    });

    this.handlebars.registerHelper('reportCount', () => {
      return this.config.reports.length;
    });
  }

  dryRun(): void {
    printHeading(`${this.name} Dry Run`);
    printMuted('Validating configuration paths...\n');

    this.printPath('Root directory', this.config.rootDir);
    this.printPath('Fusion directory', this.config.fusionDir);

    printMuted('\nSource Paths:');
    for (const report of this.config.reports) {
      if (report.source.testReport?.html) {
        this.printPath(
          `${report.name} test report HTML`,
          report.source.testReport.html,
          true,
        );
      }
      if (report.type === 'playwright' && report.source.testResults?.json) {
        this.printPath(
          `${report.name} test results JSON`,
          report.source.testResults.json,
          true,
        );
      }
      this.printPath(
        `${report.name} coverage directory`,
        report.source.coverage.dir,
        true,
      );
      if (report.source.coverage.json) {
        this.printPath(
          `${report.name} coverage JSON`,
          report.source.coverage.json,
          true,
        );
      }
    }

    printMuted('\nFusion Output Paths:');
    this.printPath('Fusion directory', this.config.fusionDir);
    this.printPath(
      'Fusion coverage directory',
      this.config.fusionReport.coverage.dir,
    );

    for (const report of this.config.reports) {
      printMuted(`\n${report.name} Output:`);
      if (report.output.testReport?.dir) {
        this.printPath('Test report directory', report.output.testReport.dir);
      }
      if (report.type === 'playwright' && report.output.testResults?.dir) {
        this.printPath('Test results directory', report.output.testResults.dir);
      }
      this.printPath('Coverage directory', report.output.coverage.dir);
    }

    this.printDryRunSummary();
  }

  private printPath(
    description: string,
    pathToCheck: string,
    validate = false,
  ): void {
    if (validate) {
      const exists = fs.existsSync(pathToCheck);
      printStatus(description, exists ? 'success' : 'error', pathToCheck);
    } else {
      printStatus(description, 'neutral', pathToCheck);
    }
  }

  private getSourceFileStatus(): {
    sourcePaths: string[];
    existingSources: number;
    totalSources: number;
  } {
    const sourcePaths: string[] = [];

    for (const report of this.config.reports) {
      if (report.source.testReport?.html) {
        sourcePaths.push(report.source.testReport.html);
      }
      if (report.type === 'playwright' && report.source.testResults?.json) {
        sourcePaths.push(report.source.testResults.json);
      }
      sourcePaths.push(report.source.coverage.dir);
      if (report.source.coverage.json) {
        sourcePaths.push(report.source.coverage.json);
      }
    }

    const existingSources = sourcePaths.filter((p) => {
      if (fs.existsSync(p)) return true;
      if (p.endsWith('coverage-final.json')) {
        const dir = path.dirname(p);
        if (!fs.existsSync(dir)) return false;
        const shardFiles = fs
          .readdirSync(dir)
          .filter(
            (f) => f.startsWith('coverage-shard-') && f.endsWith('.json'),
          );
        return shardFiles.length > 0;
      }
      return false;
    }).length;
    const totalSources = sourcePaths.length;

    return { sourcePaths, existingSources, totalSources };
  }

  private printDryRunSummary(): void {
    printMuted('\nDry Run Result:');

    const { existingSources, totalSources } = this.getSourceFileStatus();

    printStatus(
      `Source paths: ${existingSources}/${totalSources} exist`,
      'neutral',
    );
    printStatus(
      'Output paths: will be created during report generation',
      'neutral',
    );

    if (existingSources === 0) {
      printStatus('No source data found. Run your tests first.', 'warning');
    } else if (existingSources < totalSources) {
      printStatus(
        'Some source data is missing. Report may be incomplete.',
        'warning',
      );
    } else {
      printStatus(
        'All source data found. Report generation should succeed.',
        'success',
      );
    }
  }

  async buildReport(): Promise<void> {
    printHeading(`${this.name}`);
    printMuted('Building report...\n');

    printMuted('Cleaning and preparing fusion directory...');
    prepareDirectory(this.config.fusionDir);
    printStatus('Created fresh fusion result directory', 'success');

    const allCoverageData: Array<{
      report: ReportConfig;
      coverage: CoverageMapData | null;
    }> = [];

    for (const report of this.config.reports) {
      if (report.type === 'playwright') {
        printMuted(`\nGenerating ${report.name} coverage reports...`);
        const coverageFile =
          report.source.coverage.json ||
          path.resolve(report.source.coverage.dir, 'coverage-final.json');
        const coverage = readPlaywrightCoverage(coverageFile);
        await this.generatePlaywrightReports(report, coverage);
        const finalCoverageFile = path.resolve(
          report.output.coverage.dir,
          'coverage-final.json',
        );
        const finalCoverage = getFinalPlaywrightCoverageData(finalCoverageFile);
        allCoverageData.push({ report, coverage: finalCoverage });
      } else if (
        report.type === 'jest' ||
        report.type === 'vitest' ||
        report.type === 'other'
      ) {
        printMuted(`\nGenerating ${report.name} coverage reports...`);
        const coverageFile =
          report.source.coverage.json ||
          path.resolve(report.source.coverage.dir, 'coverage-final.json');
        const coverage = readJestCoverage(coverageFile);
        const reportTypes = report.coverageReports || [
          'json',
          'lcov',
          'clover',
        ];
        await this.generateCoverageReports(report, coverage, reportTypes);
        allCoverageData.push({ report, coverage });
      }
    }

    printMuted('\nGenerating fusion coverage reports...');
    await this.generateFusionCoverageReports(allCoverageData);

    printMuted('\nCopying existing reports...');
    this.copyExistingReports();

    printMuted('\nCollecting test data...');
    const fusionReport = this.collectAllReportData();
    printStatus('Data collection complete', 'success');

    printMuted('\nGenerating dashboard data...');
    const fusionReportFile = path.resolve(this.config.fusionDir, 'report.json');
    fs.writeFileSync(fusionReportFile, JSON.stringify(fusionReport));
    printStatus('Dashboard data generated', 'success', fusionReportFile);

    printMuted('\nBuilding HTML report...');
    this.generateHtmlReport(fusionReport);
    const fusionHtmlFile = path.resolve(this.config.fusionDir, 'index.html');
    printStatus('HTML report build complete', 'success', fusionHtmlFile);

    printMuted('\nPrinting summary...');
    console.log('');
    this.printSummary(fusionReport);

    const { existingSources, totalSources } = this.getSourceFileStatus();

    printMuted('\nResult:');
    if (existingSources === 0) {
      const reportNames = this.config.reports.map((r) => r.name).join(' and ');
      printStatus(
        `${this.name} Report generated, but no source data found. Run ${reportNames} tests first.`,
        'warning',
      );
    } else if (existingSources < totalSources) {
      printStatus(
        `${this.name} Report generated, but some source data is missing. Report may be incomplete.`,
        'warning',
      );
    } else {
      printStatus(`${this.name} Report generated!`, 'success');
    }
    console.log('');
    printMuted(`All reports available in: ${this.config.fusionDir}`);
    const shouldShowCommand =
      this.config.showViewCommand !== undefined
        ? this.config.showViewCommand
        : !process.env.CI;
    if (shouldShowCommand) {
      console.log('');
      console.log(
        `  \x1b[36m→\x1b[0m  To view the report, run: \x1b[1m\x1b[36myarn show-report\x1b[0m`,
      );
      console.log('');
    }
  }

  private printSummary(fusionReport: FusionReport): void {
    for (const report of this.config.reports) {
      const reportKey = report.name.toLowerCase();
      const summary = fusionReport.summary[reportKey];

      if (!summary) {
        continue;
      }

      console.log(`${report.name} Test Results:`);
      if (summary.testStats) {
        printStatus(`Total: ${summary.testStats.total}`);
        printStatus(`Passed: ${summary.testStats.passed}`, 'neutral');
        printStatus(`Failed: ${summary.testStats.failed}`, 'neutral');
        printStatus(`Skipped: ${summary.testStats.skipped}`, 'neutral');
        if (summary.testStats.flaky > 0) {
          printStatus(`Flaky: ${summary.testStats.flaky}`, 'neutral');
        }
      } else {
        printStatus(
          `${report.name} Test Results: No test statistics found`,
          'warning',
        );
      }

      console.log(`\n${report.name} Coverage:`);
      if (summary.totalFiles > 0) {
        const reportThreshold = report.coverageThreshold;
        printStatus(
          `Overall: ${this.getColoredPercentage(summary.overallCoverage, 'statements', reportThreshold)}`,
        );
        printStatus(
          `Files: ${summary.coveredFiles}/${summary.totalFiles}`,
          'neutral',
        );
        printStatus(
          `Statements: ${this.getColoredPercentage(summary.coveragePercentage.statements, 'statements', reportThreshold)}`,
        );
        printStatus(
          `Branches: ${this.getColoredPercentage(summary.coveragePercentage.branches, 'branches', reportThreshold)}`,
        );
        printStatus(
          `Functions: ${this.getColoredPercentage(summary.coveragePercentage.functions, 'functions', reportThreshold)}`,
        );
        printStatus(
          `Lines: ${this.getColoredPercentage(summary.coveragePercentage.lines, 'lines', reportThreshold)}`,
        );
      } else {
        printStatus(
          `${report.name} Coverage: No coverage data found`,
          'warning',
        );
      }

      console.log('');
    }

    const fusionSummary = fusionReport.summary.fusion;
    const fusionReportName =
      this.config.fusionReport.name ||
      this.config.reports.map((r) => r.name).join(' + ');

    console.log('─'.repeat(60));
    console.log(`${fusionReportName} Test Results:`);
    if (fusionSummary.testStats) {
      printStatus(`Total: ${fusionSummary.testStats.total}`);
      printStatus(`Passed: ${fusionSummary.testStats.passed}`, 'neutral');
      printStatus(`Failed: ${fusionSummary.testStats.failed}`, 'neutral');
      printStatus(`Skipped: ${fusionSummary.testStats.skipped}`, 'neutral');
      if (fusionSummary.testStats.flaky > 0) {
        printStatus(`Flaky: ${fusionSummary.testStats.flaky}`, 'neutral');
      }
    } else {
      printStatus(
        `Fusion Test Results (${fusionReportName}): No test statistics found`,
        'warning',
      );
    }

    console.log(`\n${fusionReportName} Coverage:`);
    if (fusionSummary.totalFiles > 0) {
      printStatus(
        `Overall: ${this.getColoredPercentage(fusionSummary.overallCoverage, 'statements')}`,
      );
      printStatus(
        `Files: ${fusionSummary.coveredFiles}/${fusionSummary.totalFiles}`,
        'neutral',
      );
      printStatus(
        `Statements: ${this.getColoredPercentage(fusionSummary.coveragePercentage.statements, 'statements')}`,
        'neutral',
      );
      printStatus(
        `Branches: ${this.getColoredPercentage(fusionSummary.coveragePercentage.branches, 'branches')}`,
        'neutral',
      );
      printStatus(
        `Functions: ${this.getColoredPercentage(fusionSummary.coveragePercentage.functions, 'functions')}`,
        'neutral',
      );
      printStatus(
        `Lines: ${this.getColoredPercentage(fusionSummary.coveragePercentage.lines, 'lines')}`,
        'neutral',
      );
    } else {
      printStatus(`${fusionReportName}: No coverage data found`, 'warning');
    }
  }

  private async generateCoverageReports(
    report: ReportConfig,
    coverage: CoverageMapData | null,
    reportTypes: CoverageReportType[] = ['json', 'lcov', 'clover'],
  ): Promise<void> {
    if (!coverage) {
      printStatus(
        `No ${report.name} coverage data available for reports`,
        'warning',
      );
      return;
    }

    try {
      const istanbulLibReport = await import('istanbul-lib-report');
      const createContext = istanbulLibReport.default.createContext;
      const istanbulReports = await import('istanbul-reports');
      const createReport = istanbulReports.default.create;
      const istanbulCoverage = await import('istanbul-lib-coverage');
      const { createCoverageMap } = istanbulCoverage.default;

      const coverageDir = report.output.coverage.dir;

      fs.mkdirSync(coverageDir, { recursive: true });

      if (reportTypes.includes('json')) {
        const jsonPath = path.resolve(coverageDir, 'coverage-final.json');

        if (report.type === 'playwright' && report.source.coverage.json) {
          const sourceCoverageFile = report.source.coverage.json;
          if (fs.existsSync(sourceCoverageFile)) {
            fs.copyFileSync(sourceCoverageFile, jsonPath);
            printStatus('Copied JSON report', 'success', jsonPath);
          } else {
            fs.writeFileSync(jsonPath, JSON.stringify(coverage));
            printStatus('Generated JSON report', 'success', jsonPath);
          }
        } else {
          fs.writeFileSync(jsonPath, JSON.stringify(coverage));
          printStatus('Generated JSON report', 'success', jsonPath);
        }
      }

      const otherReportTypes = reportTypes.filter((type) => type !== 'json');
      if (otherReportTypes.length === 0) {
        return;
      }

      const reportCoverageMap = createCoverageMap({});
      for (const [filePath, coverageData] of Object.entries(coverage)) {
        const validCoverageData = createValidCoverageData(
          filePath,
          coverageData,
          this.config.rootDir,
        );
        reportCoverageMap.addFileCoverage(validCoverageData);
      }

      const reportThreshold =
        report.coverageThreshold || this.config.fusionReport.coverageThreshold;
      const watermarks = getWatermarksFromThreshold(reportThreshold);

      const context = createContext({
        dir: coverageDir,
        coverageMap: reportCoverageMap,
        watermarks,
      });

      for (const reportType of otherReportTypes) {
        try {
          const istanbulReport = createReport(reportType);
          istanbulReport.execute(context);

          let reportPath: string;
          switch (reportType) {
            case 'lcov':
              reportPath = path.resolve(coverageDir, 'lcov.info');
              break;
            case 'clover':
              reportPath = path.resolve(coverageDir, 'clover.xml');
              break;
            case 'html':
              reportPath = path.resolve(coverageDir, 'index.html');
              break;
            case 'text':
            case 'text-summary':
              reportPath = path.resolve(coverageDir, 'coverage.txt');
              break;
            case 'json-summary':
              reportPath = path.resolve(coverageDir, 'coverage-summary.json');
              break;
            default:
              reportPath = path.resolve(coverageDir, `${reportType}.txt`);
          }

          printStatus(
            `Generated ${reportType.toUpperCase()} report`,
            'success',
            reportPath,
          );
        } catch (error) {
          console.error(
            `Failed to generate ${reportType} report for ${report.name}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    } catch (error) {
      console.error(`Error generating ${report.name} coverage reports:`, error);
    }
  }

  private async generatePlaywrightReports(
    report: PlaywrightReportConfig,
    playwrightCoverage: CoverageMapData | null,
  ): Promise<void> {
    const reportTypes = report.coverageReports || ['json', 'lcov', 'clover'];
    await this.generateCoverageReports(report, playwrightCoverage, reportTypes);
  }

  private async generateFusionCoverageReports(
    allCoverageData: Array<{
      report: ReportConfig;
      coverage: CoverageMapData | null;
    }>,
  ): Promise<void> {
    const coverageList = allCoverageData
      .map((item) => item.coverage)
      .filter((coverage): coverage is CoverageMapData => coverage !== null);

    if (coverageList.length === 0) {
      printStatus('No coverage data available for fusion reports', 'warning');
      return;
    }

    try {
      const istanbulLibReport = await import('istanbul-lib-report');
      const createContext = istanbulLibReport.default.createContext;
      const istanbulReports = await import('istanbul-reports');
      const createReport = istanbulReports.default.create;
      const istanbulCoverage = await import('istanbul-lib-coverage');
      const { createCoverageMap } = istanbulCoverage.default;

      let fusionCoverage: CoverageMapData | null = null;

      const normalizedCoverageList = allCoverageData
        .filter(
          (item): item is { report: ReportConfig; coverage: CoverageMapData } =>
            item.coverage !== null,
        )
        .map(({ report, coverage }) => {
          const tp =
            'transformPath' in report ? report.transformPath : undefined;
          if (tp) {
            return normalizeCoverageData(coverage, this.config.rootDir, tp);
          }
          return coverage;
        });

      for (const coverage of normalizedCoverageList) {
        if (fusionCoverage === null) {
          fusionCoverage = coverage;
        } else {
          fusionCoverage = mergeCoverageData(
            fusionCoverage,
            coverage,
            this.config.rootDir,
          );
        }
      }

      if (!fusionCoverage) {
        return;
      }

      const fusionCoverageDir = this.config.fusionReport.coverage.dir;
      fs.mkdirSync(fusionCoverageDir, { recursive: true });

      const reportTypes = this.config.fusionReport.coverage.reports || [
        'json',
        'lcov',
        'clover',
      ];

      if (reportTypes.includes('json')) {
        const fusionCoverageJson = path.resolve(
          fusionCoverageDir,
          'coverage-final.json',
        );
        fs.writeFileSync(fusionCoverageJson, JSON.stringify(fusionCoverage));
        printStatus('Generated JSON report', 'success', fusionCoverageJson);
      }

      const otherReportTypes = reportTypes.filter((type) => type !== 'json');
      if (otherReportTypes.length === 0) {
        return;
      }

      const reportCoverageMap = createCoverageMap({});
      for (const [filePath, coverageData] of Object.entries(fusionCoverage)) {
        const validCoverageData = createValidCoverageData(
          filePath,
          coverageData,
          this.config.rootDir,
        );
        reportCoverageMap.addFileCoverage(validCoverageData);
      }

      const watermarks = getWatermarksFromThreshold(
        this.config.fusionReport.coverageThreshold,
      );

      const context = createContext({
        dir: fusionCoverageDir,
        coverageMap: reportCoverageMap,
        watermarks,
      });

      for (const reportType of otherReportTypes) {
        try {
          const istanbulReport = createReport(reportType);
          istanbulReport.execute(context);

          let reportPath: string;
          switch (reportType) {
            case 'lcov':
              reportPath = path.resolve(fusionCoverageDir, 'lcov.info');
              break;
            case 'clover':
              reportPath = path.resolve(fusionCoverageDir, 'clover.xml');
              break;
            case 'html':
              reportPath = path.resolve(fusionCoverageDir, 'index.html');
              break;
            case 'text':
            case 'text-summary':
              reportPath = path.resolve(fusionCoverageDir, 'coverage.txt');
              break;
            case 'json-summary':
              reportPath = path.resolve(
                fusionCoverageDir,
                'coverage-summary.json',
              );
              break;
            default:
              reportPath = path.resolve(fusionCoverageDir, `${reportType}.txt`);
          }

          printStatus(
            `Generated ${reportType.toUpperCase()} report`,
            'success',
            reportPath,
          );
        } catch (error) {
          console.error(
            `Failed to generate ${reportType} report for fusion coverage:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    } catch (error) {
      console.error('Error generating fusion coverage reports:', error);
    }
  }

  private collectAllReportData(): FusionReport {
    const reportSummaries: Record<string, ReportSummary> = {};
    const allTestStats: Array<{
      report: ReportConfig;
      stats: TestStats | null;
    }> = [];

    for (const report of this.config.reports) {
      let coverage: CoverageMapData | null = null;
      let testStats: TestStats | null = null;

      if (report.type === 'jest' || report.type === 'vitest') {
        const coverageFile =
          report.source.coverage.json ||
          path.resolve(report.source.coverage.dir, 'coverage-final.json');
        coverage = readJestCoverage(coverageFile);
        if (report.source.testResults?.json) {
          testStats = readJestJsonTestStats(report.source.testResults.json);
        } else {
          testStats = readJestTestStats(report.source.testReport?.html || '');
        }
      } else if (report.type === 'other') {
        const coverageFile =
          report.source.coverage.json ||
          path.resolve(report.source.coverage.dir, 'coverage-final.json');
        coverage = readJestCoverage(coverageFile);
      } else if (report.type === 'playwright') {
        const coverageFile = path.resolve(
          report.source.coverage.dir,
          'coverage-final.json',
        );
        coverage = readPlaywrightCoverage(coverageFile);
        testStats = readPlaywrightTestResults(
          report.source.testResults?.json || '',
        );
      }

      allTestStats.push({ report, stats: testStats });

      const metrics = coverage
        ? extractCoverageMetrics(coverage)
        : getEmptyCoverageMetrics();

      reportSummaries[report.name.toLowerCase()] = {
        testStats: testStats || undefined,
        coveragePercentage: {
          statements: calculatePercentage(
            metrics.coveredStatements,
            metrics.totalStatements,
          ),
          branches: calculatePercentage(
            metrics.coveredBranches,
            metrics.totalBranches,
          ),
          functions: calculatePercentage(
            metrics.coveredFunctions,
            metrics.totalFunctions,
          ),
          lines: calculatePercentage(metrics.coveredLines, metrics.totalLines),
        },
        overallCoverage: calculateOverallCoverage({
          coveredStatements: metrics.coveredStatements,
          totalStatements: metrics.totalStatements,
          coveredBranches: metrics.coveredBranches,
          totalBranches: metrics.totalBranches,
          coveredFunctions: metrics.coveredFunctions,
          totalFunctions: metrics.totalFunctions,
          coveredLines: metrics.coveredLines,
          totalLines: metrics.totalLines,
        }),
        coveredFiles: metrics.coveredFiles,
        totalFiles: metrics.totalFiles,
      };
    }

    const fusionCoverageJson = path.resolve(
      this.config.fusionReport.coverage.dir,
      'coverage-final.json',
    );
    const fusionCoverage = readFusionCoverage(fusionCoverageJson);
    const fusionMetrics = fusionCoverage
      ? extractCoverageMetrics(fusionCoverage)
      : getEmptyCoverageMetrics();

    let mergedStats: TestStats | null = null;
    for (const { stats } of allTestStats) {
      mergedStats = mergeTestStats(mergedStats, stats);
    }

    reportSummaries.fusion = {
      testStats: mergedStats || undefined,
      coveragePercentage: {
        statements: calculatePercentage(
          fusionMetrics.coveredStatements,
          fusionMetrics.totalStatements,
        ),
        branches: calculatePercentage(
          fusionMetrics.coveredBranches,
          fusionMetrics.totalBranches,
        ),
        functions: calculatePercentage(
          fusionMetrics.coveredFunctions,
          fusionMetrics.totalFunctions,
        ),
        lines: calculatePercentage(
          fusionMetrics.coveredLines,
          fusionMetrics.totalLines,
        ),
      },
      overallCoverage: calculateOverallCoverage({
        coveredStatements: fusionMetrics.coveredStatements,
        totalStatements: fusionMetrics.totalStatements,
        coveredBranches: fusionMetrics.coveredBranches,
        totalBranches: fusionMetrics.totalBranches,
        coveredFunctions: fusionMetrics.coveredFunctions,
        totalFunctions: fusionMetrics.totalFunctions,
        coveredLines: fusionMetrics.coveredLines,
        totalLines: fusionMetrics.totalLines,
      }),
      coveredFiles: fusionMetrics.coveredFiles,
      totalFiles: fusionMetrics.totalFiles,
    };

    const reports: Array<{
      name: string;
      type: ReportType;
      hasTestReport: boolean;
      testStats?: TestStats;
      coveragePercentage: {
        statements: number;
        branches: number;
        functions: number;
        lines: number;
      };
      overallCoverage: number;
      coveredFiles: number;
      totalFiles: number;
    }> = [];

    for (const report of this.config.reports) {
      const reportKey = report.name.toLowerCase();
      const summary = reportSummaries[reportKey];
      if (summary) {
        reports.push({
          name: report.name,
          type: report.type,
          hasTestReport: !!(
            report.source.testReport?.html || report.source.testReport?.dir
          ),
          ...summary,
        });
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      reports,
      summary: reportSummaries as FusionReport['summary'],
    };
  }

  private generateHtmlReport(fusionReport: FusionReport): void {
    const templatePath = path.resolve(
      this.config.projectDir,
      '../template.html',
    );
    let templateContent = fs.readFileSync(templatePath, 'utf-8');

    templateContent = this.replacePlaceholders(templateContent, fusionReport);

    const fusionHtmlFile = path.resolve(this.config.fusionDir, 'index.html');
    fs.writeFileSync(fusionHtmlFile, templateContent);
  }

  private replacePlaceholders(template: string, data: FusionReport): string {
    const templateFn = this.handlebars.compile(template);
    return templateFn(data);
  }

  private copyExistingReports(): void {
    try {
      for (const report of this.config.reports) {
        if (
          (report.type === 'jest' || report.type === 'vitest') &&
          report.output.testReport?.dir &&
          report.source.testReport?.html
        ) {
          fs.mkdirSync(report.output.testReport.dir, { recursive: true });

          const sourceHtml = report.source.testReport.html;
          const destHtml = path.resolve(
            report.output.testReport.dir,
            'index.html',
          );

          if (fs.existsSync(sourceHtml)) {
            fs.copyFileSync(sourceHtml, destHtml);
            printStatus(
              `${report.name} test report HTML copied`,
              'success',
              destHtml,
            );
          } else {
            printStatus(
              `${report.name} test report HTML not found`,
              'warning',
              sourceHtml,
            );
          }
        }

        if (report.output.testReport?.dir && report.source.testReport?.dir) {
          fs.mkdirSync(report.output.testReport.dir, { recursive: true });

          const sourceDir = report.source.testReport.dir;
          if (fs.existsSync(sourceDir)) {
            fs.cpSync(sourceDir, report.output.testReport.dir, {
              recursive: true,
            });
            printStatus(
              `${report.name} test report directory copied`,
              'success',
              report.output.testReport.dir,
            );
          } else {
            printStatus(
              `${report.name} test report directory not found`,
              'warning',
            );
          }
        }

        if (
          report.type === 'playwright' &&
          report.output.testResults?.dir &&
          report.source.testResults?.dir
        ) {
          fs.mkdirSync(report.output.testResults.dir, { recursive: true });

          const sourceDir = report.source.testResults.dir;
          if (fs.existsSync(sourceDir)) {
            fs.cpSync(sourceDir, report.output.testResults.dir, {
              recursive: true,
            });
            printStatus(
              `${report.name} test results directory copied`,
              'success',
              report.output.testResults.dir,
            );
          } else {
            printStatus(
              `${report.name} test results directory not found`,
              'warning',
            );
          }
        }

        if (fs.existsSync(report.source.coverage.dir)) {
          fs.cpSync(report.source.coverage.dir, report.output.coverage.dir, {
            recursive: true,
          });
          printStatus(
            `${report.name} coverage directory copied`,
            'success',
            report.output.coverage.dir,
          );
        } else {
          printStatus(`${report.name} coverage directory not found`, 'warning');
        }
      }
    } catch (error) {
      console.error('Error copying existing reports:', error);
    }
  }
}
