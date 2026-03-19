---
title: "Introducing Aver"
---

# Introducing Aver: Domain-Driven Acceptance Testing for TypeScript

## The Testing Infrastructure Everyone Keeps Rebuilding

Every project of sufficient complexity eventually builds a domain language for its tests. You've seen it happen — probably more than once. The Playwright suite grows to forty tests and someone says, "We should extract a page object." The API tests start sharing setup functions and someone builds a test data factory. The integration suite gets its own little DSL for describing workflows: `createUser`, `loginAs`, `submitOrder`, `verifyOrderStatus`.

These are all the same impulse: name the operations, hide the mechanics, write tests in terms of what the system does instead of how it's implemented. But each level builds its own vocabulary independently. The page object says `checkoutPage.addItem()`. The API helper says `postItem()`. The unit factory says `builder.withItem()`. Three names for the same domain operation, none of them aware the others exist.

This is the accidental domain language. It emerges organically, serves its level well, and creates invisible drift between levels. Teams build it from scratch, because it's "just test code," not worth extracting into a library. They maintain it alongside the production code, and when the team moves on, the next team inherits either a sophisticated-but-undocumented test DSL, or brittle tests that nobody dares refactor.

The pattern repeats on every project I've worked on or consulted with over the past decade. A team starts with raw Playwright or Jest tests. Six months later, they have an ad-hoc domain language layered on top. A year later, someone rewrites the test infrastructure because the first version made assumptions that no longer hold. And when they start a *new* project, they build the whole thing again from zero — slightly different this time, shaped by whatever they remember regretting last time.

This is the problem Aver exists to solve. Not the tests themselves, but the infrastructure underneath them: the domain vocabulary, the adapter layer, the mechanism for running the same intent at different abstraction levels. The stuff every serious test suite needs and every team rebuilds.

## What the Pyramid Doesn't Address

The testing pyramid — lots of unit tests at the base, fewer integration tests in the middle, a handful of end-to-end tests at the top — is sound advice about *how many* tests to write at each level. What it doesn't address is how to organize them, how to share vocabulary between levels, or how to ensure the levels agree on what correct behavior looks like.

So teams do what's natural: they organize by level. Unit tests here, integration tests there, E2E tests over there. Each level develops its own conventions independently. And over time, those conventions drift.

The unit test for "create order" initializes an `OrderService` with a mock database and calls `createOrder()`. The integration test hits `POST /api/orders` with a JSON body. The E2E test fills out a form and clicks "Submit." Three descriptions of the same behavior that share nothing — not the setup, not the assertions, not even the vocabulary.

When a product requirement changes — say, orders now require a shipping address — you update the unit test, update the API test, and maybe remember to update the E2E test. There's no single source of truth for what your system does. There's just a pile of tests organized by how they run, not what they verify.

**Legacy projects** have it worst. The pyramid is inverted: most of the test coverage is end-to-end, because the code wasn't designed for unit testing. Services are tightly coupled to databases. Business logic lives inside controllers. Adding unit tests means refactoring the production code, which breaks the end-to-end tests that are the only safety net you have. So you don't refactor, and the inverted pyramid calcifies.

**Greenfield projects** fare better initially, then converge on the same mess from the opposite direction. You start with fast, isolated unit tests. Then you discover that the integration between your services has bugs that unit tests can't catch, so you add integration tests. Then a QA engineer points out that the button doesn't actually work in the browser, so you add end-to-end tests. Now you have three test suites with overlapping intent, different languages for expressing that intent, and no mechanism for keeping them in sync.

What the pyramid needs is a spine: a single behavioral specification that runs at every level, with level-specific tests handling concerns unique to each layer. You still write unit tests for edge cases and TDD design feedback. You still write integration tests for protocol-specific behaviors. But the core behavioral contract — the spec — gets described once and verified everywhere.

## BDD: The Right Idea, Wrong Execution

The idea of describing behavior once and verifying it everywhere isn't new. Behavior-Driven Development recognized this problem twenty years ago. Dan North, Aslak Hellesøy, Matt Wynne, and the BDD community introduced domain language as the primary interface for tests. Write a feature file in natural language, bind step definitions to code, execute. The insight was genuine and important: tests should be readable as behavioral specifications, not as scripts for driving a browser. And the practices that surrounded the tooling — discovery workshops, Example Mapping, Three Amigos sessions — remain some of the most valuable in software development. Collaborative discovery is where domain vocabulary comes from. That hasn't changed.

