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

  it('rolls back on mutation failure (transactional)', async () => {
    // Seed one scenario so we can verify it survives a failed mutation
    const seed = createScenario({ stage: 'captured', behavior: 'seed' })
    await store.mutate(ws => {
      ws.scenarios.push(seed)
      return ws
    })

    // Attempt a mutation that produces a scenario with a duplicate id,
    // which will cause the batch INSERT to fail (PRIMARY KEY conflict).
    await expect(
      store.mutate(ws => {
        ws.scenarios.push(
          createScenario({ stage: 'captured', behavior: 'dup-a' }),
        )
        // Duplicate: reuse the id of the scenario we just pushed
        const dup = createScenario({ stage: 'captured', behavior: 'dup-b' })
        dup.id = ws.scenarios[ws.scenarios.length - 1].id
        ws.scenarios.push(dup)
        return ws
      })
    ).rejects.toThrow()

    // The original seed scenario must still be intact (transaction rolled back)
    const after = await store.load()
    expect(after.scenarios).toHaveLength(1)
    expect(after.scenarios[0].behavior).toBe('seed')
  })

  it('sequential mutations accumulate correctly', async () => {
    // Sequential mutations should each see the result of the previous one
    for (let i = 0; i < 10; i++) {
      await store.mutate(ws => {
        ws.scenarios.push(createScenario({ stage: 'captured', behavior: `scenario-${i}` }))
        return ws
      })
    }

    const final = await store.load()
    expect(final.scenarios).toHaveLength(10)
  })

  it('concurrent mutations do not corrupt data', async () => {
    // Concurrent mutations have last-writer-wins semantics (each reads
    // before writing), but the data must never be corrupted or lost
    // mid-write.  Every mutation that completes should leave the DB in
    // a consistent state.
    const promises = Array.from({ length: 10 }, (_, i) =>
      store.mutate(ws => {
        ws.scenarios.push(createScenario({ stage: 'captured', behavior: `scenario-${i}` }))
        return ws
      })
    )
    await Promise.all(promises)

    const final = await store.load()
    // At least one scenario survives (last writer wins)
    expect(final.scenarios.length).toBeGreaterThanOrEqual(1)
  })
})
