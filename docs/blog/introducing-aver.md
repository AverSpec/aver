---
layout: default
title: "Introducing Aver: Domain-Driven Acceptance Testing for TypeScript"
nav_order: 10
---

# The Testing Infrastructure Everyone Keeps Rebuilding

*February 2026 — Nate Jackson*

## 1. The Testing Infrastructure Everyone Rebuilds

Every project of sufficient complexity eventually builds a domain language for its tests. You've seen it happen. The Playwright suite grows to forty tests and someone says, "We should extract a page object." The API tests start sharing setup functions and someone builds a test data factory. The integration suite gets its own little DSL for describing workflows: `createUser`, `loginAs`, `submitOrder`, `verifyOrderStatus`.

These are all partial solutions to the same underlying problem: tests should describe *what* the system does, not *how* the test interacts with the system. Page Object pattern, service layer abstractions, test data builders, custom assertion helpers — every team arrives at some subset of this infrastructure. They build it from scratch, because it's "just test code," not worth extracting into a library. They maintain it alongside the production code, and when the team moves on, the next team inherits either a sophisticated-but-undocumented test DSL, or brittle tests that nobody dares refactor.

The pattern repeats on every project I've worked on or consulted with over the past decade. A team starts with raw Playwright or Jest tests. Six months later, they have an ad-hoc domain language layered on top. A year later, someone rewrites the test infrastructure because the first version made assumptions that no longer hold. And when they start a *new* project, they build the whole thing again from zero — slightly different this time, shaped by whatever they remember regretting last time.

This is the problem Aver exists to solve. Not the tests themselves, but the infrastructure underneath them: the domain vocabulary, the adapter layer, the mechanism for running the same intent at different abstraction levels. The stuff every serious test suite needs and every team rebuilds.

## 2. The Testing Pyramid's Dirty Secret

The testing pyramid — lots of unit tests at the base, fewer integration tests in the middle, a handful of end-to-end tests at the top — is one of those ideas that sounds right in a conference talk and falls apart in practice. Not because it's wrong in principle, but because it assumes something that's rarely true: that tests at different levels are testing *different things*.

In reality, you're usually testing the *same behavior* at every level. "Creating a task puts it in backlog" is the same requirement whether you're verifying it against a `Board` class, an Express API, or a React UI. The pyramid tells you to write a unit test for the class, an integration test for the API, and an end-to-end test for the browser. Three tests, one requirement, three places to update when the requirement changes. That's not a pyramid. That's tripled maintenance with a nice diagram.

**Legacy projects** have it worst. The pyramid is inverted: most of the test coverage is end-to-end, because the code wasn't designed for unit testing. Services are tightly coupled to databases. Business logic lives inside controllers. Adding unit tests means refactoring the production code, which breaks the end-to-end tests that are the only safety net you have. So you don't refactor, and the inverted pyramid calcifies.

**Greenfield projects** fare better initially, then converge on the same mess from the opposite direction. You start with fast, isolated unit tests. Then you discover that the integration between your services has bugs that unit tests can't catch, so you add integration tests. Then a QA engineer points out that the button doesn't actually work in the browser, so you add end-to-end tests. Now you have three test suites with overlapping intent, different languages for expressing that intent, and no mechanism for keeping them in sync.

The pyramid's real failure is treating the *level of abstraction* as the organizing principle for tests. It should be the *behavior under test*. One behavior, described once, verified at whatever levels matter. The duplication isn't a feature of thorough testing — it's an engineering failure we've learned to accept.

## 3. BDD: The Right Idea, Wrong Execution

Behavior-Driven Development recognized this problem fifteen years ago. Cucumber, SpecFlow, Behave — the Gherkin family — introduced domain language as the primary interface for tests. Write a feature file in natural language, bind step definitions to code, execute. The insight was genuine and important: tests should be readable as behavioral specifications, not as scripts for driving a browser.

But the execution was wrong.

Regex-based step matching is inherently fragile. `Given a task "Fix login bug" exists` and `Given there is a task called "Fix login bug"` are the same intent expressed differently, and the step runner can't match both without either a clever regex or two separate step definitions. The Gherkin-to-code gap becomes a maintenance burden in its own right: a directory of `.feature` files, a directory of step definitions, and a mapping layer between them that breaks when either side changes.

The promise that "non-technical stakeholders will write Gherkin specs" almost never materializes. In practice, developers write the feature files, developers write the step definitions, and the Gherkin layer is ceremonial overhead between the person writing the test and the code that executes it. The few teams where product owners genuinely contributed to Gherkin had product owners who were effectively writing pseudocode — which is what a well-designed test DSL gives you anyway, without the parsing layer.

Cucumber got the big thing right: tests should speak domain language. But natural language parsing is a terrible programming interface. The vocabulary should be defined in code, enforced by a type system, and composed through function calls — not matched through regexes against prose.

