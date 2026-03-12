import { createServer } from 'node:http'

export type TelemetryMode = 'warn' | 'fail' | 'off'

const VALID_MODES: readonly TelemetryMode[] = ['warn', 'fail', 'off']
const DEFAULT_OTLP_PORT = 4318

export interface TelemetryDiagnostics {
  mode: TelemetryMode | null
  modeSource: 'env' | 'ci-default' | 'default'
  modeValid: boolean
  rawMode: string | undefined
  otlpEndpoint: string
  otlpPort: number
}

export interface PortCheckResult {
  available: boolean
  error?: string
}

export function parseTelemetryModeForDiag(value: string | undefined): {
  mode: TelemetryMode | null
  valid: boolean
} {
  if (value === undefined || value === '') {
    return { mode: null, valid: true }
  }
  if (VALID_MODES.includes(value as TelemetryMode)) {
    return { mode: value as TelemetryMode, valid: true }
  }
  return { mode: null, valid: false }
}

export function buildDiagnostics(env: Record<string, string | undefined>): TelemetryDiagnostics {
  const rawMode = env.AVER_TELEMETRY_MODE
  const { mode, valid } = parseTelemetryModeForDiag(rawMode)

  let resolvedMode: TelemetryMode
  let modeSource: TelemetryDiagnostics['modeSource']

  if (valid && mode !== null) {
    resolvedMode = mode
    modeSource = 'env'
  } else if (valid && mode === null) {
    // env var not set — use defaults
    if (env.CI) {
      resolvedMode = 'fail'
      modeSource = 'ci-default'
    } else {
      resolvedMode = 'warn'
      modeSource = 'default'
    }
  } else {
    // invalid value set
    resolvedMode = 'warn'
    modeSource = 'default'
  }

  const otlpPort = DEFAULT_OTLP_PORT
  const otlpEndpoint = `http://localhost:${otlpPort}`

  return {
    mode: resolvedMode,
    modeSource,
    modeValid: valid,
    rawMode,
    otlpEndpoint,
    otlpPort,
  }
}

export function checkPortAvailable(port: number): Promise<PortCheckResult> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve({ available: true }))
    })
    server.on('error', (err: NodeJS.ErrnoException) => {
      resolve({ available: false, error: err.message })
    })
  })
}

export interface DiagnosticsOutput {
  lines: string[]
  exitCode: number
}

export async function runTelemetryDiagnose(
  env: Record<string, string | undefined>,
  opts?: { checkPort?: (port: number) => Promise<PortCheckResult> },
): Promise<DiagnosticsOutput> {
  const diag = buildDiagnostics(env)
  const portChecker = opts?.checkPort ?? checkPortAvailable

  const lines: string[] = []
  let exitCode = 0

  lines.push('Telemetry Configuration')

  // Mode line
  if (!diag.modeValid) {
    lines.push(`  Mode: ${diag.rawMode} (invalid)`)
    lines.push(`  Error: '${diag.rawMode}' is not a valid AVER_TELEMETRY_MODE.`)
    lines.push(`  Valid values: ${VALID_MODES.join(', ')}`)
    lines.push(`  Fix: Set AVER_TELEMETRY_MODE to one of: ${VALID_MODES.join(', ')}`)
    exitCode = 1
  } else if (diag.modeSource === 'env') {
    lines.push(`  Mode: ${diag.mode} (from AVER_TELEMETRY_MODE)`)
  } else if (diag.modeSource === 'ci-default') {
    lines.push(`  Mode: ${diag.mode} (CI default — AVER_TELEMETRY_MODE not set, CI=true)`)
  } else {
    lines.push(`  Mode: ${diag.mode} (default — AVER_TELEMETRY_MODE not set)`)
  }

  lines.push(`  OTLP endpoint: ${diag.otlpEndpoint}`)

  // Port check only when mode requires a receiver
  if (diag.mode !== 'off') {
    const portResult = await portChecker(diag.otlpPort)
    if (portResult.available) {
      lines.push(`  Receiver: \u2713 port ${diag.otlpPort} is available`)
    } else {
      lines.push(`  Receiver: \u2717 port ${diag.otlpPort} is in use`)
      lines.push(`  Hint: Another process is already listening on port ${diag.otlpPort}.`)
      lines.push(`  This is expected if your OTLP receiver is already running.`)
      lines.push(`  If you intended to use Aver's built-in receiver, stop the other process first.`)
    }
  } else {
    lines.push(`  Receiver: skipped (mode is off)`)
  }

  return { lines, exitCode }
}

// ── Extract ──

export interface ExtractOutput {
  lines: string[]
  exitCode: number
}

