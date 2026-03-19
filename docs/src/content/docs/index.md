---
title: "Aver"
description: Domain-driven acceptance testing for TypeScript.
tableOfContents: false
hero:
  tagline: Know your system works.
  actions:
    - text: Get Started
      link: /guides/getting-started/
      icon: right-arrow
    - text: Tutorial
      link: /tutorial/
      variant: minimal
    - text: GitHub
      link: https://github.com/averspec/aver
      variant: minimal
      icon: external
---

Every project of sufficient complexity eventually builds a domain language for its tests. Aver gives that language a home in the type system.

## What it looks like

Three test files, three vocabularies, same behavior:

```typescript
// Unit test
test('create task', () => {
  board.create('Fix bug')
  expect(board.get('Fix bug').status).toBe('backlog')
})

// API test
test('create task', async () => {
  await request(app).post('/tasks').send({ title: 'Fix bug' })
  const res = await request(app).get('/tasks/Fix bug')
  expect(res.body.status).toBe('backlog')
})

// Browser test
test('create task', async ({ page }) => {
  await page.fill('[data-test=new-task]', 'Fix bug')
  await page.click('[data-test=create]')
  await expect(page.locator('[data-test=task-Fix-bug]')).toBeVisible()
})
```

One test, every level:

```typescript
const { test } = suite(taskBoard)

test('create a task in backlog', async ({ when, then }) => {
  await when.createTask({ title: 'Fix bug' })
  await then.taskInStatus({ title: 'Fix bug', status: 'backlog' })
})
```

```
 ✓ create a task in backlog [unit]          3ms
 ✓ create a task in backlog [http]         48ms
 ✓ create a task in backlog [playwright]  890ms
```

Working on business logic? `aver run --adapter unit`. Touching the API layer? `--adapter http`. Need full confidence before deploy? `--adapter playwright`. Same test, right feedback loop for the layer you're in. How fast the unit adapter runs depends on your design — nullables and dependency injection eliminate IO entirely; a real database keeps fidelity at the cost of speed. Either way, it's a fraction of the browser.

---

## Why Aver

- **Right feedback loop, every layer** — Same test runs at unit speed during development, HTTP for API contracts, Playwright for full confidence. Pick the level that matches the work.
- **Lock in what exists** — `approve()` captures current behavior as a baseline. Refactor underneath with confidence.
- **Prove your system is observable** — Declare expected telemetry alongside domain operations. Verify spans, attributes, and causal connections in the same test that checks behavior.
- **Zero runtime dependencies** — Core has no deps. Add protocols as you need them.

---

## Quick start

```bash
npm install --save-dev @averspec/core vitest
npx aver init
npx aver run
```

Or follow a tutorial: [legacy code](/tutorial/), [greenfield](/tutorial-greenfield/), or [telemetry verification](/tutorial-telemetry/).

---

## When Aver is NOT the right tool

- You only need unit tests for a pure function — plain Vitest is simpler
- It's a prototype or throwaway — the domain layer pays off over time, not day one
- Trivial CRUD with no business rules — if the vocabulary mirrors the schema, there's nothing to abstract

[Read more about when to use Aver →](/guides/troubleshooting/)

---

Aver tests itself using the same domain-driven architecture it provides. [See the test suite](https://github.com/averspec/aver).

[Why this exists](/articles/introducing-aver/) · [Architecture](/architecture/) · [Example app](https://github.com/averspec/aver/tree/main/examples/task-board)
