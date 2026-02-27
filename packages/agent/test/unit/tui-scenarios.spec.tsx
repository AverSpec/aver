import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { ScenarioPanel } from '../../src/tui/components/scenarios.js'
import type { Scenario } from '../../src/workspace/types.js'

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'sc-1', stage: 'captured', behavior: 'test behavior',
    rules: [], examples: [], questions: [], constraints: [], seams: [],
    transitions: [], createdAt: '', updatedAt: '', ...overrides,
  }
}

describe('ScenarioPanel', () => {
  it('shows empty message when no scenarios', () => {
    const { lastFrame } = render(<ScenarioPanel scenarios={[]} />)
    expect(lastFrame()).toContain('No scenarios yet')
  })

  it('shows scenario behavior and stage', () => {
    const scenarios = [makeScenario({ behavior: 'user can login', stage: 'characterized' })]
    const { lastFrame } = render(<ScenarioPanel scenarios={scenarios} />)
    expect(lastFrame()).toContain('user can login')
    expect(lastFrame()).toContain('characterized')
  })

  it('shows progress summary', () => {
    const scenarios = [
      makeScenario({ id: 'sc-1', stage: 'implemented' }),
      makeScenario({ id: 'sc-2', stage: 'captured' }),
    ]
    const { lastFrame } = render(<ScenarioPanel scenarios={scenarios} />)
    expect(lastFrame()).toContain('1/2')
  })

  it('shows open question count', () => {
    const scenarios = [makeScenario({
      questions: [{ id: 'q1', text: 'Edge case?' }, { id: 'q2', text: 'Done', answer: 'Yes' }],
    })]
    const { lastFrame } = render(<ScenarioPanel scenarios={scenarios} />)
    expect(lastFrame()).toContain('questions: 1')
  })

  it('shows mode when present', () => {
    const scenarios = [makeScenario({ mode: 'observed' })]
    const { lastFrame } = render(<ScenarioPanel scenarios={scenarios} />)
    expect(lastFrame()).toContain('observed')
  })
})
