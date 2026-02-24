import { describe, it, expect } from 'vitest'
import { suite } from '@aver/core'
import { mutationTesting } from './domains/mutation-testing'
import { mutationTestingAdapter } from './adapters/mutation-testing.unit'

const s = suite(mutationTesting, mutationTestingAdapter)

describe('MutationTesting (dogfood acceptance)', () => {
  s.test('runs adapter mutations and produces a report', async ({ act, query, assert }) => {
    await act.runAdapterMutations({ adapterName: 'trivial' })
    const report = await query.report()
    expect(report.domain).toBe('Trivial')
    expect(report.schemaVersion).toBe('1.0.0')
    expect(report.adapters['trivial']).toBeDefined()
  })

  s.test('detects killed mutants (mutation score > 0)', async ({ act, query }) => {
    await act.runAdapterMutations({})
    const score = await query.mutationScore()
    // Our test runner detects at least some mutations
    expect(score).toBeGreaterThan(0)
  })

  s.test('reports survivor count', async ({ act, query }) => {
    await act.runAdapterMutations({})
    const count = await query.survivorCount()
    // Some mutations survive since our trivial test is weak
    expect(typeof count).toBe('number')
  })

  s.test('scoreAbove assertion works with low threshold', async ({ act, assert }) => {
    await act.runAdapterMutations({})
    // Score should be above 0 since we kill at least throw-error mutants
    await assert.scoreAbove({ threshold: 0 })
  })

  s.test('returns survivors list', async ({ act, query }) => {
    await act.runAdapterMutations({})
    const survivors = await query.survivors()
    expect(Array.isArray(survivors)).toBe(true)
    for (const s of survivors) {
      expect(s.id).toBeDefined()
      expect(s.source).toBe('adapter')
      expect(s.operatorName).toBeDefined()
    }
  })
})
