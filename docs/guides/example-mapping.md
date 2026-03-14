---
layout: default
title: Example Mapping
parent: Guides
nav_order: 4
---

# Example Mapping

Example Mapping is a structured conversation technique created by Matt Wynne. A small group spends 25 minutes around a story, discovering what they actually need to build before writing any code. The output is shared understanding, not software.

The technique uses four card types:

- **Story** (yellow): The feature or scenario under discussion.
- **Rule** (blue): A business constraint or invariant. Rules are the "laws" of the domain.
- **Example** (green): A concrete given/when/then that proves a rule holds. Each example lives under exactly one rule.
- **Question** (red): An unresolved ambiguity. Questions are captured immediately rather than guessed at.

Rules tell you what the system must do. Examples show you what it looks like in practice. Questions tell you what you do not yet know.

A well-mapped story has a handful of rules, two or three examples per rule, and few questions. If you finish a session with more questions than examples, the story needs more research before it is ready to build.

## When to use it

Run an Example Mapping session when:

- You are about to implement a new feature and want to uncover hidden complexity before writing code.
- A large story needs splitting during refinement.
- Characterization tests reveal surprising behavior you cannot explain.
- The team disagrees about how something should work.

If you have already completed the [Tutorial](../tutorial), you saw how characterization tests expose implicit rules in legacy code. Example Mapping is the complementary technique: it discovers rules through conversation before any code exists.

## Running a session

**Timebox to 25 minutes.** Discuss one scenario at a time. Keep the group small -- a developer, a tester, and a product person is the classic trio.

1. Read the story aloud so everyone starts from the same context.
2. Extract rules first. Ask "what constraints govern this behavior?" and write each rule on a blue card. Rules are phrased as invariants: "orders with 10 or more items receive a 10% discount."
3. Generate examples per rule. For each rule, ask "can you give me a concrete case?" Write each example on a green card beneath its rule. Good examples include both the happy path and boundary conditions.
4. Capture questions immediately. If anyone says "it depends" or "I'm not sure," write a red card. Do not guess. Questions are valuable -- they prevent you from building the wrong thing.

When the timer runs out, count your cards. The ratio of colors tells you whether the story is ready.

**Stop signals** that indicate the session needs a different approach:

- **More than 8 rules**: the scenario is too broad. Split it into smaller stories and map each one separately.
- **More questions than examples**: you need more investigation before mapping. Schedule a spike or research task, then reconvene.
- **Contradicting rules**: you likely have two scenarios disguised as one. Separate them and map each independently.
- **Everyone agrees instantly**: the story may be well-understood enough to skip straight to implementation. Not every feature needs a mapping session.

## Worked example: invoice discount calculation

This example uses the invoice pricing domain from the [Tutorial](../tutorial). Imagine a session where three people sit down to map the discount calculation feature.

**Story**: Invoice discount calculation

Someone reads the story aloud: "As a billing clerk, I need invoices to apply quantity-based discounts so that large orders receive the correct pricing." The group then discovers the following rules, examples, and questions:

| Card type | Content |
|-----------|---------|
| Rule 1 | Orders with 10 or more total items receive a 10% discount |
| Example 1a | 9 items at $10 each -- no discount, subtotal $90 |
| Example 1b | 10 items at $10 each -- 10% off, total after discount $90 |
| Rule 2 | Orders with 50 or more total items receive a 20% discount |
| Example 2a | 49 items at $10 each -- 10% discount (not 20%), total after discount $441 |
| Example 2b | 50 items at $10 each -- 20% off, total after discount $400 |
| Rule 3 | Only the highest applicable discount tier applies (they do not stack) |
| Example 3a | 50 items -- 20% discount only, not 10% + 20% |
| Rule 4 | Discounts apply to the subtotal before tax |
| Example 4a | 10 items at $10 = $100 subtotal, 10% discount = $90, then 8% tax on $90 = $97.20 |
| Question 1 | Do discount tiers apply per-product or across the entire order? |
| Question 2 | Should bulk orders from the same customer across multiple invoices accumulate toward a tier? |

Notice how the two questions expose real ambiguity. The team cannot answer them by staring at code. They need a product decision first.

The session produced 4 rules, 6 examples, and 2 questions. That is a healthy ratio -- enough examples to be confident in the rules, and few enough questions that the story is ready to implement (minus the two open items).

## From cards to Aver artifacts

The mapping session is complete. Now translate the cards into code.

Each card type maps to an Aver concept:

| Card | Aver artifact |
|------|---------------|
| Rules | Domain assertions and business logic constraints |
| Examples | Test cases using `given`/`when`/`then` |
| Questions | Backlog items or open issues -- do not implement these yet |

The story card itself does not map to a specific artifact. It is the context that holds everything together -- the name you give to the test file or the domain module.

Take Rule 1's two examples and write them as Aver tests. The domain and adapter from the [Tutorial](../tutorial) already support these:

```typescript
import { suite } from '@averspec/core'
import { pricing } from '../domains/pricing.js'

const { test } = suite(pricing)

test('no discount below threshold', async ({ given, then }) => {
  await given.addLineItem({ product: 'Widget', quantity: 9, unitPrice: 10 })
  await then.noDiscount()
})

test('10% discount at threshold', async ({ given, then }) => {
  await given.addLineItem({ product: 'Widget', quantity: 10, unitPrice: 10 })
  await then.discountApplied({ percent: 10 })
})
```

Rule 3's example becomes a test that verifies stacking does not occur:

```typescript
test('highest tier wins, discounts do not stack', async ({ given, then }) => {
  await given.addLineItem({ product: 'Widget', quantity: 50, unitPrice: 10 })
  await then.discountApplied({ percent: 20 })
  await then.totalEquals({ expected: 432.00 }) // 500 * 0.8 * 1.08
})
```

Rule 4's example becomes a test that pins the tax-after-discount ordering:

```typescript
test('tax applied after discount', async ({ given, then }) => {
  await given.addLineItem({ product: 'Widget', quantity: 10, unitPrice: 10 })
  await then.discountApplied({ percent: 10 })
  await then.totalEquals({ expected: 97.20 }) // 100 * 0.9 * 1.08
})
```

The two questions do not become tests. They become backlog items or conversation topics for the next session. You do not write code for things you do not yet understand.

The key insight: **rules become the domain's assertions, examples become test cases, and questions become items you do not implement yet.**

Every green card on the table is a test waiting to be written. Every red card is a test you must not write until the ambiguity is resolved. This discipline prevents speculative code -- you only implement what the team has agreed on.

When Question 1 ("per-product or per-order?") gets answered, it will generate a new rule and new examples. Those become additional tests. The domain vocabulary may need a new assertion or action to express the resolved ambiguity. This is the natural cycle: map, implement, learn, map again.

## Tips for effective sessions

- **Name your rules carefully.** A rule like "discounts exist" is too vague. "Orders with 10 or more total items receive a 10% discount" is specific enough to generate examples from.
- **Use boundary values in examples.** The difference between 9 items and 10 items is where bugs hide. Always include the value just below and at the threshold.
- **Keep cards physical if possible.** Index cards or sticky notes on a table create a spatial layout that everyone can rearrange and discuss. Digital tools work, but the tactile element helps.
- **Photograph the board.** After the session, take a picture before cleaning up. The spatial arrangement of cards often captures relationships that a flat list does not.

## Next steps

- Build the domain vocabulary from your mapped scenarios: [Tutorial](../tutorial)
- Learn how AI skills can help facilitate mapping sessions: [AI-Assisted Testing](ai-assisted)
