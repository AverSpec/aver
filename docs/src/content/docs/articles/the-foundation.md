---
title: "The Foundation Nobody's Building"
---

# The Foundation Nobody's Building

*Why agentic coding multiplies your process — good or bad*

## The Data Is In

The 2025 DORA State of AI report calls it plainly: **AI is an amplifier.** It magnifies the strengths of high-performing engineering organizations and the dysfunctions of struggling ones.

The numbers back it up. Faros AI's study of 10,000+ developers found that teams using AI tools merge 98% more PRs — but PR review time increases 91%. The code is being written. It's just not being verified. Industry-wide, change failure rates are up 30% and incidents per PR have risen 23.5%. More code, more problems.

METR's controlled study cut even deeper: experienced developers on familiar codebases were 19% *slower* with AI tools, despite predicting they'd be 24% faster. The time spent reviewing, testing, and rejecting AI output exceeded the gains from accepting it.

The pattern is consistent across every study: **teams are generating more code, but the infrastructure to verify that code hasn't kept pace.** The bottleneck was never writing code. It was knowing the code is right.

## What Teams Are Reaching For

The agentic development ecosystem has responded with three layers of tooling:

**The loop.** Geoffrey Huntley's Ralph Loop showed that you can hand an AI agent a task, let it work, check the result, and iterate until done. Break work into subtasks, track progress, let the agent cycle. Variations have spread everywhere — Cursor's agent mode, Claude Code's autonomous workflows, Aider's architect mode. The loop is table stakes now.

**The orchestration.** Steve Yegge's GasTown took it further: coordinate dozens of agent instances in parallel, each working on a different piece of the system. A coordinator assigns work, monitors progress, manages integration. The insight is that heavy upfront planning and decomposition can keep an engine of agents fed with well-scoped tasks.

**The specification.** Most recently, a wave of spec-driven development tools — Kiro, GitHub's Spec-Kit, Tessl, and others — recognized that agents need structured requirements, not just prompts. Martin Fowler's analysis of these tools identifies three maturity levels: spec-first, spec-anchored, and spec-as-source. These tools generate markdown requirements, design documents, and task checklists that guide the agent's work.

Each layer solves a real problem. But look at how they handle verification:

- **Ralph Loop:** "Run the tests." But the agent wrote the tests, in the same session, testing its own implementation. It's self-grading homework.
- **GasTown:** Quality gates in the "Refinery" — did the task complete, does it compile, do existing tests pass. The spec-to-implementation gap is managed through extensive upfront planning and human supervision.
- **Kiro:** User stories with acceptance criteria in markdown. Verification is "did the agent follow the checklist?" — checked by the agent or by a human reviewing the diff.
- **Spec-Kit:** Architectural rules and task checklists. More structured than a prompt, but still text the agent interprets.
- **Tessl:** Specs are the source of truth, generated code is marked "DO NOT EDIT." The closest to formal verification, but the spec-to-code mapping is still mediated by an LLM.
- **Semcheck:** An LLM reads the spec and implementation, reports mismatches. LLM-checks-LLM-output. Probabilistic, not deterministic.

The pattern across all of them: **specs are text, and verification is either human judgment or LLM interpretation.** Fowler himself noted that agents "frequently ignored or misinterpreted documented requirements." The specs are advisory, not enforceable.

This isn't a criticism of these tools — they're solving the problems they set out to solve. But the verification layer is still fundamentally "hope the agent followed the instructions, then check manually." And those DORA and Faros numbers are the result.

## The Wrong Fix and the Right One

There's a natural instinct when agents produce unreliable output: write better specs. More detailed requirements. Clearer acceptance criteria. Structured markdown templates. Comprehensive design documents before any code is written.

This impulse is understandable. It's also a trap.

More upfront documentation doesn't tighten the feedback loop — it lengthens it. You spend more time specifying, the agent still interprets the spec through an LLM, you still review the diff to see if it matches, and you're back in the same cycle with more paperwork. As Fowler observed, spec-driven tools have a gravitational pull toward Big Design Up Front — not intentionally, but because the tooling rewards completeness over speed.

