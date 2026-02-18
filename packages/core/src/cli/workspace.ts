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
  const summary = ops.getScenarioSummary()
  const workspace = store.load()
  const phase = detectPhase(workspace)
  const projectId = basename(process.cwd())

  console.log(`Workspace: ${projectId}`)
  console.log(`Phase: ${capitalize(phase.name)} (${phase.description})`)
  console.log()
  console.log(`  Captured: ${summary.captured}`)
  console.log(`  Characterized: ${summary.characterized}`)
  console.log(`  Mapped: ${summary.mapped}`)
  console.log(`  Specified: ${summary.specified}`)
  console.log(`  Implemented: ${summary.implemented}`)
  console.log(`  Total: ${summary.total}`)
  console.log(`  Open questions: ${summary.openQuestions}`)
  console.log()
  console.log('Recommended actions:')
  for (const action of phase.recommendedActions) {
    console.log(`  - ${action}`)
  }
}

async function captureCommand(store: WorkspaceStore, args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      context: { type: 'string' },
      story: { type: 'string' },
      mode: { type: 'string' },
    },
    strict: true,
    allowPositionals: true,
  })

  const behavior = positionals[0]
  if (!behavior) {
    console.error('Usage: aver workspace capture "<behavior>" [--context "<context>"] [--story "<story>"] [--mode observed|intended]')
    process.exit(1)
  }

  const mode = (values.mode === 'intended' ? 'intended' : 'observed') as 'observed' | 'intended'
  const ops = new WorkspaceOps(store)
  const scenario = ops.captureScenario({ behavior, context: values.context, story: values.story, mode })
  console.log(`Captured scenario: ${scenario.id}`)
  console.log(`  Behavior: ${scenario.behavior}`)
  console.log(`  Mode: ${scenario.mode}`)
  if (scenario.context) console.log(`  Context: ${scenario.context}`)
  if (scenario.story) console.log(`  Story: ${scenario.story}`)
}

async function advanceCommand(store: WorkspaceStore, args: string[]): Promise<void> {
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
    console.error('Usage: aver workspace advance <id> --rationale "<rationale>" --by "<perspective>"')
    process.exit(1)
  }

  const ops = new WorkspaceOps(store)
  const scenario = ops.advanceScenario(id, { rationale: values.rationale, promotedBy: values.by })
  console.log(`Advanced: ${scenario.id} -> ${scenario.stage}`)
  console.log(`  Behavior: ${scenario.behavior}`)
}

async function regressCommand(store: WorkspaceStore, args: string[]): Promise<void> {
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
    console.error('Usage: aver workspace regress <id> --to <stage> --rationale "<rationale>"')
    process.exit(1)
  }

  const ops = new WorkspaceOps(store)
  const scenario = ops.regressScenario(id, { targetStage: values.to as Stage, rationale: values.rationale })
  console.log(`Regressed: ${scenario.id} -> ${scenario.stage}`)
  console.log(`  Behavior: ${scenario.behavior}`)
}

async function scenariosCommand(store: WorkspaceStore, args: string[]): Promise<void> {
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
  const scenarios = ops.getScenarios({
    stage: values.stage as Stage | undefined,
    keyword: values.keyword,
  })

  if (scenarios.length === 0) {
    console.log('No scenarios found.')
    return
  }

  console.log(`${'ID'.padEnd(10)} ${'Stage'.padEnd(14)} Behavior`)
  console.log(`${''.padEnd(10, '-')} ${''.padEnd(14, '-')} ${''.padEnd(40, '-')}`)

  for (const scenario of scenarios) {
    const behavior = scenario.behavior.length > 60 ? scenario.behavior.slice(0, 57) + '...' : scenario.behavior
    console.log(`${scenario.id.padEnd(10)} ${scenario.stage.padEnd(14)} ${behavior}`)
  }

  console.log(`\n${scenarios.length} scenario(s)`)
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
  capture "<behavior>"                Capture a new scenario
  advance <id>                        Advance a scenario to the next stage
  regress <id>                        Regress a scenario to an earlier stage
  scenarios                           List scenarios
  export                              Export scenarios
  import <file>                       Import scenarios from JSON file

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
    case 'capture':
      await captureCommand(store, subArgs)
      break
    case 'advance':
      await advanceCommand(store, subArgs)
      break
    case 'regress':
      await regressCommand(store, subArgs)
      break
    case 'scenarios':
      await scenariosCommand(store, subArgs)
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
