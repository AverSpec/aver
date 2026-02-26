import { describe, it, expect, vi } from 'vitest'
import { dispatchSupervisor, buildPrompts, type SupervisorPromptInput } from '../../src/supervisor/dispatch.js'
import type { Trigger } from '../../src/network/triggers.js'

function makeTrigger(overrides: Partial<Trigger> = {}): Trigger {
  return {
    type: overrides.type ?? 'session:start',
    timestamp: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('buildPrompts', () => {
  const baseInput: SupervisorPromptInput = {
    projectContext: '',
    observations: '',
    scenarios: [],
    activeWorkers: [],
    triggers: [makeTrigger({ data: { goal: 'test' } })],
  }

  it('returns system and user prompt strings', () => {
    const { system, user } = buildPrompts(baseInput)
    expect(typeof system).toBe('string')
    expect(typeof user).toBe('string')
    expect(system).toContain('supervisor')
    expect(user).toContain('Triggers')
  })

  it('includes scenarios in user prompt', () => {
    const input: SupervisorPromptInput = {
      ...baseInput,
      scenarios: [{
        id: 'sc-1',
        stage: 'captured',
        behavior: 'user can login',
        rules: [],
        examples: [],
        questions: [],
        constraints: [],
        seams: [],
        createdAt: '',
        updatedAt: '',
      }],
    }
    const { user } = buildPrompts(input)
    expect(user).toContain('user can login')
  })

  it('includes observations in user prompt', () => {
    const input: SupervisorPromptInput = {
      ...baseInput,
      observations: 'Found 3 seams in auth module',
    }
    const { user } = buildPrompts(input)
    expect(user).toContain('Found 3 seams')
  })

  it('includes active workers in user prompt', () => {
    const input: SupervisorPromptInput = {
      ...baseInput,
      activeWorkers: [{ id: 'w-1', goal: 'investigate auth', status: 'active' }],
    }
    const { user } = buildPrompts(input)
    expect(user).toContain('w-1')
    expect(user).toContain('investigate auth')
  })
})

describe('dispatchSupervisor', () => {
  const baseInput: SupervisorPromptInput = {
    projectContext: '',
    observations: '',
    scenarios: [],
    activeWorkers: [],
    triggers: [makeTrigger({ data: { goal: 'test' } })],
  }

  it('calls dispatch with system and user prompts', async () => {
    const dispatch = vi.fn().mockResolvedValue({
      response: '{"action":"stop","reason":"no scenarios"}',
      tokenUsage: 150,
    })

    await dispatchSupervisor(baseInput, { dispatch })

    expect(dispatch).toHaveBeenCalledOnce()
    const [system, user] = dispatch.mock.calls[0]
    expect(system).toContain('supervisor')
    expect(user).toContain('Triggers')
  })

  it('parses stop decision from response', async () => {
    const dispatch = vi.fn().mockResolvedValue({
      response: '{"action":"stop","reason":"done"}',
      tokenUsage: 100,
    })

    const result = await dispatchSupervisor(baseInput, { dispatch })
    expect(result.decision.action).toBe('stop')
    expect(result.tokenUsage).toBe(100)
  })

  it('parses create_worker decision from response', async () => {
    const dispatch = vi.fn().mockResolvedValue({
      response: JSON.stringify({
        action: 'create_worker',
        goal: 'investigate auth module',
        skill: 'investigation',
        permission: 'read_only',
      }),
      tokenUsage: 200,
    })

    const result = await dispatchSupervisor(baseInput, { dispatch })
    expect(result.decision.action).toBe('create_worker')
  })

  it('returns token usage from dispatch', async () => {
    const dispatch = vi.fn().mockResolvedValue({
      response: '{"action":"stop","reason":"done"}',
      tokenUsage: 325,
    })

    const result = await dispatchSupervisor(baseInput, { dispatch })
    expect(result.tokenUsage).toBe(325)
  })

  it('throws when response is not valid decision JSON', async () => {
    const dispatch = vi.fn().mockResolvedValue({
      response: 'I am not sure what to do',
      tokenUsage: 100,
    })

    await expect(dispatchSupervisor(baseInput, { dispatch })).rejects.toThrow()
  })

  it('throws when dispatch rejects', async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error('LLM timeout'))

    await expect(dispatchSupervisor(baseInput, { dispatch })).rejects.toThrow('LLM timeout')
  })

  it('parses ask_human decision', async () => {
    const dispatch = vi.fn().mockResolvedValue({
      response: JSON.stringify({ action: 'ask_human', question: 'Which DB?' }),
      tokenUsage: 80,
    })

    const result = await dispatchSupervisor(baseInput, { dispatch })
    expect(result.decision.action).toBe('ask_human')
  })

  it('parses advance_scenario decision', async () => {
    const dispatch = vi.fn().mockResolvedValue({
      response: JSON.stringify({
        action: 'advance_scenario',
        scenarioId: 'sc-1',
        rationale: 'criteria met',
      }),
      tokenUsage: 90,
    })

    const result = await dispatchSupervisor(baseInput, { dispatch })
    expect(result.decision.action).toBe('advance_scenario')
  })
})