The tooling has struggled. Early Cucumber relied on fragile regex-based step matching; Cucumber Expressions improved this (`Given a task {string} exists` is type-safe and unambiguous), but the deeper structural issue remains: a directory of `.feature` files, a directory of step definitions, and a mapping layer between them that breaks when either side changes. Stakeholders were meant to *read* the feature files and give feedback — not write them — but in practice the people reading and writing were almost always developers, and for developer-to-developer communication, the Gherkin layer becomes ceremonial overhead between intent and code.

Cucumber got the big things right: tests should speak domain language, and the vocabulary should emerge from collaborative discovery. Where Aver diverges is in the mechanism and the audience. The vocabulary is defined in code, enforced by a type system, and composed through function calls — optimized for the development team rather than for cross-functional readability. The discovery still happens in conversations and workshops. Aver gives the discovered vocabulary a home in the type system.

## Define It Once, Verify It Everywhere

This is where Aver starts. A domain definition in Aver is simultaneously a specification and a test contract:

```typescript
import { defineDomain, action, query, assertion } from '@averspec/core'

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

This is a spec — not in the sense of a product document a stakeholder would read, but in the engineering sense: a contract that defines the system's observable behaviors and enforces them at compile time. Every adapter must implement every action, query, and assertion, or the compiler rejects it. Phantom types make this ironclad — `action<{ title: string }>()` carries the payload type at compile time while producing just `{ kind: 'action' }` at runtime.

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

The test doesn't know if it's talking to a class, an API, or a browser. It names the observable behaviors of the system — `createTask`, `moveTask`, `taskInStatus` — and those names are arbitrary handles. They don't describe an implementation. They describe what the system does from the outside.

*Adapters* provide the handles into the application. Here's the Playwright adapter for the operations in that test:

```typescript
export const playwrightAdapter = adapt(taskBoard, {
  protocol: playwright(),

  actions: {
    createTask: async (page, { title }) => {
      await page.getByTestId('new-task-title').fill(title)
      await page.getByTestId('create-task-btn').click()
      await page.getByTestId(`task-${title}`).waitFor()
    },
    moveTask: async (page, { title, status }) => {
      await page.getByTestId(`task-${title}`)
        .getByTestId(`move-${status}`).click()
      await page.getByTestId(`column-${status}`)
        .getByTestId(`task-${title}`).waitFor()
    },
    // ...
  },

  assertions: {
    taskInStatus: async (page, { title, status }) => {
      const card = page.getByTestId(`column-${status}`)
        .getByTestId(`task-${title}`)
      if ((await card.count()) === 0)
        throw new Error(`Expected "${title}" in "${status}"`)
    },
    // ...
  },
})
```

That's where the selectors live. All of them. In one place. The full adapter — including server lifecycle, teardown, and every handler — is about 80 lines. The same operations in the unit adapter are three lines each:

```typescript
export const unitAdapter = adapt(taskBoard, {
  protocol: unit(() => new Board()),

  actions: {
    createTask: async (board, { title, status }) => board.create(title, status),
    moveTask:   async (board, { title, status }) => board.move(title, status),
    // ...
  },

  assertions: {
    taskInStatus: async (board, { title, status }) => {
      const task = board.details(title)
      if (task?.status !== status)
        throw new Error(`Expected "${title}" in "${status}"`)
    },
    // ...
  },
})
```

The adapters aren't hiding complexity — they're *factoring* it. Every Playwright test suite eventually extracts page objects, helper functions, setup utilities. That extraction happens anyway. Aver gives it a standard shape: one handler per domain operation, typed by the domain definition, isolated from the tests entirely. The complexity of driving a browser doesn't disappear. It lives in the adapter, in exactly one place, instead of being smeared across every test file.

The economics come down to what grows with what. An adapter grows with the *domain vocabulary* — add a new operation, add a handler. But the test suite grows with *scenarios*, and scenarios grow much faster than vocabulary. Five domain operations can support fifty tests that compose them in different ways. In standalone Playwright, all fifty tests contain selectors. In Aver, the selectors live in five adapter handlers — and when one changes, you fix it in one place.

This is the synthesis: Cucumber's vocabulary insight, implemented with types instead of regexes, composed through a real programming language instead of parsed from natural language, and executed at every level through adapters instead of locked to a single runner.

## Approval Testing: Locking In What Exists

There's a companion pattern that teams rebuild just as frequently: approval testing. Compare output against an approved baseline, fail on differences, make approval an explicit human decision. You've seen the variations — visual regression tools that screenshot every page, snapshot testing libraries that serialize component trees, golden-file scripts that diff CLI output, custom diff reporters bolted onto CI. Each project reinvents baseline management, the diff display, the approve/reject workflow, and the storage conventions for approved artifacts.

Aver's `@averspec/approvals` package provides `approve()` for structural comparison (text, JSON) and `approve.visual()` for screenshot comparison. The interesting part is how approval integrates with the domain layer.

A visual approval test in Aver looks like this:

```typescript
await approve.visual('board-with-task')
```

One line. No `page` object, no selectors, no screenshot API calls. The protocol's screenshotter extension — declared by the Playwright adapter, invisible to the test — captures the screenshot and manages the baseline. The test doesn't know *how* the screenshot is taken, only that it wants to verify the visual state called `board-with-task`.

When approval fails, you get a diff — a unified text diff for structural comparisons, a pixel-highlighted diff image for visual ones — alongside the received output so you can inspect exactly what changed. If the change is intentional, `aver approve` updates the baseline. If not, you have a regression.

This is the same separation at work: the domain says *what* to verify, the adapter knows *how*. But approval testing also plays a deeper role in how teams adopt domain-driven testing, particularly on legacy systems. More on that shortly.

## Before and After

Three test files, three vocabularies, three implementations of the same behavior:

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

One test, three adapters:

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

The domain definition (`createTask`, `assignTask`, `taskAssignedTo`) is the single source of truth. The adapters implement it for each level. The test doesn't know or care which adapter it's running against. When two adapters disagree, that's a real bug at a real boundary — not a flaky test.

## Same Test, Every Level

The payoff is concrete. The task board example has four core tests and three adapters — unit, HTTP, Playwright:

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

 Tests  12 passed (12)
```

