import { describe, it, expect, beforeEach } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { WorkspaceOps } from '../src/operations'
import { WorkspaceStore } from '../src/storage'
import { detectPhase } from '../src/phase'
import type { Stage } from '../src/types'

describe('detectPhase', () => {
  let client: Client
  let ops: WorkspaceOps
  let store: WorkspaceStore

  beforeEach(() => {
    client = createClient({ url: ':memory:' })
    store = new WorkspaceStore(client, 'test-project')
    ops = new WorkspaceOps(store)
  })

  /** Helper: advance a scenario through stages with required prerequisites */
  async function advanceToStage(id: string, targetStage: Stage) {
    const stages: Stage[] = ['captured', 'characterized', 'mapped', 'specified', 'implemented']
    const scenario = await ops.getScenario(id)
    if (!scenario) throw new Error('Scenario not found')
    const currentIdx = stages.indexOf(scenario.stage)
    const targetIdx = stages.indexOf(targetStage)

    for (let i = currentIdx; i < targetIdx; i++) {
      const from = stages[i]
      const to = stages[i + 1]
      if (from === 'characterized' && to === 'mapped') {
        await ops.confirmScenario(id, 'business')
      }
      if (from === 'specified' && to === 'implemented') {
        await ops.linkToDomain(id, { domainOperation: 'test.op' })
      }
      await ops.advanceScenario(id, { rationale: `advance to ${to}`, promotedBy: 'dev' })
    }
  }

  it('returns kickoff when workspace is empty', async () => {
    const phase = detectPhase(await store.load())
    expect(phase.name).toBe('kickoff')
    expect(phase.description).toContain('new workflow')
  })

  it('returns investigation when scenarios are captured', async () => {
    await ops.captureScenario({ behavior: 'a' })
    await ops.captureScenario({ behavior: 'b' })
    await ops.captureScenario({ behavior: 'c' })

    const phase = detectPhase(await store.load())
    expect(phase.name).toBe('investigation')
  })

  it('returns mapping when scenarios are characterized', async () => {
    const scenario = await ops.captureScenario({ behavior: 'a' })
    await ops.advanceScenario(scenario.id, { rationale: 'characterized', promotedBy: 'dev' })

    const phase = detectPhase(await store.load())
    expect(phase.name).toBe('mapping')
  })

  it('returns specification when scenarios are mapped', async () => {
    const scenario = await ops.captureScenario({ behavior: 'a' })
    await advanceToStage(scenario.id, 'mapped')

    const phase = detectPhase(await store.load())
    expect(phase.name).toBe('specification')
  })

  it('returns implementation when specified scenarios exist without domain links', async () => {
    const scenario = await ops.captureScenario({ behavior: 'a' })
    await advanceToStage(scenario.id, 'specified')

    const phase = detectPhase(await store.load())
    expect(phase.name).toBe('implementation')
  })

  it('returns implementation when implemented scenarios exist without domain links', async () => {
    const scenario = await ops.captureScenario({ behavior: 'a' })
    await advanceToStage(scenario.id, 'implemented')
    // advanceToStage sets domainOperation to pass hard block; remove it to test this phase
    await store.mutate(ws => {
      const s = ws.scenarios.find(s => s.id === scenario.id)
      if (s) delete s.domainOperation
      return ws
    })

    const phase = detectPhase(await store.load())
    expect(phase.name).toBe('implementation')
  })

  it('returns verification when all implemented scenarios have domain links', async () => {
    const scenario = await ops.captureScenario({ behavior: 'a' })
    await advanceToStage(scenario.id, 'implemented')
    // advanceToStage already sets domainOperation for specified->implemented
    // But let's also add testNames for completeness
    await ops.linkToDomain(scenario.id, { domainOperation: 'action.doA', testNames: ['test a'] })

    const phase = detectPhase(await store.load())
    expect(phase.name).toBe('verification')
  })

  it('includes recommended actions', async () => {
    await ops.captureScenario({ behavior: 'a' })
    const phase = detectPhase(await store.load())
    expect(phase.recommendedActions.length).toBeGreaterThan(0)
  })

  it('uses scenario terminology in recommended actions', async () => {
    await ops.captureScenario({ behavior: 'a' })
    const phase = detectPhase(await store.load())
    // Should not contain "item" in recommended actions
    for (const action of phase.recommendedActions) {
      expect(action.toLowerCase()).not.toContain('item')
    }
  })

  it('returns discovery when implemented and captured scenarios coexist', async () => {
    const scenario = await ops.captureScenario({ behavior: 'fully done' })
    await advanceToStage(scenario.id, 'implemented')
    await ops.linkToDomain(scenario.id, { domainOperation: 'Test.action' })

    await ops.captureScenario({ behavior: 'new discovery' })

    const phase = detectPhase(await store.load())
    expect(phase.name).toBe('discovery')
    expect(phase.description).toContain('new captured')
    expect(phase.description).toContain('implemented')
  })
})
