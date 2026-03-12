import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect } from 'vitest'
import { implement } from '../../../src/index'
import type { Protocol } from '../../../src/index'
import { slugify } from '@aver/telemetry'
import { runTelemetryVerify } from '../../../src/cli/telemetry'
import { contractVerification } from '../domains/contract-verification.js'

interface Ctx {
  tempDir: string
  tracePath?: string
  lastResult?: { lines: string[]; exitCode: number }
  contractPaths: Map<string, string> // "domain/testName" → path
}

const protocol: Protocol<Ctx> = {
  name: 'unit',
  async setup() {
    return { tempDir: await mkdtemp(join(tmpdir(), 'aver-cv-')), contractPaths: new Map() }
  },
  async teardown(ctx) {
    await rm(ctx.tempDir, { recursive: true, force: true })
  },
}

export const adapter = implement(contractVerification, {
  protocol,
  actions: {
    writeContract: async (ctx, { domain, testName, spans }) => {
      const dir = join(ctx.tempDir, '.aver', 'contracts', domain)
      await mkdir(dir, { recursive: true })
      const slug = slugify(testName)
      const path = join(dir, `${slug}.contract.json`)
      await writeFile(path, JSON.stringify({
        version: 1, domain, testName,
        extractedAt: new Date().toISOString(),
        entry: { testName, spans },
      }, null, 2))
      ctx.contractPaths.set(`${domain}/${testName}`, path)
    },

    writeTraces: async (ctx, { filename, spans }) => {
      const otlpSpans = spans.map(s => ({
        traceId: s.traceId, spanId: s.spanId,
        parentSpanId: s.parentSpanId ?? '',
        name: s.name,
        attributes: Object.entries(s.attributes ?? {}).map(([key, value]) => ({
          key,
          value: typeof value === 'string'  ? { stringValue: value }
               : typeof value === 'number'  ? { intValue: String(value) }
               :                              { boolValue: value },
        })),
      }))
      const path = join(ctx.tempDir, filename)
      await writeFile(path, JSON.stringify({ resourceSpans: [{ scopeSpans: [{ spans: otlpSpans }] }] }))
      ctx.tracePath = path
    },

    verify: async (ctx, opts) => {
      const prev = process.cwd()
      process.chdir(ctx.tempDir)
      try {
        ctx.lastResult = await runTelemetryVerify({
          traces: ctx.tracePath!,
          contract: opts?.contractPath,
          verbose: opts?.verbose ?? false,
          help: false,
        })
      } finally {
        process.chdir(prev)
      }
    },
  },

  queries: {
    output: async (ctx) => ctx.lastResult!,
    contractPath: async (ctx, { domain, testName }) => ctx.contractPaths.get(`${domain}/${testName}`)!,
  },

  assertions: {
    passes:           async (ctx) => expect(ctx.lastResult!.exitCode).toBe(0),
    fails:            async (ctx) => expect(ctx.lastResult!.exitCode).toBe(1),
    violationReported: async (ctx, { kind }) => expect(ctx.lastResult!.lines.some(l => l.includes(kind))).toBe(true),
    outputContains:    async (ctx, { text }) => expect(ctx.lastResult!.lines.join('\n')).toContain(text),
    outputExcludes:    async (ctx, { text }) => expect(ctx.lastResult!.lines.join('\n')).not.toContain(text),
    domainReported:    async (ctx, { domain }) => expect(ctx.lastResult!.lines.some(l => l.includes(domain))).toBe(true),
  },
})
