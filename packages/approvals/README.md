# @averspec/approvals

> **Status: Early release.** API is stabilizing. Breaking changes will be noted in release notes.

Approval testing for [Aver](../../README.md) — structural diffs and visual regression.

## Install

```bash
npm install @averspec/approvals
```

Requires `@averspec/core` as a peer dependency.

## Usage

### Structural Approvals

Use `approve(value)` to compare text or JSON output against a saved baseline. On first run, set `AVER_APPROVE=1` to create the baseline file.

```typescript
import { approve } from '@averspec/approvals'

// In an assertion handler:
async function cartMatchesApproval(ctx) {
  const cart = await ctx.getCart()
  await approve(cart) // compares against saved .approved file
}
```

Objects are serialized as JSON; strings are compared as plain text. When the received value differs from the approved baseline, the test fails with a diff showing exactly what changed.

### Visual Approvals

Use `approve.visual('name')` for screenshot-based pixel comparison. This requires a protocol with screenshotter support (e.g., `@averspec/protocol-playwright`).

```typescript
import { approve } from '@averspec/approvals'

// In an assertion handler (with a visual protocol):
async function pageMatchesBaseline(ctx) {
  await approve.visual('checkout-page')
}
```

Visual approvals capture a screenshot, compare it pixel-by-pixel against the baseline, and allow a small tolerance for subpixel rendering differences.

To create or update baselines for either mode:

```bash
AVER_APPROVE=1 npx aver run <test-file>
```

## License

[MIT](../../LICENSE)
