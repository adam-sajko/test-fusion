#!/usr/bin/env node

import path from 'node:path';
import { Command } from 'commander';
import open from 'open';

import { ReportBuilder } from './report-builder.js';
import type { Config } from './types/index.js';

interface LoadConfigOptions {
  config?: string;
  dir?: string;
}

async function loadConfig(options: LoadConfigOptions = {}): Promise<Config> {
  // --config and --dir resolve from cwd, as consumers expect.
  // Auto-discovery falls back to PROJECT_CWD (yarn berry) / INIT_CWD (npm)
  // so `yarn workspace <pkg> generate-report` finds the config at the monorepo root.
  const resolvedPath = options.config
    ? path.resolve(process.cwd(), options.config)
    : path.resolve(
        options.dir
          ? path.resolve(process.cwd(), options.dir)
          : (process.env.PROJECT_CWD ?? process.env.INIT_CWD ?? process.cwd()),
        'test-fusion.config.ts',
      );

  try {
    const configModule = await import(resolvedPath);
    return configModule.default ?? configModule.config;
  } catch (error) {
    console.error(
      `\x1b[31m✗\x1b[0m Failed to load config from ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

const program = new Command();

program
  .name('test-fusion')
  .description(
    'Merge test reports and coverage data from multiple test runners into a single dashboard',
  )
  .version('0.0.0');

program
  .command('build', { isDefault: true })
  .description('Generate the combined test fusion report')
  .option('-c, --config <path>', 'Path to config file')
  .option(
    '-d, --dir <path>',
    'Base directory to resolve config from (defaults to cwd)',
  )
  .option('-o, --output <path>', 'Output directory for the generated report')
  .option(
    '-D, --dry-run',
    'Validate configuration paths without generating reports',
  )
  .action(async (options) => {
    const config = await loadConfig(options);

    if (options.output) {
      const newFusionDir = path.resolve(process.cwd(), options.output);
      const oldFusionDir = config.fusionDir;
      const remap = (p: string) =>
        p.startsWith(oldFusionDir)
          ? newFusionDir + p.slice(oldFusionDir.length)
          : p;

      config.fusionDir = newFusionDir;
      config.fusionReport.coverage.dir = remap(
        config.fusionReport.coverage.dir,
      );

      for (const report of config.reports) {
        report.output.coverage.dir = remap(report.output.coverage.dir);
        const out = report.output as Record<
          string,
          { dir: string } | undefined
        >;
        if (out.testReport) out.testReport.dir = remap(out.testReport.dir);
        if (out.testResults) out.testResults.dir = remap(out.testResults.dir);
      }
    }

    const reportBuilder = new ReportBuilder(config);

    if (options.dryRun) {
      reportBuilder.dryRun();
    } else {
      try {
        await reportBuilder.buildReport();
      } catch (error) {
        console.error(
          'Error during report generation:',
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    }
  });

program
  .command('open')
  .description('Open the generated test fusion report in your browser')
  .option('-c, --config <path>', 'Path to config file')
  .option(
    '-d, --dir <path>',
    'Base directory to resolve config from (defaults to cwd)',
  )
  .option('-p, --port <port>', 'Port to serve the report on', '7777')
  .action(async (options) => {
    const config = await loadConfig(options);
    try {
      const { createServer } = await import('node:http');
      const { readFileSync, existsSync } = await import('node:fs');
      const { extname, join } = await import('node:path');

      const port = parseInt(options.port, 10);
      if (Number.isNaN(port) || port < 0 || port > 65535) {
        console.error(
          `\x1b[31m✗\x1b[0m Invalid port: ${options.port}. Must be a number between 0 and 65535.`,
        );
        process.exit(1);
      }
      const fusionDir = config.fusionDir;

      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
        '.woff2': 'font/woff2',
        '.woff': 'font/woff',
      };

      const { readdirSync } = await import('node:fs');

      const isPathSafe = (resolved: string) =>
        resolved === fusionDir || resolved.startsWith(`${fusionDir}/`);

      const server = createServer((req, res) => {
        const urlPath = decodeURIComponent(req.url ?? '/').split('?')[0] ?? '/';
        const filePath = join(
          fusionDir,
          urlPath === '/' ? 'index.html' : urlPath,
        );

        if (!isPathSafe(filePath)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        // Some SPA reporters (e.g. @vitest/ui) use absolute paths like /coverage/...
        // that only work when served from root. If the path doesn't exist at root,
        // scan report subdirectories for a matching subfolder and redirect there.
        if (!existsSync(filePath)) {
          const topSegment = urlPath.split('/').filter(Boolean)[0];
          if (topSegment) {
            try {
              const subdirs = readdirSync(fusionDir, { withFileTypes: true })
                .filter((d) => d.isDirectory())
                .map((d) => d.name);
              for (const subdir of subdirs) {
                const candidate = join(fusionDir, subdir, urlPath);
                if (existsSync(candidate)) {
                  res.writeHead(302, { Location: `/${subdir}${urlPath}` });
                  res.end();
                  return;
                }
              }
            } catch {
              // fall through
            }
          }
        }

        if (existsSync(filePath) && !filePath.endsWith('/')) {
          try {
            const data = readFileSync(filePath);
            const ext = extname(filePath);
            const headers: Record<string, string> = {
              'Content-Type': mimeTypes[ext] ?? 'application/octet-stream',
            };
            // Serve pre-compressed gzip files with correct encoding so the browser
            // decompresses them (e.g. vitest's html.meta.json.gz test data file)
            if (ext === '.gz') {
              const innerExt = extname(filePath.slice(0, -3));
              headers['Content-Type'] =
                mimeTypes[innerExt] ?? 'application/octet-stream';
              headers['Content-Encoding'] = 'gzip';
            }
            res.writeHead(200, headers);
            res.end(data);
            return;
          } catch {
            // fall through
          }
        }

        const parts = urlPath.split('/').filter(Boolean);
        while (parts.length > 0) {
          const candidate = join(fusionDir, ...parts, 'index.html');
          if (existsSync(candidate)) {
            const data = readFileSync(candidate);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
            return;
          }
          parts.pop();
        }

        const rootIndex = join(fusionDir, 'index.html');
        if (existsSync(rootIndex)) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(readFileSync(rootIndex));
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.error(
            `\x1b[31m✗\x1b[0m Port ${port} is already in use. Try a different port with --port <port>`,
          );
        } else {
          console.error(`\x1b[31m✗\x1b[0m Server error: ${err.message}`);
        }
        process.exit(1);
      });

      server.listen(port, 'localhost', async () => {
        const url = `http://localhost:${port}`;
        console.log(`\x1b[32m✓\x1b[0m Serving report at ${url}`);
        open(url);
        console.log('\x1b[90mPress Ctrl+C to stop\x1b[0m');
      });
    } catch (error) {
      console.error(
        `\x1b[31m✗\x1b[0m Failed to open report: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  });

program.parse();
