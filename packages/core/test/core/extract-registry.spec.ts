import { describe, it, expect, beforeEach } from 'vitest'
import { isExtractionMode, registerTestResult, getExtractionRegistry, clearExtractionRegistry } from '../../src/core/extract-registry'
import { defineDomain, action, assertion } from '../../src/index'

const testDomain = defineDomain({
  name: 'test-domain',
  actions: {
    doSomething: action<{ value: string }>({
      telemetry: (p) => ({ span: 'test.do', attributes: { 'test.value': p.value } }),
    }),
  },
  queries: {},
  assertions: {
    somethingDone: assertion<{ value: string }>({
      telemetry: (p) => ({ span: 'test.done', attributes: { 'test.value': p.value } }),
    }),
  },
})

beforeEach(() => {
  clearExtractionRegistry()
})

describe('isExtractionMode', () => {
  it('returns false when env var is not set', () => {
    const prev = process.env.AVER_CONTRACT_EXTRACT
    delete process.env.AVER_CONTRACT_EXTRACT
    try {
      expect(isExtractionMode()).toBe(false)
    } finally {
      if (prev !== undefined) process.env.AVER_CONTRACT_EXTRACT = prev
    }
  })

  it('returns true when AVER_CONTRACT_EXTRACT=1', () => {
    const prev = process.env.AVER_CONTRACT_EXTRACT
    process.env.AVER_CONTRACT_EXTRACT = '1'
    try {
      expect(isExtractionMode()).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.AVER_CONTRACT_EXTRACT
      else process.env.AVER_CONTRACT_EXTRACT = prev
    }
  })
})

describe('registerTestResult', () => {
  it('registers a test result for a domain', () => {
    const trace = [{ kind: 'action' as const, name: 'doSomething', payload: { value: 'x' }, status: 'pass' as const }]
    registerTestResult(testDomain, 'test one', trace)

    const registry = getExtractionRegistry()
    expect(registry.has('test-domain')).toBe(true)
    expect(registry.get('test-domain')!.results).toHaveLength(1)
    expect(registry.get('test-domain')!.results[0].testName).toBe('test one')
  })

  it('accumulates results for the same domain', () => {
    registerTestResult(testDomain, 'test one', [])
    registerTestResult(testDomain, 'test two', [])

    const registry = getExtractionRegistry()
    expect(registry.get('test-domain')!.results).toHaveLength(2)
  })

  it('stores a copy of the trace (not a reference)', () => {
    const trace = [{ kind: 'action' as const, name: 'doSomething', payload: undefined, status: 'pass' as const }]
    registerTestResult(testDomain, 'test', trace)
    trace.push({ kind: 'action', name: 'extra', payload: undefined, status: 'pass' })

    const stored = getExtractionRegistry().get('test-domain')!.results[0].trace
    expect(stored).toHaveLength(1)
  })
})

describe('clearExtractionRegistry', () => {
  it('removes all entries', () => {
    registerTestResult(testDomain, 'test', [])
    clearExtractionRegistry()
    expect(getExtractionRegistry().size).toBe(0)
  })
})