The Agile Manifesto had a phrase for this: *working software over comprehensive documentation.* A markdown spec, no matter how detailed, is not working software. It's a document that describes software that might or might not exist yet.

The right fix isn't better specs. It's **executable specs** — specs that are simultaneously the requirement, the contract, and the verification. Not a document someone reads, but an artifact the test runner executes.

## BDD Had the Right Insight

Behavior-Driven Development, as Dan North and the Cucumber community developed it, starts from a specific insight: tests should describe what the system *does* in domain language, not how the implementation works. "When a user assigns a task, the task should show the assignee" — not "when `assignTask` is called, `board.tasks[0].assignee` should equal `'alice'`."

The BDD workflow provides what agentic verification actually needs:

**Machine-enforceable.** The spec isn't a markdown file the agent interprets — it's a contract the test runner checks. If the implementation doesn't match, something fails automatically. No human interpretation required.

**Implementation-independent.** The spec describes observable behavior — "create a task," "task exists" — not internal structure. These statements hold regardless of whether the system uses a database, an in-memory array, or a distributed event store. The agent can refactor freely. The tests constrain *what the system does*, not *how it does it*.

**Reviewable as its own artifact.** The behavioral spec can be inspected, discussed, and approved separately from the implementation code. A stakeholder can read the domain vocabulary and say "yes, that's what the system should do" without reading a line of implementation. An agent can propose the spec; a human can refine it. The spec is the point of accountability.

Crucially, the vocabulary that makes this work comes from collaborative discovery — conversations between developers, domain experts, and stakeholders about what the system should do. BDD's most valuable practices (Example Mapping, Three Amigos sessions) produce the behavioral vocabulary that executable specs are built from. Without discovery, "executable spec" is just "developer writes contract alone," which fails the same way spec-driven tools fail.

BDD's process — Discovery, Formulation, Automation — was complete. The tooling was designed for its era: human-to-human communication through natural language feature files. Cucumber, Serenity, SpecFlow — they worked. But they were built for a world where humans wrote the implementation and other humans reviewed it. The agentic era needs the same behavioral insight with tighter enforcement: typed contracts instead of regex matching, compiler-checked completeness instead of Gherkin parsing.

## What This Changes

Take a concrete workflow. You're adding order fulfillment to an e-commerce system.

**With a spec-driven tool:** You write a markdown spec — "When a customer places an order, inventory should be reserved and the order status should update to 'confirmed.' If inventory is insufficient, the order should be rejected." The agent reads this, writes code, writes tests. You review the diff. The tests pass — but the agent tested that `order.status === 'confirmed'` after calling its own `placeOrder()` function. It verified its understanding of the requirement, not yours. You read the diff. The agent didn't handle partial inventory (three items in the cart, only two in stock). You describe the fix. Two more cycles.

**With behavioral verification:** You define a domain vocabulary — actions like "place order" and "restock item," queries like "order status" and "inventory level," assertions like "order confirmed" and "order rejected." You write (or the agent proposes and you approve) behavioral tests that exercise these operations: add items to inventory, place an order, verify it's confirmed. Place an order that exceeds inventory, verify it's rejected. The agent implements the glue between the vocabulary and the real system. The tests pass or fail. You review for code quality, security, performance — not for whether the fulfillment logic is correct. The tests already answered that.

The behavioral spec is the contract between human intent and agent implementation. It's not text the agent interprets — it's a contract that the verification mechanism enforces. The agent can't mark its own homework because the homework is a separate artifact.

The agent can also propose the spec. It explores the codebase, proposes a domain vocabulary, and the human reviews *that* — a handful of behavioral definitions, not hundreds of lines of implementation. Approve or adjust the vocabulary, then let the agent implement against it. The review happens at the right level of abstraction.

## Existing Systems, Not Just Greenfield

The spec-driven tools are overwhelmingly designed for greenfield work. Start fresh, write requirements, generate code. But most engineering work isn't greenfield.

Brownfield — existing systems with existing code, existing tests (or none), and existing behaviors nobody fully understands — is where most teams live. And it's where the verification gap is widest. You can't write behavioral specs for a system whose behavior you don't know.

