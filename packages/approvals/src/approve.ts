import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { compareValues, generateDiff } from './compare'
import { resolveSerializer, type SerializerName } from './serializers'
import { resolveApprovalPaths } from './paths'
import { captureVisual, diffImages } from './artifacts'
import { getTestContext } from 'aver'
import type { Screenshotter, TraceAttachment } from 'aver'
import type { ApproveOptions, VisualApproveOptions } from './types'

export async function approve(value: unknown, options: ApproveOptions = {}): Promise<void> {
  const state = getTestState()
  const testPath = options.filePath ?? state?.testPath
  const testName = options.testName ?? state?.testName

  if (!testPath || !testName) {
    throw new Error(
      'approve() requires a test runner with expect.getState() or explicit filePath/testName options.',
    )
  }

  const serializerName = defaultSerializerFor(value)
  const serializer = resolveSerializer(serializerName)
  const extension = options.fileExtension ?? serializer.fileExtension
  const paths = resolveApprovalPaths(testPath, testName, options.name ?? 'approval', extension)

  mkdirSync(paths.approvalDir, { recursive: true })

  const received = serializer.serialize(value)
  writeFileSync(paths.receivedPath, received, 'utf-8')

  const approvedExists = existsSync(paths.approvedPath)
  const approved = approvedExists ? readFileSync(paths.approvedPath, 'utf-8') : ''

  const context = getTestContext()
  const comparison = compareValues(approved, received)
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
    ], 'fail')
    throw new Error(
      `Approval baseline missing: ${paths.approvedPath}\n\n` +
      `Run with AVER_APPROVE=1 to create the baseline:\n` +
      `  AVER_APPROVE=1 npx vitest run <test-file>`,
    )
  }

  if (comparison.equal) return

  const diff = comparison.diff ?? generateDiff(approved, received)
  writeFileSync(paths.diffPath, diff, 'utf-8')

  const allAttachments: TraceAttachment[] = [
    { name: 'approved', path: paths.approvedPath, mime: mimeFor(extension) },
    { name: 'received', path: paths.receivedPath, mime: mimeFor(extension) },
    { name: 'diff', path: paths.diffPath, mime: 'text/plain' },
  ]

  if (shouldApprove) {
    writeFileSync(paths.approvedPath, received, 'utf-8')
    pushTrace(context?.trace, allAttachments, 'pass')
    return
  }

  pushTrace(context?.trace, allAttachments, 'fail')
  throw new Error(`Approval mismatch: ${paths.approvedPath}`)
}

approve.visual = async function visual(
  nameOrOptions: string | VisualApproveOptions,
): Promise<void> {
  const opts = typeof nameOrOptions === 'string'
    ? { name: nameOrOptions }
    : nameOrOptions

  const context = getTestContext()
  const screenshotter = context?.extensions.screenshotter as Screenshotter | undefined

  if (!screenshotter) {
    console.warn(
      `[aver] approve.visual() skipped: no screenshotter extension available. ` +
      `Use a visual protocol (e.g., playwright) for visual approvals.`,
    )
    return
  }

  const state = getTestState()
  const testPath = state?.testPath
  const testName = state?.testName

  if (!testPath || !testName) {
    throw new Error(
      'approve.visual() requires a test runner with expect.getState().',
    )
  }

  const paths = resolveApprovalPaths(testPath, testName, opts.name, 'png')

  mkdirSync(paths.approvalDir, { recursive: true })

  const pendingAttachments = await captureVisual(screenshotter, paths, opts.region)

  const approvedExists = existsSync(paths.approvedImagePath)
  const shouldApprove = process.env.AVER_APPROVE === '1' || process.env.AVER_APPROVE === 'true'

  if (!approvedExists) {
    if (shouldApprove) {
      copyFileSync(paths.receivedImagePath, paths.approvedImagePath)
      pushTrace(context?.trace, [
        { name: 'approved', path: paths.approvedImagePath, mime: 'image/png' },
      ], 'pass')
      return
    }
    pushTrace(context?.trace, [
      ...pendingAttachments,
    ], 'fail')
    throw new Error(
      `Visual approval baseline missing: ${paths.approvedImagePath}\n\n` +
      `Run with AVER_APPROVE=1 to create the baseline:\n` +
      `  AVER_APPROVE=1 npx vitest run <test-file>`,
    )
  }

  // Both images exist — diff them
  const imageDiff = await diffImages(paths)
  const allAttachments = [...pendingAttachments]
  if (imageDiff) allAttachments.push(imageDiff)

  // Check if images match (0 diff pixels)
  const match = await imagesMatch(paths)

  if (match) return

  allAttachments.unshift(
    { name: 'approved', path: paths.approvedImagePath, mime: 'image/png' },
  )

  if (shouldApprove) {
    copyFileSync(paths.receivedImagePath, paths.approvedImagePath)
    pushTrace(context?.trace, allAttachments, 'pass')
    return
  }

  pushTrace(context?.trace, allAttachments, 'fail')
  throw new Error(`Visual approval mismatch: ${paths.approvedImagePath}`)
}

async function imagesMatch(paths: { approvedImagePath: string; receivedImagePath: string }): Promise<boolean> {
  try {
    const { PNG } = await import('pngjs')
    const { default: pixelmatch } = await import('pixelmatch')
    const img1 = PNG.sync.read(readFileSync(paths.approvedImagePath))
    const img2 = PNG.sync.read(readFileSync(paths.receivedImagePath))
    if (img1.width !== img2.width || img1.height !== img2.height) return false
    const diffCount = pixelmatch(img1.data, img2.data, null, img1.width, img1.height, { threshold: 0.1 })
    return diffCount === 0
  } catch {
    return false
  }
}

function copyFileSync(src: string, dest: string): void {
  writeFileSync(dest, readFileSync(src))
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
    default: return 'text/plain'
  }
}
