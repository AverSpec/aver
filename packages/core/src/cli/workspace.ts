import { basename, resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { WorkspaceStore, WorkspaceOps, detectPhase, exportMarkdown, exportJson, importJson } from '@aver/workspace'
import type { Stage } from '@aver/workspace'

function resolveStore(args: string[]): { store: WorkspaceStore; remainingArgs: string[] } {
  // Extract --workspace-path from args before subcommand parsing
  const wpIdx = args.indexOf('--workspace-path')
  let workspacePath: string | undefined
  const remainingArgs = [...args]

  if (wpIdx !== -1 && wpIdx + 1 < args.length) {
    workspacePath = args[wpIdx + 1]
    remainingArgs.splice(wpIdx, 2)
  }

  const projectId = basename(process.cwd())

  if (workspacePath) {
    return { store: new WorkspaceStore(resolve(workspacePath), projectId), remainingArgs }
  }
  return { store: WorkspaceStore.withDefaults(projectId), remainingArgs }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

async function statusCommand(store: WorkspaceStore): Promise<void> {
  const ops = new WorkspaceOps(store)
  const summary = ops.getSummary()
  const workspace = store.load()
  const phase = detectPhase(workspace)
  const projectId = basename(process.cwd())

  console.log(`Workspace: ${projectId}`)
  console.log(`Phase: ${capitalize(phase.name)} (${phase.description})`)
  console.log()
  console.log(`  Observed: ${summary.observed}`)
  console.log(`  Explored: ${summary.explored}`)
  console.log(`  Intended: ${summary.intended}`)
  console.log(`  Formalized: ${summary.formalized}`)
  console.log(`  Total: ${summary.total}`)
  console.log(`  Open questions: ${summary.openQuestions}`)
  console.log()
  console.log('Recommended actions:')
  for (const action of phase.recommendedActions) {
    console.log(`  - ${action}`)
  }
}

async function recordObservationCommand(store: WorkspaceStore, args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      context: { type: 'string' },
    },
    strict: true,
    allowPositionals: true,
  })

  const behavior = positionals[0]
  if (!behavior) {
    console.error('Usage: aver workspace record-observation "<behavior>" [--context "<context>"]')
    process.exit(1)
  }

  const ops = new WorkspaceOps(store)
  const item = ops.recordObservation({ behavior, context: values.context })
  console.log(`Recorded observation: ${item.id}`)
  console.log(`  Behavior: ${item.behavior}`)
  if (item.context) console.log(`  Context: ${item.context}`)
}

async function recordIntentCommand(store: WorkspaceStore, args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      story: { type: 'string' },
    },
    strict: true,
    allowPositionals: true,
  })

  const behavior = positionals[0]
  if (!behavior) {
    console.error('Usage: aver workspace record-intent "<behavior>" [--story "<story>"]')
    process.exit(1)
  }

  const ops = new WorkspaceOps(store)
  const item = ops.recordIntent({ behavior, story: values.story })
  console.log(`Recorded intent: ${item.id}`)
  console.log(`  Behavior: ${item.behavior}`)
  if (item.story) console.log(`  Story: ${item.story}`)
}

async function promoteCommand(store: WorkspaceStore, args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      rationale: { type: 'string' },
      by: { type: 'string' },
    },
    strict: true,
    allowPositionals: true,
  })

  const id = positionals[0]
  if (!id || !values.rationale || !values.by) {
    console.error('Usage: aver workspace promote <id> --rationale "<rationale>" --by "<perspective>"')
    process.exit(1)
  }

  const ops = new WorkspaceOps(store)
  const item = ops.promoteItem(id, { rationale: values.rationale, promotedBy: values.by })
  console.log(`Promoted: ${item.id} -> ${item.stage}`)
  console.log(`  Behavior: ${item.behavior}`)
}

