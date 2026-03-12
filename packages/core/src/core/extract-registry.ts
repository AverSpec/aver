import type { Domain } from './domain'
import type { TraceEntry } from './trace'

interface TestResult {
  testName: string
  trace: TraceEntry[]
}

interface DomainResults {
  domain: Domain
  results: TestResult[]
}

const registry = new Map<string, DomainResults>()

export function isExtractionMode(): boolean {
  return typeof process !== 'undefined' && process.env.AVER_CONTRACT_EXTRACT === '1'
}

export function registerTestResult(domain: Domain, testName: string, trace: TraceEntry[]): void {
  const key = domain.name
  if (!registry.has(key)) {
    registry.set(key, { domain, results: [] })
  }
  registry.get(key)!.results.push({ testName, trace: [...trace] })
}

export function getExtractionRegistry(): Map<string, DomainResults> {
  return registry
}

export function clearExtractionRegistry(): void {
  registry.clear()
}
