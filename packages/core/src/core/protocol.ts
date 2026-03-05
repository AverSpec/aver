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

/** Minimal span interface for telemetry verification (compatible with OTel ReadableSpan). */
export interface CollectedSpan {
  readonly name: string
  readonly attributes: Readonly<Record<string, unknown>>
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
  fixture: { before?: () => Promise<void>; after?: () => Promise<void> }
): Protocol<C> {
  return {
    name: protocol.name,
    async setup() {
      if (fixture.before) await fixture.before()
      return protocol.setup()
    },
    async teardown(ctx: C) {
      try {
        await protocol.teardown(ctx)
      } finally {
        if (fixture.after) await fixture.after()
      }
    },
    onTestStart: protocol.onTestStart?.bind(protocol),
    onTestFail: protocol.onTestFail?.bind(protocol),
    onTestEnd: protocol.onTestEnd?.bind(protocol),
    extensions: protocol.extensions,
    telemetry: protocol.telemetry,
  }
}
