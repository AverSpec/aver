import type { Protocol, TestCompletion, TraceAttachment } from 'aver'
import type { Browser, Page } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

export interface PlaywrightOptions {
  headless?: boolean
  browserType?: 'chromium' | 'firefox' | 'webkit'
  artifactsDir?: string
  captureScreenshot?: boolean
  captureHtml?: boolean
  captureConsole?: boolean
}

export function playwright(options?: PlaywrightOptions): Protocol<Page> {
  let browser: Browser | undefined
  const consoleLogs = new WeakMap<Page, string[]>()
  const artifactsDir = options?.artifactsDir ?? join(process.cwd(), 'test-results', 'aver-artifacts')
  const captureScreenshot = options?.captureScreenshot ?? true
  const captureHtml = options?.captureHtml ?? true
  const captureConsole = options?.captureConsole ?? true
  let approvalBrowser: Browser | undefined

  return {
    name: 'playwright',
    async setup(): Promise<Page> {
      const pw = await import('playwright')
      const browserType = options?.browserType ?? 'chromium'
      browser = await pw[browserType].launch({
        headless: options?.headless ?? true,
      })
      const page = await browser.newPage()
      if (captureConsole) {
        const logs: string[] = []
        consoleLogs.set(page, logs)
        page.on('console', msg => {
          logs.push(`[${msg.type()}] ${msg.text()}`)
        })
      }
      return page
    },
    async teardown(_ctx: Page): Promise<void> {
      await browser?.close()
      browser = undefined
    },
  async onTestFail(ctx: Page, meta: TestCompletion): Promise<TraceAttachment[]> {
    const attachments: TraceAttachment[] = []
      const safeDomain = toSafeFileName(meta.domainName)
      const safeProtocol = toSafeFileName(meta.protocolName)
      const safeTest = toSafeFileName(meta.testName)
      const testDir = join(artifactsDir, safeDomain, safeProtocol, safeTest)
      mkdirSync(testDir, { recursive: true })

      if (captureScreenshot) {
        const screenshotPath = join(testDir, 'screenshot.png')
        await ctx.screenshot({ path: screenshotPath, fullPage: true })
        attachments.push({ name: 'screenshot', path: screenshotPath, mime: 'image/png' })
      }

      if (captureHtml) {
        const htmlPath = join(testDir, 'page.html')
        const html = await ctx.content()
        writeFileSync(htmlPath, html, 'utf-8')
        attachments.push({ name: 'page-html', path: htmlPath, mime: 'text/html' })
      }

      if (captureConsole) {
        const logs = consoleLogs.get(ctx) ?? []
        if (logs.length > 0) {
          const logPath = join(testDir, 'console.log')
          writeFileSync(logPath, logs.join('\n') + '\n', 'utf-8')
          attachments.push({ name: 'console-log', path: logPath, mime: 'text/plain' })
        }
      }

      return attachments
    },
    approvalArtifacts: {
      canHandle: ({ serializer }) => serializer === 'html',
      render: async ({ value, imagePath, kind }) => {
        if (kind !== 'approved' && kind !== 'received') return []
        const html = String(value)
        if (!approvalBrowser) {
          const pw = await import('playwright')
          approvalBrowser = await pw.chromium.launch({ headless: true })
        }
        const page = await approvalBrowser.newPage()
        await page.setContent(html, { waitUntil: 'load' })
        await page.setViewportSize({ width: 1280, height: 720 })
        await page.screenshot({ path: imagePath, fullPage: true })
        await page.close()
        return [{ name: `approval-${kind}`, path: imagePath, mime: 'image/png' }]
      },
      diff: async ({ approvedImagePath, receivedImagePath, diffImagePath }) => {
        const img1 = PNG.sync.read(readFileSync(approvedImagePath))
        const img2 = PNG.sync.read(readFileSync(receivedImagePath))
        const width = Math.max(img1.width, img2.width)
        const height = Math.max(img1.height, img2.height)
        const a = padImage(img1, width, height)
        const b = padImage(img2, width, height)
        const diff = new PNG({ width, height })
        pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 })
        writeFileSync(diffImagePath, PNG.sync.write(diff))
        return [{ name: 'approval-diff', path: diffImagePath, mime: 'image/png' }]
      },
    },
  }
}

export type PlaywrightProtocol = ReturnType<typeof playwright>

function toSafeFileName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'test'
}

function padImage(image: PNG, width: number, height: number): PNG {
  if (image.width === width && image.height === height) return image
  const padded = new PNG({ width, height })
  PNG.bitblt(image, padded, 0, 0, image.width, image.height, 0, 0)
  return padded
}
