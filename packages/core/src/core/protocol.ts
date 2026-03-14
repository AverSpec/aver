import type { TraceEntry, TraceAttachment } from './trace'
import type { ProtocolExtensions } from './extensions'

export interface TestMetadata {
  testName: string
  domainName: string
  adapterName: string
  protocolName: string
}

export interface TestCompletion extends TestMetadata {
  status: 'pass' | 'fail'
  trace: TraceEntry[]
  error?: unknown
}

export type TestFailureResult = void | TraceAttachment[]

/** Span link reference for cross-trace correlation. */
export interface SpanLink {
  readonly traceId: string
  readonly spanId: string
}

/** Span interface for telemetry verification with correlation fields. */
export interface CollectedSpan {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId?: string
  readonly name: string
  readonly attributes: Readonly<Record<string, unknown>>
  readonly links?: ReadonlyArray<SpanLink>
}

/** Provides access to spans collected during test execution. */
export interface TelemetryCollector {
  getSpans(): CollectedSpan[]
  reset(): void
}

/**
 * A protocol defines how to create and tear down a context
 * that adapter handlers receive as their first argument.
 */
export interface Protocol<Context> {
  readonly name: string
  setup(): Promise<Context>
  teardown(ctx: Context): Promise<void>
  onTestStart?(ctx: Context, meta: TestMetadata): Promise<void> | void
  onTestFail?(ctx: Context, meta: TestCompletion): Promise<TestFailureResult> | TestFailureResult
  onTestEnd?(ctx: Context, meta: TestCompletion): Promise<void> | void
  extensions?: ProtocolExtensions
  /** If provided, enables telemetry verification during tests. */
  telemetry?: TelemetryCollector
}

export function withFixture<C>(
  protocol: Protocol<C>,
  fixture: { before?: () => Promise<void>; afterSetup?: (ctx: C) => Promise<void>; after?: () => Promise<void> }
): Protocol<C> {
  return {
    ...protocol,
    async setup() {
      if (fixture.before) await fixture.before()
      const ctx = await protocol.setup()
      if (fixture.afterSetup) await fixture.afterSetup(ctx)
      return ctx
    },
    async teardown(ctx: C) {
      try {
        await protocol.teardown(ctx)
      } finally {
        if (fixture.after) await fixture.after()
      }
    },
    // Rebind lifecycle hooks to the original protocol so `this` refers to
    // the unwrapped protocol, not this wrapper. Necessary for class-based
    // protocol implementations where hooks reference `this`.
    onTestStart: protocol.onTestStart?.bind(protocol),
    onTestFail: protocol.onTestFail?.bind(protocol),
    onTestEnd: protocol.onTestEnd?.bind(protocol),
  }
}
