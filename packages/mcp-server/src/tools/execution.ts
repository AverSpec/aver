import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { getDomains } from '@aver/core'

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
  const averArgs = ['run', '--reporter=json']
  if (opts?.domain) averArgs.push('--domain', opts.domain)
  if (opts?.adapter) averArgs.push('--adapter', opts.adapter)

  const aver = resolve(process.cwd(), 'node_modules', '.bin', 'aver')
  let jsonOutput: string
  try {
    const { stdout } = await execFileAsync(aver, averArgs, {
      env: process.env as Record<string, string>,
      encoding: 'utf-8',
      timeout: 5 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
    })
    jsonOutput = stdout
  } catch (err: any) {
    if (err.killed) {
      throw new Error('Test run timed out after 5 minutes')
    }
    // aver run exits non-zero on test failures but still outputs JSON
    jsonOutput = err.stdout ?? ''
  }

  const knownDomains = getDomains().map(d => d.name)
  const run = parseVitestJson(jsonOutput, knownDomains)
  store.save(run)
  return buildRunSummary(run)
}

export function parseVitestJson(jsonStr: string, knownDomains: string[] = []): RunData {
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
          domain: extractDomain(file.name ?? '', [], knownDomains),
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
        const ancestorTitles: string[] = test.ancestorTitles ?? []
        results.push({
          testName,
          domain: extractDomain(file.name ?? '', ancestorTitles, knownDomains),
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

export function extractDomain(
  filePath: string,
  ancestorTitles: string[],
  knownDomains: string[],
): string {
  // 1. Match ancestor titles (describe blocks) against known domains
  for (const title of ancestorTitles) {
    if (knownDomains.includes(title)) return title
  }

  // 2. Match file path segments against known domains (case-insensitive)
  if (knownDomains.length > 0) {
    const segments = filePath.split('/')
    for (const segment of segments) {
      const match = knownDomains.find(d => d.toLowerCase() === segment.toLowerCase())
      if (match) return match
    }
  }

  // 3. Fallback: path heuristics
  const acceptanceMatch = filePath.match(/acceptance\/([^/]+)/)
  if (acceptanceMatch) return acceptanceMatch[1]

  const domainsMatch = filePath.match(/domains\/([^/]+)/)
  if (domainsMatch) return domainsMatch[1]

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
