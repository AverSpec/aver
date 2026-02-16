import type { Workspace, Stage } from './types.js'
import type { WorkspaceStore } from './storage.js'

const STAGES: Stage[] = ['observed', 'explored', 'intended', 'formalized']

export function exportMarkdown(workspace: Workspace): string {
  const lines: string[] = ['# Workspace Summary', '']

  const total = workspace.items.length
  const byStage = Object.fromEntries(STAGES.map(s => [s, workspace.items.filter(i => i.stage === s)]))
  const openQuestions = workspace.items.flatMap(i => i.questions.filter(q => !q.answer))

  lines.push(`**Total items:** ${total}`)
  lines.push(`**Open questions:** ${openQuestions.length}`)
  lines.push('')

  for (const stage of STAGES) {
    const items = byStage[stage]
    if (items.length === 0) continue

    lines.push(`## ${stage.charAt(0).toUpperCase() + stage.slice(1)} (${items.length})`)
    lines.push('')

    for (const item of items) {
      lines.push(`### ${item.story ?? item.behavior}`)
      if (item.story) lines.push(`> ${item.behavior}`)
      if (item.context) lines.push(`*Context:* ${item.context}`)
      lines.push('')

      if (item.rules.length > 0) {
        lines.push('**Rules:**')
        for (const rule of item.rules) lines.push(`- ${rule}`)
        lines.push('')
      }

      if (item.examples.length > 0) {
        lines.push('**Examples:**')
        for (const ex of item.examples) {
          lines.push(`- ${ex.description} → ${ex.expectedOutcome}`)
        }
        lines.push('')
      }

      const itemQuestions = item.questions.filter(q => !q.answer)
      if (itemQuestions.length > 0) {
        lines.push('**Open questions:**')
        for (const q of itemQuestions) lines.push(`- ❓ ${q.text}`)
        lines.push('')
      }

      if (item.domainOperation) {
        lines.push(`**Domain:** \`${item.domainOperation}\``)
        lines.push('')
      }
    }
  }

  return lines.join('\n')
}

export function exportJson(workspace: Workspace): string {
  return JSON.stringify(workspace, null, 2)
}

export function importJson(
  store: WorkspaceStore,
  json: string
): { added: number; skipped: number } {
  const source: Workspace = JSON.parse(json)
  const target = store.load()
  const existingIds = new Set(target.items.map(i => i.id))

  let added = 0
  let skipped = 0

  for (const item of source.items) {
    if (existingIds.has(item.id)) {
      skipped++
    } else {
      target.items.push(item)
      added++
    }
  }

  store.save(target)
  return { added, skipped }
}