## 4. LLM Spec-Driven Frameworks: Solving the Wrong Problem

The newest wave takes the spec-driven idea further: write your specifications in markdown, and let an LLM generate tests or code from them. Tools like GitHub Spec Kit and AWS Kiro represent this approach — the spec is the input, generated code is the output.

This gets something right: specifications *should* be the source of truth. A markdown document describing "users can create tasks and move them between columns" is a genuine artifact of product intent, and it's appealing to imagine that artifact driving the test suite automatically.

But the generated tests have the same problems as hand-written ones. An LLM generating Playwright tests writes Playwright selectors — `page.getByTestId('task-card')` — just like a human would. The tests are still implementation-coupled. They still break when the UI changes. The LLM just writes them faster, which means you accumulate fragile tests faster.

Worse, specs drift from reality. Without an execution link between the markdown document and the running system, the spec becomes stale documentation. The team updates the code, forgets to update the spec, and the next person who reads the spec gets a description of a system that no longer exists. This is the same failure mode as Javadoc comments that describe the previous version of the method.

And verification is still manual. The LLM generates tests, a human reviews them, decides they look right, merges them. If the spec was wrong, the generated tests encode that wrongness faithfully.

The right intuition: specs should be the source of truth. The wrong conclusion: the spec should *generate* the test. What if the spec *was* the test?

## 5. What If the Spec Was the Test?

This is where Aver starts. A domain definition in Aver is simultaneously a specification and a test contract:

```typescript
import { defineDomain, action, query, assertion } from 'aver'

export const taskBoard = defineDomain({
  name: 'task-board',
  actions: {
    createTask: action<{ title: string; status?: string }>(),
    moveTask:   action<{ title: string; status: string }>(),
    deleteTask: action<{ title: string }>(),
  },
  queries: {
    taskDetails: query<{ title: string }, Task | undefined>(),
  },
  assertions: {
    taskInStatus: assertion<{ title: string; status: string }>(),
    taskCount:    assertion<{ status: string; count: number }>(),
  },
})
```

This is a spec: the system has tasks, you can create them, move them, delete them, query their details, and verify their status. It's also a TypeScript type: every adapter must implement every action, query, and assertion, or the compiler rejects it. Phantom types make this ironclad — `action<{ title: string }>()` carries the payload type at compile time while producing just `{ kind: 'action' }` at runtime.

A typical Playwright test couples intent to implementation:

```typescript
test('move task to in-progress', async ({ page }) => {
  await page.goto('http://localhost:3000')
  await page.getByTestId('new-task-title').fill('Fix login bug')
  await page.getByTestId('create-task-btn').click()
  await page.getByTestId('task-Fix login bug')
    .getByTestId('move-in-progress').click()
  await page.getByTestId('column-in-progress')
    .getByTestId('task-Fix login bug').waitFor()
})
```

The same behavior in Aver speaks only domain language:

```typescript
const { test } = suite(taskBoard)

test('move task to in-progress', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix login bug' })
  await act.moveTask({ title: 'Fix login bug', status: 'in-progress' })
  await assert.taskInStatus({ title: 'Fix login bug', status: 'in-progress' })
})
```

The test doesn't know if it's talking to a class, an API, or a browser. *Adapters* handle that mapping. You write one adapter per protocol — `unit`, `http`, `playwright` — and each adapter translates domain operations into protocol-specific calls. The test stays pure. The implementation knowledge lives in exactly one place per protocol.

This is the synthesis: Cucumber's vocabulary insight, implemented with types instead of regexes, composed through a real programming language instead of parsed from natural language, and executed at every level through adapters instead of locked to a single runner.

## 6. Approval Testing: The Other Infrastructure Everyone Rebuilds

There's a companion pattern that teams rebuild just as frequently: approval testing. The idea is simple — compare output against an approved baseline, fail on differences, make approval an explicit human decision. It appears everywhere: visual regression tools, snapshot testing libraries, golden-file scripts, custom diff reporters. Each project reinvents baseline management, diff display, the approve/reject workflow, and the storage conventions for approved artifacts.

Aver's `@aver/approvals` package provides `approve()` for structural comparison (text, JSON) and `approve.visual()` for screenshot comparison. The interesting part is how visual approval integrates with the domain layer.

A visual approval test in Aver looks like this:

```typescript
await approve.visual('board-with-task')
```

One line. No `page` object, no selectors, no screenshot API calls. The protocol's screenshotter extension — declared by the Playwright adapter, invisible to the test — captures the screenshot and manages the baseline. The test doesn't know *how* the screenshot is taken, only that it wants to verify the visual state called `board-with-task`.

