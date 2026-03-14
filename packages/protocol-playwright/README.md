# @averspec/protocol-playwright

> **Status: Stable** — API surface is locked for 0.x releases.

Playwright browser protocol for [Aver](../../README.md) acceptance testing. Manages browser lifecycle and provides a Playwright `Page` as the adapter context.

## Install

```bash
npm install @averspec/protocol-playwright playwright
npx playwright install chromium
```

## Usage

```typescript
import { adapt } from '@averspec/core'
import { playwright } from '@averspec/protocol-playwright'
import { cart } from './domains/cart'

export const playwrightAdapter = adapt(cart, {
  protocol: playwright(),
  actions: {
    addItem: async (page, { name }) => {
      await page.getByLabel('Item name').fill(name)
      await page.getByRole('button', { name: 'Add' }).click()
    },
  },
  assertions: {
    hasItems: async (page, { count }) => {
      await expect(page.getByTestId('cart-item')).toHaveCount(count)
    },
  },
})
```

The `playwright()` protocol launches a single browser on the first `setup()` call and reuses it for subsequent calls. Each test gets a fresh, isolated page. The browser is closed automatically after the last page is torn down.

On test failure, it captures:
- a screenshot
- the current page HTML
- console logs (if any)

Artifacts are written to `test-results/aver-artifacts/<domain>/<protocol>/<test>/` by default. Customize with:

```typescript
playwright({
  artifactsDir: './test-results/aver-artifacts',
  captureScreenshot: true,
  captureHtml: true,
  captureConsole: true,
})
```

### Visual Approval Testing

The Playwright protocol provides a `screenshotter` extension for visual approval testing via `@averspec/approvals`. Use `approve.visual()` in your tests to capture and compare screenshots:

```typescript
import { approve } from '@averspec/approvals'

await approve.visual('board-state')                          // full page
await approve.visual({ name: 'backlog', region: 'backlog' }) // scoped region
```

## License

[MIT](../../LICENSE)