async function demoteCommand(store: WorkspaceStore, args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      to: { type: 'string' },
      rationale: { type: 'string' },
    },
    strict: true,
    allowPositionals: true,
  })

  const id = positionals[0]
  if (!id || !values.to || !values.rationale) {
    console.error('Usage: aver workspace demote <id> --to <stage> --rationale "<rationale>"')
    process.exit(1)
  }

  const ops = new WorkspaceOps(store)
  const item = ops.demoteItem(id, { targetStage: values.to as Stage, rationale: values.rationale })
  console.log(`Demoted: ${item.id} -> ${item.stage}`)
  console.log(`  Behavior: ${item.behavior}`)
}

async function itemsCommand(store: WorkspaceStore, args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      stage: { type: 'string' },
      keyword: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  })

  const ops = new WorkspaceOps(store)
  const items = ops.getItems({
    stage: values.stage as Stage | undefined,
    keyword: values.keyword,
  })

  if (items.length === 0) {
    console.log('No items found.')
    return
  }

  // Print table header
  console.log(`${'ID'.padEnd(10)} ${'Stage'.padEnd(12)} Behavior`)
  console.log(`${''.padEnd(10, '-')} ${''.padEnd(12, '-')} ${''.padEnd(40, '-')}`)

  for (const item of items) {
    const behavior = item.behavior.length > 60 ? item.behavior.slice(0, 57) + '...' : item.behavior
    console.log(`${item.id.padEnd(10)} ${item.stage.padEnd(12)} ${behavior}`)
  }

  console.log(`\n${items.length} item(s)`)
}

async function exportCommand(store: WorkspaceStore, args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      format: { type: 'string', default: 'md' },
      file: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  })

  const workspace = store.load()
  const format = values.format ?? 'md'
  const output = format === 'json' ? exportJson(workspace) : exportMarkdown(workspace)

  if (values.file) {
    writeFileSync(resolve(values.file), output)
    console.log(`Exported to ${values.file}`)
  } else {
    console.log(output)
  }
}

async function importCommand(store: WorkspaceStore, args: string[]): Promise<void> {
  const { positionals } = parseArgs({
    args,
    options: {},
    strict: true,
    allowPositionals: true,
  })

  const filePath = positionals[0]
  if (!filePath) {
    console.error('Usage: aver workspace import <file>')
    process.exit(1)
  }

  const json = readFileSync(resolve(filePath), 'utf-8')
  const result = importJson(store, json)
  console.log(`Import complete: ${result.added} added, ${result.skipped} skipped`)
}

function printWorkspaceHelp(): void {
  console.log(`
aver workspace - Manage scenario workspaces

Commands:
  status                              Show workspace status and phase
  record-observation "<behavior>"     Record a new observation
  record-intent "<behavior>"          Record a new intent
  promote <id>                        Promote an item to the next stage
  demote <id>                         Demote an item to an earlier stage
  items                               List workspace items
  export                              Export workspace
  import <file>                       Import workspace from JSON file

Global options:
  --workspace-path <path>             Override workspace storage directory

Run "aver workspace <command> --help" for command-specific options.
`)
}

export async function runWorkspace(rawArgs: string[]): Promise<void> {
  const { store, remainingArgs } = resolveStore(rawArgs)
  const [subcommand, ...subArgs] = remainingArgs

  switch (subcommand) {
    case 'status':
      await statusCommand(store)
      break
    case 'record-observation':
      await recordObservationCommand(store, subArgs)
      break
    case 'record-intent':
      await recordIntentCommand(store, subArgs)
      break
    case 'promote':
      await promoteCommand(store, subArgs)
      break
    case 'demote':
      await demoteCommand(store, subArgs)
      break
    case 'items':
      await itemsCommand(store, subArgs)
      break
    case 'export':
      await exportCommand(store, subArgs)
      break
    case 'import':
      await importCommand(store, subArgs)
      break
    case '--help':
    case '-h':
    case undefined:
      printWorkspaceHelp()
      break
    default:
      console.error(`Unknown workspace command: ${subcommand}`)
      printWorkspaceHelp()
      process.exit(1)
  }
}