This is the same separation at work: the domain says *what* to verify, the adapter knows *how*. When you switch from Playwright to a different browser automation tool, the visual tests don't change. When you add region-based comparisons (verify just the sidebar, just the header), the adapter maps region names to selectors. The test stays in domain language.

## 7. Same Test, Every Level

The payoff is concrete. The task board example has five tests and three adapters — unit, HTTP, Playwright:

```
$ npx aver run

 ✓ create a task in backlog [unit]            1ms
 ✓ create a task in backlog [http]           55ms
 ✓ create a task in backlog [playwright]   1890ms
 ✓ move task through workflow [unit]          1ms
 ✓ move task through workflow [http]         11ms
 ✓ move task through workflow [playwright]  369ms
 ✓ delete a task [unit]                       0ms
 ✓ delete a task [http]                       7ms
 ✓ delete a task [playwright]               325ms
 ✓ track full task lifecycle [unit]           1ms
 ✓ track full task lifecycle [http]           9ms
 ✓ track full task lifecycle [playwright]   408ms

 Tests  15 passed (15)
```

Five tests. Three adapters. Fifteen runs. Zero code duplication. The unit adapter validates business logic in under 5ms. The HTTP adapter verifies API contracts. The Playwright adapter confirms the UI works end-to-end. And the test code is identical for all three — because the test code doesn't know about any of them.

This is the testing pyramid done right: not three separate suites with duplicated intent, but one suite that executes at every level the team cares about.

## 8. The AI Angle

AI coding agents are rewriting how code gets built, but they're amplifying an existing problem with tests. An agent refactors a component and Playwright tests break — not because the feature is broken, but because the tests were coupled to selectors and DOM structure that the agent changed. You spend more time fixing tests than shipping features. The faster the agent works, the faster the test suite rots.

Domain vocabulary gives AI agents what they actually need: a stable interface. An agent can read `act.createTask`, `assert.taskInStatus` and understand the behavioral contract without parsing Playwright selectors or Express route handlers. When the agent refactors the implementation, the tests don't break because the tests never mentioned the implementation. The domain vocabulary is the contract between what humans intend and what the system does — and it's the right abstraction level for AI to operate at.

Aver includes an MCP server that exposes domain vocabulary, test results, and project structure as tool calls. An AI agent can explore what the system does, run tests, read failure traces, and scaffold new domain operations — all through the same stable contract the tests use. The domain definition becomes the API between human intent and AI execution. And when something fails, the action trace — in domain language, not Playwright logs — gives the agent enough context to diagnose the problem without reading implementation code.

## 9. Standing on Shoulders

Aver didn't emerge from nothing. It's a synthesis of ideas I've admired — and borrowed from — for years.

**Dave Farley's acceptance test architecture.** In *Continuous Delivery* (2010) and his later talks, Farley describes a four-layer model that separates test intent from implementation through a "domain-specific language" layer and a "protocol driver" layer. Aver's three-layer model — domain, adapter, test — is a direct simplification, with TypeScript's type system replacing the ceremony of Java-era patterns.

**Cucumber and Gherkin.** Aslak Hellesøy, Matt Wynne, and the BDD community demonstrated that tests should speak domain language. The vocabulary insight is foundational. Where Aver diverges is in the mechanism: typed functions and phantom types instead of regex step matching and natural language parsing.

**The Screenplay pattern and Serenity.js.** Antony Marcano, Andy Palmer, and Jan Molak decomposed test automation into actors, tasks, questions, and abilities — separating *what* from *how* at the test level. Serenity.js brought this to JavaScript with strong reporting. Aver takes the same conceptual split but optimizes for TypeScript ergonomics: no class hierarchies, no decorator chains, just typed functions.

**ApprovalTests.** Llewellyn Falco's ApprovalTests framework (approvals.com) established the pattern of comparing output against approved baselines with explicit approval workflows. Aver's `@aver/approvals` package carries this pattern into the domain-driven model, so approval tests benefit from the same adapter separation as behavioral tests.

**Spec-driven development.** The ThoughtWorks Technology Radar tracks specification-driven development as a technique worth watching. Tools like GitHub Spec Kit and AWS Kiro focus on generating code from specs. Aver comes at it from the other side: the specification *is* the test, expressed in domain language, enforced by types, executed at every level.

## 10. Try It

```bash
npm install aver
npx aver init --domain TaskBoard --protocol unit
npx aver run
```

Or explore the [task board example](https://github.com/njackson/aver/tree/main/examples/task-board) — a React + Express app tested across unit, HTTP, and Playwright adapters with a single test suite.

- [Documentation](/)
- [Getting Started](/getting-started)
- [Architecture](/architecture)
- [GitHub](https://github.com/njackson/aver)

---

*Aver is MIT-licensed and open source. Built by [Nate Jackson](https://github.com/njackson).*
