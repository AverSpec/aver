import type { Workspace, Stage } from './types.js'
import type { WorkspaceStore } from './storage.js'

const STAGES: Stage[] = ['captured', 'characterized', 'mapped', 'specified', 'implemented']

export function exportMarkdown(workspace: Workspace): string {
  const lines: string[] = ['# Scenario Summary', '']

  const total = workspace.scenarios.length
  const byStage = Object.fromEntries(STAGES.map(s => [s, workspace.scenarios.filter(sc => sc.stage === s)]))
  const openQuestions = workspace.scenarios.flatMap(s => s.questions.filter(q => !q.answer))

  lines.push(`**Total scenarios:** ${total}`)
  lines.push(`**Open questions:** ${openQuestions.length}`)
  lines.push('')

  for (const stage of STAGES) {
    const scenarios = byStage[stage]
    if (scenarios.length === 0) continue

    lines.push(`## ${stage.charAt(0).toUpperCase() + stage.slice(1)} (${scenarios.length})`)
    lines.push('')

    for (const scenario of scenarios) {
      lines.push(`### ${scenario.story ?? scenario.behavior}`)
      if (scenario.story) lines.push(`> ${scenario.behavior}`)
      if (scenario.context) lines.push(`*Context:* ${scenario.context}`)
      lines.push('')

      if (scenario.rules.length > 0) {
        lines.push('**Rules:**')
        for (const rule of scenario.rules) lines.push(`- ${rule}`)
        lines.push('')
      }

      if (scenario.examples.length > 0) {
        lines.push('**Examples:**')
        for (const ex of scenario.examples) {
          lines.push(`- ${ex.description} → ${ex.expectedOutcome}`)
        }
        lines.push('')
      }

      const scenarioQuestions = scenario.questions.filter(q => !q.answer)
      if (scenarioQuestions.length > 0) {
        lines.push('**Open questions:**')
        for (const q of scenarioQuestions) lines.push(`- [Q] ${q.text}`)
        lines.push('')
      }

      if (scenario.domainOperation) {
        lines.push(`**Domain:** \`${scenario.domainOperation}\``)
        lines.push('')
      }
    }
  }

  return lines.join('\n')
}

export function exportJson(workspace: Workspace): string {
  return JSON.stringify(workspace, null, 2)
}

export async function importJson(
  store: WorkspaceStore,
  json: string
): Promise<{ added: number; skipped: number }> {
  const source: Workspace = JSON.parse(json)
  let added = 0
  let skipped = 0

  await store.mutate(target => {
    const existingIds = new Set(target.scenarios.map(s => s.id))

    for (const scenario of source.scenarios) {
      if (existingIds.has(scenario.id)) {
        skipped++
      } else {
        target.scenarios.push(scenario)
        added++
      }
    }

    return target
  })

  return { added, skipped }
}
