import { describe, it, expect } from 'vitest'
import { defineDomain, action, query, assertion, implement } from '@aver/core'
import type { Protocol } from '@aver/core'
import type { MutationRunner } from '../../src/engine-types'
import { runMutationEngine } from '../../src/engine'
import { removalOperator } from '../../src/operators/removal'

// --- Test fixtures ---

const testProtocol: Protocol<void> = {
  name: 'test',
  async setup() {},
  async teardown() {},
}

const testDomain = defineDomain({
  name: 'EngineDomain',
  actions: {
    createItem: action<{ name: string }>(),
  },
  queries: {
    getItem: query<void, string>(),
  },
  assertions: {
    itemExists: assertion<{ name: string }>(),
  },
})

const testAdapter = implement(testDomain, {
  protocol: testProtocol,
  actions: {
    createItem: async (_ctx, _payload) => {},
  },
  queries: {
    getItem: async () => 'item',
  },
  assertions: {
    itemExists: async (_ctx, _payload) => {},
  },
})

const mockRunner: MutationRunner = {
  name: 'mock',
  async run() {
    return [
      {
        id: '1',
        status: 'killed',
        mutatorName: 'BooleanLiteral',
        replacement: 'false',
        location: { file: 'a.ts', startLine: 1, startColumn: 0, endLine: 1, endColumn: 4 },
        killedBy: ['test1'],
      },
      {
        id: '2',
        status: 'survived',
        mutatorName: 'ArithmeticOperator',
        replacement: '-',
        location: { file: 'a.ts', startLine: 5, startColumn: 10, endLine: 5, endColumn: 11 },
      },
    ]
  },
}

// --- Tests ---

describe('runMutationEngine', () => {
  it('generates report with adapter results (no runner)', async () => {
    const result = await runMutationEngine({
      domain: testDomain,
      operators: [removalOperator()],
      adapters: [{ name: 'test-adapter', adapter: testAdapter }],
      testRunner: async () => ({ passed: false, failedTests: ['killed-test'] }),
    })

    expect(result.implementation).toBeUndefined()
    expect(result.adapters).toHaveProperty('test-adapter')

    const adapterResults = result.adapters['test-adapter']
    expect(adapterResults.length).toBe(3) // 1 action + 1 query + 1 assertion
    expect(adapterResults.every(r => r.status === 'killed')).toBe(true)
  })

  it('includes implementation scorecard when runner is provided', async () => {
    const result = await runMutationEngine({
      domain: testDomain,
      runner: mockRunner,
    })

    expect(result.implementation).toBeDefined()
    expect(result.implementation).toHaveLength(2)
    expect(result.implementation![0].status).toBe('killed')
    expect(result.implementation![1].status).toBe('survived')
  })

  it('report has correct schemaVersion, domain name, and timestamp', async () => {
    const before = new Date().toISOString()

    const result = await runMutationEngine({
      domain: testDomain,
      runner: mockRunner,
    })

    const after = new Date().toISOString()

    expect(result.report.schemaVersion).toBe('1.0.0')
    expect(result.report.domain).toBe('EngineDomain')
    expect(result.report.timestamp).toBeTypeOf('string')
    expect(result.report.timestamp >= before).toBe(true)
    expect(result.report.timestamp <= after).toBe(true)
  })

  it('report implementation scorecard has correct score calculation', async () => {
    const result = await runMutationEngine({
      domain: testDomain,
      runner: mockRunner,
    })

    const impl = result.report.implementation!
    expect(impl.total).toBe(2)
    expect(impl.killed).toBe(1)
    expect(impl.survived).toBe(1)
    expect(impl.score).toBe(0.5) // 1 killed / 2 total
    expect(impl.survivors).toHaveLength(1)
    expect(impl.survivors[0].operatorName).toBe('ArithmeticOperator')
  })

  it('report adapter scorecard reflects test results', async () => {
    const result = await runMutationEngine({
      domain: testDomain,
      operators: [removalOperator()],
      adapters: [{ name: 'my-adapter', adapter: testAdapter }],
      testRunner: async () => ({ passed: false, failedTests: ['some-test'] }),
    })

    const sc = result.report.adapters['my-adapter']
    expect(sc.total).toBe(3)
    expect(sc.killed).toBe(3)
    expect(sc.survived).toBe(0)
    expect(sc.score).toBe(1) // 3/3 killed
    expect(sc.survivors).toHaveLength(0)
  })

  it('report adapter scorecard tracks survivors when tests pass', async () => {
    const result = await runMutationEngine({
      domain: testDomain,
      operators: [removalOperator()],
      adapters: [{ name: 'weak-adapter', adapter: testAdapter }],
      testRunner: async () => ({ passed: true, failedTests: [] }),
    })

    const sc = result.report.adapters['weak-adapter']
    expect(sc.total).toBe(3)
    expect(sc.killed).toBe(0)
    expect(sc.survived).toBe(3)
    expect(sc.score).toBe(0)
    expect(sc.survivors).toHaveLength(3)
  })

  it('handles empty config (no runner, no adapters)', async () => {
    const result = await runMutationEngine({
      domain: testDomain,
    })

    expect(result.implementation).toBeUndefined()
    expect(result.adapters).toEqual({})
    expect(result.report.adapters).toEqual({})
  })
})