Four tests. Three adapters. Twelve runs. Zero code duplication. The unit adapter validates business logic in under 5ms. The HTTP adapter verifies API contracts. The Playwright adapter confirms the UI works end-to-end. And the test code is identical for all three — because the test code doesn't know about any of them.

This is the spine. The shared domain tests verify the behavioral contract at every level. You still write unit tests to drive your implementation design through TDD. You still write level-specific tests for concerns that only exist at one layer — drag-and-drop interactions, concurrent writes, CSS rendering. The pyramid doesn't disappear. It gets a backbone.

If you've worked with Cucumber and RSpec, this is the same two-loop workflow. The domain suite is the outer loop — the acceptance test that stays red while you build. TDD is the inner loop — red, green, refactor on the classes and functions underneath until the outer loop goes green. Aver doesn't replace the inner loop. It gives the outer loop real infrastructure.

## The Domain You Already Have

Every system has a domain model whether you name it or not. The behaviors exist — they're implicit in the code, scattered across documentation, living in the heads of the developers who built it. "Users can create tasks." "Tasks move between columns." "Deleting a task removes it from the board." These are facts about the system regardless of whether anyone has written them down, and regardless of whether the codebase has a clean `Board` class or a tangled mess of controllers and database calls.

The question isn't whether to have a domain vocabulary. It's whether to make it explicit — and when.

On a greenfield project, you define the vocabulary up front. `createTask`, `moveTask`, `taskInStatus`. These are declarations of intent: the system *should* exhibit these behaviors. You write the domain, wire the adapters, TDD the implementation underneath. The vocabulary drives the design.

On a legacy project, you discover the vocabulary as you go. You inherit a system with no tests and tightly coupled internals — the inverted pyramid from earlier. The standard advice is to add unit tests, but that requires refactoring the production code, which requires tests you don't have yet. It's circular.

The domain-level approach breaks the cycle. You start from the outside: what does this system observably do? You don't need to understand the internals to answer that. You name the behaviors — `createTask`, `moveTask` — and write an E2E adapter, because that's the only handle you have into a tightly coupled system. Now you have a behavioral contract. The acceptance tests go green. You can refactor underneath with confidence, because the contract holds from the outside.

Aver is a new tool, and this legacy workflow is the one we've designed it to support. We'd love to see how teams adopt it in practice — whether the pyramid-grows-inward pattern holds on real legacy codebases the way we believe it will.

This isn't always clean. Legacy systems have surprising behaviors — you write `createTask` and discover that creating a task also sends an email, updates a counter, and logs to an audit table. Your first vocabulary will be imperfect, shaped by incomplete understanding. That's fine. The vocabulary is code; you refactor it as understanding deepens, the same way you'd refactor any other code. The point isn't to get the domain right on the first try. It's to make the behavioral contract explicit so you have something to refactor *against*.

