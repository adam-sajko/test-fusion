# Test Fusion

Merge test reports and coverage data from multiple test runners into a single HTML dashboard. Supports Jest, Vitest, and Playwright out of the box, with coverage-only support for any Istanbul-compatible runner.

![Test Fusion Dashboard](screencapture.png)

## Why

Most projects have multiple test suites — unit tests, integration tests, E2E tests — each covering different parts of the codebase. Looking at their coverage reports separately doesn't tell you the full picture. Your unit tests might cover 70% of the code, and your E2E tests exercise a completely different 30%. Together that's full coverage, but you'd never know without merging them.

Test Fusion combines Istanbul coverage data from all your test runners into a single report, giving you an accurate picture of what your test suite actually covers.

## Quick Start

### 1. Install

```bash
npm install @test-fusion/core
```

### 2. Set Up Your Test Runners

Each runner needs to output Istanbul coverage data (`coverage-final.json`) and, optionally, JSON test results. Follow the guide for each runner you use:

- [Vitest](#vitest)
- [Jest](#jest)
- [Playwright](#playwright) (requires extra instrumentation)
- [Other runners](#other-runners) (coverage only)

### 3. Configure Test Fusion

Create a `test-fusion.config` file (`.ts`, `.js`, `.mjs`, or `.cjs`) at your project root. Point it at the coverage and results directories from each runner:

```ts
import { defineConfig } from "@test-fusion/core";

export default defineConfig({
  name: "My Project",
  rootDir: import.meta.dirname,
  reports: [
    {
      type: "vitest",
      name: "Vitest",
      source: {
        coverage: { dir: "<path-to-vitest-coverage-dir>" },
        testReport: { dir: "<path-to-vitest-report-dir>" }, // optional
        testResults: { json: "<path-to-vitest-results.json>" }, // optional
      },
    },
    {
      type: "playwright",
      name: "E2E Tests",
      source: {
        coverage: { dir: "<path-to-playwright-coverage-dir>" },
        testReport: { dir: "<path-to-playwright-report-dir>" }, // optional
        testResults: { json: "<path-to-playwright-results.json>" }, // optional
      },
    },
  ],
});
```

| Type         | Test results parsing    | Use for                                             |
| ------------ | ----------------------- | --------------------------------------------------- |
| `vitest`     | Vitest JSON output      | Vitest                                              |
| `jest`       | Jest JSON output        | Jest                                                |
| `playwright` | Playwright JSON results | Playwright                                          |
| `other`      | None (coverage only)    | Node test runner, Mocha, Karma, or any other runner |

`vitest` and `jest` share the same JSON format internally — use whichever matches your runner. Use `type: 'other'` when your test runner outputs Istanbul coverage but doesn't match any of the above. Coverage will be merged into the fusion report; test results (pass/fail counts) will be omitted from the dashboard.

### 4. Generate the Report

```bash
npx test-fusion build                    # Generate HTML dashboard
npx test-fusion build --output ./report  # Custom output directory
npx test-fusion open                     # Serve and open in browser
```

---

## Setting Up Test Runners

### Vitest

Configure Vitest to produce coverage and JSON test results (`vitest.config.ts`):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "istanbul",
      reporter: ["json", "html", "lcov"],
      thresholds: { branches: 80, functions: 80, lines: 80, statements: 80 },
    },
    reporters: ["default", "json", "html"],
    outputFile: {
      json: "./test-results.json",
      html: "./test-report/index.html",
    },
  },
});
```

No additional instrumentation is needed — Vitest handles coverage natively.

### Jest

Configure Jest to produce coverage and JSON test results (`jest.config.js`):

```js
module.exports = {
  collectCoverage: true,
  coverageReporters: ["json", "html", "lcov"],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};
```

```bash
jest --json --outputFile=./test-results.json
```

No additional instrumentation is needed — Jest handles coverage natively.

### Playwright

Playwright runs tests in a browser, so it doesn't produce Istanbul coverage by default. You need two things: (1) instrument your app so the browser exposes `window.__coverage__`, and (2) collect that data after each test.

#### Step 1: Instrument Your App

Add Istanbul instrumentation to your bundler so `window.__coverage__` is available at runtime. This should only be enabled during CI or when running Playwright — not in production.

> **Important:** If you plan to merge Playwright coverage with unit test coverage (Vitest, Jest) for the **same source files** using test-fusion's fusion report, Istanbul must instrument the **original TypeScript source** — not the compiled JavaScript output. Use `@babel/preset-typescript` together with `babel-plugin-istanbul` in a single Babel pass so that statement maps use original source line numbers. Approaches that compile TypeScript first (e.g. `ts-loader`, `esbuild`, `vite-plugin-istanbul`) and then instrument the result will produce statement maps with compiled-JS line numbers that cannot be merged correctly with unit test coverage.
>
> If you only use Playwright coverage without merging it with unit test coverage for the same files, standard approaches like `vite-plugin-istanbul` or `ts-loader` + `babel-plugin-istanbul` work fine.

**Vite** — use a `enforce: 'pre'` plugin to instrument before Vite's built-in esbuild transform:

```ts
import { transformSync } from "@babel/core";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

