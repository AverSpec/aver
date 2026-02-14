import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { diffText } from './diff'
import { resolveSerializer, type SerializerName } from './serializers'
import { getTestContext } from 'aver'
import type { HtmlRenderer, TraceAttachment } from 'aver'

export interface ApproveOptions {
  name?: string
  serializer?: SerializerName
  fileExtension?: string
  normalize?: (value: string) => string
  compare?: (approved: string, received: string) => { equal: boolean; diff?: string } | boolean
  filePath?: string
  testName?: string
}

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

  const approvalDir = join(dirname(testPath), '__approvals__', safeName(testName))
  mkdirSync(approvalDir, { recursive: true })

  const approvalName = safeName(options.name ?? 'approval')
  const approvedPath = join(approvalDir, `${approvalName}.approved.${extension}`)
  const receivedPath = join(approvalDir, `${approvalName}.received.${extension}`)
  const diffPath = join(approvalDir, `${approvalName}.diff.txt`)
  const approvedImagePath = join(approvalDir, `${approvalName}.approved.png`)
  const receivedImagePath = join(approvalDir, `${approvalName}.received.png`)
  const diffImagePath = join(approvalDir, `${approvalName}.diff.png`)

  let received = serializer.serialize(value)
  if (options.normalize) received = options.normalize(received)

  writeFileSync(receivedPath, received, 'utf-8')

  const approvedExists = existsSync(approvedPath)
  const approved = approvedExists ? readFileSync(approvedPath, 'utf-8') : ''

  const context = getTestContext()
  const renderer = context?.extensions['renderer:html'] as HtmlRenderer | undefined
  const pendingAttachments: TraceAttachment[] = []

  // Render HTML screenshots if renderer is available
  if (renderer && serializerName === 'html') {
    if (approvedExists && !existsSync(approvedImagePath)) {
      try {
        const approvedSource = readFileSync(approvedPath, 'utf-8')
        await renderer.render(approvedSource, approvedImagePath)
        pendingAttachments.push({ name: 'approval-approved', path: approvedImagePath, mime: 'image/png' })
      } catch {
        // Ignore render failures.
      }
    }
    try {
      await renderer.render(String(value), receivedImagePath)
      pendingAttachments.push({ name: 'approval-received', path: receivedImagePath, mime: 'image/png' })
    } catch {
      // Ignore render failures.
    }
  }

  const comparison = compareValues(approved, received, options.compare)
  const shouldApprove = process.env.AVER_APPROVE === '1' || process.env.AVER_APPROVE === 'true'

  if (!approvedExists) {
    if (shouldApprove) {
      writeFileSync(approvedPath, received, 'utf-8')
      pushTraceAttachments(context?.trace, [
        { name: 'approved', path: approvedPath, mime: mimeForExtension(extension) },
      ], 'pass')
      return
    }
    writeFileSync(diffPath, 'Baseline missing. Run with AVER_APPROVE=1 to create it.\n', 'utf-8')
    pushTraceAttachments(context?.trace, [
      { name: 'received', path: receivedPath, mime: mimeForExtension(extension) },
      { name: 'diff', path: diffPath, mime: 'text/plain' },
      ...pendingAttachments,
    ], 'fail')
    throw new Error(`Approval baseline missing: ${approvedPath}`)
  }

  if (comparison.equal) {
    return
  }

  const diff = comparison.diff ?? diffText(approved, received)
  writeFileSync(diffPath, diff, 'utf-8')

  // Image diffing if both screenshots exist
  if (renderer && existsSync(approvedImagePath) && existsSync(receivedImagePath)) {
    try {
      const diffAttachment = await diffImages(approvedImagePath, receivedImagePath, diffImagePath)
      if (diffAttachment) pendingAttachments.push(diffAttachment)
    } catch {
      // Ignore image diff failures.
    }
  }

  if (shouldApprove) {
    writeFileSync(approvedPath, received, 'utf-8')
    pushTraceAttachments(context?.trace, [
      { name: 'approved', path: approvedPath, mime: mimeForExtension(extension) },
      { name: 'received', path: receivedPath, mime: mimeForExtension(extension) },
      { name: 'diff', path: diffPath, mime: 'text/plain' },
      ...pendingAttachments,
    ], 'pass')
    return
  }

  pushTraceAttachments(context?.trace, [
    { name: 'approved', path: approvedPath, mime: mimeForExtension(extension) },
    { name: 'received', path: receivedPath, mime: mimeForExtension(extension) },
    { name: 'diff', path: diffPath, mime: 'text/plain' },
    ...pendingAttachments,
  ], 'fail')
  throw new Error(`Approval mismatch: ${approvedPath}`)
}

function pushTraceAttachments(
  trace: TraceAttachment[] | any[] | undefined,
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

async function diffImages(
  approvedPath: string,
  receivedPath: string,
  diffPath: string,
): Promise<TraceAttachment | undefined> {
  try {
    const { PNG } = await import('pngjs')
    const { default: pixelmatch } = await import('pixelmatch')

    const img1 = PNG.sync.read(readFileSync(approvedPath))
    const img2 = PNG.sync.read(readFileSync(receivedPath))
    const width = Math.max(img1.width, img2.width)
    const height = Math.max(img1.height, img2.height)
    const a = padImage(PNG, img1, width, height)
    const b = padImage(PNG, img2, width, height)
    const diff = new PNG({ width, height })
    pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 })
    writeFileSync(diffPath, PNG.sync.write(diff))
    return { name: 'approval-diff', path: diffPath, mime: 'image/png' }
  } catch {
    return undefined
  }
}

function padImage(PNG: any, image: any, width: number, height: number): any {
  if (image.width === width && image.height === height) return image
  const padded = new PNG({ width, height })
  PNG.bitblt(image, padded, 0, 0, image.width, image.height, 0, 0)
  return padded
}

function defaultSerializerFor(value: unknown): SerializerName {
  if (value && typeof value === 'object') return 'json'
  return 'text'
}

function safeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'approval'
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

function compareValues(
  approved: string,
  received: string,
  compare?: ApproveOptions['compare'],
): { equal: boolean; diff?: string } {
  if (!compare) return { equal: approved === received }
  const result = compare(approved, received)
  if (typeof result === 'boolean') return { equal: result }
  return { equal: result.equal, diff: result.diff }
}

function mimeForExtension(ext: string): string {
  switch (ext) {
    case 'json':
      return 'application/json'
    case 'html':
      return 'text/html'
    case 'txt':
    default:
      return 'text/plain'
  }
}
