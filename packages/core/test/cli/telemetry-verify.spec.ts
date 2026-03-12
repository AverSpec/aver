import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseVerifyArgs, runTelemetryVerify } from '../../src/cli/telemetry'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'aver-verify-test-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

// ── Helpers ──

function otlpTrace(traceId: string, spans: Array<{ name: string; attributes?: Record<string, string>; spanId?: string; parentSpanId?: string }>) {
  return {
    resourceSpans: [{
      scopeSpans: [{
        spans: spans.map(s => ({
          traceId,
          spanId: s.spanId ?? 'span-1',
          parentSpanId: s.parentSpanId ?? '',
          name: s.name,
          attributes: Object.entries(s.attributes ?? {}).map(([key, value]) => ({
            key,
            value: { stringValue: value },
          })),
        })),
      }],
    }],
  }
}

async function writeTraceFile(traces: object): Promise<string> {
  const path = join(tempDir, 'traces.json')
  await writeFile(path, JSON.stringify(traces), 'utf-8')
  return path
}

async function writeContractFile(
  domain: string,
  testName: string,
  spans: Array<{ name: string; attributes: Record<string, any> }>,
): Promise<string> {
  const dir = join(tempDir, 'contracts', domain)
  await mkdir(dir, { recursive: true })
  const slug = testName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const path = join(dir, `${slug}.contract.json`)
  await writeFile(path, JSON.stringify({
    version: 1,
    domain,
    testName,
    extractedAt: new Date().toISOString(),
    entry: { testName, spans },
  }, null, 2), 'utf-8')
  return path
}

// ── parseVerifyArgs ──

describe('parseVerifyArgs', () => {
  it('parses --traces flag', () => {
    const args = parseVerifyArgs(['--traces', 'export.json'])
    expect(args.traces).toBe('export.json')
  })

  it('parses --traces= form', () => {
    const args = parseVerifyArgs(['--traces=export.json'])
    expect(args.traces).toBe('export.json')
  })

  it('parses --contract flag', () => {
    const args = parseVerifyArgs(['--traces', 'x.json', '--contract', 'c.json'])
    expect(args.contract).toBe('c.json')
  })

  it('parses --verbose flag', () => {
    const args = parseVerifyArgs(['--traces', 'x.json', '--verbose'])
    expect(args.verbose).toBe(true)
  })

  it('parses -v shorthand', () => {
    const args = parseVerifyArgs(['--traces', 'x.json', '-v'])
    expect(args.verbose).toBe(true)
  })

  it('defaults verbose to false', () => {
    const args = parseVerifyArgs(['--traces', 'x.json'])
    expect(args.verbose).toBe(false)
  })
})

// ── runTelemetryVerify ──

