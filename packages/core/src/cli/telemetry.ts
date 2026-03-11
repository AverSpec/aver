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

  if (subcommand === '--help' || subcommand === '-h' || subcommand === undefined) {
    console.log(`
aver telemetry - Telemetry utilities

Commands:
  aver telemetry diagnose   Show telemetry configuration and check port availability
  aver telemetry check      Alias for diagnose

Options:
  --help   Show this help message
`)
    return
  }

  console.error(`Unknown telemetry subcommand: ${subcommand}`)
  process.exit(1)
}
