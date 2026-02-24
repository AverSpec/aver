import { describe, it, expect } from 'vitest'
import { formatReport } from '../../src/report'
import type { MutationReport } from '../../src/engine-types'

describe('formatReport', () => {
  it('includes domain name and timestamp', () => {
    const report: MutationReport = {
      schemaVersion: '1.0.0',
      domain: 'MyDomain',
      timestamp: '2026-02-23T10:00:00.000Z',
      adapters: {},
    }

    const output = formatReport(report)

    expect(output).toContain('Mutation Testing Report: MyDomain')
    expect(output).toContain('Timestamp: 2026-02-23T10:00:00.000Z')
  })

  it('includes implementation scorecard with score percentage', () => {
    const report: MutationReport = {
      schemaVersion: '1.0.0',
      domain: 'MyDomain',
      timestamp: '2026-02-23T10:00:00.000Z',
      implementation: {
        total: 10,
        killed: 8,
        survived: 2,
        score: 0.8,
        survivors: [
          {
            id: '1',
            source: 'implementation',
            operatorName: 'BooleanLiteral',
            description: 'replaced true with false',
            location: { file: 'src/service.ts', startLine: 42, startColumn: 0, endLine: 42, endColumn: 4 },
          },
          {
            id: '2',
            source: 'implementation',
            operatorName: 'ArithmeticOperator',
            description: 'replaced + with -',
            location: { file: 'src/calc.ts', startLine: 10, startColumn: 5, endLine: 10, endColumn: 6 },
          },
        ],
      },
      adapters: {},
    }

    const output = formatReport(report)

    expect(output).toContain('## Implementation Mutations')
    expect(output).toContain('Score: 80.0%')
    expect(output).toContain('8/10 killed')
    expect(output).toContain('2 survived')
    expect(output).toContain('Survivors:')
    expect(output).toContain('[BooleanLiteral] replaced true with false')
    expect(output).toContain('at src/service.ts:42')
    expect(output).toContain('[ArithmeticOperator] replaced + with -')
  })

  it('includes adapter scorecard', () => {
    const report: MutationReport = {
      schemaVersion: '1.0.0',
      domain: 'CartDomain',
      timestamp: '2026-02-23T10:00:00.000Z',
      adapters: {
        'http-adapter': {
          total: 5,
          killed: 4,
          survived: 1,
          score: 0.8,
          survivors: [
            {
              id: 'a-1',
              source: 'adapter',
              operatorName: 'removal',
              description: 'query.getItems',
              handlerKind: 'query',
              handlerName: 'getItems',
            },
          ],
        },
      },
    }

    const output = formatReport(report)

    expect(output).toContain('## Adapter: http-adapter')
    expect(output).toContain('Score: 80.0%')
    expect(output).toContain('4/5 killed')
    expect(output).toContain('1 survived')
    expect(output).toContain('[removal] query.getItems')
    expect(output).toContain('(query.getItems)')
  })

  it('handles perfect score with no survivors', () => {
    const report: MutationReport = {
      schemaVersion: '1.0.0',
      domain: 'PerfectDomain',
      timestamp: '2026-02-23T10:00:00.000Z',
      implementation: {
        total: 5,
        killed: 5,
        survived: 0,
        score: 1.0,
        survivors: [],
      },
      adapters: {},
    }

    const output = formatReport(report)

    expect(output).toContain('Score: 100.0%')
    expect(output).toContain('5/5 killed')
    expect(output).toContain('0 survived')
    expect(output).not.toContain('Survivors:')
  })

  it('includes both implementation and adapter sections when present', () => {
    const report: MutationReport = {
      schemaVersion: '1.0.0',
      domain: 'FullDomain',
      timestamp: '2026-02-23T10:00:00.000Z',
      implementation: {
        total: 2,
        killed: 2,
        survived: 0,
        score: 1.0,
        survivors: [],
      },
      adapters: {
        'unit-adapter': {
          total: 3,
          killed: 3,
          survived: 0,
          score: 1.0,
          survivors: [],
        },
      },
    }

    const output = formatReport(report)

    expect(output).toContain('## Implementation Mutations')
    expect(output).toContain('## Adapter: unit-adapter')
  })
})