As the internals improve — as you extract services, decouple from the database, create clean APIs — you add adapters. An HTTP adapter when the API layer emerges. A unit adapter when the domain classes are testable in isolation. The pyramid grows *inward*, from E2E toward unit, instead of the usual advice of building from unit outward. And through the whole process, the domain vocabulary is the constant. The tests don't change. Only the adapters do.

This is the same impulse as characterization testing, at a different stage. Approval tests capture what the system currently does — observe the output, lock it in as a baseline, refactor, verify nothing changed. That's behavior locking from the *right* side: observation after the fact. Domain vocabulary is behavior locking from the *left* side: declaring the intent up front. For legacy systems, you often start on the right — `approve(output)` locks in what exists — and move left as understanding deepens, replacing opaque baselines with named operations: `assert.taskInStatus(...)`. First you lock in what the system does. Then you name what it *should* do. The tools are different; the impulse is the same.

And once the vocabulary is explicit, it becomes infrastructure. It's the specification that drives your tests, the contract that survives refactoring, and the shared language your team uses to talk about what the system does.

## Standing on Shoulders

Aver is a synthesis of ideas I've admired — and borrowed from — for years.

**Dave Farley's acceptance test architecture.** In *Continuous Delivery* (2010) and his later talks, Farley describes a four-layer model that separates test intent from implementation through a "domain-specific language" layer and a "protocol driver" layer. Aver's three-layer model — domain, adapter, test — is a direct simplification, with TypeScript's type system replacing the ceremony of Java-era patterns.

**Cucumber and Gherkin.** Aslak Hellesøy, Matt Wynne, and the BDD community demonstrated that tests should speak domain language. The vocabulary insight is foundational. So is the workflow: Cucumber was always the outer acceptance loop, with RSpec or minitest driving the implementation underneath. Nobody argued that Cucumber replaced unit tests — they served different purposes at different granularities. Aver sits in that same outer-loop position, with the same complement to TDD. Where it diverges is in the mechanism: typed functions and phantom types instead of regex step matching and natural language parsing.

**Michael Feathers and legacy code.** *Working Effectively with Legacy Code* (2004) introduced characterization tests and the concept of *seams* — points where you can alter behavior without editing production code. Legacy systems often can't be unit-tested because internal seams don't exist yet. Aver's adapters create *external* seams — at the UI, at the API — that don't require internal refactoring to get that first test in place. As you refactor and create better internal structure, you add adapters at the new seams that emerge.

Aver also draws on Antony Marcano and Jan Molak's [Screenplay pattern](https://serenity-js.org/) (separating *what* from *how* at the test level, without class hierarchies) and Llewellyn Falco's [ApprovalTests](https://approvaltests.com/) (baseline comparison with explicit approval workflows).

## When Aver Is Overkill

Not every project needs a domain vocabulary. A small CRUD app with one developer and one test suite doesn't benefit from the adapter layer — the overhead of defining a domain outweighs the cost of a few direct Playwright tests. Prototypes where the domain isn't stable yet are better served by throwaway tests than by infrastructure you'll redesign next week.

Aver earns its keep when the test suite is large enough to feel the pain of duplication, when multiple protocols matter, or when the system is complex enough that a shared behavioral vocabulary helps the team reason about what it does. If you're leading a team through a difficult system — legacy or greenfield — and you've found yourself rebuilding test infrastructure for the third time, that's the signal.

## Try It

```bash
npm install --save-dev @averspec/core vitest
npx aver init
```

The `init` command is interactive — it will prompt you for a domain name and protocol. It creates three files:

```
domains/task-board.ts        # Your domain vocabulary
adapters/task-board.unit.ts  # The unit adapter
tests/task-board.spec.ts     # Your first test
```

The domain defines what your system does. The adapter maps those operations to a unit protocol. The test composes them into scenarios. Run it:

```bash
npx aver run
```

When you're ready for a second level — say, an HTTP adapter for your Express API — run `npx aver init` again and select the HTTP protocol. The tests don't change. Now every test runs at both levels. Add a Playwright adapter when the UI exists. The test suite grows in depth without growing in duplication.

For a complete example, explore the [task board](https://github.com/averspec/aver/tree/main/examples/task-board) — a React + Express app tested across unit, HTTP, and Playwright adapters with a single test suite.

- [Documentation](/)
- [Getting Started](/guides/getting-started)
- [Architecture](/architecture)
- [GitHub](https://github.com/averspec/aver)

---

*Aver is MIT-licensed and open source. Built by Nate Jackson.*