export async function runTelemetryExtract(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`
aver telemetry extract - Extract behavioral contracts from test runs

Runs tests with contract extraction enabled. For each passing test with
telemetry declarations, writes a contract file to .aver/contracts/<domain>/.

Usage:
  aver telemetry extract

All other arguments are forwarded to vitest.
`)
    return
  }

  const { execFileSync } = await import('node:child_process')
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

  try {
    execFileSync(npx, ['vitest', 'run', ...argv], {
      stdio: 'inherit',
      env: { ...process.env, AVER_CONTRACT_EXTRACT: '1' },
      timeout: 10 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch {
    process.exit(1)
  }
}

// ── Verify ──

export interface VerifyArgs {
  traces: string | undefined
  contract: string | undefined
  verbose: boolean
  help: boolean
}

export function parseVerifyArgs(argv: string[]): VerifyArgs {
  let traces: string | undefined
  let contract: string | undefined
  let verbose = false
  let help = false

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === '--traces' || arg.startsWith('--traces=')) {
      if (arg.includes('=')) {
        traces = arg.split('=').slice(1).join('=')
      } else if (i + 1 < argv.length) {
        traces = argv[++i]
      }
    } else if (arg === '--contract' || arg.startsWith('--contract=')) {
      if (arg.includes('=')) {
        contract = arg.split('=').slice(1).join('=')
      } else if (i + 1 < argv.length) {
        contract = argv[++i]
      }
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true
    } else if (arg === '--help' || arg === '-h') {
      help = true
    }
    i++
  }

  return { traces, contract, verbose, help }
}

export interface VerifyOutput {
  lines: string[]
  exitCode: number
}

export async function runTelemetryVerify(args: VerifyArgs): Promise<VerifyOutput> {
  const lines: string[] = []

  if (!args.traces) {
    lines.push('Error: --traces <file> is required')
    lines.push('')
    lines.push('Usage: aver telemetry verify --traces <file> [--contract <path>] [--verbose]')
    return { lines, exitCode: 1 }
  }

  let telemetry: typeof import('@aver/telemetry')
  try {
    telemetry = await import('@aver/telemetry')
  } catch {
    lines.push('Error: @aver/telemetry is required for contract verification.')
    lines.push('Install it: pnpm add -D @aver/telemetry')
    return { lines, exitCode: 1 }
  }

  const { resolve } = await import('node:path')

  // Load production traces
  const traceSource = new telemetry.FileTraceSource(resolve(args.traces))
  let traces: Awaited<ReturnType<typeof traceSource.fetch>>
  try {
    traces = await traceSource.fetch()
  } catch (err: any) {
    lines.push(`Error: Failed to read traces from ${args.traces}`)
    lines.push(`  ${err.message}`)
    return { lines, exitCode: 1 }
  }

  // Load contracts
  let contracts: Awaited<ReturnType<typeof telemetry.readContracts>>

  if (args.contract) {
    // Single contract mode
    try {
      const { domain, entry } = await telemetry.readContractFile(resolve(args.contract))
      contracts = [{ domain, entries: [entry] }]
    } catch (err: any) {
      lines.push(`Error: Failed to read contract from ${args.contract}`)
      lines.push(`  ${err.message}`)
      return { lines, exitCode: 1 }
    }
  } else {
    // Read all contracts from .aver/contracts/
    const baseDir = resolve('.aver', 'contracts')
    contracts = await telemetry.readContracts(baseDir)
    if (contracts.length === 0) {
      lines.push('Error: No contracts found in .aver/contracts/')
      lines.push('Run "aver telemetry extract" first to generate contracts.')
      return { lines, exitCode: 1 }
    }
  }

  // Verify each contract
  let totalViolations = 0
  const reports: Array<ReturnType<typeof telemetry.verifyContract>> = []

  for (const contract of contracts) {
    const report = telemetry.verifyContract(contract, traces)
    reports.push(report)
    totalViolations += report.totalViolations
  }

  // Print summary
  lines.push('Contract Verification')
  lines.push('')

  for (const report of reports) {
    const status = report.totalViolations === 0 ? '\u2713 PASS' : '\u2717 FAIL'
    lines.push(`  ${report.domain}: ${status}`)
    for (const result of report.results) {
      const entryStatus = result.violations.length === 0 ? '\u2713' : '\u2717'
      lines.push(`    ${entryStatus} ${result.testName} (${result.tracesMatched}/${result.tracesChecked} traces)`)
      if (result.violations.length > 0) {
        lines.push(`      ${result.violations.length} violation(s)`)
      }
    }
  }

  // Verbose: grouped violation details
  if (args.verbose && totalViolations > 0) {
    lines.push('')
    lines.push('Violation Details')
    lines.push('')

    // Collect all violations across all reports
    type ViolationType = 'missing-span' | 'correlation-violation' | 'literal-mismatch'
    const grouped = new Map<ViolationType, Array<{ violation: any; domain: string; testName: string }>>()

    for (const report of reports) {
      for (const result of report.results) {
        for (const v of result.violations) {
          const kind = v.kind as ViolationType
          if (!grouped.has(kind)) grouped.set(kind, [])
          grouped.get(kind)!.push({ violation: v, domain: report.domain, testName: result.testName })
        }
      }
    }

    for (const [kind, items] of grouped) {
      lines.push(`  ${kind} (${items.length} violation${items.length === 1 ? '' : 's'}):`)

      if (kind === 'missing-span') {
        // Group by span name
        const bySpan = new Map<string, string[]>()
        for (const { violation } of items) {
          const name = violation.spanName as string
          if (!bySpan.has(name)) bySpan.set(name, [])
          bySpan.get(name)!.push(violation.traceId as string)
        }
        for (const [spanName, traceIds] of bySpan) {
          lines.push(`    span: ${spanName}`)
          const shown = traceIds.slice(0, 3)
          const remaining = traceIds.length - shown.length
          lines.push(`    traces: ${shown.join(', ')}${remaining > 0 ? ` and ${remaining} more` : ''}`)
        }
      } else if (kind === 'literal-mismatch') {
        for (const { violation } of items) {
          lines.push(`    span: ${violation.span}, attr: ${violation.attribute}`)
          lines.push(`    expected: ${JSON.stringify(violation.expected)}, actual: ${JSON.stringify(violation.actual)}`)
          lines.push(`    traces: ${violation.traceId}`)
        }
      } else if (kind === 'correlation-violation') {
        for (const { violation } of items) {
          lines.push(`    symbol: ${violation.symbol}`)
          const paths = (violation.paths as Array<{ span: string; value: unknown }>)
            .map(p => `${JSON.stringify(p.value)} (${p.span})`)
            .join(', ')
          lines.push(`    values: ${paths}`)
          lines.push(`    traces: ${violation.traceId}`)
        }
      }
    }
  }

  lines.push('')
  if (totalViolations === 0) {
    lines.push(`\u2713 All contracts pass (${reports.length} domain${reports.length === 1 ? '' : 's'}, ${traces.length} trace${traces.length === 1 ? '' : 's'})`)
  } else {
    lines.push(`\u2717 ${totalViolations} violation${totalViolations === 1 ? '' : 's'} found`)
  }

  return { lines, exitCode: totalViolations > 0 ? 1 : 0 }
}

