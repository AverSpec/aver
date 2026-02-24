import { describe, it, expect } from 'vitest'
import { generateCandidates } from '../../src/candidates'
import type { SurvivedMutant } from '../../src/engine-types'

describe('generateCandidates', () => {
  it('generates one candidate per survived mutant', () => {
    const survivors: SurvivedMutant[] = [
      {
        id: '1',
        source: 'implementation',
        operatorName: 'BooleanLiteral',
        description: 'replaced true with false',
        location: { file: 'src/service.ts', startLine: 42, startColumn: 0, endLine: 42, endColumn: 4 },
      },
      {
        id: '2',
        source: 'adapter',
        operatorName: 'removal',
        description: 'query.getItems',
        handlerKind: 'query',
        handlerName: 'getItems',
      },
    ]

    const candidates = generateCandidates(survivors)

    expect(candidates).toHaveLength(2)
  })

  it('candidates have the correct shape', () => {
    const survivors: SurvivedMutant[] = [
      {
        id: 'mut-1',
        source: 'adapter',
        operatorName: 'removal',
        description: 'action.addItem',
        handlerKind: 'action',
        handlerName: 'addItem',
      },
    ]

    const candidates = generateCandidates(survivors)

    expect(candidates[0]).toEqual({
      source: 'mutation-testing',
      mutantId: 'mut-1',
      behavior: expect.any(String),
      context: expect.any(String),
      suggestedStage: 'captured',
    })
  })

  it('adapter survivor generates behavior with handler info', () => {
    const survivors: SurvivedMutant[] = [
      {
        id: 'a-1',
        source: 'adapter',
        operatorName: 'removal',
        description: 'query.getItems',
        handlerKind: 'query',
        handlerName: 'getItems',
      },
    ]

    const candidates = generateCandidates(survivors)

    expect(candidates[0].behavior).toContain('Adapter mutation survived')
    expect(candidates[0].behavior).toContain('removal')
    expect(candidates[0].behavior).toContain('query.getItems')
  })

  it('implementation survivor generates behavior with operator info', () => {
    const survivors: SurvivedMutant[] = [
      {
        id: 'i-1',
        source: 'implementation',
        operatorName: 'ArithmeticOperator',
        description: 'replaced + with -',
        location: { file: 'src/calc.ts', startLine: 10, startColumn: 5, endLine: 10, endColumn: 6 },
      },
    ]

    const candidates = generateCandidates(survivors)

    expect(candidates[0].behavior).toContain('Implementation mutation survived')
    expect(candidates[0].behavior).toContain('ArithmeticOperator')
    expect(candidates[0].behavior).toContain('replaced + with -')
  })

  it('context uses file location when available', () => {
    const survivors: SurvivedMutant[] = [
      {
        id: 'i-1',
        source: 'implementation',
        operatorName: 'BooleanLiteral',
        description: 'false',
        location: { file: 'src/service.ts', startLine: 42, startColumn: 0, endLine: 42, endColumn: 4 },
      },
    ]

    const candidates = generateCandidates(survivors)

    expect(candidates[0].context).toBe('src/service.ts:42')
  })

  it('context uses handler info when no location', () => {
    const survivors: SurvivedMutant[] = [
      {
        id: 'a-1',
        source: 'adapter',
        operatorName: 'removal',
        description: 'action.doWork',
        handlerKind: 'action',
        handlerName: 'doWork',
      },
    ]

    const candidates = generateCandidates(survivors)

    expect(candidates[0].context).toBe('action handler: doWork')
  })

  it('context falls back to unknown location when nothing available', () => {
    const survivors: SurvivedMutant[] = [
      {
        id: 'x-1',
        source: 'implementation',
        operatorName: 'SomeOperator',
        description: 'some mutation',
      },
    ]

    const candidates = generateCandidates(survivors)

    expect(candidates[0].context).toBe('unknown location')
  })

  it('returns empty array for empty survivors', () => {
    const candidates = generateCandidates([])
    expect(candidates).toEqual([])
  })
})
