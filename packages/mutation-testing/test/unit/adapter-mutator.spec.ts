import { describe, it, expect } from 'vitest'
import { defineDomain, action, query, assertion, implement } from '@aver/core'
import type { Protocol } from '@aver/core'
import type { AdapterOperator } from '../../src/engine-types'
import { generateAdapterMutants, runMutant } from '../../src/adapter-mutator'
import { removalOperator } from '../../src/operators/removal'

// --- Test fixtures ---

const testProtocol: Protocol<void> = {
  name: 'test',
  async setup() {},
  async teardown() {},
}

const testDomain = defineDomain({
  name: 'TestDomain',
  actions: {
    doSomething: action<{ value: string }>(),
  },
  queries: {
    getStatus: query<void, string>(),
  },
  assertions: {
    shouldBeValid: assertion<{ expected: string }>(),
  },
})

const testAdapter = implement(testDomain, {
  protocol: testProtocol,
  actions: {
    doSomething: async (_ctx, _payload) => {},
  },
  queries: {
    getStatus: async () => 'active',
  },
  assertions: {
    shouldBeValid: async (_ctx, _payload) => {},
  },
})

// --- Tests ---

describe('generateAdapterMutants', () => {
  it('generates one mutant per handler with removal operator', () => {
    const operator = removalOperator()
    const mutants = generateAdapterMutants(testAdapter, testDomain, [operator])

    // 1 action + 1 query + 1 assertion = 3 mutants
    expect(mutants).toHaveLength(3)
  })

  it('returns correct mutantId, operatorName, handlerKind, handlerName', () => {
    const operator = removalOperator()
    const mutants = generateAdapterMutants(testAdapter, testDomain, [operator])

    // Mutant IDs are sequential
    expect(mutants[0].mutantId).toBe('adapter-1')
    expect(mutants[1].mutantId).toBe('adapter-2')
    expect(mutants[2].mutantId).toBe('adapter-3')

    // All from the removal operator
    for (const m of mutants) {
      expect(m.operatorName).toBe('removal')
    }

    // One per handler kind
    const kinds = mutants.map(m => m.handlerKind)
    expect(kinds).toContain('action')
    expect(kinds).toContain('query')
    expect(kinds).toContain('assertion')

    // Handler names
    const names = mutants.map(m => m.handlerName)
    expect(names).toContain('doSomething')
    expect(names).toContain('getStatus')
    expect(names).toContain('shouldBeValid')
  })

  it('with targeted operator (queries only) only mutates query handlers', () => {
    const queriesOnlyOperator: AdapterOperator = {
      name: 'queries-only',
      targets: 'queries',
      mutate(_name: string, _handler: Function) {
        return async () => null
      },
    }

    const mutants = generateAdapterMutants(testAdapter, testDomain, [queriesOnlyOperator])

    expect(mutants).toHaveLength(1)
    expect(mutants[0].handlerKind).toBe('query')
    expect(mutants[0].handlerName).toBe('getStatus')
    expect(mutants[0].operatorName).toBe('queries-only')
  })

  it('skips handlers when operator returns null', () => {
    const selectiveOperator: AdapterOperator = {
      name: 'selective',
      targets: 'all',
      mutate(handlerName: string, _handler: Function) {
        // Only mutate getStatus, skip everything else
        if (handlerName === 'getStatus') {
          return async () => 'mutated'
        }
        return null
      },
    }

    const mutants = generateAdapterMutants(testAdapter, testDomain, [selectiveOperator])

    expect(mutants).toHaveLength(1)
    expect(mutants[0].handlerName).toBe('getStatus')
    expect(mutants[0].handlerKind).toBe('query')
  })

  it('each mutant has a valid adapter with the handler replaced', async () => {
    const operator = removalOperator()
    const mutants = generateAdapterMutants(testAdapter, testDomain, [operator])

    // The query mutant should return undefined instead of 'active'
    const queryMutant = mutants.find(m => m.handlerKind === 'query')!
    const result = await (queryMutant.adapter.handlers.queries as any).getStatus()
    expect(result).toBeUndefined()

    // Non-mutated handlers should still work
    // The action handler on the query mutant should still be the original
    expect(queryMutant.adapter.handlers.actions).toHaveProperty('doSomething')
    expect(queryMutant.adapter.handlers.assertions).toHaveProperty('shouldBeValid')
  })
})

describe('runMutant', () => {
  const operator = removalOperator()

  function makeMutant() {
    const mutants = generateAdapterMutants(testAdapter, testDomain, [operator])
    return mutants[0]
  }

  it('returns status killed with killedBy when tests fail', async () => {
    const mutant = makeMutant()

    const result = await runMutant(mutant, async () => ({
      passed: false,
      failedTests: ['should do something correctly', 'should validate input'],
    }))

    expect(result.status).toBe('killed')
    expect(result.killedBy).toEqual(['should do something correctly', 'should validate input'])
    expect(result.id).toBe(mutant.mutantId)
    expect(result.operatorName).toBe('removal')
    expect(result.handlerKind).toBe(mutant.handlerKind)
    expect(result.handlerName).toBe(mutant.handlerName)
  })

  it('returns status survived when tests pass', async () => {
    const mutant = makeMutant()

    const result = await runMutant(mutant, async () => ({
      passed: true,
      failedTests: [],
    }))

    expect(result.status).toBe('survived')
    expect(result.killedBy).toBeUndefined()
  })

  it('returns status runtime-error when test runner throws', async () => {
    const mutant = makeMutant()

    const result = await runMutant(mutant, async () => {
      throw new Error('Runner crashed')
    })

    expect(result.status).toBe('runtime-error')
    expect(result.killedBy).toBeUndefined()
  })
})
