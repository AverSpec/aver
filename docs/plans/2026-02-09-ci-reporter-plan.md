# CI Reporter + GitHub Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a custom Vitest reporter that outputs JUnit XML with domain action traces on failure, then wire up GitHub Actions CI with `dorny/test-reporter`.

**Architecture:** Extend Vitest's `Reporter` interface to walk test modules and emit JUnit XML. On failure, include the enhanced error message (which already contains the action trace from `enhanceWithTrace` in suite.ts). The reporter is a factory function `averReporter({ output })` exported from `aver/reporter` subpath. GHA workflow runs all workspace tests and uploads XML results.

**Tech Stack:** Vitest Reporter API (v3), Node.js fs (XML output), GitHub Actions, dorny/test-reporter

---

## Task 1: Create GHA workflow with built-in JUnit reporter

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create the workflow file**

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

      - run: npm run build -w packages/aver

      - run: npx playwright install --with-deps chromium

      - name: Run tests
        run: npm test --workspaces -- --reporter=junit --reporter=default --outputFile=../../test-results/$npm_package_name.xml
        continue-on-error: true

      - name: Test Report
        uses: dorny/test-reporter@v1
        if: always()
        with:
          name: Tests
          path: test-results/*.xml
          reporter: java-junit

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: test-results/
```

Note: The `--outputFile` path uses `../../test-results/` because each workspace runs from its own directory. The `$npm_package_name` substitution may not work cross-platform; we'll validate in step 2 and adjust if needed.

**Step 2: Test locally that Vitest junit output works**

Run: `mkdir -p test-results && npx vitest run --reporter=junit --outputFile=test-results/aver.xml` (from `packages/aver/`)
Expected: `test-results/aver.xml` is created with valid JUnit XML

**Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow with JUnit reporting"
```

---

## Task 2: Fix GHA workflow for monorepo output paths

**Files:**
- Modify: `.github/workflows/ci.yml`

The `npm test --workspaces -- --outputFile` approach may not cleanly direct each workspace's XML to a unique file. A more reliable approach is explicit per-workspace test steps.

**Step 1: Update workflow to run each workspace explicitly**

Replace the single `npm test --workspaces` step with individual steps:

```yaml
      - name: Test aver (core)
        run: npx vitest run --reporter=junit --reporter=default --outputFile=../../test-results/aver.xml
        working-directory: packages/aver
        continue-on-error: true

      - name: Test mcp-server
        run: npx vitest run --reporter=junit --reporter=default --outputFile=../../test-results/mcp-server.xml
        working-directory: packages/mcp-server
        continue-on-error: true

      - name: Test protocol-http
        run: npx vitest run --reporter=junit --reporter=default --outputFile=../../test-results/protocol-http.xml
        working-directory: packages/protocol-http
        continue-on-error: true

      - name: Test protocol-playwright
        run: npx vitest run --reporter=junit --reporter=default --outputFile=../../test-results/protocol-playwright.xml
        working-directory: packages/protocol-playwright
        continue-on-error: true

      - name: Test example app
        run: npx vitest run --reporter=junit --reporter=default --outputFile=../../test-results/example-task-board.xml
        working-directory: examples/e-commerce
        continue-on-error: true
```

**Step 2: Verify locally**

Run from repo root:
```bash
mkdir -p test-results
cd packages/aver && npx vitest run --reporter=junit --reporter=default --outputFile=../../test-results/aver.xml && cd ../..
```
Expected: `test-results/aver.xml` has valid JUnit XML with all 64 aver tests

**Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: use explicit per-workspace test steps for reliable XML output"
```

---

## Task 3: Write unit tests for JUnit XML generator (red)

**Files:**
- Create: `packages/aver/test/core/reporter.spec.ts`

The reporter has two concerns: (1) generating JUnit XML from test results, and (2) hooking into Vitest's reporter API. We test the XML generator as a pure function.

**Step 1: Write tests for the XML generator**

```ts
import { describe, it, expect } from 'vitest'
import { generateJUnitXml } from '../../src/reporter/junit'

describe('generateJUnitXml', () => {
  it('generates valid XML for passing tests', () => {
    const xml = generateJUnitXml({
      name: 'aver',
      testSuites: [
        {
          name: 'Scaffolding',
          tests: 2,
          failures: 0,
          time: 0.05,
          testCases: [
            { name: 'creates project structure', classname: 'Scaffolding', time: 0.02 },
            { name: 'generates config', classname: 'Scaffolding', time: 0.03 },
          ],
        },
      ],
    })

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<testsuites name="aver"')
    expect(xml).toContain('<testsuite name="Scaffolding"')
    expect(xml).toContain('<testcase name="creates project structure"')
    expect(xml).not.toContain('<failure')
  })

  it('includes failure message and action trace', () => {
    const xml = generateJUnitXml({
      name: 'aver',
      testSuites: [
        {
          name: 'Domain init',
          tests: 1,
          failures: 1,
          time: 0.01,
          testCases: [
            {
              name: 'creates domain file',
              classname: 'Domain init',
              time: 0.01,
              failure: {
                message: 'expected true to be false',
                body: 'expected true to be false\n\nAction trace:\n  [PASS] AverInit.initProject({"dir":"/tmp/x"})\n  [FAIL] AverInit.initDomain({"dir":"/tmp/x","name":"task"})',
              },
            },
          ],
        },
      ],
    })

    expect(xml).toContain('<failure message="expected true to be false">')
    expect(xml).toContain('Action trace:')
    expect(xml).toContain('[PASS] AverInit.initProject')
    expect(xml).toContain('[FAIL] AverInit.initDomain')
  })

  it('escapes XML special characters', () => {
    const xml = generateJUnitXml({
      name: 'aver',
      testSuites: [
        {
          name: 'Edge & "cases"',
          tests: 1,
          failures: 0,
          time: 0.01,
          testCases: [
            { name: 'handles <angles>', classname: 'Edge & "cases"', time: 0.01 },
          ],
        },
      ],
    })

    expect(xml).toContain('Edge &amp; &quot;cases&quot;')
    expect(xml).toContain('handles &lt;angles&gt;')
  })

  it('aggregates totals in root testsuites element', () => {
    const xml = generateJUnitXml({
      name: 'aver',
      testSuites: [
        {
          name: 'Suite A',
          tests: 3,
          failures: 1,
          time: 0.1,
          testCases: [
            { name: 'test1', classname: 'Suite A', time: 0.03 },
            { name: 'test2', classname: 'Suite A', time: 0.03 },
            { name: 'test3', classname: 'Suite A', time: 0.04, failure: { message: 'fail', body: 'fail' } },
          ],
        },
        {
          name: 'Suite B',
          tests: 2,
          failures: 0,
          time: 0.05,
          testCases: [
            { name: 'test4', classname: 'Suite B', time: 0.025 },
            { name: 'test5', classname: 'Suite B', time: 0.025 },
          ],
        },
      ],
    })

    expect(xml).toContain('tests="5"')
    expect(xml).toContain('failures="1"')
  })
})
```

**Step 2: Run to verify tests fail**

Run: `npx vitest run test/core/reporter.spec.ts` (from `packages/aver/`)
Expected: FAIL — module not found

**Step 3: Commit**

```bash
git add packages/aver/test/core/reporter.spec.ts
git commit -m "test: add JUnit XML generator tests (red)"
```

---

## Task 4: Implement JUnit XML generator

**Files:**
- Create: `packages/aver/src/reporter/junit.ts`

**Step 1: Implement the pure XML generator**

```ts
export interface JUnitTestCase {
  name: string
  classname: string
  time: number
  failure?: {
    message: string
    body: string
  }
}

export interface JUnitTestSuite {
  name: string
  tests: number
  failures: number
  time: number
  testCases: JUnitTestCase[]
}

export interface JUnitReport {
  name: string
  testSuites: JUnitTestSuite[]
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function generateJUnitXml(report: JUnitReport): string {
  const totalTests = report.testSuites.reduce((sum, s) => sum + s.tests, 0)
  const totalFailures = report.testSuites.reduce((sum, s) => sum + s.failures, 0)
  const totalTime = report.testSuites.reduce((sum, s) => sum + s.time, 0)

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
  xml += `<testsuites name="${escapeXml(report.name)}" tests="${totalTests}" failures="${totalFailures}" time="${totalTime.toFixed(3)}">\n`

  for (const suite of report.testSuites) {
    xml += `  <testsuite name="${escapeXml(suite.name)}" tests="${suite.tests}" failures="${suite.failures}" time="${suite.time.toFixed(3)}">\n`
    for (const tc of suite.testCases) {
      if (tc.failure) {
        xml += `    <testcase name="${escapeXml(tc.name)}" classname="${escapeXml(tc.classname)}" time="${tc.time.toFixed(3)}">\n`
        xml += `      <failure message="${escapeXml(tc.failure.message)}">${escapeXml(tc.failure.body)}</failure>\n`
        xml += `    </testcase>\n`
      } else {
        xml += `    <testcase name="${escapeXml(tc.name)}" classname="${escapeXml(tc.classname)}" time="${tc.time.toFixed(3)}" />\n`
      }
    }
    xml += `  </testsuite>\n`
  }

  xml += `</testsuites>\n`
  return xml
}
```

**Step 2: Run tests**

Run: `npx vitest run test/core/reporter.spec.ts` (from `packages/aver/`)
Expected: ALL 4 tests PASS

**Step 3: Commit**

```bash
git add packages/aver/src/reporter/junit.ts
git commit -m "feat: implement JUnit XML generator"
```

---

## Task 5: Implement Vitest reporter wrapper

**Files:**
- Modify: `packages/aver/src/reporter/junit.ts`

**Step 1: Add the Vitest reporter class**

Add to the bottom of `packages/aver/src/reporter/junit.ts`:

```ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

interface AverReporterOptions {
  output?: string
}

export function averReporter(options: AverReporterOptions = {}) {
  const outputFile = options.output ?? 'test-results.xml'

  return {
    name: 'aver-junit',

    onFinished(files?: any[], errors?: unknown[]) {
      const testSuites: JUnitTestSuite[] = []

      for (const file of files ?? []) {
        const suite = fileToTestSuite(file)
        if (suite) testSuites.push(suite)
      }

      const xml = generateJUnitXml({ name: 'aver', testSuites })

      mkdirSync(dirname(outputFile), { recursive: true })
      writeFileSync(outputFile, xml)
    },
  }
}

function fileToTestSuite(file: any): JUnitTestSuite | null {
  const testCases: JUnitTestCase[] = []
  collectTests(file, testCases)

  if (testCases.length === 0) return null

  const failures = testCases.filter(tc => tc.failure).length

  return {
    name: file.name ?? file.filepath ?? 'unknown',
    tests: testCases.length,
    failures,
    time: testCases.reduce((sum, tc) => sum + tc.time, 0),
    testCases,
  }
}

function collectTests(task: any, results: JUnitTestCase[]): void {
  if (task.type === 'test' || task.type === 'custom') {
    const duration = task.result?.duration ?? 0
    const tc: JUnitTestCase = {
      name: task.name,
      classname: getClassname(task),
      time: duration / 1000,
    }

    if (task.result?.state === 'fail') {
      const error = task.result.errors?.[0]
      const message = error?.message ?? 'Test failed'
      const body = error?.stackStr ?? error?.stack ?? message
      tc.failure = { message, body }
    }

    results.push(tc)
  }

  if (task.tasks) {
    for (const child of task.tasks) {
      collectTests(child, results)
    }
  }
}

function getClassname(task: any): string {
  const parts: string[] = []
  let current = task.suite
  while (current && current.name) {
    parts.unshift(current.name)
    current = current.suite
  }
  return parts.join(' > ') || task.file?.name || 'unknown'
}
```

Note: The `onFinished` hook receives runner task objects (the old Vitest API). Vitest 3 still calls `onFinished` for backward compatibility. The action trace is already embedded in error messages by `enhanceWithTrace` in `suite.ts`, so it automatically appears in the `<failure>` body — no extra work needed.

Move the `import` statements for `fs` and `path` to the top of the file.

**Step 2: Build to verify it compiles**

Run: `npm run build -w packages/aver`
Expected: Build succeeds (but reporter won't be in the build output yet — that's Task 6)

**Step 3: Commit**

```bash
git add packages/aver/src/reporter/junit.ts
git commit -m "feat: implement averReporter Vitest wrapper"
```

---

## Task 6: Add `aver/reporter` subpath export

**Files:**
- Modify: `packages/aver/package.json`
- Modify: `packages/aver/tsup.config.ts`

**Step 1: Add reporter entry to tsup config**

In `packages/aver/tsup.config.ts`, add `reporter` to the entry object:

```ts
entry: {
  index: 'src/index.ts',
  cli: 'src/cli/index.ts',
  reporter: 'src/reporter/junit.ts',
},
```

**Step 2: Add subpath export to package.json**

In `packages/aver/package.json`, add to `exports`:

```json
"./reporter": {
  "import": {
    "types": "./dist/reporter.d.ts",
    "default": "./dist/reporter.js"
  },
  "require": {
    "types": "./dist/reporter.d.cts",
    "default": "./dist/reporter.cjs"
  }
}
```

**Step 3: Build and verify**

Run: `npm run build -w packages/aver`
Expected: Build succeeds, `dist/reporter.js` and `dist/reporter.d.ts` are generated

**Step 4: Run full test suite**

Run: `npm run build -w packages/aver && npm test --workspaces`
Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/aver/package.json packages/aver/tsup.config.ts
git commit -m "feat: add aver/reporter subpath export"
```

---

## Task 7: Integration test — use custom reporter in example app

**Files:**
- Modify: `examples/e-commerce/vitest.config.ts`

**Step 1: Update example app vitest config to use the custom reporter**

```ts
import { defineConfig } from 'vitest/config'
import { averReporter } from 'aver/reporter'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    globals: true,
    testTimeout: 15000,
    reporters: [
      'default',
      averReporter({ output: 'test-results/example-task-board.xml' }),
    ],
  },
})
```

**Step 2: Run example tests**

Run: `npm run build -w packages/aver && npm test -w examples/e-commerce`
Expected: Tests pass AND `examples/e-commerce/test-results/example-task-board.xml` is created

**Step 3: Verify XML content**

Run: `cat examples/e-commerce/test-results/example-task-board.xml`
Expected: Valid JUnit XML with 12 test cases across 3 adapters

**Step 4: Add test-results to .gitignore**

Append to root `.gitignore`:
```
test-results/
```

**Step 5: Commit**

```bash
git add examples/e-commerce/vitest.config.ts .gitignore
git commit -m "feat: use aver reporter in example app"
```

---

## Task 8: Update GHA workflow to use custom reporter

**Files:**
- Modify: `.github/workflows/ci.yml`

**Step 1: Update workflow to use aver reporter where applicable**

For the example app step, remove the `--reporter=junit --outputFile` flags since the vitest config now handles it. For core packages, keep using `--reporter=junit` since they don't import the aver reporter (that would be a circular dependency for the aver package itself).

Update the example app step:
```yaml
      - name: Test example app
        run: npx vitest run
        working-directory: examples/e-commerce
        continue-on-error: true
```

The XML will be written to `examples/e-commerce/test-results/example-task-board.xml` by the config. Update the test-reporter path to find all XML files:

```yaml
      - name: Test Report
        uses: dorny/test-reporter@v1
        if: always()
        with:
          name: Tests
          path: |
            test-results/*.xml
            examples/e-commerce/test-results/*.xml
          reporter: java-junit
```

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: use aver reporter for example app in GHA"
```

---

## Task 9: Push and verify GHA

**Step 1: Push to trigger CI**

```bash
git push
```

**Step 2: Watch the GHA run**

Open: `https://github.com/njackson/aver/actions`
Expected: Workflow runs, tests pass, Tests tab shows results

**Step 3: Fix any issues found in CI**

If the GHA run reveals issues (missing deps, path problems, etc.), fix and push again.
