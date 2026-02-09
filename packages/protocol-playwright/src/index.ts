import type { Protocol } from 'aver'
import type { Browser, Page } from 'playwright'

export interface PlaywrightOptions {
  headless?: boolean
  browserType?: 'chromium' | 'firefox' | 'webkit'
}

export function playwright(options?: PlaywrightOptions): Protocol<Page> {
  let browser: Browser | undefined

  return {
    name: 'playwright',
    async setup(): Promise<Page> {
      const pw = await import('playwright')
      const browserType = options?.browserType ?? 'chromium'
      browser = await pw[browserType].launch({
        headless: options?.headless ?? true,
      })
      return await browser.newPage()
    },
    async teardown(_ctx: Page): Promise<void> {
      await browser?.close()
      browser = undefined
    },
  }
}

export type PlaywrightProtocol = ReturnType<typeof playwright>
