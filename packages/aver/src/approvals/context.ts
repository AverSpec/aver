import { AsyncLocalStorage } from 'node:async_hooks'
import type { TraceAttachment, TraceEntry } from '../core/trace'
import type { ApprovalArtifactProvider } from '../core/protocol'

export interface ApprovalContext {
  testName: string
  domainName: string
  protocolName: string
  trace: TraceEntry[]
  approvalArtifacts?: ApprovalArtifactProvider
}

const storage = new AsyncLocalStorage<ApprovalContext>()

export function runWithApprovalContext<T>(ctx: ApprovalContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn)
}

export function addApprovalAttachments(attachments: TraceAttachment[]): void {
  const ctx = storage.getStore()
  if (!ctx || attachments.length === 0) return
  ctx.trace.push({
    kind: 'test',
    name: 'approval-artifacts',
    payload: undefined,
    status: 'fail',
    attachments,
  })
}

export function getApprovalContext(): ApprovalContext | undefined {
  return storage.getStore()
}
