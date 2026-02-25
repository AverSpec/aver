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

  it('includes skill content when provided', () => {
    const { system } = buildWorkerPrompt(
      { goal: 'Implement feature', artifacts: [] },
      'tdd-loop',
      '## TDD Loop\n\nMake the test pass.',
    )
    expect(system).toContain('TDD Loop')
    expect(system).toContain('Make the test pass.')
  })

  it('omits skill section when skillContent is undefined', () => {
    const { system } = buildWorkerPrompt(
      { goal: 'Implement feature', artifacts: [] },
      'tdd-loop',
    )
    expect(system).toContain('worker agent for Aver')
    expect(system).not.toContain('TDD')
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

  it('shows read-only tools when permissionLevel is read_only', () => {
    const { system } = buildWorkerPrompt(
      { goal: 'Investigate', artifacts: [], permissionLevel: 'read_only' },
      'investigation',
    )
    expect(system).toContain('READ-ONLY')
    expect(system).toContain('Read')
    expect(system).toContain('Glob')
    expect(system).toContain('Grep')
    expect(system).not.toContain('Edit')
    expect(system).not.toContain('Bash')
  })

  it('shows edit tools when permissionLevel is edit', () => {
    const { system } = buildWorkerPrompt(
      { goal: 'Implement', artifacts: [], permissionLevel: 'edit' },
      'tdd-loop',
    )
    expect(system).toContain('Edit')
    expect(system).toContain('Write')
    expect(system).toContain('Bash')
  })

  it('defaults to read_only when permissionLevel is omitted', () => {
    const { system } = buildWorkerPrompt(
      { goal: 'Investigate', artifacts: [] },
      'investigation',
    )
    expect(system).toContain('READ-ONLY')
  })

  it('includes project context when provided', () => {
    const { user } = buildWorkerPrompt(
      { goal: 'Implement', artifacts: [], projectContext: 'All APIs use REST' },
      'tdd-loop',
    )
    expect(user).toContain('All APIs use REST')
    expect(user).toContain('Project Context')
  })

  it('includes examples in scenario detail', () => {
    const { user } = buildWorkerPrompt(
      {
        goal: 'Implement',
        artifacts: [],
        scenarioDetail: {
          id: 'sc-1',
          stage: 'specified',
          behavior: 'user can cancel task',
          mode: 'intended',
          rules: ['must confirm first'],
          examples: [{ description: 'cancel pending task', expectedOutcome: 'task is cancelled' }],
          questions: [
            { id: 'q1', text: 'What about in-progress?', answer: 'Block cancellation' },
            { id: 'q2', text: 'Timeout behavior?' },
          ],
          constraints: [],
          seams: [],
          createdAt: '',
          updatedAt: '',
        },
      },
      'tdd-loop',
    )
    expect(user).toContain('cancel pending task')
    expect(user).toContain('task is cancelled')
    expect(user).toContain('**Mode:** intended')
    expect(user).toContain('**Open questions:** 1')
  })

  it('uses "complete" or "stuck" in output format (not pipe)', () => {
    const { system } = buildWorkerPrompt(
      { goal: 'test', artifacts: [] },
      'investigation',
    )
    expect(system).not.toContain('"complete | stuck"')
  })
})
