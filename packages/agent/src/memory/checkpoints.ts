import type { ArtifactStore } from './artifacts.js'

interface CheckpointOptions {
  rollupThreshold: number
}

export class CheckpointManager {
  private readonly store: ArtifactStore
  private readonly rollupThreshold: number

  constructor(store: ArtifactStore, options: CheckpointOptions) {
    this.store = store
    this.rollupThreshold = options.rollupThreshold
  }

  async createCheckpoint(summary: string): Promise<void> {
    const index = await this.store.getIndex()
    const checkpoints = index.filter((a) => a.type === 'checkpoint').sort((a, b) => a.name.localeCompare(b.name))
    const seq = checkpoints.length
    const name = `checkpoint-${String(seq).padStart(3, '0')}`

    await this.store.write({
      type: 'checkpoint',
      name,
      summary,
      content: summary,
    })

    // Check if rollup needed (threshold + 1 because we just wrote one)
    if (seq + 1 >= this.rollupThreshold) {
      await this.rollup()
    }
  }

  async getCheckpointChain(): Promise<string[]> {
    const index = await this.store.getIndex()
    const chain: string[] = []

    // Add latest rollup if exists
    const rollups = index.filter((a) => a.type === 'rollup').sort((a, b) => a.name.localeCompare(b.name))
    if (rollups.length > 0) {
      const latest = await this.store.read(rollups[rollups.length - 1].name)
      if (latest) chain.push(latest.content)
    }

    // Add latest checkpoint if exists
    const checkpoints = index.filter((a) => a.type === 'checkpoint').sort((a, b) => a.name.localeCompare(b.name))
    if (checkpoints.length > 0) {
      const latest = await this.store.read(checkpoints[checkpoints.length - 1].name)
      if (latest) chain.push(latest.content)
    }

    return chain
  }

  private async rollup(): Promise<void> {
    const index = await this.store.getIndex()
    const checkpoints = index.filter((a) => a.type === 'checkpoint').sort((a, b) => a.name.localeCompare(b.name))

    // Collect all checkpoint contents
    const contents: string[] = []
    for (const cp of checkpoints) {
      const artifact = await this.store.read(cp.name)
      if (artifact) contents.push(artifact.content)
    }

    // Find next rollup sequence
    const rollups = index.filter((a) => a.type === 'rollup')
    const rollupSeq = rollups.length
    const rollupName = `rollup-${String(rollupSeq).padStart(3, '0')}`

    // Write rollup (concatenated for now — supervisor will produce real summaries)
    await this.store.write({
      type: 'rollup',
      name: rollupName,
      summary: `Rollup of checkpoints ${checkpoints[0].name} through ${checkpoints[checkpoints.length - 1].name}`,
      content: contents.join('\n\n---\n\n'),
    })

    // Archive individual checkpoints
    for (const cp of checkpoints) {
      await this.store.archive(cp.name)
    }
  }
}
