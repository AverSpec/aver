import type { Protocol, TestCompletion, TraceAttachment, Screenshotter } from '@aver/core'

declare module '@aver/core' {
  interface ProtocolExtensions {
    screenshotter?: Screenshotter
  }
}
import { getTestContext } from '@aver/core'
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
  regions?: Record<string, string>
}

export function playwright(options?: PlaywrightOptions): Protocol<Page> {
  // Track browser-per-page so parallel tests each close their own browser
  const browserForPage = new Map<Page, Browser>()
  const consoleLogs = new WeakMap<Page, string[]>()
  const artifactsDir = options?.artifactsDir ?? join(process.cwd(), 'test-results', 'aver-artifacts')
  const captureScreenshot = options?.captureScreenshot ?? true
  const captureHtml = options?.captureHtml ?? true
  const captureConsole = options?.captureConsole ?? true

  return {
    name: 'playwright',
    async setup(): Promise<Page> {
      const pw = await import('playwright')
      const browserType = options?.browserType ?? 'chromium'
      const browser = await pw[browserType].launch({
        headless: options?.headless ?? true,
      })
      const page = await browser.newPage()
      browserForPage.set(page, browser)
      if (captureConsole) {
        const logs: string[] = []
        consoleLogs.set(page, logs)
        page.on('console', msg => {
          logs.push(`[${msg.type()}] ${msg.text()}`)
        })
      }
      return page
    },
    async teardown(ctx: Page): Promise<void> {
      const browser = browserForPage.get(ctx)
      browserForPage.delete(ctx)
      await browser?.close()
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
      screenshotter: {
        regions: options?.regions ?? {},
        async capture(outputPath, opts) {
          const page = getTestContext()?.protocolContext as Page | undefined
          if (!page) throw new Error('No active page for screenshotter — ensure tests run through the Aver test runner')
          if (opts?.region) {
            const selector = this.regions?.[opts.region]
            if (!selector) throw new Error(`Unknown region "${opts.region}". Available: ${Object.keys(this.regions ?? {}).join(', ')}`)
            await page.locator(selector).screenshot({ path: outputPath })
          } else {
            await page.screenshot({ path: outputPath, fullPage: true })
          }
        },
      } satisfies Screenshotter,
    },
  }
}

function toSafeFileName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'test'
}
