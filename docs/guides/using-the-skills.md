---
layout: default
title: Using the Skills
parent: Guides
nav_order: 7
---

# Using the Skills

## What are Aver skills?

The `@aver/skills` package provides methodology skills for AI agents working with Aver. Each skill is a structured workflow that guides the agent through a phase of acceptance testing. Install it as a Claude Code skill plugin:

```bash
npm install --save-dev @aver/skills
```

Once installed, the skills are available to the agent as methodology references. You do not import them in your code or call them as functions. The agent reads the relevant skill file when it enters a phase, absorbs the process and constraints, and applies them to your codebase.

Skills are methodology guides, not code libraries. They teach the agent *how to approach* each phase of the acceptance testing process. There are five skills, each covering a distinct phase: investigation, characterization, scenario mapping, specification, and implementation.

The agent reads the relevant skill when entering a phase, then follows its process, anti-patterns, and output criteria. You stay in the driver's seat -- the agent does the heavy lifting while you make the judgment calls about business intent.

Each skill defines clear output criteria so the agent knows when a phase is complete. It also lists anti-patterns -- common mistakes that derail the process. The agent uses these guardrails to stay on track without constant supervision.

Without skills, agents tend to jump straight to writing code. They skip the investigation that reveals hidden constraints, skip the mapping conversation that surfaces ambiguity, and produce tests that assert implementation details rather than business behavior. Skills enforce the discipline that makes acceptance testing work: understand first, agree on intent second, implement last.

You do not need to tell the agent which skill to use. Describe what you want to accomplish -- "characterize this function," "let's map the discount rules," "implement the invoice domain" -- and the agent selects the appropriate skill. The example prompts below show natural ways to trigger each phase.

You can also be explicit: "Use the investigation skill to explore the auth module" works just as well. The agent will read that skill and follow its process.

## The five skills

### Investigation

Explore existing code to find seams, trace execution paths, and build understanding of a system before testing it.

**When to use:**
- Legacy code with unknown or undocumented behavior
- You need to understand a module before writing tests for it
- You want to find where tests can attach without modifying source code

**What it produces:** Documented execution paths, identified seams (function boundaries, injection points, API boundaries), noted constraints, and confidence-rated findings. Each finding is rated as confirmed (directly evident in code), inferred (pattern-based reasoning), or speculative (partial evidence, needs your verification).

**Example prompt:**
> Investigate the payment processing module. Find seams where we can attach tests and trace the checkout flow from route handler to database write.

A seam is any point where you can observe or intercept behavior without modifying source code. The investigation skill teaches the agent to look for function boundaries, constructor injection points, config-driven behavior, middleware hooks, API boundaries, and rendering output. The agent starts from the observed behavior and traces inward, marking each boundary where isolated testing is possible.

### Characterization

Lock in current behavior with tests that capture what the system actually does -- the safety net before making changes.

**When to use:**
- Code needs modification but has no tests
- After investigation has identified seams to test through
- You want approval baselines capturing exact current output

**What it produces:** Characterization tests that pass immediately against existing code, approval baselines capturing current behavior, and domain vocabulary candidates extracted from the code.

The key discipline: characterization captures what the system *does*, not what you wish it did. Tests must pass immediately -- if they fail, the test or adapter is wrong, not the application code. Do not change application code during characterization. These baselines become evidence for the mapping session that follows, where you and the agent decide which behaviors are intentional and which are bugs.

**Example prompt:**
> Characterize the calculateInvoice function. Capture its current output for normal orders, discounted orders, and empty carts using approval tests.

### Scenario Mapping

Facilitate an Example Mapping session -- extract rules, examples, and questions from a scenario through structured conversation.

**When to use:**
- Characterized code needs decomposition into testable pieces
- Planning a new feature and need to surface business constraints
- Stakeholders disagree about expected behavior

**What it produces:** Rules (business constraints in domain language), examples (concrete given/when/then scenarios proving each rule), and questions (unresolved ambiguities that need human judgment).

Rules are written in business language, not code language. "A task must have a title" is a rule. "Title validation in TaskService.create()" is an implementation detail. The agent proposes rules with confidence ratings and presents uncertain items first -- those shape the conversation. Each rule gets at least two examples: one satisfying, one violating. Questions capture anything ambiguous -- the agent records them rather than guessing, and waits for your answer before proceeding.

**Example prompt:**
> Let's map the discount calculation scenarios. What rules govern how discounts are applied? I know there are tier-based discounts and promotional codes -- let's surface all the constraints.

### Specification

