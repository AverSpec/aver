---
layout: default
title: Test Styles
parent: Guides
nav_order: 10
---

# Test Styles: given/when/then vs act/assert

Aver supports two styles for writing tests. Both are first-class — neither is wrong.
Choose based on who reads the test and what it's expressing.

## The two styles

**given/when/then** — aliases that add narrative structure:

```typescript
test('quantity discount kicks in at 10 items', async ({ given, then }) => {
  await given.addLineItem({ product: 'Widget', quantity: 10, unitPrice: 10.00 })
  await then.discountApplied({ percent: 10 })
  await then.totalEquals({ expected: 97.20 })
})
```

**act/assert** — direct names without narrative framing:

```typescript
test('move task through workflow', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix login bug' })
  await act.moveTask({ title: 'Fix login bug', status: 'in-progress' })
  await assert.taskInStatus({ title: 'Fix login bug', status: 'in-progress' })
})
```

Under the hood, `given` and `when` are both aliases for `act`, and `then` is an alias
for `assert`. You can mix them freely within a test.

## When to prefer given/when/then

- **Multi-step scenarios** where setup, trigger, and verification are distinct phases
- **Stakeholder-readable specs** produced from Example Mapping or BDD workshops
- **Living documentation** — the test name and step labels together tell a story
- **Onboarding** — clearer for developers new to the domain

```typescript
test('new member gets welcome discount on first order', async ({ given, when, then }) => {
  await given.memberSignedUp({ email: 'alice@example.com' })
  await when.placesOrder({ items: [{ sku: 'W-100', qty: 1 }] })
  await then.discountApplied({ percent: 15 })
})
```

## When to prefer act/assert

- **Simple operations** — setup and verification are one step each
- **Developer-facing tests** where narrative framing adds no signal
- **Query-heavy tests** that don't map to a given/when/then arc

```typescript
test('assign task to team member', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix login bug' })
  await act.assignTask({ title: 'Fix login bug', assignee: 'Alice' })
  await assert.taskAssignedTo({ title: 'Fix login bug', assignee: 'Alice' })
})
```

## Mixing styles

Because `given`/`when` are just `act` and `then` is just `assert`, mixing is valid when
it improves clarity:

```typescript
test('checkout flow', async ({ given, when, assert }) => {
  await given.cartHasItems({ count: 3 })
  await when.checkout({ paymentMethod: 'card' })
  await assert.orderConfirmed()
  await assert.cartEmpty()
})
```

## Summary

| Style | Best for |
|-------|----------|
| `given`/`when`/`then` | Multi-step scenarios, stakeholder specs, BDD workflows |
| `act`/`assert` | Simple operations, developer-facing tests |
