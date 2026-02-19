import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CheckpointManager } from '../../src/memory/checkpoints.js'
import { ArtifactStore } from '../../src/memory/artifacts.js'

describe('CheckpointManager', () => {
  let dir: string
  let manager: CheckpointManager
  let artifactStore: ArtifactStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aver-checkpoint-'))
    artifactStore = new ArtifactStore(dir)
    manager = new CheckpointManager(artifactStore, { rollupThreshold: 3 })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('creates a checkpoint artifact', async () => {
    await manager.createCheckpoint('Progress: investigated auth module, found 3 seams')
    const index = await artifactStore.getIndex()
    const checkpoints = index.filter((a) => a.type === 'checkpoint')
    expect(checkpoints).toHaveLength(1)
    expect(checkpoints[0].name).toMatch(/^checkpoint-\d{3}$/)
  })

  it('increments checkpoint sequence', async () => {
    await manager.createCheckpoint('first checkpoint')
    await manager.createCheckpoint('second checkpoint')
    const index = await artifactStore.getIndex()
    const names = index.filter((a) => a.type === 'checkpoint').map((a) => a.name).sort()
    expect(names).toEqual(['checkpoint-000', 'checkpoint-001'])
  })

  it('triggers rollup when threshold is reached', async () => {
    await manager.createCheckpoint('cp 1')
    await manager.createCheckpoint('cp 2')
    await manager.createCheckpoint('cp 3')
    const index = await artifactStore.getIndex()
    const rollups = index.filter((a) => a.type === 'rollup')
    expect(rollups).toHaveLength(1)
    // Individual checkpoints should be archived
    const checkpoints = index.filter((a) => a.type === 'checkpoint')
    expect(checkpoints).toHaveLength(0)
  })

  it('getCheckpointChain returns latest checkpoint when no rollup', async () => {
    await manager.createCheckpoint('cp 1')
    await manager.createCheckpoint('cp 2')
    const chain = await manager.getCheckpointChain()
    expect(chain).toHaveLength(1)
    expect(chain[0]).toBe('cp 2')
  })

  it('getCheckpointChain returns rollup + checkpoint after rollup', async () => {
    await manager.createCheckpoint('cp 1')
    await manager.createCheckpoint('cp 2')
    await manager.createCheckpoint('cp 3') // triggers rollup
    await manager.createCheckpoint('cp 4') // new checkpoint after rollup
    const chain = await manager.getCheckpointChain()
    expect(chain).toHaveLength(2)
    expect(chain[0]).toContain('cp 1') // rollup contains earlier checkpoints
    expect(chain[1]).toBe('cp 4') // latest individual checkpoint
  })

  it('getCheckpointChain returns empty when no checkpoints', async () => {
    const chain = await manager.getCheckpointChain()
    expect(chain).toEqual([])
  })
})