function istanbulPlugin(): Plugin {
  let babel: typeof import("@babel/core");
  return {
    name: "istanbul-instrument",
    enforce: "pre",
    async buildStart() {
      babel = await import("@babel/core");
    },
    transform(code, id) {
      if (!/\.[jt]sx?$/.test(id) || id.includes("node_modules")) return null;
      const result = babel.transformSync(code, {
        filename: id,
        configFile: false,
        babelrc: false,
        presets: [
          ["@babel/preset-typescript", { isTSX: true, allExtensions: true }],
        ],
        plugins: [
          [
            "babel-plugin-istanbul",
            {
              include: ["src/**/*.{ts,tsx}"],
              exclude: ["**/*.test.{ts,tsx}"],
            },
          ],
        ],
        sourceMaps: true,
      });
      if (result?.code != null) return { code: result.code, map: result.map };
    },
  };
}

export default defineConfig({
  plugins: [process.env.USE_COVERAGE && istanbulPlugin()].filter(Boolean),
});
```

**Webpack** — use a single `babel-loader` with `@babel/preset-typescript` instead of `ts-loader`:

```js
module.exports = {
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "babel-loader",
            options: {
              presets: [
                "@babel/preset-env",
                ["@babel/preset-react", { runtime: "automatic" }],
                [
                  "@babel/preset-typescript",
                  { isTSX: true, allExtensions: true },
                ],
              ],
              plugins: [
                process.env.USE_COVERAGE && [
                  "babel-plugin-istanbul",
                  {
                    coverageVariable: "__coverage__",
                    include: ["src/**/*.{ts,tsx}"],
                    exclude: ["**/*.test.{ts,tsx}"],
                  },
                ],
              ].filter(Boolean),
            },
          },
        ],
      },
    ],
  },
};
```

Any bundler that produces Istanbul instrumentation will work — the key requirement is that `babel-plugin-istanbul` runs on the original TypeScript source (not post-compilation output) so that coverage maps are compatible across test runners.

#### Step 2: Install the Coverage Package

```bash
npm install @test-fusion/playwright-coverage
```

#### Step 3: Add the Coverage Reporter

**`config/coverage.ts`** — reporter options:

```ts
import type { PlaywrightCoverageReporterOptions } from "@test-fusion/playwright-coverage";

export const coverageOptions = {
  cwd: import.meta.dirname,
  coverageDir: "./playwright-coverage",
  projects: [
    {
      collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.test.{ts,tsx}"],
    },
  ],
} satisfies PlaywrightCoverageReporterOptions;
```

**`playwright.config.ts`** — register the reporter and serve your app with instrumentation enabled:

```ts
import { defineConfig } from "@playwright/test";
import { PlaywrightCoverageReporter } from "@test-fusion/playwright-coverage";
import { coverageOptions } from "./config/coverage";

export default defineConfig({
  reporter: [
    ["html", { open: "never" }],
    [PlaywrightCoverageReporter, coverageOptions],
  ],

  webServer: {
    command: "USE_COVERAGE=1 npm run build && npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: false,
  },

  // ...
});
```

You can also use the package name as a string: `['@test-fusion/playwright-coverage', coverageOptions]`.

If your app uses a dev server instead of a static build, pass `USE_COVERAGE` through the `env` option:

```ts
webServer: {
  command: 'npm run dev',
  url: 'http://localhost:5173',
  reuseExistingServer: false,
  env: { USE_COVERAGE: '1' },
},
```

#### Step 4: Record Coverage from a Fixture

**`fixtures/base.ts`** — collect `window.__coverage__` after each test:

```ts
import { test as base, expect } from "@playwright/test";
import { recordCoverage } from "@test-fusion/playwright-coverage";

export const test = base.extend({
  page: async ({ page, browserName }, use, testInfo) => {
    await use(page);
    // Collect coverage from one browser only to avoid duplicates across projects
    if (browserName === "chromium") {
      const coverage = await page.evaluate(() => (window as any).__coverage__);
      recordCoverage(testInfo, coverage);
    }
  },
});

