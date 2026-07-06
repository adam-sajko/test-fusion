# Test Fusion Examples

Three self-contained, runnable examples that each fuse unit coverage with Playwright E2E
coverage over the **same source**. They are exercised in CI (`yarn test`), so their configs
stay accurate — treat them as the copy-paste source of truth for setup.

For the concepts behind this (why fuse, the report shapes, path normalization), see the main
README: [Fusion vs Aggregation](../README.md#fusion-vs-aggregation) and
[Path Normalization](../README.md#path-normalization).

## The examples

- **[vite-mono](vite-mono/README.md)** — a monorepo, all Vite: a UI library and an app both
  unit-tested with Vitest, plus a Playwright workspace for E2E. Pick this if you use Vite/Vitest
  across multiple packages.
- **[jest-mono](jest-mono/README.md)** — a monorepo, all Jest: a UI library and an app both
  unit-tested with Jest (Webpack build), plus a Playwright workspace for E2E. Pick this if you
  use Jest, especially with Webpack.
- **[vite-single](vite-single/README.md)** — a single package: components, Vitest unit tests, and
  Playwright E2E all in one repo, fusing over one `src/**` tree. Pick this if your project is a
  single package rather than a monorepo.

In each, unit tests exercise only some of the UI, the app's Playwright run exercises the rest, and
the fused report unions them per file (~93%), while a genuinely unused component stays uncovered.
Because every toolchain instruments the **original TSX** with `babel-plugin-istanbul`, unit and
E2E statement maps align and fuse correctly.

## Running

```bash
yarn install
yarn example:vite-mono     # Run the Vite monorepo example end to end + fuse
yarn example:jest-mono     # Run the Jest monorepo example end to end + fuse
yarn example:vite-single   # Run the single-package example end to end + fuse
yarn show:vite-mono        # Open a fused report (also show:jest-mono / show:vite-single)
yarn test                  # Full pipeline: all examples + stale-snapshots checks
yarn test -- --sharded     # Same, but each example's Playwright runs sharded in Docker
yarn test -- --only vite-mono   # Run just one example (optionally add --sharded)
```

All three carry the full visual-snapshot + Docker-sharding setup and each doubles as a fixture
for the [`@test-fusion/playwright-stale-snapshots`](../packages/integrations/playwright-stale-snapshots/README.md)
integration test.
