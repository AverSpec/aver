# CI Reporter + GitHub Actions Design

**Date**: 2026-02-09
**Goal**: JUnit XML reporter with domain action traces + GHA workflow to dogfood it

## Part 1: GHA Workflow (built-in JUnit reporter)

Single workflow `.github/workflows/ci.yml`:
- **Triggers**: push to `main`, pull requests
- **Steps**: install deps → build core → install Playwright browsers → run tests with `--reporter=junit`
- **Output**: per-workspace XML files in `test-results/`
- **Reporting**: `dorny/test-reporter` creates a Tests tab on the workflow run

This gets CI working with zero new library code.

## Part 2: Custom Aver Reporter

`packages/aver/src/reporter/junit.ts`, exported via `aver/reporter` subpath.

Vitest custom reporter that:
- Outputs standard JUnit XML `<testcase>` elements
- On failure: embeds domain action traces in the `<failure>` message body — shows the `act → query → assert` sequence leading up to the failure, not just the assertion error
- Configurable: `averReporter({ output: 'test-results.xml' })`

Usage in `vitest.config.ts`:
```typescript
import { averReporter } from 'aver/reporter'

export default defineConfig({
  test: {
    reporters: [averReporter({ output: 'test-results.xml' })]
  }
})
```

Once built, GHA workflow switches from `--reporter=junit` to the custom reporter.

## Sequencing

1. Wire GHA with Vitest's built-in `junit` reporter (validate pipeline)
2. Build custom reporter with action trace enrichment
3. Switch GHA to use custom reporter
