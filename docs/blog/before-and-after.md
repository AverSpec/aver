---
layout: default
title: "The Testing Pyramid's Dirty Secret"
parent: Blog
nav_order: 2
---

# The Testing Pyramid's Dirty Secret: Nobody Has One Source of Truth

*Nate Jackson*

## The Pile

Open any project with more than a year of development behind it. Look at the test directory. What do you see?

```
tests/
  unit/
    user.test.ts
    order.test.ts
    payment.test.ts
  integration/
    api/
      user-routes.test.ts
      order-routes.test.ts
  e2e/
    checkout.spec.ts
    signup.spec.ts
```

Three directories. Three test styles. Three separate answers to the question "what does this system do?"

The unit tests describe behavior in terms of classes and functions. The integration tests describe it in terms of HTTP endpoints. The E2E tests describe it in terms of UI workflows. Each level has its own helpers, its own setup patterns, its own way of saying "create a user."

When you want to know what the system does, you don't look at the tests. You look at the code. The tests are supposed to be the specification, but they're actually three loosely related codebases that happen to exercise the same product.

## The Pyramid Doesn't Help

The testing pyramid is advice about *how many* tests to write at each level. It says nothing about how to organize them, how to share vocabulary between levels, or how to ensure the levels agree on what correct behavior looks like.

So teams do what's natural: they organize by level. Unit tests here, integration tests there, E2E tests over there. Each level develops its own conventions independently. And over time, those conventions drift.

The unit test for "create order" initializes a `OrderService` with a mock database and calls `createOrder()`. The integration test hits `POST /api/orders` with a JSON body. The E2E test fills out a form and clicks "Submit." These are three descriptions of the same behavior, but they share nothing — not the setup, not the assertions, not even the vocabulary.

When a product requirement changes — say, orders now require a shipping address — you update the unit test, update the API test, and maybe remember to update the E2E test. Each level has its own idea of what "create order" means, and keeping them in sync is manual labor that nobody budgets for.

## Page Objects and Helpers: Accidental Domain Languages

Every sufficiently complex test suite eventually builds a domain language. You've seen it happen:

- The Playwright suite grows to forty tests and someone extracts a `CheckoutPage` page object.
- The API tests start sharing setup and someone builds `createTestUser()` and `createTestOrder()` helpers.
- The unit tests get a `TestDataFactory` for building entities.

These are all the same impulse: name the operations, hide the mechanics, write tests in terms of what the system does instead of how it's implemented.

But each level builds its own vocabulary independently. The page object says `checkoutPage.addItem()`. The API helper says `postItem()`. The unit factory says `builder.withItem()`. Three names for the same domain operation, none of them aware the others exist.

This is the accidental domain language. It emerges organically, serves its level well, and creates invisible drift between levels.

## Cucumber Gets Close

Cucumber saw this problem. Gherkin gives you a shared language:

```gherkin
Given a user has items in their cart
When they proceed to checkout
Then an order should be created
```

One specification, readable by everyone. The step definitions provide the glue between the language and the implementation.

But the execution model still lives per-level. Your Gherkin steps for the E2E suite use Playwright. Your steps for the API suite use HTTP calls. Your steps for the unit suite call functions directly. Three sets of step definitions, three implementations, same divergence problem — just with a shared syntax on top.

Serenity JS improves on this with the Screenplay pattern, which separates *what* actors do from *how* they do it. It's the closest prior art to what I wanted. But the TypeScript experience is bolted on top of Java-heritage patterns, the abstraction layers are heavy, and it's designed for a different ecosystem.

The core insight — that *what* and *how* should be separate — is right. The execution was wrong for my context.

## What I Wanted

I wanted a framework where:

1. **One vocabulary** describes what the system does. Not per-level, not per-runner. One definition of "create order" that applies everywhere.

2. **Multiple adapters** bind that vocabulary to different levels. The unit adapter calls functions. The HTTP adapter makes requests. The browser adapter clicks buttons. Same operations, different mechanics.

3. **The same test runs everywhere.** Write the test once in domain language. Run it against any adapter. When two adapters disagree on behavior, that's a real bug at a real boundary — not a flaky test.

4. **The compiler enforces completeness.** Add an action to the domain, forget to implement it in an adapter, get a type error. No missing coverage, no drift.

## Before and After

**Before:** Three test files, three vocabularies, three implementations of "create and assign a task."

```typescript
// Unit test
test('assign task', () => {
  const board = new Board()
  board.create('Fix bug')
  board.assign('Fix bug', 'alice')
  expect(board.get('Fix bug').assignee).toBe('alice')
})

// API test
test('assign task via API', async () => {
  await request(app).post('/tasks').send({ title: 'Fix bug' })
  await request(app).patch('/tasks/Fix bug').send({ assignee: 'alice' })
  const res = await request(app).get('/tasks/Fix bug')
  expect(res.body.assignee).toBe('alice')
})

// E2E test
test('assign task in UI', async ({ page }) => {
  await page.fill('[data-test=new-task]', 'Fix bug')
  await page.click('[data-test=create]')
  await page.click('[data-test=task-Fix-bug] >> [data-test=assign]')
  await page.selectOption('[data-test=assignee]', 'alice')
  await expect(page.locator('[data-test=task-Fix-bug]')).toContainText('alice')
})
```

**After:** One test, three adapters.

```typescript
const { test } = suite(taskBoard)

test('assign task to team member', async ({ given, when, then }) => {
  await given.createTask({ title: 'Fix bug' })
  await when.assignTask({ title: 'Fix bug', assignee: 'alice' })
  await then.taskAssignedTo({ title: 'Fix bug', assignee: 'alice' })
})
```

```
✓ assign task to team member [unit]          1ms
✓ assign task to team member [http]         12ms
✓ assign task to team member [playwright]  280ms
```

The domain definition (`createTask`, `assignTask`, `taskAssignedTo`) is the single source of truth. The adapters implement it for each level. The test doesn't know or care which adapter it's running against.

## The Economics

The vocabulary grows with your domain's surface area — slowly. Five actions, three queries, four assertions for a task board. That's stable.

The tests grow with scenarios — fast. Create, assign, move, delete, lifecycle, edge cases. Each test is a composition of domain operations.

The adapter investment is per-level, amortized across every test. Write one unit adapter, one HTTP adapter, one browser adapter. Every test runs against all of them.

With a single adapter, the overhead matches well-structured page objects — you'd extract those helpers anyway. The payoff starts at the second adapter and compounds from there.

## What This Isn't

This isn't a replacement for unit testing. If you're testing a pure function or an isolated module, a plain test is simpler and faster. Aver is for behavior-level verification — the things your product actually promises to users.

This isn't a BDD framework that requires business stakeholders to write Gherkin. The vocabulary is TypeScript. The audience is your engineering team. The benefit is structural, not ceremonial.

And this isn't vaporware. It's [published](https://www.npmjs.com/package/@averspec/core), [documented](https://averspec.dev), and the [example app](https://github.com/averspec/aver/tree/main/examples/task-board) demonstrates the full pattern with a React + Express task board tested across all three levels.

```bash
npm install --save-dev @averspec/core vitest
npx aver init
npx aver run
```

One source of truth. Every level. No drift.
