import { describe, it, expect } from 'vitest'
import { buildSupervisorPrompt, type SupervisorPromptInput, type ActiveWorkerInfo } from '../../src/supervisor/prompt.js'
import type { Scenario } from '../../src/workspace/types.js'
import type { Trigger } from '../../src/network/triggers.js'

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: overrides.id ?? 'sc-1',
    stage: overrides.stage ?? 'captured',
    behavior: overrides.behavior ?? 'test behavior',
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

function makeTrigger(overrides: Partial<Trigger> = {}): Trigger {
  return {
    type: overrides.type ?? 'session:start',
    timestamp: overrides.timestamp ?? '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('buildSupervisorPrompt', () => {
  const baseInput: SupervisorPromptInput = {
    projectContext: '',
    observations: '',
    scenarios: [],
    activeWorkers: [],
    triggers: [makeTrigger({ type: 'session:start', data: { goal: 'test goal' } })],
  }

  function makeInput(scenarios: Scenario[]): SupervisorPromptInput {
    return { ...baseInput, scenarios }
  }

  it('includes system role description', () => {
    const { system } = buildSupervisorPrompt(baseInput)
    expect(system).toContain('supervisor')
    expect(system).toContain('domain-driven acceptance testing')
  })

  it('includes project context when present', () => {
    const input = { ...baseInput, projectContext: 'All APIs use REST' }
    const { system } = buildSupervisorPrompt(input)
    expect(system).toContain('All APIs use REST')
  })

  it('includes workspace snapshot', () => {
    const input: SupervisorPromptInput = {
      ...baseInput,
      scenarios: [makeScenario({ id: 'sc-1', behavior: 'user can login' })],
    }
    const { user } = buildSupervisorPrompt(input)
    expect(user).toContain('user can login')
    expect(user).toContain('captured')
  })

  it('includes triggers section', () => {
    const input: SupervisorPromptInput = {
      ...baseInput,
      triggers: [makeTrigger({ type: 'worker:goal_complete', agentId: 'w-1', data: { summary: 'found seams' } })],
    }
    const { user } = buildSupervisorPrompt(input)
    expect(user).toContain('Triggers')
    expect(user).toContain('worker:goal_complete')
    expect(user).toContain('w-1')
  })

  it('includes observations section when present', () => {
    const input: SupervisorPromptInput = {
      ...baseInput,
      observations: 'Auth module has 3 seams identified',
    }
    const { user } = buildSupervisorPrompt(input)
    expect(user).toContain('Observations')
    expect(user).toContain('Auth module has 3 seams identified')
  })

  it('omits observations section when empty', () => {
    const { user } = buildSupervisorPrompt(baseInput)
    expect(user).not.toContain('## Observations')
  })

  it('includes human message when present', () => {
    const input: SupervisorPromptInput = {
      ...baseInput,
      humanMessage: 'focus on checkout next',
    }
    const { user } = buildSupervisorPrompt(input)
    expect(user).toContain('focus on checkout next')
  })

  it('includes active workers section', () => {
    const workers: ActiveWorkerInfo[] = [
      { id: 'w-1', goal: 'investigate auth', skill: 'investigation', status: 'active' },
      { id: 'w-2', goal: 'implement payments', skill: 'implementation', status: 'idle' },
    ]
    const input: SupervisorPromptInput = { ...baseInput, activeWorkers: workers }
    const { user } = buildSupervisorPrompt(input)
    expect(user).toContain('Active Workers')
    expect(user).toContain('w-1')
    expect(user).toContain('investigate auth')
    expect(user).toContain('w-2')
    expect(user).toContain('implement payments')
  })

  it('shows "No active workers" when none exist', () => {
    const { user } = buildSupervisorPrompt(baseInput)
    expect(user).toContain('No active workers')
  })

  it('returns expected JSON output format instruction with new action types', () => {
    const { system } = buildSupervisorPrompt(baseInput)
    expect(system).toContain('create_worker')
    expect(system).toContain('assign_goal')
    expect(system).toContain('terminate_worker')
    expect(system).toContain('advance_scenario')
    expect(system).toContain('ask_human')
    expect(system).toContain('update_scenario')
    expect(system).toContain('stop')
  })

  it('does not contain old v1 action types', () => {
    const { system } = buildSupervisorPrompt(baseInput)
    expect(system).not.toContain('dispatch_worker')
    expect(system).not.toContain('dispatch_workers')
    expect(system).not.toContain('checkpoint')
    expect(system).not.toContain('complete_story')
    expect(system).not.toContain('update_workspace')
  })

  it('describes trigger-driven wake model', () => {
    const { system } = buildSupervisorPrompt(baseInput)
    expect(system).toContain('woken by triggers')
  })

  it('includes mode in scenario line', () => {
    const scenarios = [
      makeScenario({ id: 'sc-1', mode: 'observed', behavior: 'existing login flow' }),
      makeScenario({ id: 'sc-2', mode: 'intended', behavior: 'new checkout flow' }),
    ]
    const { user } = buildSupervisorPrompt(makeInput(scenarios))
    expect(user).toContain('mode:observed')
    expect(user).toContain('mode:intended')
  })

  it('includes open question count in scenario line', () => {
    const scenarios = [
      makeScenario({
        questions: [
          { id: 'q1', text: 'What about edge case?' },
          { id: 'q2', text: 'Resolved one', answer: 'Yes' },
        ],
      }),
    ]
    const { user } = buildSupervisorPrompt(makeInput(scenarios))
    expect(user).toContain('questions: 1 open')
  })

  it('includes domain link indicator in scenario line', () => {
    const scenarios = [
      makeScenario({
        domainOperation: 'Cart.addItem',
        testNames: ['adds item to cart'],
      }),
    ]
    const { user } = buildSupervisorPrompt(makeInput(scenarios))
    expect(user).toContain('linked:yes')
  })

  it('shows progress summary in workspace section', () => {
    const scenarios = [
      makeScenario({ id: 'sc-1', stage: 'implemented' }),
      makeScenario({ id: 'sc-2', stage: 'implemented' }),
      makeScenario({ id: 'sc-3', stage: 'mapped' }),
      makeScenario({ id: 'sc-4', stage: 'captured' }),
    ]
    const { user } = buildSupervisorPrompt(makeInput(scenarios))
    expect(user).toContain('Progress: 2/4 implemented')
  })

  it('includes stage-aware workflow section', () => {
    const { system } = buildSupervisorPrompt(baseInput)
    expect(system).toContain('Stage-Aware Workflow')
    expect(system).toContain('captured scenarios')
    expect(system).toContain('characterized scenarios')
    expect(system).toContain('mapped scenarios')
    expect(system).toContain('specified scenarios')
    expect(system).toContain('implemented scenarios')
  })

  it('lists all 5 skills', () => {
    const { system } = buildSupervisorPrompt(baseInput)
    expect(system).toContain('investigation')
    expect(system).toContain('implementation')
    expect(system).toContain('characterization')
    expect(system).toContain('scenario-mapping')
    expect(system).toContain('specification')
  })

  it('includes hard block prerequisites in stage-aware workflow', () => {
    const { system } = buildSupervisorPrompt(baseInput)
    expect(system).toContain('confirmedBy')
    expect(system).toContain('open questions must be resolved')
    expect(system).toContain('domainOperation')
  })

  it('includes error recovery guidance', () => {
    const { system } = buildSupervisorPrompt(baseInput)
    expect(system).toContain('Error Recovery')
    expect(system).toContain('stuck')
  })

  it('formats open questions with spaces', () => {
    const scenarios = [
      makeScenario({
        questions: [
          { id: 'q1', text: 'What about edge case?' },
          { id: 'q2', text: 'Resolved', answer: 'Yes' },
        ],
      }),
    ]
    const { user } = buildSupervisorPrompt(makeInput(scenarios))
    expect(user).toContain('questions: 1 open')
    expect(user).not.toContain('questions:1open')
  })

  it('renders worker scenarioId when present', () => {
    const workers: ActiveWorkerInfo[] = [
      { id: 'w-1', goal: 'investigate auth', status: 'active', scenarioId: 'sc-42' },
    ]
    const input: SupervisorPromptInput = { ...baseInput, activeWorkers: workers }
    const { user } = buildSupervisorPrompt(input)
    expect(user).toContain('scenario:sc-42')
  })

  it('renders multiple triggers in the same section', () => {
    const input: SupervisorPromptInput = {
      ...baseInput,
      triggers: [
        makeTrigger({ type: 'worker:goal_complete', agentId: 'w-1' }),
        makeTrigger({ type: 'worker:stuck', agentId: 'w-2', data: { error: 'timeout' } }),
      ],
    }
    const { user } = buildSupervisorPrompt(input)
    expect(user).toContain('worker:goal_complete')
    expect(user).toContain('worker:stuck')
    expect(user).toContain('timeout')
  })
})
