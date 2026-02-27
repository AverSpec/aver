import { describe, it, expect } from 'vitest'
import { createClient } from '@libsql/client'
import { WorkspaceStore } from '../../src/workspace/storage'

describe('schema versioning', () => {
  it('new workspaces get schemaVersion 1.0.0', async () => {
    const client = createClient({ url: ':memory:' })
    const store = new WorkspaceStore(client, 'test-project')
    const ws = await store.load()
    expect(ws.schemaVersion).toBe('1.0.0')
  })
})
