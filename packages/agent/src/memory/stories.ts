import type { ArtifactStore } from './artifacts.js'

export class StoryArchiver {
  private readonly store: ArtifactStore

  constructor(store: ArtifactStore) {
    this.store = store
  }

  async archiveStory(
    scenarioId: string,
    summary: string,
    projectConstraints: string[],
  ): Promise<void> {
    const index = await this.store.getIndex()

    // Find all artifacts for this scenario
    const scenarioArtifacts = index.filter((a) => a.scenarioId === scenarioId)

    // Write story-complete artifact
    const constraintSection = projectConstraints.length
      ? `\n\n## Project Constraints\n${projectConstraints.map((c) => `- ${c}`).join('\n')}`
      : ''

    await this.store.write({
      type: 'story-complete',
      name: `story-complete-${scenarioId}`,
      summary,
      content: `${summary}${constraintSection}`,
      scenarioId,
    })

    // Archive individual artifacts for this scenario
    for (const artifact of scenarioArtifacts) {
      await this.store.archive(artifact.name)
    }
  }

  async getStorySummaries(): Promise<string[]> {
    const index = await this.store.getIndex()
    const stories = index.filter((a) => a.type === 'story-complete')
    const summaries: string[] = []
    for (const story of stories) {
      const artifact = await this.store.read(story.name)
      if (artifact) summaries.push(artifact.content)
    }
    return summaries
  }
}
