import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ArtifactStore } from '../../src/memory/artifacts.js'
import type { NewArtifact } from '../../src/types.js'

describe('ArtifactStore', () => {
  let dir: string
  let store: ArtifactStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aver-artifacts-'))
    store = new ArtifactStore(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes and reads an artifact', async () => {
    const artifact: NewArtifact = {
      type: 'investigation',
      name: 'auth-module',
      summary: 'Investigated auth module, found 3 seams',
      content: '# Auth Module Investigation\n\nFound 3 seams...',
    }
    await store.write(artifact)
    const content = await store.read('auth-module')
    expect(content).not.toBeUndefined()
    expect(content!.name).toBe('auth-module')
    expect(content!.content).toContain('Found 3 seams')
  })

  it('returns index with summaries', async () => {
    await store.write({ type: 'investigation', name: 'a', summary: 'summary-a', content: 'content-a' })
    await store.write({ type: 'seam-analysis', name: 'b', summary: 'summary-b', content: 'content-b' })
    const index = await store.getIndex()
    expect(index).toHaveLength(2)
    expect(index.map((e) => e.name).sort()).toEqual(['a', 'b'])
    expect((index[0] as any).content).toBeUndefined()
  })

  it('archives an artifact', async () => {
    await store.write({ type: 'investigation', name: 'old', summary: 'old stuff', content: '...' })
    await store.archive('old')
    const index = await store.getIndex()
    expect(index).toHaveLength(0)
    const archived = await store.readArchived('old')
    expect(archived).not.toBeUndefined()
  })

  it('returns undefined for non-existent artifact', async () => {
    const content = await store.read('nope')
    expect(content).toBeUndefined()
  })

  it('overwrites artifact with same name', async () => {
    await store.write({ type: 'investigation', name: 'x', summary: 'v1', content: 'version 1' })
    await store.write({ type: 'investigation', name: 'x', summary: 'v2', content: 'version 2' })
    const content = await store.read('x')
    expect(content!.summary).toBe('v2')
    const index = await store.getIndex()
    expect(index).toHaveLength(1)
  })
})
