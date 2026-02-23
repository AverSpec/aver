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
}
