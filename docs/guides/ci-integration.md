---
layout: default
title: CI Integration
parent: Guides
nav_order: 3
---

# CI Integration

Aver tests run in any CI system that supports Node.js. This guide covers GitHub Actions with JUnit reporting and Playwright browser testing.

## Basic Setup

Aver tests are Vitest tests, so standard Vitest CI configuration works:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx vitest run
```

## JUnit Reporting

Use Vitest's built-in JUnit reporter for CI-friendly test output:

```yaml
      - run: npx vitest run --reporter=junit --reporter=default --outputFile.junit=test-results.xml
```

The `--reporter=default` keeps console output alongside the XML report.

## Playwright in CI

If your adapters use `@aver/protocol-playwright`, install browsers:

```yaml
      - run: npx playwright install --with-deps chromium
```

Cache browsers for faster runs:

```yaml
      - name: Get Playwright version
        id: pw-version
        run: echo "version=$(npx playwright --version)" >> $GITHUB_OUTPUT

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.pw-version.outputs.version }}
          restore-keys: playwright-${{ runner.os }}-

      - name: Install Playwright
        run: npx playwright install --with-deps chromium
```

## GitHub Actions Annotations

Add the `github-actions` reporter for inline failure annotations on PRs:

```yaml
      - run: >
          npx vitest run
          --reporter=junit
          --reporter=github-actions
          --reporter=default
          --outputFile.junit=test-results.xml
```

## Build Before Testing

If your adapters import from built packages (common in monorepos), build first:

```yaml
      - name: Build
        run: npm run build -w packages/aver

      - name: Test
        run: npx vitest run
```

## Running Multiple Packages

For monorepos, run each package separately with `if: !cancelled()` so all suites run even if one fails:

```yaml
      - name: Test core
        run: npx vitest run
        working-directory: packages/aver

      - name: Test API adapter
        if: ${{ !cancelled() }}
        run: npx vitest run
        working-directory: packages/my-api

      - name: Test browser adapter
        if: ${{ !cancelled() }}
        run: npx vitest run
        working-directory: packages/my-browser
```

## Example: Complete Workflow

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Get Playwright version
        id: pw-version
        run: echo "version=$(npx playwright --version)" >> $GITHUB_OUTPUT

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.pw-version.outputs.version }}
          restore-keys: playwright-${{ runner.os }}-

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Build
        run: npm run build

      - name: Test
        run: >
          npx vitest run
          --reporter=junit
          --reporter=github-actions
          --reporter=default
          --outputFile.junit=test-results.xml
```