export { expect };
```

Use the custom `test` from `fixtures/base.ts` in your test files instead of importing from `@playwright/test` directly.

#### Zero-Coverage Baselines

By default, only files that are rendered during tests appear in the coverage report. To include untested files with 0% coverage, install the instrumentation dependencies and add `getBabelConfig` to a project entry:

```bash
npm install @babel/core babel-plugin-istanbul istanbul-lib-instrument
```

Use the same Babel presets and plugins as your bundler config so the coverage structure (statements, branches, functions) matches what the runtime produces:

```ts
export const coverageOptions = {
  cwd: import.meta.dirname,
  coverageDir: "./playwright-coverage",
  projects: [
    {
      collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.test.{ts,tsx}"],
      getBabelConfig: () => ({
        presets: [
          "@babel/preset-env",
          "@babel/preset-react",
          "@babel/preset-typescript",
        ],
        plugins: [
          [
            "babel-plugin-istanbul",
            {
              cwd: import.meta.dirname,
              coverageVariable: "__coverage__",
              include: ["src/**/*.{ts,tsx}"],
              exclude: ["**/*.test.{ts,tsx}"],
            },
          ],
        ],
        sourceMaps: false,
        babelrc: false,
      }),
    },
  ],
} satisfies PlaywrightCoverageReporterOptions;
```

#### Sharding

Coverage collection works with Playwright sharding. With `--shard`, the reporter writes per-shard files (`coverage-shard-1.json`, `coverage-shard-2.json`, etc.). `test-fusion build` merges them automatically.

See the [Playwright sharding docs](https://playwright.dev/docs/test-sharding) for CI setup examples.

### Other Runners

For any runner that produces Istanbul coverage but isn't Vitest, Jest, or Playwright (e.g. Node test runner, Mocha, Karma), use `type: 'other'`. Coverage will be merged into the report; test results will be omitted from the dashboard.

---

## Monorepo Setup

In a monorepo, each app may instrument shared packages. Set `cwd` to the monorepo root so that coverage paths are relative to the root (not to each app), and use the same `include`/`exclude` patterns across all bundlers so coverage is consistent when merged:

```ts
import path from "node:path";

const monorepoRoot = path.resolve(import.meta.dirname, "../..");

istanbul({
  cwd: monorepoRoot,
  include: ["packages/**/src/**/*.{ts,tsx}"],
  exclude: ["**/*.test.{ts,tsx}"],
  // ...
});
```

The same applies to the coverage reporter options — set `cwd` to the monorepo root:

```ts
const cwd = path.resolve(import.meta.dirname, "../../");

const coverageOptions = {
  cwd,
  coverageDir: path.resolve(import.meta.dirname, "../playwright-coverage"),
  projects: [
    {
      collectCoverageFrom: ["packages/**/src/**/*.{ts,tsx}"],
    },
  ],
};
```

## Path Normalization

**Important:** For merging to work correctly, coverage from different runners must use consistent file paths. Test Fusion automatically strips `rootDir` from absolute paths to produce relative paths, which handles most cases.

However, when a runner produces paths that don't start with `rootDir`, the automatic stripping won't work. The most common case is Playwright running inside Docker — the coverage JSON contains container paths like `/app/src/Button.tsx`, but `rootDir` on the host is something like `/Users/me/project`. Use `transformPath` in your `test-fusion.config.ts` to strip the container prefix:

```ts
{
  type: 'playwright',
  name: 'Playwright',
  source: { coverage: { dir: './playwright-coverage' } },
  transformPath: (filePath, rootDir) => filePath.replace(/^.*?src\//, 'src/'),
}
```

The coverage reporter also supports `transformPath` for normalizing paths at collection time:

```ts
const coverageOptions = {
  cwd: import.meta.dirname,
  coverageDir: "./playwright-coverage",
  transformPath: (filePath, cwd) => filePath.replace(/^.*?src\//, "src/"),
  projects: [
    {
      collectCoverageFrom: ["src/**/*.{ts,tsx}"],
    },
  ],
};
```

## Contributing

### Sandbox

The `sandbox/` directory contains working example applications for testing the packages locally:

- **`@sandbox/vite-app`** — Vite + React app with Vitest and coverage instrumentation
- **`@sandbox/webpack-app`** — Webpack + React app with Jest and coverage instrumentation
- **`@sandbox/playwright`** — Playwright tests using `@test-fusion/playwright-coverage`
- **`@sandbox/ui`** — Shared UI component library with its own Vitest unit tests

```bash
yarn install
yarn test                 # Build, test everything, generate the fusion report
yarn test -- --sharded    # Same, but Playwright tests run sharded in Docker (requires Docker)
yarn show-report          # Open the report in your browser
```

### Commands

| Command                  | Description                                 |
| ------------------------ | ------------------------------------------- |
| `yarn dev`               | Start all dev servers                       |
| `yarn build`             | Build all packages                          |
| `yarn test`              | Full pipeline: build, test, generate report |
| `yarn test -- --sharded` | Same, but Playwright runs sharded in Docker |
| `yarn test -- --verbose` | Full pipeline with detailed output          |
| `yarn typecheck`         | Type-check all packages                     |
| `yarn lint`              | Lint with Biome                             |
| `yarn lint:fix`          | Auto-fix lint issues                        |
| `yarn format`            | Check formatting with Biome                 |
| `yarn format:fix`        | Auto-format all files                       |
| `yarn generate-report`   | Generate the test-fusion dashboard          |
| `yarn show-report`       | Serve and open the report                   |
| `yarn clean`             | Remove all build artifacts                  |

## License

MIT