Name domain vocabulary from mapped scenarios -- actions, queries, and assertions that become the shared language between tests and adapters.

**When to use:**
- Scenarios are mapped with confirmed rules and examples
- Ready to design the domain vocabulary before writing code
- Need human sign-off on operation names

**What it produces:** Proposed vocabulary names (actions, queries, assertions) derived from the examples, adapter interface shapes showing handler signatures, and a human-confirmed domain design ready for implementation.

Names are derived from the examples. Given/when parts become actions (verb + noun: `createTask`, `applyDiscount`). Then parts become assertions (predicates: `taskExists`, `hasValidationError`) or queries (`getOrderTotal`, `getTaskCount`). The agent proposes names and waits for your explicit approval before proceeding -- vocabulary becomes the shared language across tests, adapters, and documentation, so getting it right matters. No domain code is written during specification; that happens in implementation.

**Example prompt:**
> Specify the invoice domain vocabulary based on our mapped scenarios. Propose action, query, and assertion names and show me the adapter interface shape.

### Implementation

Drive code through the ATDD double loop -- an outer acceptance test stays red while inner unit tests drive the implementation one behavior at a time.

**When to use:**
- Domain is specified and vocabulary confirmed by a human
- Ready to write working domain, adapter, and test code
- Both greenfield features and legacy code modification

**What it produces:** Working domain definition, adapter implementation, and passing acceptance tests. The scenario is linked to its domain operations and test names.

The double loop works like this: the outer acceptance test is written first and stays red. The agent then writes small inner unit tests, makes each one green, and refactors. This cycle repeats until the outer acceptance test goes green. The agent refactors only on green, changes one thing per cycle, and reports when stuck rather than thrashing.

For legacy code, the implementation skill also teaches sprout, wrap, and extract-and-override strategies -- ways to add new behavior alongside existing code without rewriting it. Characterization tests from earlier phases serve as the safety net during these modifications.

The skill also enforces test design discipline: sociable tests over isolated tests, real objects at the adapter boundary, and mocking only at infrastructure boundaries (network, filesystem, database) using nullable implementations.

**Example prompt:**
> Implement the invoice domain. Start with the acceptance test for basic invoice calculation, then drive the adapter implementation through unit tests.

## Worked example: agent-driven characterization

Here is how a typical conversation flows when using the skills to tackle legacy code. The agent picks up the right skill at each phase while you guide the business decisions. This is not a transcript -- it is a condensed illustration of the back-and-forth rhythm.

The scenario: you have a `calculateInvoice` function that mixes several concerns. It needs refactoring, but it has no tests. You want a safety net before touching it.

**You:** I need to refactor the calculateInvoice function but it has no tests. Help me characterize it.

**Agent** (uses investigation): I traced calculateInvoice from the /api/invoices route handler through to the database write. The function mixes three concerns: line item calculation, discount application, and tax computation. I found two seams -- the function boundary itself accepts an order object and returns an invoice, and the discount logic is in a separate applyDiscounts helper. Confidence: confirmed for the function boundary, inferred for the discount helper based on naming.

**You:** Good. Let's lock down the current behavior.

**Agent** (uses characterization): I wrote approval tests calling calculateInvoice with four input scenarios: a normal two-item order, an order with a 10% discount code, an empty cart, and an order exceeding the free-shipping threshold. All four baselines are captured. The tests pass against the current code.

**You:** I reviewed the baselines. The empty cart case returns a zero-total invoice instead of an error -- is that intentional?

**Agent:** I'm not sure -- I'll flag that as a question. The code doesn't validate for empty carts anywhere I can see. Confidence: speculative. Ready for mapping. I see discount rules and tax calculation as distinct concerns. Want to map the discount scenarios first?

**You:** Yes, let's map discounts.

**Agent** (uses scenario mapping): Based on the characterization evidence, I propose three rules. Rule 1: "Promotional codes apply a percentage discount to the subtotal" -- confirmed, I can see this in the applyDiscounts function. Rule 2: "Only one promotional code can be used per order" -- inferred from the singular promoCode field on the order type. Rule 3: "Discounts cannot reduce the total below zero" -- speculative, I see a Math.max(0, ...) but no test covering it. For each rule I have two examples. And one question: can promotional codes stack with tier-based loyalty discounts?

**You:** They cannot stack. Promo codes override loyalty discounts.

**Agent:** Got it. I'll add that as Rule 4: "Promotional codes override loyalty tier discounts." Here are two examples: Given an order with both a 15% promo code and Gold tier loyalty (10% discount), when calculateInvoice runs, then the 15% promo applies and loyalty is ignored. And the inverse: Given an order with only Gold tier loyalty and no promo code, when calculateInvoice runs, then the 10% loyalty discount applies.

