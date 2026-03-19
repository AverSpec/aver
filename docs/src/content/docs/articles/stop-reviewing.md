---
title: "Stop Reviewing AI Code. Verify the Behavior."
---

*Why executable specs beat code review for agentic development*

## The Review Cycle Everyone Knows

If you've used AI coding tools for more than a week, you know the loop:

1. You describe what you want
2. The agent writes code
3. You review the diff, find issues
4. You describe the fixes
5. The agent fixes them, introduces new issues
6. You review again
7. Repeat until you give up and rewrite it yourself

The promise was "move faster." The reality is "produce code faster, then spend the saved time reviewing it." The generation problem is solved. The verification problem is worse than ever.

## What's Actually Going Wrong

It's not that the agents are bad at coding. It's that the feedback loop is in the wrong place.

When a spec lives in a ticket and verification lives in a human's head, every review cycle is a translation exercise. The reviewer mentally maps the diff back to the intent: *does this code actually do what the ticket described?* That mapping is slow, error-prone, and doesn't scale. And when the reviewer catches a mismatch, the fix often introduces a new one — because the agent is also translating from natural language to code, and each iteration is a fresh interpretation.

The problem isn't the agent's output. It's that there's no machine-checkable way to know if the output is right. The only verification mechanism is a human reading a diff.

## Move the Feedback Loop

The fix isn't reviewing harder. It's moving verification out of the human's head and into the test runner.

Define the behaviors you want — not in a ticket, not in a markdown spec, but in a format the test runner can execute. Actions the system should support. Queries it should answer. Assertions about observable outcomes. A vocabulary that describes *what the system does* without prescribing how it works.

A concrete example. You're building task assignment. The behavioral spec says: the system supports an "assign task" action and a "task assigned to" query. The test says: assign a task to Alice, then verify the task shows Alice as the assignee. That's the entire spec for this behavior — two operations, one test.

Now the agent implements. It writes the code that makes "assign task" and "task assigned to" work against your actual system — database calls, API routes, whatever. If the test passes, the behavior is correct. If it fails, the agent iterates. You never read the implementation diff to check whether assignment works. The test already told you.

Compare this to the spec-driven version: the agent reads "users should be able to assign tasks" from a markdown file, writes code, writes its own test (`expect(task.assignee).toBe('alice')`), and everything passes. But the agent tested its own understanding of assignment, not yours. You read the diff. You notice it didn't handle reassignment. You describe the fix. Two more cycles.

The behavioral spec caught nothing extra in this example — the difference is *who* defined the expected behavior and *what* verified it. The spec came from the human (or was proposed by the agent and approved by the human). The verification came from the test runner. Neither step required reading implementation code.

Then the agent implements against that vocabulary. The tests pass or fail. No diff review needed for behavioral correctness — the test IS the spec. The agent can iterate against the tests autonomously, without a human in the loop for each cycle.

You still review. But what you review changes. Instead of "did this code implement the feature correctly?" (which the tests now answer), you review for the things humans are actually good at judging: security, performance, architectural fit, edge cases the spec didn't anticipate. The mechanical verification is automated. The judgment calls stay with you.

## Three Ways to Work

The interesting thing isn't just "human writes spec, agent implements." There are three modes, and the less obvious ones are the most powerful:

**Human specifies, agent implements.** You define the domain vocabulary and write behavioral tests. The agent implements. Tests pass or fail. This is the simplest loop and works well for well-understood features.

**Agent implements, human iterates on the spec.** You let the agent build something — maybe loosely described, maybe not fully thought through. The implementation exists. Now you look at the behavioral spec and adjust it toward what you actually want. The agent re-implements against the updated spec. You're closing the gap between prototype and final design by iterating on the *spec*, not the code. The implementation is disposable.

**Agent explores, proposes spec, human refines.** The agent reads the codebase, identifies patterns, and proposes a domain vocabulary: "I see these operations — create task, move task, assign task — does this capture the domain?" You edit the vocabulary. The agent implements against your refined version. This is what a good pair partner does — suggest abstractions for you to accept, reject, or reshape.

In all three modes, the human reviews a handful of behavioral definitions, not hundreds of lines of implementation. The review happens at the right level of abstraction.

## Behavior, Not Implementation

When agents write tests alongside implementation — the standard "vibe coding" pattern — the tests lock in implementation details. They test internal data structures, specific method calls, the shape of objects. Refactor the internals and the tests break, even when the behavior is unchanged.

Behavioral tests lock in what the system *does*, not how it does it. "Create a task, then verify the task exists" holds whether the system uses a database, an in-memory array, or a distributed event store. The agent can refactor freely. The tests are a safety net, not a cage.

For human-written code, this is a best practice. For AI-generated code, it's a necessity. Agents iterate fast and they iterate a lot. If every iteration risks breaking implementation-coupled tests, the test suite becomes a drag instead of a guardrail.

You don't need to model your entire domain to start. Pick one feature area, define the behavioral vocabulary for it, and let the agent implement against that. One domain, one adapter, one test file. See how it changes the review cycle. The vocabulary grows with your system.

## Parallel by Default

When behavioral contracts define clean boundaries, work decomposes naturally. Each domain area is independent. Each adapter is independent. Multiple agents can work in parallel — different features, different subsystems — without stepping on each other.

The key insight: **parallelism scales with decomposition quality, not agent count.** If the work breaks into independent behavioral units, five agents in parallel is close to five times the throughput. If it doesn't, adding agents just adds merge conflicts.

Domain-driven architecture naturally encourages this decomposition. The behavioral contracts are the integration points — if each agent's implementation passes its tests, the system works. The bottleneck becomes the human's ability to decompose and prioritize, not their ability to review diffs.

## What This Doesn't Solve

Behavioral correctness is not code quality. An agent can produce code that passes every acceptance test and still have security vulnerabilities, performance problems, error handling gaps, or architectural drift.

You still need code review for these concerns. But it's a different kind of review — focused on judgment calls about non-functional qualities, not on the mechanical question of whether the feature works. The review burden is reduced, not eliminated. And the remaining review is focused where human judgment actually matters.

## The Shift

The review cycle doesn't disappear. It relocates — from downstream (reading diffs after the code is written) to upstream (designing behavioral specs before the code is written). From "is this implementation correct?" to "is this the right behavior?"

That's a fundamentally different use of human time. Reading a ten-line behavioral spec is faster than reading a two-hundred-line diff. And when the spec changes, you don't review the new implementation either — the tests verify it.

You still review code. You review it for security, for performance, for the judgment calls machines can't make. What you stop doing is reading diffs to answer "does this implementation match the requirement?" — because the behavioral tests already answered that.

Stop reviewing code for correctness. Verify the behavior.
