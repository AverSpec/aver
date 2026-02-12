# @aver/protocol-playwright

Playwright browser protocol for [Aver](../../README.md) acceptance testing. Manages browser lifecycle and provides a Playwright `Page` as the adapter context.

## Install

```bash
npm install @aver/protocol-playwright
npx playwright install chromium
```

## Usage

```typescript
import { implement } from 'aver'
import { playwright } from '@aver/protocol-playwright'
import { cart } from './domains/cart'

export const playwrightAdapter = implement(cart, {
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

The `playwright()` protocol launches a browser on first use and creates a fresh page per test.

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

## License

[MIT](../../LICENSE)
