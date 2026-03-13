import { AsyncLocalStorage } from 'node:async_hooks'
import type { TraceEntry } from './trace'
import type { ProtocolExtensions } from './extensions'

export interface RunningTestContext {
  testName: string
  domainName: string
  protocolName: string
  trace: TraceEntry[]
  extensions: ProtocolExtensions
  protocolContext?: unknown
}

const storage = new AsyncLocalStorage<RunningTestContext>()

export function runWithTestContext<T>(
  ctx: RunningTestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(ctx, fn)
}

export function getTestContext(): RunningTestContext | undefined {
  return storage.getStore()
}
