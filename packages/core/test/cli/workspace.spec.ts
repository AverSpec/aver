import { describe, it, expect } from 'vitest'
import { formatSummary, formatScenarioTable } from '../../src/cli/workspace'

describe('formatSummary()', () => {
  it('includes project name and phase', () => {
    const summary = { captured: 2, characterized: 1, mapped: 0, specified: 0, implemented: 0, total: 3, openQuestions: 1 }
    const phase = { name: 'investigation', description: 'Investigate captured behaviors', recommendedActions: ['Explore code'] }
    const output = formatSummary(summary, phase, 'my-project')
    expect(output).toContain('my-project')
    expect(output).toContain('Investigation')
    expect(output).toContain('Captured: 2')
    expect(output).toContain('Total: 3')
    expect(output).toContain('Explore code')
  })
})

describe('formatScenarioTable()', () => {
  it('formats scenarios into a table', () => {
    const scenarios = [
      { id: 'abc12345', stage: 'captured' as const, behavior: 'user logs in' },
      { id: 'def67890', stage: 'implemented' as const, behavior: 'user logs out' },
    ]
    const output = formatScenarioTable(scenarios)
    expect(output).toContain('abc12345')
    expect(output).toContain('captured')
    expect(output).toContain('user logs in')
    expect(output).toContain('2 scenario(s)')
  })

  it('truncates long behaviors', () => {
    const scenarios = [
      { id: 'abc12345', stage: 'captured' as const, behavior: 'a'.repeat(80) },
    ]
    const output = formatScenarioTable(scenarios)
    expect(output).toContain('...')
  })

  it('returns empty message for no scenarios', () => {
    const output = formatScenarioTable([])
    expect(output).toContain('No scenarios found')
  })
})
