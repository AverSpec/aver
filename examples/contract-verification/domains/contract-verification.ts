import { defineDomain, action, query, assertion } from '@aver/core'
import type { AttributeBinding } from '@aver/telemetry'

// ── Payload types ──

export interface SpanSpec {
  name: string
  attributes: Record<string, AttributeBinding>
  parentName?: string
}

export interface ContractSpec {
  domain: string
  testName: string
  spans: SpanSpec[]
}

export interface TraceSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  attributes?: Record<string, string | number | boolean>
}

export interface VerifyOpts {
  verbose?: boolean
  contractPath?: string
}

// ── Domain ──

export const contractVerification = defineDomain({
  name: 'contract-verification',
  actions: {
    writeContract: action<ContractSpec>(),
    writeTraces: action<{ filename: string; spans: TraceSpan[] }>(),
    verify: action<VerifyOpts>(),
  },
  queries: {
    output: query<{ lines: string[]; exitCode: number }>(),
    contractPath: query<{ domain: string; testName: string }, string>(),
  },
  assertions: {
    passes: assertion(),
    fails: assertion(),
    violationReported: assertion<{ kind: string }>(),
    outputContains: assertion<{ text: string }>(),
    outputExcludes: assertion<{ text: string }>(),
    domainReported: assertion<{ domain: string }>(),
  },
})
