export interface TraceAttachment {
  name: string
  path: string
  mime?: string
}

export interface TraceEntry {
  kind: 'action' | 'query' | 'assertion' | 'test'
  category?: 'given' | 'when' | 'act' | 'query' | 'then' | 'assert'
  name: string
  payload: unknown
  status: 'pass' | 'fail'
  result?: unknown
  error?: unknown
  startAt?: number
  endAt?: number
  durationMs?: number
  attachments?: TraceAttachment[]
  metadata?: Record<string, unknown>
  correlationId?: string
  domainName?: string
}
