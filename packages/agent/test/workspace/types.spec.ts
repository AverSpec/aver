import { describe, it, expect } from 'vitest'
import { createScenario, createExample, type Scenario } from '../../src/workspace/types'

describe('Scenario', () => {
  it('creates a captured scenario with generated id', () => {
    const scenario = createScenario({
      stage: 'captured',
      behavior: 'POST /orders with empty cart returns 200 with error field'
    })

    expect(scenario.id).toMatch(/^[a-f0-9]{8}$/)
    expect(scenario.stage).toBe('captured')
    expect(scenario.behavior).toBe('POST /orders with empty cart returns 200 with error field')
    expect(scenario.createdAt).toBeTypeOf('string')
    expect(scenario.questions).toEqual([])
    expect(scenario.rules).toEqual([])
    expect(scenario.examples).toEqual([])
    expect(scenario.constraints).toEqual([])
    expect(scenario.seams).toEqual([])
  })

  it('creates a captured scenario with intended mode and story', () => {
    const scenario = createScenario({
      stage: 'captured',
      behavior: 'Users can cancel pending orders',
      story: 'Cancel Order',
      mode: 'intended'
    })

    expect(scenario.stage).toBe('captured')
    expect(scenario.story).toBe('Cancel Order')
    expect(scenario.mode).toBe('intended')
  })

  it('creates a captured scenario with observed mode', () => {
    const scenario = createScenario({
      stage: 'captured',
      behavior: 'API returns 200 for errors',
      mode: 'observed'
    })

    expect(scenario.stage).toBe('captured')
    expect(scenario.mode).toBe('observed')
  })

  it('creates unique ids across scenarios', () => {
    const a = createScenario({ stage: 'captured', behavior: 'a' })
    const b = createScenario({ stage: 'captured', behavior: 'b' })
    expect(a.id).not.toBe(b.id)
  })

  it('supports all five stages', () => {
    const stages = ['captured', 'characterized', 'mapped', 'specified', 'implemented'] as const
    for (const stage of stages) {
      const scenario = createScenario({ stage, behavior: `behavior at ${stage}` })
      expect(scenario.stage).toBe(stage)
    }
  })
})

describe('Example', () => {
  it('creates an example with description and expected outcome', () => {
    const ex = createExample({
      description: 'cancel pending order',
      expectedOutcome: 'order status becomes cancelled'
    })

    expect(ex.description).toBe('cancel pending order')
    expect(ex.expectedOutcome).toBe('order status becomes cancelled')
  })
})