describe('runTelemetryVerify', () => {
  it('errors when --traces is missing', async () => {
    const { lines, exitCode } = await runTelemetryVerify({
      traces: undefined,
      contract: undefined,
      verbose: false,
      help: false,
    })
    expect(exitCode).toBe(1)
    expect(lines.some(l => l.includes('--traces'))).toBe(true)
  })

  it('errors when traces file does not exist', async () => {
    const { lines, exitCode } = await runTelemetryVerify({
      traces: join(tempDir, 'nonexistent.json'),
      contract: undefined,
      verbose: false,
      help: false,
    })
    expect(exitCode).toBe(1)
    expect(lines.some(l => l.includes('Failed to read traces'))).toBe(true)
  })

  it('errors when no contracts found', async () => {
    const tracePath = await writeTraceFile(otlpTrace('trace-1', [{ name: 'test.span' }]))
    // Point to a non-existent contracts dir by cd'ing — use contract: undefined (default dir)
    // Since we're in test tempDir and .aver/contracts doesn't exist there
    const originalCwd = process.cwd()
    process.chdir(tempDir)
    try {
      const { lines, exitCode } = await runTelemetryVerify({
        traces: tracePath,
        contract: undefined,
        verbose: false,
        help: false,
      })
      expect(exitCode).toBe(1)
      expect(lines.some(l => l.includes('No contracts found'))).toBe(true)
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('passes when contract matches traces', async () => {
    const tracePath = await writeTraceFile(otlpTrace('trace-1', [
      { name: 'user.signup', attributes: { 'user.email': 'test@example.com' } },
    ]))
    const contractPath = await writeContractFile('signup-flow', 'signup creates account', [
      { name: 'user.signup', attributes: { 'user.email': { kind: 'literal', value: 'test@example.com' } } },
    ])

    const { lines, exitCode } = await runTelemetryVerify({
      traces: tracePath,
      contract: contractPath,
      verbose: false,
      help: false,
    })
    expect(exitCode).toBe(0)
    expect(lines.some(l => l.includes('PASS'))).toBe(true)
  })

  it('fails when contract has violations', async () => {
    const tracePath = await writeTraceFile(otlpTrace('trace-1', [
      { name: 'user.signup', attributes: { 'user.email': 'wrong@example.com' } },
    ]))
    const contractPath = await writeContractFile('signup-flow', 'signup creates account', [
      { name: 'user.signup', attributes: { 'user.email': { kind: 'literal', value: 'test@example.com' } } },
    ])

    const { lines, exitCode } = await runTelemetryVerify({
      traces: tracePath,
      contract: contractPath,
      verbose: false,
      help: false,
    })
    expect(exitCode).toBe(1)
    expect(lines.some(l => l.includes('FAIL'))).toBe(true)
    expect(lines.some(l => l.includes('violation'))).toBe(true)
  })

  it('shows verbose violation details', async () => {
    const tracePath = await writeTraceFile(otlpTrace('trace-abc', [
      { name: 'user.signup', attributes: { 'user.email': 'wrong@example.com' } },
    ]))
    const contractPath = await writeContractFile('signup-flow', 'signup creates account', [
      { name: 'user.signup', attributes: { 'user.email': { kind: 'literal', value: 'test@example.com' } } },
    ])

    const { lines, exitCode } = await runTelemetryVerify({
      traces: tracePath,
      contract: contractPath,
      verbose: true,
      help: false,
    })
    expect(exitCode).toBe(1)
    expect(lines.some(l => l.includes('Violation Details'))).toBe(true)
    expect(lines.some(l => l.includes('literal-mismatch'))).toBe(true)
    expect(lines.some(l => l.includes('trace-abc'))).toBe(true)
  })

  it('shows verbose missing span details', async () => {
    const tracePath = await writeTraceFile(otlpTrace('trace-xyz', [
      { name: 'other.span' },
    ]))
    // Contract expects user.signup but trace only has other.span as anchor
    // Need to make the anchor match so the trace is checked
    const contractPath = await writeContractFile('signup-flow', 'signup test', [
      { name: 'other.span', attributes: {} },
      { name: 'user.signup', attributes: {} },
    ])

    const { lines, exitCode } = await runTelemetryVerify({
      traces: tracePath,
      contract: contractPath,
      verbose: true,
      help: false,
    })
    expect(exitCode).toBe(1)
    expect(lines.some(l => l.includes('missing-span'))).toBe(true)
    expect(lines.some(l => l.includes('user.signup'))).toBe(true)
  })

  it('reads all contracts from directory when --contract not specified', async () => {
    const tracePath = await writeTraceFile(otlpTrace('trace-1', [
      { name: 'user.signup', attributes: { 'user.email': 'test@example.com' } },
      { name: 'order.cancel', attributes: { 'order.status': 'cancelled' } },
    ]))

    // Write contracts to tempDir/contracts/ (we'll chdir)
    const contractsDir = join(tempDir, '.aver', 'contracts')
    await writeContractFile('signup-flow', 'signup test', [
      { name: 'user.signup', attributes: { 'user.email': { kind: 'literal', value: 'test@example.com' } } },
    ])
    // Move the contract to the right place
    const signupDir = join(contractsDir, 'signup-flow')
    await mkdir(signupDir, { recursive: true })
    const { readFile: rf } = await import('node:fs/promises')
    const contractContent = await rf(join(tempDir, 'contracts', 'signup-flow', 'signup-test.contract.json'), 'utf-8')
    await writeFile(join(signupDir, 'signup-test.contract.json'), contractContent)

    const originalCwd = process.cwd()
    process.chdir(tempDir)
    try {
      const { lines, exitCode } = await runTelemetryVerify({
        traces: tracePath,
        contract: undefined,
        verbose: false,
        help: false,
      })
      expect(exitCode).toBe(0)
      expect(lines.some(l => l.includes('signup-flow'))).toBe(true)
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('errors when --contract file does not exist', async () => {
    const tracePath = await writeTraceFile(otlpTrace('trace-1', [{ name: 'test' }]))

    const { lines, exitCode } = await runTelemetryVerify({
      traces: tracePath,
      contract: join(tempDir, 'nonexistent.contract.json'),
      verbose: false,
      help: false,
    })
    expect(exitCode).toBe(1)
    expect(lines.some(l => l.includes('Failed to read contract'))).toBe(true)
  })

  it('verbose is additive — includes summary even with details', async () => {
    const tracePath = await writeTraceFile(otlpTrace('trace-1', [
      { name: 'user.signup', attributes: { 'user.email': 'wrong@test.com' } },
    ]))
    const contractPath = await writeContractFile('signup-flow', 'test', [
      { name: 'user.signup', attributes: { 'user.email': { kind: 'literal', value: 'right@test.com' } } },
    ])

    const { lines } = await runTelemetryVerify({
      traces: tracePath,
      contract: contractPath,
      verbose: true,
      help: false,
    })
    // Has both summary and details
    expect(lines.some(l => l.includes('signup-flow'))).toBe(true)
    expect(lines.some(l => l.includes('Violation Details'))).toBe(true)
  })

  it('truncates trace IDs after 3 in verbose', async () => {
    // Create traces with many violations of the same type
    const allTraces = {
      resourceSpans: Array.from({ length: 5 }, (_, i) => ({
        scopeSpans: [{
          spans: [{
            traceId: `trace-${i}`,
            spanId: `span-${i}`,
            parentSpanId: '',
            name: 'anchor.span',
            attributes: [],
          }],
        }],
      })),
    }
    const tracePath = await writeTraceFile(allTraces)
    // Contract expects a span that doesn't exist (besides anchor)
    const contractPath = await writeContractFile('test-domain', 'test', [
      { name: 'anchor.span', attributes: {} },
      { name: 'missing.span', attributes: {} },
    ])

    const { lines } = await runTelemetryVerify({
      traces: tracePath,
      contract: contractPath,
      verbose: true,
      help: false,
    })
    expect(lines.some(l => l.includes('and') && l.includes('more'))).toBe(true)
  })
})
