import { execFileSync } from 'node:child_process'
import type { RunStore, RunData, TestResult } from '../runs.js'

export interface RunSummary {
  runId: string
  total: number
  passed: number
  failed: number
  skipped: number
  failures: Array<{ testName: string; domain: string }>
  vocabularyCoverage?: RunData['vocabularyCoverage']
}

export function buildRunSummary(run: RunData): RunSummary {
  const passed = run.results.filter((r) => r.status === 'pass').length
  const failed = run.results.filter((r) => r.status === 'fail').length
  const skipped = run.results.filter((r) => r.status === 'skip').length
  return {
    runId: run.timestamp,
    total: run.results.length,
    passed,
    failed,
    skipped,
    failures: run.results
      .filter((r) => r.status === 'fail')
      .map((r) => ({ testName: r.testName, domain: r.domain })),
    vocabularyCoverage: run.vocabularyCoverage,
  }
}

export function runTestsHandler(
  store: RunStore,
  opts?: { domain?: string; adapter?: string },
): RunSummary {
  const vitestArgs = ['vitest', 'run', '--reporter=json']

  const env: Record<string, string> = { ...process.env as Record<string, string> }
  if (opts?.domain) env.AVER_DOMAIN = opts.domain
  if (opts?.adapter) env.AVER_ADAPTER = opts.adapter

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  let jsonOutput: string
  try {
    jsonOutput = execFileSync(npx, vitestArgs, {
      env,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (err: any) {
    if (err.killed) {
      throw new Error('Test run timed out after 5 minutes')
    }
    // vitest exits non-zero on test failures but still outputs JSON
    jsonOutput = err.stdout ?? ''
  }

  const run = parseVitestJson(jsonOutput)
  store.save(run)
  return buildRunSummary(run)
}

function parseVitestJson(jsonStr: string): RunData {
  const timestamp = new Date().toISOString()
  const results: TestResult[] = []

  try {
    const parsed = JSON.parse(jsonStr)
    const testResults = parsed.testResults ?? []
    for (const file of testResults) {
      for (const test of file.assertionResults ?? []) {
        results.push({
          testName: test.fullName ?? test.title ?? 'unknown',
          domain: extractDomainFromPath(file.name ?? ''),
          status: test.status === 'passed' ? 'pass' : test.status === 'failed' ? 'fail' : 'skip',
          trace: [],
        })
      }
    }
  } catch {
    // If we can't parse JSON, return empty results
  }

  return { timestamp, results }
}

function extractDomainFromPath(filePath: string): string {
  const match = filePath.match(/acceptance\/([^/]+)/)
  return match?.[1] ?? 'unknown'
}

export interface FailureDetails {
  failures: Array<{
    testName: string
    domain: string
    error?: string
    trace: Array<{ kind: string; name: string; status: string; error?: string }>
  }>
}

export function getFailureDetailsHandler(
  store: RunStore,
  opts?: { domain?: string; testName?: string },
): FailureDetails {
  const run = store.getLatest()
  if (!run) return { failures: [] }

  let failures = run.results.filter((r) => r.status === 'fail')
  if (opts?.domain) failures = failures.filter((r) => r.domain === opts.domain)
  if (opts?.testName) failures = failures.filter((r) => r.testName === opts.testName)

  return {
    failures: failures.map((r) => ({
      testName: r.testName,
      domain: r.domain,
      error: r.trace.find((t) => t.error)?.error,
      trace: r.trace,
    })),
  }
}

export interface TestTrace {
  testName: string
  domain: string
  status: string
  trace: Array<{ kind: string; name: string; status: string; error?: string }>
}

export function getTestTraceHandler(
  store: RunStore,
  testName: string,
): TestTrace | null {
  const run = store.getLatest()
  if (!run) return null

  const result = run.results.find((r) => r.testName === testName)
  if (!result) return null

  return {
    testName: result.testName,
    domain: result.domain,
    status: result.status,
    trace: result.trace,
  }
}
