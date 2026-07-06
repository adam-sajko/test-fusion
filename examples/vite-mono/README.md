# vite-mono — Vite monorepo example

A monorepo where a UI library and an app are both unit-tested with **Vitest**, and a separate
Playwright workspace runs **E2E** against the built app. All three reports cover the same
`ui/**` + `app/**` source and fuse per file.

Unit tests cover only part of the UI; the E2E run exercises the rest. The fused report unions
them per file (~93%), while a component that nothing renders stays uncovered — the point of
fusion. See the [main README](../../README.md#fusion-vs-aggregation) for the concept.

![Fused test report for the vite-mono example](report.png)

## Layout

| Workspace | Role |
| --------- | ---- |
| `@ex-vite-mono/ui` | UI component library, unit-tested with Vitest |
| `@ex-vite-mono/app` | App that renders the UI, unit-tested with Vitest, built with Vite |
| `@ex-vite-mono/playwright` | Playwright E2E driving the built app |

## How coverage is collected and fused

The key rule: every runner instruments the **original TSX** with `babel-plugin-istanbul` so the
statement maps line up and fuse per file (see the [main README](../../README.md#playwright)).

- **Unit coverage** — Vitest uses the Istanbul provider so its keys match the E2E keys:
  [ui/vitest.config.ts](ui/vitest.config.ts), [app/vitest.config.ts](app/vitest.config.ts).
- **Instrumented build** — a `enforce: 'pre'` Vite plugin instruments the source before esbuild,
  gated on `USE_COVERAGE`: [app/vite.config.mts](app/vite.config.mts).
- **E2E coverage collection** — the Playwright coverage reporter plus a zero-coverage baseline
  (so untested components appear at 0%), with `cwd` set to the example root so keys are relative:
  [playwright/coverage.options.ts](playwright/coverage.options.ts),
  [playwright/playwright.config.ts](playwright/playwright.config.ts).
- **Fusion** — the three reports are wired together in
  [test-fusion.config.ts](test-fusion.config.ts).

## Run it

```bash
yarn example:vite-mono     # unit + build + E2E, then fuse
yarn show:vite-mono        # open the fused report
```

Or sharded across Docker (this example only):

```bash
yarn test -- --only vite-mono --sharded
```

## Visual snapshots

The Playwright suite includes visual snapshot tests and doubles as a fixture for the
[`@test-fusion/playwright-stale-snapshots`](../../packages/integrations/playwright-stale-snapshots/README.md)
integration test.
