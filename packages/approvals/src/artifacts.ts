import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { Screenshotter, TraceAttachment } from '@aver/core'
import type { ApprovalPaths } from './paths'

export async function captureVisual(
  screenshotter: Screenshotter,
  paths: ApprovalPaths,
  region?: string,
): Promise<TraceAttachment[]> {
  const attachments: TraceAttachment[] = []

  try {
    await screenshotter.capture(paths.receivedImagePath, region ? { region } : undefined)
    attachments.push({ name: 'approval-received', path: paths.receivedImagePath, mime: 'image/png' })
  } catch (e) {
    throw new Error(`Screenshotter capture failed: ${e instanceof Error ? e.message : e}`)
  }

  return attachments
}

export async function diffImages(
  paths: ApprovalPaths,
  threshold = 0.1,
): Promise<TraceAttachment | undefined> {
  if (!existsSync(paths.approvedImagePath) || !existsSync(paths.receivedImagePath)) {
    return undefined
  }

  try {
    const { PNG } = await import('pngjs')
    const { default: pixelmatch } = await import('pixelmatch')

    const img1 = PNG.sync.read(readFileSync(paths.approvedImagePath))
    const img2 = PNG.sync.read(readFileSync(paths.receivedImagePath))
    const width = Math.max(img1.width, img2.width)
    const height = Math.max(img1.height, img2.height)
    const a = padImage(PNG, img1, width, height)
    const b = padImage(PNG, img2, width, height)
    const diff = new PNG({ width, height })
    pixelmatch(a.data, b.data, diff.data, width, height, { threshold })
    writeFileSync(paths.diffImagePath, PNG.sync.write(diff))
    return { name: 'approval-diff', path: paths.diffImagePath, mime: 'image/png' }
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
