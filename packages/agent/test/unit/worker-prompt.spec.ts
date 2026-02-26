import { describe, it, expect } from 'vitest'
import { buildWorkerPrompts, type WorkerPromptInput } from '../../src/worker/prompt.js'

describe('buildWorkerPrompts', () => {
  const baseInput: WorkerPromptInput = {
    goal: 'Investigate auth module',
    observationBlock: '',
    permissionLevel: 'read_only',
    skill: 'investigation',
  }

  it('includes the goal in user prompt', () => {
    const { userPrompt } = buildWorkerPrompts(baseInput)
    expect(userPrompt).toContain('Investigate auth module')
  })

  it('includes skill content when provided', () => {
    const { systemPrompt } = buildWorkerPrompts(baseInput, '## TDD Loop\n\nMake the test pass.')
    expect(systemPrompt).toContain('TDD Loop')
    expect(systemPrompt).toContain('Make the test pass.')
  })

  it('omits skill section when skillContent is undefined', () => {
    const { systemPrompt } = buildWorkerPrompts(baseInput)
    expect(systemPrompt).toContain('focused execution agent')
    expect(systemPrompt).not.toContain('TDD')
  })

  it('includes observation block in user prompt', () => {
    const input: WorkerPromptInput = {
      ...baseInput,
      observationBlock: 'Found 3 seams in auth module',
    }
    const { userPrompt } = buildWorkerPrompts(input)
    expect(userPrompt).toContain('Found 3 seams')
    expect(userPrompt).toContain('## Observations')
  })

  it('omits observations section when block is empty', () => {
    const { userPrompt } = buildWorkerPrompts(baseInput)
    expect(userPrompt).not.toContain('## Observations')
  })

  it('includes scenario detail', () => {
    const input: WorkerPromptInput = {
      ...baseInput,
      scenarioDetail: {
        id: 'sc-1',
        name: 'user can cancel task',
        stage: 'specified',
      },
    }
    const { userPrompt } = buildWorkerPrompts(input)
    expect(userPrompt).toContain('user can cancel task')
    expect(userPrompt).toContain('sc-1')
    expect(userPrompt).toContain('specified')
  })

  it('includes scenario questions and notes', () => {
    const input: WorkerPromptInput = {
      ...baseInput,
      scenarioDetail: {
        id: 'sc-2',
        name: 'user logs in',
        stage: 'characterized',
        questions: ['What about SSO?', 'Timeout policy?'],
        notes: 'Auth service uses OAuth2',
      },
    }
    const { userPrompt } = buildWorkerPrompts(input)
    expect(userPrompt).toContain('What about SSO?')
    expect(userPrompt).toContain('Timeout policy?')
    expect(userPrompt).toContain('Auth service uses OAuth2')
  })

  it('includes STATUS signal instructions in system prompt', () => {
    const { systemPrompt } = buildWorkerPrompts(baseInput)
    expect(systemPrompt).toContain('STATUS: complete')
    expect(systemPrompt).toContain('STATUS: stuck')
    expect(systemPrompt).toContain('STATUS: continue')
  })

  it('does not include JSON output format', () => {
    const { systemPrompt } = buildWorkerPrompts(baseInput)
    expect(systemPrompt).not.toContain('```json')
    expect(systemPrompt).not.toContain('"summary"')
    expect(systemPrompt).not.toContain('"artifacts"')
  })

  it('describes observations as memory', () => {
    const { systemPrompt } = buildWorkerPrompts(baseInput)
    expect(systemPrompt).toContain('observations are your memory')
  })

  it('shows read-only tools when permissionLevel is read_only', () => {
    const { systemPrompt } = buildWorkerPrompts(baseInput)
    expect(systemPrompt).toContain('READ-ONLY')
    expect(systemPrompt).toContain('Read')
    expect(systemPrompt).toContain('Glob')
    expect(systemPrompt).toContain('Grep')
    expect(systemPrompt).not.toContain('Available tools: Read, Edit')
    expect(systemPrompt).not.toContain('Bash')
  })

  it('shows edit tools when permissionLevel is edit', () => {
    const input: WorkerPromptInput = { ...baseInput, permissionLevel: 'edit', skill: 'implementation' }
    const { systemPrompt } = buildWorkerPrompts(input)
    expect(systemPrompt).toContain('Edit')
    expect(systemPrompt).toContain('Write')
    expect(systemPrompt).toContain('Bash')
  })

  it('shows full tools when permissionLevel is full', () => {
    const input: WorkerPromptInput = { ...baseInput, permissionLevel: 'full' }
    const { systemPrompt } = buildWorkerPrompts(input)
    expect(systemPrompt).toContain('full access')
    expect(systemPrompt).toContain('Task')
  })

  it('defaults to read_only when permissionLevel is unknown', () => {
    const input: WorkerPromptInput = { ...baseInput, permissionLevel: 'unknown' }
    const { systemPrompt } = buildWorkerPrompts(input)
    expect(systemPrompt).toContain('READ-ONLY')
  })

  it('includes permission level in user prompt', () => {
    const { userPrompt } = buildWorkerPrompts(baseInput)
    expect(userPrompt).toContain('## Permission Level')
    expect(userPrompt).toContain('read_only')
  })

  it('includes skill name in system prompt', () => {
    const { systemPrompt } = buildWorkerPrompts(baseInput)
    expect(systemPrompt).toContain('investigation')
  })

  it('mentions plain text output (no JSON needed)', () => {
    const { systemPrompt } = buildWorkerPrompts(baseInput)
    expect(systemPrompt).toContain('plain text')
    expect(systemPrompt).toContain('No JSON')
  })
})
