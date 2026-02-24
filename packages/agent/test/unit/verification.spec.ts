import { describe, it, expect } from 'vitest'
import { verifyAdvancement } from '../../src/shell/verification.js'
import type { Scenario } from '@aver/workspace'

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'sc-1',
    stage: 'captured',
    behavior: 'test behavior',
    rules: [],
    examples: [],
    questions: [],
    constraints: [],
    seams: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  }
}

describe('verifyAdvancement', () => {
  // Hard block: mapped -> specified with open questions
  it('blocks mapped->specified when open questions exist', () => {
    const scenario = makeScenario({
      stage: 'mapped',
      questions: [{ id: 'q1', text: 'unanswered' }],
    })
    const result = verifyAdvancement(scenario, 'specified')
    expect(result.blocked).toBe(true)
    expect(result.reason).toContain('open questions')
  })

  it('allows mapped->specified when all questions resolved', () => {
    const scenario = makeScenario({
      stage: 'mapped',
      questions: [{ id: 'q1', text: 'answered', answer: 'yes', resolvedAt: '2026-01-01' }],
    })
    const result = verifyAdvancement(scenario, 'specified')
    expect(result.blocked).toBe(false)
  })

  it('allows mapped->specified when no questions exist', () => {
    const scenario = makeScenario({ stage: 'mapped' })
    const result = verifyAdvancement(scenario, 'specified')
    expect(result.blocked).toBe(false)
  })

  // Hard block: specified -> implemented without domain links
  it('blocks specified->implemented when no domain links', () => {
    const scenario = makeScenario({ stage: 'specified' })
    const result = verifyAdvancement(scenario, 'implemented')
    expect(result.blocked).toBe(true)
    expect(result.reason).toContain('domain links')
  })

  it('allows specified->implemented with domainOperation', () => {
    const scenario = makeScenario({ stage: 'specified', domainOperation: 'Cart.addItem' })
    const result = verifyAdvancement(scenario, 'implemented')
    expect(result.blocked).toBe(false)
  })

  it('allows specified->implemented with testNames', () => {
    const scenario = makeScenario({ stage: 'specified', testNames: ['adds item to cart'] })
    const result = verifyAdvancement(scenario, 'implemented')
    expect(result.blocked).toBe(false)
  })

  // Conditional warning: captured -> characterized without artifacts (observed mode)
  it('warns captured->characterized for observed mode with no evidence', () => {
    const scenario = makeScenario({ stage: 'captured', mode: 'observed' })
    const result = verifyAdvancement(scenario, 'characterized')
    expect(result.blocked).toBe(false)
    expect(result.warning).toContain('no investigation')
  })

  it('no warning for captured->characterized with seams', () => {
    const scenario = makeScenario({
      stage: 'captured',
      mode: 'observed',
      seams: ['function boundary at TaskService.create()'],
    })
    const result = verifyAdvancement(scenario, 'characterized')
    expect(result.blocked).toBe(false)
    expect(result.warning).toBeUndefined()
  })

  it('no warning for captured->characterized in intended mode', () => {
    const scenario = makeScenario({ stage: 'captured', mode: 'intended' })
    const result = verifyAdvancement(scenario, 'characterized')
    expect(result.blocked).toBe(false)
    expect(result.warning).toBeUndefined()
  })

  // Pass-through transitions
  it('allows characterized->mapped with no checks', () => {
    const scenario = makeScenario({ stage: 'characterized' })
    const result = verifyAdvancement(scenario, 'mapped')
    expect(result.blocked).toBe(false)
    expect(result.warning).toBeUndefined()
  })

  it('allows captured->mapped for intended mode', () => {
    const scenario = makeScenario({ stage: 'captured', mode: 'intended' })
    const result = verifyAdvancement(scenario, 'mapped')
    expect(result.blocked).toBe(false)
    expect(result.warning).toBeUndefined()
  })
})
