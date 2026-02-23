import { basename, resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

interface ScenarioSummary {
  captured: number
  characterized: number
  mapped: number
  specified: number
  implemented: number
  total: number
  openQuestions: number
}

interface Phase {
  name: string
  description: string
  recommendedActions: string[]
}

interface ScenarioRow {
  id: string
  stage: string
  behavior: string
}

export function formatSummary(summary: ScenarioSummary, phase: Phase, projectId: string): string {
  const lines = [
    `Workspace: ${projectId}`,
    `Phase: ${capitalize(phase.name)} (${phase.description})`,
    '',
    `  Captured: ${summary.captured}`,
    `  Characterized: ${summary.characterized}`,
    `  Mapped: ${summary.mapped}`,
    `  Specified: ${summary.specified}`,
    `  Implemented: ${summary.implemented}`,
    `  Total: ${summary.total}`,
    `  Open questions: ${summary.openQuestions}`,
    '',
    'Recommended actions:',
    ...phase.recommendedActions.map(a => `  - ${a}`),
  ]
  return lines.join('\n')
}

export function formatScenarioTable(scenarios: ScenarioRow[]): string {
  if (scenarios.length === 0) return 'No scenarios found.'

  const lines = [
    `${'ID'.padEnd(10)} ${'Stage'.padEnd(14)} Behavior`,
    `${''.padEnd(10, '-')} ${''.padEnd(14, '-')} ${''.padEnd(40, '-')}`,
  ]
  for (const scenario of scenarios) {
    const behavior = scenario.behavior.length > 60 ? scenario.behavior.slice(0, 57) + '...' : scenario.behavior
    lines.push(`${scenario.id.padEnd(10)} ${scenario.stage.padEnd(14)} ${behavior}`)
  }
  lines.push(`\n${scenarios.length} scenario(s)`)
  return lines.join('\n')
}

async function statusCommand(store: any, ws: any): Promise<void> {
  const ops = new ws.WorkspaceOps(store)
  const summary = await ops.getScenarioSummary()
  const workspace = await store.load()
  const phase = ws.detectPhase(workspace)
  const projectId = basename(process.cwd())
  console.log(formatSummary(summary, phase, projectId))
}

async function captureCommand(store: any, ws: any, args: string[]): Promise<void> {
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
  const ops = new ws.WorkspaceOps(store)
  const scenario = await ops.captureScenario({ behavior, context: values.context, story: values.story, mode })
  console.log(`Captured scenario: ${scenario.id}`)
  console.log(`  Behavior: ${scenario.behavior}`)
  console.log(`  Mode: ${scenario.mode}`)
  if (scenario.context) console.log(`  Context: ${scenario.context}`)
  if (scenario.story) console.log(`  Story: ${scenario.story}`)
}

async function advanceCommand(store: any, ws: any, args: string[]): Promise<void> {
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

  const ops = new ws.WorkspaceOps(store)
  const { scenario, warnings } = await ops.advanceScenario(id, { rationale: values.rationale, promotedBy: values.by })
  console.log(`Advanced: ${scenario.id} -> ${scenario.stage}`)
  console.log(`  Behavior: ${scenario.behavior}`)
  for (const warning of warnings) {
    console.log(`  Warning: ${warning}`)
  }
}

async function regressCommand(store: any, ws: any, args: string[]): Promise<void> {
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

  const ops = new ws.WorkspaceOps(store)
  const scenario = await ops.regressScenario(id, { targetStage: values.to, rationale: values.rationale })
  console.log(`Regressed: ${scenario.id} -> ${scenario.stage}`)
  console.log(`  Behavior: ${scenario.behavior}`)
}

async function scenariosCommand(store: any, ws: any, args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      stage: { type: 'string' },
      keyword: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  })

  const ops = new ws.WorkspaceOps(store)
  const scenarios = await ops.getScenarios({
    stage: values.stage,
    keyword: values.keyword,
  })
  console.log(formatScenarioTable(scenarios))
}

async function exportCommand(store: any, ws: any, args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      format: { type: 'string', default: 'md' },
      file: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  })

  const workspace = await store.load()
  const format = values.format ?? 'md'
  const output = format === 'json' ? ws.exportJson(workspace) : ws.exportMarkdown(workspace)

  if (values.file) {
    writeFileSync(resolve(values.file), output)
    console.log(`Exported to ${values.file}`)
  } else {
    console.log(output)
  }
}

async function importCommand(store: any, ws: any, args: string[]): Promise<void> {
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
  const result = await ws.importJson(store, json)
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
  // Strip --workspace-path before checking subcommand
  const argsWithoutWp = rawArgs.filter((a, i) =>
    a !== '--workspace-path' && rawArgs[i - 1] !== '--workspace-path')
  const subcommandArg = argsWithoutWp[0]

  // Help doesn't need workspace package
  if (subcommandArg === '--help' || subcommandArg === '-h' || subcommandArg === undefined) {
    printWorkspaceHelp()
    return
  }

  let ws: any
  try {
    ws = await import('@aver/workspace')
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ERR_MODULE_NOT_FOUND') {
      console.error('Workspace not installed. Run: pnpm add @aver/workspace')
      process.exit(1)
    }
    throw e
  }

  // Extract --workspace-path from args before subcommand parsing
  const wpIdx = rawArgs.indexOf('--workspace-path')
  let workspacePath: string | undefined
  const remainingArgs = [...rawArgs]

  if (wpIdx !== -1 && wpIdx + 1 < rawArgs.length) {
    workspacePath = rawArgs[wpIdx + 1]
    remainingArgs.splice(wpIdx, 2)
  }

  const projectId = basename(process.cwd())
  const store = workspacePath
    ? new ws.WorkspaceStore(resolve(workspacePath), projectId)
    : ws.WorkspaceStore.withDefaults(projectId)

  const [subcommand, ...subArgs] = remainingArgs

  switch (subcommand) {
    case 'status':
      await statusCommand(store, ws)
      break
    case 'capture':
      await captureCommand(store, ws, subArgs)
      break
    case 'advance':
      await advanceCommand(store, ws, subArgs)
      break
    case 'regress':
      await regressCommand(store, ws, subArgs)
      break
    case 'scenarios':
      await scenariosCommand(store, ws, subArgs)
      break
    case 'export':
      await exportCommand(store, ws, subArgs)
      break
    case 'import':
      await importCommand(store, ws, subArgs)
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
