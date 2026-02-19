import { describe, it, expect } from 'vitest'
import { buildSupervisorPrompt } from '../../src/supervisor/prompt.js'
import type { SupervisorInput } from '../../src/types.js'

describe('buildSupervisorPrompt', () => {
  const baseInput: SupervisorInput = {
    trigger: 'startup',
    projectContext: '',
    workspace: { projectId: 'my-app', scenarios: [], createdAt: '', updatedAt: '' },
    checkpointChain: [],
    recentEvents: [],
    storySummaries: [],
    artifactIndex: [],
  }

  it('includes system role description', () => {
    const { system } = buildSupervisorPrompt(baseInput)
    expect(system).toContain('supervisor')
    expect(system).toContain('domain-driven development')
  })

  it('includes project context when present', () => {
    const input = { ...baseInput, projectContext: 'All APIs use REST' }
    const { system } = buildSupervisorPrompt(input)
    expect(system).toContain('All APIs use REST')
  })

  it('includes workspace snapshot', () => {
    const input = {
      ...baseInput,
      workspace: {
        ...baseInput.workspace,
        scenarios: [
          { id: 'sc-1', stage: 'captured' as const, behavior: 'user can login', rules: [], examples: [], questions: [], constraints: [], seams: [], createdAt: '', updatedAt: '' },
        ],
      },
    }
    const { user } = buildSupervisorPrompt(input)
    expect(user).toContain('user can login')
    expect(user).toContain('captured')
  })

  it('includes checkpoint chain', () => {
    const input = { ...baseInput, checkpointChain: ['Checkpoint: investigated auth'] }
    const { user } = buildSupervisorPrompt(input)
    expect(user).toContain('investigated auth')
  })

  it('includes artifact index', () => {
    const input = {
      ...baseInput,
      artifactIndex: [
        { name: 'inv-auth', type: 'investigation' as const, summary: 'auth module exploration', createdAt: '' },
      ],
    }
    const { user } = buildSupervisorPrompt(input)
    expect(user).toContain('inv-auth')
    expect(user).toContain('auth module exploration')
  })

  it('includes user message when present', () => {
    const input = { ...baseInput, trigger: 'user_message' as const, userMessage: 'focus on checkout next' }
    const { user } = buildSupervisorPrompt(input)
    expect(user).toContain('focus on checkout next')
  })

  it('formats worker results when present', () => {
    const input = {
      ...baseInput,
      trigger: 'workers_complete' as const,
      workerResults: [{ summary: 'Found 3 seams in auth', artifacts: [], status: 'complete' as const }],
    }
    const { user } = buildSupervisorPrompt(input)
    expect(user).toContain('Found 3 seams in auth')
  })

  it('returns expected JSON output format instruction', () => {
    const { system } = buildSupervisorPrompt(baseInput)
    expect(system).toContain('dispatch_worker')
    expect(system).toContain('ask_user')
    expect(system).toContain('checkpoint')
    expect(system).toContain('stop')
  })
})
