import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ContextCurator } from '../../src/memory/curator.js'

describe('ContextCurator', () => {
  let dir: string
  let curator: ContextCurator

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aver-curator-'))
    curator = new ContextCurator({
      basePath: dir,
      rollupThreshold: 3,
    })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('builds supervisor input for startup trigger', async () => {
    const input = await curator.buildSupervisorInput({
      trigger: 'startup',
      workspace: { projectId: 'test', scenarios: [], createdAt: '', updatedAt: '' },
    })
    expect(input.trigger).toBe('startup')
    expect(input.projectContext).toBe('')
    expect(input.checkpointChain).toEqual([])
    expect(input.recentEvents).toEqual([])
    expect(input.storySummaries).toEqual([])
    expect(input.artifactIndex).toEqual([])
  })

  it('includes project-context.md when present', async () => {
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'project-context.md'), 'All APIs use REST', 'utf-8')
    const input = await curator.buildSupervisorInput({
      trigger: 'startup',
      workspace: { projectId: 'test', scenarios: [], createdAt: '', updatedAt: '' },
    })
    expect(input.projectContext).toBe('All APIs use REST')
  })

  it('loads curated artifacts for worker', async () => {
    const artifacts = curator.getArtifactStore()
    await artifacts.write({ type: 'investigation', name: 'auth', summary: 'auth inv', content: 'auth content' })
    await artifacts.write({ type: 'investigation', name: 'checkout', summary: 'checkout inv', content: 'checkout content' })

    const loaded = await curator.loadArtifacts(['auth'])
    expect(loaded).toHaveLength(1)
    expect(loaded[0].name).toBe('auth')
    expect(loaded[0].content).toBe('auth content')
  })
})
