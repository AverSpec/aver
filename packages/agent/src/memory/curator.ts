import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { ArtifactStore } from './artifacts.js'
import { EventLog } from './events.js'
import { CheckpointManager } from './checkpoints.js'
import { StoryArchiver } from './stories.js'
import type {
  SupervisorInput,
  WorkspaceSnapshot,
  WorkerResult,
  ArtifactContent,
} from '../types.js'

interface CuratorOptions {
  basePath: string
  rollupThreshold: number
}

interface BuildInputOptions {
  trigger: SupervisorInput['trigger']
  workspace: WorkspaceSnapshot
  userMessage?: string
  workerResults?: WorkerResult[]
}

export class ContextCurator {
  private readonly basePath: string
  private readonly artifactStore: ArtifactStore
  private readonly eventLog: EventLog
  private readonly checkpointManager: CheckpointManager
  private readonly storyArchiver: StoryArchiver

  constructor(options: CuratorOptions) {
    this.basePath = options.basePath
    this.artifactStore = new ArtifactStore(options.basePath)
    this.eventLog = new EventLog(options.basePath)
    this.checkpointManager = new CheckpointManager(this.artifactStore, {
      rollupThreshold: options.rollupThreshold,
    })
    this.storyArchiver = new StoryArchiver(this.artifactStore, {
      rollupThreshold: options.rollupThreshold,
    })
  }

  getArtifactStore(): ArtifactStore {
    return this.artifactStore
  }

  getEventLog(): EventLog {
    return this.eventLog
  }

  getCheckpointManager(): CheckpointManager {
    return this.checkpointManager
  }

  getStoryArchiver(): StoryArchiver {
    return this.storyArchiver
  }

  async buildSupervisorInput(options: BuildInputOptions): Promise<SupervisorInput> {
    const [projectContext, checkpointChain, storySummaries, artifactIndex, recentEvents] =
      await Promise.all([
        this.loadProjectContext(),
        this.checkpointManager.getCheckpointChain(),
        this.storyArchiver.getStorySummaries(),
        this.artifactStore.getIndex(),
        this.eventLog.readAll(),
      ])

    return {
      trigger: options.trigger,
      projectContext,
      workspace: options.workspace,
      checkpointChain,
      recentEvents,
      storySummaries,
      artifactIndex,
      userMessage: options.userMessage,
      workerResults: options.workerResults,
    }
  }

  async loadArtifacts(names: string[]): Promise<ArtifactContent[]> {
    const results: ArtifactContent[] = []
    for (const name of names) {
      const artifact = await this.artifactStore.read(name)
      if (artifact) results.push(artifact)
    }
    return results
  }

  private async loadProjectContext(): Promise<string> {
    const path = join(this.basePath, 'project-context.md')
    if (!existsSync(path)) return ''
    return readFile(path, 'utf-8')
  }
}
