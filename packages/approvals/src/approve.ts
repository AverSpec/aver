import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { compareValues, generateDiff } from './compare'
import { resolveSerializer, type SerializerName } from './serializers'
import { resolveApprovalPaths } from './paths'
import { renderHtmlArtifacts, diffImages } from './artifacts'
import { getTestContext } from 'aver'
import type { HtmlRenderer, TraceAttachment } from 'aver'
import type { ApproveOptions } from './types'

export async function approve(value: unknown, options: ApproveOptions = {}): Promise<void> {
  const state = getTestState()
  const testPath = options.filePath ?? state?.testPath
  const testName = options.testName ?? state?.testName

  if (!testPath || !testName) {
    throw new Error(
      'approve() requires a test runner with expect.getState() or explicit filePath/testName options.',
    )
  }

  const serializerName = options.serializer ?? defaultSerializerFor(value)
  const serializer = resolveSerializer(serializerName)
  const extension = options.fileExtension ?? serializer.fileExtension
  const paths = resolveApprovalPaths(testPath, testName, options.name ?? 'approval', extension)

  mkdirSync(paths.approvalDir, { recursive: true })

  let received = serializer.serialize(value)
  if (options.normalize) received = options.normalize(received)
  writeFileSync(paths.receivedPath, received, 'utf-8')

  const approvedExists = existsSync(paths.approvedPath)
  let approved = approvedExists ? readFileSync(paths.approvedPath, 'utf-8') : ''
  if (options.normalize && approvedExists) approved = options.normalize(approved)

  const context = getTestContext()
  const renderer = context?.extensions['renderer:html'] as HtmlRenderer | undefined
  const pendingAttachments = await renderHtmlArtifacts(
    renderer, paths, value, approvedExists, serializerName === 'html',
  )

  const comparison = compareValues(approved, received, options.compare)
  const shouldApprove = process.env.AVER_APPROVE === '1' || process.env.AVER_APPROVE === 'true'

  if (!approvedExists) {
    if (shouldApprove) {
      writeFileSync(paths.approvedPath, received, 'utf-8')
      pushTrace(context?.trace, [
        { name: 'approved', path: paths.approvedPath, mime: mimeFor(extension) },
      ], 'pass')
      return
    }
    writeFileSync(paths.diffPath, 'Baseline missing. Run with AVER_APPROVE=1 to create it.\n', 'utf-8')
    pushTrace(context?.trace, [
      { name: 'received', path: paths.receivedPath, mime: mimeFor(extension) },
      { name: 'diff', path: paths.diffPath, mime: 'text/plain' },
      ...pendingAttachments,
    ], 'fail')
    throw new Error(`Approval baseline missing: ${paths.approvedPath}`)
  }

  if (comparison.equal) return

  const diff = comparison.diff ?? generateDiff(approved, received)
  writeFileSync(paths.diffPath, diff, 'utf-8')

  const imageDiff = await diffImages(paths)
  if (imageDiff) pendingAttachments.push(imageDiff)

  const allAttachments: TraceAttachment[] = [
    { name: 'approved', path: paths.approvedPath, mime: mimeFor(extension) },
    { name: 'received', path: paths.receivedPath, mime: mimeFor(extension) },
    { name: 'diff', path: paths.diffPath, mime: 'text/plain' },
    ...pendingAttachments,
  ]

  if (shouldApprove) {
    writeFileSync(paths.approvedPath, received, 'utf-8')
    pushTrace(context?.trace, allAttachments, 'pass')
    return
  }

  pushTrace(context?.trace, allAttachments, 'fail')
  throw new Error(`Approval mismatch: ${paths.approvedPath}`)
}

function pushTrace(
  trace: any[] | undefined,
  attachments: TraceAttachment[],
  status: 'pass' | 'fail',
): void {
  if (!trace || attachments.length === 0) return
  trace.push({
    kind: 'test',
    name: 'approval-artifacts',
    payload: undefined,
    status,
    attachments,
  })
}

function defaultSerializerFor(value: unknown): SerializerName {
  if (value && typeof value === 'object') return 'json'
  return 'text'
}

function getTestState(): { testPath?: string; testName?: string } | undefined {
  const expectGlobal = (globalThis as any).expect
  const getState = expectGlobal?.getState
  if (typeof getState !== 'function') return undefined
  const state = getState()
  return {
    testPath: state?.testPath,
    testName: state?.currentTestName ?? state?.testName ?? state?.currentTestSuiteName,
  }
}

function mimeFor(ext: string): string {
  switch (ext) {
    case 'json': return 'application/json'
    case 'html': return 'text/html'
    default: return 'text/plain'
  }
}
