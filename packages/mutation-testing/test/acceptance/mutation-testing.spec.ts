import { describe, it, expect } from 'vitest'
import { suite } from '@aver/core'
import { mutationTesting } from './domains/mutation-testing'
import { mutationTestingAdapter } from './adapters/mutation-testing.unit'

const s = suite(mutationTesting, mutationTestingAdapter)

describe('MutationTesting (dogfood acceptance)', () => {
  s.test('runs adapter mutations and produces a report', async ({ when, query, then }) => {
    await when.runAdapterMutations({ adapterName: 'trivial' })
    const report = await query.report()
    expect(report.domain).toBe('Trivial')
    expect(report.schemaVersion).toBe('1.0.0')
    expect(report.adapters['trivial']).toBeDefined()
    // TODO: consider adding domain assertion
  })

  s.test('detects killed mutants (mutation score > 0)', async ({ when, query }) => {
    await when.runAdapterMutations({})
    const score = await query.mutationScore()
    // Our test runner detects at least some mutations
    expect(score).toBeGreaterThan(0)
    // TODO: consider adding domain assertion
  })

  s.test('reports survivor count', async ({ when, query }) => {
    await when.runAdapterMutations({})
    const count = await query.survivorCount()
    // Some mutations survive since our trivial test is weak
    expect(typeof count).toBe('number')
    // TODO: consider adding domain assertion
  })

  s.test('scoreAbove assertion works with low threshold', async ({ when, then }) => {
    await when.runAdapterMutations({})
    // Score should be above 0 since we kill at least throw-error mutants
    await then.scoreAbove({ threshold: 0 })
  })

  s.test('returns survivors list', async ({ when, query }) => {
    await when.runAdapterMutations({})
    const survivors = await query.survivors()
    expect(Array.isArray(survivors)).toBe(true)
    for (const s of survivors) {
      expect(s.id).toBeDefined()
      expect(s.source).toBe('adapter')
      expect(s.operatorName).toBeDefined()
    }
    // TODO: consider adding domain assertion
  })
})
