import { beforeAll, afterAll, expect } from 'vitest'
import { trace } from '@opentelemetry/api'
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { defineDomain, action, assertion, implement, suite } from '../../src/index'
import { createOtlpReceiver, type OtlpReceiver } from '../../src/telemetry/otlp-receiver'
import type { Protocol } from '../../src/core/protocol'

/**
 * Full aver verification pipeline over OTLP:
 * domain declaration → adapter → OTLP export → receiver → proxy matchSpan → pass/fail
 *
 * This proves that aver can verify telemetry from an application exporting
 * spans over the network, not just in-process InMemorySpanExporter.
 */

// --- Domain: declares expected telemetry ---
const greetingDomain = defineDomain({
  name: 'Greeting',
  actions: {
    greet: action<{ name: string }>({
      telemetry: (p) => ({
        span: 'greeting.say_hello',
        attributes: { 'greeting.name': p.name },
      }),
    }),
  },
  queries: {},
  assertions: {
    greeted: assertion<{ name: string }>({
      telemetry: (p) => ({
        span: 'greeting.say_hello',
        attributes: { 'greeting.name': p.name },
      }),
    }),
  },
})

// --- "Application" that emits OTel spans ---
function getTracer() {
  return trace.getTracer('greeting-service', '1.0.0')
}

async function sayHello(name: string): Promise<string> {
  return getTracer().startActiveSpan('greeting.say_hello', async (span) => {
    span.setAttribute('greeting.name', name)
    const result = `Hello, ${name}!`
    span.end()
    return result
  })
}

// --- OTLP receiver + provider lifecycle ---
let receiver: OtlpReceiver
let provider: BasicTracerProvider
let lastGreeting: string

beforeAll(async () => {
  receiver = createOtlpReceiver()
  const port = await receiver.start()

  const exporter = new OTLPTraceExporter({
    url: `http://localhost:${port}/v1/traces`,
  })
  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  })
  trace.setGlobalTracerProvider(provider)
})

afterAll(async () => {
  await provider.shutdown()
  trace.disable()
  await receiver.stop()
})

// --- Adapter wired to the OTLP receiver ---
const protocol: Protocol<void> = {
  name: 'otlp-test',
  async setup() {},
  async teardown() {},
  get telemetry() { return receiver },
}

const adapter = implement(greetingDomain, {
  protocol,
  actions: {
    greet: async (_ctx, { name }) => {
      lastGreeting = await sayHello(name)
      // forceFlush waits for the HTTP export to reach the receiver
      await provider.forceFlush()
    },
  },
  queries: {},
  assertions: {
    greeted: async (_ctx, { name }) => {
      expect(lastGreeting).toBe(`Hello, ${name}!`)
    },
  },
})

// --- suite().test registers vitest tests at top level ---
const { test } = suite(greetingDomain, adapter)

test('greet action telemetry is verified over OTLP', async ({ act, assert }) => {
  await act.greet({ name: 'World' })
  await assert.greeted({ name: 'World' })
})

// --- Prove mismatch detection: app emits wrong span name ---

// Domain expects 'greeting.say_hello' but the app emits 'WRONG.span.name'
async function brokenSayHello(name: string): Promise<string> {
  return getTracer().startActiveSpan('WRONG.span.name', async (span) => {
    span.setAttribute('greeting.name', name)
    const result = `Hello, ${name}!`
    span.end()
    return result
  })
}

const brokenProtocol: Protocol<void> = {
  name: 'otlp-broken',
  async setup() {},
  async teardown() {},
  get telemetry() { return receiver },
}

const brokenAdapter = implement(greetingDomain, {
  protocol: brokenProtocol,
  actions: {
    greet: async (_ctx, { name }) => {
      lastGreeting = await brokenSayHello(name)
      await provider.forceFlush()
    },
  },
  queries: {},
  assertions: {
    greeted: async (_ctx, { name }) => {
      expect(lastGreeting).toBe(`Hello, ${name}!`)
    },
  },
})

const broken = suite(greetingDomain, brokenAdapter)

broken.test('mismatch is caught when app emits wrong span name', async ({ act }) => {
  const prev = process.env.AVER_TELEMETRY_MODE
  process.env.AVER_TELEMETRY_MODE = 'fail'
  try {
    receiver.reset()
    await expect(act.greet({ name: 'Aver' })).rejects.toThrow('Telemetry mismatch')
  } finally {
    if (prev === undefined) delete process.env.AVER_TELEMETRY_MODE
    else process.env.AVER_TELEMETRY_MODE = prev
  }
})
