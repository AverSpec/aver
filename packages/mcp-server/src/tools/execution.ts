import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
import type { RunStore, RunData, TestResult } from '../runs.js'

export interface RunSummary {
  runId: string
  total: number
  passed: number
  failed: number
  skipped: number
  failures: Array<{ testName: string; domain: string }>
  error?: string
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
    error: run.error,
    vocabularyCoverage: run.vocabularyCoverage,
  }
}

export async function runTestsHandler(
  store: RunStore,
  opts?: { domain?: string; adapter?: string },
): Promise<RunSummary> {
  const vitestArgs = ['aver', 'run', '--reporter=json']

  const env: Record<string, string> = { ...process.env as Record<string, string> }
  if (opts?.domain) env.AVER_DOMAIN = opts.domain
  if (opts?.adapter) env.AVER_ADAPTER = opts.adapter

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  let jsonOutput: string
  try {
    const { stdout } = await execFileAsync(npx, vitestArgs, {
      env,
      encoding: 'utf-8',
      timeout: 5 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
    })
    jsonOutput = stdout
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

export function parseVitestJson(jsonStr: string): RunData {
  const timestamp = new Date().toISOString()
  const results: TestResult[] = []

  try {
    const parsed = JSON.parse(jsonStr)
    const testResults = parsed.testResults ?? []
    for (const file of testResults) {
      const assertions = file.assertionResults ?? []

      // Capture file-level errors (e.g., import failures, syntax errors)
      // when no individual assertion results exist
      if (assertions.length === 0 && file.message) {
        results.push({
          testName: file.name ?? 'unknown file',
          domain: extractDomainFromPath(file.name ?? ''),
          status: 'fail',
          failureMessage: file.message,
          trace: [{
            kind: 'error',
            name: file.name ?? 'unknown file',
            status: 'fail',
            error: file.message,
          }],
        })
        continue
      }

      for (const test of assertions) {
        const failureMessages: string[] = test.failureMessages ?? []
        const testName = test.fullName ?? test.title ?? 'unknown'
        results.push({
          testName,
          domain: extractDomainFromPath(file.name ?? ''),
          status: test.status === 'passed' ? 'pass' : test.status === 'failed' ? 'fail' : 'skip',
          failureMessage: failureMessages.length > 0 ? failureMessages.join('\n') : undefined,
          trace: failureMessages.map((msg: string) => ({
            kind: 'error',
            name: testName,
            status: 'fail',
            error: msg,
          })),
        })
      }
    }
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err)
    const snippet = jsonStr.slice(0, 500)
    const error = `Failed to parse vitest JSON output: ${reason}. Raw output (first 500 chars): ${snippet}`
    return { timestamp, results, error }
  }

  return { timestamp, results }
}

function extractDomainFromPath(filePath: string): string {
  // 1. acceptance/<name> (aver's own test structure)
  const acceptanceMatch = filePath.match(/acceptance\/([^/]+)/)
  if (acceptanceMatch) return acceptanceMatch[1]

  // 2. domains/<name> (common test directory pattern)
  const domainsMatch = filePath.match(/domains\/([^/]+)/)
  if (domainsMatch) return domainsMatch[1]

  // 3. Spec filename without extensions (e.g., cart.spec.ts → cart)
  const fileMatch = filePath.match(/([^/]+?)\.(?:spec|test)\.[^/]+$/)
  if (fileMatch) return fileMatch[1]

  return 'unknown'
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
      error: r.failureMessage ?? r.trace.find((t) => t.error)?.error,
      trace: r.trace,
    })),
  }
}

export interface TestTrace {
  testName: string
  domain: string
  status: string
  failureMessage?: string
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
    failureMessage: result.failureMessage,
    trace: result.trace,
  }
}
