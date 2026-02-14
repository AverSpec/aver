import { defineDomain, action, query, assertion } from 'aver'

export const averApprovals = defineDomain({
  name: 'AverApprovals',
  actions: {
    approveValue: action<{
      value: unknown
      name?: string
      serializer?: 'json' | 'text' | 'html'
    }>(),
    approveWithCustomCompare: action<{
      value: unknown
      compareFn: 'alwaysEqual' | 'alwaysDifferent'
    }>(),
    approveWithNormalize: action<{
      value: unknown
      normalizeFn: 'lowercase' | 'trimLines'
    }>(),
    setApproveMode: action(),
    clearApproveMode: action(),
  },
  queries: {
    approvedFileExists: query<boolean>(),
    receivedFileContents: query<string>(),
    diffFileContents: query<string>(),
    traceAttachments: query<Array<{ name: string; path: string }>>(),
    lastError: query<string | undefined>(),
  },
  assertions: {
    baselineCreated: assertion(),
    baselineMissing: assertion(),
    mismatchDetected: assertion(),
    matchPassed: assertion(),
    diffContains: assertion<{ text: string }>(),
    attachmentsRecorded: assertion<{ minCount: number }>(),
    traceEntryHasStatus: assertion<{ name: string; status: 'pass' | 'fail' }>(),
    noError: assertion(),
  },
})
