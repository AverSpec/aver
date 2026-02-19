import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StoryArchiver } from '../../src/memory/stories.js'
import { ArtifactStore } from '../../src/memory/artifacts.js'

describe('StoryArchiver', () => {
  let dir: string
  let store: ArtifactStore
  let archiver: StoryArchiver

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aver-stories-'))
    store = new ArtifactStore(dir)
    archiver = new StoryArchiver(store, { rollupThreshold: 3 })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('archives a completed story', async () => {
    // Write some artifacts for the scenario
    await store.write({ type: 'investigation', name: 'inv-auth', summary: 'auth investigation', content: '...', scenarioId: 'sc-1' })
    await store.write({ type: 'seam-analysis', name: 'seam-auth', summary: 'auth seams', content: '...', scenarioId: 'sc-1' })

    await archiver.archiveStory('sc-1', 'Auth module implemented with JWT', ['All API calls go through gateway'])

    const index = await store.getIndex()
    // Story complete artifact should exist
    const storyArtifacts = index.filter((a) => a.type === 'story-complete')
    expect(storyArtifacts).toHaveLength(1)

    // Original artifacts should be archived (removed from index)
    const investigations = index.filter((a) => a.type === 'investigation')
    expect(investigations).toHaveLength(0)
  })

  it('getStorySummaries returns all story summaries', async () => {
    await archiver.archiveStory('sc-1', 'Auth done', [])
    await archiver.archiveStory('sc-2', 'Checkout done', [])
    const summaries = await archiver.getStorySummaries()
    expect(summaries).toHaveLength(2)
  })
})
