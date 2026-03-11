import { describe, it, expect } from 'vitest'
import {
  parseTelemetryModeForDiag,
  buildDiagnostics,
  runTelemetryDiagnose,
  type PortCheckResult,
} from '../../src/cli/telemetry'

const portAvailable = (): Promise<PortCheckResult> => Promise.resolve({ available: true })
const portInUse = (): Promise<PortCheckResult> =>
  Promise.resolve({ available: false, error: 'EADDRINUSE: address already in use' })

describe('parseTelemetryModeForDiag()', () => {
  it('returns null mode with valid:true when value is undefined', () => {
    expect(parseTelemetryModeForDiag(undefined)).toEqual({ mode: null, valid: true })
  })

  it('returns null mode with valid:true when value is empty string', () => {
    expect(parseTelemetryModeForDiag('')).toEqual({ mode: null, valid: true })
  })

  it('returns mode with valid:true for "warn"', () => {
    expect(parseTelemetryModeForDiag('warn')).toEqual({ mode: 'warn', valid: true })
  })

  it('returns mode with valid:true for "fail"', () => {
    expect(parseTelemetryModeForDiag('fail')).toEqual({ mode: 'fail', valid: true })
  })

  it('returns mode with valid:true for "off"', () => {
    expect(parseTelemetryModeForDiag('off')).toEqual({ mode: 'off', valid: true })
  })

  it('returns null mode with valid:false for unknown value', () => {
    expect(parseTelemetryModeForDiag('record')).toEqual({ mode: null, valid: false })
  })

  it('returns null mode with valid:false for garbage value', () => {
    expect(parseTelemetryModeForDiag('FAIL')).toEqual({ mode: null, valid: false })
  })
})

describe('buildDiagnostics()', () => {
  it('defaults to warn mode when AVER_TELEMETRY_MODE is not set', () => {
    const diag = buildDiagnostics({})
    expect(diag.mode).toBe('warn')
    expect(diag.modeSource).toBe('default')
    expect(diag.modeValid).toBe(true)
    expect(diag.rawMode).toBeUndefined()
  })

  it('defaults to fail mode in CI environment', () => {
    const diag = buildDiagnostics({ CI: 'true' })
    expect(diag.mode).toBe('fail')
    expect(diag.modeSource).toBe('ci-default')
    expect(diag.modeValid).toBe(true)
  })

  it('uses AVER_TELEMETRY_MODE when set', () => {
    const diag = buildDiagnostics({ AVER_TELEMETRY_MODE: 'off' })
    expect(diag.mode).toBe('off')
    expect(diag.modeSource).toBe('env')
    expect(diag.modeValid).toBe(true)
    expect(diag.rawMode).toBe('off')
  })

  it('marks invalid mode as invalid', () => {
    const diag = buildDiagnostics({ AVER_TELEMETRY_MODE: 'record' })
    expect(diag.modeValid).toBe(false)
    expect(diag.rawMode).toBe('record')
  })

  it('reports default OTLP endpoint', () => {
    const diag = buildDiagnostics({})
    expect(diag.otlpEndpoint).toBe('http://localhost:4318')
    expect(diag.otlpPort).toBe(4318)
  })
})

describe('runTelemetryDiagnose()', () => {
  it('prints mode from env when AVER_TELEMETRY_MODE is set', async () => {
    const { lines } = await runTelemetryDiagnose(
      { AVER_TELEMETRY_MODE: 'warn' },
      { checkPort: portAvailable },
    )
    expect(lines[0]).toBe('Telemetry Configuration')
    expect(lines.some(l => l.includes('warn') && l.includes('AVER_TELEMETRY_MODE'))).toBe(true)
  })

  it('prints default mode label when env var is not set', async () => {
    const { lines } = await runTelemetryDiagnose({}, { checkPort: portAvailable })
    expect(lines.some(l => l.includes('warn') && l.includes('default'))).toBe(true)
  })

  it('prints CI default mode label when CI is set', async () => {
    const { lines } = await runTelemetryDiagnose({ CI: 'true' }, { checkPort: portAvailable })
    expect(lines.some(l => l.includes('fail') && l.includes('CI'))).toBe(true)
  })

  it('prints OTLP endpoint', async () => {
    const { lines } = await runTelemetryDiagnose({}, { checkPort: portAvailable })
    expect(lines.some(l => l.includes('http://localhost:4318'))).toBe(true)
  })

  it('reports port available', async () => {
    const { lines, exitCode } = await runTelemetryDiagnose({}, { checkPort: portAvailable })
    expect(lines.some(l => l.includes('4318') && l.includes('\u2713'))).toBe(true)
    expect(exitCode).toBe(0)
  })

  it('reports port in use', async () => {
    const { lines } = await runTelemetryDiagnose({}, { checkPort: portInUse })
    expect(lines.some(l => l.includes('4318') && l.includes('\u2717'))).toBe(true)
  })

  it('skips port check when mode is off', async () => {
    let checked = false
    const { lines } = await runTelemetryDiagnose(
      { AVER_TELEMETRY_MODE: 'off' },
      {
        checkPort: async () => {
          checked = true
          return { available: true }
        },
      },
    )
    expect(checked).toBe(false)
    expect(lines.some(l => l.includes('skipped'))).toBe(true)
  })

  it('reports error and exitCode 1 for invalid mode', async () => {
    const { lines, exitCode } = await runTelemetryDiagnose(
      { AVER_TELEMETRY_MODE: 'record' },
      { checkPort: portAvailable },
    )
    expect(exitCode).toBe(1)
    expect(lines.some(l => l.toLowerCase().includes('invalid') || l.toLowerCase().includes('error'))).toBe(true)
    expect(lines.some(l => l.includes('record'))).toBe(true)
  })

  it('includes fix hint for invalid mode', async () => {
    const { lines } = await runTelemetryDiagnose(
      { AVER_TELEMETRY_MODE: 'bogus' },
      { checkPort: portAvailable },
    )
    expect(lines.some(l => l.toLowerCase().includes('fix') || l.toLowerCase().includes('valid values'))).toBe(true)
  })

  it('includes hint when port is in use', async () => {
    const { lines } = await runTelemetryDiagnose({}, { checkPort: portInUse })
    expect(lines.some(l => l.toLowerCase().includes('hint'))).toBe(true)
  })
})
