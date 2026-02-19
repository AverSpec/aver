import { describe, it, expect } from 'vitest'
import { buildWorkerPrompt } from '../../src/worker/prompt.js'
import type { WorkerInput } from '../../src/types.js'

describe('buildWorkerPrompt', () => {
  it('includes the goal', () => {
    const { system, user } = buildWorkerPrompt(
      { goal: 'Investigate auth module', artifacts: [] },
      'investigation',
    )
    expect(user).toContain('Investigate auth module')
  })

  it('includes skill instructions', () => {
    const { system } = buildWorkerPrompt(
      { goal: 'Implement feature', artifacts: [] },
      'tdd-loop',
    )
    expect(system).toContain('TDD')
  })

  it('includes artifact contents', () => {
    const { user } = buildWorkerPrompt(
      {
        goal: 'Implement auth',
        artifacts: [{ name: 'inv-auth', type: 'investigation', summary: 'auth inv', content: 'Found 3 seams', createdAt: '' }],
      },
      'tdd-loop',
    )
    expect(user).toContain('Found 3 seams')
  })

  it('includes scenario detail', () => {
    const { user } = buildWorkerPrompt(
      {
        goal: 'Implement',
        artifacts: [],
        scenarioDetail: {
          id: 'sc-1',
          stage: 'specified',
          behavior: 'user can cancel task',
          rules: ['must confirm first'],
          examples: [],
          questions: [],
          constraints: [],
          seams: ['TaskService.update'],
          createdAt: '',
          updatedAt: '',
        },
      },
      'tdd-loop',
    )
    expect(user).toContain('user can cancel task')
    expect(user).toContain('TaskService.update')
  })

  it('includes output format instructions', () => {
    const { system } = buildWorkerPrompt(
      { goal: 'test', artifacts: [] },
      'investigation',
    )
    expect(system).toContain('summary')
    expect(system).toContain('artifacts')
  })
})
