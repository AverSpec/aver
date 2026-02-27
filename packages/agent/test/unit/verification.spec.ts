import { describe, it, expect } from 'vitest'
import { verifyAdvancement } from '../../src/shell/verification.js'
import type { Scenario } from '../../src/workspace/types.js'

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
    transitions: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  }
}

describe('verifyAdvancement', () => {
  // Hard block: characterized -> mapped without confirmedBy
  it('blocks characterized->mapped when confirmedBy is not set', () => {
    const scenario = makeScenario({ stage: 'characterized' })
    const result = verifyAdvancement(scenario, 'characterized', 'mapped')
    expect(result.blocked).toBe(true)
    expect(result.hardBlocks[0]).toContain('confirmedBy')
  })

  it('allows characterized->mapped when confirmedBy is set', () => {
    const scenario = makeScenario({ stage: 'characterized', confirmedBy: 'business-user' })
    const result = verifyAdvancement(scenario, 'characterized', 'mapped')
    expect(result.blocked).toBe(false)
  })

  // Hard block: mapped -> specified with open questions
  it('blocks mapped->specified when open questions exist', () => {
    const scenario = makeScenario({
      stage: 'mapped',
      questions: [{ id: 'q1', text: 'unanswered' }],
    })
    const result = verifyAdvancement(scenario, 'mapped', 'specified')
    expect(result.blocked).toBe(true)
    expect(result.hardBlocks[0]).toContain('open question')
  })

  it('allows mapped->specified when all questions resolved', () => {
    const scenario = makeScenario({
      stage: 'mapped',
      questions: [{ id: 'q1', text: 'answered', answer: 'yes', resolvedAt: '2026-01-01' }],
    })
    const result = verifyAdvancement(scenario, 'mapped', 'specified')
    expect(result.blocked).toBe(false)
  })

  it('allows mapped->specified when no questions exist', () => {
    const scenario = makeScenario({ stage: 'mapped' })
    const result = verifyAdvancement(scenario, 'mapped', 'specified')
    expect(result.blocked).toBe(false)
  })

  // Hard block: specified -> implemented without domain links
  it('blocks specified->implemented when no domain links', () => {
    const scenario = makeScenario({ stage: 'specified' })
    const result = verifyAdvancement(scenario, 'specified', 'implemented')
    expect(result.blocked).toBe(true)
    expect(result.hardBlocks[0]).toContain('domain links')
  })

  it('allows specified->implemented with domainOperation', () => {
    const scenario = makeScenario({ stage: 'specified', domainOperation: 'Cart.addItem' })
    const result = verifyAdvancement(scenario, 'specified', 'implemented')
    expect(result.blocked).toBe(false)
  })

  it('allows specified->implemented with testNames', () => {
    const scenario = makeScenario({ stage: 'specified', testNames: ['adds item to cart'] })
    const result = verifyAdvancement(scenario, 'specified', 'implemented')
    expect(result.blocked).toBe(false)
  })

  // Conditional warning: captured -> characterized without artifacts (observed mode)
  it('warns captured->characterized for observed mode with no evidence', () => {
    const scenario = makeScenario({ stage: 'captured', mode: 'observed' })
    const result = verifyAdvancement(scenario, 'captured', 'characterized')
    expect(result.blocked).toBe(false)
    expect(result.warnings[0]).toContain('no investigation')
  })

  it('no warning for captured->characterized with seams', () => {
    const scenario = makeScenario({
      stage: 'captured',
      mode: 'observed',
      seams: ['function boundary at TaskService.create()'],
    })
    const result = verifyAdvancement(scenario, 'captured', 'characterized')
    expect(result.blocked).toBe(false)
    expect(result.warnings).toHaveLength(0)
  })

  it('no warning for captured->characterized in intended mode', () => {
    const scenario = makeScenario({ stage: 'captured', mode: 'intended' })
    const result = verifyAdvancement(scenario, 'captured', 'characterized')
    expect(result.blocked).toBe(false)
    expect(result.warnings).toHaveLength(0)
  })

  // Pass-through transitions
  it('allows characterized->mapped with confirmedBy and no checks otherwise', () => {
    const scenario = makeScenario({ stage: 'characterized', confirmedBy: 'user' })
    const result = verifyAdvancement(scenario, 'characterized', 'mapped')
    expect(result.blocked).toBe(false)
  })

  it('allows captured->characterized for intended mode', () => {
    const scenario = makeScenario({ stage: 'captured', mode: 'intended' })
    const result = verifyAdvancement(scenario, 'captured', 'characterized')
    expect(result.blocked).toBe(false)
    expect(result.warnings).toHaveLength(0)
  })
})
