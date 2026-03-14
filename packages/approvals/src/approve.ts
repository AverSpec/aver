import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { compareValues, generateDiff } from './compare'
import { resolveSerializer, type SerializerName } from './serializers'
import { resolveApprovalPaths } from './paths'
import { captureVisual, diffImages } from './artifacts'
import { getTestContext } from '@aver/core'
import type { TraceAttachment } from '@aver/core'
import type { ApproveOptions, Scrubber, VisualApproveOptions } from './types'

export async function approve(value: unknown, options: ApproveOptions = {}): Promise<void> {
  const context = getTestContext()
  const testPath = options.filePath ?? context?.testPath
  const testName = options.testName ?? context?.testName

  if (!testPath || !testName) {
    throw new Error(
      'approve() could not determine test file path. Pass explicit filePath/testName options or ensure tests run through the Aver test runner.',
    )
  }

  const serializerName = options.serializer ?? defaultSerializerFor(value)
  const serializer = resolveSerializer(serializerName)
  const extension = options.fileExtension ?? serializer.fileExtension
  const paths = resolveApprovalPaths(testPath, testName, options.name ?? 'approval', extension)

  mkdirSync(paths.approvalDir, { recursive: true })

  const raw = serializer.serialize(value)
  const received = options.scrub ? applyScrubber(raw, options.scrub) : raw
  writeFileSync(paths.receivedPath, received, 'utf-8')

  const approvedExists = existsSync(paths.approvedPath)
  const approved = approvedExists ? readFileSync(paths.approvedPath, 'utf-8') : ''

  const comparison = compareValues(approved, received, {
    comparator: options.comparator,
    serializer,
  })
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

  if (comparison.equal) {
    deleteIfExists(paths.receivedPath)
    return
  }

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
  const screenshotter = context?.extensions.screenshotter

  if (!screenshotter) {
    throw new Error(
      `approve.visual() requires a screenshotter extension. ` +
      `Use a visual protocol (e.g., playwright) for visual approvals.`,
    )
  }

  const testPath = opts.filePath ?? context?.testPath
  const testName = opts.testName ?? context?.testName

  if (!testPath || !testName) {
    throw new Error(
      'approve.visual() could not determine test file path. Pass explicit filePath/testName options or ensure tests run through the Aver test runner.',
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

  // Both images exist — check match first (byte-identical fast path)
  const pixelThreshold = opts.threshold ?? 0.1
  const match = await imagesMatch(paths, pixelThreshold)

  if (match) {
    deleteIfExists(paths.receivedImagePath)
    return
  }

  // Mismatch — generate diff image for diagnostics
  const imageDiff = await diffImages(paths, pixelThreshold)
  const allAttachments = [...pendingAttachments]
  if (imageDiff) allAttachments.push(imageDiff)

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

async function imagesMatch(
  paths: { approvedImagePath: string; receivedImagePath: string },
  threshold = 0.1,
): Promise<boolean> {
  // Fast path: byte-identical files always match
  const approved = readFileSync(paths.approvedImagePath)
  const received = readFileSync(paths.receivedImagePath)
  if (approved.equals(received)) return true

  // Pixel-level comparison with tolerance for subpixel rendering jitter
  try {
    const { PNG } = await import('pngjs')
    const { default: pixelmatch } = await import('pixelmatch')
    const img1 = PNG.sync.read(approved)
    const img2 = PNG.sync.read(received)
    if (img1.width !== img2.width || img1.height !== img2.height) return false
    const totalPixels = img1.width * img1.height
    const diffCount = pixelmatch(img1.data, img2.data, null, img1.width, img1.height, { threshold })
    // Allow up to 0.1% of pixels to differ (subpixel anti-aliasing)
    return diffCount / totalPixels < 0.001
  } catch {
    // pngjs/pixelmatch not available — files aren't byte-identical so report mismatch
    return false
  }
}

function copyFileSync(src: string, dest: string): void {
  writeFileSync(dest, readFileSync(src))
}

function deleteIfExists(filePath: string): void {
  if (existsSync(filePath)) {
    rmSync(filePath)
  }
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

function applyScrubber(text: string, scrub: Scrubber): string {
  if (typeof scrub === 'function') return scrub(text)
  return scrub.reduce((t, rule) => t.replace(rule.pattern, rule.replacement), text)
}

function defaultSerializerFor(value: unknown): SerializerName {
  if (value && typeof value === 'object') return 'json'
  return 'text'
}

function mimeFor(ext: string): string {
  switch (ext) {
    case 'json': return 'application/json'
    default: return 'text/plain'
  }
}
