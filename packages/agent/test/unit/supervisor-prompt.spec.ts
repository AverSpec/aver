import { describe, it, expect } from 'vitest'
import { buildSupervisorPrompt } from '../../src/supervisor/prompt.js'
import type { SupervisorInput } from '../../src/types.js'
import type { Scenario } from '@aver/workspace'

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

  function makeInput(scenarios: Scenario[]): SupervisorInput {
    return {
      ...baseInput,
      workspace: { ...baseInput.workspace, scenarios },
    }
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

  it('lists all 5 skills in dispatch_worker format', () => {
    const { system } = buildSupervisorPrompt(baseInput)
    expect(system).toContain('investigation')
    expect(system).toContain('tdd-loop')
    expect(system).toContain('characterization')
    expect(system).toContain('scenario-mapping')
    expect(system).toContain('specification')
  })

  it('does not contain flat success criteria', () => {
    const { system } = buildSupervisorPrompt(baseInput)
    expect(system).not.toContain('The success criteria is always')
  })

  it('includes hard block prerequisites in stage-aware workflow', () => {
    const { system } = buildSupervisorPrompt(baseInput)
    // P0: must match verifyAdvancement() hard blocks
    expect(system).toContain('confirmedBy')
    expect(system).toContain('open questions must be resolved')
    expect(system).toContain('domainOperation')
  })

  it('clarifies update_workspace is only for stage transitions', () => {
    const { system } = buildSupervisorPrompt(baseInput)
    expect(system).toContain('ONLY for stage transitions')
  })

  it('includes error recovery guidance', () => {
    const { system } = buildSupervisorPrompt(baseInput)
    expect(system).toContain('Error Recovery')
    expect(system).toContain('stuck')
    expect(system).toContain('error_max_turns')
  })

  it('includes concrete dispatch_workers example', () => {
    const { system } = buildSupervisorPrompt(baseInput)
    // Should have a real example, not a placeholder comment
    expect(system).not.toContain('/* array of worker objects')
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
})