**You:** Those look right. Let's move on to specification.

**Agent** (uses specification): Based on our four discount rules, I propose the following vocabulary. Actions: `createOrder`, `applyPromoCode`. Queries: `getOrderTotal`, `getAppliedDiscount`. Assertions: `orderHasDiscount`, `promoOverridesLoyalty`. Do these names match how you talk about this domain?

**You:** Rename `orderHasDiscount` to `discountIsApplied` -- we always talk about discounts being "applied." Otherwise looks good.

**Agent:** Updated. Ready to implement when you are.

**You:** Go ahead.

**Agent** (uses implementation): I wrote the outer acceptance test for Rule 1 -- applying a promo code to an order. It's red because the domain and adapter don't exist yet. Now driving the inner loop: first unit test covers `applyPromoCode` with a simple percentage calculation. Green. Second unit test covers the "cannot reduce below zero" constraint. Green. Running the acceptance test again -- it passes. Moving to Rule 4, the promo-overrides-loyalty test.

Notice the pattern throughout: the agent proposes, you decide. The agent investigates, you confirm what matters. The agent writes code, you review the names and baselines. Skills keep this division of labor consistent across every phase.

This conversation covered four of the five skills in a single session. In practice, you might spread this across multiple conversations -- investigate today, characterize tomorrow, map next week when the team is available. The skills do not assume a single session. Each phase produces durable artifacts (baselines, rules, vocabulary) that persist between conversations.

## When to use which skill

| Situation | Skill sequence |
|-----------|---------------|
| Legacy code, no tests | Investigation, then Characterization |
| Characterized code, planning changes | Scenario Mapping |
| Mapped scenarios, need domain design | Specification |
| Specified domain, need working code | Implementation |
| Greenfield feature | Scenario Mapping, then Specification, then Implementation |
| Full legacy modernization | Investigation, Characterization, Scenario Mapping, Specification, Implementation |
| Bug discovered during characterization | Scenario Mapping (to confirm it is a bug), then Implementation (to fix it) |
| Existing tests but wrong abstractions | Investigation (find what is wrong), Scenario Mapping (redesign), Specification, Implementation |

The sequence is not rigid. You can loop back -- a question surfaced during mapping might require more investigation. An implementation failure might reveal a missing rule that sends you back to mapping. The skills guide each phase; you choose the path through them.

Here are a few rules of thumb for choosing when to loop back or split:

- If you have more questions than examples after mapping, you need more investigation.
- If a scenario produces more than eight rules, split it into multiple scenarios.
- If rules contradict each other, you probably have two scenarios masquerading as one. Split by concern.
- If the agent gets stuck during implementation for three cycles in a row, step back to specification -- the domain design might need revision.
- If examples require multi-step setup crossing feature boundaries, the scenario crosses domain boundaries. Split by domain.
- If characterization reveals a bug, do not fix it yet. Record it as a question, then address it during mapping where you can confirm whether the behavior is intentional.

## Tips for working with the agent

- **Scope narrowly.** Start with a specific goal, not "test everything." Scope to one function, one feature, or one user story. Broad requests produce shallow results.
- **Review baselines carefully.** The first approval test run captures whatever the system does -- bugs included. Inspect the baselines before accepting them as the intended behavior.
- **Answer questions promptly.** The agent cannot advance past mapping with unresolved questions. If you do not know the answer, say so -- that is useful information too.
- **Push back on names.** If the proposed vocabulary does not match how your team talks about the domain, say so. Renaming vocabulary after implementation is expensive because it propagates through domains, adapters, and tests.
- **Trust the process.** Investigation before characterization, mapping before specification, specification before implementation. Skipping phases creates problems that surface later as misaligned tests, wrong abstractions, or missed edge cases.
- **Let the agent report confidence.** Confirmed, inferred, and speculative ratings tell you where to focus your review time. Spend your attention on speculative findings -- confirmed ones can wait.
- **Do not rush through mapping.** This is where business intent gets captured. A thorough mapping session prevents rework during implementation. Take the time to get the rules right.

## Next steps

- Walk through the manual testing workflow: [Your First Domain](your-first-domain.md)
- Learn the Example Mapping technique in depth: [Example Mapping](example-mapping.md)
- Read the full skill definitions in `packages/skills/` for detailed process steps and anti-patterns
- See the [Getting Started](getting-started.md) guide for basic domain, adapter, and test setup