// ── Command router ──

export async function runTelemetryCommand(argv: string[]): Promise<void> {
  const subcommand = argv[0]

  if (subcommand === 'diagnose' || subcommand === 'check') {
    const { lines, exitCode } = await runTelemetryDiagnose(process.env as Record<string, string | undefined>)
    for (const line of lines) {
      console.log(line)
    }
    if (exitCode !== 0) {
      process.exit(exitCode)
    }
    return
  }

  if (subcommand === 'extract') {
    await runTelemetryExtract(argv.slice(1))
    return
  }

  if (subcommand === 'verify') {
    const args = parseVerifyArgs(argv.slice(1))
    if (args.help) {
      console.log(`
aver telemetry verify - Verify contracts against production traces

Usage:
  aver telemetry verify --traces <file> [--contract <path>] [--verbose]

Options:
  --traces <file>      Path to OTLP JSON trace export (required)
  --contract <path>    Verify a single contract file instead of all in .aver/contracts/
  --verbose, -v        Show grouped violation details with trace IDs
  --help               Show this help message
`)
      return
    }
    const { lines, exitCode } = await runTelemetryVerify(args)
    for (const line of lines) {
      console.log(line)
    }
    if (exitCode !== 0) {
      process.exit(exitCode)
    }
    return
  }

  if (subcommand === '--help' || subcommand === '-h' || subcommand === undefined) {
    console.log(`
aver telemetry - Telemetry utilities

Commands:
  aver telemetry diagnose   Show telemetry configuration and check port availability
  aver telemetry check      Alias for diagnose
  aver telemetry extract    Extract behavioral contracts from test runs
  aver telemetry verify     Verify contracts against production traces

Options:
  --help   Show this help message
`)
    return
  }

  console.error(`Unknown telemetry subcommand: ${subcommand}`)
  process.exit(1)
}
