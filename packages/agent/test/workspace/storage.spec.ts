import { describe, it, expect, beforeEach } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { WorkspaceStore } from '../../src/workspace/storage'
import { createScenario } from '../../src/workspace/types'

describe('WorkspaceStore', () => {
  let client: Client
  let store: WorkspaceStore

  beforeEach(() => {
    client = createClient({ url: ':memory:' })
    store = new WorkspaceStore(client, 'test-project')
  })

  it('creates workspace on first access', async () => {
    const ws = await store.load()
    expect(ws.projectId).toBe('test-project')
    expect(ws.scenarios).toEqual([])
  })

  it('persists scenarios across mutate/load cycles', async () => {
    const scenario = createScenario({ stage: 'captured', behavior: 'test behavior' })
    await store.mutate(ws => {
      ws.scenarios.push(scenario)
      return ws
    })

    const reloaded = await store.load()
    expect(reloaded.scenarios).toHaveLength(1)
    expect(reloaded.scenarios[0].behavior).toBe('test behavior')
  })

  it('serializes concurrent mutate calls', async () => {
    // Fire 10 concurrent mutations that each add a scenario
    const promises = Array.from({ length: 10 }, (_, i) =>
      store.mutate(ws => {
        ws.scenarios.push(createScenario({ stage: 'captured', behavior: `scenario-${i}` }))
        return ws
      })
    )
    await Promise.all(promises)

    const final = await store.load()
    expect(final.scenarios).toHaveLength(10)
  })
})
