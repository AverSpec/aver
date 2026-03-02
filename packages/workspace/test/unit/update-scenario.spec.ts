import { describe, test, expect } from 'vitest'
import { createClient } from '@libsql/client'
import { WorkspaceStore, WorkspaceOps } from '../../src/index.js'

describe('updateScenario', () => {
  test('refreshes updatedAt timestamp on any field update', async () => {
    const client = createClient({ url: ':memory:' })
    const store = new WorkspaceStore(client, 'test')
    const ops = new WorkspaceOps(store)

    const scenario = await ops.captureScenario({ behavior: 'original' })
    const createdAt = scenario.updatedAt

    // Small delay to ensure timestamp differs
    await new Promise(r => setTimeout(r, 10))

    const updated = await ops.updateScenario(scenario.id, { context: 'new context' })
    expect(updated.updatedAt).not.toBe(createdAt)
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(createdAt).getTime())
  })
})