For brownfield systems, you need a different entry point:

**Characterization testing.** Before you can specify what the system *should* do, capture what it *actually* does. Characterization tests (also called approval tests) lock in current output as a baseline and fail when it changes — a safety net without requiring understanding. Observe, capture, lock. Now you can refactor with confidence.

**Domain extraction.** As you work with the system, patterns emerge. "Create a task," "move a task," "assign a task" — these domain operations exist whether you've named them or not. Extracting them into an explicit vocabulary gives the codebase a spine that agents can implement against.

**Incremental coverage.** Start with one adapter — maybe end-to-end, because that's the only handle you have into a tightly coupled legacy system. As you refactor and create clean internal boundaries, add adapters at each new seam. The same behavioral tests run at every level.

Most teams build ad-hoc versions of this infrastructure — page objects, test data factories, setup helpers, custom assertion libraries. Every sufficiently complex test suite eventually builds a domain language. The question is whether that language is explicit and typed (so agents can implement against it) or implicit and scattered (so agents have to guess).

## The Infrastructure Nobody Talks About

Beyond the high-profile tools, there's a layer of internal infrastructure that teams build and rebuild:

**Shared test vocabularies.** The Playwright suite has page objects. The API tests have helper functions. The unit tests have factories. Three vocabularies for the same domain, built independently, drifting apart.

**Contract testing at boundaries.** When services interact, someone needs to verify the provider still satisfies the consumer's expectations. Integrating contract testing into an agentic workflow — where the agent might change both sides — is unsolved.

**Visual regression baselines.** Screenshot comparison for UI testing. Every team that does it builds custom infrastructure for capturing, comparing, approving, and storing baselines.

**Production telemetry verification.** Your tests pass, your deploys ship, and then your dashboards go dark because someone broke trace propagation. Verifying that the system emits the right telemetry is a testing problem almost nobody treats as a testing problem.

These aren't exotic requirements. They're the infrastructure that teams reaching for serious verification end up building from scratch — or wishing they had time to. The agentic development tools don't address them because they're focused on the loop, the orchestration, or the spec — not the verification layer underneath.

## The Payoff

Teams that build this foundation — behavioral verification, domain-bounded architecture, mature CI/CD — unlock a fundamentally different relationship with agentic coding:

**Confident releases.** When behavioral tests verify that no regressions have been introduced, you can release with assurance. Not "the agent said it's done" assurance — "the test runner proved the behavior holds" assurance.

**Small, reviewable chunks.** Domain-bounded work is naturally scoped. Each behavioral contract covers a specific capability. You can review, approve, and ship one capability at a time without understanding the entire implementation.

**Parallelized agent work.** When work is decomposed into independent domain-bounded units, multiple agents can implement in parallel without stepping on each other. The behavioral contracts are the integration points — if each agent's adapter passes its tests, the system works. Parallelism scales with decomposition quality, not agent count.

**Higher abstraction.** The human moves upstream — from reading diffs to designing domains, from reviewing implementation to reviewing behavioral specs. The agent handles the mechanical work. The human handles the judgment: what should the system do, what are the edge cases, does this vocabulary capture the real domain.

This is the DORA finding in practice. AI amplifies your process. If your process is "write code, review diffs, hope it works," AI gives you more code to review and more hope to manage. If your process is "define behaviors, verify against contracts, release in bounded increments," AI gives you more throughput at every step.

## The Shift

The agentic development ecosystem is going through the same evolution that CI/CD went through a decade ago. First you automate the build (the loop). Then you automate the deployment (orchestration). Then you realize the bottleneck was never the automation — it was the confidence that the thing you're deploying actually works.

The spec-driven tools are the beginning of this realization. They're right that requirements should come before code. They're right that agents need structured guidance. Where they stop short is in making the spec enforceable — not by another LLM interpreting markdown, but by a verification mechanism that accepts or rejects the implementation deterministically.

The behavioral testing community has been building toward this for two decades. The agent loop tools have been building toward it for two years. The connection between them — executable behavioral contracts as the verification layer in agentic development — is the foundation that makes the whole stack work.

The tools are starting to catch up.
