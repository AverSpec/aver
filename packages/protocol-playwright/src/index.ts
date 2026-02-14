import type { Protocol, TestCompletion, TraceAttachment, HtmlRenderer } from 'aver'
import type { Browser, Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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
      await approvalBrowser?.close()
      approvalBrowser = undefined
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
    extensions: {
      'renderer:html': {
        async render(html, outputPath) {
          if (!approvalBrowser) {
            const pw = await import('playwright')
            approvalBrowser = await pw.chromium.launch({ headless: true })
          }
          const page = await approvalBrowser.newPage()
          await page.setContent(html, { waitUntil: 'load' })
          await page.setViewportSize({ width: 1280, height: 720 })
          await page.screenshot({ path: outputPath, fullPage: true })
          await page.close()
        },
      } satisfies HtmlRenderer,
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
